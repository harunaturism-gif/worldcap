-- WorldCAP economics v1: 40/38/10/10/2 sales allocation, five ordered
-- monthly winners, quarterly jackpot, and post-monthly CAP redemption.
-- All prize settlement remains simulated/non-spendable in closed beta.

alter table public.purchase_intents add column if not exists economic_model_version text not null default 'legacy-60-10-20-10'
  check (economic_model_version in ('legacy-60-10-20-10','worldcap-40-38-10-10-2-v1'));
alter table public.purchases add column if not exists economic_model_version text not null default 'legacy-60-10-20-10'
  check (economic_model_version in ('legacy-60-10-20-10','worldcap-40-38-10-10-2-v1'));
alter table public.treasury_allocations add column if not exists economic_model_version text not null default 'legacy-60-10-20-10'
  check (economic_model_version in ('legacy-60-10-20-10','worldcap-40-38-10-10-2-v1'));

alter table public.treasury_allocations drop constraint if exists treasury_allocations_bucket_check;
alter table public.treasury_allocations add constraint treasury_allocations_bucket_check check (bucket in (
  'monthly_prize_pool','annual_jackpot','platform_operations','commercial_growth',
  'cap_redemption_program','quarterly_jackpot','company_treasury'
));
alter table public.treasury_allocations drop constraint if exists treasury_allocations_percentage_check;
alter table public.treasury_allocations add constraint treasury_allocations_percentage_check
  check (percentage in (2,10,20,38,40,60));

alter table public.campaigns add column if not exists quarterly_draw_at timestamptz;
update public.campaigns set quarterly_draw_at = annual_draw_at where quarterly_draw_at is null;
alter table public.campaigns alter column quarterly_draw_at set not null;

alter table public.draws drop constraint if exists draws_kind_check;
alter table public.draws add constraint draws_kind_check check (kind in ('monthly','quarterly','annual'));
alter table public.draws alter column algorithm_version set default 'worldcap-draw-v2-five-winner';
alter table public.draws add column if not exists prize_pool_units numeric(78,0) not null default 0
  check (prize_pool_units >= 0 and scale(prize_pool_units) = 0);
alter table public.draw_entries add column if not exists owner_id_snapshot text references public.users(id) on delete restrict;

create table public.draw_winners (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete restrict,
  ordinal integer not null check (ordinal between 1 and 5),
  winning_index numeric(78,0) not null check (winning_index >= 0 and scale(winning_index) = 0),
  title_id uuid not null references public.titles(id) on delete restrict,
  owner_id_snapshot text not null references public.users(id) on delete restrict,
  payout_basis_points integer not null check (payout_basis_points in (400,600,1000,2500,5500,10000)),
  payout_units numeric(78,0) not null check (payout_units >= 0 and scale(payout_units) = 0),
  settlement_mode text not null default 'simulated' check (settlement_mode = 'simulated'),
  created_at timestamptz not null default now(),
  unique (draw_id, ordinal),
  unique (draw_id, title_id),
  unique (draw_id, winning_index)
);

alter table public.draw_winners enable row level security;
revoke all on table public.draw_winners from public, anon, authenticated;
grant select, insert on table public.draw_winners to service_role;

create or replace function public.worldcap_guard_draw_winner_immutability()
returns trigger language plpgsql as $$
begin
  raise exception 'draw_winner_immutable';
end;
$$;
create trigger draw_winner_immutable_guard before update or delete on public.draw_winners
  for each row execute function public.worldcap_guard_draw_winner_immutability();

alter table public.title_cap_entitlements add column if not exists claimed_by_user_id text references public.users(id) on delete restrict;

alter table public.ledger_entries drop constraint if exists ledger_entries_classification_check;
alter table public.ledger_entries add constraint ledger_entries_classification_check
  check (classification in ('verified_purchase','demo_purchase','simulated_scratch_prize','simulated_draw_prize'));

