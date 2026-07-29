// Thin wrapper around the GA4 gtag() call already loaded in index.html.
// Keeps event names in one place and no-ops safely if gtag isn't ready
// (offline mode, ad blockers, SSR-ish edge cases).

function gtagAvailable() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function'
}

export function trackEvent(name, params = {}) {
  if (!gtagAvailable()) return
  window.gtag('event', name, params)
}

// Ties subsequent GA4 events to a stable, non-PII id (the Supabase user id)
// so a specific signup's journey can be inspected in GA4's User Explorer
// report, not just aggregate counts.
export function identifyUser(userId) {
  if (!gtagAvailable() || !userId) return
  window.gtag('set', { user_id: userId })
}
