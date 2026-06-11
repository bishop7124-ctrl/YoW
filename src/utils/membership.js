export const TRIAL_DAYS = 28

const DAY_MS = 24 * 60 * 60 * 1000
const PAID_STATUSES = new Set(['active', 'trialing'])
const LIFETIME_PLAN_KEYS = new Set(['premium_lifetime', 'premium_plus_lifetime', 'founder'])

// Storage quotas in bytes per plan key.
// These are the canonical quota values — also used by storageQuota.js.
export const PLAN_STORAGE_BYTES = {
  free:                  250  * 1024 * 1024,        //  250 MB
  trial:                  1   * 1024 * 1024 * 1024,  //   1 GB
  premium_monthly:        5   * 1024 * 1024 * 1024,  //   5 GB
  premium_plus_lifetime:  8   * 1024 * 1024 * 1024,  //   8 GB
  founder:               15   * 1024 * 1024 * 1024,  //  15 GB
}

// Annual maintenance fee shown to users (display only — Stripe is the source of truth).
export const MAINTENANCE_FEE_GBP = 6
export const MAINTENANCE_WARNING_DAYS = 30

// Maximum founder slots. The API also reads from app_config; this is the client-side default.
export const FOUNDER_SLOTS_TOTAL = 100

// Ordered display list — also used by AccountSettings and PricingPage to render plan cards.
export const PLANS = [
  {
    key: 'free',
    label: 'Free',
    price: 0,
    interval: null,
    priceLabel: 'Free',
    priceSuffix: null,
    storageLabelShort: '250 MB',
    description: 'Start building your world. One active project, community support.',
    features: [
      '1 active project',
      '250 MB storage',
      'Basic exports',
      'Bring-your-own-key AI',
      'Community support',
    ],
    badge: null,
    highlight: false,
  },
  {
    key: 'premium_plus_lifetime',
    label: 'YOW Creator Lifetime',
    price: 199,
    interval: 'one_time',
    priceLabel: '£199',
    priceSuffix: 'once',
    storageLabelShort: '8 GB',
    description: 'Own YOW outright. One payment, unlimited projects, no subscription.',
    longDescription: 'Pay once and own the platform as it stands. Unlimited projects, premium exports, and all current features — no recurring fees in year one. A small annual maintenance fee of £6/year applies from year two to keep your data hosted and the app running.',
    features: [
      'Unlimited projects',
      '8 GB storage',
      'Premium exports (DOCX, PDF, ZIP)',
      'Bring-your-own-key AI',
      'Priority support',
      `£${MAINTENANCE_FEE_GBP}/year maintenance from year 2 (subject to change)`,
    ],
    badge: 'Best value',
    highlight: true,
  },
  {
    key: 'founder',
    label: 'YOW Founder',
    price: 499,
    interval: 'one_time',
    priceLabel: '£499',
    priceSuffix: 'once',
    storageLabelShort: '15 GB',
    description: 'Become a named Founder of Your Own World. Limited slots. Maintenance included forever.',
    longDescription: 'For the writers who believe in this from the start. Founder status is permanent, visible, and limited — once the slots are gone, they\'re gone. Includes lifetime maintenance with no annual fee, ever.',
    features: [
      'Everything in Creator Lifetime',
      '15 GB storage',
      'Maintenance fee included forever',
      'Permanent Founder badge',
      'Feature your debut work on YOW',
      'Founder recognition section',
      'Priority feature consideration',
    ],
    badge: 'Exclusive',
    highlight: false,
    isFounder: true,
  },
  {
    key: 'premium_monthly',
    label: 'YOW Monthly Creator',
    price: 10,
    interval: 'month',
    priceLabel: '£10',
    priceSuffix: '/month',
    storageLabelShort: '5 GB',
    description: 'Full platform access on a flexible monthly subscription. Cancel any time.',
    features: [
      'Full platform access',
      '5 GB storage',
      'Future updates included',
      'Cancel any time',
    ],
    badge: null,
    highlight: false,
  },
]

const dateFrom = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

