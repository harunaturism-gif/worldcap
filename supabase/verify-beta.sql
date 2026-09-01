-- Read-only beta schema gate. Run after migrations through 202609010009.
-- Any failed invariant raises and makes the verification query fail.

do $$
declare
  v_missing text[];
  v_unprotected text[];
  v_browser_mutations text[];
  v_missing_migrations text[];
begin
  select array_agg(required.name order by required.name)
  into v_missing
  from (values
    ('users'), ('campaigns'), ('title_tiers'), ('titles'), ('purchases'),
    ('draws'), ('draw_manifests'), ('draw_coordinator_jobs'),
    ('payment_reconciliation_jobs'), ('cap_campaign_metrics'),
    ('cap_tier_entitlements'), ('title_cap_entitlements'), ('cap_accounts'),
    ('cap_human_claim_epochs'), ('cap_human_claims'), ('cap_locks')
  ) as required(name)
  where to_regclass('public.' || required.name) is null;
  if v_missing is not null then raise exception 'missing_required_tables:%', v_missing; end if;

  select array_agg(tablename order by tablename)
  into v_unprotected
  from pg_tables
  where schemaname = 'public' and not rowsecurity;
  if v_unprotected is not null then raise exception 'rls_disabled:%', v_unprotected; end if;

  select array_agg(distinct routine_name order by routine_name)
  into v_browser_mutations
  from information_schema.routine_privileges
  join pg_proc procedure
    on procedure.proname = routine_name
  join pg_namespace namespace
    on namespace.oid = procedure.pronamespace
   and namespace.nspname = routine_schema
  where routine_schema = 'public'
    and routine_name like 'worldcap_%'
    and procedure.prorettype <> 'trigger'::regtype
    and routine_name not in ('worldcap_select_winning_index')
    and grantee in ('anon', 'authenticated', 'PUBLIC')
    and privilege_type = 'EXECUTE';
  if v_browser_mutations is not null then raise exception 'browser_rpc_execute_grants:%', v_browser_mutations; end if;

  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'migration_history_table_missing';
  end if;

  select array_agg(required.version order by required.version)
  into v_missing_migrations
  from (values
    ('202608300001'), ('202608310001'), ('202608310002'), ('202608310003'),
    ('202609010001'), ('202609010002'), ('202609010003'), ('202609010004'),
    ('202609010005'), ('202609010006'), ('202609010007'), ('202609010008'),
    ('202609010009')
  ) as required(version)
  where not exists (
    select 1 from supabase_migrations.schema_migrations applied
    where applied.version = required.version
  );
  if v_missing_migrations is not null then raise exception 'migration_history_incomplete:%', v_missing_migrations; end if;
end;
$$;

select
  (select count(*) from pg_tables where schemaname = 'public') as public_tables,
  (select count(*) from pg_tables where schemaname = 'public' and rowsecurity) as rls_tables,
  (select count(*) from information_schema.routines where routine_schema = 'public' and routine_name like 'worldcap_%') as worldcap_functions,
  (select max(version) from supabase_migrations.schema_migrations) as latest_migration;
