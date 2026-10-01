import { createClient } from '@supabase/supabase-js'
import {
  buildNotice,
  classifyLifecycle,
  GRACE_DAYS,
  graceEndsAt,
  hostingEndsAt,
  lastActivityAt,
  lifecycleTrackFor,
} from './_lib/accountLifecycle.js'

// Cron/manual target for the cloud-expiry + inactive-account lifecycle.
// NOT scheduled in vercel.json yet: the owner approves the notice wording first.
//
// This route is REPORT-ONLY. It classifies every account and returns which notices are
// due plus which accounts have reached an archive/delete decision point. It never sends
// email and never archives or deletes anything; those steps need a separate, reviewed
// change once the wording and the first dry-run report are approved.

const PAGE_SIZE = 1000
const MAX_PAGES = 20

async function listAllUsers(supabase) {
  const users = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < PAGE_SIZE) break
  }
  return users
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Fail CLOSED when the secret is missing (same rule as send-reengagement-emails, audit P0-03).
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[run-account-lifecycle] CRON_SECRET is not configured')
    return res.status(500).json({ error: 'Not configured' })
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  try {
    const users = await listAllUsers(supabase)
    const now = new Date()

    const swept = users
      .map((user) => ({ user, track: lifecycleTrackFor(user) }))
      .filter((entry) => entry.track)

    const ids = swept.map((entry) => entry.user.id)
    const sentByUser = new Map()
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('account_lifecycle_events')
        .select('user_id, track, event_key')
        .in('user_id', ids)
      if (error) throw error
      for (const row of data || []) {
        const key = `${row.user_id}:${row.track}`
        if (!sentByUser.has(key)) sentByUser.set(key, [])
        sentByUser.get(key).push(row.event_key)
      }
    }

    const report = { checked: users.length, swept: swept.length, noticesDue: [], archiveDecisions: [], deleteDecisions: [], blockedFinalNotice: [] }

    for (const { user, track } of swept) {
      const anchor = track === 'hosting_lapsed' ? hostingEndsAt(user) : lastActivityAt(user)
      const classification = classifyLifecycle({
        track,
        anchor,
        now,
        sentNoticeKeys: sentByUser.get(`${user.id}:${track}`) || [],
      })
      // Opaque id only: the report must stay safe to paste into a chat or ticket.
      const row = { userId: user.id, track, stage: classification.stage, dayOffset: classification.dayOffset }

      if (classification.action === 'send_final_notice_first') {
        report.blockedFinalNotice.push({ ...row, notice: classification.dueNotice })
      } else if (classification.action === 'archive') {
        report.archiveDecisions.push(row)
      } else if (classification.action === 'delete') {
        report.deleteDecisions.push(row)
      } else if (classification.dueNotice) {
        const notice = buildNotice({
          track,
          noticeKey: classification.dueNotice,
          daysLeft: GRACE_DAYS - (classification.dayOffset ?? 0),
          deadline: graceEndsAt(track, anchor),
        })
        report.noticesDue.push({ ...row, notice: classification.dueNotice, subject: notice?.subject })
      }
    }

    return res.status(200).json({ mode: 'report-only', ...report })
  } catch (err) {
    console.error('[run-account-lifecycle]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
