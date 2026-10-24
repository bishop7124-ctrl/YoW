// Run with a temporary PGlite install; no application dependency is added:
// npm install --prefix /tmp/yow-remediation-sql --no-audit --no-fund @electric-sql/pglite
// node scripts/check-audit-migrations.mjs /tmp/yow-remediation-sql/node_modules/@electric-sql/pglite/dist/index.js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
let checks = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++ }
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    GRANT USAGE ON SCHEMA private, auth TO authenticated;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_app_meta_data jsonb, updated_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
  `)
  // Use the existing delete implementation with its post-hardening schema.
  const legacy = await readFile(new URL('../supabase/migrations/20260911130000_fix_destructive_delete_iteration.sql', import.meta.url), 'utf8')
  const deleteFunction = legacy.slice(legacy.indexOf('CREATE OR REPLACE FUNCTION public.delete_user()')).split('REVOKE ALL')[0]
  await db.exec(deleteFunction.replace('FUNCTION public.delete_user()', 'FUNCTION private.delete_user()'))
  for (const name of ['20261023120000_atomic_billing_metadata.sql', '20261023121000_account_deletion_journal.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
  }
  const a = '10000000-0000-0000-0000-000000000001'
  const b = '10000000-0000-0000-0000-000000000002'
  await db.query('INSERT INTO auth.users VALUES ($1, $2, now()), ($3, $2, now())', [a, {}, b])
  const apply = async (owner, before, after, invoice = null) =>
    (await db.query('SELECT public.apply_billing_metadata($1,$2,$3,$4) AS applied', [owner, before, after, invoice])).rows[0].applied
  const metadata = async owner => (await db.query('SELECT raw_app_meta_data FROM auth.users WHERE id=$1', [owner])).rows[0]?.raw_app_meta_data
  const lifetime = { subscription_plan: 'premium_plus_lifetime', subscription_status: 'active' }
  // Both workers read {}, Lifetime commits, then the paused Monthly worker resumes.
  check(await apply(a, {}, lifetime), true)
  check(await apply(a, {}, { subscription_plan: 'premium_monthly' }), false)
  check(await metadata(a), lifetime)
  const withMonthly = { ...lifetime, monthly_subscription_id: 'sub_old', monthly_subscription_status: 'active' }
  check(await apply(a, lifetime, withMonthly), true)
  // A second paid invoice followed by replay of the first cannot extend twice.
  const year1 = { ...withMonthly, maintenance_expires_at: '2027-10-23' }
  const year2 = { ...withMonthly, maintenance_expires_at: '2028-10-23' }
  check(await apply(a, withMonthly, year1, 'in_1'), true)
  check(await apply(a, year1, year2, 'in_2'), true)
  check(await apply(a, year2, { ...year2, maintenance_expires_at: '2029-10-23' }, 'in_1'), true)
  check(await metadata(a), year2)
  // A duplicate invoice attributed to another account rolls the metadata write back.
  await assert.rejects(apply(b, {}, lifetime, 'in_1'), /duplicate key/); checks++
  check(await metadata(b), {})
  await db.exec('SET ROLE authenticated')
  await assert.rejects(apply(a, year2, {}), /permission denied/); checks++
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [b])
  await assert.rejects(db.exec('SELECT public.complete_account_deletion()'), /Prepare account deletion/); checks++
  await db.exec('SET ROLE authenticated; SELECT public.prepare_account_deletion(); SELECT public.prepare_account_deletion(); RESET ROLE;')
  check((await db.query('SELECT count(*)::int AS n FROM public.account_deletion_requests WHERE user_id=$1', [b])).rows[0].n, 1)
  // Existing database failures roll back finalization, leaving a retryable journal.
  await db.exec(`CREATE TABLE public.characters(user_id uuid);
    INSERT INTO public.characters VALUES ('${b}');
    CREATE FUNCTION public.reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected delete failure'; END; $$;
    CREATE TRIGGER reject_delete BEFORE DELETE ON public.characters FOR EACH ROW EXECUTE FUNCTION public.reject_delete();`)
  await assert.rejects(db.exec('SELECT public.complete_account_deletion()'), /injected delete failure/); checks++
  check(await metadata(b), {})
  check((await db.query('SELECT completed_at FROM public.account_deletion_requests WHERE user_id=$1', [b])).rows[0].completed_at, null)
  await db.exec('DROP TRIGGER reject_delete ON public.characters; SET ROLE authenticated; SELECT public.complete_account_deletion(); RESET ROLE;')
  check(await metadata(b), undefined)
  check((await db.query('SELECT completed_at IS NOT NULL AS done FROM public.account_deletion_requests WHERE user_id=$1', [b])).rows[0].done, true)
  console.log(`${checks} PostgreSQL migration checks passed (PGlite; synthetic accounts only).`)
} finally { await db.close() }
