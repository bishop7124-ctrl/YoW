// Desktop vault backend shell (Desktop Lifetime Phase 3).
//
// The React store needs localStorage-shaped synchronous reads/writes so refreshes
// and route changes cannot race React state. The desktop vault can satisfy that
// by hydrating an in-memory mirror at startup, then writing changes to SQLite in
// order behind the scenes. This module implements that mirror/write-behind
// contract while the concrete Tauri SQLite adapter is still pending.
//
// Durability (audit finding P0-07): the mirror update above is synchronous and
// always succeeds, but the actual SQLite write is async (a Tauri IPC round
// trip) and can fail. Every queued write is retried with backoff before being
// reported as failed, and `getDurabilityState()` exposes whether anything is
// still pending or has given up — callers (tauriVaultAdapter.js) feed
// `onWriteError`/`onWriteSuccess` into writeDurability.js's tracking, which is
// what actually makes a failure visible to the user instead of only reaching
// `console.error`.

import { withRetry } from './writeDurability.js'

function normalizeEntries(entries = {}) {
  if (entries instanceof Map) return new Map(entries)
  return new Map(Object.entries(entries))
}

function noop() {}

export function createDesktopVaultBackend({
  entries = {},
  persistItem,
  removePersistedItem,
  onWriteError = noop,
  onWriteSuccess = noop,
  retry,
} = {}) {
  const mirror = normalizeEntries(entries)
  const persist = typeof persistItem === 'function' ? persistItem : async () => {}
  const removePersisted = typeof removePersistedItem === 'function' ? removePersistedItem : async () => {}
  let queue = Promise.resolve()
  let pendingCount = 0
  let lastError = null

  const enqueue = (key, task) => {
    pendingCount += 1
    queue = queue
      .then(() => withRetry(task, retry))
      .then(() => {
        pendingCount = Math.max(0, pendingCount - 1)
        lastError = null
        onWriteSuccess(key)
      })
      .catch(error => {
        pendingCount = Math.max(0, pendingCount - 1)
        lastError = error
        onWriteError(error, key)
      })
    return queue
  }

  return {
    name: 'desktop-vault',
    getItem: key => (mirror.has(key) ? mirror.get(key) : null),
    setItem: (key, value) => {
      const stringValue = String(value)
      mirror.set(key, stringValue)
      return enqueue(key, () => persist(key, stringValue))
    },
    removeItem: key => {
      mirror.delete(key)
      return enqueue(key, () => removePersisted(key))
    },
    flush: () => queue,
    snapshot: () => Object.fromEntries(mirror),
    getDurabilityState: () => ({ pending: pendingCount, lastError }),
  }
}
