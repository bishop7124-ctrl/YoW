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

  it('broadcasts writes/removals across tabs so a second tab\'s mirror reflects what the first tab saved', async () => {
    const { initializeIndexedDbStorage } = await import('./browserVaultAdapter.js')
    const { resetStorageBackend } = await import('./projectStorage.js')

    // Two tabs = two independent hydrations, each installing its own backend
    // instance. Without the cross-tab BroadcastChannel bridge, tab two's
    // mirror would never learn about tab one's write no matter how long it
    // waits — this is the actual root cause of the multi-tab silent-overwrite
    // bug (see the 2026-08-02 row in docs/ROADMAP.md's Bugs table).
    const tabOneBackend = await initializeIndexedDbStorage()
    resetStorageBackend()
    const tabTwoBackend = await initializeIndexedDbStorage()
    resetStorageBackend()

    // BroadcastChannel delivery is a real async task, not a microtask — a
    // single setTimeout(0) can occasionally miss it under a busy event loop
    // (e.g. the full suite running many files at once), so poll briefly
    // instead of trusting one fixed-length wait.
    const waitFor = async (check, timeoutMs = 500) => {
      const start = Date.now()
      while (!check()) {
        if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
        await new Promise(resolve => setTimeout(resolve, 5))
      }
    }

    tabOneBackend.setItem('nf_characters', '[{"id":"char-A","notes":"from tab one"}]')
    await waitFor(() => tabTwoBackend.getItem('nf_characters') !== null)

    expect(tabTwoBackend.getItem('nf_characters')).toBe('[{"id":"char-A","notes":"from tab one"}]')

    tabOneBackend.removeItem('nf_characters')
    await waitFor(() => tabTwoBackend.getItem('nf_characters') === null)
    expect(tabTwoBackend.getItem('nf_characters')).toBeNull()

    await tabOneBackend.flush()
    await tabTwoBackend.flush()
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
