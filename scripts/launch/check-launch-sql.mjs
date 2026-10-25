// Proves scripts/launch/stamp-beta-notice.sql and undo-beta-notice.sql touch only the right accounts.
// Run with a temporary PGlite install; no application dependency is added:
// npm install --prefix /tmp/yow-launch-sql --no-audit --no-fund @electric-sql/pglite
// node scripts/launch/check-launch-sql.mjs /tmp/yow-launch-sql/node_modules/@electric-sql/pglite/dist/index.js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const sql = async name => readFile(new URL(name, import.meta.url), 'utf8')
const blocks = text => text.split(/^-- BLOCK \d+:.*$/m).slice(1)
await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id int PRIMARY KEY, raw_app_meta_data jsonb);')
const users = {
  1: { beta_tester: true, subscription_plan: 'beta_tester' },
  2: { beta_tester: true, subscription_plan: 'beta_tester', beta_tester_source: 'paid_plan_interest' },
  3: { beta_tester: true, subscription_plan: 'beta_tester', beta_notice_started_at: '2026-10-01T00:00:00.000Z' },
  4: { beta_tester: true, subscription_plan: 'premium_plus_lifetime', stripe_customer_id: 'cus_1' },
  5: { subscription_plan: 'premium_monthly', subscription_status: 'active', stripe_customer_id: 'cus_2' },
  6: {},
}
for (const [id, meta] of Object.entries(users)) await db.query('INSERT INTO auth.users VALUES ($1, $2)', [id, meta])
const T = '2026-11-01T09:00:00.000Z'
const stamped = async () => (await db.query("SELECT id FROM auth.users WHERE raw_app_meta_data->>'beta_notice_started_at' = $1 ORDER BY id", [T])).rows.map(r => r.id)
const [preview, stamp, verify] = blocks(await sql('./stamp-beta-notice.sql'))
const p = (await db.query(preview)).rows[0]
assert.deepEqual([Number(p.will_stamp), Number(p.already_stamped), Number(p.beta_but_paid_skipped), Number(p.not_beta_untouched)], [2, 1, 1, 2])
assert.deepEqual(await stamped(), [])
await db.exec(stamp)
assert.deepEqual(await stamped(), [1, 2])
await db.exec(stamp) // idempotent
assert.deepEqual(await stamped(), [1, 2])
assert.equal(Number((await db.query(verify)).rows[0].stamped), 2)
assert.equal((await db.query('SELECT raw_app_meta_data->>\'beta_notice_started_at\' AS t FROM auth.users WHERE id = 3')).rows[0].t, '2026-10-01T00:00:00.000Z')
await db.exec(await sql('./undo-beta-notice.sql'))
assert.deepEqual(await stamped(), [])
assert.equal((await db.query('SELECT raw_app_meta_data->>\'beta_notice_started_at\' AS t FROM auth.users WHERE id = 3')).rows[0].t, '2026-10-01T00:00:00.000Z')
assert.equal((await db.query("SELECT raw_app_meta_data->>'beta_tester_source' AS s FROM auth.users WHERE id = 2")).rows[0].s, 'paid_plan_interest')
console.log('launch SQL checks ok: stamps 2 beta accounts, skips paid/already-stamped/non-beta, idempotent, undo restores')
await db.close()
