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
          if (command === 'vault_restore_snapshot') return { restored_path: `/tmp/YOW/Backups/${payload.name}`, safety_snapshot_path: '/tmp/YOW/Backups/vault-before-restore.db' }
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
    await expect(restoreDesktopVaultSnapshot('vault-snapshot-1.db')).resolves.toEqual({
      restored_path: '/tmp/YOW/Backups/vault-snapshot-1.db',
      safety_snapshot_path: '/tmp/YOW/Backups/vault-before-restore.db',
    })
    await expect(revealDesktopVaultInFinder()).resolves.toBeNull()

    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_info')
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_integrity_status')
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_create_snapshot')
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_create_auto_snapshot')
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_list_snapshots')
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_restore_snapshot', { name: 'vault-snapshot-1.db' })
    expect(window.__TAURI__.core.invoke).toHaveBeenCalledWith('vault_reveal_in_finder')
  })
})
