// Launch switch for real paid checkout. Off by default: paid buttons only register
// interest. Turned on at launch by setting VITE_CHECKOUT_LIVE=true in Vercel and
// redeploying (see docs/QA_PLAN.md "Return-to-live and launch-switch runbook").
export function isCheckoutLive() {
  return import.meta.env.VITE_CHECKOUT_LIVE === 'true'
}
