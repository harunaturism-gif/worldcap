-- WorldCAP CAP domain v1.
--
-- CLOSED TECHNICAL BETA ONLY.
-- This migration creates internal CAP accounting and entitlement state.
-- It does not deploy a token contract, create CAP/WLD liquidity, promise yield,
-- peg CAP to WLD, or make simulated CAP balances on-chain/spendable.
--
-- Invariants:
-- - campaign CAP metrics are drafted first, then explicitly published;
-- - a published metric is economically immutable;
-- - published metrics may only transition to retired;
-- - tier entitlements are frozen once their metric is published;
-- - Title CAP units and commitment hashes are immutable after issuance;
-- - Human Claim requires a proof-of-human identity and one claim per epoch period;
-- - Human Claim is bounded by both epoch and campaign-metric budgets;
-- - only one Human Claim epoch can be active for a metric at a time;
-- - CAP Lock has no APY/yield and cannot create CAP.

create table public.cap_campaign_metrics (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  metric_version text not null
    check (metric_version ~ '^[a-z0-9][a-z0-9._-]{1,63}$'),
  status text not null default 'draft'
    check (status in ('draft','published','retired')),
  human_claim_units numeric(78,0) not null default 0
    check (human_claim_units >= 0 and scale(human_claim_units) = 0),
  human_claim_budget_units numeric(78,0) not null default 0
    check (human_claim_budget_units >= 0 and scale(human_claim_budget_units) = 0),
  human_claim_period_seconds integer not null default 86400
    check (human_claim_period_seconds >= 3600),
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, metric_version),
  check (
    human_claim_units = 0
    or human_claim_budget_units >= human_claim_units
  ),
  check (
    (status = 'draft' and published_at is null and retired_at is null)
    or (status = 'published' and published_at is not null and retired_at is null)
    or (status = 'retired' and published_at is not null and retired_at is not null)
  )
);

create unique index cap_one_published_metric_per_campaign_idx
  on public.cap_campaign_metrics(campaign_id)
  where status = 'published';

create table public.cap_tier_entitlements (
  metric_id uuid not null
    references public.cap_campaign_metrics(id) on delete restrict,
  tier_id uuid not null
    references public.title_tiers(id) on delete restrict,
  entitlement_units numeric(78,0) not null
    check (entitlement_units > 0 and scale(entitlement_units) = 0),
  created_at timestamptz not null default now(),
  primary key (metric_id, tier_id)
);

create table public.title_cap_entitlements (
  title_id uuid primary key
    references public.titles(id) on delete restrict,
  metric_id uuid not null
    references public.cap_campaign_metrics(id) on delete restrict,
  campaign_id uuid not null
    references public.campaigns(id) on delete restrict,
  entitlement_units numeric(78,0) not null
    check (entitlement_units > 0 and scale(entitlement_units) = 0),
  commitment_hash text not null unique
    check (commitment_hash ~ '^sha256:[0-9a-f]{64}$'),
  redemption_state text not null default 'locked'
    check (redemption_state in ('locked','available','claimed','expired')),
  created_at timestamptz not null default now(),
  available_at timestamptz,
  claimed_at timestamptz,
  check (
    (redemption_state = 'locked' and available_at is null and claimed_at is null)
    or (redemption_state = 'available' and available_at is not null and claimed_at is null)
    or (redemption_state = 'claimed' and available_at is not null and claimed_at is not null)
    or (redemption_state = 'expired' and available_at is not null and claimed_at is null)
  )
);

create table public.cap_accounts (
  user_id text primary key
    references public.users(id) on delete restrict,
  accounting_mode text not null default 'simulated'
    check (accounting_mode = 'simulated'),
  available_units numeric(78,0) not null default 0
    check (available_units >= 0 and scale(available_units) = 0),
  locked_units numeric(78,0) not null default 0
    check (locked_units >= 0 and scale(locked_units) = 0),
  total_claimed_units numeric(78,0) not null default 0
    check (total_claimed_units >= 0 and scale(total_claimed_units) = 0),
  updated_at timestamptz not null default now()
);

