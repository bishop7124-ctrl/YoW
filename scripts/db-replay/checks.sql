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
    ('save_scene_if_current','authenticated'),
    ('merge_records','authenticated'),('merge_record_json','authenticated')) v(fn, role)
  loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname=r.fn
                     and has_function_privilege(r.role, p.oid, 'execute')) then
      missing := missing || r.fn || ' ';
    end if;
  end loop;
  if missing <> '' then raise exception 'CHECK 1 FAILED: missing/ungranted RPCs: %', missing; end if;
  raise notice 'CHECK 1 ok: all 9 app RPCs exist and are granted to the intended role';
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
  delete from public.scenes where user_id = a::text; -- scenes have no FK to auth.users: clean up the fixture
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

-- 8. Conflict-safe record saves (merge_records): the two-browser scenario found by the owner's live test.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  base jsonb := '{"id":"c1","name":"Ann","bio":"old","notes":"keep","novelId":"n1"}';
  r jsonb; got jsonb; t text; n int := 0;
begin
  insert into auth.users(id,email) values (a,'m1@example.test'),(b,'m2@example.test');
  perform set_config('request.jwt.claim.sub', a::text, true); set local role authenticated;

  -- browser 1 creates the record
  r := public.merge_records('characters', jsonb_build_array(jsonb_build_object('id','c1','novel_id','n1','base',null,'mine',base)));
  if r->0->'merged' is distinct from base then raise exception 'CHECK 8 FAILED: insert %', r; end if;

  -- browser 1 changes only "name"; browser 2 (stale, base = original) changes only "bio" afterwards.
  r := public.merge_records('characters', jsonb_build_array(jsonb_build_object('id','c1','novel_id','n1','base',base,
        'mine', base || '{"name":"Ann B1"}')));
  r := public.merge_records('characters', jsonb_build_array(jsonb_build_object('id','c1','novel_id','n1','base',base,
        'mine', base || '{"bio":"new bio B2"}')));
  got := r->0->'merged';
  if got->>'name' <> 'Ann B1' or got->>'bio' <> 'new bio B2' or got->>'notes' <> 'keep' then
    raise exception 'CHECK 8 FAILED: different-field edits from two browsers were not both kept: %', got;
  end if;
  if jsonb_array_length(r->0->'conflicts') <> 0 then raise exception 'CHECK 8 FAILED: false conflict %', r; end if;
  if (select data from public.characters where id='c1') is distinct from got then
    raise exception 'CHECK 8 FAILED: stored row is not the merged row'; end if;

  -- same field edited by both: caller's value wins, the other side is returned for review, not lost
  r := public.merge_records('characters', jsonb_build_array(jsonb_build_object('id','c1','novel_id','n1','base',base,
        'mine', base || '{"name":"Ann B2"}')));
  if r->0->'merged'->>'name' <> 'Ann B2' then raise exception 'CHECK 8 FAILED: conflict winner %', r; end if;
  if r->0->'conflicts'->0->>'field' <> 'name' or r->0->'conflicts'->0->>'theirs' <> 'Ann B1'
     or r->0->'theirs'->>'name' <> 'Ann B1' then
    raise exception 'CHECK 8 FAILED: the other browser''s value was not returned: %', r; end if;

  -- a field removed by one browser stays removed, and an unrelated edit by the other is kept
  r := public.merge_records('characters', jsonb_build_array(jsonb_build_object('id','c1','novel_id','n1',
        'base', (select data from public.characters where id='c1'),
        'mine', (select data - 'notes' from public.characters where id='c1'))));
  if r->0->'merged' ? 'notes' then raise exception 'CHECK 8 FAILED: removed field reappeared'; end if;

  -- another account cannot merge into, overwrite or read this record
  reset role; perform set_config('request.jwt.claim.sub', b::text, true); set local role authenticated;
  begin
    perform public.merge_records('characters', jsonb_build_array(jsonb_build_object('id','c1','novel_id','n1','base',base,'mine','{"name":"B steals"}'::jsonb)));
    raise exception 'CHECK 8 FAILED: account B merged into account A record';
  exception when unique_violation then null; end;
  reset role;
  if (select data->>'name' from public.characters where id='c1') = 'B steals' then raise exception 'CHECK 8 FAILED: A record altered by B'; end if;

  -- guard rails
  set local role authenticated; perform set_config('request.jwt.claim.sub', a::text, true);
  begin perform public.merge_records('auth.users', '[]'); raise exception 'CHECK 8 FAILED: arbitrary table accepted';
  exception when raise_exception then if sqlerrm like 'CHECK 8%' then raise; end if; end;
  begin perform public.merge_records('scenes', '[]'); raise exception 'CHECK 8 FAILED: scenes (own guard) accepted';
  exception when raise_exception then if sqlerrm like 'CHECK 8%' then raise; end if; end;

  -- every supported table accepts a first save and a merge through the same function
  foreach t in array array['novels','series_items','characters','factions','locations','timeline_events',
    'world_history','acts','chapters','lore_entries','idea_entries','maps_data','whiteboards_data',
    'story_schedule','rpg_characters','comic_pages','comic_panels','eras'] loop
    r := public.merge_records(t, jsonb_build_array(jsonb_build_object('id','m-'||t,'novel_id','n1','base',null,'mine','{"name":"x"}'::jsonb)));
    r := public.merge_records(t, jsonb_build_array(jsonb_build_object('id','m-'||t,'novel_id','n1','base','{"name":"x"}'::jsonb,'mine','{"name":"y"}'::jsonb)));
    if r->0->'merged'->>'name' <> 'y' then raise exception 'CHECK 8 FAILED: % merge %', t, r; end if;
    n := n + 1;
  end loop;
  reset role;
  raise notice 'CHECK 8 ok: two-browser edits to different fields both survive; same-field conflict returns the other side; removal, ownership, table guard and all % tables verified', n;
  delete from auth.users where id in (a,b);
