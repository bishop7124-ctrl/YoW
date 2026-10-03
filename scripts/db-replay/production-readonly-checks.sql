-- READ-ONLY production database continuity check (3 Oct 2026). SELECT only: changes nothing.
-- Paste the whole file into Supabase -> SQL Editor -> Run. It returns ONE table, one row per check.
-- Every row in the "result" column should say OK. Anything else is a finding to send back.
-- The same file also runs against the local clean-replay database, so the two can be compared.
with
expected_rpcs(fn, role) as (values
  ('claim_founder_slot','service_role'),('release_founder_slot','service_role'),
  ('get_founder_slot_info','authenticated'),('delete_user','authenticated'),
  ('delete_project_data_atomic','authenticated'),('replace_user_data_atomic','authenticated'),
  ('save_scene_if_current','authenticated'),
  ('merge_records','authenticated'),('merge_record_json','authenticated')),
rpc_problems as (
  select e.fn from expected_rpcs e
  where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = e.fn
                      and has_function_privilege(e.role, p.oid, 'execute'))
),
known_fns(fn) as (values
  ('claim_founder_slot'),('release_founder_slot'),('get_founder_slot_info'),('delete_user'),
  ('delete_project_data_atomic'),('replace_user_data_atomic'),('save_scene_if_current'),
  ('merge_records'),('merge_record_json'),
  ('handle_new_user'),('handle_user_media_storage_change'),('set_updated_at'),('trigger_welcome_email')),
unknown_fns as (
  -- functions that exist in production but are NOT created by any committed migration
  select n.nspname || '.' || p.proname as fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private')
    and p.proname not in (select fn from known_fns)
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
definer_exposed as (
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
),
no_rls as (select tablename from pg_tables where schemaname = 'public' and not rowsecurity),
dup_policies as (
  select tablename || ':' || cmd as k from pg_policies
  where schemaname = 'public' and permissive = 'PERMISSIVE'
  group by tablename, cmd, roles::text having count(*) > 1
),
scene_orphans as (
  select count(*) c from public.scenes s
  where not exists (select 1 from public.novels n where n.id = s.novel_id and n.user_id::text = s.user_id)
),
scene_no_owner as (
  select count(*) c from public.scenes s where not exists (select 1 from auth.users u where u.id::text = s.user_id)
)
select '1. scenes.revision column exists' as check_name,
       case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='scenes' and column_name='revision')
            then 'OK' else 'PROBLEM: revision migration not applied' end as result, '' as detail
union all
select '2. every app RPC exists and is granted to the right role',
       case when not exists (select 1 from rpc_problems) then 'OK' else 'PROBLEM' end,
       coalesce((select string_agg(fn, ', ') from rpc_problems), '')
union all
select '3. no production function is missing from the migrations',
       case when not exists (select 1 from unknown_fns) then 'OK' else 'FINDING: function not in repo' end,
       coalesce((select string_agg(fn, ', ') from unknown_fns), '')
union all
select '4. no SECURITY DEFINER function callable by anon/authenticated',
       case when not exists (select 1 from definer_exposed) then 'OK' else 'PROBLEM' end,
       coalesce((select string_agg(proname, ', ') from definer_exposed), '')
union all
select '5. row-level security on for every public table',
       case when not exists (select 1 from no_rls) then 'OK' else 'PROBLEM' end,
       coalesce((select string_agg(tablename, ', ') from no_rls), '')
union all
select '6. no duplicate permissive policies (Security Advisor)',
       case when not exists (select 1 from dup_policies) then 'OK' else 'PROBLEM: run the dedupe migration' end,
       coalesce((select string_agg(k, ', ') from dup_policies), '')
union all
select '7. scene rows whose project no longer exists (expect 0)',
       case when (select c from scene_orphans) = 0 then 'OK' else 'FINDING: ' || (select c from scene_orphans) || ' orphaned scene rows' end, ''
union all
select '8. scene rows whose owner account no longer exists (expect 0)',
       case when (select c from scene_no_owner) = 0 then 'OK' else 'FINDING: ' || (select c from scene_no_owner) || ' ownerless scene rows' end, ''
union all
select '9. migration history rows recorded (information only)',
       'INFO',
       case when to_regclass('supabase_migrations.schema_migrations') is null then 'history table not present'
            else (xpath('/row/c/text()', query_to_xml('select count(*) as c from supabase_migrations.schema_migrations', false, true, '')))[1]::text || ' rows' end
order by 1;
