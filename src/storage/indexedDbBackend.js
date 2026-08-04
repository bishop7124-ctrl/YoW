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
    // Applies a write/removal another browser tab already made (and already
    // persisted to the shared IndexedDB database) directly to this tab's own
    // mirror — no re-persist (the other tab already did it; this database is
    // shared) and no re-broadcast (would echo forever between tabs). See
    // browserVaultAdapter.js's cross-tab BroadcastChannel bridge, which is
    // what actually calls these — without it, each tab's mirror only ever
    // reflects its own writes, so two tabs sharing the same account/project
    // silently diverge and the next tab to write anything overwrites
    // whatever the other tab saved for every record it didn't touch.
    applyExternalWrite: (key, value) => { mirror.set(key, value) },
    applyExternalRemove: key => { mirror.delete(key) },
    flush: () => queue,
    snapshot: () => Object.fromEntries(mirror),
  }
}