end $$;

-- 9. Entitlement negative matrix (database paths): a signed-in Free user cannot write plan/status/
--    Founder/Lifetime/Stripe/lifecycle/billing state through the API roles. Entitlements live in
--    server-controlled auth app metadata and the service-only tables below; the browser role must
--    have no write policy on any of them and no write must land when attempted.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  t text; bad text := ''; n int := 0; rows int;
begin
  insert into auth.users(id,email) values (a,'e1@example.test'),(b,'e2@example.test');
  insert into public.user_profiles(user_id,is_founder,storage_add_on_bytes) values (a,false,0),(b,false,0) on conflict (user_id) do nothing;

  -- (a) no INSERT/UPDATE/DELETE/ALL policy for anon/authenticated/public on any service-only table
  foreach t in array array['user_profiles','app_config','stripe_processed_events','account_lifecycle_events',
      'account_lifecycle_deletions','reengagement_emails','email_action_rate_limits','ai_proxy_requests']
  loop
    perform 1 from pg_policies p where p.schemaname='public' and p.tablename=t
      and p.cmd in ('INSERT','UPDATE','DELETE','ALL')
      and (p.roles && array['anon','authenticated','public']::name[]);
    if found then bad := bad || 'writable-policy:'||t||' '; end if;
    n := n + 1;
  end loop;
  if bad <> '' then raise exception 'CHECK 9 FAILED: %', bad; end if;

  -- (b) behavioural: as Free user A, every write path must be refused or touch zero rows
  perform set_config('request.jwt.claim.sub', a::text, true); set local role authenticated;
  update public.user_profiles set is_founder = true, storage_add_on_bytes = 99999999999 where user_id = a;
  get diagnostics rows = row_count;
  if rows <> 0 then raise exception 'CHECK 9 FAILED: Free user updated own user_profiles (is_founder/add-on)'; end if;
  update public.user_profiles set is_founder = true where user_id = b;
  get diagnostics rows = row_count;
  if rows <> 0 then raise exception 'CHECK 9 FAILED: user updated ANOTHER user''s profile'; end if;
  begin
    insert into public.user_profiles(user_id,is_founder) values (gen_random_uuid(),true);
    raise exception 'CHECK 9 FAILED: user inserted a Founder profile row';
  exception when insufficient_privilege or others then
    if sqlerrm like 'CHECK 9 FAILED%' then raise; end if;
  end;
  delete from public.user_profiles where user_id = a;
  get diagnostics rows = row_count;
  if rows <> 0 then raise exception 'CHECK 9 FAILED: user deleted own profile row'; end if;
  update public.app_config set value = '{"total":100000}'::jsonb;
  get diagnostics rows = row_count;
  if rows <> 0 then raise exception 'CHECK 9 FAILED: user changed app_config (Founder slot limit)'; end if;
  reset role;
  if (select is_founder or storage_add_on_bytes <> 0 from public.user_profiles where user_id = a) then
    raise exception 'CHECK 9 FAILED: profile changed by the browser role'; end if;
  -- anon (signed-out, no JWT subject) cannot read or write them either
  perform set_config('request.jwt.claim.sub', '', true); set local role anon;
  update public.user_profiles set is_founder = true; get diagnostics rows = row_count;
  if rows <> 0 then raise exception 'CHECK 9 FAILED: anon updated user_profiles'; end if;
  if (select count(*) from public.user_profiles) <> 0 then raise exception 'CHECK 9 FAILED: anon can read profiles'; end if;
  reset role;
  raise notice 'CHECK 9 ok: Free/anon users cannot write plan, Founder, add-on, Stripe, lifecycle, billing or rate-limit state (% service-only tables, no write policies)', n;
  delete from auth.users where id in (a,b);
