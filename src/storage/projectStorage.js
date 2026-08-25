// Storage abstraction for project-data persistence (Desktop Lifetime Phase 1).
//
// All project-content reads/writes go through the active backend instead of
// touching window.localStorage directly, so the same store code can run
// against browser storage today and a desktop local vault later.
//
// Backend contract — synchronous, localStorage-shaped:
//   name:            string identifying the backend
//   getItem(key)     -> string | null; may throw if storage is unavailable
//   setItem(key, v)  -> void; may throw (e.g. quota exceeded)
//   removeItem(key)  -> void; may throw if storage is unavailable
//
// The contract is deliberately synchronous: useStore writes local state
// before React scheduling so instant refreshes never lose work. A desktop
// vault backend must keep that guarantee by serving reads/writes from an
// in-memory mirror hydrated at startup, with async write-behind to disk.

export function createMemoryBackend(initial = {}) {
  const entries = new Map(Object.entries(initial))
  return {
    name: 'memory',
    getItem: key => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => { entries.set(key, String(value)) },
    removeItem: key => { entries.delete(key) },
  }
}

function createBrowserBackend() {
  return {
    name: 'browser-local',
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => { window.localStorage.setItem(key, value) },
    removeItem: key => { window.localStorage.removeItem(key) },
  }
}

function createDefaultBackend() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return createBrowserBackend()
  } catch { /* storage blocked (privacy mode / sandbox) — fall back to memory */ }
  return createMemoryBackend()
}

let activeBackend = createDefaultBackend()

export function getStorageBackend() {
  return activeBackend
}

export function setStorageBackend(backend) {
  if (!backend || typeof backend.getItem !== 'function' || typeof backend.setItem !== 'function' || typeof backend.removeItem !== 'function') {
    throw new Error('Storage backend must implement getItem, setItem, and removeItem.')
  }
  activeBackend = backend
  return activeBackend
}

export function resetStorageBackend() {
  activeBackend = createDefaultBackend()
  return activeBackend
}

// ── String-level operations (same throw semantics as localStorage) ──────────

export function readItem(key) {
  return activeBackend.getItem(key)
}

export function writeItem(key, value) {
  activeBackend.setItem(key, value)
}

export function removeItem(key) {
  activeBackend.removeItem(key)
}

// ── JSON value helper (never throws) ─────────────────────────────────────────

export function loadValue(key, def = null) {
  try { return JSON.parse(activeBackend.getItem(key)) ?? def }
  catch { return def }
}

// ── Test-only bridge ──────────────────────────────────────────────────────
//
// The active backend can be real localStorage or an IndexedDB-backed vault
// (see browserVaultAdapter.js / tauriVaultAdapter.js) depending on runtime —
// app code never needs to know which, because it always goes through
// readItem/writeItem/removeItem above. Anything reaching into storage from
// *outside* the app (e2e tests using `page.evaluate`) doesn't have that
// luxury: reading `window.localStorage` directly only sees real localStorage,
// which silently stops reflecting app state the moment a different backend
// is active — exactly what broke tests/e2e/account-isolation.spec.js after
// the IndexedDB migration (see docs/ROADMAP.md's Bugs table). Expose the
// same abstraction the app itself uses so tests read/write through whatever
// backend is actually active, not a hardcoded assumption about which one.
// DEV-only: this must never ship in a production bundle. Optional chaining
// on import.meta.env: this module now also gets loaded outside Vite (see
// runtime.js's equivalent comment) — no behavior change under a real Vite
// build, where import.meta.env is always defined.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__yowStorageBridge = {
    // Waits for any in-flight async persistence (IndexedDB backend only —
    // real localStorage is already synchronous) to actually land before a
    // test navigates/reloads. Without this a fast reload right after a write
    // can race the backend's fire-and-forget persist queue and lose it —
    // resolves instantly on backends with no flush method (e.g. real
    // localStorage) since there's nothing to wait for.
    flush: () => activeBackend.flush?.() ?? Promise.resolve(),
    getItem: readItem,
    setItem: writeItem,
    removeItem,
  }
}
