// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIndexedDbBackend } from './indexedDbBackend.js'
import { createDesktopVaultBackend } from './desktopVaultBackend.js'
import { getPendingLocalWrites, subscribePendingLocalWrites } from './writeDurability.js'

// 4 Oct data-safety matrix, item 3: queued-storage fault injection. Both write-behind
// backends (browser IndexedDB, desktop SQLite vault) must keep the in-memory mirror
// usable, report the failing key, and expose "not durable yet" to the UI for as long
// as a write is queued or retrying, so nothing says Saved before it is on disk.

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const quotaError = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })
const diskFull = () => new Error('SQLite: database or disk is full')

const backends = [
  ['IndexedDB', createIndexedDbBackend, quotaError],
  ['desktop vault', createDesktopVaultBackend, diskFull],
]

describe.each(backends)('%s write-behind fault injection', (_name, create, makeError) => {
  it('reports a quota / disk-full failure with the failing key and keeps the mirror editable', async () => {
    const onWriteError = vi.fn()
    const backend = create({ persistItem: async () => { throw makeError() }, onWriteError, retry: { attempts: 1 } })

    backend.setItem('nf_scenes', '[{"id":"s1"}]')
    expect(backend.getItem('nf_scenes')).toBe('[{"id":"s1"}]')
    await backend.flush()

    expect(onWriteError).toHaveBeenCalledWith(expect.objectContaining({ message: makeError().message }), 'nf_scenes')
    expect(backend.getDurabilityState().lastError).toBeTruthy()
    expect(backend.getDurabilityState().pending).toBe(0)
    expect(getPendingLocalWrites()).toBe(0)
    // still usable: a later write that works clears the error state
    const onWriteSuccess = vi.fn()
    const recovering = create({
      persistItem: vi.fn().mockRejectedValueOnce(makeError()).mockResolvedValue(undefined),
      onWriteSuccess,
      retry: { attempts: 3, baseDelayMs: 1 },
    })
    recovering.setItem('nf_scenes', 'v2')
    await recovering.flush()
    expect(onWriteSuccess).toHaveBeenCalledWith('nf_scenes')
    expect(recovering.getDurabilityState().lastError).toBeNull()
  })

  it('stays "not durable" while a write is in flight or retrying, then settles to zero', async () => {
    const seen = []
    const unsubscribe = subscribePendingLocalWrites(() => seen.push(getPendingLocalWrites()))
    let release
    const gate = new Promise(resolve => { release = resolve })
    const backend = create({ persistItem: () => gate })

    backend.setItem('nf_scenes', 'edit')
    expect(getPendingLocalWrites()).toBe(1)           // tab/app closed here would lose the edit
    expect(backend.getDurabilityState().pending).toBe(1)
    backend.setItem('nf_notes', 'edit2')
    expect(getPendingLocalWrites()).toBe(2)

    release()
    await backend.flush()
    expect(getPendingLocalWrites()).toBe(0)
    expect(seen[0]).toBe(1)
    expect(seen.at(-1)).toBe(0)
    unsubscribe()
  })

  it('counts a failing write as pending for the whole retry window, and never goes negative', async () => {
    const calls = []
    const backend = create({
      persistItem: async () => { calls.push(getPendingLocalWrites()); throw makeError() },
      retry: { attempts: 3, baseDelayMs: 1 },
    })
    backend.setItem('nf_scenes', 'edit')
    await backend.flush()
    expect(calls).toEqual([1, 1, 1])                  // pending on every attempt, so the UI cannot say Saved
    expect(getPendingLocalWrites()).toBe(0)
    expect(backend.getDurabilityState().pending).toBe(0)
  })

  it('a failed replacement transaction (project replace/restore) leaves the mirror untouched and counts as settled', async () => {
    const onWriteError = vi.fn()
    const backend = create({
      entries: { nf_novels: 'old' },
      replacePersistedItems: async () => { throw makeError() },
      onWriteError,
      retry: { attempts: 1 },
    })
    await expect(backend.replaceItems({ nf_novels: 'new' }, [])).rejects.toThrow()
    expect(backend.getItem('nf_novels')).toBe('old')
    expect(onWriteError).toHaveBeenCalled()
    expect(getPendingLocalWrites()).toBe(0)
  })

  it('a write that fails and then the next one succeeding does not leave the failure flag stuck', async () => {
    const persistItem = vi.fn().mockRejectedValueOnce(makeError()).mockResolvedValueOnce(undefined)
    const backend = create({ persistItem, retry: { attempts: 1 } })
    backend.setItem('a', '1')
    await backend.flush()
    expect(backend.getDurabilityState().lastError).toBeTruthy()
    backend.setItem('a', '2')
    await backend.flush()
    expect(backend.getDurabilityState().lastError).toBeNull()
  })
})

describe('IndexedDB open failures fall back to browser-local storage without throwing', () => {
  it('open() throwing synchronously (locked-down / private context)', async () => {
    const original = window.indexedDB
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open: () => { throw new DOMException('denied', 'SecurityError') } } })
    const { initializeIndexedDbStorage } = await import('./browserVaultAdapter.js')
    const { getStorageBackend, resetStorageBackend } = await import('./projectStorage.js')
    await expect(initializeIndexedDbStorage()).resolves.toBeNull()
    expect(getStorageBackend().name).toBe('browser-local')
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: original })
    resetStorageBackend()
  })

  it('open request firing an error event (storage disabled / disk full at open)', async () => {
    const original = window.indexedDB
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: {
        open: () => {
          const request = {}
          setTimeout(() => { request.error = quotaError(); request.onerror?.() }, 0)
          return request
        },
      },
    })
    const { initializeIndexedDbStorage } = await import('./browserVaultAdapter.js')
    const { getStorageBackend, resetStorageBackend } = await import('./projectStorage.js')
    await expect(initializeIndexedDbStorage()).resolves.toBeNull()
    expect(getStorageBackend().name).toBe('browser-local')
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: original })
    resetStorageBackend()
  })
})
