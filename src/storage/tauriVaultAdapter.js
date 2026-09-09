import { createDesktopVaultBackend } from './desktopVaultBackend.js'
import { getStorageBackend, setStorageBackend } from './projectStorage.js'
import { isDesktopAppRuntime } from '../utils/runtime.js'
import { LOCAL_WRITE_FAILED_KEY, markLocalWriteFailed, clearLocalWriteFailed, hasLocalWriteFailed } from './writeDurability.js'

// src/utils/aiSettings.js's key names — duplicated here for the same reason
// as LOCAL_WRITE_FAILED_KEY above. These hold the user's AI provider API key
// (and, for the legacy key, the same secret under an older name) and are
// deliberately kept out of the shared storage-backend abstraction entirely
// (aiSettings.js reads/writes them via raw `localStorage` directly, never
// through readItem/writeItem), so nothing in the app ever depends on them
// living in the desktop vault.
const AI_SETTINGS_KEY = 'nf_aiSettings'
const LEGACY_AI_SETTINGS_KEY = 'nf-ai-settings'
const AI_SETTINGS_OWNER_KEY = 'nf_aiSettingsOwner'

// Substrings (case-insensitive) that mark a key as sensitive by convention
// even if it isn't one of the specific names above — a defense-in-depth net
// for a *future* localStorage-based secret this file's author forgets to
// add to the exact-name list below. Deliberately narrow: no `nf_` storage
// key in this codebase currently contains any of these (checked via a full
// repo grep for both literal and templated key names), so this can't
// silently exclude real project data today, and each term is specific
// enough that it's unlikely to collide with a future legitimate one either
// (unlike, say, "auth", which "nf_authorNotes" could plausibly become).
const SENSITIVE_KEY_SUBSTRINGS = ['token', 'secret', 'password', 'credential', 'apikey', 'api_key']

// Keys that must never be copied into the desktop vault (audit finding
// P0-10): the vault and its snapshot/backup files are plain SQLite on disk,
// not a browser's protected per-origin localStorage sandbox, so anything
// written here is later readable by anyone with filesystem access to this
// device. `nf_aiSettings`/its legacy name hold a provider API key in
// plaintext; Supabase's own auth-session key (`sb-<project-ref>-auth-token`,
// the same convention AuthContext.jsx's readCachedUser()/signOut() already
// key off of) holds a live session token.
function isSensitiveStorageKey(key) {
  if (key === AI_SETTINGS_KEY || key === LEGACY_AI_SETTINGS_KEY || key === AI_SETTINGS_OWNER_KEY) return true
  if (key.startsWith('sb-') && key.endsWith('-auth-token')) return true
  const lower = key.toLowerCase()
  return SENSITIVE_KEY_SUBSTRINGS.some(substring => lower.includes(substring))
}

// Removes any sensitive keys a pre-fix build may already have copied into
// this vault's live database, so an existing installation self-heals on its
// next successful connection rather than needing a separate migration step.
// Best-effort: a failure here shouldn't block using the vault. Deliberately
// narrow in scope, not a full remediation — see the P0-10 Bugs table row in
// docs/ROADMAP.md for what this does *not* cover (existing snapshot/backup
// .db copies, and whether a SQL DELETE here is a secure erase at the SQLite
// storage layer) and why: both need native testing this sandboxed session
// can't do.
function scrubSensitiveVaultEntries(backend) {
  try {
    const existingKeys = Object.keys(backend.snapshot?.() || {})
    for (const key of existingKeys) {
      if (isSensitiveStorageKey(key)) backend.removeItem(key)
    }
  } catch { /* best-effort cleanup only */ }
}

