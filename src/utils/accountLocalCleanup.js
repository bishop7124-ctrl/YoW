import { removeItem } from '../storage/projectStorage.js'

export function clearDeletedAccountMarkers(userId) {
  if (!userId) return
  const keys = [
    `nf_lastActiveProject:${userId}`,
    `nf_sampleProjectSeeded:the-last-ember-v3:${userId}`,
    `nf_sampleProjectMapSeeded:atlas-layout-v4:${userId}`,
  ]
  try {
    keys.forEach(key => removeItem(key))
  } catch {
    // Cloud deletion has already committed. Local sign-out cleanup remains
    // best-effort so a blocked browser vault cannot make the deleted session
    // appear active again.
  }
}
