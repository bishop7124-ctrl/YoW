// Desktop vault backend shell (Desktop Lifetime Phase 3).
//
// The React store needs localStorage-shaped synchronous reads/writes so refreshes
// and route changes cannot race React state. The desktop vault can satisfy that
// by hydrating an in-memory mirror at startup, then writing changes to SQLite in
// order behind the scenes. This module implements that mirror/write-behind
// contract while the concrete Tauri SQLite adapter is still pending.

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
} = {}) {
  const mirror = normalizeEntries(entries)
  const persist = typeof persistItem === 'function' ? persistItem : async () => {}
  const removePersisted = typeof removePersistedItem === 'function' ? removePersistedItem : async () => {}
  let queue = Promise.resolve()

  const enqueue = task => {
    queue = queue
      .then(task)
      .catch(error => { onWriteError(error) })
    return queue
  }

  return {
    name: 'desktop-vault',
    getItem: key => (mirror.has(key) ? mirror.get(key) : null),
    setItem: (key, value) => {
      const stringValue = String(value)
      mirror.set(key, stringValue)
      enqueue(() => persist(key, stringValue))
    },
    removeItem: key => {
      mirror.delete(key)
      enqueue(() => removePersisted(key))
    },
    flush: () => queue,
    snapshot: () => Object.fromEntries(mirror),
  }
}