export function getMembership(user) {
  const createdAt = dateFrom(user?.created_at || user?.createdAt)
  const trialStartedAt = dateFrom(user?.user_metadata?.trial_started_at) || createdAt || new Date()
  const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * DAY_MS)
  const now = new Date()

  const subscriptionStatus = user?.app_metadata?.subscription_status || user?.user_metadata?.subscription_status || 'none'
  const subscriptionPlan = user?.app_metadata?.subscription_plan || user?.user_metadata?.subscription_plan || null
  const isLifetime = LIFETIME_PLAN_KEYS.has(subscriptionPlan)
  const isFounder = subscriptionPlan === 'founder'

  const isPaid = PAID_STATUSES.has(subscriptionStatus) || isLifetime
  const isTrialActive = !isPaid && now < trialEndsAt
  const daysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS))
  const isFree = !isPaid && !isTrialActive

  // wasMonthly: downgraded from a monthly subscription — active project is locked
  const wasMonthly = isFree && (user?.user_metadata?.was_monthly === true)
  const freeProjectId = isFree ? (user?.user_metadata?.free_project_id ?? null) : null

  // 'plan' is the tier category used for CSS badge classes
  const plan = isPaid ? 'paid' : isTrialActive ? 'trial' : 'free'

  const activePlanKey = isPaid
    ? (subscriptionPlan || 'premium_monthly')
    : isTrialActive
      ? 'trial'
      : 'free'

  const activePlanDef = PLANS.find(p => p.key === activePlanKey)
    || PLANS.find(p => p.key === 'premium_monthly') // trial fallback for display

  const storageQuotaBytes = PLAN_STORAGE_BYTES[activePlanKey] ?? PLAN_STORAGE_BYTES.free

  // ── Maintenance fee logic (lifetime non-founder users only) ──────────────
  // Year 1 is free. From year 2, a small annual maintenance fee applies.
  // Founders have maintenance included forever.
  // app_metadata fields set by the webhook:
  //   lifetime_purchased_at  — ISO date of original lifetime purchase
  //   maintenance_expires_at — ISO date maintenance is paid until (null = never paid)
  let isMaintenanceLapsed = false
  let maintenanceExpiresAt = null
  let maintenanceDaysRemaining = null
  let maintenanceWarning = false

  if (isLifetime && !isFounder) {
    const purchasedAt = dateFrom(user?.app_metadata?.lifetime_purchased_at) || createdAt || now
    const yearOneEnds = new Date(purchasedAt.getTime() + 365 * DAY_MS)
    const paidUntil = dateFrom(user?.app_metadata?.maintenance_expires_at)

    if (paidUntil && paidUntil > now) {
      // Maintenance actively paid
      maintenanceExpiresAt = paidUntil
      const msRemaining = paidUntil.getTime() - now.getTime()
      maintenanceDaysRemaining = Math.ceil(msRemaining / DAY_MS)
      maintenanceWarning = maintenanceDaysRemaining <= MAINTENANCE_WARNING_DAYS
    } else if (now < yearOneEnds) {
      // Still in free year 1
      maintenanceExpiresAt = yearOneEnds
      const msRemaining = yearOneEnds.getTime() - now.getTime()
      maintenanceDaysRemaining = Math.ceil(msRemaining / DAY_MS)
      maintenanceWarning = maintenanceDaysRemaining <= MAINTENANCE_WARNING_DAYS
    } else {
      // Year 1 ended, no valid maintenance payment
      isMaintenanceLapsed = true
    }
  }

  return {
    plan,
    subscriptionPlan,
    activePlanKey,
    activePlanDef,
    subscriptionStatus,
    isPaid,
    isLifetime,
    isFounder,
    isTrialActive,
    isFree,
    isReadOnly: false,
    freeProjectId,
    wasMonthly,
    trialStartedAt,
    trialEndsAt,
    daysRemaining,
    storageQuotaBytes,
    isMaintenanceLapsed,
    maintenanceExpiresAt,
    maintenanceDaysRemaining,
    maintenanceWarning,
    priceLabel: '£10/pm', // legacy compat
  }
}
