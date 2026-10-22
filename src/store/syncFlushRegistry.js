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

// Bounded by a timeout so a slow/offline network can't hang sign-out — the
// user should never feel like clicking "Sign out" got stuck. The result says
// whether every pending cloud write was actually confirmed: a timeout, a
// rejected flush or a rejected write all mean the cloud may NOT have the
// latest edits, and the caller must keep a local recovery copy.
// With no store registered (offline mode, or signing out before the store
// mounted) there is nothing pending, so it is confirmed.
const FLUSH_TIMEOUT_MS = 4000

export async function runSyncFlush() {
  if (!flushFn) return { confirmed: true }
  const timedOut = Symbol('timeout')
  let timer
  try {
    const outcome = await Promise.race([
      flushFn(),
      new Promise(resolve => { timer = setTimeout(() => resolve(timedOut), FLUSH_TIMEOUT_MS) }),
    ])
    if (outcome === timedOut) return { confirmed: false }
    const anyRejected = Array.isArray(outcome) && outcome.some(result => result?.status === 'rejected')
    return { confirmed: !anyRejected }
  } catch {
    return { confirmed: false }
  } finally {
    clearTimeout(timer)
  }
}

// Set by sign-out when its flush was not confirmed; read once by the store
// owner when it clears local data, so the unsynced edits are kept as an
// account-scoped recovery copy instead of being wiped.
let unsyncedSignOut = false

export function markUnsyncedSignOut() {
  unsyncedSignOut = true
}

export function consumeUnsyncedSignOut() {
  const value = unsyncedSignOut
  unsyncedSignOut = false
  return value
}
