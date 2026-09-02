// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  delete window.__TAURI__
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('tauri vault adapter', () => {
  it('does nothing outside the desktop runtime', async () => {
    const { initializeDesktopVaultStorage } = await import('./tauriVaultAdapter.js')
    const { getStorageBackend, resetStorageBackend } = await import('./projectStorage.js')
    const backend = await initializeDesktopVaultStorage()

    expect(backend).toBeNull()
    expect(getStorageBackend().name).toBe('browser-local')
    resetStorageBackend()
  })

  it('hydrates the desktop vault backend and routes writes through Tauri commands', async () => {
    vi.stubEnv('MODE', 'desktop')
    const calls = []
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async (command, payload) => {
          calls.push([command, payload])
          if (command === 'vault_read_all') {
            return [{ key: 'nf_novels', value: '[{"id":"novel-1"}]' }]
          }
          return null
        }),
      },
    }

    const { initializeDesktopVaultStorage } = await import('./tauriVaultAdapter.js')
    const { loadValue, readItem, resetStorageBackend, writeItem } = await import('./projectStorage.js')
    const backend = await initializeDesktopVaultStorage()

    expect(backend.name).toBe('desktop-vault')
    expect(loadValue('nf_novels', [])).toEqual([{ id: 'novel-1' }])

    writeItem('nf_activeNovel', 'novel-1')
    expect(readItem('nf_activeNovel')).toBe('novel-1')
    await backend.flush()

    expect(calls).toEqual([
      ['vault_read_all', undefined],
      ['vault_set_item', { key: 'nf_activeNovel', value: 'novel-1' }],
    ])
    resetStorageBackend()
  })

  it('exposes desktop vault info, snapshots, restore, and Finder reveal commands', async () => {
    vi.stubEnv('MODE', 'desktop')
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async (command, payload) => {
          if (command === 'vault_info') return { vault_path: '/tmp/YOW/vault.db', entry_count: 2 }
          if (command === 'vault_integrity_status') return { ok: true, message: 'ok', latest_snapshot: null }
          if (command === 'vault_create_snapshot') return { path: '/tmp/YOW/Backups/vault-snapshot.db', size_bytes: 100 }
          if (command === 'vault_create_auto_snapshot') return { name: 'vault-auto-1.db', path: '/tmp/YOW/Backups/vault-auto-1.db', size_bytes: 100 }
          if (command === 'vault_list_snapshots') return [{ name: 'vault-auto-1.db', size_bytes: 100 }, { name: 'vault-snapshot-1.db', size_bytes: 100 }]
          if (command === 'vault_restore_snapshot') return { restored_path: payload.name, safety_snapshot_path: '/tmp/YOW/Backups/vault-before-restore.db' }
          if (command === 'vault_reveal_in_finder') return null
          return []
        }),
      },
    }

    const {
      createDesktopVaultSnapshot,
      createDesktopVaultAutoSnapshot,
      getDesktopVaultInfo,
      getDesktopVaultIntegrityStatus,
      listDesktopVaultSnapshots,
      revealDesktopVaultInFinder,
      restoreDesktopVaultSnapshot,
    } = await import('./tauriVaultAdapter.js')

    await expect(getDesktopVaultInfo()).resolves.toEqual({ vault_path: '/tmp/YOW/vault.db', entry_count: 2 })
    await expect(getDesktopVaultIntegrityStatus()).resolves.toEqual({ ok: true, message: 'ok', latest_snapshot: null })
    await expect(createDesktopVaultSnapshot()).resolves.toEqual({ path: '/tmp/YOW/Backups/vault-snapshot.db', size_bytes: 100 })
    await expect(createDesktopVaultAutoSnapshot()).resolves.toEqual({ name: 'vault-auto-1.db', path: '/tmp/YOW/Backups/vault-auto-1.db', size_bytes: 100 })
    await expect(listDesktopVaultSnapshots()).resolves.toEqual([{ name: 'vault-auto-1.db', size_bytes: 100 }, { name: 'vault-snapshot-1.db', size_bytes: 100 }])
    await expect(restoreDesktopVaultSnapshot('/tmp/YOW/Backups/vault-snapshot-1.db')).resolves.toEqual({
      restored_path: '/tmp/YOW/Backups/vault-snapshot-1.db',
      safety_snapshot_path: '/tmp/YOW/Backups/vault-before-restore.db',
    })
    await expect(revealDesktopVaultInFinder()).resolves.toBeNull()

    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_info')
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_integrity_status')
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_create_snapshot')
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_create_auto_snapshot')
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_list_snapshots')
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_restore_snapshot', { name: '/tmp/YOW/Backups/vault-snapshot-1.db' })
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_reveal_in_finder')
  })

  it('also skips a future secret-shaped key not on the exact denylist, via the substring heuristic (audit P0-10)', async () => {
    vi.stubEnv('MODE', 'desktop')
    const calls = []
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async (command, payload) => {
          calls.push([command, payload])
          if (command === 'vault_read_all') return []
          return null
        }),
      },
    }

    window.localStorage.setItem('nf_novels', '[{"id":"novel-1"}]')
    window.localStorage.setItem('nf_someNewProviderToken', 'not-yet-on-the-exact-denylist')
    window.localStorage.setItem('nf_exportServiceCredential', 'also-not-on-the-exact-denylist')

    const { retryDesktopVaultStorage } = await import('./tauriVaultAdapter.js')
    const { resetStorageBackend } = await import('./projectStorage.js')
    const backend = await retryDesktopVaultStorage()

    expect(backend.getItem('nf_novels')).toBe('[{"id":"novel-1"}]')
    expect(backend.getItem('nf_someNewProviderToken')).toBeNull()
    expect(backend.getItem('nf_exportServiceCredential')).toBeNull()

    window.localStorage.clear()
    resetStorageBackend()
  })

  it('never copies auth session tokens or AI provider keys into the vault on retry (audit P0-10)', async () => {
    vi.stubEnv('MODE', 'desktop')
    const calls = []
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async (command, payload) => {
          calls.push([command, payload])
          if (command === 'vault_read_all') return []
          return null
        }),
      },
    }

    window.localStorage.setItem('nf_novels', '[{"id":"novel-1"}]')
    window.localStorage.setItem('nf_aiSettings', JSON.stringify({ provider: 'openai', apiKey: 'sk-test-secret' }))
    window.localStorage.setItem('nf-ai-settings', JSON.stringify({ apiKey: 'sk-legacy-secret' }))
    window.localStorage.setItem('nf_aiSettingsOwner', 'user-1')
    window.localStorage.setItem('sb-abcdefgh-auth-token', JSON.stringify({ access_token: 'super-secret-session-token' }))

    const { retryDesktopVaultStorage } = await import('./tauriVaultAdapter.js')
    const { resetStorageBackend } = await import('./projectStorage.js')
    const backend = await retryDesktopVaultStorage()

    expect(backend.name).toBe('desktop-vault')
    // Real project data still migrates.
    expect(backend.getItem('nf_novels')).toBe('[{"id":"novel-1"}]')
    // Nothing sensitive does — checked both via the backend's own read and
    // via the exact Tauri IPC calls made, so a future refactor that bypasses
    // isSensitiveStorageKey() would still be caught here.
    expect(backend.getItem('nf_aiSettings')).toBeNull()
    expect(backend.getItem('nf-ai-settings')).toBeNull()
    expect(backend.getItem('nf_aiSettingsOwner')).toBeNull()
    expect(backend.getItem('sb-abcdefgh-auth-token')).toBeNull()
    const setItemKeys = calls.filter(([command]) => command === 'vault_set_item').map(([, payload]) => payload.key)
    expect(setItemKeys).toContain('nf_novels')
    expect(setItemKeys).not.toContain('nf_aiSettings')
    expect(setItemKeys).not.toContain('nf-ai-settings')
    expect(setItemKeys).not.toContain('nf_aiSettingsOwner')
    expect(setItemKeys).not.toContain('sb-abcdefgh-auth-token')

    window.localStorage.clear()
    resetStorageBackend()
  })

  it('scrubs sensitive keys a pre-fix build already copied into the vault, on the very next successful connection (audit P0-10)', async () => {
    vi.stubEnv('MODE', 'desktop')
    const removedKeys = []
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async (command, payload) => {
          if (command === 'vault_read_all') {
            return [
              { key: 'nf_novels', value: '[{"id":"novel-1"}]' },
              { key: 'nf_aiSettings', value: JSON.stringify({ apiKey: 'sk-already-leaked' }) },
              { key: 'sb-abcdefgh-auth-token', value: JSON.stringify({ access_token: 'already-leaked-session' }) },
            ]
          }
          if (command === 'vault_remove_item') removedKeys.push(payload.key)
          return null
        }),
      },
    }

    const { initializeDesktopVaultStorage } = await import('./tauriVaultAdapter.js')
    const { resetStorageBackend } = await import('./projectStorage.js')
    const backend = await initializeDesktopVaultStorage()
    await backend.flush()

    expect(backend.getItem('nf_novels')).toBe('[{"id":"novel-1"}]')
    expect(backend.getItem('nf_aiSettings')).toBeNull()
    expect(backend.getItem('sb-abcdefgh-auth-token')).toBeNull()
    expect(removedKeys).toEqual(expect.arrayContaining(['nf_aiSettings', 'sb-abcdefgh-auth-token']))

    resetStorageBackend()
  })

  it('records a failed vault write and blocks beforeunload navigation until it recovers (audit P0-07)', async () => {
    vi.stubEnv('MODE', 'desktop')
    let failWrites = true
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async (command) => {
          if (command === 'vault_read_all') return []
          if (command === 'vault_set_item' && failWrites) throw new Error('vault write failed')
          return null
        }),
      },
    }

    const { initializeDesktopVaultStorage } = await import('./tauriVaultAdapter.js')
    const { resetStorageBackend, writeItem } = await import('./projectStorage.js')
    const { hasLocalWriteFailed } = await import('./writeDurability.js')
    const onWriteError = vi.fn()

    const backend = await initializeDesktopVaultStorage({ onWriteError, retry: { attempts: 1 } })
    expect(hasLocalWriteFailed()).toBe(false)

    writeItem('nf_scenes', '[]')
    await backend.flush()
    expect(onWriteError).toHaveBeenCalled()
    expect(hasLocalWriteFailed()).toBe(true)

    const blockedEvent = new Event('beforeunload', { cancelable: true })
    Object.defineProperty(blockedEvent, 'returnValue', { writable: true, value: undefined })
    window.dispatchEvent(blockedEvent)
    expect(blockedEvent.defaultPrevented).toBe(true)
    expect(blockedEvent.returnValue).toBe('')

    // Recovers once the same key writes successfully.
    failWrites = false
    writeItem('nf_scenes', '[]')
    await backend.flush()
    expect(hasLocalWriteFailed()).toBe(false)

    const clearEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clearEvent)
    expect(clearEvent.defaultPrevented).toBe(false)

    resetStorageBackend()
  })

  it('relocates the vault through the native folder picker command', async () => {
    vi.stubEnv('MODE', 'desktop')
    window.__TAURI__ = {
      core: {
        invoke: vi.fn(async (command) => {
          if (command === 'vault_relocate') {
            return { mode: 'moved', vault_dir: '/tmp/NewVault', vault_path: '/tmp/NewVault/vault.db', previous_vault_path: '/tmp/YOW/vault.db' }
          }
          return []
        }),
      },
    }

    const { relocateDesktopVault } = await import('./tauriVaultAdapter.js')
    await expect(relocateDesktopVault()).resolves.toEqual({
      mode: 'moved',
      vault_dir: '/tmp/NewVault',
      vault_path: '/tmp/NewVault/vault.db',
      previous_vault_path: '/tmp/YOW/vault.db',
    })
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_relocate')
  })
})
