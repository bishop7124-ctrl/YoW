import { loadValue, readItem, writeItem } from '../storage/projectStorage'

const STORAGE_MODE_PREFIX = 'nf_storageMode'
const LOCAL_FIRST_SNAPSHOT_PREFIX = 'nf_localFirstSnapshot'

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
