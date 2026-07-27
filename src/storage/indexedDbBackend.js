// IndexedDB backend shell (browser storage-cap fix).
//
// The React store needs localStorage-shaped synchronous reads/writes so refreshes
// and route changes cannot race React state. IndexedDB is async, so this module
// satisfies that contract the same way the desktop vault backend does: hydrate an
// in-memory mirror at startup, then write changes to IndexedDB in order behind the
// scenes. IndexedDB's real-world quota is a share of free disk (typically hundreds
// of MB to several GB) rather than localStorage's ~5-10MB per-origin cap, which is
// the actual cause of the "browser storage is full" warning this backend fixes.

function normalizeEntries(entries = {}) {
  if (entries instanceof Map) return new Map(entries)
  return new Map(Object.entries(entries))
}

function noop() {}

export function createIndexedDbBackend({
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
    name: 'indexeddb',
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
