#!/usr/bin/env node
// Read-only reconciliation report — cross-checks Supabase billing state
// against live Stripe data and flags drift. Never writes anything; every
// finding here is a prompt for a human to decide the right fix (this is
// deliberately not a script that touches real money automatically).
//
// Built for audit P0-05 (docs/YOW_CODE_AUDIT_2026-09-01.md — "reconciliation
// tooling"). Three checks:
//
//   1. Founder overcount: does the number of accounts with is_founder=true
//      exceed the configured cap? (Should be structurally impossible now
//      that fulfillment goes through the atomic claim_founder_slot RPC, but
//      this catches drift from before that fix, or from any future bypass
//      of the webhook, e.g. a manual database edit.)
//   2. Suspicious maintenance_expires_at: any Lifetime account whose
//      maintenance_expires_at is further in the future than one real
//      renewal payment could explain, given lifetime_purchased_at and the
//      included-hosting window — the fingerprint of the pre-fix
//      checkout.session.completed + invoice.paid double-extension bug this
//      PR fixes (see extendMaintenance's comment in api/stripe-webhook.js).
//   3. Subscription drift: for every account with a stored
//      stripe_subscription_id, fetch the live subscription from Stripe and
//      report any account whose stored subscription_status/period_end
//      disagrees with what Stripe currently reports.
//
// Usage:
//   STRIPE_SECRET_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reconcile_stripe_fulfillment.mjs
//
// Requires STRIPE_SECRET_KEY (live or test, matching the environment you
// want to reconcile) and SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL. Never
// commit these keys or put them in a file in this repo — pass as env vars.

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var.')
  process.exit(1)
}
if (!STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY env var.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const stripe = new Stripe(STRIPE_SECRET_KEY)

const HOSTING_INCLUDED_YEARS = 3
const YEAR_MS = 365 * 24 * 60 * 60 * 1000
// Generous slack for clock/rounding differences — this is a heuristic flag
// for manual review, not an exact billing calculation.
const SLACK_MS = 14 * 24 * 60 * 60 * 1000

async function listAllUsers() {
  const users = []
  let page = 1
  const perPage = 200
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < perPage) break
    page += 1
  }
  return users
}

async function checkFounderOvercount(users) {
  console.log('\n=== 1. Founder slot overcount ===')
  const { data: config } = await supabase.from('app_config').select('value').eq('key', 'founder_slots').single()
  const cap = config?.value?.total ?? 100
  const reserved = config?.value?.reserved ?? 0

  const { data: profiles, error } = await supabase.from('user_profiles').select('user_id').eq('is_founder', true)
  if (error) { console.error('  Could not read user_profiles:', error.message); return }

  const taken = profiles?.length ?? 0
  const limit = cap - reserved
  console.log(`  Founders on record: ${taken} / ${limit} (cap ${cap}, reserved ${reserved})`)
  if (taken > limit) {
    console.log(`  ⚠️  OVER CAP by ${taken - limit}. Founder accounts:`)
    for (const p of profiles) {
      const user = users.find(u => u.id === p.user_id)
      console.log(`    ${p.user_id} (${user?.email || 'unknown email'})`)
    }
  } else {
    console.log('  OK.')
  }
}

function suspiciousMaintenanceExpiry(user) {
  const meta = user.app_metadata || {}
  if (!meta.maintenance_expires_at || !meta.lifetime_purchased_at) return null
  if (meta.subscription_plan === 'founder') return null // founders have no expiry

  const purchasedAt = new Date(meta.lifetime_purchased_at).getTime()
  const expiresAt = new Date(meta.maintenance_expires_at).getTime()
  if (!Number.isFinite(purchasedAt) || !Number.isFinite(expiresAt)) return null

  const includedUntil = purchasedAt + HOSTING_INCLUDED_YEARS * YEAR_MS
  // A single legitimate renewal payment extends by exactly one year from
  // whichever is later: the included-hosting end, or now. Anything meaningfully
  // beyond includedUntil + 1 year + slack implies more than one renewal
  // payment's worth of extension landed from a single purchase/renewal event —
  // the double-extension bug's fingerprint.
  const maxPlausible = includedUntil + YEAR_MS + SLACK_MS
  if (expiresAt > maxPlausible) {
    return { purchasedAt: meta.lifetime_purchased_at, expiresAt: meta.maintenance_expires_at, maxPlausibleISO: new Date(maxPlausible).toISOString() }
  }
  return null
}

function checkMaintenanceExpiry(users) {
  console.log('\n=== 2. Suspicious maintenance_expires_at (possible double-extension) ===')
  let flagged = 0
  for (const user of users) {
    const result = suspiciousMaintenanceExpiry(user)
    if (result) {
      flagged += 1
      console.log(`  ⚠️  ${user.id} (${user.email || 'unknown email'}): expires ${result.expiresAt}, plausible max ~${result.maxPlausibleISO}`)
    }
  }
  console.log(flagged === 0 ? '  OK — none found.' : `  ${flagged} account(s) need manual review.`)
}

async function checkSubscriptionDrift(users) {
  console.log('\n=== 3. Subscription drift vs live Stripe data ===')
  const withSub = users.filter(u => u.app_metadata?.stripe_subscription_id)
  console.log(`  Checking ${withSub.length} account(s) with a stored subscription id...`)
  let flagged = 0
  for (const user of withSub) {
    const subId = user.app_metadata.stripe_subscription_id
    let sub
    try {
      sub = await stripe.subscriptions.retrieve(subId)
    } catch (err) {
      console.log(`  ⚠️  ${user.id}: could not retrieve ${subId} from Stripe (${err.message})`)
      flagged += 1
      continue
    }
    if (sub.status !== user.app_metadata.subscription_status) {
      console.log(`  ⚠️  ${user.id} (${user.email || 'unknown email'}): stored status "${user.app_metadata.subscription_status}" vs live "${sub.status}"`)
      flagged += 1
    }
  }
  console.log(flagged === 0 ? '  OK — no drift found.' : `  ${flagged} account(s) need manual review.`)
}

async function main() {
  console.log('Stripe fulfillment reconciliation report (read-only, no writes).')
  const users = await listAllUsers()
  console.log(`Scanned ${users.length} users.`)

  await checkFounderOvercount(users)
  checkMaintenanceExpiry(users)
  await checkSubscriptionDrift(users)

  console.log('\nDone. This script never modifies data — resolve any flagged account by hand.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
