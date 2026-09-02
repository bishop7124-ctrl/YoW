import { BILLING } from './billingConfig'

export const TRIAL_DAYS = 28

const DAY_MS = 24 * 60 * 60 * 1000
const PAID_STATUSES = new Set(['active', 'trialing'])
const LIFETIME_PLAN_KEYS = new Set(['premium_lifetime', 'premium_plus_lifetime', 'founder'])
const BETA_TESTER_PLAN_KEY = 'beta_tester'

const BETA_TESTER_PLAN = {
  key: BETA_TESTER_PLAN_KEY,
  label: 'Beta Tester',
  price: 0,
  interval: null,
  priceLabel: 'Beta',
  priceSuffix: null,
  storageLabelShort: '15 GB',
  description: 'Full beta access while YOW is in beta.',
  features: [
    'Full app access during beta',
    'Unlimited projects',
    'AI tools and advanced features unlocked',
    'Beta access may be revoked when YOW leaves beta',
  ],
  badge: 'Beta',
  highlight: false,
}

// Legacy Supabase plan keys mapped to the current key used for display and quotas.
// The raw key stays in `subscriptionPlan` — it identifies live entitlements, never rename it.
const LEGACY_PLAN_KEY_ALIASES = {
  premium_lifetime: 'premium_plus_lifetime', // £149 Lifetime Launch plan
}

// Storage quotas in bytes per plan key.
// These are the canonical quota values — also used by storageQuota.js.
//
// Free is 250 MB (up from 5 MB as of the 2026-08-08 pricing overhaul) — enough
// for a full manuscript plus cover art and a handful of character/map images,
// so Free feels genuinely usable rather than a crippled trial. It's still a
// clear, honest step below the paid tiers.
export const PLAN_STORAGE_BYTES = {
  free:                  250  * 1024 * 1024,        // 250 MB
  trial:                  8   * 1024 * 1024 * 1024,  //   8 GB (mirrors Monthly/Lifetime so trials preview the real thing)
  beta_tester:           15   * 1024 * 1024 * 1024,  //  15 GB during beta
  premium_monthly:        8   * 1024 * 1024 * 1024,  //   8 GB
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
    storageLabelShort: '250 MB',
    description: 'One project, fully featured. Every core writing and worldbuilding tool, no card required.',
    features: [
      '1 project — not a demo, the real toolkit',
      'Manuscript, Codex, Timeline, Characters, Map Builder & more',
      '250 MB cloud storage',
      'Export to DOCX, PDF & ZIP any time',
    ],
    disclaimer: 'AI tools aren’t included on Free — connect your own AI provider on any paid plan.',
    badge: null,
    highlight: false,
  },
  {
    key: 'premium_monthly',
    label: 'Monthly',
    price: BILLING.monthlyPrice,
    interval: 'month',
    priceLabel: `£${BILLING.monthlyPrice}`,
    priceSuffix: '/month',
    storageLabelShort: '8 GB',
    description: 'Unlimited projects and the full web app, with cloud sync included. Cancel any time.',
    features: [
      'Unlimited projects',
      'Every writing & worldbuilding tool, unlocked',
      'Cloud sync across all your devices',
      '8 GB cloud storage',
      'Connect your own AI provider (ChatGPT, Claude and more)',
      'Cancel any time — no long-term contract',
    ],
    disclaimer: 'Desktop app not included on Monthly — see Lifetime to own it outright.',
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
    description: 'Everything in Monthly, plus the desktop app — pay once and own it outright.',
    longDescription: `One payment for everything in Monthly, the desktop app for Mac and Windows, and every future update — free, forever. Includes ${HOSTING_INCLUDED_YEARS} years of cloud sync; after that it's £${HOSTING_RENEWAL_FEE_GBP}/year to keep syncing, or switch to offline Local Mode for free, forever.`,
    keyBenefit: { icon: '🖥️', label: 'Includes the Desktop App' },
    valueNote: `Pays for itself in ${Math.round(BILLING.lifetimePrice / BILLING.monthlyPrice)} months vs Monthly — then every year after is free.`,
    features: [
      'Everything in Monthly — unlimited projects, full toolkit, 8 GB storage',
      'Desktop app for Mac & Windows',
      'Every future update, free, forever',
      `${HOSTING_INCLUDED_YEARS} years of cloud sync included`,
      `Then £${HOSTING_RENEWAL_FEE_GBP}/year to keep syncing — or Local Mode free, forever`,
      'One payment. No subscription, ever.',
    ],
    badge: 'Most Popular',
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
    description: 'Everything in Lifetime, plus permanent recognition as one of the first believers in YOW.',
    longDescription: `Everything in Lifetime, plus more storage and lifetime cloud sync with no renewal, ever. Founder status is permanent and limited to ${FOUNDER_SLOTS_TOTAL} writers, ever.`,
    keyBenefit: { icon: '✦', label: `Limited to ${FOUNDER_SLOTS_TOTAL} writers, ever` },
    features: [
      'Everything in Lifetime, plus:',
      '15 GB cloud storage',
      'Lifetime cloud sync — no renewal, ever',
      'Permanent Founder badge',
      'Feature your debut work on YOW',
      'Priority say in what we build next',
    ],
    badge: 'Exclusive',
    highlight: false,
    isFounder: true,
  },
]

