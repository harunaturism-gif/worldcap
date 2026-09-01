-- Preserve and require external randomness verification evidence during resolution.
--
-- Migration 202609010007 marks a fulfilled Witnet response as externally verified.
-- The earlier resolver replaced verification_metadata entirely, causing the proof
-- bit to disappear after resolution. This replacement preserves the proof metadata
-- and fails closed both on first resolution and replay.

create or replace function public.worldcap_resolve_draw(p_draw_id uuid, p_provider_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.draw_coordinator_jobs%rowtype;
  v_draw public.draws%rowtype;
  v_index numeric(78,0);
  v_title_id uuid;
  v_serial text;
  v_external_proof_verified boolean;
begin
  select * into v_job
  from public.draw_coordinator_jobs
  where draw_id = p_draw_id
  for update;

  if not found or v_job.provider_request_id <> p_provider_request_id then
    raise exception 'randomness_request_binding_mismatch';
  end if;

  v_external_proof_verified :=
    coalesce(v_job.verification_metadata->>'external_proof_verified', 'false') = 'true';

  if not v_external_proof_verified then
    raise exception 'external_randomness_proof_not_verified';
  end if;

  select * into strict v_draw
  from public.draws
  where id = p_draw_id
  for update;

  if v_draw.status = 'resolved' then
    if v_job.status <> 'resolved'
      or v_job.randomness_seed is null
      or v_draw.randomness_seed is distinct from v_job.randomness_seed then
      raise exception 'resolved_randomness_mismatch';
    end if;

    return jsonb_build_object(
      'replayed', true,
      'winning_index', v_draw.winning_index::text,
      'winning_title_id', v_draw.winning_title_id
    );
  end if;

  if v_draw.status <> 'randomness_pending'
    or v_job.status <> 'fulfilled'
    or v_job.randomness_seed is null then
    raise exception 'draw_not_resolvable';
  end if;

  v_index := public.worldcap_select_winning_index(
    v_job.randomness_seed,
    v_draw.eligible_title_count
  );

  select entry.title_id, entry.serial_snapshot
  into strict v_title_id, v_serial
  from public.draw_entries entry
  where entry.draw_id = p_draw_id
    and entry.manifest_index = v_index;

  update public.draws
  set status = 'resolved',
      randomness_seed = v_job.randomness_seed,
      winning_index = v_index,
      winning_title_id = v_title_id,
      payout_status = 'PENDING'
  where id = p_draw_id;

  update public.draw_coordinator_jobs
  set status = 'resolved',
      verification_metadata =
        coalesce(v_job.verification_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'algorithm_recomputed_in_database', true,
          'winning_index', v_index::text,
          'winning_title_id', v_title_id
        ),
      updated_at = now()
  where id = v_job.id;

  return jsonb_build_object(
    'replayed', false,
    'winning_index', v_index::text,
    'winning_title_id', v_title_id,
    'winning_title', v_serial
  );
end;
$$;

revoke all on function public.worldcap_resolve_draw(uuid,text)
from public, anon, authenticated;

grant execute on function public.worldcap_resolve_draw(uuid,text)
to service_role;
