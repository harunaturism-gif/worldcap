-- Reconcile Phase 2 with WORLDCAP_PRODUCT_SPEC_v0.1.md without changing
-- verified payment, allocation, or scratch invariants.

create table public.title_tiers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  name text not null check (char_length(name) between 1 and 40),
  price_units numeric(78,0) not null check (price_units > 0 and scale(price_units) = 0),
  skin text not null check (skin ~ '^[a-z][a-z0-9_]{1,31}$'),
  status text not null default 'active' check (status in ('active','inactive')),
  sort_order integer not null check (sort_order > 0),
  scratch_config jsonb not null default '{}'::jsonb,
  draw_access jsonb not null default '["global_monthly","annual_jackpot"]'::jsonb,
  unique (campaign_id, code),
  unique (campaign_id, sort_order)
);

insert into public.title_tiers (id, campaign_id, code, name, price_units, skin, sort_order, scratch_config)
values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'accessible', 'Accessible', 500000000000000000, 'accessible', 1, '{"simulated":true,"tiers":[{"upper_bps":300,"prize_units":"20000000000000000000"},{"upper_bps":1200,"prize_units":"5000000000000000000"},{"upper_bps":3200,"prize_units":"1000000000000000000"},{"upper_bps":10000,"prize_units":"0"}]}'),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'purple', 'Purple', 5000000000000000000, 'purple', 2, '{"simulated":true,"tiers":[{"upper_bps":300,"prize_units":"20000000000000000000"},{"upper_bps":1200,"prize_units":"5000000000000000000"},{"upper_bps":3200,"prize_units":"1000000000000000000"},{"upper_bps":10000,"prize_units":"0"}]}'),
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'gold', 'Gold', 20000000000000000000, 'gold', 3, '{"simulated":true,"tiers":[{"upper_bps":300,"prize_units":"20000000000000000000"},{"upper_bps":1200,"prize_units":"5000000000000000000"},{"upper_bps":3200,"prize_units":"1000000000000000000"},{"upper_bps":10000,"prize_units":"0"}]}')
on conflict (id) do update set
  name = excluded.name, price_units = excluded.price_units, skin = excluded.skin,
  status = 'active', sort_order = excluded.sort_order, scratch_config = excluded.scratch_config;

alter table public.purchase_intents add column tier_id uuid references public.title_tiers(id);
update public.purchase_intents set tier_id = '33333333-3333-4333-8333-333333333333' where tier_id is null;
alter table public.purchase_intents alter column tier_id set not null;

alter table public.purchases add column tier_id uuid references public.title_tiers(id);
update public.purchases p set tier_id = coalesce(
  (select pi.tier_id from public.purchase_intents pi where pi.reference = p.payment_reference),
  '33333333-3333-4333-8333-333333333333'
) where p.tier_id is null;
alter table public.purchases alter column tier_id set not null;

alter table public.titles add column tier_id uuid references public.title_tiers(id);
alter table public.titles add column original_buyer_id text references public.users(id);
alter table public.titles add column current_owner_id text references public.users(id);
alter table public.titles add column lifecycle_state text not null default 'active'
  check (lifecycle_state in ('active','draw_period_complete','archived','eligible_for_renewal'));
alter table public.titles add column renewal_state text not null default 'not_eligible'
  check (renewal_state in ('not_eligible','eligible','redeemed','expired'));
update public.titles t set
  tier_id = coalesce((select p.tier_id from public.purchases p where p.id = t.purchase_id), '33333333-3333-4333-8333-333333333333'),
  original_buyer_id = coalesce(t.original_buyer_id, t.owner_id),
  current_owner_id = coalesce(t.current_owner_id, t.owner_id)
where t.tier_id is null or t.original_buyer_id is null or t.current_owner_id is null;
alter table public.titles alter column tier_id set not null;
alter table public.titles alter column original_buyer_id set not null;
alter table public.titles alter column current_owner_id set not null;

