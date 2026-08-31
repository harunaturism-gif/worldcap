-- Phase 3A trust foundation. This migration models deterministic draws and
-- segregated liabilities; it does not enable custody or real prize settlement.

alter table public.draws drop constraint if exists draws_status_check;
update public.draws set status = case status when 'scheduled' then 'open' when 'complete' then 'settled' else status end;
alter table public.draws add constraint draws_status_check
  check (status in ('draft','open','closed','randomness_pending','resolved','settled'));
alter table public.draws add column if not exists eligibility_scope text not null default 'GLOBAL'
  check (eligibility_scope in ('GLOBAL','ACCESSIBLE','PURPLE','GOLD','SPECIAL'));
alter table public.draws add column if not exists allowed_tier_codes jsonb not null default '["accessible","purple","gold"]'::jsonb;
alter table public.draws add column if not exists opens_at timestamptz;
alter table public.draws add column if not exists closes_at timestamptz;
update public.draws d set
  opens_at = coalesce(d.opens_at, (select c.sales_open_at from public.campaigns c where c.id = d.campaign_id), d.scheduled_at - interval '1 year'),
  closes_at = coalesce(d.closes_at, d.scheduled_at)
where d.opens_at is null or d.closes_at is null;
alter table public.draws alter column opens_at set not null;
alter table public.draws alter column closes_at set not null;
alter table public.draws add column if not exists eligible_title_count numeric(78,0) not null default 0
  check (eligible_title_count >= 0 and scale(eligible_title_count) = 0);
alter table public.draws add column if not exists eligibility_commitment text
  check (eligibility_commitment is null or eligibility_commitment ~ '^sha256:[0-9a-f]{64}$');
alter table public.draws add column if not exists manifest_version text not null default 'worldcap-manifest-v1';
alter table public.draws add column if not exists algorithm_version text not null default 'worldcap-draw-v1';
alter table public.draws add column if not exists randomness_provider text;
alter table public.draws add column if not exists randomness_request_id text;
alter table public.draws add column if not exists randomness_seed text
  check (randomness_seed is null or randomness_seed ~ '^0x[0-9a-f]{64}$');
alter table public.draws add column if not exists winning_index numeric(78,0)
  check (winning_index is null or (winning_index >= 0 and scale(winning_index) = 0));
alter table public.draws add column if not exists winning_title_id uuid references public.titles(id);
alter table public.draws add column if not exists finalized_at timestamptz;
alter table public.draws add column if not exists payout_status text not null default 'NOT_READY'
  check (payout_status in ('NOT_READY','PENDING','SETTLED'));

alter table public.draw_entries add column if not exists manifest_index numeric(78,0)
  check (manifest_index is null or (manifest_index >= 0 and scale(manifest_index) = 0));
alter table public.draw_entries add column if not exists serial_snapshot text;
alter table public.draw_entries add column if not exists tier_code_snapshot text;
create unique index if not exists draw_entries_manifest_index_idx
  on public.draw_entries(draw_id, manifest_index) where manifest_index is not null;

