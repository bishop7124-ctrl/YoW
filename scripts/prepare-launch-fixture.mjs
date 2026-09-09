// Configure only the two owner-designated disposable accounts. Dry-run by default.
// Credentials come from the process environment; values are never printed.
import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'

const ALLOWED_EMAILS = new Set(['test1@yourownworld.co.uk', 'test2@yourownworld.co.uk'])
const PLAN_KEYS = { free: null, monthly: 'premium_monthly', lifetime: 'premium_plus_lifetime', founder: 'founder', beta: 'beta_tester' }

export function buildFixtureMetadata(email, plan, existing = {}, now = new Date()) {
  if (!ALLOWED_EMAILS.has(email)) throw new Error('Only owner-designated disposable accounts may be configured.')
  if (!Object.hasOwn(PLAN_KEYS, plan)) throw new Error('Plan must be free, monthly, lifetime, founder, or beta.')
  if (existing.stripe_customer_id || existing.stripe_subscription_id || existing.lifetime_payment_intent) {
    throw new Error('Refusing to overwrite an account linked to real billing. Use a separate disposable account.')
  }
  return {
    ...existing,
    subscription_plan: PLAN_KEYS[plan], subscription_status: plan === 'free' ? 'none' : 'active',
    beta_tester: plan === 'beta', beta_notice_started_at: null,
    trial_started_at: '2000-01-01T00:00:00.000Z',
    access_revoked_at: null, was_monthly: false,
    lifetime_purchased_at: ['lifetime', 'founder'].includes(plan) ? now.toISOString() : null,
    cloud_hosting_expires_at: null, maintenance_expires_at: null,
    launch_test_fixture: true,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const value = flag => args[args.indexOf(flag) + 1]
  const email = args.includes('--email') ? value('--email') : ''
  const plan = args.includes('--plan') ? value('--plan') : ''
  buildFixtureMetadata(email, plan)
  if (!args.includes('--apply')) {
    console.log(JSON.stringify({ dryRun: true, email, metadata: buildFixtureMetadata(email, plan), note: 'No remote access or changes. --apply requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Does not create accounts, delete projects, or consume a Founder slot.' }, null, 2))
    return
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Admin environment is not configured.')
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  let found
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error('Account lookup failed.')
    found = data.users.find(user => user.email?.toLowerCase() === email)
    if (found || data.users.length < 100) break
  }
  if (!found) throw new Error('Create this disposable account first, then rerun.')
  const metadata = buildFixtureMetadata(email, plan, found.app_metadata)
  const { error } = await client.auth.admin.updateUserById(found.id, { app_metadata: metadata })
  if (error) throw new Error('Fixture metadata update failed.')
  console.log(`Configured ${email} as ${plan}. Sign out and back in to refresh the session.`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