create or replace function public.worldcap_complete_purchase_economics_v1(
  p_user_id text, p_reference uuid, p_transaction_id text,
  p_transaction_hash text, p_payer_address text
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_result jsonb;
  v_purchase_id uuid;
  v_total numeric(78,0);
  v_model text;
  v_cap numeric(78,0);
  v_monthly numeric(78,0);
  v_quarterly numeric(78,0);
  v_company numeric(78,0);
  v_platform numeric(78,0);
  v_titles jsonb;
begin
  select economic_model_version into strict v_model
  from public.purchase_intents where reference = p_reference and user_id = p_user_id for update;

  v_result := public.worldprize_complete_purchase(
    p_user_id, p_reference, p_transaction_id, p_transaction_hash, p_payer_address
  );
  v_purchase_id := (v_result->'purchase'->>'id')::uuid;

  if v_model = 'worldcap-40-38-10-10-2-v1' then
    select total_units into strict v_total from public.purchases where id = v_purchase_id for update;
    if (select economic_model_version from public.purchases where id = v_purchase_id) <> v_model then
      delete from public.treasury_allocations where purchase_id = v_purchase_id;
      v_cap := trunc(v_total * 40 / 100);
      v_monthly := trunc(v_total * 38 / 100);
      v_quarterly := trunc(v_total * 10 / 100);
      v_company := trunc(v_total * 10 / 100);
      v_platform := v_total - v_cap - v_monthly - v_quarterly - v_company;
      insert into public.treasury_allocations (
        purchase_id, bucket, percentage, amount, amount_units, economic_model_version
      ) values
        (v_purchase_id, 'cap_redemption_program', 40, v_cap / 1000000000000000000::numeric, v_cap, v_model),
        (v_purchase_id, 'monthly_prize_pool', 38, v_monthly / 1000000000000000000::numeric, v_monthly, v_model),
        (v_purchase_id, 'quarterly_jackpot', 10, v_quarterly / 1000000000000000000::numeric, v_quarterly, v_model),
        (v_purchase_id, 'company_treasury', 10, v_company / 1000000000000000000::numeric, v_company, v_model),
        (v_purchase_id, 'platform_operations', 2, v_platform / 1000000000000000000::numeric, v_platform, v_model);
      update public.purchases set economic_model_version = v_model where id = v_purchase_id;
    end if;
    if exists (
      select 1 from public.titles t left join public.title_cap_entitlements cap on cap.title_id=t.id
      where t.purchase_id=v_purchase_id and cap.title_id is null
    ) then
      raise exception 'cap_title_entitlement_missing';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'serial', t.serial, 'campaign_id', t.campaign_id,
    'tier_id', tt.id, 'tier_code', tt.code, 'tier_name', tt.name,
    'purchase_id', t.purchase_id, 'owner_id', t.current_owner_id,
    'original_buyer_id', t.original_buyer_id, 'current_owner_id', t.current_owner_id,
    'created_at', t.issued_at, 'scratch_status', t.scratch_status,
    'scratch_result_id', t.scratch_result_id, 'draw_eligible', ownership.draw_eligible,
    'lifecycle_state', t.lifecycle_state, 'renewal_state', t.renewal_state,
    'future_redemption_state', t.future_redemption_state,
    'cap_redemption_state', cap.redemption_state,
    'cap_entitlement_units', coalesce(cap.entitlement_units, 0)::text
  ) order by t.issued_at), '[]'::jsonb) into v_titles
  from public.titles t
  join public.title_tiers tt on tt.id = t.tier_id
  join public.title_ownership ownership on ownership.title_id = t.id
  left join public.title_cap_entitlements cap on cap.title_id = t.id
  where t.purchase_id = v_purchase_id;

  v_result := jsonb_set(v_result, '{purchase,economic_model_version}', to_jsonb(v_model), true);
  return jsonb_set(v_result, '{titles}', v_titles, true);
end;
$$;

