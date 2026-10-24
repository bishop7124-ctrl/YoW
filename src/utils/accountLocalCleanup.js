import { removeItem } from '../storage/projectStorage.js'

const deletedInThisSession = new Set()
export const wasAccountDeleted = userId => deletedInThisSession.has(userId)
export const deletedAccountStorageKeys = userId => [
    `nf_unsyncedRecovery:${userId}`,
    `nf_dirtyRecords:${userId}`,
    `nf_pendingDeletes:${userId}`,
    `nf_localFirstSnapshot:${userId}`,
    `nf_desktopLapseSnapshot:${userId}`,
    `nf_desktopLapseLocalCopy:${userId}`,
    `nf_lastActiveProject:${userId}`,
    `nf_sampleProjectSeeded:the-last-ember-v3:${userId}`,
    `nf_sampleProjectMapSeeded:atlas-layout-v4:${userId}`,
  ]

export function clearDeletedAccountMarkers(userId) {
  if (!userId) return
  deletedInThisSession.add(userId)
  try {
    deletedAccountStorageKeys(userId).forEach(key => removeItem(key))
  } catch {
    // Cloud deletion has already committed. Local sign-out cleanup remains
    // best-effort so a blocked browser vault cannot make the deleted session
    // appear active again.
  }
}
