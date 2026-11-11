// Scratch-Postgres checks for 20261111120000_plot_threads.sql. Run: node supabase/tests/plot_threads.pglite.mjs
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
 -- Stand-in for the existing projects table (same shape and owner-only policy as production).
 create table public.novels (id text primary key, user_id uuid not null references auth.users(id) on delete cascade, data jsonb not null default '{}', updated_at timestamptz not null default now());
 alter table public.novels enable row level security;
 create policy "Users manage own novels" on public.novels using (auth.uid() = user_id) with check (auth.uid() = user_id);
 grant select, insert, update, delete on public.novels to authenticated;
`)
await db.exec(readFileSync(new URL('../migrations/20261111120000_plot_threads.sql', import.meta.url), 'utf8'))
let pass = 0, fail = 0
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra) }
const as = async (uid, sql, params) => {
  await db.exec(`reset role; set request.jwt.claim.sub = '${uid || ''}'; set role ${uid === 'anon' ? 'anon' : 'authenticated'};`)
  try { return { rows: (await db.query(sql, params)).rows } } catch (e) { return { error: e.message } } finally { await db.exec('reset role') }
}
const admin = async (sql, params) => { await db.exec('reset role'); return (await db.query(sql, params)).rows }
const addThread = (uid, id, novel, data = { name: 'Main plot' }) =>
  as(uid, 'insert into public.plot_threads (id, user_id, novel_id, data) values ($1,$2,$3,$4)', [id, uid, novel, data])
const count = async (uid, novel) => Number((await admin('select count(*)::int c from public.plot_threads where user_id=$1 and ($2::text is null or novel_id=$2)', [uid, novel ?? null]))[0].c)

await as(A, "insert into public.novels (id, user_id) values ('n1', $1), ('n2', $1)", [A])
await as(B, "insert into public.novels (id, user_id) values ('n9', $1)", [B])

ok('owner can insert a thread', !(await addThread(A, 't1', 'n1')).error)
ok('owner can insert a second thread in another project', !(await addThread(A, 't2', 'n2')).error)
ok('owner can update their thread', (await as(A, "update public.plot_threads set data = '{\"name\":\"Renamed\"}' where id='t1'")).error === undefined
  && (await admin("select data->>'name' n from public.plot_threads where id='t1'"))[0].n === 'Renamed')
ok('owner sees only their own threads', (await as(A, 'select id from public.plot_threads')).rows.length === 2)

ok('other user cannot insert a row for someone else', !!(await as(B, 'insert into public.plot_threads (id, user_id, novel_id, data) values ($1,$2,$3,$4)', ['t3', A, 'n1', {}])).error)
await addThread(B, 't9', 'n9', { name: 'B plot' })
ok('other user sees none of the owner\'s threads', (await as(B, 'select id from public.plot_threads')).rows.map(r => r.id).join() === 't9')
ok('other user cannot update the owner\'s thread', (await as(B, "update public.plot_threads set data='{}' where id='t1' returning id")).rows.length === 0)
ok('other user cannot delete the owner\'s thread', (await as(B, "delete from public.plot_threads where id='t1' returning id")).rows.length === 0)
ok('the owner\'s thread survived', (await count(A)) === 2)
ok('upserting someone else\'s id cannot take it over', !!(await as(B, "insert into public.plot_threads (id, user_id, novel_id, data) values ('t1', $1, 'n9', '{}') on conflict (id) do update set user_id = excluded.user_id", [B])).error
  || (await admin("select user_id from public.plot_threads where id='t1'"))[0].user_id === A)

ok('anonymous cannot read', !!(await as('anon', 'select * from public.plot_threads')).error)
ok('anonymous cannot write', !!(await as('anon', "insert into public.plot_threads (id, user_id, novel_id, data) values ('x', $1, 'n', '{}')", [A])).error)

ok('oversize row rejected', !!(await addThread(A, 'big', 'n1', { name: 'x'.repeat(300000) })).error)

// Deleting a project removes only that project's threads, only for that owner.
await as(A, "delete from public.novels where id='n1'")
ok('deleting a project removes its threads', (await count(A, 'n1')) === 0)
ok('other projects\' threads of the same owner stay', (await count(A, 'n2')) === 1)
ok('another user\'s threads are untouched', (await count(B)) === 1)

// The replace-all path deletes every novel for the user; their threads go with them (the client re-sends them).
await as(A, "delete from public.novels where user_id = $1", [A])
ok('replace-all (delete every project) clears that owner\'s threads', (await count(A)) === 0)
ok('...and still nobody else\'s', (await count(B)) === 1)

// Account deletion cascades.
await admin('delete from auth.users where id = $1', [B])
ok('account deletion cascades', (await count(B)) === 0)

// Idempotent re-run (apply twice must not fail).
let rerun = null
try { await db.exec(readFileSync(new URL('../migrations/20261111120000_plot_threads.sql', import.meta.url), 'utf8')) } catch (e) { rerun = e.message }
ok('migration can be applied twice', rerun === null, rerun)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