end $$;

-- 10. Server-side media limits that do not depend on the UI: MIME allow-list, per-file size,
--     plan quota (Free 250 MB, paid 8 GB, Beta 15 GB, expired Beta back to 250 MB), the
--     per-user serialisation lock, shrinking/deleting always allowed, other users unaffected.
do $$
declare
  free_u uuid := gen_random_uuid(); lt uuid := gen_random_uuid(); bt uuid := gen_random_uuid();
  bx uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  mb constant bigint := 1024*1024; gb constant bigint := 1024*1024*1024;
begin
  insert into auth.users(id,email,created_at,raw_app_meta_data) values
    (free_u,'q1@example.test', now() - interval '90 days', '{}'),
    (lt,'q2@example.test', now() - interval '90 days', '{"subscription_plan":"premium_plus_lifetime","subscription_status":"active"}'),
    (bt,'q3@example.test', now() - interval '90 days', '{"subscription_plan":"beta_tester"}'),
    (bx,'q4@example.test', now() - interval '90 days', jsonb_build_object('subscription_plan','beta_tester','beta_notice_started_at',(now() - interval '31 days')::text)),
    (other,'q5@example.test', now() - interval '90 days', '{}');

  if public.user_media_plan_cap_bytes(free_u) <> 250*mb then raise exception 'CHECK 10 FAILED: free cap %', public.user_media_plan_cap_bytes(free_u); end if;
  if public.user_media_plan_cap_bytes(lt) <> 8*gb then raise exception 'CHECK 10 FAILED: lifetime cap'; end if;
  if public.user_media_plan_cap_bytes(bt) <> 15*gb then raise exception 'CHECK 10 FAILED: beta cap'; end if;
  if public.user_media_plan_cap_bytes(bx) <> 250*mb then raise exception 'CHECK 10 FAILED: expired beta must fall back to Free'; end if;
  -- a browser-editable user_metadata value must never raise the cap
  update auth.users set raw_user_meta_data = '{"subscription_plan":"founder","beta_tester":true}' where id = free_u;
  if public.user_media_plan_cap_bytes(free_u) <> 250*mb then raise exception 'CHECK 10 FAILED: user_metadata raised the cap'; end if;

  perform set_config('request.jwt.claim.sub', free_u::text, true); set local role authenticated;

  -- allowed: small webp
  insert into storage.objects(bucket_id,name,owner,metadata) values ('user-media', free_u||'/c/ok1.webp', free_u, jsonb_build_object('size', 14*mb, 'mimetype','image/webp'));
  -- MIME bypass
  begin
    insert into storage.objects(bucket_id,name,owner,metadata) values ('user-media', free_u||'/c/x.html', free_u, jsonb_build_object('size',100,'mimetype','text/html'));
    raise exception 'CHECK 10 FAILED: html upload accepted';
  exception when others then if sqlerrm like 'CHECK 10 FAILED%' then raise; end if; end;
  -- oversize single file
  begin
    insert into storage.objects(bucket_id,name,owner,metadata) values ('user-media', free_u||'/c/big.png', free_u, jsonb_build_object('size',16*mb,'mimetype','image/png'));
    raise exception 'CHECK 10 FAILED: 16 MB file accepted';
  exception when others then if sqlerrm like 'CHECK 10 FAILED%' then raise; end if; end;
  -- fill Free to 245 MB, then a 10 MB file must be refused, a 4 MB one accepted
  for i in 1..16 loop
    insert into storage.objects(bucket_id,name,owner,metadata) values ('user-media', free_u||'/c/f'||i||'.png', free_u, jsonb_build_object('size',14*mb,'mimetype','image/png'));
  end loop;                                                            
  begin
    insert into storage.objects(bucket_id,name,owner,metadata) values ('user-media', free_u||'/c/over.png', free_u, jsonb_build_object('size',14*mb,'mimetype','image/png'));
    raise exception 'CHECK 10 FAILED: Free user exceeded 250 MB';
  exception when others then if sqlerrm like 'CHECK 10 FAILED%' then raise; end if; end;
  insert into storage.objects(bucket_id,name,owner,metadata) values ('user-media', free_u||'/c/fits.png', free_u, jsonb_build_object('size',4*mb,'mimetype','image/png'));
  -- UPDATE path (grow an existing object past the cap) is checked too
  begin
    update storage.objects set metadata = jsonb_build_object('size',15*mb,'mimetype','image/png') where name = free_u||'/c/fits.png';
    raise exception 'CHECK 10 FAILED: growing an object past the cap via UPDATE was accepted';
  exception when others then if sqlerrm like 'CHECK 10 FAILED%' then raise; end if; end;
  -- deleting frees space again
  delete from storage.objects where name = free_u||'/c/f1.png';
  insert into storage.objects(bucket_id,name,owner,metadata) values ('user-media', free_u||'/c/after-delete.png', free_u, jsonb_build_object('size',10*mb,'mimetype','image/png'));
  -- a different user's prefix is refused by RLS (not by quota)
  begin
    insert into storage.objects(bucket_id,name,owner,metadata) values ('user-media', other||'/c/steal.png', free_u, jsonb_build_object('size',1000,'mimetype','image/png'));
    raise exception 'CHECK 10 FAILED: wrote into another user''s prefix';
  exception when others then if sqlerrm like 'CHECK 10 FAILED%' then raise; end if; end;
  reset role;

  -- accounting still matches the stored bytes for the Free user
  if (select storage_used_bytes from public.user_profiles where user_id = free_u)
     <> (select sum((metadata->>'size')::bigint) from storage.objects where name like free_u||'/%') then
    raise exception 'CHECK 10 FAILED: storage_used_bytes does not match stored object bytes';
  end if;

  -- paid and Beta users get their larger cap; the other user's usage is independent
  perform set_config('request.jwt.claim.sub', lt::text, true); set local role authenticated;
  insert into storage.objects(bucket_id,name,owner,metadata) values ('user-media', lt||'/c/a.png', lt, jsonb_build_object('size',10*mb,'mimetype','image/png'));
  reset role;
  update public.user_profiles set storage_used_bytes = 8*gb - 5*mb where user_id = lt;
  perform set_config('request.jwt.claim.sub', lt::text, true); set local role authenticated;
  begin
    insert into storage.objects(bucket_id,name,owner,metadata) values ('user-media', lt||'/c/b.png', lt, jsonb_build_object('size',10*mb,'mimetype','image/png'));
    raise exception 'CHECK 10 FAILED: Lifetime user exceeded 8 GB';
  exception when others then if sqlerrm like 'CHECK 10 FAILED%' then raise; end if; end;
  reset role;
  perform set_config('request.jwt.claim.sub', other::text, true); set local role authenticated;
  insert into storage.objects(bucket_id,name,owner,metadata) values ('user-media', other||'/c/a.png', other, jsonb_build_object('size',10*mb,'mimetype','image/png'));
  reset role;
  if (select file_size_limit from storage.buckets where id='user-media') <> 15*mb
     or not ((select allowed_mime_types from storage.buckets where id='user-media') @> array['image/png']) then
    raise exception 'CHECK 10 FAILED: bucket-level limits missing';
  end if;
  raise notice 'CHECK 10 ok: server refuses non-image MIME, >15 MB files, over-quota inserts and UPDATE growth; caps Free 250 MB / paid 8 GB / Beta 15 GB / expired Beta 250 MB; user_metadata cannot raise a cap; accounting matches';
  delete from storage.objects where name like any (array[free_u||'/%', lt||'/%', other||'/%']);
  delete from auth.users where id in (free_u,lt,bt,bx,other);
