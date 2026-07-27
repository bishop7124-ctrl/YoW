// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Note: deliberately does not delete the underlying 'yow-storage' IndexedDB
// database between tests. Connections opened by initializeIndexedDbStorage()
// are never explicitly closed (matching production, where the connection
// lives for the app's lifetime), and indexedDB.deleteDatabase() blocks until
// every open connection to that name closes — calling it here would hang
// waiting on connections from earlier tests. Tests instead scope their
// assertions to keys they own, so leftover data from earlier tests is harmless.
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('browser vault adapter', () => {
  it('does nothing inside the desktop runtime', async () => {
    vi.stubEnv('MODE', 'desktop')
    const { initializeIndexedDbStorage } = await import('./browserVaultAdapter.js')
    const { getStorageBackend, resetStorageBackend } = await import('./projectStorage.js')
    const backend = await initializeIndexedDbStorage()

    expect(backend).toBeNull()
    expect(getStorageBackend().name).toBe('browser-local')
    resetStorageBackend()
  })

  it('does nothing when indexedDB is unavailable', async () => {
    const original = window.indexedDB
    // eslint-disable-next-line no-undef
    delete window.indexedDB
    const { initializeIndexedDbStorage } = await import('./browserVaultAdapter.js')
    const { getStorageBackend, resetStorageBackend } = await import('./projectStorage.js')
    const backend = await initializeIndexedDbStorage()

    expect(backend).toBeNull()
    expect(getStorageBackend().name).toBe('browser-local')
    window.indexedDB = original
    resetStorageBackend()
  })

  it('hydrates the indexeddb backend and routes writes through indexedDB', async () => {
    const { initializeIndexedDbStorage } = await import('./browserVaultAdapter.js')
    const { loadValue, readItem, resetStorageBackend, writeItem } = await import('./projectStorage.js')

    // Seed a value through a first-boot backend, then re-initialize to confirm
    // it hydrates from what was actually persisted to IndexedDB.
    const firstBackend = await initializeIndexedDbStorage()
    expect(firstBackend.name).toBe('indexeddb')
    writeItem('nf_novels', '[{"id":"novel-1"}]')
    await firstBackend.flush()
    resetStorageBackend()

    const backend = await initializeIndexedDbStorage()
    expect(backend.name).toBe('indexeddb')
    expect(loadValue('nf_novels', [])).toEqual([{ id: 'novel-1' }])

    writeItem('nf_activeNovel', 'novel-1')
    expect(readItem('nf_activeNovel')).toBe('novel-1')
    await backend.flush()

    resetStorageBackend()
  })

  it('records write failures via onWriteError without breaking the synchronous mirror', async () => {
    const { initializeIndexedDbStorage } = await import('./browserVaultAdapter.js')
    const { resetStorageBackend, writeItem, readItem } = await import('./projectStorage.js')
    const onWriteError = vi.fn()

    const backend = await initializeIndexedDbStorage({ onWriteError })
    // Force transaction creation itself to fail (before any request is opened),
    // simulating a blocked/unavailable IndexedDB write without leaving a dangling
    // half-started transaction behind.
    const transactionSpy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new Error('indexeddb transaction failed')
    })

    writeItem('nf_scenes', '[]')
    expect(readItem('nf_scenes')).toBe('[]')
    await backend.flush()
    expect(onWriteError).toHaveBeenCalled()

    transactionSpy.mockRestore()
    resetStorageBackend()
  })
})
