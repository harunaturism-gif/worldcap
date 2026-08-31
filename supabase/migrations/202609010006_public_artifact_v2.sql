-- Upgrade already-applied beta databases so the public artifact content hash
-- covers every ordered manifest entry, not metadata alone.

create or replace function public.worldcap_artifact_content_hash_v2(
  p_draw_id uuid, p_campaign_id uuid, p_scope text, p_closed_at timestamptz,
  p_eligible_count numeric, p_manifest_root text, p_algorithm_version text,
  p_entries jsonb
) returns text language plpgsql immutable strict parallel safe
set search_path = public, pg_temp
as $$
declare v_entry jsonb; v_canonical text;
begin
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) <> p_eligible_count then
    raise exception 'artifact_entries_invalid';
  end if;
  v_canonical := concat_ws('|',
    public.worldcap_length_prefix('worldcap-public-artifact-content-v2'),
    public.worldcap_length_prefix('worldcap-public-draw-v2'),
    public.worldcap_length_prefix(p_algorithm_version),
    public.worldcap_length_prefix(p_draw_id::text),
    public.worldcap_length_prefix(p_campaign_id::text),
    public.worldcap_length_prefix(p_scope),
    public.worldcap_length_prefix(to_char(p_closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    public.worldcap_length_prefix(p_eligible_count::text),
    public.worldcap_length_prefix(p_manifest_root),
    public.worldcap_length_prefix(jsonb_array_length(p_entries)::text)
  );
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_canonical := v_canonical || '|' || concat_ws('|',
      public.worldcap_length_prefix(v_entry->>'index'),
      public.worldcap_length_prefix(v_entry->>'titleId'),
      public.worldcap_length_prefix(v_entry->>'serial'),
      public.worldcap_length_prefix(v_entry->>'tier'),
      public.worldcap_length_prefix(v_entry->>'campaignId')
    );
  end loop;
  return 'sha256:' || encode(digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex');
end
$$;

create or replace function public.worldcap_enforce_artifact_v2()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare v_draw public.draws%rowtype; v_hash text;
begin
  select * into strict v_draw from public.draws where id = new.draw_id;
  v_hash := public.worldcap_artifact_content_hash_v2(
    new.draw_id, v_draw.campaign_id, v_draw.eligibility_scope, new.generated_at,
    new.eligible_count, new.eligibility_commitment, v_draw.algorithm_version,
    new.public_manifest->'entries'
  );
  new.artifact_content_hash := v_hash;
  new.public_manifest := jsonb_set(
    jsonb_set(new.public_manifest, '{schemaVersion}', to_jsonb('worldcap-public-draw-v2'::text), true),
    '{artifactContentHash}', to_jsonb(v_hash), true
  );
  return new;
end
$$;

drop trigger if exists draw_manifest_artifact_v2 on public.draw_manifests;
create trigger draw_manifest_artifact_v2 before insert or update of public_manifest, eligible_count, eligibility_commitment
on public.draw_manifests for each row execute function public.worldcap_enforce_artifact_v2();

update public.draw_manifests set public_manifest = public_manifest
where jsonb_typeof(public_manifest->'entries') = 'array';

create or replace function public.worldcap_close_draw_v2(p_draw_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb; v_manifest public.draw_manifests%rowtype; v_draw public.draws%rowtype;
begin
  v_result := public.worldcap_close_draw(p_draw_id);
  select * into strict v_manifest from public.draw_manifests where draw_id = p_draw_id;
  select * into strict v_draw from public.draws where id = p_draw_id;
  return jsonb_build_object(
    'replayed', coalesce((v_result->>'replayed')::boolean, false),
    'draw_id', p_draw_id, 'status', v_draw.status,
    'eligible_count', v_manifest.eligible_count::text,
    'manifest_root', v_manifest.eligibility_commitment,
    'artifact_content_hash', v_manifest.artifact_content_hash,
    'manifest', v_manifest.public_manifest
  );
end
$$;

revoke all on function public.worldcap_artifact_content_hash_v2(uuid, uuid, text, timestamptz, numeric, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.worldcap_enforce_artifact_v2() from public, anon, authenticated;
revoke all on function public.worldcap_close_draw(uuid) from service_role;
revoke all on function public.worldcap_close_draw_v2(uuid) from public, anon, authenticated;
grant execute on function public.worldcap_close_draw_v2(uuid) to service_role;

comment on function public.worldcap_close_draw_v2(uuid) is
  'Canonical service-role close RPC. Returns a v2 artifact hash covering all ordered entries.';