end $$;

-- 11. Desktop device cap (activate_desktop_device): atomic check-and-write, cap enforced,
--     re-verifying an active device never counts twice, deactivation frees a slot, a
--     deactivated device re-activates only if there is room, and the browser roles cannot call it.
do $$
declare
  u uuid := gen_random_uuid(); other uuid := gen_random_uuid(); r jsonb;
begin
  insert into auth.users(id,email) values (u,'d1@example.test'),(other,'d2@example.test');
  r := public.activate_desktop_device(u,'device-aaaa-0001','Mac','macos',2);
  if (r->>'ok')::boolean is not true then raise exception 'CHECK 11 FAILED: first device %', r; end if;
  r := public.activate_desktop_device(u,'device-aaaa-0002','PC','windows',2);
  if (r->>'ok')::boolean is not true then raise exception 'CHECK 11 FAILED: second device %', r; end if;
  r := public.activate_desktop_device(u,'device-aaaa-0003','Third','macos',2);
  if (r->>'ok')::boolean is not false or r->>'reason' <> 'cap' or jsonb_array_length(r->'devices') <> 2 then
    raise exception 'CHECK 11 FAILED: third device must be refused with the two active ones listed: %', r; end if;
  r := public.activate_desktop_device(u,'device-aaaa-0001','Mac renamed','macos',2);
  if (r->>'ok')::boolean is not true then raise exception 'CHECK 11 FAILED: re-verify at the cap %', r; end if;
  if (select count(*) from public.desktop_devices where user_id = u and deactivated_at is null) <> 2 then
    raise exception 'CHECK 11 FAILED: re-verify created a duplicate'; end if;
  update public.desktop_devices set deactivated_at = now() where user_id = u and device_id = 'device-aaaa-0002';
  r := public.activate_desktop_device(u,'device-aaaa-0003','Third','macos',2);
  if (r->>'ok')::boolean is not true then raise exception 'CHECK 11 FAILED: freed slot not usable %', r; end if;
  r := public.activate_desktop_device(u,'device-aaaa-0002','PC','windows',2);
  if (r->>'ok')::boolean is not false then raise exception 'CHECK 11 FAILED: deactivated device re-activated beyond the cap'; end if;
  r := public.activate_desktop_device(other,'device-aaaa-0001','Other Mac','macos',2);   -- same device id, another account
  if (r->>'ok')::boolean is not true then raise exception 'CHECK 11 FAILED: other account affected %', r; end if;
  begin
    perform public.activate_desktop_device(u,'x','x','x',0);
    raise exception 'CHECK 11 FAILED: cap of 0 accepted';
  exception when others then if sqlerrm like 'CHECK 11 FAILED%' then raise; end if; end;
  -- browser roles cannot call it
  perform set_config('request.jwt.claim.sub', u::text, true); set local role authenticated;
  begin
    perform public.activate_desktop_device(u,'device-aaaa-0009','x','x',99);
    raise exception 'CHECK 11 FAILED: authenticated role can call activate_desktop_device';
  exception when insufficient_privilege then null; end;
  reset role;
  raise notice 'CHECK 11 ok: device cap enforced atomically (refuse 3rd, re-verify free, deactivate frees a slot, accounts independent, service-role only)';
  delete from auth.users where id in (u, other);
end $$;
