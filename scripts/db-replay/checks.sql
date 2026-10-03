-- Post-replay assertions. Any failed assertion raises and the harness exits non-zero.
\set ON_ERROR_STOP on
\pset pager off

-- 1. Every RPC the app/api call exists with an execute grant for the right role.
do $$
declare r record; missing text := '';
begin
  for r in select * from (values
    ('claim_founder_slot','service_role'),('release_founder_slot','service_role'),
    ('get_founder_slot_info','authenticated'),('delete_user','authenticated'),
    ('delete_project_data_atomic','authenticated'),('replace_user_data_atomic','authenticated'),
    ('save_scene_if_current','authenticated')) v(fn, role)
  loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname=r.fn
                     and has_function_privilege(r.role, p.oid, 'execute')) then
      missing := missing || r.fn || ' ';
    end if;
  end loop;
  if missing <> '' then raise exception 'CHECK 1 FAILED: missing/ungranted RPCs: %', missing; end if;
  raise notice 'CHECK 1 ok: all 7 app RPCs exist and are granted to the intended role';
end $$;

-- 2. Every table the app/api read or write exists, and every public table has RLS on.
do $$
declare t text; bad text := '';
begin
  foreach t in array array['novels','series_items','characters','factions','locations','timeline_events',
    'world_history','acts','chapters','scenes','lore_entries','idea_entries','maps_data','whiteboards_data',
    'story_schedule','rpg_characters','comic_pages','comic_panels','eras','user_settings','user_profiles',
    'synced_ai_settings','ai_findings','character_interviews','desktop_devices','app_config',
    'email_action_rate_limits','ai_proxy_requests','stripe_processed_events','reengagement_emails',
    'account_lifecycle_events','account_lifecycle_deletions','feedback']
  loop
    if to_regclass('public.'||t) is null then bad := bad || 'missing:'||t||' '; end if;
  end loop;
  select string_agg('no-rls:'||tablename, ' ') into t from pg_tables where schemaname='public' and not rowsecurity;
  if t is not null then bad := bad || t; end if;
  if bad <> '' then raise exception 'CHECK 2 FAILED: %', bad; end if;
  raise notice 'CHECK 2 ok: all app tables exist; RLS enabled on every public table';
end $$;

-- 3. No SECURITY DEFINER function in public is executable by anon/authenticated/PUBLIC.
do $$
declare bad text;
begin
  select string_agg(p.proname, ' ') into bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef
     and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'));
  if bad is not null then raise exception 'CHECK 3 FAILED: definer functions exposed: %', bad; end if;
  raise notice 'CHECK 3 ok: no public SECURITY DEFINER function is callable by anon/authenticated';
end $$;

-- 4. No table has two permissive policies with the same command+roles (Advisor 0006).
do $$
declare bad text;
begin
  select string_agg(tablename||':'||cmd, ' ') into bad from (
    select tablename, cmd, roles::text, count(*) c from pg_policies
     where schemaname='public' and permissive='PERMISSIVE' group by 1,2,3 having count(*)>1) d;
  if bad is not null then raise exception 'CHECK 4 FAILED: duplicate permissive policies: %', bad; end if;
  raise notice 'CHECK 4 ok: no duplicate permissive policies on any public table';
end $$;

