// One-time recovery of pre-IndexedDB project data (4 Oct legacy migration matrix).
//
// Before the IndexedDB vault, project data lived in browser localStorage under `nf_*`
// keys. The browser adapter only ever read IndexedDB, so a profile that still held
// localStorage-only data (an older build, or a session that fell back to localStorage
// because IndexedDB would not open) showed an empty library after the vault took over.
//
// Rules, chosen so this can never resurrect deleted data or leak credentials:
//   - runs once per browser profile: a marker key in the vault records that it ran;
//   - copies only when the vault holds NO project data yet (a vault that already has
//     data is newer by definition, so nothing is merged into or over it);
//   - copies only `nf_*` keys, never credentials (AI keys, auth tokens, anything that
//     looks secret) and never the write-failed / read-corrupt durability flags;
//   - never deletes or edits the localStorage originals, so they stay recoverable
//     (scripts/recover-localstorage.mjs) if anything looks wrong.

export const LEGACY_MIGRATION_MARKER_KEY = 'yow_legacyLocalStorageMigrated'

const AI_SETTINGS_KEYS = new Set(['nf_aiSettings', 'nf-ai-settings', 'nf_aiSettingsOwner'])
const SENSITIVE_KEY_SUBSTRINGS = ['token', 'secret', 'password', 'credential', 'apikey', 'api_key']
const DURABILITY_FLAG_KEYS = new Set(['nf_localWriteFailed', 'nf_localReadCorrupted'])

export function isSensitiveStorageKey(key) {
  if (AI_SETTINGS_KEYS.has(key)) return true
  if (key.startsWith('sb-') && key.endsWith('-auth-token')) return true
  const lower = key.toLowerCase()
  return SENSITIVE_KEY_SUBSTRINGS.some(substring => lower.includes(substring))
}

export function isMigratableLegacyKey(key) {
  return typeof key === 'string'
    && key.startsWith('nf_')
    && !DURABILITY_FLAG_KEYS.has(key)
    && !isSensitiveStorageKey(key)
}

/**
 * @param {Map<string,string>} vaultEntries entries already in the IndexedDB vault
 * @param {Storage|null} legacyStorage window.localStorage (or a stand-in)
 * @returns {{ migrate: boolean, entries: Map<string,string>, skipped: string }}
 */
export function planLegacyLocalMigration(vaultEntries, legacyStorage) {
  const none = skipped => ({ migrate: false, entries: new Map(), skipped })
  if (vaultEntries.has(LEGACY_MIGRATION_MARKER_KEY)) return none('already-ran')
  for (const key of vaultEntries.keys()) {
    if (typeof key === 'string' && key.startsWith('nf_')) return none('vault-has-data')
  }
  if (!legacyStorage) return none('no-localstorage')
  const entries = new Map()
  try {
    for (let i = 0; i < legacyStorage.length; i += 1) {
      const key = legacyStorage.key(i)
      if (!isMigratableLegacyKey(key)) continue
      const value = legacyStorage.getItem(key)
      if (value == null) continue
      entries.set(key, value)
    }
  } catch {
    return none('localstorage-unreadable')
  }
  return { migrate: entries.size > 0, entries, skipped: entries.size > 0 ? '' : 'nothing-to-migrate' }
}
