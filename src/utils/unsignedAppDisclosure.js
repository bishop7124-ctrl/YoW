// Plain-language disclosure that the desktop app is not yet signed/notarized
// by Apple or Microsoft. Shown before purchase (Pricing, FAQ, checkout) and
// on the Download page so nobody buys Lifetime and is then surprised by the
// first-launch warning. The same strings feed the Stripe checkout message
// (api/create-checkout-session.js), so wording lives in one place.

export const UNSIGNED_APP_HEADLINE = 'The desktop app is not yet signed by Apple or Microsoft'

export const UNSIGNED_APP_SUMMARY =
  'Lifetime includes the YOW desktop app. During the beta it is not yet notarized by Apple or signed with a Windows code-signing certificate, '
  + 'so macOS (Gatekeeper) and Windows (SmartScreen) show a warning the first time you open it. You can still install it: '
  + 'on Mac choose System Settings → Privacy & Security → Open Anyway, and on Windows choose More info → Run anyway. '
  + 'Step-by-step instructions are on the Download page.'

// Stripe Checkout `custom_text.submit.message` allows 1,200 characters.
export const UNSIGNED_APP_CHECKOUT_MESSAGE =
  'Lifetime includes the YOW desktop app. The beta app is not yet signed by Apple or Microsoft, so Mac and Windows show a one-time first-launch warning '
  + '(Mac: Privacy & Security → Open Anyway; Windows: More info → Run anyway). Instructions are on the Download page after purchase.'
