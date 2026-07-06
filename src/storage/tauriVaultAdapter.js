import { createDesktopVaultBackend } from './desktopVaultBackend.js'
import { setStorageBackend } from './projectStorage.js'
import { isDesktopAppRuntime } from '../utils/runtime.js'

let activeDesktopVaultBackend = null
let flushHandlersInstalled = false

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

export async function initializeDesktopVaultStorage({ onWriteError = console.error } = {}) {
  if (!isDesktopAppRuntime()) return null
  const invoke = getTauriInvoke()
  if (!invoke) return null

  const rows = await invoke('vault_read_all')
  const backend = createDesktopVaultBackend({
    entries: entriesFromRows(rows),
    persistItem: (key, value) => invoke('vault_set_item', { key, value }),
    removePersistedItem: key => invoke('vault_remove_item', { key }),
    onWriteError,
  })
  activeDesktopVaultBackend = setStorageBackend(backend)
  installFlushHandlers(activeDesktopVaultBackend)
  return activeDesktopVaultBackend
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
