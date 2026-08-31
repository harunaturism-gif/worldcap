-- Phase 2: server-authoritative World Pay purchases and persisted scratch results.
-- WLD values use numeric(78,0) integer base units; decimal columns remain only for
-- Phase 1 compatibility and must not be used for authoritative accounting.

alter table public.campaigns add column if not exists title_price_units numeric(78,0);
alter table public.campaigns add column if not exists serial_prefix text;
alter table public.campaigns add column if not exists next_title_sequence bigint not null default 1;
alter table public.campaigns add column if not exists scratch_config jsonb not null default '{"simulated":true,"tiers":[]}'::jsonb;
alter table public.campaigns add constraint campaigns_title_price_units_integer check (title_price_units is null or (title_price_units > 0 and scale(title_price_units) = 0));

insert into public.campaigns (
  id, name, month_label, status, title_price, title_price_units, serial_prefix,
  sales_open_at, sales_close_at, monthly_draw_at, annual_draw_at, scratch_config
) values (
  '11111111-1111-4111-8111-111111111111', 'September Rise', 'September 2026', 'active', 5,
  5000000000000000000, 'SEP26', '2026-08-24T00:00:00Z', '2026-09-30T18:00:00Z',
  '2026-09-30T20:00:00Z', '2026-12-30T20:00:00Z',
  '{"simulated":true,"provider":"local-server-crypto","tiers":[{"upper_bps":300,"prize_units":"20000000000000000000"},{"upper_bps":1200,"prize_units":"5000000000000000000"},{"upper_bps":3200,"prize_units":"1000000000000000000"},{"upper_bps":10000,"prize_units":"0"}]}'::jsonb
) on conflict (id) do update set
  title_price_units = excluded.title_price_units,
  serial_prefix = excluded.serial_prefix,
  scratch_config = excluded.scratch_config;

insert into public.scratch_games (campaign_id, status, reveal_limit_per_title)
values ('11111111-1111-4111-8111-111111111111', 'active', 1)
on conflict (campaign_id) do update set status = 'active', reveal_limit_per_title = 1;

insert into public.draws (campaign_id, kind, scheduled_at, status)
select '11111111-1111-4111-8111-111111111111', 'monthly', '2026-09-30T20:00:00Z', 'scheduled'
where not exists (
  select 1 from public.draws where campaign_id = '11111111-1111-4111-8111-111111111111' and kind = 'monthly'
);

insert into public.draws (campaign_id, kind, scheduled_at, status)
select null, 'annual', '2026-12-30T20:00:00Z', 'scheduled'
where not exists (
  select 1 from public.draws where campaign_id is null and kind = 'annual' and scheduled_at = '2026-12-30T20:00:00Z'
);

create table public.purchase_intents (
  reference uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id),
  campaign_id uuid not null references public.campaigns(id),
  quantity integer not null check (quantity between 1 and 10),
  unit_price_units numeric(78,0) not null check (unit_price_units > 0 and scale(unit_price_units) = 0),
  total_units numeric(78,0) not null check (total_units > 0 and scale(total_units) = 0),
  recipient text not null check (recipient ~ '^0x[0-9a-fA-F]{40}$'),
  token text not null check (token = 'WLD'),
  status text not null default 'pending' check (status in ('pending','completed','expired')),
  transaction_id text unique,
  completed_purchase_id uuid,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  check (total_units = unit_price_units * quantity)
);

alter table public.purchases add column if not exists payment_reference uuid unique references public.purchase_intents(reference);
alter table public.purchases add column if not exists transaction_id text unique;
alter table public.purchases add column if not exists transaction_hash text unique;
alter table public.purchases add column if not exists payer_address text;
alter table public.purchases add column if not exists unit_price_units numeric(78,0);
alter table public.purchases add column if not exists total_units numeric(78,0);
alter table public.purchases add constraint purchases_unit_values_integer check (
  (unit_price_units is null and total_units is null)
  or (unit_price_units > 0 and total_units = unit_price_units * quantity and scale(unit_price_units) = 0 and scale(total_units) = 0)
);
alter table public.purchase_intents add constraint purchase_intents_completed_purchase_fk foreign key (completed_purchase_id) references public.purchases(id);

alter table public.titles add column if not exists purchase_id uuid references public.purchases(id);
alter table public.titles add column if not exists owner_id text references public.users(id);
alter table public.titles add column if not exists scratch_status text not null default 'available' check (scratch_status in ('available','revealed'));
alter table public.titles add column if not exists scratch_result_id uuid;
alter table public.titles add column if not exists future_redemption_state text not null default 'not_configured' check (future_redemption_state in ('not_configured','eligible','redeemed'));

