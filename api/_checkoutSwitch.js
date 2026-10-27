// Launch switch for paid checkout. Closed unless CHECKOUT_OPEN is exactly "true" in the Vercel
// environment, so a deploy or a Stripe key swap can never open real payments by itself.
//
// Stripe test-mode keys stay usable while the switch is closed: the private billing test link
// needs them, and test mode cannot take real money. Only live keys are held back.
export function isCheckoutOpen(env = process.env) {
  return env.CHECKOUT_OPEN === 'true'
}

export function isStripeTestKey(env = process.env) {
  return String(env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')
}

export function checkoutAllowed(env = process.env) {
  return isCheckoutOpen(env) || isStripeTestKey(env)
}
