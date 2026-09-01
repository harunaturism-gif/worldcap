-- Closed beta durable randomness coordinator. No live provider is enabled by this migration.

create table public.draw_coordinator_jobs (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null unique references public.draws(id),
  provider text not null,
  network text not null,
  idempotency_key text not null unique,
  status text not null check (status in ('prepared','request_bound','fulfilled','resolved','failed')),
  provider_request_id text unique,
  request_transaction_hash text unique,
  request_block numeric(78,0) check (request_block is null or (request_block >= 0 and scale(request_block) = 0)),
  requested_at timestamptz,
  fulfilled_at timestamptz,
  randomness_seed text check (randomness_seed is null or randomness_seed ~ '^0x[0-9a-f]{64}$'),
  proof_reference text,
  algorithm_version text not null check (algorithm_version = 'worldcap-draw-v1'),
  verification_metadata jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.operational_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null check (severity in ('info','warn','error')),
  correlation_id text,
  public_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index operational_events_type_time_idx on public.operational_events(event_type, created_at desc);

create or replace function public.worldcap_uint256(p_bytes bytea)
returns numeric language plpgsql immutable strict parallel safe as $$
declare v_result numeric := 0; v_index integer;
begin
  if octet_length(p_bytes) <> 32 then raise exception 'uint256_bytes_invalid'; end if;
  for v_index in 0..31 loop v_result := v_result * 256 + get_byte(p_bytes, v_index); end loop;
  return v_result;
end;
$$;

create or replace function public.worldcap_select_winning_index(p_seed text, p_eligible_count numeric)
returns numeric language plpgsql immutable strict
set search_path = public, pg_temp as $$
declare
  v_space numeric := power(2::numeric, 256);
  v_limit numeric;
  v_original_hex text;
  v_sample numeric;
  v_retry integer;
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
      'worldcap-draw-v1|rejection|' || v_original_hex || '|' || (v_retry + 1)::text, 'UTF8'), 'sha256'));
  end loop;
  raise exception 'randomness_rejection_limit_exceeded';
end;
$$;