alter table public.title_ownership add column if not exists scratch_status text not null default 'available' check (scratch_status in ('available','revealed'));
alter table public.title_ownership add column if not exists scratch_result_id uuid;
alter table public.title_ownership add column if not exists future_redemption_state text not null default 'not_configured' check (future_redemption_state in ('not_configured','eligible','redeemed'));

alter table public.wallets add column if not exists connected_address text;
alter table public.wallets add column if not exists verified_spend_units numeric(78,0) not null default 0 check (verified_spend_units >= 0 and scale(verified_spend_units) = 0);
alter table public.wallets add column if not exists simulated_prize_units numeric(78,0) not null default 0 check (simulated_prize_units >= 0 and scale(simulated_prize_units) = 0);

alter table public.ledger_entries add column if not exists user_id text references public.users(id);
alter table public.ledger_entries add column if not exists classification text check (classification in ('verified_purchase','simulated_scratch_prize'));
alter table public.ledger_entries add column if not exists amount_units numeric(78,0);
alter table public.ledger_entries add column if not exists spendable boolean not null default false;
alter table public.ledger_entries add constraint ledger_amount_units_integer check (amount_units is null or (amount_units > 0 and scale(amount_units) = 0));

alter table public.treasury_allocations add column if not exists amount_units numeric(78,0);
alter table public.treasury_allocations add constraint treasury_amount_units_integer check (amount_units is null or (amount_units >= 0 and scale(amount_units) = 0));

alter table public.scratch_results add column if not exists user_id text references public.users(id);
alter table public.scratch_results add column if not exists prize_units numeric(78,0);
alter table public.scratch_results add column if not exists simulated boolean not null default true check (simulated = true);
alter table public.scratch_results add column if not exists provider text;
alter table public.scratch_results add constraint scratch_prize_units_integer check (prize_units is null or (prize_units >= 0 and scale(prize_units) = 0));
alter table public.titles add constraint titles_scratch_result_fk foreign key (scratch_result_id) references public.scratch_results(id);
alter table public.title_ownership add constraint ownership_scratch_result_fk foreign key (scratch_result_id) references public.scratch_results(id);

alter table public.prize_liabilities add column if not exists amount_units numeric(78,0);
alter table public.prize_liabilities add column if not exists settlement_mode text not null default 'simulated' check (settlement_mode = 'simulated');
alter table public.prize_liabilities add constraint liability_amount_units_integer check (amount_units is null or (amount_units > 0 and scale(amount_units) = 0));
alter table public.profiles add column if not exists share_wins boolean not null default true;

