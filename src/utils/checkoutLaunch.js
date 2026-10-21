// Launch switch for real paid checkout. Off by default, so every paid button
// keeps registering interest. The owner turns it on at launch by setting
// VITE_CHECKOUT_LAUNCHED=true in Vercel and redeploying (see docs/PAYMENT_ROADMAP.md,
// "Launch switch runbook"). The private billing-test link ignores this switch.
export function isCheckoutLaunched(env = import.meta.env) {
  return env?.VITE_CHECKOUT_LAUNCHED === 'true'
}