-- 5. Two-account global-ID collision attempts against every user-owned table.
--    A owns a row under a chosen id; B (a different authenticated user) must be unable to
--    read, update, delete or insert-over it, and A's row must come out untouched.
create or replace function pg_temp.fill(tbl text, uid uuid, marker text) returns text language plpgsql as $f$
declare cols text := ''; vals text := ''; c record;
begin
  for c in select column_name, data_type, column_default from information_schema.columns
            where table_schema='public' and table_name=tbl and is_nullable='NO' order by ordinal_position loop
    if c.column_default is not null and c.column_name not in ('id','data','user_id') then continue; end if;
    cols := cols || quote_ident(c.column_name) || ',';
    vals := vals || case
      when c.column_name='user_id' and c.data_type='uuid' then quote_literal(uid)||'::uuid'
      when c.column_name='user_id' then quote_literal(uid::text)
      when c.data_type='jsonb' then quote_literal('{"owner":"'||marker||'"}')||'::jsonb'
      when c.data_type in ('integer','bigint','numeric') then '0'
      when c.data_type='boolean' then 'false'
      when c.data_type like 'timestamp%' then 'now()'
      when c.data_type='uuid' and c.column_name='id' then quote_literal(md5(tbl)::uuid)||'::uuid'
      when c.data_type='uuid' then quote_literal(gen_random_uuid())||'::uuid'
      when c.column_name='tool_type' then quote_literal('plot_hole')
      else quote_literal('collide-'||tbl) end || ',';
  end loop;
  return format('insert into public.%I (%s) values (%s)', tbl, rtrim(cols,','), rtrim(vals,','));
end $f$;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  t text; idcol text; n int; tested int := 0; skipped text := ''; ins text;
  ins_a text; ins_b text; ins_spoof text; has_data boolean; own_sql text;
begin
  insert into auth.users(id,email) values (a,'a@example.test'),(b,'b@example.test');
  for t, idcol in
    select c.table_name, case when exists (select 1 from information_schema.columns k where k.table_schema='public'
                 and k.table_name=c.table_name and k.column_name='scene_id') then 'scene_id' else 'id' end
      from information_schema.columns c join pg_tables pt on pt.tablename=c.table_name and pt.schemaname='public'
     where c.table_schema='public' and c.column_name='user_id'
       and c.table_name in ('novels','series_items','characters','factions','locations','timeline_events',
         'world_history','acts','chapters','scenes','lore_entries','idea_entries','maps_data','whiteboards_data',
         'story_schedule','rpg_characters','comic_pages','comic_panels','eras','character_interviews','ai_findings')
     order by 1
  loop
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=idcol) then
      skipped := skipped || t || ' '; continue;
    end if;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='data') into has_data;
    own_sql := case when has_data then 'data = ''{"owner":"B"}''::jsonb' else format('%I = %I', idcol, idcol) end;
    -- build the statements as the superuser: the test roles cannot see pg_temp
    ins_a := pg_temp.fill(t, a, 'A');
    ins_b := pg_temp.fill(t, b, 'B');
    ins_spoof := replace(pg_temp.fill(t, a, 'B-spoof'), 'collide-'||t, 'spoof-'||t);
    -- A inserts under its own identity
    perform set_config('request.jwt.claim.sub', a::text, true);
    set local role authenticated;
    begin
      execute ins_a;
    exception when others then
      reset role; skipped := skipped || t || '(A-insert:'||sqlerrm||') '; continue;
    end;
    execute format('select count(*) from public.%I', t) into n;
    if n <> 1 then raise exception 'CHECK 5 FAILED: % A cannot see its own row (%)', t, n; end if;
    -- B tries every path against A's id
    reset role; perform set_config('request.jwt.claim.sub', b::text, true); set local role authenticated;
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'CHECK 5 FAILED: % B can read A rows (%)', t, n; end if;
    execute format('update public.%I set %s', t, own_sql); get diagnostics n = row_count;
    if n <> 0 then raise exception 'CHECK 5 FAILED: % B updated A rows (%)', t, n; end if;
    execute format('delete from public.%I', t); get diagnostics n = row_count;
    if n <> 0 then raise exception 'CHECK 5 FAILED: % B deleted A rows (%)', t, n; end if;
    begin
      execute ins_b;   -- same id, B's own user_id: PK clash or RLS must refuse
      raise exception 'CHECK 5 FAILED: % B inserted over/alongside A id', t;
    exception when unique_violation or insufficient_privilege or check_violation then null;
    end;
    -- B spoofing A's user_id must be refused
    begin
      execute ins_spoof;
      raise exception 'CHECK 5 FAILED: % B inserted a row owned by A', t;
    exception when unique_violation or insufficient_privilege or check_violation then null;
    end;
    -- A's row is intact
    reset role; perform set_config('request.jwt.claim.sub', a::text, true);
    execute format('select count(*) from public.%I where %s', t, case when has_data then 'data->>''owner'' = ''A''' else 'true' end) into n;
    if n <> 1 then raise exception 'CHECK 5 FAILED: % A row was altered (%)', t, n; end if;
    execute format('delete from public.%I', t);
    tested := tested + 1;
  end loop;
  reset role;
  if tested < 21 then raise exception 'CHECK 5 FAILED: only % tables exercised (skipped: %)', tested, skipped; end if;
  raise notice 'CHECK 5 ok: A/B collision attempts refused on % tables (skipped: %)', tested, coalesce(nullif(skipped,''),'none');
  delete from auth.users where id in (a,b);