create table public.cap_human_claim_epochs (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null
    references public.cap_campaign_metrics(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  budget_units numeric(78,0) not null
    check (budget_units > 0 and scale(budget_units) = 0),
  claim_units numeric(78,0) not null
    check (claim_units > 0 and scale(claim_units) = 0),
  period_seconds integer not null default 86400
    check (period_seconds >= 3600),
  status text not null default 'configured'
    check (status in ('configured','active','closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (starts_at < ends_at),
  check (
    (status in ('configured','active') and closed_at is null)
    or (status = 'closed' and closed_at is not null)
  ),
  unique (metric_id, starts_at, ends_at)
);

create unique index cap_one_active_claim_epoch_per_metric_idx
  on public.cap_human_claim_epochs(metric_id)
  where status = 'active';

create table public.cap_human_claims (
  id uuid primary key default gen_random_uuid(),
  epoch_id uuid not null
    references public.cap_human_claim_epochs(id) on delete restrict,
  metric_id uuid not null
    references public.cap_campaign_metrics(id) on delete restrict,
  user_id text not null
    references public.users(id) on delete restrict,
  period_index numeric(78,0) not null
    check (period_index >= 0 and scale(period_index) = 0),
  amount_units numeric(78,0) not null
    check (amount_units > 0 and scale(amount_units) = 0),
  settlement_mode text not null default 'simulated'
    check (settlement_mode = 'simulated'),
  created_at timestamptz not null default now(),
  unique (epoch_id, user_id, period_index)
);

create index cap_human_claims_epoch_idx
  on public.cap_human_claims(epoch_id, created_at);

create index cap_human_claims_metric_idx
  on public.cap_human_claims(metric_id, created_at);

create table public.cap_locks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null
    references public.cap_accounts(user_id) on delete restrict,
  amount_units numeric(78,0) not null
    check (amount_units > 0 and scale(amount_units) = 0),
  status text not null default 'locked'
    check (status in ('locked','unlocked')),
  locked_at timestamptz not null default now(),
  unlock_at timestamptz not null,
  unlocked_at timestamptz,
  check (unlock_at > locked_at),
  check (
    (status = 'locked' and unlocked_at is null)
    or (status = 'unlocked' and unlocked_at is not null)
  )
);

create index cap_locks_user_status_idx
  on public.cap_locks(user_id, status, unlock_at);

create or replace function public.worldcap_guard_cap_metric()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft'
      or new.published_at is not null
      or new.retired_at is not null then
      raise exception 'cap_metric_must_start_draft';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'published_cap_metric_immutable';
    end if;
    return old;
  end if;

  if old.status = 'retired' then
    raise exception 'retired_cap_metric_immutable';
  end if;

  if old.status = 'published' then
    if new.status <> 'retired'
      or new.id is distinct from old.id
      or new.campaign_id is distinct from old.campaign_id
      or new.metric_version is distinct from old.metric_version
      or new.human_claim_units is distinct from old.human_claim_units
      or new.human_claim_budget_units is distinct from old.human_claim_budget_units
      or new.human_claim_period_seconds is distinct from old.human_claim_period_seconds
      or new.published_at is distinct from old.published_at
      or new.created_at is distinct from old.created_at then
      raise exception 'published_cap_metric_immutable';
    end if;

    if exists (
      select 1
      from public.cap_human_claim_epochs e
      where e.metric_id = old.id
        and e.status = 'active'
    ) then
      raise exception 'cap_metric_active_claim_epoch';
    end if;

    new.retired_at := coalesce(new.retired_at, now());
    return new;
  end if;

  -- From here OLD is draft.
  if new.status = 'retired' then
    raise exception 'cap_metric_invalid_transition';
  end if;

  if new.status = 'draft' then
    new.published_at := null;
    new.retired_at := null;
    return new;
  end if;

  if new.status <> 'published' then
    raise exception 'cap_metric_invalid_transition';
  end if;

  if not exists (
    select 1
    from public.title_tiers t
    where t.campaign_id = new.campaign_id
      and t.status = 'active'
  ) then
    raise exception 'cap_metric_no_active_tiers';
  end if;

  if exists (
    select 1
    from public.title_tiers t
    where t.campaign_id = new.campaign_id
      and t.status = 'active'
      and not exists (
        select 1
        from public.cap_tier_entitlements e
        where e.metric_id = new.id
          and e.tier_id = t.id
      )
  ) then
    raise exception 'cap_metric_entitlements_incomplete';
  end if;

  new.published_at := coalesce(new.published_at, now());
  new.retired_at := null;
  return new;
end;
$$;

create trigger cap_campaign_metric_guard_trigger
before insert or update or delete
on public.cap_campaign_metrics
for each row
execute function public.worldcap_guard_cap_metric();

create or replace function public.worldcap_guard_cap_tier_entitlement()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old_status text;
  v_new_status text;
  v_metric_campaign uuid;
  v_tier_campaign uuid;
begin
  if tg_op in ('UPDATE','DELETE') then
    select status
    into strict v_old_status
    from public.cap_campaign_metrics
    where id = old.metric_id;

    if v_old_status <> 'draft' then
      raise exception 'published_cap_entitlement_immutable';
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    select status, campaign_id
    into strict v_new_status, v_metric_campaign
    from public.cap_campaign_metrics
    where id = new.metric_id;

    if v_new_status <> 'draft' then
      raise exception 'published_cap_entitlement_immutable';
    end if;

    select campaign_id
    into strict v_tier_campaign
    from public.title_tiers
    where id = new.tier_id;

    if v_tier_campaign <> v_metric_campaign then
      raise exception 'cap_tier_campaign_mismatch';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger cap_tier_entitlement_guard_trigger
before insert or update or delete
on public.cap_tier_entitlements
for each row
execute function public.worldcap_guard_cap_tier_entitlement();

create or replace function public.worldcap_assign_title_cap_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_metric public.cap_campaign_metrics%rowtype;
  v_tier public.cap_tier_entitlements%rowtype;
  v_tier_campaign uuid;
  v_hash text;
begin
  select *
  into v_metric
  from public.cap_campaign_metrics
  where campaign_id = new.campaign_id
    and status = 'published';

  if not found then
    return new;
  end if;

  select campaign_id
  into strict v_tier_campaign
  from public.title_tiers
  where id = new.tier_id;

  if v_tier_campaign <> new.campaign_id then
    raise exception 'title_cap_tier_campaign_mismatch';
  end if;

  select *
  into v_tier
  from public.cap_tier_entitlements
  where metric_id = v_metric.id
    and tier_id = new.tier_id;

  if not found then
    raise exception 'cap_tier_entitlement_missing';
  end if;

  v_hash :=
    'sha256:' ||
    encode(
      digest(
        convert_to(
          'cap-entitlement-v1|' ||
          new.campaign_id::text || '|' ||
          new.id::text || '|' ||
          v_metric.metric_version || '|' ||
          v_tier.entitlement_units::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  insert into public.title_cap_entitlements (
    title_id,
    metric_id,
    campaign_id,
    entitlement_units,
    commitment_hash
  )
  values (
    new.id,
    v_metric.id,
    new.campaign_id,
    v_tier.entitlement_units,
    v_hash
  );

  return new;
end;
$$;

create trigger title_cap_entitlement_on_issue_trigger
after insert
on public.titles
for each row
execute function public.worldcap_assign_title_cap_entitlement();

create or replace function public.worldcap_guard_title_cap_entitlement()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'title_cap_entitlement_immutable';
  end if;

  if new.title_id is distinct from old.title_id
    or new.metric_id is distinct from old.metric_id
    or new.campaign_id is distinct from old.campaign_id
    or new.entitlement_units is distinct from old.entitlement_units
    or new.commitment_hash is distinct from old.commitment_hash
    or new.created_at is distinct from old.created_at then
    raise exception 'title_cap_entitlement_immutable';
  end if;

  if new.available_at is distinct from old.available_at
    and old.available_at is not null then
    raise exception 'title_cap_available_at_immutable';
  end if;

  if new.claimed_at is distinct from old.claimed_at
    and old.claimed_at is not null then
    raise exception 'title_cap_claimed_at_immutable';
  end if;

  if old.redemption_state = 'locked' then
    if new.redemption_state not in ('locked','available') then
      raise exception 'title_cap_redemption_transition_invalid';
    end if;
    if new.redemption_state = 'available' and new.available_at is null then
      new.available_at := now();
    end if;
  elsif old.redemption_state = 'available' then
    if new.redemption_state not in ('available','claimed','expired') then
      raise exception 'title_cap_redemption_transition_invalid';
    end if;
    if new.redemption_state = 'claimed' and new.claimed_at is null then
      new.claimed_at := now();
    end if;
  elsif new.redemption_state <> old.redemption_state then
    raise exception 'title_cap_redemption_terminal';
  end if;

  return new;
end;
$$;

create trigger title_cap_entitlement_guard_trigger
before update or delete
on public.title_cap_entitlements
for each row
execute function public.worldcap_guard_title_cap_entitlement();

create or replace function public.worldcap_guard_claim_epoch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_metric public.cap_campaign_metrics%rowtype;
  v_other_budget numeric(78,0);
begin
  if tg_op = 'DELETE' then
    if old.status <> 'configured' then
      raise exception 'cap_claim_epoch_immutable';
    end if;
    return old;
  end if;

  select *
  into strict v_metric
  from public.cap_campaign_metrics
  where id = new.metric_id
  for update;

  if new.claim_units <> v_metric.human_claim_units
    or new.period_seconds <> v_metric.human_claim_period_seconds
    or new.budget_units > v_metric.human_claim_budget_units
    or v_metric.human_claim_units <= 0 then
    raise exception 'cap_claim_epoch_metric_mismatch';
  end if;

  if exists (
    select 1
    from public.cap_human_claim_epochs e
    where e.metric_id = new.metric_id
      and e.id <> new.id
      and e.starts_at < new.ends_at
      and e.ends_at > new.starts_at
  ) then
    raise exception 'cap_claim_epoch_overlap';
  end if;

  select coalesce(sum(e.budget_units), 0)
  into v_other_budget
  from public.cap_human_claim_epochs e
  where e.metric_id = new.metric_id
    and e.id <> new.id;

  if v_other_budget + new.budget_units > v_metric.human_claim_budget_units then
    raise exception 'cap_claim_metric_budget_overallocated';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'configured' or new.closed_at is not null then
      raise exception 'cap_claim_epoch_must_start_configured';
    end if;
    return new;
  end if;

  if old.status = 'closed' then
    raise exception 'cap_claim_epoch_immutable';
  end if;

  if old.status = 'active' then
    if new.metric_id is distinct from old.metric_id
      or new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.budget_units is distinct from old.budget_units
      or new.claim_units is distinct from old.claim_units
      or new.period_seconds is distinct from old.period_seconds
      or new.created_at is distinct from old.created_at
      or new.status not in ('active','closed') then
      raise exception 'cap_claim_epoch_immutable';
    end if;

    if new.status = 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
    else
      new.closed_at := null;
    end if;

    return new;
  end if;

  -- OLD is configured.
  if new.status = 'closed' then
    raise exception 'cap_claim_epoch_invalid_transition';
  end if;

  if new.status = 'active' then
    if v_metric.status <> 'published' then
      raise exception 'cap_claim_metric_not_published';
    end if;
    new.closed_at := null;
  else
    new.closed_at := null;
  end if;

  return new;
end;
$$;

create trigger cap_human_claim_epoch_guard_trigger
before insert or update or delete
on public.cap_human_claim_epochs
for each row
execute function public.worldcap_guard_claim_epoch();

create or replace function public.worldcap_validate_human_claim_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_epoch public.cap_human_claim_epochs%rowtype;
  v_metric public.cap_campaign_metrics%rowtype;
  v_period numeric(78,0);
  v_epoch_used numeric(78,0);
  v_metric_used numeric(78,0);
begin
  if new.user_id !~ '^user_[0-9a-f]{64}$' then
    raise exception 'cap_user_invalid';
  end if;

  if not exists (
    select 1
    from public.world_identities wi
    where wi.user_id = new.user_id
      and wi.verification_level = 'proof_of_human'
  ) then
    raise exception 'cap_human_verification_required';
  end if;

  select *
  into strict v_epoch
  from public.cap_human_claim_epochs
  where id = new.epoch_id
  for update;

  select *
  into strict v_metric
  from public.cap_campaign_metrics
  where id = v_epoch.metric_id
  for update;

  if v_metric.status <> 'published'
    or v_epoch.status <> 'active'
    or now() < v_epoch.starts_at
    or now() >= v_epoch.ends_at then
    raise exception 'cap_claim_epoch_inactive';
  end if;

  v_period :=
    floor(
      extract(epoch from (now() - v_epoch.starts_at))
      / v_epoch.period_seconds
    );

  if new.metric_id <> v_epoch.metric_id
    or new.period_index <> v_period
    or new.amount_units <> v_epoch.claim_units
    or new.settlement_mode <> 'simulated' then
    raise exception 'cap_human_claim_payload_mismatch';
  end if;

  select coalesce(sum(c.amount_units), 0)
  into v_epoch_used
  from public.cap_human_claims c
  where c.epoch_id = v_epoch.id;

  if v_epoch_used + new.amount_units > v_epoch.budget_units then
    raise exception 'cap_human_claim_epoch_budget_exhausted';
  end if;

  select coalesce(sum(c.amount_units), 0)
  into v_metric_used
  from public.cap_human_claims c
  where c.metric_id = v_metric.id;

  if v_metric_used + new.amount_units > v_metric.human_claim_budget_units then
    raise exception 'cap_human_claim_metric_budget_exhausted';
  end if;

  return new;
end;
$$;

create trigger cap_human_claim_insert_guard_trigger
before insert
on public.cap_human_claims
for each row
execute function public.worldcap_validate_human_claim_insert();

create or replace function public.worldcap_apply_human_claim_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.cap_accounts (
    user_id,
    available_units,
    total_claimed_units
  )
  values (
    new.user_id,
    new.amount_units,
    new.amount_units
  )
  on conflict (user_id) do update
  set available_units =
        public.cap_accounts.available_units + excluded.available_units,
      total_claimed_units =
        public.cap_accounts.total_claimed_units + excluded.total_claimed_units,
      updated_at = now();

  return new;
end;
$$;

create trigger cap_human_claim_balance_trigger
after insert
on public.cap_human_claims
for each row
execute function public.worldcap_apply_human_claim_balance();

create or replace function public.worldcap_claim_human_cap(
  p_user_id text,
  p_epoch_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_epoch public.cap_human_claim_epochs%rowtype;
  v_period numeric(78,0);
  v_existing public.cap_human_claims%rowtype;
  v_claim public.cap_human_claims%rowtype;
  v_account public.cap_accounts%rowtype;
begin
  if p_user_id !~ '^user_[0-9a-f]{64}$' then
    raise exception 'cap_user_invalid';
  end if;

  select *
  into v_epoch
  from public.cap_human_claim_epochs
  where id = p_epoch_id
  for update;

  if not found then
    raise exception 'cap_claim_epoch_not_found';
  end if;

  if v_epoch.status <> 'active'
    or now() < v_epoch.starts_at
    or now() >= v_epoch.ends_at then
    raise exception 'cap_claim_epoch_inactive';
  end if;

  v_period :=
    floor(
      extract(epoch from (now() - v_epoch.starts_at))
      / v_epoch.period_seconds
    );

  select *
  into v_existing
  from public.cap_human_claims
  where epoch_id = p_epoch_id
    and user_id = p_user_id
    and period_index = v_period;

  if found then
    select *
    into v_account
    from public.cap_accounts
    where user_id = p_user_id;

    return jsonb_build_object(
      'replayed', true,
      'claim_id', v_existing.id,
      'period_index', v_existing.period_index::text,
      'amount_units', v_existing.amount_units::text,
      'available_units', coalesce(v_account.available_units, 0)::text,
      'settlement_mode', 'simulated'
    );
  end if;

  insert into public.cap_human_claims (
    epoch_id,
    metric_id,
    user_id,
    period_index,
    amount_units,
    settlement_mode
  )
  values (
    v_epoch.id,
    v_epoch.metric_id,
    p_user_id,
    v_period,
    v_epoch.claim_units,
    'simulated'
  )
  returning * into v_claim;

  select *
  into strict v_account
  from public.cap_accounts
  where user_id = p_user_id;

  return jsonb_build_object(
    'replayed', false,
    'claim_id', v_claim.id,
    'period_index', v_claim.period_index::text,
    'amount_units', v_claim.amount_units::text,
    'available_units', v_account.available_units::text,
    'settlement_mode', 'simulated'
  );
end;
$$;

create or replace function public.worldcap_lock_cap(
  p_user_id text,
  p_amount_units numeric,
  p_unlock_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.cap_accounts%rowtype;
  v_lock public.cap_locks%rowtype;
begin
  if p_user_id !~ '^user_[0-9a-f]{64}$'
    or p_amount_units <= 0
    or scale(p_amount_units) <> 0 then
    raise exception 'cap_lock_input_invalid';
  end if;

  if p_unlock_at <= now()
    or p_unlock_at > now() + interval '365 days' then
    raise exception 'cap_lock_time_invalid';
  end if;

  select *
  into v_account
  from public.cap_accounts
  where user_id = p_user_id
  for update;

  if not found or v_account.available_units < p_amount_units then
    raise exception 'cap_lock_insufficient_balance';
  end if;

  update public.cap_accounts
  set available_units = available_units - p_amount_units,
      locked_units = locked_units + p_amount_units,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.cap_locks (
    user_id,
    amount_units,
    unlock_at
  )
  values (
    p_user_id,
    p_amount_units,
    p_unlock_at
  )
  returning * into v_lock;

  return jsonb_build_object(
    'lock_id', v_lock.id,
    'amount_units', v_lock.amount_units::text,
    'unlock_at', v_lock.unlock_at,
    'settlement_mode', 'simulated'
  );
end;
$$;

create or replace function public.worldcap_unlock_cap(
  p_user_id text,
  p_lock_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lock public.cap_locks%rowtype;
  v_account public.cap_accounts%rowtype;
begin
  select *
  into v_lock
  from public.cap_locks
  where id = p_lock_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'cap_lock_not_found';
  end if;

  if v_lock.status = 'unlocked' then
    return jsonb_build_object(
      'replayed', true,
      'lock_id', v_lock.id,
      'amount_units', v_lock.amount_units::text,
      'settlement_mode', 'simulated'
    );
  end if;

  if now() < v_lock.unlock_at then
    raise exception 'cap_lock_not_mature';
  end if;

  select *
  into v_account
  from public.cap_accounts
  where user_id = p_user_id
  for update;

  if not found or v_account.locked_units < v_lock.amount_units then
    raise exception 'cap_lock_account_inconsistent';
  end if;

  update public.cap_accounts
  set available_units = available_units + v_lock.amount_units,
      locked_units = locked_units - v_lock.amount_units,
      updated_at = now()
  where user_id = p_user_id;

  update public.cap_locks
  set status = 'unlocked',
      unlocked_at = now()
  where id = v_lock.id;

  return jsonb_build_object(
    'replayed', false,
    'lock_id', v_lock.id,
    'amount_units', v_lock.amount_units::text,
    'settlement_mode', 'simulated'
  );
end;
$$;

create or replace function public.worldcap_guard_cap_account_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'cap_account_deletion_forbidden';
end;
$$;

create trigger cap_account_delete_guard_trigger
before delete
on public.cap_accounts
for each row
execute function public.worldcap_guard_cap_account_delete();

alter table public.cap_campaign_metrics enable row level security;
alter table public.cap_tier_entitlements enable row level security;
alter table public.title_cap_entitlements enable row level security;
alter table public.cap_accounts enable row level security;
alter table public.cap_human_claim_epochs enable row level security;
alter table public.cap_human_claims enable row level security;
alter table public.cap_locks enable row level security;

revoke all on table
  public.cap_campaign_metrics,
  public.cap_tier_entitlements,
  public.title_cap_entitlements,
  public.cap_accounts,
  public.cap_human_claim_epochs,
  public.cap_human_claims,
  public.cap_locks
from anon, authenticated;

revoke all on function public.worldcap_claim_human_cap(text,uuid)
from public, anon, authenticated;
revoke all on function public.worldcap_lock_cap(text,numeric,timestamptz)
from public, anon, authenticated;
revoke all on function public.worldcap_unlock_cap(text,uuid)
from public, anon, authenticated;

grant execute on function public.worldcap_claim_human_cap(text,uuid)
to service_role;
grant execute on function public.worldcap_lock_cap(text,numeric,timestamptz)
to service_role;
grant execute on function public.worldcap_unlock_cap(text,uuid)
to service_role;
