import { createIndexedDbBackend } from './indexedDbBackend.js'
import { setStorageBackend } from './projectStorage.js'
import { isDesktopAppRuntime } from '../utils/runtime.js'

const DB_NAME = 'yow-storage'
const DB_VERSION = 1
const STORE_NAME = 'kv'
const SYNC_CHANNEL_NAME = 'yow-storage-sync'

let activeIndexedDbBackend = null
let flushHandlersInstalled = false

// Each browser tab hydrates its own in-memory mirror once at startup and
// never re-reads IndexedDB after that (see indexedDbBackend.js) — IndexedDB
// itself has no equivalent of localStorage's cross-tab `storage` event, so
// without this, two tabs on the same account silently diverge: neither ever
// sees what the other wrote, and the next tab to save anything overwrites
// every record it didn't touch with its own stale copy. This bridges writes
// across tabs of the same origin so `readItem`/`loadValue` in one tab
// reflects what another tab just saved, restoring the assumption the rest
// of the store's multi-tab conflict handling (commitLocal, scenes'
// mergeSceneUpdateWithPersistedCopy) already depends on.
function wireCrossTabSync(backend) {
  if (typeof BroadcastChannel === 'undefined') return backend
  let channel
  try { channel = new BroadcastChannel(SYNC_CHANNEL_NAME) }
  catch { return backend }

  const rawSetItem = backend.setItem
  const rawRemoveItem = backend.removeItem
  backend.setItem = (key, value) => {
    rawSetItem(key, value)
    try { channel.postMessage({ type: 'set', key, value: String(value) }) }
    catch { /* best effort — a same-tab write still succeeded above */ }
  }
  backend.removeItem = key => {
    rawRemoveItem(key)
    try { channel.postMessage({ type: 'remove', key }) }
    catch { /* best effort */ }
  }
  channel.onmessage = event => {
    const { type, key, value } = event.data || {}
    if (!key) return
    if (type === 'set') backend.applyExternalWrite?.(key, value)
    else if (type === 'remove') backend.applyExternalRemove?.(key)
  }
  return backend
}

function getIndexedDb() {
  if (typeof window === 'undefined') return null
  return window.indexedDB || null
}

export function isIndexedDbAvailable() {
  return Boolean(getIndexedDb())
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDatabase() {
  const indexedDbApi = getIndexedDb()
  if (!indexedDbApi) return Promise.reject(new Error('indexedDB unavailable'))
  return new Promise((resolve, reject) => {
    const request = indexedDbApi.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function readAllEntries(db) {
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
    const keysRequest = store.getAllKeys()
    const valuesRequest = store.getAll()
    let keys = null
    let values = null
    const settle = () => {
      if (keys === null || values === null) return
      resolve(new Map(keys.map((key, index) => [key, values[index]])))
    }
    keysRequest.onsuccess = () => { keys = keysRequest.result; settle() }
    valuesRequest.onsuccess = () => { values = valuesRequest.result; settle() }
    keysRequest.onerror = () => reject(keysRequest.error)
    valuesRequest.onerror = () => reject(valuesRequest.error)
  })
}

function putEntry(db, key, value) {
  const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
  return promisifyRequest(store.put(value, key))
}

function deleteEntry(db, key) {
  const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
  return promisifyRequest(store.delete(key))
}

function installFlushHandlers(backend) {
  if (flushHandlersInstalled || typeof window === 'undefined') return
  flushHandlersInstalled = true
  const flush = () => { backend.flush?.() }

  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

// Only takes over when running as a regular browser session — the desktop app
// has its own vault backend (tauriVaultAdapter.js) and must never be overridden.
// Any failure here (indexedDB missing, blocked in a locked-down/private context,
// etc.) leaves the existing browser-local (localStorage) default backend in
// place rather than throwing, matching projectStorage.js's own fallback shape.
export async function initializeIndexedDbStorage({ onWriteError = console.error } = {}) {
  if (isDesktopAppRuntime()) return null
  if (!isIndexedDbAvailable()) return null

  try {
    const db = await openDatabase()
    const entries = await readAllEntries(db)
    const backend = wireCrossTabSync(createIndexedDbBackend({
      entries,
      persistItem: (key, value) => putEntry(db, key, value),
      removePersistedItem: key => deleteEntry(db, key),
      onWriteError,
    }))
    activeIndexedDbBackend = setStorageBackend(backend)
    installFlushHandlers(activeIndexedDbBackend)
    return activeIndexedDbBackend
  } catch {
    return null
  }
}

export function getIndexedDbBackend() {
  return activeIndexedDbBackend
}

export function flushIndexedDbBackend() {
  return activeIndexedDbBackend?.flush?.() || Promise.resolve()
}