end $$;

-- 6. Deleting a project removes every scene row for it (and not another project's).
do $$
declare a uuid := gen_random_uuid(); n int;
begin
  insert into auth.users(id,email) values (a,'del@example.test');
  insert into public.novels(id,user_id,data) values ('nv-del',a,'{}'),('nv-keep',a,'{}');
  insert into public.scenes(scene_id,user_id,novel_id,data) values
    ('s1',a::text,'nv-del','{}'),('s2',a::text,'nv-del','{}'),('s3',a::text,'nv-keep','{}');
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  perform public.delete_project_data_atomic('nv-del');
  reset role;
  select count(*) into n from public.scenes where novel_id='nv-del';
  if n <> 0 then raise exception 'CHECK 6 FAILED: % scene rows remain after project delete', n; end if;
  select count(*) into n from public.scenes where novel_id='nv-keep';
  if n <> 1 then raise exception 'CHECK 6 FAILED: another project''s scene was removed'; end if;
  raise notice 'CHECK 6 ok: project delete leaves zero scene rows for it and keeps the other project';
  delete from auth.users where id = a;
end $$;

-- 7. Scene revision guard (save_scene_if_current): stale writes are refused; a foreign id cannot be overwritten.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); r jsonb;
begin
  insert into auth.users(id,email) values (a,'r1@example.test'),(b,'r2@example.test');
  perform set_config('request.jwt.claim.sub', a::text, true); set local role authenticated;
  r := public.save_scene_if_current('rev-1','nv','{"v":1}',0);
  if not (r->>'saved')::bool or (r->>'revision')::int <> 1 then raise exception 'CHECK 7 FAILED: first save %', r; end if;
  r := public.save_scene_if_current('rev-1','nv','{"v":2}',1);
  if not (r->>'saved')::bool or (r->>'revision')::int <> 2 then raise exception 'CHECK 7 FAILED: second save %', r; end if;
  r := public.save_scene_if_current('rev-1','nv','{"v":"stale"}',1);
  if (r->>'saved')::bool or r->>'reason' <> 'stale' or (r->'data'->>'v') <> '2' then raise exception 'CHECK 7 FAILED: stale write accepted %', r; end if;
  reset role; perform set_config('request.jwt.claim.sub', b::text, true); set local role authenticated;
  begin
    r := public.save_scene_if_current('rev-1','nv','{"v":"B"}',0);
    raise exception 'CHECK 7 FAILED: B overwrote or shadowed A scene id: %', r;
  exception when unique_violation then null; end;
  reset role;
  if (select data->>'v' from public.scenes where scene_id='rev-1') <> '2' then raise exception 'CHECK 7 FAILED: A scene altered'; end if;
  raise notice 'CHECK 7 ok: revision guard refuses stale writes and foreign-id overwrite';
  delete from public.scenes where scene_id='rev-1'; delete from auth.users where id in (a,b);
end $$;