create index purchase_intents_user_idx on public.purchase_intents(user_id, created_at desc);
create index purchases_payment_reference_idx on public.purchases(payment_reference);
create index titles_owner_idx on public.titles(owner_id, issued_at desc);
create index ledger_entries_user_idx on public.ledger_entries(user_id, created_at desc);
alter table public.purchase_intents enable row level security;

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
    if v_campaign.title_price_units <> v_intent.unit_price_units then raise exception 'campaign_price_changed'; end if;

    insert into public.purchases (
      user_id, campaign_id, quantity, unit_price, total, status, payment_reference,
      transaction_id, transaction_hash, payer_address, unit_price_units, total_units
    ) values (
      p_user_id, v_intent.campaign_id, v_intent.quantity,
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
      insert into public.titles (campaign_id, serial, issue_price, issued_at, purchase_id, owner_id)
      values (
        v_intent.campaign_id,
        v_campaign.serial_prefix || '-' || lpad((v_sequence + v_index)::text, 6, '0'),
        v_intent.unit_price_units / 1000000000000000000::numeric,
        now(), v_purchase.id, p_user_id
      ) returning * into v_title;

      insert into public.title_ownership (title_id, user_id, purchase_id, acquired_at, draw_eligible)
      values (v_title.id, p_user_id, v_purchase.id, now(), true);

      insert into public.draw_entries (draw_id, title_id, ownership_id)
      select d.id, v_title.id, o.id from public.draws d
      join public.title_ownership o on o.title_id = v_title.id
      where d.status = 'scheduled' and (d.campaign_id = v_intent.campaign_id or d.kind = 'annual')
      on conflict (draw_id, title_id) do nothing;

      v_titles := v_titles || jsonb_build_array(jsonb_build_object(
        'id', v_title.id, 'serial', v_title.serial, 'campaign_id', v_title.campaign_id,
        'purchase_id', v_purchase.id, 'owner_id', p_user_id, 'created_at', v_title.issued_at,
        'scratch_status', v_title.scratch_status, 'scratch_result_id', v_title.scratch_result_id,
        'draw_eligible', true, 'future_redemption_state', v_title.future_redemption_state
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
      true, v_purchase.id::text, v_intent.quantity || ' verified ' || v_campaign.month_label || ' title(s)', now()
    );

    select id into v_profile_id from public.profiles where user_id = p_user_id;
    if v_profile_id is not null then
      insert into public.posts (profile_id, kind, body, reference_id)
      values (v_profile_id, 'purchase_activity', 'A verified human added ' || v_intent.quantity || ' title(s) to the draw.', v_purchase.id::text);
    end if;

    update public.purchase_intents set
      status = 'completed', transaction_id = p_transaction_id, completed_purchase_id = v_purchase.id
    where reference = p_reference;
  end if;

  if v_replayed then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'serial', t.serial, 'campaign_id', t.campaign_id, 'purchase_id', t.purchase_id,
      'owner_id', t.owner_id, 'created_at', t.issued_at, 'scratch_status', t.scratch_status,
      'scratch_result_id', t.scratch_result_id, 'draw_eligible', true,
      'future_redemption_state', t.future_redemption_state
    ) order by t.issued_at), '[]'::jsonb) into v_titles
    from public.titles t where t.purchase_id = v_purchase.id;
  end if;

  return jsonb_build_object(
    'replayed', v_replayed,
    'purchase', jsonb_build_object(
      'id', v_purchase.id, 'reference', v_purchase.payment_reference, 'user_id', v_purchase.user_id,
      'campaign_id', v_purchase.campaign_id, 'quantity', v_purchase.quantity,
      'unit_price_units', v_purchase.unit_price_units::text, 'total_units', v_purchase.total_units::text,
      'transaction_id', v_purchase.transaction_id, 'transaction_hash', v_purchase.transaction_hash,
      'payer_address', v_purchase.payer_address, 'created_at', v_purchase.created_at
    ),
    'titles', v_titles
  );
end;
$$;

