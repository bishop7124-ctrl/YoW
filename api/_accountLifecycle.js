// Cloud-expiry / inactive-account lifecycle policy (docs/ROADMAP.md, "PRD: Lifetime
// Local Mode" and Sprint day 1 Oct). Pure functions only: no I/O, no clock reads
// except through the `now` argument, so every stage is unit-testable.
//
// Two tracks, both with a 90-day grace window:
//   hosting_lapsed — Lifetime (non-Founder) whose included/renewed cloud hosting ended.
//                    Warnings before expiry, then grace, then ARCHIVE. Never deleted.
//   free_inactive  — Free account with no sign-in for 18 months. Warnings, then grace,
//                    then DELETE only if the final notice was sent and nobody responded.
//
// Export is never blocked at any stage. Cloud writes stop only once the grace window
// has ended (archive_due / delete_due / archived).

export const DAY_MS = 24 * 60 * 60 * 1000
export const GRACE_DAYS = 90
export const PRE_EXPIRY_WARNING_DAYS = 30
export const FREE_INACTIVITY_DAYS = 548 // 18 months
// The final notice must have been sent at least this long before any irreversible step.
export const FINAL_NOTICE_MIN_LEAD_DAYS = 7

export const TRACKS = Object.freeze({
  HOSTING_LAPSED: 'hosting_lapsed',
  FREE_INACTIVE: 'free_inactive',
})

export const STAGES = Object.freeze({
  NONE: 'none',
  ACTIVE: 'active',
  PRE_EXPIRY: 'pre_expiry',
  GRACE: 'grace',
  ARCHIVE_DUE: 'archive_due',
  DELETE_DUE: 'delete_due',
  ARCHIVED: 'archived',
})

// Notice schedule, in days relative to the anchor (negative = before expiry, for the
// hosting track; for the inactivity track day 0 is the day the 18-month mark is crossed).
// `final` notices carry the "Export all data" button.
export const NOTICE_SCHEDULE = Object.freeze({
  [TRACKS.HOSTING_LAPSED]: [
    { key: 'pre_30', day: -30, final: false },
    { key: 'pre_14', day: -14, final: false },
    { key: 'pre_7', day: -7, final: false },
    { key: 'pre_1', day: -1, final: false },
    { key: 'grace_0', day: 0, final: false },
    { key: 'grace_30', day: 30, final: false },
    { key: 'grace_60', day: 60, final: false },
    { key: 'grace_83', day: GRACE_DAYS - FINAL_NOTICE_MIN_LEAD_DAYS, final: true },
  ],
  [TRACKS.FREE_INACTIVE]: [
    { key: 'inactive_0', day: 0, final: false },
    { key: 'inactive_30', day: 30, final: false },
    { key: 'inactive_60', day: 60, final: false },
    { key: 'inactive_83', day: GRACE_DAYS - FINAL_NOTICE_MIN_LEAD_DAYS, final: true },
  ],
})

