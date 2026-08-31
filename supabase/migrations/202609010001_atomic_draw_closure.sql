-- Closed beta: one-transaction, retry-safe draw eligibility closure.
-- Requires 202608310003_phase3_trust_foundation.sql.

create extension if not exists pgcrypto;

alter table public.draw_manifests add column if not exists artifact_content_hash text
  check (artifact_content_hash is null or artifact_content_hash ~ '^sha256:[0-9a-f]{64}$');
alter table public.draw_manifests add column if not exists publication_status text not null default 'pending'
  check (publication_status in ('pending','published','failed'));
alter table public.draw_manifests add column if not exists publication_uri text;

create or replace function public.worldcap_length_prefix(p_value text)
returns text language sql immutable strict parallel safe
as $$ select octet_length(convert_to(p_value, 'UTF8'))::text || ':' || p_value $$;

create or replace function public.worldcap_manifest_root(p_draw_id uuid, p_entries jsonb)
returns text language plpgsql immutable strict
set search_path = public, pg_temp
as $$
declare
  v_entry jsonb;
  v_level bytea[] := array[]::bytea[];
  v_next bytea[];
  v_index integer;
  v_right bytea;
  v_canonical text;
begin
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'manifest_must_not_be_empty';
  end if;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_canonical := concat_ws('|',
      public.worldcap_length_prefix('worldcap-manifest-leaf-v1'),
      public.worldcap_length_prefix(p_draw_id::text),
      public.worldcap_length_prefix(v_entry->>'index'),
      public.worldcap_length_prefix(v_entry->>'titleId'),
      public.worldcap_length_prefix(v_entry->>'serial'),
      public.worldcap_length_prefix(v_entry->>'tier'),
      public.worldcap_length_prefix(v_entry->>'campaignId')
    );
    v_level := array_append(v_level, digest(convert_to(v_canonical, 'UTF8'), 'sha256'));
  end loop;
  while array_length(v_level, 1) > 1 loop
    v_next := array[]::bytea[];
    v_index := 1;
    while v_index <= array_length(v_level, 1) loop
      v_right := coalesce(v_level[v_index + 1], v_level[v_index]);
      v_next := array_append(v_next, digest(decode('01', 'hex') || v_level[v_index] || v_right, 'sha256'));
      v_index := v_index + 2;
    end loop;
    v_level := v_next;
  end loop;
  return 'sha256:' || encode(v_level[1], 'hex');
end;
$$;

