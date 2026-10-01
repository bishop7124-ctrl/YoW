import { createClient } from '@supabase/supabase-js'
import { computeCloudLifecycle } from '../src/utils/cloudLifecycle.js'

// Cloud-expiry / inactive-account lifecycle PLANNER (ROADMAP "Cloud-to-local
// transition"). Read-only on purpose: it classifies every account with the
// same pure logic the app uses and reports which accounts are due a notice,
// archive, or deletion review. It sends no email and deletes/archives
// nothing — those are destructive/outward-facing actions that need an
// explicit owner decision before a later change wires them up. It is NOT
// scheduled in vercel.json; call it manually with the cron secret to preview.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cloud-lifecycle

const LIFETIME_PLAN_KEYS = new Set(['premium_plus_lifetime', 'lifetime'])
const INCLUDED_HOSTING_YEARS = 3
const DAY_MS = 24 * 60 * 60 * 1000

async function listAllUsers(supabase) {
  const users = []
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) break
  }
  return users
}

function planUser(user, now) {
  const meta = user.app_metadata || {}
  const plan = meta.subscription_plan
  if (plan === 'founder') return null
  if (LIFETIME_PLAN_KEYS.has(plan)) {
    const purchasedAt = new Date(meta.lifetime_purchased_at || user.created_at)
    const included = new Date(purchasedAt.getTime() + INCLUDED_HOSTING_YEARS * 365 * DAY_MS)
    const paidUntil = new Date(meta.cloud_hosting_expires_at || meta.maintenance_expires_at || 0)
    const hostingEndsAt = !Number.isNaN(paidUntil.getTime()) && paidUntil > included ? paidUntil : included
    return computeCloudLifecycle({ kind: 'paid_hosting', now, hostingEndsAt })
  }
  const status = meta.subscription_status
  if (plan && status && ['active', 'trialing', 'past_due'].includes(status)) return null
  if (meta.beta_tester === true || plan === 'beta_tester') return null
  return computeCloudLifecycle({ kind: 'free', now, lastActivityAt: user.last_sign_in_at || user.created_at })
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cloud-lifecycle] CRON_SECRET is not configured')
    return res.status(500).json({ error: 'Not configured' })
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const users = await listAllUsers(supabase)
    const now = new Date()
    const phases = {}
    const due = []
    for (const user of users) {
      const plan = planUser(user, now)
      if (!plan) continue
      phases[plan.phase] = (phases[plan.phase] || 0) + 1
      if (plan.action !== 'none') due.push({ user_id: user.id, phase: plan.phase, action: plan.action, notice: plan.notice })
    }
    return res.status(200).json({ dryRun: true, checked: users.length, phases, due })
  } catch (err) {
    console.error('[cloud-lifecycle]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
