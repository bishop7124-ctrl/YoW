import { lastActivityAt, lifecycleTrackFor } from './_accountLifecycle.js'

// AUD-05: resumable, recoverable deletion of inactive Free accounts.
//
//   hold   : claim the account in the journal, block sign-in (Auth ban). NOTHING is deleted.
//   purge  : after HOLD_DAYS, re-check; if the account is still blocked, still Free and has the
//            same last activity, delete the Auth user FIRST (cascades every table), then clean up
//            the leftovers (media, scenes) from the journal. Cleanup is idempotent and retried.
//   cancel : returned / upgraded / restored during the hold -> unblock, nothing deleted.
//
// A failure leaves either an intact blocked account or an account-less cleanup job, never a live
// account that has lost content. Restore during the hold = lift the ban (see recovery runbook);
// the purge step sees the account is no longer blocked and cancels.

export const HOLD_DAYS = 30
export const BAN_DURATION = '87600h' // ~10 years: outlasts any hold; lifted explicitly on cancel
const MEDIA_BUCKET = 'user-media'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UNIQUE_VIOLATION = '23505'
const DAY_MS = 24 * 60 * 60 * 1000

// Removes every stored object under `<userId>/`. The uuid check is a hard guard: an empty or
// malformed prefix would otherwise list the whole bucket.
export async function removeUserMedia(supabase, userId) {
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

const isBlocked = (user) => {
  const until = user?.banned_until
  return Boolean(until) && new Date(until).getTime() > Date.now()
}

const note = async (supabase, id, fields) => {
  const { error } = await supabase.from('account_lifecycle_deletions').update(fields).eq('user_id', id)
  if (error) console.error('[account-deletion] journal update failed', id, error.message)
  return !error
}

// Leftover cleanup for an account whose Auth user is already gone. Safe to repeat.
async function sweepLeftovers(supabase, id) {
  await removeUserMedia(supabase, id)
  // public.scenes.user_id is TEXT with no FK to auth.users, so it is not cascaded.
  const { error } = await supabase.from('scenes').delete().eq('user_id', id)
  if (error) throw error
  await note(supabase, id, { phase: 'completed', completed_at: new Date().toISOString(), last_error: null })
}

async function cancelHold(supabase, id, reason) {
  const { error } = await supabase.auth.admin.updateUserById(id, { ban_duration: 'none' })
  if (error) throw error
  await note(supabase, id, { phase: 'cancelled', last_error: reason })
}

/**
 * @param supabase  service-role client
 * @param queue     [{ user, track, anchor, finalNoticeSentAt, lastActivity }] accounts that passed
 *                  mayExecuteIrreversible this run
 * @param opts      { now, maxPerRun }
 * @returns counts
 */
export async function runDeletions(supabase, queue, { now = new Date(), maxPerRun = 10 } = {}) {
  const result = { held: 0, purged: 0, cancelled: 0, waiting: 0, swept: 0, failed: 0, skipped: 0, remaining: 0 }
  let attempts = 0
  const budget = () => attempts < maxPerRun
  const iso = (d) => (d ? new Date(d).toISOString() : null)

  // 1. Finish cleanup for accounts whose Auth user is already gone (resumable).
  {
    const { data, error } = await supabase
      .from('account_lifecycle_deletions')
      .select('user_id')
      .eq('phase', 'purging')
    if (error) throw error
    const queuedIds = new Set(queue.map((q) => q.user.id))
    for (const row of data || []) {
      if (queuedIds.has(row.user_id)) continue // account still exists: handled in step 2
      if (!budget()) { result.remaining += 1; continue }
      attempts += 1
      try { await sweepLeftovers(supabase, row.user_id); result.swept += 1 } catch (e) {
        console.error('[account-deletion] cleanup failed', row.user_id, e?.message)
        await note(supabase, row.user_id, { last_error: String(e?.message || e).slice(0, 300) })
        result.failed += 1
      }
    }
  }

  // 2. Hold / purge / cancel for accounts that reached the decision point.
  const ids = queue.map((q) => q.user.id)
  const journal = new Map()
  if (ids.length) {
    const { data, error } = await supabase.from('account_lifecycle_deletions').select('*').in('user_id', ids)
    if (error) throw error
    for (const row of data || []) journal.set(row.user_id, row)
  }

  for (const item of queue) {
    if (!budget()) { result.remaining += 1; continue }
    const id = item.user.id
    let row = journal.get(id)
    try {
      if (!UUID_RE.test(String(id))) throw new Error('refusing deletion for a non-uuid id')
      const { data: fresh, error: freshError } = await supabase.auth.admin.getUserById(id)
      if (freshError || !fresh?.user) throw freshError || new Error('user not found')
      const user = fresh.user
      const stillFree = lifecycleTrackFor(user) === 'free_inactive'
      const liveActivity = lastActivityAt(user)?.getTime()

      if (row?.phase === 'cancelled') {
        // Restored/cancelled for this same inactivity: stay cancelled until the account is used
        // again (otherwise a restored user would be re-held the next day, before they sign in).
        const cancelledAt = row.last_activity_at ? new Date(row.last_activity_at).getTime() : null
        if (cancelledAt !== null && cancelledAt === liveActivity) { result.skipped += 1; continue }
        // Activity moved on: this is a new cycle. Clear the old journal row.
        const { error } = await supabase.from('account_lifecycle_deletions').delete().eq('user_id', id)
        if (error) throw error
        row = undefined
      }

      if (!row) {
        // HOLD. The live check mirrors the sweep: still Free, same activity as the sweep read.
        if (!stillFree || liveActivity !== item.lastActivity?.getTime()) { result.skipped += 1; continue }
        attempts += 1
        const { error: claimError } = await supabase.from('account_lifecycle_deletions').insert({
          user_id: id,
          track: item.track,
          anchor_at: iso(item.anchor),
          final_notice_sent_at: iso(item.finalNoticeSentAt),
          phase: 'held',
          held_at: now.toISOString(),
          last_activity_at: iso(item.lastActivity),
        })
        if (claimError) {
          if (claimError.code === UNIQUE_VIOLATION) { result.skipped += 1; continue }
          throw claimError
        }
        const { error: banError } = await supabase.auth.admin.updateUserById(id, { ban_duration: BAN_DURATION })
        if (banError) {
          // Not blocked, so it must not stay claimed as held.
          await supabase.from('account_lifecycle_deletions').delete().eq('user_id', id)
          throw banError
        }
        result.held += 1
        continue
      }

      if (row.phase === 'completed') { result.skipped += 1; continue }

      if (row.phase === 'purging') {
        // Auth user still exists: a previous delete failed. Fall through to the purge checks.
      } else if (new Date(row.held_at).getTime() + HOLD_DAYS * DAY_MS > now.getTime()) {
        result.waiting += 1
        continue
      }

      // PURGE: every condition is re-checked against the live account.
      attempts += 1
      const heldActivity = row.last_activity_at ? new Date(row.last_activity_at).getTime() : null
      if (!isBlocked(user)) { await cancelHold(supabase, id, 'restored: sign-in no longer blocked'); result.cancelled += 1; continue }
      if (!stillFree || liveActivity !== heldActivity) {
        await cancelHold(supabase, id, 'returned or upgraded during the hold')
        result.cancelled += 1
        continue
      }
      // Claim the purge; only one worker can move held -> purging.
      if (row.phase === 'held') {
        const { data: claimed, error: claimError } = await supabase
          .from('account_lifecycle_deletions')
          .update({ phase: 'purging', attempts: (row.attempts || 0) + 1 })
          .eq('user_id', id)
          .eq('phase', 'held')
          .select('user_id')
        if (claimError) throw claimError
        if (!claimed || claimed.length === 0) { result.skipped += 1; continue }
      }
      const { error: deleteError } = await supabase.auth.admin.deleteUser(id)
      if (deleteError) {
        // Account is intact (and still blocked): go back to held so the next run retries.
        await note(supabase, id, { phase: 'held', last_error: String(deleteError.message || deleteError).slice(0, 300) })
        throw deleteError
      }
      result.purged += 1
      try { await sweepLeftovers(supabase, id) } catch (e) {
        // Account is gone; the 'purging' row makes the next run finish the cleanup.
        console.error('[account-deletion] cleanup failed', id, e?.message)
        await note(supabase, id, { last_error: String(e?.message || e).slice(0, 300) })
        result.failed += 1
      }
    } catch (e) {
      console.error('[account-deletion] failed', id, e?.message)
      result.failed += 1
    }
  }
  return result
}
