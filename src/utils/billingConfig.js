// ── Billing configuration ─────────────────────────────────────────────────────
// Single source of truth for pricing constants used across the app.
// When changing prices, update here AND create the matching Stripe product/price.
//
// Stripe price IDs are read from environment variables at runtime (server-side)
// or from VITE_ prefixed env vars (client-side display). Never hardcode live IDs.

export const BILLING = {
  // Displayed prices (GBP, display only — Stripe is the authoritative amount)
  // NOTE (2026-08-31 live pricing alignment): these match the live Stripe Prices.
  monthlyPrice:        9.99,  // £/month
  foundingLifetimePrice: 49.99, // first 100 successful live purchases
  lifetimePrice:       74.99, // £ one-time
  hostingRenewalPrice: 6,    // £/year after included period

  // Lifetime hosting rules
  hostingIncludedYears:   1,   // years of cloud hosting included with Lifetime purchase
  foundingHostingIncludedYears: 2,
  hostingRenewalWarningDays: 30, // warn this many days before renewal is due

  // Founder slot limit (server-side enforced via app_config, this is the client fallback)
  founderSlotsTotal: 100,

  // Stripe env var names (server-side — never exposed to the client)
  stripeEnvKeys: {
    premiumMonthly:      'STRIPE_PRICE_ID_PREMIUM_MONTHLY',
    foundingLifetime:    'STRIPE_PRICE_ID_FOUNDING_LIFETIME',
    premiumLifetime:     'STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME',
    hostingRenewal:      'STRIPE_PRICE_ID_MAINTENANCE',  // existing env var name kept for compatibility
  },
}