create or replace function public.worldcap_prepare_randomness(
  p_draw_id uuid, p_provider text, p_network text
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_draw public.draws%rowtype; v_job public.draw_coordinator_jobs%rowtype;
begin
  if p_provider !~ '^[a-z0-9][a-z0-9_-]{2,63}$' or p_network !~ '^[a-z0-9][a-z0-9_-]{2,63}$' then raise exception 'provider_config_invalid'; end if;
  select * into v_draw from public.draws where id = p_draw_id for update;
  if not found then raise exception 'draw_not_found'; end if;
  if v_draw.status not in ('closed','randomness_pending','resolved') then raise exception 'draw_not_closed'; end if;
  insert into public.draw_coordinator_jobs (draw_id, provider, network, idempotency_key, status, algorithm_version, attempt_count, last_attempt_at)
  values (p_draw_id, p_provider, p_network, 'draw:' || p_draw_id::text, 'prepared', v_draw.algorithm_version, 1, now())
  on conflict (draw_id) do update set attempt_count = public.draw_coordinator_jobs.attempt_count + 1,
    last_attempt_at = now(), updated_at = now()
  returning * into v_job;
  if v_job.provider <> p_provider or v_job.network <> p_network then raise exception 'coordinator_provider_substitution'; end if;
  return to_jsonb(v_job) - 'randomness_seed';
end;
$$;

create or replace function public.worldcap_bind_randomness_request(
  p_draw_id uuid, p_provider_request_id text, p_transaction_hash text,
  p_request_block numeric, p_requested_at timestamptz
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_job public.draw_coordinator_jobs%rowtype; v_draw public.draws%rowtype;
begin
  select * into v_job from public.draw_coordinator_jobs where draw_id = p_draw_id for update;
  if not found then raise exception 'coordinator_job_not_found'; end if;
  select * into strict v_draw from public.draws where id = p_draw_id for update;
  if v_job.provider_request_id is not null then
    if v_job.provider_request_id <> p_provider_request_id then raise exception 'randomness_request_immutable'; end if;
    return to_jsonb(v_job) - 'randomness_seed';
  end if;
  if v_draw.status <> 'closed' then raise exception 'draw_not_ready_for_randomness'; end if;
  update public.draw_coordinator_jobs set provider_request_id = p_provider_request_id,
    request_transaction_hash = p_transaction_hash, request_block = p_request_block,
    requested_at = p_requested_at, status = 'request_bound', updated_at = now()
  where id = v_job.id returning * into v_job;
  update public.draws set status = 'randomness_pending', randomness_provider = v_job.provider,
    randomness_request_id = p_provider_request_id where id = p_draw_id;
  return to_jsonb(v_job) - 'randomness_seed';
end;
$$;

create or replace function public.worldcap_fulfill_randomness(
  p_draw_id uuid, p_provider_request_id text, p_seed text,
  p_fulfilled_at timestamptz, p_proof_reference text
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_job public.draw_coordinator_jobs%rowtype;
begin
  if p_seed !~ '^0x[0-9a-fA-F]{64}$' then raise exception 'randomness_seed_invalid'; end if;
  select * into v_job from public.draw_coordinator_jobs where draw_id = p_draw_id for update;
  if not found or v_job.provider_request_id <> p_provider_request_id then raise exception 'randomness_request_binding_mismatch'; end if;
  if v_job.randomness_seed is not null then
    if v_job.randomness_seed <> lower(p_seed) then raise exception 'randomness_fulfillment_immutable'; end if;
    return jsonb_build_object('replayed', true, 'status', v_job.status);
  end if;
  update public.draw_coordinator_jobs set randomness_seed = lower(p_seed), fulfilled_at = p_fulfilled_at,
    proof_reference = p_proof_reference, status = 'fulfilled', updated_at = now()
  where id = v_job.id;
  return jsonb_build_object('replayed', false, 'status', 'fulfilled');
end;
$$;

create or replace function public.worldcap_resolve_draw(p_draw_id uuid, p_provider_request_id text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_job public.draw_coordinator_jobs%rowtype; v_draw public.draws%rowtype;
  v_index numeric(78,0); v_title_id uuid; v_serial text;
begin
  select * into v_job from public.draw_coordinator_jobs where draw_id = p_draw_id for update;
  if not found or v_job.provider_request_id <> p_provider_request_id then raise exception 'randomness_request_binding_mismatch'; end if;
  select * into strict v_draw from public.draws where id = p_draw_id for update;
  if v_draw.status = 'resolved' then
    if v_draw.randomness_seed <> v_job.randomness_seed then raise exception 'resolved_randomness_mismatch'; end if;
    return jsonb_build_object('replayed', true, 'winning_index', v_draw.winning_index::text, 'winning_title_id', v_draw.winning_title_id);
  end if;
  if v_draw.status <> 'randomness_pending' or v_job.status <> 'fulfilled' or v_job.randomness_seed is null then raise exception 'draw_not_resolvable'; end if;
  v_index := public.worldcap_select_winning_index(v_job.randomness_seed, v_draw.eligible_title_count);
  select entry.title_id, entry.serial_snapshot into strict v_title_id, v_serial
    from public.draw_entries entry where entry.draw_id = p_draw_id and entry.manifest_index = v_index;
  update public.draws set status = 'resolved', randomness_seed = v_job.randomness_seed,
    winning_index = v_index, winning_title_id = v_title_id, payout_status = 'PENDING'
    where id = p_draw_id;
  update public.draw_coordinator_jobs set status = 'resolved',
    verification_metadata = jsonb_build_object('algorithm_recomputed_in_database', true, 'winning_index', v_index::text, 'winning_title_id', v_title_id),
    updated_at = now() where id = v_job.id;
  return jsonb_build_object('replayed', false, 'winning_index', v_index::text, 'winning_title_id', v_title_id, 'winning_title', v_serial);
end;
$$;

alter table public.draw_coordinator_jobs enable row level security;
alter table public.operational_events enable row level security;
revoke all on table public.draw_coordinator_jobs, public.operational_events from anon, authenticated;
revoke all on function public.worldcap_uint256(bytea) from public, anon, authenticated;
revoke all on function public.worldcap_select_winning_index(text, numeric) from public, anon, authenticated;
revoke all on function public.worldcap_prepare_randomness(uuid, text, text) from public, anon, authenticated;
revoke all on function public.worldcap_bind_randomness_request(uuid, text, text, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public.worldcap_fulfill_randomness(uuid, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.worldcap_resolve_draw(uuid, text) from public, anon, authenticated;
grant execute on function public.worldcap_prepare_randomness(uuid, text, text) to service_role;
grant execute on function public.worldcap_bind_randomness_request(uuid, text, text, numeric, timestamptz) to service_role;
grant execute on function public.worldcap_fulfill_randomness(uuid, text, text, timestamptz, text) to service_role;
grant execute on function public.worldcap_resolve_draw(uuid, text) to service_role;
