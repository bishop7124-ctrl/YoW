import { createClient } from '@supabase/supabase-js'
import {
  buildNotice,
  classifyLifecycle,
  GRACE_DAYS,
  graceEndsAt,
  hostingEndsAt,
  finalNoticeKeyFor,
  lastActivityAt,
  lifecycleTrackFor,
  mayExecuteIrreversible,
} from './_lib/accountLifecycle.js'

// Cron/manual target for the cloud-expiry + inactive-account lifecycle (vercel.json "crons").
//
// With no switches on, this route is REPORT-ONLY: it classifies every account and returns
// which notices are due plus which accounts have reached an archive/delete decision point.
//
// Two optional actions, each needing BOTH an env setting AND a request flag:
//   send    — ACCOUNT_LIFECYCLE_SEND_EMAILS=true  and ?send=1
//             Emails the already-approved notices through Resend, at most MAX_EMAILS_PER_RUN.
//             Each notice is written to account_lifecycle_events BEFORE it is sent (primary key
//             user_id+track+event_key), so a notice can never go out twice.
//   archive — ACCOUNT_LIFECYCLE_ARCHIVE=true      and ?archive=1
//             Stamps app_metadata.cloud_archived_at on Lifetime accounts whose 90-day grace has
//             ended AND whose final notice was recorded at least 7 days ago. Nothing is deleted.
// Deleting Free accounts is deliberately NOT implemented: those only ever appear in the report.

const MAX_EMAILS_PER_RUN = 20
const MAX_ARCHIVES_PER_RUN = 20
const RESEND_URL = 'https://api.resend.com/emails'
const FROM_ADDRESS = 'Your Own World <hello@yourownworld.co.uk>'
const UNIQUE_VIOLATION = '23505'

