#!/usr/bin/env node
// One-off data migration — strips entitlement-shaped fields out of every
// user's client-writable user_metadata: subscription_status,
// subscription_plan, beta_tester, was_monthly, trial_started_at.
//
// Why this exists: getMembership() (src/utils/membership.js) and the desktop
// entitlement API routes used to fall back to reading these fields from
// user_metadata when app_metadata was absent — but user_metadata is writable
// by the signed-in account owner via supabase.auth.updateUser(), so any user
// could self-grant paid/desktop/beta entitlement. That read path is now
// removed (docs/YOW_CODE_AUDIT_2026-09-01.md P0-01), which makes any
// leftover copy of these fields in user_metadata inert for entitlement
// purposes going forward — but they're still misleading clutter sitting in
// every affected account's metadata (visible in the Supabase dashboard, and
// a trap for any future code that reintroduces a user_metadata fallback), so
// this script cleans them up.
//
// Safety: this never *touches* app_metadata, and every entitlement field
// this repo's server code legitimately writes (subscription_status,
// subscription_plan, beta_tester, was_monthly) is already written to
// app_metadata by every current write path (api/stripe-webhook.js,
// api/register-paid-interest.js) — user_metadata never was, and still isn't,
// the place any of them are supposed to be set. So stripping them from
// user_metadata cannot strand a real subscriber's entitlement; app_metadata
// already carries the authoritative value. As a safety net anyway, the
// script flags (but does not block on, and does not modify) any user whose
// user_metadata claims paid/beta status that app_metadata does NOT also
// grant — review that list by hand before treating the run as complete.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate_sanitize_user_metadata.mjs --dry-run
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate_sanitize_user_metadata.mjs --apply
//
// Always run with --dry-run first and read the full report, especially the
// "NEEDS MANUAL REVIEW" section, before re-running with --apply.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (Project Settings -> API -> service_role
// in the Supabase dashboard). Never commit this key or put it in a file in
// this repo — pass it as an env var on the command line only.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const ENTITLEMENT_KEYS = ['subscription_status', 'subscription_plan', 'beta_tester', 'was_monthly', 'trial_started_at']
const LIFETIME_PLAN_KEYS = new Set(['premium_lifetime', 'premium_plus_lifetime', 'founder'])
const PAID_STATUSES = new Set(['active', 'trialing'])

const args = process.argv.slice(2)
const dryRun = !args.includes('--apply')

if (!SUPABASE_URL) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_URL env var.')
  process.exit(1)
}
if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var. Get it from')
  console.error('Supabase dashboard -> Project Settings -> API -> service_role,')
  console.error('and pass it inline, e.g.:')
  console.error('  SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate_sanitize_user_metadata.mjs --dry-run')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function appMetaLooksEntitled(appMeta) {
  const status = appMeta?.subscription_status
  const plan = appMeta?.subscription_plan
  return PAID_STATUSES.has(status) || LIFETIME_PLAN_KEYS.has(plan) || appMeta?.beta_tester === true
}

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

async function main() {
  console.log(dryRun ? 'Running in --dry-run mode (no writes). Pass --apply to actually update accounts.\n' : 'Running with --apply — this WILL modify user_metadata.\n')

  const users = await listAllUsers()
  console.log(`Scanned ${users.length} users.\n`)

  let affected = 0
  let updated = 0
  const needsReview = []

  for (const user of users) {
    const userMeta = user.user_metadata || {}
    const foundKeys = ENTITLEMENT_KEYS.filter(key => Object.prototype.hasOwnProperty.call(userMeta, key))
    if (foundKeys.length === 0) continue

    affected += 1
    const claimsEntitlement = userMeta.subscription_status === 'active' || userMeta.subscription_status === 'trialing'
      || LIFETIME_PLAN_KEYS.has(userMeta.subscription_plan) || userMeta.beta_tester === true
    const appMetaCovers = appMetaLooksEntitled(user.app_metadata || {})

    if (claimsEntitlement && !appMetaCovers) {
      needsReview.push({ id: user.id, email: user.email, userMeta: Object.fromEntries(foundKeys.map(k => [k, userMeta[k]])) })
    }

    const cleaned = { ...userMeta }
    for (const key of foundKeys) delete cleaned[key]

    console.log(`${dryRun ? '[dry-run] would clean' : 'cleaning'} ${user.id} (${user.email || 'no email'}): removing ${foundKeys.join(', ')}`)

    if (!dryRun) {
      const { error } = await supabase.auth.admin.updateUserById(user.id, { user_metadata: cleaned })
      if (error) {
        console.error(`  FAILED for ${user.id}: ${error.message}`)
        continue
      }
      updated += 1
    }
  }

  console.log(`\n${affected} user(s) had entitlement-shaped keys in user_metadata.`)
  if (!dryRun) console.log(`${updated} user(s) updated.`)

  if (needsReview.length > 0) {
    console.log('\n⚠️  NEEDS MANUAL REVIEW — user_metadata claims paid/beta entitlement that app_metadata does NOT also grant:')
    for (const row of needsReview) {
      console.log(`  ${row.id} (${row.email || 'no email'}): ${JSON.stringify(row.userMeta)}`)
    }
    console.log('\nThese accounts will lose any UI that was trusting the now-removed user_metadata fallback.')
    console.log('If any of these are real customers, grant their entitlement in app_metadata before/instead of running --apply for them.')
  } else {
    console.log('\nNo accounts need manual review — every flagged user_metadata entitlement claim is already backed by app_metadata.')
  }

  if (dryRun) console.log('\nRe-run with --apply to write these changes.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