const dateFrom = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

// ── Client-writable profile fields ──────────────────────────────────────────
// The account owner can write user_metadata directly via
// supabase.auth.updateUser() — through this app's AuthContext.updateProfile()
// or by calling the Supabase client SDK directly (devtools, a script with the
// anon key, etc.). Nothing in user_metadata is trustworthy for entitlement,
// which is why getMembership() above reads plan/status/beta/wasMonthly only
// from server-controlled app_metadata. This allowlist is a second, defensive
// layer: it keeps updateProfile() from ever writing (or round-tripping) an
// entitlement-shaped key into user_metadata in the first place, and — because
// every caller currently spreads the full existing user_metadata back in
// alongside the field it's actually changing — it also quietly drops any
// stale entitlement field a legacy write already left there. Only harmless,
// genuinely user-owned profile/preference fields belong here.
// See docs/YOW_CODE_AUDIT_2026-09-01.md P0-01.
export const PROFILE_METADATA_ALLOWLIST = new Set([
  'full_name',
  'theme',
  'theme_radius_unit',
  'theme_visual_strength',
  'custom_theme_colors',
  'tour_progress',
  'reengagement_opt_out',
  // The one free-tier project the user has chosen to keep editable — a
  // self-service pick among the user's own projects, not a privilege.
  'free_project_id',
])

export function sanitizeProfileMetadata(profile) {
  const clean = {}
  for (const key of Object.keys(profile || {})) {
    if (PROFILE_METADATA_ALLOWLIST.has(key)) clean[key] = profile[key]
  }
  return clean
}

export function getMembership(user) {
  const createdAt = dateFrom(user?.created_at || user?.createdAt)
  const serverMetadata = user?.app_metadata || {}
  const trialStartedAt = dateFrom(serverMetadata.trial_started_at) || createdAt || new Date()
  const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * DAY_MS)
  const now = new Date()

  // Entitlement data is server-controlled. Supabase user_metadata is editable
  // by the signed-in browser client and must never grant paid or beta access.
  const subscriptionStatus = serverMetadata.subscription_status || 'none'
  const subscriptionPlan = serverMetadata.subscription_plan || null
  // Whether this account has a real Stripe customer record. An account whose
  // plan was set directly via SQL (support/manual comps) is paid locally but
  // has no real Stripe subscription — the billing portal has nothing to act
  // on for it (see api/create-customer-portal.js).
  const hasStripeCustomer = !!serverMetadata.stripe_customer_id
  const isBetaTester = subscriptionPlan === BETA_TESTER_PLAN_KEY || serverMetadata.beta_tester === true
  const isLifetime = LIFETIME_PLAN_KEYS.has(subscriptionPlan)
  const isFounder = subscriptionPlan === 'founder'

  const isPaid = PAID_STATUSES.has(subscriptionStatus) || isLifetime || isBetaTester
  const isTrialActive = !isPaid && now < trialEndsAt
  const daysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS))
  const isFree = !isPaid && !isTrialActive

  // wasMonthly: downgraded from a monthly subscription — active project is locked
  const wasMonthly = isFree && (serverMetadata.was_monthly === true)

  // 'plan' is the tier category used for CSS badge classes
  const plan = isPaid ? 'paid' : isTrialActive ? 'trial' : 'free'

  const activePlanKey = isBetaTester
    ? BETA_TESTER_PLAN_KEY
    : isPaid
      ? (LEGACY_PLAN_KEY_ALIASES[subscriptionPlan] || subscriptionPlan || 'premium_monthly')
    : isTrialActive
      ? 'trial'
      : 'free'

  const activePlanDef = PLANS.find(p => p.key === activePlanKey)
    || (activePlanKey === BETA_TESTER_PLAN_KEY ? BETA_TESTER_PLAN : null)
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
    isBetaTester,
    isLifetime,
    isFounder,
    hasStripeCustomer,
    // Desktop app access is a Lifetime/Founder entitlement (PRD Phase 4).
    // Browser plan behavior is unchanged — this only gates the desktop shell.
    isDesktopEntitled: isLifetime || isBetaTester,
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
