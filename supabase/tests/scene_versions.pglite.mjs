import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const db = new PGlite()
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b'
await db.exec(`
 create role anon nologin; create role authenticated nologin;
 create schema auth;
 create table auth.users (id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 grant usage on schema auth to authenticated, anon; grant usage on schema public to authenticated, anon;
 insert into auth.users values ('${A}'), ('${B}');
`)
await db.exec(readFileSync('/Users/bishop/Desktop/Claude/yow/supabase/migrations/20261109120000_scene_versions.sql','utf8'))
let pass = 0, fail = 0
const ok = (name, cond, extra='') => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra) }
const as = async (uid, sql, params) => {
  await db.exec(`reset role; ${uid ? `set request.jwt.claim.sub = '${uid}'; set role authenticated;` : `set request.jwt.claim.sub = ''; set role authenticated;`}`)
  try { return { rows: (await db.query(sql, params)).rows } } catch (e) { return { error: e.message } } finally { await db.exec('reset role') }
}
const admin = async (sql, params) => { await db.exec('reset role'); return (await db.query(sql, params)).rows }
const save = (uid, scene, text, src='auto', novel='n1') => as(uid, 'select public.save_scene_version($1,$2,$3,$4,$5) as r', [scene, novel, 'T', text, src])
const count = async (uid, scene) => Number((await admin('select count(*)::int c from public.scene_versions where user_id=$1 and scene_id=$2', [uid, scene]))[0].c)

// auth + validation
ok('anonymous caller rejected', (await as(null, "select public.save_scene_version('s','n','t','x','auto')")).error?.includes('not authenticated'))
ok('bad source rejected', !!(await save(A,'s1','x','bogus')).error)
ok('oversize rejected', !!(await save(A,'s1','x'.repeat(2097153))).error)
ok('empty scene id rejected', !!(await save(A,'','x')).error)

// store + dedupe + word count
ok('first save stores', (await save(A,'s1','hello big world')).rows?.[0].r === true)
ok('word count', Number((await admin("select word_count from public.scene_versions where scene_id='s1'"))[0].word_count) === 3)
ok('duplicate within a minute is a no-op', (await save(A,'s1','hello big world')).rows?.[0].r === false)
ok('still one row', await count(A,'s1') === 1)
await admin("update public.scene_versions set created_at = now() - interval '5 minutes' where scene_id='s1'")
ok('older identical version is moved to now', (await save(A,'s1','hello big world')).rows?.[0].r === true && await count(A,'s1') === 1)

// RLS + direct writes
await save(B,'sb','secret of B')
ok('user A cannot read B rows', (await as(A,"select count(*)::int c from public.scene_versions where scene_id='sb'")).rows[0].c === 0)
ok('user B can read own rows', (await as(B,"select count(*)::int c from public.scene_versions where scene_id='sb'")).rows[0].c === 1)
ok('direct insert denied', !!(await as(A,"insert into public.scene_versions(user_id,scene_id,content,content_hash,source) values ('"+A+"','x','y','h','auto')")).error)
ok('direct update denied', !!(await as(A,"update public.scene_versions set content='hacked'")).error)
ok('direct delete denied', !!(await as(A,"delete from public.scene_versions")).error)
ok('anon cannot call function', await (async()=>{ await db.exec('reset role; set role anon;'); try { await db.query("select public.save_scene_version('s','n','t','x','auto')"); return false } catch { return true } finally { await db.exec('reset role') } })())
ok('A cannot delete B version', (await as(A,'select public.delete_scene_version($1) r',[(await admin("select id from public.scene_versions where scene_id='sb'"))[0].id])).rows[0].r === false && await count(B,'sb') === 1)
ok('A cannot clear B scene', (await as(A,"select public.clear_scene_versions('sb') r")).rows[0].r === 0 && await count(B,'sb') === 1)
ok('A cannot mark B scene deleted', (await as(A,"select public.mark_scene_versions_deleted('sb') r")).rows[0].r === 0)

// retention: 40 distinct versions today -> 20 kept
for (let i = 0; i < 25; i++) { await save(A,'busy',`draft ${i}`); await admin("update public.scene_versions set created_at = created_at - interval '2 minutes' where scene_id='busy' and user_id=$1",[A]) }
ok('25 same-day saves keep 20 newest', await count(A,'busy') === 20, 'got ' + await count(A,'busy'))
const newest = (await admin("select content from public.scene_versions where scene_id='busy' order by created_at desc limit 1"))[0].content
ok('newest version is the latest save', newest === 'draft 24', newest)

// retention: one version per day for 45 days
await admin("delete from public.scene_versions where scene_id='daily'")
for (let d = 45; d >= 1; d--) {
  await admin("insert into public.scene_versions(user_id,scene_id,content,content_hash,source,created_at) values ($1,'daily',$2,$3,'auto', now() - ($4 || ' days')::interval)", [A, 'day'+d, 'h'+d, String(d)])
}
await save(A,'daily','today')
const c = await count(A,'daily')
ok('daily retention keeps 20 newest + days within 30 (>=21, <=31)', c >= 21 && c <= 31, 'got ' + c)
ok('rows older than 30 days beyond newest 20 are gone', Number((await admin("select count(*)::int c from public.scene_versions where scene_id='daily' and created_at < now()-interval '31 days'"))[0].c) === 0)

// per-user cap
await admin("delete from public.scene_versions where user_id=$1",[A])
for (let s = 0; s < 40; s++) for (let v = 0; v < 52; v++) {
  if (v === 0 && s === 0) await db.exec('reset role')
}
await admin(`insert into public.scene_versions(user_id,scene_id,content,content_hash,source,created_at)
  select $1, 'cap'||s, 'c'||s||'-'||v, 'ch'||s||'-'||v, 'auto', now() - ((s*60+v) || ' minutes')::interval
  from generate_series(0,39) s, generate_series(0,52) v`, [A])
const before = await count(A, 'cap0')
await save(A,'capfinal','x')
const total = Number((await admin('select count(*)::int c from public.scene_versions where user_id=$1',[A]))[0].c)
ok('cap enforced (<=2000)', total <= 2000, 'total ' + total)
const scenesWithRows = Number((await admin("select count(distinct scene_id)::int c from public.scene_versions where user_id=$1 and scene_id like 'cap%'",[A]))[0].c)
ok('every scene keeps at least its newest version', scenesWithRows === 41, 'scenes ' + scenesWithRows)

// recently deleted
await admin('delete from public.scene_versions where user_id=$1',[A])
await save(A,'gone','v1'); 
ok('mark deleted', (await as(A,"select public.mark_scene_versions_deleted('gone') r")).rows[0].r === 1)
ok('deleted rows still readable for recovery', (await as(A,"select count(*)::int c from public.scene_versions where deleted_at is not null")).rows[0].c === 1)
ok('unmark restores', (await as(A,"select public.unmark_scene_versions_deleted('gone') r")).rows[0].r === 1)
await as(A,"select public.mark_novel_versions_deleted('n1') r")
ok('project mark deletes by novel', (await as(A,"select count(*)::int c from public.scene_versions where deleted_at is not null")).rows[0].c === 1)
await admin("update public.scene_versions set deleted_at = now() - interval '31 days' where scene_id='gone'")
ok('purge removes expired', (await as(A,'select public.purge_expired_scene_versions() r')).rows[0].r === 1 && await count(A,'gone') === 0)

// account deletion cascade
await save(A,'cas','keep me?')
await admin('delete from auth.users where id=$1',[A])
ok('account deletion cascades', await count(A,'cas') === 0)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
