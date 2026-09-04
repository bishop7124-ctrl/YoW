import { markLocalReadCorrupt } from './writeDurability.js'

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
    keys: () => Array.from(entries.keys()),
  }
}

function createBrowserBackend() {
  return {
    name: 'browser-local',
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => { window.localStorage.setItem(key, value) },
    removeItem: key => { window.localStorage.removeItem(key) },
    keys: () => Object.keys(window.localStorage),
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

// Every backend that actually holds project data (browser localStorage, the
// IndexedDB-backed vault, the desktop Tauri vault — see indexedDbBackend.js
// and desktopVaultBackend.js) keeps a full, synchronous, in-memory mirror of
// every key it holds (localStorage always has, and the other two hydrate a
// complete mirror from disk at startup specifically so reads stay
// synchronous). `keys()` is the read-only enumeration half of that same
// mirror, exposed through the shared abstraction — it lets a caller query the
// storage backend itself for "every key matching this prefix" instead of only
// ever knowing about whatever subset happens to be tracked in some in-memory
// React ref right now (see sceneContentStore.js's deleteAllSceneContentForNovel,
// written for audit finding #16 — project deletion previously only cleaned up
// per-scene content keys the current tab's session already knew about).
// Optional on the backend contract (unlike getItem/setItem/removeItem, which
// setStorageBackend requires): a caller-injected test backend that doesn't
// implement it degrades to "nothing found" rather than throwing.
export function listKeys(prefix) {
  let all
  try {
    all = typeof activeBackend.keys === 'function' ? activeBackend.keys() : []
  } catch {
    return []
  }
  if (!Array.isArray(all)) return []
  return prefix ? all.filter(key => typeof key === 'string' && key.startsWith(prefix)) : all
}

// ── JSON value helper (never throws) ─────────────────────────────────────────
//
// A parse failure here can only mean one of two things: the key never had a
// value (`getItem` returns `null`, and `JSON.parse(null)` — `null` coerces
// to the string "null" — parses fine and yields `null`, never throws), or
// the stored string is present but not valid JSON, i.e. genuine on-disk
// corruption. Only the second case is worth recording — audit finding
// P0-07 flags that this used to be indistinguishable from "never had a
// value" from the caller's side, both silently resolving to `def`. It's
// still not something this function can repair (there's no way to recover
// a value from invalid JSON), but the caller — and the same storage-warning
// banner (App.jsx) that already surfaces write failures — can now at least
// tell the difference and let the user know something didn't load cleanly,
// rather than the account quietly looking emptier than it should.

export function loadValue(key, def = null) {
  let raw
  try {
    raw = activeBackend.getItem(key)
  } catch {
    // Backend itself unavailable (storage blocked, etc.) — not a corruption
    // signal, nothing to record; same as always having no value for this key.
    return def
  }
  if (raw == null) return def
  try {
    return JSON.parse(raw) ?? def
  } catch (error) {
    markLocalReadCorrupt(key)
    console.error(`[projectStorage] Stored value for "${key}" is not valid JSON — treating as corrupted, not just empty.`, error)
    return def
  }
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
    // Which backend reads are currently being answered from ('indexeddb',
    // 'browser-local', or 'memory'). The bridge object itself is installed at
    // module evaluation, well before main.jsx's boot() swaps the IndexedDB
    // vault in, so its mere presence says nothing about whether a read will
    // find the app's data — during that window getItem() answers from
    // localStorage and returns null for every nf_* key. Tests use this to tell
    // "the vault is up" from "the vault never initialised", which otherwise
    // both present identically as null reads. See waitForStorageHydration in
    // tests/e2e/helpers.js.
    backendName: () => activeBackend?.name ?? 'unknown',
    getItem: readItem,
    setItem: writeItem,
    removeItem,
  }
}
