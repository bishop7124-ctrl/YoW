// Lets AuthContext trigger the store's pending-cloud-write flush before
// signing out, without needing a direct reference to the store instance
// (AuthContext sits above useStore in the component tree).
let flushFn = null

export function registerSyncFlush(fn) {
  flushFn = fn
}

export function unregisterSyncFlush(fn) {
  if (flushFn === fn) flushFn = null
}

// Best-effort: if no store has registered (e.g. offline mode, or signing out
// before the store ever mounted), resolve immediately rather than block.
// Bounded by a timeout so a slow/offline network can't hang sign-out — the
// user should never feel like clicking "Sign out" got stuck.
const FLUSH_TIMEOUT_MS = 4000

export async function runSyncFlush() {
  if (!flushFn) return
  try {
    await Promise.race([
      flushFn(),
      new Promise(resolve => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
    ])
  } catch { /* best effort — sign-out must not hang on a sync failure */ }
}