const toDate = (value) => {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const wholeDaysBetween = (from, to) => Math.floor((to.getTime() - from.getTime()) / DAY_MS)

/**
 * Which track (if any) applies to a Supabase auth user. Anything that could be a paying
 * or protected account returns null so the sweep can never touch it.
 */
export function lifecycleTrackFor(user) {
  if (!user) return null
  const app = user.app_metadata || {}
  const meta = user.user_metadata || {}
  if (meta.lifecycle_hold === true || app.lifecycle_hold === true) return null
  if (app.is_admin === true || app.role === 'admin') return null
  if (app.subscription_plan === 'founder') return null

  const status = app.subscription_status
  const plan = app.subscription_plan
  const isLifetime = plan === 'premium_lifetime' || plan === 'premium_plus_lifetime'
  if (isLifetime) return TRACKS.HOSTING_LAPSED
  // Any other entitlement (monthly, trialing, beta, unknown plan) is never swept.
  if (status === 'active' || status === 'trialing' || app.beta_tester === true || (plan && plan !== 'free')) return null
  if (app.stripe_customer_id || app.has_stripe_customer) return null
  return TRACKS.FREE_INACTIVE
}

/** The date the hosting track counts from: end of paid/included hosting. */
export function hostingEndsAt(user, { includedYears = 1 } = {}) {
  const app = user?.app_metadata || {}
  const paidUntil = toDate(app.cloud_hosting_expires_at) || toDate(app.maintenance_expires_at)
  if (paidUntil) return paidUntil
  const explicitlyIncludedUntil = toDate(app.hosting_included_until)
  if (explicitlyIncludedUntil) return explicitlyIncludedUntil
  const purchased = toDate(app.lifetime_purchased_at) || toDate(user?.created_at)
  if (!purchased) return null
  return new Date(purchased.getTime() + includedYears * 365 * DAY_MS)
}

/** The date the inactivity track counts from: last sign-in (or signup if never). */
export function lastActivityAt(user) {
  const signIn = toDate(user?.last_sign_in_at)
  const created = toDate(user?.created_at)
  if (signIn && created) return signIn > created ? signIn : created
  return signIn || created
}

/**
 * Classify one account.
 * @param {{track:string, anchor:Date|string, now:Date, sentNoticeKeys?:Iterable<string>, archivedAt?:Date|string|null}} input
 *  For hosting_lapsed `anchor` is the hosting end date; for free_inactive it is the last
 *  activity date (the 18-month mark is derived from it).
 * @returns {{track, stage, dayOffset, dueNotice, finalNoticeSent, action, cloudWritesAllowed, exportAllowed}}
 */
export function classifyLifecycle({ track, anchor, now, sentNoticeKeys = [], archivedAt = null }) {
  const anchorDate = toDate(anchor)
  const nowDate = toDate(now)
  const schedule = NOTICE_SCHEDULE[track]
  if (!schedule || !anchorDate || !nowDate) {
    return result(track, STAGES.NONE, null, null, false, 'none')
  }

  const sent = new Set(sentNoticeKeys)
  // Day 0 = hosting end, or the moment 18 months of inactivity is reached.
  const day0 = track === TRACKS.FREE_INACTIVE
    ? new Date(anchorDate.getTime() + FREE_INACTIVITY_DAYS * DAY_MS)
    : anchorDate
  const dayOffset = wholeDaysBetween(day0, nowDate)
  const finalKey = schedule.find((n) => n.final).key
  const finalNoticeSent = sent.has(finalNoticeKeyFor(track))

  if (archivedAt) return result(track, STAGES.ARCHIVED, dayOffset, null, finalNoticeSent, 'none')

  let stage
  if (dayOffset < -PRE_EXPIRY_WARNING_DAYS) stage = STAGES.ACTIVE
  else if (dayOffset < 0) stage = track === TRACKS.HOSTING_LAPSED ? STAGES.PRE_EXPIRY : STAGES.ACTIVE
  else if (dayOffset < GRACE_DAYS) stage = STAGES.GRACE
  else stage = track === TRACKS.HOSTING_LAPSED ? STAGES.ARCHIVE_DUE : STAGES.DELETE_DUE

  // Oldest notice that has come due but not been sent, so a missed cron day catches up
  // one notice per run rather than skipping straight to the end.
  const dueNotice = stage === STAGES.ARCHIVE_DUE || stage === STAGES.DELETE_DUE || stage === STAGES.ACTIVE
    ? null
    : schedule.find((n) => n.day <= dayOffset && !sent.has(n.key))?.key || null

  // Irreversible step is only allowed once the final notice really went out, early
  // enough, and is recorded. Otherwise the account stays in a holding state and the
  // missing final notice is the next action.
  let action = 'none'
  let held = null
  if (stage === STAGES.ARCHIVE_DUE || stage === STAGES.DELETE_DUE) {
    const verb = stage === STAGES.ARCHIVE_DUE ? 'archive' : 'delete'
    if (finalNoticeSent) {
      action = verb
    } else {
      action = 'send_final_notice_first'
      held = finalKey
    }
  }

  return result(track, stage, dayOffset, dueNotice || held, finalNoticeSent, action)
}

/**
 * An archive stamp (app_metadata.cloud_archived_at) only counts if it is newer than the
 * current hosting end date, so a stamp from an earlier lapse (before a renewal) is ignored.
 */
export function isArchiveStampCurrent(stamp, hostingEnd) {
  const s = toDate(stamp)
  const h = toDate(hostingEnd)
  return Boolean(s && h && s > h)
}

export function finalNoticeKeyFor(track) {
  return NOTICE_SCHEDULE[track].find((n) => n.final).key
}

function result(track, stage, dayOffset, dueNotice, finalNoticeSent, action) {
  return {
    track,
    stage,
    dayOffset,
    dueNotice,
    finalNoticeSent,
    action,
    // Cloud writes stop only after grace; reading and exporting never stop.
    cloudWritesAllowed: ![STAGES.ARCHIVE_DUE, STAGES.DELETE_DUE, STAGES.ARCHIVED].includes(stage),
    exportAllowed: true,
  }
}

/**
 * An irreversible step also needs fresh proof the account has not come back and that
 * the final notice was sent early enough (`finalNoticeSentAt` ISO date).
 */
export function mayExecuteIrreversible({ classification, finalNoticeSentAt, lastActivity, anchorSeenAtNotice, now }) {
  if (!['archive', 'delete'].includes(classification.action)) return false
  const sentAt = toDate(finalNoticeSentAt)
  const nowDate = toDate(now)
  if (!sentAt || !nowDate) return false
  if (wholeDaysBetween(sentAt, nowDate) < FINAL_NOTICE_MIN_LEAD_DAYS) return false
  // Any sign-in after the first inactivity warning counts as a response and resets the clock.
  const seen = toDate(anchorSeenAtNotice)
  const activity = toDate(lastActivity)
  if (classification.track === TRACKS.FREE_INACTIVE && seen && activity && activity > seen) return false
  return true
}

// ── Customer-visible notice copy (owner approves this wording) ───────────────────
const SUPPORT = 'support@yourownworld.co.uk'

/** Date the 90-day grace ends (free_inactive: deletion date; hosting_lapsed: archive date). */
export function graceEndsAt(track, anchor) {
  const a = toDate(anchor)
  if (!a) return null
  const day0 = track === TRACKS.FREE_INACTIVE ? new Date(a.getTime() + FREE_INACTIVITY_DAYS * DAY_MS) : a
  return new Date(day0.getTime() + GRACE_DAYS * DAY_MS)
}

const formatDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

// Same look as the other YOW emails (supabase/functions/send-reengagement-email): dark teal card,
// "Your Own World" header, eyebrow, serif heading, orange button, footer. Every dynamic value is
// escaped. The plain-text part (buildNotice().text) stays as the fallback.
function renderNoticeHtml({ subject, eyebrow, lines, exportLine, supportLine, ctaLabel, siteUrl }) {
  const paragraphs = lines
    .map((line) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#7ab8b4;">${escapeHtml(line)}</p>`)
    .join('\n              ')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:transparent;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:transparent;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

          <tr>
            <td style="background:#133840;border-radius:12px 12px 0 0;padding:24px 40px;border-bottom:1px solid #1e4a50;text-align:center;">
              <span style="font-family:'Georgia',serif;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#7ab8b4;">
                Your Own World
              </span>
            </td>
          </tr>

          <tr>
            <td style="background:#0d282e;padding:40px 40px 32px;border-left:1px solid #1e4a50;border-right:1px solid #1e4a50;">

              <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#e8724e;">
                ${escapeHtml(eyebrow)}
              </p>
              <h1 style="margin:0 0 20px;font-size:26px;line-height:1.3;color:#e2f0ee;font-weight:400;">
                ${escapeHtml(subject)}
              </h1>

              ${paragraphs}

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px;">
                <tr>
                  <td style="background:#133840;border:1px solid #1e4a50;border-radius:8px;padding:16px 20px;">
                    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#e8724e;">
                      How to export all your data
                    </p>
                    <p style="margin:0;font-size:14px;line-height:1.7;color:#e2f0ee;">
                      ${escapeHtml(exportLine)}
                    </p>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#e8724e;border-radius:8px;">
                    <a href="${escapeHtml(siteUrl)}"
                       style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;
                              color:#ffffff;text-decoration:none;letter-spacing:0.04em;font-family:'Georgia',serif;">
                      ${escapeHtml(ctaLabel)} &#8594;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#5d9490;">
                ${escapeHtml(supportLine)}
              </p>

            </td>
          </tr>

          <tr>
            <td style="background:#133840;border-radius:0 0 12px 12px;padding:18px 40px 24px;border:1px solid #1e4a50;border-top:none;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#7ab8b4;">
                Your Own World &middot; <a href="${escapeHtml(siteUrl)}" style="color:#7ab8b4;text-decoration:none;">yourownworld.co.uk</a>
              </p>
              <p style="margin:0;font-size:11px;color:#4a8a86;">
                This is an important notice about your account.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function buildNotice({ track, noticeKey, daysLeft, deadline = null, siteUrl = 'https://www.yourownworld.co.uk' }) {
  const entry = NOTICE_SCHEDULE[track]?.find((n) => n.key === noticeKey)
  if (!entry) return null
  const exportUrl = `${siteUrl}/`
  const isHosting = track === TRACKS.HOSTING_LAPSED
  const before = entry.day < 0
  const subject = isHosting
    ? (before
      ? `Your YOW cloud hosting ends in ${Math.abs(entry.day)} day${Math.abs(entry.day) === 1 ? '' : 's'}`
      : entry.final
        ? 'Last chance to export your YOW projects from the cloud'
        : 'Your YOW cloud hosting has ended: your writing is safe')
    : (entry.final
      ? 'Last chance to export your YOW projects before your account is removed'
      : 'We have not seen you in a while: your YOW account')

  const lines = []
  if (isHosting) {
    lines.push(before
      ? 'Your included cloud hosting is about to end. Your lifetime app licence is not affected, and YOW keeps working in Local Mode on your computer.'
      : `Your cloud hosting has ended. Your lifetime app licence is active and your projects remain readable and exportable for ${GRACE_DAYS} days${typeof daysLeft === 'number' ? ` (${Math.max(daysLeft, 0)} left)` : ''}.`)
    lines.push('You can renew cloud hosting for £6 a year to keep everything in sync, or export all your data and carry on in Local Mode.')
    lines.push(entry.final
      ? `After the ${GRACE_DAYS}-day period your cloud copy is archived, not deleted, and stops accepting new cloud writes. Exports stay available any time; contact ${SUPPORT} and we will help you retrieve archived data.`
      : 'Nothing is deleted. Exporting takes a minute.')
  } else {
    const when = toDate(deadline) ? formatDate(toDate(deadline)) : `${GRACE_DAYS} days from the date of this email`
    lines.push('Your free YOW account has not been used for 18 months.')
    lines.push(`Log in by ${when}, or on ${when} your account and all its data will be deleted. Logging in once is enough to keep it exactly as it is.`)
    lines.push(entry.final
      ? 'Before then you can also export everything so you have your own copy, using the instructions below.'
      : 'You can also export all your projects at any time so you have your own copy, using the instructions below.')
    lines.push('Want to keep YOW for good? Upgrade to Lifetime for lifetime access to the YOW app.')
  }
  const exportLine = `Sign in at ${exportUrl} then open Account Settings > Storage > Export all projects`
  const supportLine = `Questions? Reply to this email or write to ${SUPPORT}.`
  const text = [...lines, '', `How to export all your data: ${exportLine}`, '', supportLine].join('\n')
  const html = renderNoticeHtml({
    subject,
    eyebrow: entry.final ? 'Final notice' : 'Account notice',
    lines,
    exportLine,
    supportLine,
    ctaLabel: isHosting ? 'Open Your Own World' : 'Log in to keep your account',
    siteUrl: exportUrl,
  })
  return { subject, text, html, exportUrl, final: entry.final }
}
