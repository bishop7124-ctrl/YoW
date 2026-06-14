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

// ── Billing config ────────────────────────────────────────────────────────────
// These values drive all client-side copy. Stripe is the source of truth for
// actual amounts — update both here and your Stripe product if the fee changes.
export const HOSTING_RENEWAL_FEE_GBP = 6          // £/year shown to users
export const HOSTING_INCLUDED_YEARS  = 3          // years of cloud hosting included with Lifetime
export const HOSTING_RENEWAL_WARNING_DAYS = 30    // warn this many days before renewal is due
export const FOUNDER_SLOTS_TOTAL = 100            // also enforced server-side via app_config

// Legacy aliases kept so any code still referencing the old names doesn't break.
export const MAINTENANCE_FEE_GBP = HOSTING_RENEWAL_FEE_GBP
export const MAINTENANCE_WARNING_DAYS = HOSTING_RENEWAL_WARNING_DAYS

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
    longDescription: `Pay once and own the platform as it stands. Unlimited projects, premium exports, and all current features. Includes ${HOSTING_INCLUDED_YEARS} years of cloud hosting, storage, backups and sync. After that, cloud access renews at £${HOSTING_RENEWAL_FEE_GBP}/year — a small fee to cover ongoing hosting costs, not to generate profit.`,
    features: [
      'Unlimited projects',
      '8 GB storage',
      'Premium exports (DOCX, PDF, ZIP)',
      'Bring-your-own-key AI',
      'Priority support',
      `${HOSTING_INCLUDED_YEARS} years of cloud hosting included`,
      `Cloud Hosting & Storage Renewal: £${HOSTING_RENEWAL_FEE_GBP}/year after that`,
      'Export your data any time',
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
    description: 'Become a named Founder of Your Own World. Limited slots. Lifetime cloud hosting included.',
    longDescription: 'For the writers who believe in this from the start. Founder status is permanent, visible, and limited — once the slots are gone, they\'re gone. Includes lifetime cloud hosting, storage, backups and sync with no annual renewal fee, ever.',
    features: [
      'Everything in Creator Lifetime',
      '15 GB storage',
      'Lifetime cloud hosting included',
      'No annual renewal fee — ever',
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

  // ── Cloud Hosting & Storage Renewal logic (lifetime non-founder users only) ──
  // Lifetime purchase includes HOSTING_INCLUDED_YEARS years of cloud hosting.
  // After that, users pay an annual Cloud Hosting & Storage Renewal to keep full access.
  // Founders have cloud hosting included for life — no renewal ever.
  // app_metadata fields set by the webhook:
  //   lifetime_purchased_at  — ISO date of original lifetime purchase
  //   maintenance_expires_at — ISO date cloud hosting is paid until (null = within included period)
  let isMaintenanceLapsed = false
  let maintenanceExpiresAt = null
  let maintenanceDaysRemaining = null
  let maintenanceWarning = false

  if (isLifetime && !isFounder) {
    const purchasedAt = dateFrom(user?.app_metadata?.lifetime_purchased_at) || createdAt || now
    const includedHostingEnds = new Date(purchasedAt.getTime() + HOSTING_INCLUDED_YEARS * 365 * DAY_MS)
    const paidUntil = dateFrom(user?.app_metadata?.maintenance_expires_at)

    if (paidUntil && paidUntil > now) {
      // Renewal actively paid
      maintenanceExpiresAt = paidUntil
      const msRemaining = paidUntil.getTime() - now.getTime()
      maintenanceDaysRemaining = Math.ceil(msRemaining / DAY_MS)
      maintenanceWarning = maintenanceDaysRemaining <= HOSTING_RENEWAL_WARNING_DAYS
    } else if (now < includedHostingEnds) {
      // Still within included hosting period
      maintenanceExpiresAt = includedHostingEnds
      const msRemaining = includedHostingEnds.getTime() - now.getTime()
      maintenanceDaysRemaining = Math.ceil(msRemaining / DAY_MS)
      maintenanceWarning = maintenanceDaysRemaining <= HOSTING_RENEWAL_WARNING_DAYS
    } else {
      // Included period ended, no valid renewal payment
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
