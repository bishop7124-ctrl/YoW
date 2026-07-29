import { createClient } from '@supabase/supabase-js'

// Vercel Cron target (see vercel.json "crons"), runs once daily.
// Finds signups who never really came back and sends the appropriate
// day-1 / day-3 / day-7 nudge from supabase/functions/send-reengagement-email,
// at most once per (user, stage) — tracked in the reengagement_emails table
// (supabase/migrations/20260729_reengagement_emails.sql).
//
// "Never came back" = last_sign_in_at isn't meaningfully after created_at.
// Everyone's first SIGNED_IN event fires within moments of signup, so a
// small grace window (RETURNED_GRACE_MS) is required to avoid treating that
// first-session auth refresh as a "return".

const DAY_MS = 24 * 60 * 60 * 1000
const RETURNED_GRACE_MS = 30 * 60 * 1000

// Whole-day windows so each cron run only ever considers a user for one
// stage, with a full day of retry room if an earlier attempt failed.
const STAGES = [
  { key: 'day1', minDays: 1, maxDays: 2 },
  { key: 'day3', minDays: 3, maxDays: 4 },
  { key: 'day7', minDays: 7, maxDays: 8 },
]

async function listAllUsers(supabase) {
  const users = []
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) break
  }
  return users
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically
  // when CRON_SECRET is set as a project env var — reject anything else so
  // this can't be triggered by a random public request.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  try {
    const users = await listAllUsers(supabase)
    const now = Date.now()

    const candidates = []
    for (const user of users) {
      if (user.user_metadata?.reengagement_opt_out) continue
      if (!user.email) continue

      const createdAt = new Date(user.created_at).getTime()
      const lastSignInAt = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : createdAt
      const alreadyReturned = lastSignInAt - createdAt > RETURNED_GRACE_MS
      if (alreadyReturned) continue

      const ageDays = (now - createdAt) / DAY_MS
      const stage = STAGES.find(s => ageDays >= s.minDays && ageDays < s.maxDays)
      if (!stage) continue

      candidates.push({ id: user.id, email: user.email, stage: stage.key })
    }

    if (candidates.length === 0) {
      return res.status(200).json({ checked: users.length, candidates: 0, sent: 0 })
    }

    const candidateIds = candidates.map(c => c.id)

    const [{ data: alreadySent }, { data: novelRows }] = await Promise.all([
      supabase.from('reengagement_emails').select('user_id, stage').in('user_id', candidateIds),
      supabase.from('novels').select('user_id').in('user_id', candidateIds),
    ])
    const sentSet = new Set((alreadySent || []).map(r => `${r.user_id}:${r.stage}`))
    const hasProjectSet = new Set((novelRows || []).map(r => r.user_id))

    let sentCount = 0
    for (const candidate of candidates) {
      const dedupeKey = `${candidate.id}:${candidate.stage}`
      if (sentSet.has(dedupeKey)) continue

      const emailRes = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-reengagement-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: candidate.id,
          email: candidate.email,
          stage: candidate.stage,
          hasProject: hasProjectSet.has(candidate.id),
        }),
      })

      if (emailRes.ok) {
        await supabase.from('reengagement_emails').upsert({ user_id: candidate.id, stage: candidate.stage })
        sentCount += 1
      } else {
        console.error('[send-reengagement-emails] failed', candidate.id, candidate.stage, await emailRes.text())
      }
    }

    return res.status(200).json({ checked: users.length, candidates: candidates.length, sent: sentCount })
  } catch (err) {
    console.error('[send-reengagement-emails]', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