create table public.title_ownership_events (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles(id),
  event_type text not null check (event_type in ('issued','gifted','transferred','market_sale','renewed')),
  from_user_id text references public.users(id),
  to_user_id text not null references public.users(id),
  purchase_id uuid references public.purchases(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index title_one_issued_event_idx on public.title_ownership_events(title_id) where event_type = 'issued';
create index title_ownership_events_title_idx on public.title_ownership_events(title_id, created_at);

insert into public.title_ownership_events (title_id, event_type, from_user_id, to_user_id, purchase_id, created_at)
select t.id, 'issued', null, t.original_buyer_id, t.purchase_id, t.issued_at
from public.titles t
on conflict (title_id) where event_type = 'issued' do nothing;

create table public.title_renewal_rules (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  tier_id uuid not null references public.title_tiers(id),
  target_month_offset_years integer not null default 1 check (target_month_offset_years = 1),
  credit_units numeric(78,0) not null default 0 check (credit_units >= 0 and scale(credit_units) = 0),
  settlement_mode text not null default 'simulated' check (settlement_mode in ('simulated','disabled')),
  status text not null default 'configured' check (status in ('configured','active','expired')),
  unique (campaign_id, tier_id)
);

insert into public.title_renewal_rules (campaign_id, tier_id, credit_units, settlement_mode)
select '11111111-1111-4111-8111-111111111111', id, 0, 'simulated'
from public.title_tiers where campaign_id = '11111111-1111-4111-8111-111111111111'
on conflict (campaign_id, tier_id) do nothing;

create table public.title_renewals (
  id uuid primary key default gen_random_uuid(),
  source_title_id uuid not null references public.titles(id),
  target_campaign_id uuid references public.campaigns(id),
  user_id text not null references public.users(id),
  credit_units numeric(78,0) not null check (credit_units >= 0 and scale(credit_units) = 0),
  status text not null check (status in ('eligible','redeemed','expired')),
  settlement_mode text not null default 'simulated' check (settlement_mode = 'simulated'),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  unique (source_title_id)
);

alter table public.title_tiers enable row level security;
alter table public.title_ownership_events enable row level security;
alter table public.title_renewal_rules enable row level security;
alter table public.title_renewals enable row level security;

create or replace function public.worldprize_complete_purchase(
  p_user_id text,
  p_reference uuid,
  p_transaction_id text,
  p_transaction_hash text,
  p_payer_address text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent public.purchase_intents%rowtype;
  v_purchase public.purchases%rowtype;
  v_campaign public.campaigns%rowtype;
  v_tier public.title_tiers%rowtype;
  v_wallet_id uuid;
  v_title public.titles%rowtype;
  v_titles jsonb := '[]'::jsonb;
  v_monthly numeric(78,0);
  v_annual numeric(78,0);
  v_platform numeric(78,0);
  v_commercial numeric(78,0);
  v_index integer;
  v_sequence bigint;
  v_profile_id uuid;
  v_replayed boolean := false;
begin
  if p_user_id !~ '^user_[0-9a-f]{64}$' or p_transaction_id !~ '^[A-Za-z0-9_-]{8,200}$'
    or p_transaction_hash !~ '^0x[0-9a-fA-F]{64}$' or p_payer_address !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'invalid_purchase_input';
  end if;

  select * into v_intent from public.purchase_intents
  where reference = p_reference and user_id = p_user_id for update;
  if not found then raise exception 'purchase_intent_not_found'; end if;

  if v_intent.status = 'completed' then
    if v_intent.transaction_id <> p_transaction_id or v_intent.completed_purchase_id is null then
      raise exception 'purchase_reference_consumed';
    end if;
    v_replayed := true;
    select * into strict v_purchase from public.purchases where id = v_intent.completed_purchase_id;
  else
    if v_intent.status <> 'pending' or v_intent.expires_at <= now() then
      update public.purchase_intents set status = 'expired' where reference = p_reference;
      raise exception 'purchase_intent_expired';
    end if;
    if exists (select 1 from public.purchases where transaction_id = p_transaction_id) then
      raise exception 'payment_transaction_consumed';
    end if;

    select * into strict v_campaign from public.campaigns where id = v_intent.campaign_id and status = 'active' for update;
    select * into strict v_tier from public.title_tiers
      where id = v_intent.tier_id and campaign_id = v_intent.campaign_id and status = 'active';
    if v_tier.price_units <> v_intent.unit_price_units then raise exception 'title_tier_price_changed'; end if;

    insert into public.purchases (
      user_id, campaign_id, tier_id, quantity, unit_price, total, status, payment_reference,
      transaction_id, transaction_hash, payer_address, unit_price_units, total_units
    ) values (
      p_user_id, v_intent.campaign_id, v_intent.tier_id, v_intent.quantity,
      v_intent.unit_price_units / 1000000000000000000::numeric,
      v_intent.total_units / 1000000000000000000::numeric,
      'settled', p_reference, p_transaction_id, lower(p_transaction_hash), lower(p_payer_address),
      v_intent.unit_price_units, v_intent.total_units
    ) returning * into v_purchase;

    insert into public.wallets (user_id, asset, available, connected_address, verified_spend_units)
    values (p_user_id, 'WLD', 0, lower(p_payer_address), v_intent.total_units)
    on conflict (user_id) do update set
      connected_address = excluded.connected_address,
      verified_spend_units = public.wallets.verified_spend_units + excluded.verified_spend_units,
      updated_at = now()
    returning id into v_wallet_id;

    v_sequence := v_campaign.next_title_sequence;
    for v_index in 0..(v_intent.quantity - 1) loop
      insert into public.titles (
        campaign_id, tier_id, serial, issue_price, issued_at, purchase_id, owner_id,
        original_buyer_id, current_owner_id, lifecycle_state, renewal_state
      ) values (
        v_intent.campaign_id, v_tier.id,
        upper(v_tier.code) || '-' || v_campaign.serial_prefix || '-' || lpad((v_sequence + v_index)::text, 6, '0'),
        v_intent.unit_price_units / 1000000000000000000::numeric,
        now(), v_purchase.id, p_user_id, p_user_id, p_user_id, 'active', 'not_eligible'
      ) returning * into v_title;

      insert into public.title_ownership (title_id, user_id, purchase_id, acquired_at, draw_eligible)
      values (v_title.id, p_user_id, v_purchase.id, now(), true);

      insert into public.title_ownership_events (title_id, event_type, from_user_id, to_user_id, purchase_id)
      values (v_title.id, 'issued', null, p_user_id, v_purchase.id);

      insert into public.draw_entries (draw_id, title_id, ownership_id)
      select d.id, v_title.id, o.id from public.draws d
      join public.title_ownership o on o.title_id = v_title.id
      where d.status = 'scheduled' and (d.campaign_id = v_intent.campaign_id or d.kind = 'annual')
      on conflict (draw_id, title_id) do nothing;

      v_titles := v_titles || jsonb_build_array(jsonb_build_object(
        'id', v_title.id, 'serial', v_title.serial, 'campaign_id', v_title.campaign_id,
        'tier_id', v_tier.id, 'tier_code', v_tier.code, 'tier_name', v_tier.name,
        'purchase_id', v_purchase.id, 'owner_id', p_user_id,
        'original_buyer_id', p_user_id, 'current_owner_id', p_user_id,
        'created_at', v_title.issued_at, 'scratch_status', v_title.scratch_status,
        'scratch_result_id', v_title.scratch_result_id, 'draw_eligible', true,
        'lifecycle_state', v_title.lifecycle_state, 'renewal_state', v_title.renewal_state,
        'future_redemption_state', v_title.future_redemption_state
      ));
    end loop;
    update public.campaigns set next_title_sequence = v_sequence + v_intent.quantity where id = v_campaign.id;

    v_monthly := trunc(v_intent.total_units * 60 / 100);
    v_annual := trunc(v_intent.total_units * 10 / 100);
    v_platform := trunc(v_intent.total_units * 20 / 100);
    v_commercial := v_intent.total_units - v_monthly - v_annual - v_platform;

    insert into public.treasury_allocations (purchase_id, bucket, percentage, amount, amount_units)
    values
      (v_purchase.id, 'monthly_prize_pool', 60, v_monthly / 1000000000000000000::numeric, v_monthly),
      (v_purchase.id, 'annual_jackpot', 10, v_annual / 1000000000000000000::numeric, v_annual),
      (v_purchase.id, 'platform_operations', 20, v_platform / 1000000000000000000::numeric, v_platform),
      (v_purchase.id, 'commercial_growth', 10, v_commercial / 1000000000000000000::numeric, v_commercial);

    insert into public.ledger_entries (
      wallet_id, user_id, kind, classification, direction, amount, amount_units,
      spendable, reference_id, description, created_at
    ) values (
      v_wallet_id, p_user_id, 'title_purchase', 'verified_purchase', 'debit',
      v_intent.total_units / 1000000000000000000::numeric, v_intent.total_units,
      true, v_purchase.id::text,
      v_intent.quantity || ' verified ' || v_tier.name || ' ' || v_campaign.month_label || ' title(s)', now()
    );

    select id into v_profile_id from public.profiles where user_id = p_user_id;
    if v_profile_id is not null then
      insert into public.posts (profile_id, kind, body, reference_id)
      values (v_profile_id, 'purchase_activity', 'A verified human added ' || v_intent.quantity || ' ' || v_tier.name || ' title(s) to the draw.', v_purchase.id::text);
    end if;

    update public.purchase_intents set
      status = 'completed', transaction_id = p_transaction_id, completed_purchase_id = v_purchase.id
    where reference = p_reference;
  end if;

  if v_replayed then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'serial', t.serial, 'campaign_id', t.campaign_id,
      'tier_id', tt.id, 'tier_code', tt.code, 'tier_name', tt.name,
      'purchase_id', t.purchase_id, 'owner_id', t.current_owner_id,
      'original_buyer_id', t.original_buyer_id, 'current_owner_id', t.current_owner_id,
      'created_at', t.issued_at, 'scratch_status', t.scratch_status,
      'scratch_result_id', t.scratch_result_id, 'draw_eligible', true,
      'lifecycle_state', t.lifecycle_state, 'renewal_state', t.renewal_state,
      'future_redemption_state', t.future_redemption_state
    ) order by t.issued_at), '[]'::jsonb) into v_titles
    from public.titles t join public.title_tiers tt on tt.id = t.tier_id
    where t.purchase_id = v_purchase.id;
  end if;

  return jsonb_build_object(
    'replayed', v_replayed,
    'purchase', jsonb_build_object(
      'id', v_purchase.id, 'reference', v_purchase.payment_reference, 'user_id', v_purchase.user_id,
      'campaign_id', v_purchase.campaign_id, 'tier_id', v_purchase.tier_id,
      'quantity', v_purchase.quantity, 'unit_price_units', v_purchase.unit_price_units::text,
      'total_units', v_purchase.total_units::text, 'transaction_id', v_purchase.transaction_id,
      'transaction_hash', v_purchase.transaction_hash, 'payer_address', v_purchase.payer_address,
      'created_at', v_purchase.created_at
    ),
    'titles', v_titles
  );