create or replace function public.worldcap_artifact_content_hash(
  p_draw_id uuid, p_campaign_id uuid, p_scope text, p_closed_at timestamptz,
  p_eligible_count numeric, p_manifest_root text, p_algorithm_version text
) returns text language sql immutable strict parallel safe
set search_path = public, pg_temp
as $$
  select 'sha256:' || encode(digest(convert_to(concat_ws('|',
    public.worldcap_length_prefix('worldcap-public-draw-v1'),
    public.worldcap_length_prefix(p_algorithm_version),
    public.worldcap_length_prefix(p_draw_id::text),
    public.worldcap_length_prefix(p_campaign_id::text),
    public.worldcap_length_prefix(p_scope),
    public.worldcap_length_prefix(to_char(p_closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    public.worldcap_length_prefix(p_eligible_count::text),
    public.worldcap_length_prefix(p_manifest_root)
  ), 'UTF8'), 'sha256'), 'hex')
$$;

create or replace function public.worldcap_close_draw(p_draw_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_draw public.draws%rowtype;
  v_manifest public.draw_manifests%rowtype;
  v_entries jsonb;
  v_count numeric(78,0);
  v_root text;
  v_closed_at timestamptz := statement_timestamp();
  v_content_hash text;
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

  -- Purchase issuance locks the same campaign row before inserting titles. Once
  -- this lock is acquired, every pre-cutoff issuance is visible to this snapshot.
  perform 1 from public.campaigns where id = v_draw.campaign_id for update;
  perform 1 from public.title_tiers
    where campaign_id = v_draw.campaign_id and code in (select jsonb_array_elements_text(v_draw.allowed_tier_codes))
    order by code for share;

  delete from public.draw_entries where draw_id = p_draw_id;
  insert into public.draw_entries (draw_id, title_id, ownership_id, manifest_index, serial_snapshot, tier_code_snapshot)
  select p_draw_id, candidate.title_id, candidate.ownership_id,
    row_number() over (order by candidate.serial collate "C", candidate.title_id) - 1,
    candidate.serial, upper(candidate.tier_code)
  from (
    select t.id as title_id, ownership.id as ownership_id, t.serial, tier.code as tier_code
    from public.titles t
    join public.title_tiers tier on tier.id = t.tier_id and tier.campaign_id = t.campaign_id
    join public.title_ownership ownership on ownership.title_id = t.id
    where t.campaign_id = v_draw.campaign_id
      and t.issued_at <= v_draw.closes_at
      and ownership.draw_eligible = true
      and tier.code in (select jsonb_array_elements_text(v_draw.allowed_tier_codes))
      and (v_draw.eligibility_scope = 'GLOBAL' or upper(tier.code) = v_draw.eligibility_scope)
  ) candidate;

  select count(*)::numeric into v_count from public.draw_entries where draw_id = p_draw_id;
  if v_count = 0 then raise exception 'draw_has_no_eligible_titles'; end if;

  select jsonb_agg(jsonb_build_object(
    'index', entry.manifest_index::text,
    'titleId', entry.title_id::text,
    'serial', entry.serial_snapshot,
    'tier', entry.tier_code_snapshot,
    'campaignId', v_draw.campaign_id::text
  ) order by entry.manifest_index) into v_entries
  from public.draw_entries entry where entry.draw_id = p_draw_id;

  v_root := public.worldcap_manifest_root(p_draw_id, v_entries);
  v_content_hash := public.worldcap_artifact_content_hash(
    p_draw_id, v_draw.campaign_id, v_draw.eligibility_scope, v_closed_at,
    v_count, v_root, v_draw.algorithm_version
  );

  insert into public.draw_manifests (
    draw_id, manifest_version, eligible_count, eligibility_commitment,
    artifact_content_hash, public_manifest, generated_at, publication_status
  ) values (
    p_draw_id, v_draw.manifest_version, v_count, v_root, v_content_hash,
    jsonb_build_object(
      'schemaVersion', 'worldcap-public-draw-v1', 'algorithmVersion', v_draw.algorithm_version,
      'drawId', p_draw_id::text, 'campaignId', v_draw.campaign_id::text,
      'scope', v_draw.eligibility_scope,
      'closedAt', to_char(v_closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'eligibleCount', v_count::text, 'manifestRoot', v_root,
      'artifactContentHash', v_content_hash, 'entries', v_entries
    ), v_closed_at, 'pending'
  ) returning * into v_manifest;

  update public.draws set
    status = 'closed', eligible_title_count = v_count,
    eligibility_commitment = v_root, finalized_at = v_closed_at
  where id = p_draw_id and status = 'open';
  if not found then raise exception 'stale_draw_state'; end if;

  return jsonb_build_object('replayed', false, 'draw_id', p_draw_id, 'status', 'closed',
    'eligible_count', v_count::text, 'manifest_root', v_root,
    'artifact_content_hash', v_content_hash, 'manifest', v_manifest.public_manifest);
end;
$$;

revoke all on function public.worldcap_length_prefix(text) from public, anon, authenticated;
revoke all on function public.worldcap_manifest_root(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.worldcap_artifact_content_hash(uuid, uuid, text, timestamptz, numeric, text, text) from public, anon, authenticated;
revoke all on function public.worldcap_close_draw(uuid) from public, anon, authenticated;
grant execute on function public.worldcap_close_draw(uuid) to service_role;

comment on function public.worldcap_close_draw(uuid) is
  'Atomically freezes a campaign draw. Service-role only; safe to retry after closure.';
