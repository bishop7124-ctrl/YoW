// Thin wrapper around the GA4 gtag() call already loaded in index.html.
// Keeps event names in one place and no-ops safely if gtag isn't ready
// (offline mode, ad blockers, SSR-ish edge cases).

function getGtag() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function' ? window.gtag : null
}

export function trackEvent(name, params = {}) {
  const gtag = getGtag()
  if (!gtag) return
  gtag('event', name, params)
}

// Analytics is anonymous: the privacy policy says usage data is never linked to a person's identity, and an
// account id would make every event traceable to an account (audit YOW-18, and the project's rule that
// security and privacy win over analytics). So no account id is ever sent. The function remains so
// sign-in and sign-out can still clear any identifier a previous version of the app set in this browser.
export function identifyUser() {
  const gtag = getGtag()
  if (!gtag) return
  gtag('set', { user_id: null })
}