// Removes any sensitive key (isSensitiveStorageKey()) from every existing
// snapshot/backup .db file (audit finding P0-10 follow-up — the live vault's
// own entries are already scrubbed by scrubSensitiveVaultEntries above, but
// that never touched standalone Backups/*.db copies a pre-fix build may have
// already leaked secrets into, since a snapshot is a raw byte-for-byte copy
// of vault.db taken before the fix existed). Best-effort and non-blocking by
// design: a single unreadable/locked snapshot file must not stop the rest
// from being scrubbed, and this must never block vault activation. The
// sensitive-key predicate itself is not duplicated into Rust — Rust only
// exposes generic read/remove-by-key commands against an arbitrary backup
// file (vault_snapshot_read_all/vault_snapshot_remove_keys), matching the
// same read/write split the live vault already uses.
export async function scrubDesktopVaultSnapshots() {
  const invoke = getTauriInvoke()
  const summary = { scannedSnapshots: 0, scrubbedSnapshots: 0, scrubbedKeys: 0 }
  if (!invoke) return summary

  let snapshots
  try {
    snapshots = await invoke('vault_list_snapshots')
  } catch (error) {
    console.error('Could not list desktop vault snapshots to scrub:', error)
    return summary
  }
  if (!Array.isArray(snapshots)) return summary

  for (const snapshot of snapshots) {
    summary.scannedSnapshots += 1
    try {
      const rows = await invoke('vault_snapshot_read_all', { name: snapshot.name })
      const sensitiveKeys = (Array.isArray(rows) ? rows : [])
        .map(row => row.key)
        .filter(key => key != null && isSensitiveStorageKey(key))
      if (sensitiveKeys.length === 0) continue

      await invoke('vault_snapshot_remove_keys', { name: snapshot.name, keys: sensitiveKeys })
      summary.scrubbedSnapshots += 1
      summary.scrubbedKeys += sensitiveKeys.length
    } catch (error) {
      // One inaccessible/locked snapshot shouldn't stop the rest from being
      // scrubbed — same best-effort framing as scrubSensitiveVaultEntries.
      console.error(`Could not scrub desktop vault snapshot "${snapshot?.name}":`, error)
    }
  }

  return summary
}

let activeDesktopVaultBackend = null
let flushHandlersInstalled = false
// Set when a vault connection attempt fails, so the UI can tell "vault is
// unreachable this session" apart from a genuine localStorage-quota warning.
let vaultInitError = null

function getTauriInvoke() {
  if (typeof window === 'undefined') return null
  return window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || null
}

export function isTauriVaultAvailable() {
  return Boolean(getTauriInvoke())
}

function entriesFromRows(rows) {
  return new Map((Array.isArray(rows) ? rows : []).map(row => [row.key, row.value]))
}

function installFlushHandlers(backend) {
  if (flushHandlersInstalled || typeof window === 'undefined') return
  flushHandlersInstalled = true
  const flush = () => { backend.flush?.() }

  window.addEventListener('pagehide', flush)
  // beforeunload gets its own handler (not the shared `flush` above): a
  // browser/webview cannot be made to guarantee an in-flight async vault
  // write finishes before the window actually closes (audit finding P0-07),
  // so the one real protection available here is blocking navigation with a
  // confirmation prompt when a write is already known to have failed and
  // hasn't recovered — giving the user a chance to wait/retry instead of
  // silently losing it.
  window.addEventListener('beforeunload', (event) => {
    flush()
    if (hasLocalWriteFailed()) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })

  const listen = window.__TAURI__?.event?.listen
  if (typeof listen === 'function') {
    listen('tauri://close-requested', flush).catch(() => {})
  }
}

async function connectVaultBackend({ onWriteError, retry }) {
  const invoke = getTauriInvoke()
  if (!invoke) throw new Error('The desktop storage bridge is unavailable in this window.')
  const rows = await invoke('vault_read_all')
  return createDesktopVaultBackend({
    entries: entriesFromRows(rows),
    persistItem: (key, value) => invoke('vault_set_item', { key, value }),
    removePersistedItem: key => invoke('vault_remove_item', { key }),
    // Feeds writeDurability.js's tracking (audit P0-07) — this is what turns
    // a real async vault-write failure into the same persistent, dismissible
    // warning banner (App.jsx) that already existed for the synchronous
    // localStorage-quota case, and what makes hasLocalWriteFailed() (checked
    // above by the beforeunload handler, and polled by useStore.js) actually
    // reflect production reality instead of only ever being true for a code
    // path the desktop vault never takes.
    onWriteError: (error, key) => {
      markLocalWriteFailed(key)
      onWriteError(error, key)
    },
    onWriteSuccess: key => clearLocalWriteFailed(key),
    retry,
  })
}

function activateVaultBackend(backend) {
  scrubSensitiveVaultEntries(backend)
  // Fire-and-forget: scrubbing every existing backup file is real IPC/disk
  // work that shouldn't delay activating the vault the app is about to use,
  // but a failure still needs to surface somewhere rather than vanish.
  scrubDesktopVaultSnapshots().catch(error => {
    console.error('Desktop vault snapshot scrub failed:', error)
  })
  activeDesktopVaultBackend = setStorageBackend(backend)
  installFlushHandlers(activeDesktopVaultBackend)
  vaultInitError = null
  return activeDesktopVaultBackend
}

