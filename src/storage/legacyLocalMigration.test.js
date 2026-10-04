// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planLegacyLocalMigration, isMigratableLegacyKey, LEGACY_MIGRATION_MARKER_KEY } from './legacyLocalMigration.js'

// 4 Oct data-safety matrix, item 4: legacy migration. Every case starts from a brand-new
// browser profile (fresh IndexedDB factory + empty localStorage), like a real upgrade.

beforeEach(() => {
  window.indexedDB = new IDBFactory()
  window.localStorage.clear()
})
afterEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

async function boot() {
  vi.resetModules()
  const adapter = await import('./browserVaultAdapter.js')
  const storage = await import('./projectStorage.js')
  const backend = await adapter.initializeIndexedDbStorage({ retry: { attempts: 1 } })
  return { backend, ...storage, flush: () => adapter.flushIndexedDbBackend() }
}

describe('legacy localStorage -> IndexedDB migration matrix', () => {
  it('localStorage-only data appears after the vault takes over, and the originals are left in place', async () => {
    localStorage.setItem('nf_novels', '[{"id":"legacy-1"}]')
    localStorage.setItem('nf_scene_content:s1', 'Chapter one prose')
    const { backend, readItem, resetStorageBackend } = await boot()
    expect(backend).not.toBeNull()
    expect(readItem('nf_novels')).toBe('[{"id":"legacy-1"}]')
    expect(readItem('nf_scene_content:s1')).toBe('Chapter one prose')
    expect(readItem(LEGACY_MIGRATION_MARKER_KEY)).toBeTruthy()
    expect(localStorage.getItem('nf_novels')).toBe('[{"id":"legacy-1"}]')   // never deleted
    resetStorageBackend()
  })

  it('IndexedDB-only data is untouched and no marker-only side effects touch project keys', async () => {
    const first = await boot()
    first.writeItem('nf_novels', '[{"id":"idb-1"}]')
    await first.flush()
    first.resetStorageBackend()
    const second = await boot()
    expect(second.readItem('nf_novels')).toBe('[{"id":"idb-1"}]')
    second.resetStorageBackend()
  })

  it('divergent data: the vault copy wins, stale localStorage is neither merged nor deleted, extra legacy keys are not pulled in', async () => {
    const first = await boot()
    first.writeItem('nf_novels', '[{"id":"vault-newer"}]')
    await first.flush()
    first.resetStorageBackend()
    // simulate an upgrade path where the marker was never written (build before this fix)
    const { backend } = await boot()
    backend.removeItem(LEGACY_MIGRATION_MARKER_KEY)
    await backend.flush()
    localStorage.setItem('nf_novels', '[{"id":"stale-local"}]')
    localStorage.setItem('nf_extra', 'stale')
    const third = await boot()
    expect(third.readItem('nf_novels')).toBe('[{"id":"vault-newer"}]')
    expect(third.readItem('nf_extra')).toBeNull()
    expect(localStorage.getItem('nf_novels')).toBe('[{"id":"stale-local"}]')
    third.resetStorageBackend()
  })

  it('an intentionally empty list and an orphan per-scene key migrate verbatim (not dropped, not "fixed")', async () => {
    localStorage.setItem('nf_scenes', '[]')
    localStorage.setItem('nf_scene_content:ghost-scene', '')
    localStorage.setItem('nf_novels', '[]')
    const { readItem, resetStorageBackend } = await boot()
    expect(readItem('nf_scenes')).toBe('[]')
    expect(readItem('nf_scene_content:ghost-scene')).toBe('')
    resetStorageBackend()
  })

  it('a key deleted after the migration is not resurrected by the next start (tombstone)', async () => {
    localStorage.setItem('nf_novels', '[{"id":"legacy-1"}]')
    localStorage.setItem('nf_scene_content:s1', 'prose')
    const first = await boot()
    first.removeItem('nf_scene_content:s1')
    await first.flush()
    first.resetStorageBackend()
    const second = await boot()
    expect(second.readItem('nf_scene_content:s1')).toBeNull()
    expect(second.readItem('nf_novels')).toBe('[{"id":"legacy-1"}]')
    second.resetStorageBackend()
  })

  it('never copies credentials, auth sessions, durability flags or unrelated keys', async () => {
    localStorage.setItem('nf_novels', '[{"id":"ok"}]')
    localStorage.setItem('sb-abcdef-auth-token', '{"access_token":"x"}')
    localStorage.setItem('nf_aiSettings', '{"apiKey":"sk-secret"}')
    localStorage.setItem('nf-ai-settings', '{"apiKey":"sk-legacy"}')
    localStorage.setItem('nf_aiSettingsOwner', 'user-1')
    localStorage.setItem('nf_apiKeyBackup', 'sk-hidden')
    localStorage.setItem('nf_someToken', 't')
    localStorage.setItem('nf_localWriteFailed', '["nf_novels"]')
    localStorage.setItem('nf_localReadCorrupted', '["nf_scenes"]')
    localStorage.setItem('some_other_app_key', 'x')
    localStorage.setItem('theme', 'dark')
    const { backend, readItem, resetStorageBackend } = await boot()
    const keys = backend.keys()
    expect(keys).toContain('nf_novels')
    for (const forbidden of ['sb-abcdef-auth-token', 'nf_aiSettings', 'nf-ai-settings', 'nf_aiSettingsOwner', 'nf_apiKeyBackup',
      'nf_someToken', 'nf_localWriteFailed', 'nf_localReadCorrupted', 'some_other_app_key', 'theme']) {
      expect(keys, forbidden).not.toContain(forbidden)
      expect(readItem(forbidden), forbidden).toBeNull()
    }
    expect(JSON.stringify(backend.snapshot())).not.toMatch(/sk-secret|sk-legacy|sk-hidden|access_token/)
    resetStorageBackend()
  })

  it('an unreadable localStorage never stops the vault starting', async () => {
    localStorage.setItem('nf_novels', '[{"id":"x"}]')
    const spy = vi.spyOn(Storage.prototype, 'key').mockImplementation(() => { throw new Error('SecurityError') })
    const { backend, resetStorageBackend } = await boot()
    expect(backend).not.toBeNull()
    spy.mockRestore()
    resetStorageBackend()
  })
})