create or replace function public.worldprize_reveal_scratch(
  p_user_id text,
  p_title_id uuid,
  p_prize_units numeric,
  p_randomness_reference text,
  p_provider text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title public.titles%rowtype;
  v_result public.scratch_results%rowtype;
  v_wallet_id uuid;
  v_profile_id uuid;
  v_share_wins boolean;
  v_replayed boolean := false;
begin
  if p_user_id !~ '^user_[0-9a-f]{64}$' or p_prize_units < 0 or scale(p_prize_units) <> 0
    or p_randomness_reference !~ '^local_[0-9a-f]{32}$' or p_provider <> 'local-server-crypto' then
    raise exception 'invalid_scratch_input';
  end if;
  select * into v_title from public.titles where id = p_title_id and owner_id = p_user_id for update;
  if not found then raise exception 'title_not_found'; end if;

  if v_title.scratch_result_id is not null then
    select * into strict v_result from public.scratch_results where id = v_title.scratch_result_id;
    v_replayed := true;
  else
    insert into public.scratch_results (
      scratch_game_id, title_id, user_id, prize_amount, prize_units,
      randomness_reference, provider, simulated, revealed_at
    ) select sg.id, v_title.id, p_user_id,
      p_prize_units / 1000000000000000000::numeric, p_prize_units,
      p_randomness_reference, p_provider, true, now()
    from public.scratch_games sg where sg.campaign_id = v_title.campaign_id
    returning * into v_result;

    update public.titles set scratch_status = 'revealed', scratch_result_id = v_result.id where id = v_title.id returning * into v_title;
    update public.title_ownership set scratch_status = 'revealed', scratch_result_id = v_result.id, scratched_at = v_result.revealed_at
    where title_id = v_title.id and user_id = p_user_id;

    if p_prize_units > 0 then
      insert into public.prize_liabilities (user_id, source, source_id, amount, amount_units, status, settlement_mode)
      values (p_user_id, 'scratch', v_result.id, p_prize_units / 1000000000000000000::numeric, p_prize_units, 'pending', 'simulated');

      select id into strict v_wallet_id from public.wallets where user_id = p_user_id;
      update public.wallets set simulated_prize_units = simulated_prize_units + p_prize_units, updated_at = now() where id = v_wallet_id;
      insert into public.ledger_entries (
        wallet_id, user_id, kind, classification, direction, amount, amount_units,
        spendable, reference_id, description, created_at
      ) values (
        v_wallet_id, p_user_id, 'scratch_prize', 'simulated_scratch_prize', 'credit',
        p_prize_units / 1000000000000000000::numeric, p_prize_units,
        false, v_result.id::text, 'Simulated scratch result · ' || v_title.serial, now()
      );

      select id, share_wins into v_profile_id, v_share_wins from public.profiles where user_id = p_user_id;
      if v_profile_id is not null and v_share_wins then
        insert into public.posts (profile_id, kind, body, reference_id)
        values (v_profile_id, 'winner_activity', 'A verified human revealed a simulated scratch prize.', v_result.id::text);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'replayed', v_replayed,
    'title', jsonb_build_object(
      'id', v_title.id, 'serial', v_title.serial, 'campaign_id', v_title.campaign_id,
      'purchase_id', v_title.purchase_id, 'owner_id', v_title.owner_id, 'created_at', v_title.issued_at,
      'scratch_status', v_title.scratch_status, 'scratch_result_id', v_title.scratch_result_id,
      'draw_eligible', true, 'future_redemption_state', v_title.future_redemption_state
    ),
    'result', jsonb_build_object(
      'id', v_result.id, 'title_id', v_result.title_id, 'user_id', v_result.user_id,
      'prize_units', v_result.prize_units::text, 'simulated', true, 'provider', v_result.provider,
      'randomness_reference', v_result.randomness_reference, 'revealed_at', v_result.revealed_at
    )
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
    'titles_sold', (select count(*)::integer from public.titles),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'reference', p.payment_reference, 'user_id', p.user_id, 'campaign_id', p.campaign_id,
      'quantity', p.quantity, 'unit_price_units', p.unit_price_units::text, 'total_units', p.total_units::text,
      'transaction_id', p.transaction_id, 'transaction_hash', p.transaction_hash,
      'payer_address', p.payer_address, 'created_at', p.created_at
    ) order by p.created_at desc) from public.purchases p where p.user_id = p_user_id and p.status = 'settled'), '[]'::jsonb),
    'titles', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'serial', t.serial, 'campaign_id', t.campaign_id, 'purchase_id', t.purchase_id,
      'owner_id', t.owner_id, 'created_at', t.issued_at, 'scratch_status', t.scratch_status,
      'scratch_result_id', t.scratch_result_id, 'draw_eligible', true,
      'future_redemption_state', t.future_redemption_state
    ) order by t.issued_at desc) from public.titles t where t.owner_id = p_user_id), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'user_id', l.user_id, 'classification', l.classification, 'direction', l.direction,
      'amount_units', l.amount_units::text, 'spendable', l.spendable, 'reference_id', l.reference_id,
      'description', l.description, 'created_at', l.created_at
    ) order by l.created_at desc) from public.ledger_entries l where l.user_id = p_user_id), '[]'::jsonb),
    'allocations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'purchase_id', a.purchase_id, 'bucket', a.bucket,
      'percentage', a.percentage, 'amount_units', a.amount_units::text
    )) from public.treasury_allocations a join public.purchases p on p.id = a.purchase_id where p.status = 'settled'), '[]'::jsonb),
    'scratch_results', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title_id', s.title_id, 'user_id', s.user_id, 'prize_units', s.prize_units::text,
      'simulated', s.simulated, 'provider', s.provider, 'randomness_reference', s.randomness_reference,
      'revealed_at', s.revealed_at
    ) order by s.revealed_at desc) from public.scratch_results s where s.user_id = p_user_id), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object(
      'id', po.id, 'type', po.kind, 'body', po.body, 'created_at', po.created_at
    ) order by po.created_at desc) from (select * from public.posts order by created_at desc limit 50) po), '[]'::jsonb),
    'wallet_address', (select p.payer_address from public.purchases p where p.user_id = p_user_id and p.status = 'settled' order by p.created_at desc limit 1)
  );
$$;

revoke all on function public.worldprize_complete_purchase(text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.worldprize_reveal_scratch(text, uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.worldprize_get_snapshot(text) from public, anon, authenticated;
grant execute on function public.worldprize_complete_purchase(text, uuid, text, text, text) to service_role;
grant execute on function public.worldprize_reveal_scratch(text, uuid, numeric, text, text) to service_role;
grant execute on function public.worldprize_get_snapshot(text) to service_role;
