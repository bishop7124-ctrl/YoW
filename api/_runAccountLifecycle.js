import { createClient } from '@supabase/supabase-js'
import {
  buildNotice,
  classifyLifecycle,
  GRACE_DAYS,
  graceEndsAt,
  hostingEndsAt,
  isArchiveStampCurrent,
  finalNoticeKeyFor,
  lastActivityAt,
  lifecycleTrackFor,
  mayExecuteIrreversible,
} from './_accountLifecycle.js'

// Cron target for the cloud-expiry + inactive-account lifecycle. NOT its own Vercel Function (Hobby is capped at 12):
// api/send-reengagement-emails.js hands off to this when called with ?job=lifecycle (see vercel.json "crons").
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
//   delete  — ACCOUNT_LIFECYCLE_DELETE_FREE=true   and ?delete=1
//             Permanently deletes INACTIVE FREE accounts only (never Lifetime/paid), after the 18-month
//             inactivity mark + 90-day grace, with the final notice recorded >= 7 days ago and no
//             sign-in since. Writes account_lifecycle_deletions first, re-checks the account live,
//             removes the user's stored media, then deletes the account. At most MAX_DELETES_PER_RUN.

const MAX_EMAILS_PER_RUN = 20
const MAX_ARCHIVES_PER_RUN = 20
const MAX_DELETES_PER_RUN = 10
const MEDIA_BUCKET = 'user-media'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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

