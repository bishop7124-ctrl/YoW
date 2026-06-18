// ── Billing configuration ─────────────────────────────────────────────────────
// Single source of truth for pricing constants used across the app.
// When changing prices, update here AND create the matching Stripe product/price.
//
// Stripe price IDs are read from environment variables at runtime (server-side)
// or from VITE_ prefixed env vars (client-side display). Never hardcode live IDs.

export const BILLING = {
  // Displayed prices (GBP, display only — Stripe is the authoritative amount)
  monthlyPrice:        12,   // £/month
  lifetimePrice:       179,  // £ one-time
  founderPrice:        399,  // £ one-time
  hostingRenewalPrice: 6,    // £/year after included period

  // Lifetime hosting rules
  hostingIncludedYears:   3,   // years of cloud hosting included with Lifetime purchase
  hostingRenewalWarningDays: 30, // warn this many days before renewal is due

  // Founder slot limit (server-side enforced via app_config, this is the client fallback)
  founderSlotsTotal: 100,

  // Stripe env var names (server-side — never exposed to the client)
  stripeEnvKeys: {
    premiumMonthly:      'STRIPE_PRICE_ID_PREMIUM_MONTHLY',
    premiumLifetime:     'STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME',
    founder:             'STRIPE_PRICE_ID_FOUNDER',
    hostingRenewal:      'STRIPE_PRICE_ID_MAINTENANCE',  // existing env var name kept for compatibility
  },
}
