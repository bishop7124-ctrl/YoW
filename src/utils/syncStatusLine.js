import { relativeTimeFromNow } from './relativeTime'

// Pure derivation for the desktop Storage settings sync-status line.
// Kept separate from AccountSettings.jsx so the state machine (paused vs
// syncing vs synced vs error) is unit-testable without rendering the panel.
export function deriveSyncStatusLine({ syncStatus, localFirstSelected, canSyncCloud, isLocalMode, now } = {}) {
  const lastSyncedLabel = syncStatus?.lastSyncedAt ? relativeTimeFromNow(syncStatus.lastSyncedAt, now) : ''

  if (isLocalMode) {
    return { tone: 'paused', text: 'Cloud sync unavailable — hosting inactive' }
  }
  if (localFirstSelected) {
    return {
      tone: 'paused',
      text: lastSyncedLabel ? `Automatic sync paused — last synced ${lastSyncedLabel}` : 'Automatic sync paused — Local-first mode',
    }
  }
  if (!canSyncCloud) {
    return { tone: 'paused', text: 'Cloud sync unavailable for this account' }
  }
  if (syncStatus?.state === 'syncing') {
    return { tone: 'active', text: 'Syncing…' }
  }
  if (syncStatus?.state === 'error') {
    return {
      tone: 'error',
      text: `Sync error${syncStatus.lastError ? ` — ${syncStatus.lastError}` : ''} — will retry automatically`,
    }
  }
  if (lastSyncedLabel) {
    return { tone: 'synced', text: `Synced — last update ${lastSyncedLabel}` }
  }
  return { tone: 'active', text: 'Cloud sync active' }
}
