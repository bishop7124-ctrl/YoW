import { loadValue, readItem, removeItem, writeItem } from '../storage/projectStorage'

const STORAGE_MODE_PREFIX = 'nf_storageMode'
const LOCAL_FIRST_SNAPSHOT_PREFIX = 'nf_localFirstSnapshot'
const DESKTOP_LAPSE_SNAPSHOT_PREFIX = 'nf_desktopLapseSnapshot'

export const STORAGE_MODES = {
  CLOUD_SYNC: 'cloud-sync',
  LOCAL_FIRST: 'local-first',
}

export function storageModeKey(userId) {
  return `${STORAGE_MODE_PREFIX}:${userId || 'anonymous'}`
}

export function loadStorageMode(userId) {
  try {
    const saved = readItem(storageModeKey(userId))
    return saved === STORAGE_MODES.LOCAL_FIRST ? STORAGE_MODES.LOCAL_FIRST : STORAGE_MODES.CLOUD_SYNC
  } catch {
    return STORAGE_MODES.CLOUD_SYNC
  }
}

export function saveStorageMode(userId, mode) {
  const nextMode = mode === STORAGE_MODES.LOCAL_FIRST ? STORAGE_MODES.LOCAL_FIRST : STORAGE_MODES.CLOUD_SYNC
  try {
    writeItem(storageModeKey(userId), nextMode)
  } catch {
    // The in-memory mode still updates even if browser settings storage fails.
  }
  return nextMode
}

export function isLocalFirstMode(mode) {
  return mode === STORAGE_MODES.LOCAL_FIRST
}

function snapshotKey(userId) {
  return `${LOCAL_FIRST_SNAPSHOT_PREFIX}:${userId || 'anonymous'}`
}

export function saveLocalFirstSnapshot(userId, data) {
  if (!userId || !data) return false
  try {
    writeItem(snapshotKey(userId), JSON.stringify({
      savedAt: Date.now(),
      data,
    }))
    return true
  } catch {
    return false
  }
}

export function loadLocalFirstSnapshot(userId) {
  if (!userId) return null
  const parsed = loadValue(snapshotKey(userId), null)
  return parsed?.data ?? null
}

function desktopLapseSnapshotKey(userId) {
  return `${DESKTOP_LAPSE_SNAPSHOT_PREFIX}:${userId || 'anonymous'}`
}

// Captured once, the moment a desktop account's Cloud Mode hosting lapses
// (`membership.isLocalMode` first becomes true), so that whenever Cloud Sync
// automatically resumes on renewal there is a genuine last-known-common
// snapshot to three-way-merge against — the same machinery the manual
// "Resume Cloud Sync" flow already uses (see cloudSyncReconcile.js). Without
// this, the automatic resume path has no base to diff against and can only
// blindly push whatever is in local memory, silently overwriting any edits
// the account picked up elsewhere (e.g. via web Free-cloud-fallback) while
// this device was lapsed. Deliberately does not overwrite an existing,
// not-yet-consumed snapshot — if `isLocalMode` flickers true more than once
// before ever resolving back to false, the *first* lapse's snapshot remains
// the correct base until it's actually consumed by a resume.
export function saveDesktopLapseSnapshot(userId, data) {
  if (!userId || !data) return false
  if (loadDesktopLapseSnapshot(userId)) return false
  try {
    writeItem(desktopLapseSnapshotKey(userId), JSON.stringify({
      savedAt: Date.now(),
      data,
    }))
    return true
  } catch {
    return false
  }
}

export function loadDesktopLapseSnapshot(userId) {
  if (!userId) return null
  const parsed = loadValue(desktopLapseSnapshotKey(userId), null)
  return parsed?.data ?? null
}

export function clearDesktopLapseSnapshot(userId) {
  if (!userId) return
  try { removeItem(desktopLapseSnapshotKey(userId)) } catch { /* storage unavailable */ }
  clearDesktopLapseLocalCopy(userId)
}

// While hosting is lapsed the desktop app's edits exist only on this device
// (cloud writes are off), but signing out wipes the store's local project
// data. Without a copy, those edits vanished at sign-out and, after renewal,
// the merge saw an empty device and let the web version win silently.
// Overwritten on every sign-out while lapsed; removed with the lapse snapshot
// once the resume merge completes.
const DESKTOP_LAPSE_LOCAL_COPY_PREFIX = 'nf_desktopLapseLocalCopy'
const desktopLapseLocalCopyKey = userId => `${DESKTOP_LAPSE_LOCAL_COPY_PREFIX}:${userId || 'anonymous'}`

export function saveDesktopLapseLocalCopy(userId, data) {
  if (!userId || !data) return false
  try {
    writeItem(desktopLapseLocalCopyKey(userId), JSON.stringify({ savedAt: Date.now(), data }))
    return true
  } catch {
    return false
  }
}

export function loadDesktopLapseLocalCopy(userId) {
  if (!userId) return null
  const parsed = loadValue(desktopLapseLocalCopyKey(userId), null)
  return parsed?.data ?? null
}

export function clearDesktopLapseLocalCopy(userId) {
  if (!userId) return
  try { removeItem(desktopLapseLocalCopyKey(userId)) } catch { /* storage unavailable */ }
}

// The store's own snapshot wins whenever it holds projects (it is the newest
// state, e.g. an in-session lapse then renewal); the saved copy is used only
// when sign-out emptied the store.
export function chooseLapseLocalData(storeSnapshot, savedCopy) {
  const hasProjects = data => Array.isArray(data?.novels) && data.novels.length > 0
  if (hasProjects(storeSnapshot)) return storeSnapshot
  if (hasProjects(savedCopy)) return savedCopy
  return storeSnapshot || savedCopy || {}
}

// Decides whether a data load (a plain login/refresh, not just the in-session
// entitlement-transition effect) should be treated as resuming from a desktop
// hosting lapse rather than a normal reload. Needed because the app can be
// closed for an *entire* lapse and only reopened after renewal — there is no
// true→false transition to observe in that case, only a snapshot already
// sitting in storage from before the app closed. Any caller that finds a
// non-null return here must merge (e.g. via `reconcileCloudSyncData` against
// this base) before trusting freshly loaded cloud data, instead of applying
// it wholesale — plain timestamp-based freshness checks (like `importData`'s
// 30-minute local-trust window) are sized for a brief reload/network hiccup
// and cannot be relied on to protect a local-only edit made days into a lapse.
export function loadPendingDesktopLapseResumeBase(userId, { desktopApp, isLocalMode, userLocalFirstMode } = {}) {
  if (!desktopApp || !userId) return null
  // Still lapsed, or deliberately still in manual Local-first mode: cloud
  // sync isn't resuming yet, so there is nothing to reconcile against yet.
  if (isLocalMode || userLocalFirstMode) return null
  return loadDesktopLapseSnapshot(userId)
}

// Which user (if any) sign-out should keep a lapsed local copy for. Signing out
// makes userId null, and that same render must not clear the marker before the
// sign-out handler reads it, so a null userId leaves the previous value alone.
export function nextLapsedDesktopUser(previous, { desktopApp, userId, isLocalMode }) {
  if (!userId) return previous ?? null
  return desktopApp && isLocalMode ? userId : null
}