create table public.draw_manifests (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null unique references public.draws(id),
  manifest_version text not null check (manifest_version = 'worldcap-manifest-v1'),
  eligible_count numeric(78,0) not null check (eligible_count > 0 and scale(eligible_count) = 0),
  eligibility_commitment text not null check (eligibility_commitment ~ '^sha256:[0-9a-f]{64}$'),
  public_manifest jsonb not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.draw_randomness_requests (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null unique references public.draws(id),
  provider text not null,
  provider_request_id text not null unique,
  seed text check (seed is null or seed ~ '^0x[0-9a-f]{64}$'),
  status text not null check (status in ('pending','fulfilled','consumed','failed')),
  requested_at timestamptz not null,
  fulfilled_at timestamptz,
  consumed_at timestamptz
);

alter table public.draw_results add column if not exists winning_index numeric(78,0)
  check (winning_index is null or (winning_index >= 0 and scale(winning_index) = 0));
alter table public.draw_results add column if not exists algorithm_version text not null default 'worldcap-draw-v1';
alter table public.draw_results add column if not exists manifest_commitment text
  check (manifest_commitment is null or manifest_commitment ~ '^sha256:[0-9a-f]{64}$');
alter table public.draw_results add column if not exists randomness_seed text
  check (randomness_seed is null or randomness_seed ~ '^0x[0-9a-f]{64}$');

create or replace function public.worldcap_guard_original_buyer_immutability()
returns trigger language plpgsql as $$
begin
  if new.original_buyer_id <> old.original_buyer_id then raise exception 'original_buyer_immutable'; end if;
  return new;
end;
$$;
drop trigger if exists title_original_buyer_immutable_guard on public.titles;
create trigger title_original_buyer_immutable_guard before update of original_buyer_id on public.titles
  for each row execute function public.worldcap_guard_original_buyer_immutability();

create or replace function public.worldcap_guard_draw_snapshot_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_draw_id uuid; v_status text;
begin
  v_draw_id := case when tg_op = 'DELETE' then old.draw_id else new.draw_id end;
  select status into strict v_status from public.draws where id = v_draw_id;
  if v_status <> 'open' then raise exception 'draw_eligibility_frozen'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists draw_entries_freeze_guard on public.draw_entries;
create trigger draw_entries_freeze_guard before insert or update or delete on public.draw_entries
  for each row execute function public.worldcap_guard_draw_snapshot_mutation();

create or replace function public.worldcap_guard_manifest_immutability()
returns trigger language plpgsql as $$
begin
  raise exception 'draw_manifest_immutable';
end;
$$;
drop trigger if exists draw_manifest_immutable_guard on public.draw_manifests;
create trigger draw_manifest_immutable_guard before update or delete on public.draw_manifests
  for each row execute function public.worldcap_guard_manifest_immutability();

create table public.economic_vaults (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id),
  vault_type text not null check (vault_type in ('MONTHLY_PRIZE','ANNUAL_JACKPOT','PLATFORM','GROWTH','SCRATCH_RESERVE')),
  asset text not null default 'WLD' check (asset = 'WLD'),
  funded_amount_units numeric(78,0) not null default 0 check (funded_amount_units >= 0 and scale(funded_amount_units) = 0),
  committed_liability_units numeric(78,0) not null default 0 check (committed_liability_units >= 0 and scale(committed_liability_units) = 0),
  custody_mode text not null default 'modeled' check (custody_mode = 'modeled'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (campaign_id, vault_type),
  check (
    (vault_type in ('MONTHLY_PRIZE','ANNUAL_JACKPOT','SCRATCH_RESERVE') and committed_liability_units <= funded_amount_units)
    or (vault_type in ('PLATFORM','GROWTH') and committed_liability_units = 0)
  )
);

create table public.scratch_batches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  tier_id uuid not null references public.title_tiers(id),
  title_capacity numeric(78,0) not null check (title_capacity > 0 and scale(title_capacity) = 0),
  funded_prize_units numeric(78,0) not null check (funded_prize_units >= 0 and scale(funded_prize_units) = 0),
  maximum_prize_liability_units numeric(78,0) not null check (maximum_prize_liability_units >= 0 and scale(maximum_prize_liability_units) = 0),
  issued_count numeric(78,0) not null default 0 check (issued_count >= 0 and scale(issued_count) = 0),
  status text not null check (status in ('DRAFT','FUNDED','ISSUING','CLOSED')),
  created_at timestamptz not null default now(),
  check (issued_count <= title_capacity),
  check (maximum_prize_liability_units <= funded_prize_units)
);

alter table public.title_renewals add column if not exists funding_source text not null default 'UNDECIDED'
  check (funding_source in ('UNDECIDED','GROWTH','RENEWAL_RESERVE'));
alter table public.title_renewals add column if not exists funded boolean not null default false;
alter table public.title_renewals add column if not exists spendable boolean not null default false check (spendable = false);
alter table public.title_renewals add constraint title_renewal_funding_explicit
  check (not funded or funding_source <> 'UNDECIDED');

alter table public.draw_manifests enable row level security;
alter table public.draw_randomness_requests enable row level security;
alter table public.economic_vaults enable row level security;
alter table public.scratch_batches enable row level security;
revoke all on table public.draw_manifests, public.draw_randomness_requests, public.economic_vaults, public.scratch_batches from anon, authenticated;
grant select, insert on table public.draw_manifests, public.draw_randomness_requests, public.economic_vaults, public.scratch_batches to service_role;
grant update on table public.draw_randomness_requests, public.economic_vaults, public.scratch_batches to service_role;

comment on table public.draw_manifests is 'Immutable privacy-safe public eligibility snapshots; generated by the server trust-domain library.';
comment on table public.economic_vaults is 'Modeled balances only in Phase 3A; not evidence of on-chain custody.';
comment on table public.scratch_batches is 'Finite prefunding model only; odds, inventory commitment, and payout remain deferred.';
comment on column public.title_renewals.funding_source is 'Founder decision required: Growth or a dedicated funded Renewal Reserve.';
