import { createDesktopVaultBackend } from './desktopVaultBackend.js'
import { getStorageBackend, setStorageBackend } from './projectStorage.js'
import { isDesktopAppRuntime } from '../utils/runtime.js'

// useStore.js's LOCAL_WRITE_FAILED_KEY — duplicated here rather than shared
// so this storage-layer module doesn't depend on the store module.
const LOCAL_WRITE_FAILED_KEY = 'nf_localWriteFailed'

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
  window.addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })

  const listen = window.__TAURI__?.event?.listen
  if (typeof listen === 'function') {
    listen('tauri://close-requested', flush).catch(() => {})
  }
}

async function connectVaultBackend({ onWriteError }) {
  const invoke = getTauriInvoke()
  if (!invoke) throw new Error('The desktop storage bridge is unavailable in this window.')
  const rows = await invoke('vault_read_all')
  return createDesktopVaultBackend({
    entries: entriesFromRows(rows),
    persistItem: (key, value) => invoke('vault_set_item', { key, value }),
    removePersistedItem: key => invoke('vault_remove_item', { key }),
    onWriteError,
  })
}

function activateVaultBackend(backend) {
  activeDesktopVaultBackend = setStorageBackend(backend)
  installFlushHandlers(activeDesktopVaultBackend)
  vaultInitError = null
  return activeDesktopVaultBackend
}

export async function initializeDesktopVaultStorage({ onWriteError = console.error } = {}) {
  if (!isDesktopAppRuntime()) return null
  if (!getTauriInvoke()) return null
  try {
    const backend = await connectVaultBackend({ onWriteError })
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

// Re-attempts the vault connection after a failed startup init (a transient
// IPC hiccup, a locked/unreachable vault file, etc). Any edits made while
// running on the localStorage fallback are copied into the vault before the
// switch, so a successful reconnect never strands data on the smaller
// backend. Note: removals made while on the fallback aren't replayed here —
// only keys still present in localStorage are migrated — but that's a rare
// edge case compared to the data-loss risk of not migrating at all.
export async function retryDesktopVaultStorage({ onWriteError = console.error } = {}) {
  if (!isDesktopAppRuntime()) return null
  const current = getStorageBackend()
  if (current?.name === 'desktop-vault') {
    vaultInitError = null
    return current
  }

  let backend
  try {
    backend = await connectVaultBackend({ onWriteError })
  } catch (error) {
    vaultInitError = error
    throw error
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key == null) continue
      const value = window.localStorage.getItem(key)
      if (value == null) continue
      backend.setItem(key, value)
    }
  }
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
