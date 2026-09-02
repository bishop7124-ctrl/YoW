// Local write durability tracking + retry (audit finding P0-07,
// docs/YOW_CODE_AUDIT_2026-09-01.md).
//
// The IndexedDB and desktop-vault backends (indexedDbBackend.js,
// desktopVaultBackend.js) update their in-memory mirror synchronously —
// deliberate, so the UI can echo an edit instantly without waiting on an
// async round trip — but the actual persist to disk happens later, off a
// queue. Before this module existed, a failure in that queued persist only
// ever reached `console.error`: nothing recorded it, nothing warned the
// user, and closing the tab/app right after could silently lose the edit
// even though the UI had already shown it as accepted.
//
// useStore.js already had well-designed failure-visibility machinery
// (`markLocalWriteFailed`/`hasLocalWriteFailed`, surfaced as a persistent
// dismissible banner in App.jsx) — but it was only ever fed from a
// synchronous `try/catch` around a write call, which the real production
// backends (IndexedDB, desktop vault) never throw through; only the
// legacy/fallback synchronous `localStorage` backend can. This module
// extracts that tracking out of useStore.js (a storage-layer concern, not
// a store concern) so it can *also* be fed from the backends' real async
// failure path, wired up in browserVaultAdapter.js/tauriVaultAdapter.js.

import { readItem, writeItem } from './projectStorage.js'

export const LOCAL_WRITE_FAILED_KEY = 'nf_localWriteFailed'
// Keys whose most recently *read* value failed to parse as JSON — a strong
// signal of on-disk corruption, distinct from "this key never had a value".
// A parse failure can't be silently "fixed"; recording it is what makes it
// visible instead of quietly resolving to empty/default data.
const LOCAL_READ_CORRUPT_KEY = 'nf_localReadCorrupted'

function readKeySet(storageKey) {
  try { return new Set(JSON.parse(readItem(storageKey) || '[]')) }
  catch { return new Set() }
}

function addToKeySet(storageKey, key) {
  try {
    const keys = readKeySet(storageKey)
    if (keys.has(key)) return
    keys.add(key)
    writeItem(storageKey, JSON.stringify([...keys]))
  } catch { /* best effort — tracking a failure must never itself throw */ }
}

function removeFromKeySet(storageKey, key) {
  try {
    const keys = readKeySet(storageKey)
    if (!keys.has(key)) return
    keys.delete(key)
    writeItem(storageKey, JSON.stringify([...keys]))
  } catch { /* best effort */ }
}

export const readFailedWriteKeys = () => readKeySet(LOCAL_WRITE_FAILED_KEY)
export const markLocalWriteFailed = (key) => addToKeySet(LOCAL_WRITE_FAILED_KEY, key)
export const clearLocalWriteFailed = (key) => removeFromKeySet(LOCAL_WRITE_FAILED_KEY, key)
export const hasLocalWriteFailed = () => readFailedWriteKeys().size > 0

export const readCorruptKeys = () => readKeySet(LOCAL_READ_CORRUPT_KEY)
export const markLocalReadCorrupt = (key) => addToKeySet(LOCAL_READ_CORRUPT_KEY, key)
export const hasCorruptLocalData = () => readCorruptKeys().size > 0

// Retries a failing async write with exponential backoff before giving up —
// most real IndexedDB/vault failures this needs to survive are transient
// (a version-change upgrade blocking a moment, a momentary quota spike from
// another tab's write racing this one), and shouldn't need the user to
// re-edit the same field just to get a fresh write attempt. `attempts: 1`
// disables retrying entirely (used by tests that want a failure to surface
// immediately, and available to callers who'd rather fail fast).
export async function withRetry(fn, { attempts = 3, baseDelayMs = 400 } = {}) {
  let lastError
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, baseDelayMs * 2 ** attempt))
      }
    }
  }
  throw lastError
}
