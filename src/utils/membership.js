import { BILLING } from './billingConfig'

export const TRIAL_DAYS = 28

const DAY_MS = 24 * 60 * 60 * 1000
const PAID_STATUSES = new Set(['active', 'trialing'])
const LIFETIME_PLAN_KEYS = new Set(['premium_lifetime', 'premium_plus_lifetime', 'founder'])

// Storage quotas in bytes per plan key.
// These are the canonical quota values — also used by storageQuota.js.
export const PLAN_STORAGE_BYTES = {
  free:                  5    * 1024 * 1024,        //   5 MB
  trial:                  1   * 1024 * 1024 * 1024,  //   1 GB
  premium_monthly:        5   * 1024 * 1024 * 1024,  //   5 GB
  premium_plus_lifetime:  8   * 1024 * 1024 * 1024,  //   8 GB
  founder:               15   * 1024 * 1024 * 1024,  //  15 GB
}

// ── Billing config ────────────────────────────────────────────────────────────
// These values drive all client-side copy. Stripe is the source of truth for
// actual amounts — update both here and your Stripe product if the fee changes.
export const HOSTING_RENEWAL_FEE_GBP = BILLING.hostingRenewalPrice
export const HOSTING_INCLUDED_YEARS = BILLING.hostingIncludedYears
export const HOSTING_RENEWAL_WARNING_DAYS = BILLING.hostingRenewalWarningDays
export const FOUNDER_SLOTS_TOTAL = BILLING.founderSlotsTotal

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
    storageLabelShort: '5 MB',
    description: 'A text-first starter workspace. One active cloud project, community support.',
    features: [
      '1 active text-first cloud project',
      '5 MB cloud storage',
      'Map Builder visible but locked',
      'No AI tools',
      'DOCX, PDF & ZIP export',
      'Community support',
    ],
    badge: null,
    highlight: false,
  },
  {
    key: 'premium_plus_lifetime',
    label: 'Lifetime',
    price: BILLING.lifetimePrice,
    interval: 'one_time',
    priceLabel: `£${BILLING.lifetimePrice}`,
    priceSuffix: 'once',
    storageLabelShort: '8 GB',
    description: 'Own the YOW app outright. Local Mode is permanent; cloud hosting is included for 3 years.',
    longDescription: `Pay once for permanent app access, unlimited local projects, and all current features. Includes ${HOSTING_INCLUDED_YEARS} years of Cloud Mode for sync, hosted storage, and backups. After that, the desktop app keeps working in Local Mode forever and web cloud access falls back to Free limits unless you renew Cloud Mode at £${HOSTING_RENEWAL_FEE_GBP}/year.`,
    features: [
      'Unlimited projects',
      'Permanent Local Mode access',
      '8 GB storage',
      'Bring-your-own-key AI',
      'Priority support',
      `${HOSTING_INCLUDED_YEARS} years of Cloud Mode included`,
      `Cloud hosting renewal: £${HOSTING_RENEWAL_FEE_GBP}/year after that`,
      'Export your data any time',
    ],
    badge: 'Best value',
    highlight: true,
  },
  {
    key: 'founder',
    label: 'Founder',
    price: BILLING.founderPrice,
    interval: 'one_time',
    priceLabel: `£${BILLING.founderPrice}`,
    priceSuffix: 'once',
    storageLabelShort: '15 GB',
    description: 'Founder status, permanent app access, and lifetime Cloud Mode within fair-use limits.',
    longDescription: 'For the writers who believe in this from the start. Founder status is permanent, visible, and limited. Includes lifetime Cloud Mode for hosted storage, backups, and sync within the published fair-use cap.',
    features: [
      'Everything in Lifetime',
      '15 GB storage',
      'Lifetime Cloud Mode included',
      'No annual hosting renewal fee',
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
    label: 'Monthly',
    price: BILLING.monthlyPrice,
    interval: 'month',
    priceLabel: `£${BILLING.monthlyPrice}`,
    priceSuffix: '/month',
    storageLabelShort: '5 GB',
    description: 'Full app access and Cloud Mode while subscribed. Cancel any time.',
    features: [
      'Full platform access',
      'Cloud Mode while subscribed',
      'Local Mode available',
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

  // 'plan' is the tier category used for CSS badge classes
  const plan = isPaid ? 'paid' : isTrialActive ? 'trial' : 'free'

  const activePlanKey = isPaid
    ? (subscriptionPlan || 'premium_monthly')
    : isTrialActive
      ? 'trial'
      : 'free'

  const activePlanDef = PLANS.find(p => p.key === activePlanKey)
    || PLANS.find(p => p.key === 'premium_monthly') // trial fallback for display

  // ── Cloud hosting renewal logic (lifetime non-founder users only) ──
  // Lifetime purchase includes HOSTING_INCLUDED_YEARS years of cloud hosting.
  // After that, users can renew Cloud Mode or continue in Local Mode.
  // Founders have cloud hosting included for life — no renewal ever.
  // app_metadata fields set by the webhook:
  //   lifetime_purchased_at  — ISO date of original lifetime purchase
  //   maintenance_expires_at — ISO date cloud hosting is paid until (null = within included period)
  let isMaintenanceLapsed = false
  let isCloudFreeFallback = false
  let maintenanceExpiresAt = null
  let maintenanceDaysRemaining = null
  let maintenanceWarning = false
  let cloudHostingStatus = isPaid || isTrialActive ? 'active' : 'free'
  let cloudHostingLabel = isPaid || isTrialActive ? 'Cloud Mode' : 'Free Cloud Mode'

  if (isLifetime && !isFounder) {
    const purchasedAt = dateFrom(user?.app_metadata?.lifetime_purchased_at) || createdAt || now
    const includedHostingEnds = new Date(purchasedAt.getTime() + HOSTING_INCLUDED_YEARS * 365 * DAY_MS)
    const paidUntil = dateFrom(user?.app_metadata?.cloud_hosting_expires_at)
      || dateFrom(user?.app_metadata?.maintenance_expires_at)

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
      isCloudFreeFallback = true
      cloudHostingStatus = 'lapsed'
      cloudHostingLabel = 'Local Mode + Free Cloud'
    }
  } else if (isFounder) {
    cloudHostingStatus = 'founder'
    cloudHostingLabel = 'Cloud Mode'
  } else if (!isPaid && !isTrialActive) {
    cloudHostingStatus = 'free'
    cloudHostingLabel = 'Free Cloud Mode'
  }

  const isCloudMode = cloudHostingStatus !== 'lapsed'
  const isLocalMode = cloudHostingStatus === 'lapsed'
  const usesFreeCloudLimits = isFree || isCloudFreeFallback
  const freeProjectId = usesFreeCloudLimits ? (user?.user_metadata?.free_project_id ?? null) : null
  const storageQuotaBytes = usesFreeCloudLimits
    ? PLAN_STORAGE_BYTES.free
    : PLAN_STORAGE_BYTES[activePlanKey] ?? PLAN_STORAGE_BYTES.free

  return {
    plan,
    subscriptionPlan,
    activePlanKey,
    activePlanDef,
    subscriptionStatus,
    isPaid,
    isLifetime,
    isFounder,
    // Desktop app access is a Lifetime/Founder entitlement (PRD Phase 4).
    // Browser plan behavior is unchanged — this only gates the desktop shell.
    isDesktopEntitled: isLifetime,
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
    isCloudFreeFallback,
    usesFreeCloudLimits,
    cloudHostingStatus,
    cloudHostingLabel,
    isCloudMode,
    isLocalMode,
    canSyncCloud: isCloudMode || isCloudFreeFallback,
    maintenanceExpiresAt,
    maintenanceDaysRemaining,
    maintenanceWarning,
    priceLabel: `£${BILLING.monthlyPrice}/pm`, // legacy compat
  }
}