const settingOn = (name) => ['true', '1'].includes(String(process.env[name] || '').trim().toLowerCase())
const sleep = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve())

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

  const query = req.query || {}
  const sendRequested = query.send === '1'
  const archiveRequested = query.archive === '1'
  const sendEnabled = sendRequested && settingOn('ACCOUNT_LIFECYCLE_SEND_EMAILS')
  const archiveEnabled = archiveRequested && settingOn('ACCOUNT_LIFECYCLE_ARCHIVE')
  // Fail closed: an email run without a Resend key does nothing (and records nothing).
  const resendKey = process.env.RESEND_API_KEY
  const canSend = sendEnabled && Boolean(resendKey)

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  try {
    const users = await listAllUsers(supabase)
    const now = new Date()

    const swept = users
      .map((user) => ({ user, track: lifecycleTrackFor(user) }))
      .filter((entry) => entry.track)

    const ids = swept.map((entry) => entry.user.id)
    const sentByUser = new Map()
    const sentAtByEvent = new Map()
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('account_lifecycle_events')
        .select('user_id, track, event_key, created_at')
        .in('user_id', ids)
      if (error) throw error
      for (const row of data || []) {
        const key = `${row.user_id}:${row.track}`
        if (!sentByUser.has(key)) sentByUser.set(key, [])
        sentByUser.get(key).push(row.event_key)
        sentAtByEvent.set(`${key}:${row.event_key}`, row.created_at)
      }
    }

    const report = { checked: users.length, swept: swept.length, noticesDue: [], archiveDecisions: [], deleteDecisions: [], blockedFinalNotice: [] }
    const sendQueue = []
    const archiveQueue = []

    for (const { user, track } of swept) {
      const anchor = track === 'hosting_lapsed' ? hostingEndsAt(user) : lastActivityAt(user)
      const ledgerKey = `${user.id}:${track}`
      const classification = classifyLifecycle({
        track,
        anchor,
        now,
        sentNoticeKeys: sentByUser.get(ledgerKey) || [],
        archivedAt: user.app_metadata?.cloud_archived_at || null,
      })
      // Opaque id only: the report must stay safe to paste into a chat or ticket.
      const row = { userId: user.id, track, stage: classification.stage, dayOffset: classification.dayOffset }
      const queueNotice = (noticeKey) => {
        const notice = buildNotice({
          track,
          noticeKey,
          daysLeft: GRACE_DAYS - (classification.dayOffset ?? 0),
          deadline: graceEndsAt(track, anchor),
        })
        sendQueue.push({ user, track, noticeKey, anchor, notice, final: Boolean(notice?.final) })
        return notice
      }

      if (classification.action === 'send_final_notice_first') {
        report.blockedFinalNotice.push({ ...row, notice: classification.dueNotice })
        queueNotice(classification.dueNotice)
      } else if (classification.action === 'archive') {
        report.archiveDecisions.push(row)
        if (track === 'hosting_lapsed') {
          const finalNoticeSentAt = sentAtByEvent.get(`${ledgerKey}:${finalNoticeKeyFor(track)}`)
          if (mayExecuteIrreversible({ classification, finalNoticeSentAt, lastActivity: lastActivityAt(user), now })) {
            archiveQueue.push({ user, track, anchor })
          }
        }
      } else if (classification.action === 'delete') {
        // Report only. Deleting Free accounts is intentionally not built.
        report.deleteDecisions.push(row)
      } else if (classification.dueNotice) {
        const notice = queueNotice(classification.dueNotice)
        report.noticesDue.push({ ...row, notice: classification.dueNotice, subject: notice?.subject })
      }
    }

    const actions = []
    if (canSend) actions.push('send')
    if (archiveEnabled) actions.push('archive')
    const body = { mode: actions.length ? actions.join('+') : 'report-only', ...report }

    if (sendRequested && !sendEnabled) body.sendSkipped = 'ACCOUNT_LIFECYCLE_SEND_EMAILS is not on'
    else if (sendEnabled && !resendKey) body.sendSkipped = 'RESEND_API_KEY is not configured'
    if (archiveRequested && !archiveEnabled) body.archiveSkipped = 'ACCOUNT_LIFECYCLE_ARCHIVE is not on'

    if (canSend) {
      // Final notices first: they are what unlocks archiving.
      sendQueue.sort((a, b) => Number(b.final) - Number(a.final))
      const spacing = Number(process.env.ACCOUNT_LIFECYCLE_SEND_SPACING_MS ?? 600) // Resend allows ~2 requests/second
      const result = { sent: 0, failed: 0, alreadyRecorded: 0, uncertain: 0, remaining: 0 }
      let attempts = 0
      for (const item of sendQueue) {
        if (!item.user.email || !item.notice) continue
        if (attempts >= MAX_EMAILS_PER_RUN) { result.remaining += 1; continue }
        const eventRow = {
          user_id: item.user.id,
          track: item.track,
          event_key: item.noticeKey,
          anchor_at: item.anchor ? new Date(item.anchor).toISOString() : null,
        }
        // Record FIRST. If this row already exists the notice was sent (or is being sent).
        const { error: insertError } = await supabase.from('account_lifecycle_events').insert(eventRow)
        if (insertError) {
          if (insertError.code === UNIQUE_VIOLATION) result.alreadyRecorded += 1
          else { console.error('[run-account-lifecycle] ledger insert failed', insertError.message); result.failed += 1 }
          continue
        }
        attempts += 1
        if (attempts > 1) await sleep(spacing)
        try {
          const emailRes = await fetch(RESEND_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${resendKey}`,
              'Idempotency-Key': `lifecycle-${item.user.id}-${item.track}-${item.noticeKey}`,
            },
            body: JSON.stringify({ from: FROM_ADDRESS, to: [item.user.email], subject: item.notice.subject, text: item.notice.text }),
          })
          if (emailRes.ok) {
            result.sent += 1
          } else {
            // Resend refused it, so nothing went out: free the ledger row so tomorrow retries.
            console.error('[run-account-lifecycle] Resend rejected', item.user.id, item.noticeKey, emailRes.status)
            await supabase
              .from('account_lifecycle_events')
              .delete()
              .eq('user_id', item.user.id)
              .eq('track', item.track)
              .eq('event_key', item.noticeKey)
            result.failed += 1
          }
        } catch (sendError) {
          // Network error: we cannot know whether it was delivered, so the ledger row STAYS
          // (a possibly-missed notice is safer than a duplicate; the final-notice gate blocks archive).
          console.error('[run-account-lifecycle] send outcome unknown', item.user.id, item.noticeKey, sendError?.message)
          result.uncertain += 1
        }
      }
      body.emails = { ...result, maxPerRun: MAX_EMAILS_PER_RUN }
    }

    if (archiveEnabled) {
      const result = { archived: 0, failed: 0, remaining: 0 }
      let attempts = 0
      for (const item of archiveQueue) {
        if (attempts >= MAX_ARCHIVES_PER_RUN) { result.remaining += 1; continue }
        attempts += 1
        const archivedAt = now.toISOString()
        // app_metadata is merged key-by-key by Supabase, so existing entitlement fields are untouched.
        const { error: updateError } = await supabase.auth.admin.updateUserById(item.user.id, {
          app_metadata: { cloud_archived_at: archivedAt },
        })
        if (updateError) {
          console.error('[run-account-lifecycle] archive failed', item.user.id, updateError.message)
          result.failed += 1
          continue
        }
        result.archived += 1
        // Audit trail only; the stamp above is what the account is archived by.
        const { error: auditError } = await supabase.from('account_lifecycle_events').insert({
          user_id: item.user.id,
          track: item.track,
          event_key: 'archived',
          anchor_at: item.anchor ? new Date(item.anchor).toISOString() : null,
        })
        if (auditError && auditError.code !== UNIQUE_VIOLATION) console.error('[run-account-lifecycle] archive audit row failed', auditError.message)
      }
      body.archive = { ...result, maxPerRun: MAX_ARCHIVES_PER_RUN }
    }

    return res.status(200).json(body)
  } catch (err) {
    console.error('[run-account-lifecycle]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