end;
$$;

create or replace function public.worldprize_get_snapshot(p_user_id text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select jsonb_build_object(
    'campaign', (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'month_label', c.month_label, 'status', c.status,
        'title_price_units', c.title_price_units::text, 'serial_prefix', c.serial_prefix,
        'monthly_draw_at', c.monthly_draw_at, 'annual_draw_at', c.annual_draw_at
      ) from public.campaigns c where c.id = '11111111-1111-4111-8111-111111111111'
    ),
    'title_tiers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', tt.id, 'campaign_id', tt.campaign_id, 'code', tt.code, 'name', tt.name,
      'price_units', tt.price_units::text, 'skin', tt.skin, 'status', tt.status,
      'sort_order', tt.sort_order, 'scratch_config', tt.scratch_config
    ) order by tt.sort_order) from public.title_tiers tt
      where tt.campaign_id = '11111111-1111-4111-8111-111111111111' and tt.status = 'active'), '[]'::jsonb),
    'titles_sold', (select count(*)::integer from public.titles),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'reference', p.payment_reference, 'user_id', p.user_id,
      'campaign_id', p.campaign_id, 'tier_id', p.tier_id, 'quantity', p.quantity,
      'unit_price_units', p.unit_price_units::text, 'total_units', p.total_units::text,
      'transaction_id', p.transaction_id, 'transaction_hash', p.transaction_hash,
      'payer_address', p.payer_address, 'created_at', p.created_at
    ) order by p.created_at desc) from public.purchases p
      where p.user_id = p_user_id and p.status = 'settled'), '[]'::jsonb),
    'titles', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'serial', t.serial, 'campaign_id', t.campaign_id,
      'tier_id', tt.id, 'tier_code', tt.code, 'tier_name', tt.name,
      'purchase_id', t.purchase_id, 'owner_id', t.current_owner_id,
      'original_buyer_id', t.original_buyer_id, 'current_owner_id', t.current_owner_id,
      'created_at', t.issued_at, 'scratch_status', t.scratch_status,
      'scratch_result_id', t.scratch_result_id, 'draw_eligible', true,
      'lifecycle_state', t.lifecycle_state, 'renewal_state', t.renewal_state,
      'future_redemption_state', t.future_redemption_state
    ) order by t.issued_at desc) from public.titles t
      join public.title_tiers tt on tt.id = t.tier_id where t.current_owner_id = p_user_id), '[]'::jsonb),
    'ownership_events', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'title_id', e.title_id, 'event_type', e.event_type,
      'from_user_id', e.from_user_id, 'to_user_id', e.to_user_id,
      'purchase_id', e.purchase_id, 'created_at', e.created_at
    ) order by e.created_at) from public.title_ownership_events e
      join public.titles t on t.id = e.title_id where t.current_owner_id = p_user_id), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'user_id', l.user_id, 'classification', l.classification,
      'direction', l.direction, 'amount_units', l.amount_units::text,
      'spendable', l.spendable, 'reference_id', l.reference_id,
      'description', l.description, 'created_at', l.created_at
    ) order by l.created_at desc) from public.ledger_entries l where l.user_id = p_user_id), '[]'::jsonb),
    'allocations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'purchase_id', a.purchase_id, 'bucket', a.bucket,
      'percentage', a.percentage, 'amount_units', a.amount_units::text
    )) from public.treasury_allocations a join public.purchases p on p.id = a.purchase_id
      where p.status = 'settled'), '[]'::jsonb),
    'scratch_results', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title_id', s.title_id, 'user_id', s.user_id,
      'prize_units', s.prize_units::text, 'simulated', s.simulated,
      'provider', s.provider, 'randomness_reference', s.randomness_reference,
      'revealed_at', s.revealed_at
    ) order by s.revealed_at desc) from public.scratch_results s where s.user_id = p_user_id), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object(
      'id', po.id, 'type', po.kind, 'body', po.body, 'created_at', po.created_at
    ) order by po.created_at desc) from (select * from public.posts order by created_at desc limit 50) po), '[]'::jsonb),
    'wallet_address', (select p.payer_address from public.purchases p
      where p.user_id = p_user_id and p.status = 'settled' order by p.created_at desc limit 1)
  );
$$;

revoke all on table public.title_tiers from anon, authenticated;
revoke all on table public.title_ownership_events from anon, authenticated;
revoke all on table public.title_renewal_rules from anon, authenticated;
revoke all on table public.title_renewals from anon, authenticated;