// Removes every stored object under `<userId>/` in the private media bucket. The uuid check
// is a hard guard: an empty or malformed prefix would otherwise list the whole bucket.
async function removeUserMedia(supabase, userId) {
  if (!UUID_RE.test(String(userId))) throw new Error('refusing media cleanup for a non-uuid id')
  const bucket = supabase.storage.from(MEDIA_BUCKET)
  const paths = []
  const walk = async (prefix, depth) => {
    if (depth > 8) throw new Error('media folder tree too deep')
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(prefix, { limit: 100, offset })
      if (error) throw error
      for (const entry of data || []) {
        const path = `${prefix}/${entry.name}`
        if (entry.id) paths.push(path)
        else await walk(path, depth + 1)
      }
      if (!data || data.length < 100) break
    }
  }
  await walk(userId, 0)
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await bucket.remove(paths.slice(i, i + 100))
    if (error) throw error
  }
  return paths.length
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
  const deleteRequested = query.delete === '1'
  const deleteEnabled = deleteRequested && settingOn('ACCOUNT_LIFECYCLE_DELETE_FREE')
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
    const rowsByUser = new Map()
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('account_lifecycle_events')
        .select('user_id, track, event_key, created_at, anchor_at')
        .in('user_id', ids)
      if (error) throw error
      for (const row of data || []) {
        const key = `${row.user_id}:${row.track}`
        if (!rowsByUser.has(key)) rowsByUser.set(key, [])
        rowsByUser.get(key).push(row)
      }
    }

    const report = { checked: users.length, swept: swept.length, noticesDue: [], archiveDecisions: [], deleteDecisions: [], blockedFinalNotice: [] }
    const sendQueue = []
    const archiveQueue = []
    const deleteQueue = []

    for (const { user, track } of swept) {
      const anchor = track === 'hosting_lapsed' ? hostingEndsAt(user) : lastActivityAt(user)
      const ledgerKey = `${user.id}:${track}`
      // A ledger row belongs to the cycle it was written for (its anchor_at). If the account has
      // since signed in (Free) or renewed (Lifetime) its anchor moved on, so older rows are from a
      // finished cycle: they must not count as "already sent" for the new one.
      const anchorTime = anchor ? new Date(anchor).getTime() : null
      const ledgerRows = rowsByUser.get(ledgerKey) || []
      const isStale = (r) => anchorTime != null && r.anchor_at != null && new Date(r.anchor_at).getTime() < anchorTime
      const freshRows = ledgerRows.filter((r) => !isStale(r))
      const staleKeys = ledgerRows.filter(isStale).map((r) => r.event_key)
      const freshRow = (eventKey) => freshRows.find((r) => r.event_key === eventKey)
      const classification = classifyLifecycle({
        track,
        anchor,
        now,
        sentNoticeKeys: freshRows.map((r) => r.event_key),
        archivedAt: track === 'hosting_lapsed' && isArchiveStampCurrent(user.app_metadata?.cloud_archived_at, anchor)
          ? user.app_metadata.cloud_archived_at
          : null,
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
        sendQueue.push({ user, track, noticeKey, anchor, notice, final: Boolean(notice?.final), staleKeys })
        return notice
      }

      if (classification.action === 'send_final_notice_first') {
        report.blockedFinalNotice.push({ ...row, notice: classification.dueNotice })
        queueNotice(classification.dueNotice)
      } else if (classification.action === 'archive') {
        report.archiveDecisions.push(row)
        if (track === 'hosting_lapsed') {
          const finalNoticeSentAt = freshRow(finalNoticeKeyFor(track))?.created_at
          if (mayExecuteIrreversible({ classification, finalNoticeSentAt, lastActivity: lastActivityAt(user), now })) {
            archiveQueue.push({ user, track, anchor })
          }
        }
      } else if (classification.action === 'delete') {
        report.deleteDecisions.push(row)
        if (track === 'free_inactive') {
          const finalNoticeSentAt = freshRow(finalNoticeKeyFor(track))?.created_at
          // The activity date the first warning was based on; any later sign-in is a response.
          const anchorSeenAtNotice = (freshRow('inactive_0') ?? freshRow(finalNoticeKeyFor(track)))?.anchor_at
          const lastActivity = lastActivityAt(user)
          if (mayExecuteIrreversible({ classification, finalNoticeSentAt, lastActivity, anchorSeenAtNotice, now })) {
            deleteQueue.push({ user, track, anchor, finalNoticeSentAt, lastActivity })
          }
        }
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
    if (deleteRequested && !deleteEnabled) body.deleteSkipped = 'ACCOUNT_LIFECYCLE_DELETE_FREE is not on'
    if (deleteEnabled) actions.push('delete')
    body.mode = actions.length ? actions.join('+') : 'report-only'

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
        // A row for this key left over from an earlier, finished cycle would block this notice
        // (primary key), so clear just that one first.
        if (item.staleKeys.includes(item.noticeKey)) {
          await supabase
            .from('account_lifecycle_events')
            .delete()
            .eq('user_id', item.user.id)
            .eq('track', item.track)
            .eq('event_key', item.noticeKey)
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
          // No Resend Idempotency-Key on purpose: Resend remembers a key for 24h and answers 409 if the
          // same key comes back with a different body (e.g. a retry after we freed the ledger row, or
          // after the email template changed). The ledger row above is the duplicate guard.
          const emailRes = await fetch(RESEND_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify({ from: FROM_ADDRESS, to: [item.user.email], subject: item.notice.subject, html: item.notice.html, text: item.notice.text }),
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

    if (deleteEnabled) {
      const result = { deleted: 0, failed: 0, skipped: 0, remaining: 0 }
      let attempts = 0
      for (const item of deleteQueue) {
        if (attempts >= MAX_DELETES_PER_RUN) { result.remaining += 1; continue }
        attempts += 1
        const id = item.user.id
        try {
          // Live re-check: the account must still be an inactive Free account and must not
          // have signed in since the sweep read it. Anything else is skipped, not deleted.
          const { data: fresh, error: freshError } = await supabase.auth.admin.getUserById(id)
          if (freshError || !fresh?.user) throw freshError || new Error('user not found')
          const stillFree = lifecycleTrackFor(fresh.user) === 'free_inactive'
          const sameActivity = lastActivityAt(fresh.user)?.getTime() === item.lastActivity?.getTime()
          if (!stillFree || !sameActivity) { result.skipped += 1; continue }

          // Record FIRST (service-role-only audit table; no FK, survives the deletion).
          const { error: auditError } = await supabase.from('account_lifecycle_deletions').upsert({
            user_id: id,
            track: item.track,
            anchor_at: item.anchor ? new Date(item.anchor).toISOString() : null,
            final_notice_sent_at: item.finalNoticeSentAt ? new Date(item.finalNoticeSentAt).toISOString() : null,
          }, { onConflict: 'user_id' })
          if (auditError) throw auditError

          await removeUserMedia(supabase, id)
          // public.scenes.user_id is TEXT with no foreign key to auth.users, so deleting the
          // Auth user does not cascade to it (every other user table does): remove the
          // manuscript text explicitly or it would outlive the account.
          const { error: scenesError } = await supabase.from('scenes').delete().eq('user_id', id)
          if (scenesError) throw scenesError
          const { error: deleteError } = await supabase.auth.admin.deleteUser(id)
          if (deleteError) throw deleteError
          result.deleted += 1
          const { error: doneError } = await supabase
            .from('account_lifecycle_deletions')
            .update({ completed_at: new Date().toISOString() })
            .eq('user_id', id)
          if (doneError) console.error('[run-account-lifecycle] deletion audit completion failed', doneError.message)
        } catch (deleteErr) {
          // Nothing is half-done in a way that loses data: media removal happens just before the
          // account delete, and the next run retries from the audit row.
          console.error('[run-account-lifecycle] deletion failed', id, deleteErr?.message)
          result.failed += 1
        }
      }
      body.deletion = { ...result, maxPerRun: MAX_DELETES_PER_RUN }
    }

    // Counts only (no ids, no emails) so the run result is visible in Vercel's logs.
    console.log('[run-account-lifecycle] summary', JSON.stringify({
      mode: body.mode,
      checked: body.checked,
      swept: body.swept,
      noticesDue: body.noticesDue.length,
      blockedFinalNotice: body.blockedFinalNotice.length,
      archiveDecisions: body.archiveDecisions.length,
      deleteDecisions: body.deleteDecisions.length,
      emails: body.emails,
      archive: body.archive,
      deletion: body.deletion,
      deleteSkipped: body.deleteSkipped,
      sendSkipped: body.sendSkipped,
      archiveSkipped: body.archiveSkipped,
    }))
    return res.status(200).json(body)
  } catch (err) {
    console.error('[run-account-lifecycle]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