describe('planLegacyLocalMigration (pure rules)', () => {
  const ls = entries => ({
    get length() { return Object.keys(entries).length },
    key: i => Object.keys(entries)[i] ?? null,
    getItem: k => entries[k] ?? null,
  })
  it('skips when the marker is present, when the vault already holds project data, or without localStorage', () => {
    expect(planLegacyLocalMigration(new Map([[LEGACY_MIGRATION_MARKER_KEY, 'x']]), ls({ nf_a: '1' })).skipped).toBe('already-ran')
    expect(planLegacyLocalMigration(new Map([['nf_b', '2']]), ls({ nf_a: '1' })).skipped).toBe('vault-has-data')
    expect(planLegacyLocalMigration(new Map(), null).skipped).toBe('no-localstorage')
    expect(planLegacyLocalMigration(new Map(), ls({ other: '1' })).migrate).toBe(false)
  })
  it('only nf_ keys that are not credentials or durability flags are migratable', () => {
    expect(isMigratableLegacyKey('nf_novels')).toBe(true)
    expect(isMigratableLegacyKey('nf_scene_content:abc')).toBe(true)
    expect(isMigratableLegacyKey('nf_aiSettings')).toBe(false)
    expect(isMigratableLegacyKey('nf_password_hint')).toBe(false)
    expect(isMigratableLegacyKey('sb-x-auth-token')).toBe(false)
    expect(isMigratableLegacyKey('theme')).toBe(false)
    expect(isMigratableLegacyKey(null)).toBe(false)
  })
})
