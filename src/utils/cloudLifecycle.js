// Cloud-expiry / inactive-account lifecycle (ROADMAP "Cloud-to-local transition").
//
// Pure date logic shared by the client (membership) and the server cron
// planner (api/cloud-lifecycle.js) so both always agree on the phase.
//
// Paid hosting (Lifetime, non-Founder):
//   active  -> warning (last 30 days before hosting ends) -> grace (90 days
//   after hosting ends: read + export + one-click Export All) -> archived
//   (cloud writes/uploads/sync stop) (data is
//   kept, never deleted by default; Local Mode keeps working).
// Free accounts:
//   active until 18 months of inactivity -> grace (90 days: warning + export)
//   -> delete_due (cloud writes stop) (full removal only if no response).
//
// Export is ALWAYS allowed in every phase.

export const DAY_MS = 24 * 60 * 60 * 1000
export const WARNING_DAYS = 30
export const GRACE_DAYS = 90
export const FREE_INACTIVITY_MONTHS = 18
export const FINAL_NOTICE_DAYS = 7

export const PHASES = Object.freeze({
  ACTIVE: 'active',
  WARNING: 'warning',
  GRACE: 'grace',
  ARCHIVED: 'archived',
  DELETE_DUE: 'delete_due',
})

function toDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function addMonths(date, months) {
  const d = new Date(date.getTime())
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

function result(phase, extra = {}) {
  return {
    phase,
    // Per the PRD, cloud writes/uploads/sync stop only AFTER the grace period;
    // during grace the account stays readable, exportable and (within Free
    // limits) writable. Export/read are never blocked in any phase.
    cloudWritesAllowed: phase !== PHASES.ARCHIVED && phase !== PHASES.DELETE_DUE,
    exportAllowed: true,
    expiresAt: null,
    graceEndsAt: null,
    graceDaysRemaining: null,
    daysUntilExpiry: null,
    notice: null,
    action: 'none',
    ...extra,
  }
}

// Which one-off notice is due right now (each key is sent at most once).
function noticeFor(phase, { daysUntilExpiry, graceDaysRemaining }) {
  if (phase === PHASES.WARNING) {
    if (daysUntilExpiry <= FINAL_NOTICE_DAYS) return 'expiry-7d'
    return 'expiry-30d'
  }
  if (phase === PHASES.GRACE) {
    if (graceDaysRemaining <= FINAL_NOTICE_DAYS) return 'grace-final'
    return 'grace-start'
  }
  return null
}

/**
 * @param {object} input
 * @param {'paid_hosting'|'free'|'none'} input.kind  paid_hosting = Lifetime non-Founder
 * @param {Date|string} input.now
 * @param {Date|string|null} input.hostingEndsAt     paid_hosting only
 * @param {Date|string|null} input.lastActivityAt    free only (last sign-in/save)
 */
export function computeCloudLifecycle({ kind, now, hostingEndsAt, lastActivityAt } = {}) {
  const nowDate = toDate(now) || new Date()
  if (kind === 'paid_hosting') {
    const expires = toDate(hostingEndsAt)
    if (!expires) return result(PHASES.ACTIVE)
    const daysUntilExpiry = Math.ceil((expires.getTime() - nowDate.getTime()) / DAY_MS)
    if (nowDate < expires) {
      if (daysUntilExpiry <= WARNING_DAYS) {
        const r = result(PHASES.WARNING, { expiresAt: expires, daysUntilExpiry })
        return { ...r, notice: noticeFor(PHASES.WARNING, { daysUntilExpiry }), action: 'notify' }
      }
      return result(PHASES.ACTIVE, { expiresAt: expires, daysUntilExpiry })
    }
    const graceEndsAt = new Date(expires.getTime() + GRACE_DAYS * DAY_MS)
    if (nowDate < graceEndsAt) {
      const graceDaysRemaining = Math.ceil((graceEndsAt.getTime() - nowDate.getTime()) / DAY_MS)
      return result(PHASES.GRACE, {
        expiresAt: expires, graceEndsAt, graceDaysRemaining,
        notice: noticeFor(PHASES.GRACE, { graceDaysRemaining }), action: 'notify',
      })
    }
    // Paid data is archived, never deleted by default.
    return result(PHASES.ARCHIVED, { expiresAt: expires, graceEndsAt, graceDaysRemaining: 0, action: 'archive' })
  }

  if (kind === 'free') {
    const last = toDate(lastActivityAt)
    if (!last) return result(PHASES.ACTIVE)
    const inactiveSince = addMonths(last, FREE_INACTIVITY_MONTHS)
    if (nowDate < inactiveSince) {
      return result(PHASES.ACTIVE, { expiresAt: inactiveSince, daysUntilExpiry: Math.ceil((inactiveSince - nowDate) / DAY_MS) })
    }
    const graceEndsAt = new Date(inactiveSince.getTime() + GRACE_DAYS * DAY_MS)
    if (nowDate < graceEndsAt) {
      const graceDaysRemaining = Math.ceil((graceEndsAt.getTime() - nowDate.getTime()) / DAY_MS)
      return result(PHASES.GRACE, {
        expiresAt: inactiveSince, graceEndsAt, graceDaysRemaining,
        notice: noticeFor(PHASES.GRACE, { graceDaysRemaining }), action: 'notify',
      })
    }
    return result(PHASES.DELETE_DUE, { expiresAt: inactiveSince, graceEndsAt, graceDaysRemaining: 0, action: 'delete' })
  }

  return result(PHASES.ACTIVE)
}