revoke all on function public.worldcap_complete_purchase_economics_v1(text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.worldcap_complete_purchase_economics_v1(text,uuid,text,text,text) to service_role;

create or replace function public.worldcap_complete_demo_purchase(
  p_user_id text, p_reference uuid, p_transaction_id text,
  p_transaction_hash text, p_payer_address text
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_result jsonb; v_purchase_id uuid; v_total numeric(78,0); v_mode text;
begin
  if p_transaction_id !~ '^demotx_[0-9a-f-]{36}$' then raise exception 'invalid_beta_demo_transaction'; end if;
  v_result := public.worldcap_complete_purchase_economics_v1(p_user_id, p_reference, p_transaction_id, p_transaction_hash, p_payer_address);
  v_purchase_id := (v_result->'purchase'->>'id')::uuid;
  select total_units, settlement_mode into strict v_total, v_mode from public.purchases where id = v_purchase_id for update;
  if v_mode = 'verified' then
    update public.purchases set settlement_mode = 'demo' where id = v_purchase_id;
    update public.wallets set verified_spend_units = greatest(0, verified_spend_units - v_total), updated_at = now() where user_id = p_user_id;
    update public.ledger_entries set classification = 'demo_purchase', spendable = false,
      description = replace(description, 'verified', 'non-monetary beta demo')
      where reference_id = v_purchase_id::text and classification = 'verified_purchase';
    update public.treasury_allocations set settlement_mode = 'demo_modeled' where purchase_id = v_purchase_id;
  elsif v_mode <> 'demo' then
    raise exception 'demo_purchase_mode_invalid';
  end if;
  return jsonb_set(v_result, '{purchase,settlement_mode}', '"demo"'::jsonb, true);
end;
$$;

create or replace function public.worldcap_select_winning_index_v2(p_seed text, p_eligible_count numeric)
returns numeric language plpgsql immutable strict set search_path = public, pg_temp as $$
declare
  v_space numeric := power(2::numeric, 256); v_limit numeric; v_original_hex text;
  v_sample numeric; v_retry integer;
begin
  if p_seed !~ '^0x[0-9a-fA-F]{64}$' or p_eligible_count <= 0 or scale(p_eligible_count) <> 0 or p_eligible_count > v_space then
    raise exception 'draw_selection_input_invalid';
  end if;
  if p_eligible_count = 1 then return 0; end if;
  v_original_hex := lower(substr(p_seed, 3));
  v_sample := public.worldcap_uint256(decode(v_original_hex, 'hex'));
  v_limit := v_space - mod(v_space, p_eligible_count);
  for v_retry in 0..255 loop
    if v_sample < v_limit then return mod(v_sample, p_eligible_count); end if;
    v_sample := public.worldcap_uint256(digest(convert_to(
      'worldcap-draw-v2-five-winner|rejection|' || v_original_hex || '|' || (v_retry + 1)::text, 'UTF8'), 'sha256'));
  end loop;
  raise exception 'randomness_rejection_limit_exceeded';
end;
$$;

create or replace function public.worldcap_select_unique_winning_indices_v1(
  p_seed text, p_eligible_count numeric, p_winner_count integer, p_draw_id uuid
) returns numeric[] language plpgsql immutable strict set search_path = public, pg_temp as $$
declare
  v_swaps jsonb := '{}'::jsonb; v_winners numeric[] := array[]::numeric[];
  v_ordinal integer; v_remaining numeric; v_derived text; v_position numeric;
  v_winner numeric; v_last_position numeric; v_last_value numeric;
begin
  if p_winner_count < 0 or p_winner_count > p_eligible_count then raise exception 'winner_count_invalid'; end if;
  for v_ordinal in 0..(p_winner_count - 1) loop
    v_remaining := p_eligible_count - v_ordinal;
    v_derived := '0x' || encode(digest(convert_to(
      'worldcap-draw-v2-five-winner|winner|' || lower(substr(p_seed, 3)) || '|' || p_draw_id::text || '|' || v_ordinal::text,
      'UTF8'), 'sha256'), 'hex');
    v_position := public.worldcap_select_winning_index_v2(v_derived, v_remaining);
    v_winner := coalesce((v_swaps->>v_position::text)::numeric, v_position);
    v_last_position := v_remaining - 1;
    v_last_value := coalesce((v_swaps->>v_last_position::text)::numeric, v_last_position);
    if v_position <> v_last_position then
      v_swaps := jsonb_set(v_swaps, array[v_position::text], to_jsonb(v_last_value), true);
    end if;
    v_swaps := v_swaps - v_last_position::text;
    v_winners := array_append(v_winners, v_winner);
  end loop;
  return v_winners;
end;
$$;

create or replace function public.worldcap_artifact_content_hash_v3(
  p_draw_id uuid, p_draw_kind text, p_prize_pool_units numeric, p_campaign_id uuid,
  p_scope text, p_closed_at timestamptz, p_eligible_count numeric,
  p_manifest_root text, p_algorithm_version text, p_entries jsonb
) returns text language plpgsql immutable strict parallel safe set search_path = public, pg_temp as $$
declare v_entry jsonb; v_canonical text;
begin
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) <> p_eligible_count then raise exception 'artifact_entries_invalid'; end if;
  v_canonical := concat_ws('|',
    public.worldcap_length_prefix('worldcap-public-artifact-content-v3'),
    public.worldcap_length_prefix('worldcap-public-draw-v3'),
    public.worldcap_length_prefix(p_algorithm_version), public.worldcap_length_prefix(p_draw_id::text),
    public.worldcap_length_prefix(upper(p_draw_kind)), public.worldcap_length_prefix(p_prize_pool_units::text),
    public.worldcap_length_prefix(p_campaign_id::text), public.worldcap_length_prefix(p_scope),
    public.worldcap_length_prefix(to_char(p_closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    public.worldcap_length_prefix(p_eligible_count::text), public.worldcap_length_prefix(p_manifest_root),
    public.worldcap_length_prefix(jsonb_array_length(p_entries)::text)
  );
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_canonical := v_canonical || '|' || concat_ws('|',
      public.worldcap_length_prefix(v_entry->>'index'), public.worldcap_length_prefix(v_entry->>'titleId'),
      public.worldcap_length_prefix(v_entry->>'serial'), public.worldcap_length_prefix(v_entry->>'tier'),
      public.worldcap_length_prefix(v_entry->>'campaignId'));
  end loop;
  return 'sha256:' || encode(digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex');
end;
$$;

create or replace function public.worldcap_close_draw(p_draw_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_draw public.draws%rowtype; v_manifest public.draw_manifests%rowtype; v_entries jsonb;
  v_count numeric(78,0); v_root text; v_closed_at timestamptz := statement_timestamp(); v_content_hash text;
  v_prize_pool numeric(78,0);
begin
  select * into v_draw from public.draws where id = p_draw_id for update;
  if not found then raise exception 'draw_not_found'; end if;
  if v_draw.status in ('closed','randomness_pending','resolved','settled') then
    select * into strict v_manifest from public.draw_manifests where draw_id = p_draw_id;
    return jsonb_build_object('replayed', true, 'draw_id', p_draw_id, 'status', v_draw.status,
      'eligible_count', v_manifest.eligible_count::text, 'manifest_root', v_manifest.eligibility_commitment,
      'artifact_content_hash', v_manifest.artifact_content_hash, 'manifest', v_manifest.public_manifest);
  end if;
  if v_draw.status <> 'open' then raise exception 'draw_not_open'; end if;
  if v_draw.campaign_id is null then raise exception 'draw_campaign_scope_required'; end if;
  if v_closed_at < v_draw.closes_at then raise exception 'draw_close_time_not_reached'; end if;

  perform 1 from public.campaigns where id = v_draw.campaign_id for update;
  delete from public.draw_entries where draw_id = p_draw_id;
  insert into public.draw_entries (draw_id, title_id, ownership_id, manifest_index, serial_snapshot, tier_code_snapshot, owner_id_snapshot)
  select p_draw_id, candidate.title_id, candidate.ownership_id,
    row_number() over (order by candidate.serial collate "C", candidate.title_id) - 1,
    candidate.serial, upper(candidate.tier_code), candidate.owner_id
  from (
    select t.id title_id, ownership.id ownership_id, t.current_owner_id owner_id, t.serial, tier.code tier_code
    from public.titles t join public.title_tiers tier on tier.id = t.tier_id and tier.campaign_id = t.campaign_id
    join public.title_ownership ownership on ownership.title_id = t.id
    where t.campaign_id = v_draw.campaign_id and t.issued_at <= v_draw.closes_at
      and ownership.draw_eligible = true
      and tier.code in (select jsonb_array_elements_text(v_draw.allowed_tier_codes))
      and (v_draw.eligibility_scope = 'GLOBAL' or upper(tier.code) = v_draw.eligibility_scope)
  ) candidate;

  select count(*)::numeric into v_count from public.draw_entries where draw_id = p_draw_id;
  if v_count = 0 then raise exception 'draw_has_no_eligible_titles'; end if;
  if v_draw.kind = 'monthly' and v_count < 5 then raise exception 'monthly_draw_requires_five_eligible_titles'; end if;

  select coalesce(sum(a.amount_units), 0) into v_prize_pool
  from public.treasury_allocations a join public.purchases p on p.id = a.purchase_id
  where p.campaign_id = v_draw.campaign_id and p.status = 'settled'
    and a.economic_model_version = 'worldcap-40-38-10-10-2-v1'
    and a.bucket = case when v_draw.kind = 'monthly' then 'monthly_prize_pool' else 'quarterly_jackpot' end;

  select jsonb_agg(jsonb_build_object('index', entry.manifest_index::text, 'titleId', entry.title_id::text,
    'serial', entry.serial_snapshot, 'tier', entry.tier_code_snapshot, 'campaignId', v_draw.campaign_id::text)
    order by entry.manifest_index) into v_entries from public.draw_entries entry where entry.draw_id = p_draw_id;
  v_root := public.worldcap_manifest_root(p_draw_id, v_entries);
  v_content_hash := public.worldcap_artifact_content_hash_v3(p_draw_id, v_draw.kind, v_prize_pool,
    v_draw.campaign_id, v_draw.eligibility_scope, v_closed_at, v_count, v_root,
    'worldcap-draw-v2-five-winner', v_entries);

  insert into public.draw_manifests (draw_id, manifest_version, eligible_count, eligibility_commitment,
    artifact_content_hash, public_manifest, generated_at, publication_status)
  values (p_draw_id, v_draw.manifest_version, v_count, v_root, v_content_hash,
    jsonb_build_object('schemaVersion','worldcap-public-draw-v3','algorithmVersion','worldcap-draw-v2-five-winner',
      'drawId',p_draw_id::text,'drawKind',upper(v_draw.kind),'prizePoolUnits',v_prize_pool::text,
      'campaignId',v_draw.campaign_id::text,'scope',v_draw.eligibility_scope,
      'closedAt',to_char(v_closed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'eligibleCount',v_count::text,'manifestRoot',v_root,'artifactContentHash',v_content_hash,'entries',v_entries),
    v_closed_at, 'pending') returning * into v_manifest;

  update public.draws set status='closed', eligible_title_count=v_count, eligibility_commitment=v_root,
    finalized_at=v_closed_at, algorithm_version='worldcap-draw-v2-five-winner', prize_pool_units=v_prize_pool
  where id=p_draw_id and status='open';
  if not found then raise exception 'stale_draw_state'; end if;
  return jsonb_build_object('replayed',false,'draw_id',p_draw_id,'status','closed','eligible_count',v_count::text,
    'manifest_root',v_root,'artifact_content_hash',v_content_hash,'manifest',v_manifest.public_manifest);
end;
$$;

create or replace function public.worldcap_resolve_draw(p_draw_id uuid, p_provider_request_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_job public.draw_coordinator_jobs%rowtype; v_draw public.draws%rowtype; v_indices numeric[];
  v_index numeric; v_title_id uuid; v_owner_id text; v_serial text; v_ordinal integer;
  v_bps integer; v_payout numeric(78,0); v_allocated numeric(78,0) := 0; v_winner_id uuid;
  v_external_proof_verified boolean; v_winners jsonb := '[]'::jsonb;
begin
  select * into v_job from public.draw_coordinator_jobs where draw_id=p_draw_id for update;
  if not found or v_job.provider_request_id <> p_provider_request_id then raise exception 'randomness_request_binding_mismatch'; end if;
  v_external_proof_verified := coalesce(v_job.verification_metadata->>'external_proof_verified','false')='true';
  if not v_external_proof_verified then raise exception 'external_randomness_proof_not_verified'; end if;
  select * into strict v_draw from public.draws where id=p_draw_id for update;
  if v_draw.status='resolved' then
    if v_job.status <> 'resolved' or v_job.randomness_seed is null or v_draw.randomness_seed is distinct from v_job.randomness_seed then raise exception 'resolved_randomness_mismatch'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('ordinal',w.ordinal,'winning_index',w.winning_index::text,
      'winning_title_id',w.title_id,'payout_basis_points',w.payout_basis_points,'payout_units',w.payout_units::text)
      order by w.ordinal),'[]'::jsonb) into v_winners from public.draw_winners w where w.draw_id=p_draw_id;
    return jsonb_build_object('replayed',true,'winners',v_winners);
  end if;
  if v_draw.status <> 'randomness_pending' or v_job.status <> 'fulfilled' or v_job.randomness_seed is null then raise exception 'draw_not_resolvable'; end if;

  if v_draw.kind='monthly' then
    if v_draw.eligible_title_count < 5 then raise exception 'monthly_draw_requires_five_eligible_titles'; end if;
    v_indices := public.worldcap_select_unique_winning_indices_v1(v_job.randomness_seed,v_draw.eligible_title_count,5,p_draw_id);
  else
    v_indices := array[public.worldcap_select_winning_index_v2(v_job.randomness_seed,v_draw.eligible_title_count)];
  end if;

  for v_ordinal in 1..array_length(v_indices,1) loop
    v_index := v_indices[v_ordinal];
    select e.title_id,e.owner_id_snapshot,e.serial_snapshot into strict v_title_id,v_owner_id,v_serial
      from public.draw_entries e where e.draw_id=p_draw_id and e.manifest_index=v_index;
    if v_draw.kind='monthly' then
      v_bps := (array[5500,2500,1000,600,400])[v_ordinal];
      if v_ordinal < 5 then v_payout := trunc(v_draw.prize_pool_units*v_bps/10000);
      else v_payout := v_draw.prize_pool_units-v_allocated; end if;
    else v_bps := 10000; v_payout := v_draw.prize_pool_units; end if;
    v_allocated := v_allocated+v_payout;
    insert into public.draw_winners(draw_id,ordinal,winning_index,title_id,owner_id_snapshot,payout_basis_points,payout_units)
      values(p_draw_id,v_ordinal,v_index,v_title_id,v_owner_id,v_bps,v_payout) returning id into v_winner_id;
    if v_payout > 0 then
      insert into public.prize_liabilities(user_id,source,source_id,amount,amount_units,status,settlement_mode)
        values(v_owner_id,'draw',v_winner_id,v_payout/1000000000000000000::numeric,v_payout,'pending','simulated');
      update public.wallets set simulated_prize_units=simulated_prize_units+v_payout,updated_at=now() where user_id=v_owner_id;
      insert into public.ledger_entries(wallet_id,user_id,kind,classification,direction,amount,amount_units,spendable,reference_id,description)
        select wallet.id,v_owner_id,'draw_prize','simulated_draw_prize','credit',v_payout/1000000000000000000::numeric,
          v_payout,false,v_winner_id::text,'Simulated draw prize · winner #'||v_ordinal from public.wallets wallet where wallet.user_id=v_owner_id;
    end if;
    v_winners := v_winners||jsonb_build_array(jsonb_build_object('ordinal',v_ordinal,'winning_index',v_index::text,
      'winning_title_id',v_title_id,'winning_title',v_serial,'payout_basis_points',v_bps,'payout_units',v_payout::text));
  end loop;

  if v_draw.kind='monthly' then
    update public.title_cap_entitlements cap set redemption_state='available',available_at=now()
      from public.draw_entries entry where entry.draw_id=p_draw_id and entry.title_id=cap.title_id and cap.redemption_state='locked';
  end if;
  update public.draws set status='resolved',randomness_seed=v_job.randomness_seed,
    winning_index=v_indices[1],winning_title_id=(v_winners->0->>'winning_title_id')::uuid,payout_status='PENDING' where id=p_draw_id;
  update public.draw_coordinator_jobs set status='resolved',verification_metadata=coalesce(v_job.verification_metadata,'{}'::jsonb)||
    jsonb_build_object('algorithm_recomputed_in_database',true,'ordered_winners',v_winners),updated_at=now() where id=v_job.id;
  return jsonb_build_object('replayed',false,'winners',v_winners);
end;
$$;

create or replace function public.worldcap_claim_title_cap(p_user_id text,p_title_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cap public.title_cap_entitlements%rowtype; v_owner text;
begin
  select title.current_owner_id into strict v_owner from public.titles title where title.id=p_title_id for update;
  if v_owner <> p_user_id then raise exception 'title_not_owned'; end if;
  select * into strict v_cap from public.title_cap_entitlements where title_id=p_title_id for update;
  if v_cap.redemption_state='locked' then raise exception 'cap_redemption_not_available'; end if;
  if v_cap.redemption_state='expired' then raise exception 'cap_redemption_expired'; end if;
  if v_cap.redemption_state='claimed' then
    if v_cap.claimed_by_user_id <> p_user_id then raise exception 'cap_redemption_already_claimed'; end if;
    return jsonb_build_object('replayed',true,'title_id',p_title_id,'claimed_units',v_cap.entitlement_units::text,'draw_eligible',true);
  end if;
  insert into public.cap_accounts(user_id,available_units,total_claimed_units)
    values(p_user_id,v_cap.entitlement_units,v_cap.entitlement_units)
    on conflict(user_id) do update set available_units=public.cap_accounts.available_units+excluded.available_units,
      total_claimed_units=public.cap_accounts.total_claimed_units+excluded.total_claimed_units,updated_at=now();
  update public.title_cap_entitlements set redemption_state='claimed',claimed_at=now(),claimed_by_user_id=p_user_id where title_id=p_title_id;
  return jsonb_build_object('replayed',false,'title_id',p_title_id,'claimed_units',v_cap.entitlement_units::text,'draw_eligible',true);
end;
$$;

revoke all on function public.worldcap_complete_demo_purchase(text,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.worldcap_select_winning_index_v2(text,numeric) from public, anon, authenticated;
revoke all on function public.worldcap_select_unique_winning_indices_v1(text,numeric,integer,uuid) from public, anon, authenticated;
revoke all on function public.worldcap_artifact_content_hash_v3(uuid,text,numeric,uuid,text,timestamptz,numeric,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.worldcap_close_draw(uuid) from public, anon, authenticated;
revoke all on function public.worldcap_resolve_draw(uuid,text) from public, anon, authenticated;
revoke all on function public.worldcap_claim_title_cap(text,uuid) from public, anon, authenticated;
grant execute on function public.worldcap_complete_demo_purchase(text,uuid,text,text,text) to service_role;
grant execute on function public.worldcap_close_draw(uuid) to service_role;
grant execute on function public.worldcap_resolve_draw(uuid,text) to service_role;
grant execute on function public.worldcap_claim_title_cap(text,uuid) to service_role;

comment on table public.draw_winners is 'Immutable ordered draw results. Five rows for monthly draws, one for quarterly draws; simulated beta liabilities only.';
comment on function public.worldcap_claim_title_cap(text,uuid) is 'Claims an AVAILABLE simulated Title CAP entitlement without altering draw eligibility.';
