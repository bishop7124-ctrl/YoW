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