export async function initializeDesktopVaultStorage({ onWriteError = console.error, retry } = {}) {
  if (!isDesktopAppRuntime()) return null
  if (!getTauriInvoke()) return null
  try {
    const backend = await connectVaultBackend({ onWriteError, retry })
    return activateVaultBackend(backend)
  } catch (error) {
    vaultInitError = error
    return null
  }
}

// True once a startup or retry attempt has actually failed. Read by the UI to
// show an honest "vault unreachable" notice instead of the generic
// localStorage-quota warning — that warning is what you'd see anyway once the
// app falls back to the browser's small per-origin localStorage cap, but the
// real cause here is the vault connection, not disk space.
export function getDesktopVaultInitError() {
  return vaultInitError
}

// Copies fallback-localStorage edits into the vault, skipping anything
// isSensitiveStorageKey() flags — the vault and its snapshot/backup files
// are plaintext SQLite on disk, not a browser's protected per-origin
// localStorage sandbox, so an auth session token or AI provider key must
// never end up there (audit finding P0-10). Nothing in the app reads those
// keys through the storage-backend abstraction this vault serves (they're
// read/written via raw `localStorage` directly, see aiSettings.js), so
// skipping them here changes no behavior beyond closing the leak.
function migrateLocalStorageInto(backend) {
  if (typeof window === 'undefined' || !window.localStorage) return
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i)
    if (key == null || isSensitiveStorageKey(key)) continue
    const value = window.localStorage.getItem(key)
    if (value == null) continue
    backend.setItem(key, value)
  }
}

// Re-attempts the vault connection after a failed startup init (a transient
// IPC hiccup, a locked/unreachable vault file, etc). Any edits made while
// running on the localStorage fallback are copied into the vault before the
// switch, so a successful reconnect never strands data on the smaller
// backend. Note: removals made while on the fallback aren't replayed here —
// only keys still present in localStorage are migrated — but that's a rare
// edge case compared to the data-loss risk of not migrating at all.
export async function retryDesktopVaultStorage({ onWriteError = console.error, retry } = {}) {
  if (!isDesktopAppRuntime()) return null
  const current = getStorageBackend()
  if (current?.name === 'desktop-vault') {
    vaultInitError = null
    return current
  }

  let backend
  try {
    backend = await connectVaultBackend({ onWriteError, retry })
  } catch (error) {
    vaultInitError = error
    throw error
  }

  migrateLocalStorageInto(backend)
  // The migration above may have carried over a stale "write failed" flag
  // from the fallback backend; the migration itself is the recovery, so
  // there's nothing left to warn about.
  backend.removeItem(LOCAL_WRITE_FAILED_KEY)
  await backend.flush?.()

  return activateVaultBackend(backend)
}

export function getDesktopVaultBackend() {
  return activeDesktopVaultBackend
}

export function flushDesktopVaultBackend() {
  return activeDesktopVaultBackend?.flush?.() || Promise.resolve()
}

export async function getDesktopVaultInfo() {
  const invoke = getTauriInvoke()
  if (!invoke) return null
  return invoke('vault_info')
}

export async function getDesktopVaultIntegrityStatus() {
  const invoke = getTauriInvoke()
  if (!invoke) return null
  return invoke('vault_integrity_status')
}

export async function createDesktopVaultSnapshot() {
  const invoke = getTauriInvoke()
  if (!invoke) return null
  await flushDesktopVaultBackend()
  return invoke('vault_create_snapshot')
}

export async function createDesktopVaultAutoSnapshot() {
  const invoke = getTauriInvoke()
  if (!invoke) return null
  await flushDesktopVaultBackend()
  return invoke('vault_create_auto_snapshot')
}

export async function listDesktopVaultSnapshots() {
  const invoke = getTauriInvoke()
  if (!invoke) return []
  return invoke('vault_list_snapshots')
}

export async function restoreDesktopVaultSnapshot(name) {
  const invoke = getTauriInvoke()
  if (!invoke) return null
  await flushDesktopVaultBackend()
  return invoke('vault_restore_snapshot', { name })
}

export async function revealDesktopVaultInFinder() {
  const invoke = getTauriInvoke()
  if (!invoke) return null
  return invoke('vault_reveal_in_finder')
}

// Opens a native folder picker; moves the vault there (or adopts an existing
// vault.db found there) and records the location. Resolves null on cancel.
export async function relocateDesktopVault() {
  const invoke = getTauriInvoke()
  if (!invoke) return null
  await flushDesktopVaultBackend()
  return invoke('vault_relocate')
}
