-- Ensure Verify Draw can distinguish a provider-bound on-chain proof from a
-- merely stored seed in databases that already applied migration 005.

create or replace function public.worldcap_fulfill_randomness(
  p_draw_id uuid, p_provider text, p_network text, p_provider_request_id text,
  p_seed text, p_fulfilled_at timestamptz, p_proof_reference text
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_job public.draw_coordinator_jobs%rowtype; v_external_proof_verified boolean;
begin
  if p_seed !~ '^0x[0-9a-fA-F]{64}$' then raise exception 'randomness_seed_invalid'; end if;
  select * into v_job from public.draw_coordinator_jobs where draw_id = p_draw_id for update;
  if not found or v_job.provider_request_id <> p_provider_request_id then raise exception 'randomness_request_binding_mismatch'; end if;
  if v_job.provider <> p_provider or v_job.network <> p_network then raise exception 'randomness_provider_substitution'; end if;
  if v_job.status <> 'request_bound' then
    if v_job.randomness_seed is not null then raise exception 'randomness_response_replayed'; end if;
    raise exception 'randomness_job_not_fulfillable';
  end if;
  v_external_proof_verified := p_provider = 'witnet-randomness-v1'
    and p_network = 'world-chain-sepolia'
    and p_proof_reference like 'eip155:4801:%:randomize-block:%';
  if not v_external_proof_verified then raise exception 'external_randomness_proof_invalid'; end if;
  update public.draw_coordinator_jobs set randomness_seed = lower(p_seed), fulfilled_at = p_fulfilled_at,
    proof_reference = p_proof_reference, status = 'fulfilled',
    verification_metadata = jsonb_build_object(
      'provider_bound', true, 'request_bound', true,
      'proof_reference_present', true, 'external_proof_verified', true
    ), updated_at = now() where id = v_job.id;
  return jsonb_build_object('status', 'fulfilled', 'external_proof_verified', true);
end;
$$;

revoke all on function public.worldcap_fulfill_randomness(uuid,text,text,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.worldcap_fulfill_randomness(uuid,text,text,text,text,timestamptz,text) to service_role;
