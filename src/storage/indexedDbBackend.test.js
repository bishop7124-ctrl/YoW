import { describe, expect, it, vi } from 'vitest'
import { createIndexedDbBackend } from './indexedDbBackend.js'

describe('indexeddb backend shell', () => {
  it('serves synchronous reads from the hydrated mirror', () => {
    const backend = createIndexedDbBackend({
      entries: { nf_novels: '[{"id":"novel-1"}]' },
    })

    expect(backend.name).toBe('indexeddb')
    expect(backend.getItem('nf_novels')).toBe('[{"id":"novel-1"}]')
    expect(backend.getItem('nf_missing')).toBeNull()
  })

  it('updates the mirror synchronously and persists writes asynchronously in order', async () => {
    const persisted = []
    const backend = createIndexedDbBackend({
      persistItem: async (key, value) => { persisted.push(['set', key, value]) },
      removePersistedItem: async key => { persisted.push(['remove', key]) },
    })

    backend.setItem('nf_activeNovel', 'novel-1')
    expect(backend.getItem('nf_activeNovel')).toBe('novel-1')

    backend.setItem('nf_activeNovel', 'novel-2')
    backend.removeItem('nf_activeNovel')
    expect(backend.getItem('nf_activeNovel')).toBeNull()

    await backend.flush()
    expect(persisted).toEqual([
      ['set', 'nf_activeNovel', 'novel-1'],
      ['set', 'nf_activeNovel', 'novel-2'],
      ['remove', 'nf_activeNovel'],
    ])
  })

  it('records persistence errors (with the failing key) without breaking the synchronous mirror', async () => {
    const onWriteError = vi.fn()
    const backend = createIndexedDbBackend({
      persistItem: async () => { throw new Error('indexeddb unavailable') },
      onWriteError,
      retry: { attempts: 1 }, // disable retry — this test cares about failure reporting, not timing
    })

    backend.setItem('nf_scenes', '[]')
    expect(backend.getItem('nf_scenes')).toBe('[]')

    await backend.flush()
    expect(onWriteError).toHaveBeenCalledOnce()
    expect(onWriteError.mock.calls[0][0].message).toBe('indexeddb unavailable')
    expect(onWriteError.mock.calls[0][1]).toBe('nf_scenes')
    expect(backend.getDurabilityState()).toEqual({ pending: 0, lastError: expect.any(Error) })
  })

  it('retries a failing write before giving up, and recovers durability state on eventual success', async () => {
    const onWriteError = vi.fn()
    const onWriteSuccess = vi.fn()
    let attempts = 0
    const backend = createIndexedDbBackend({
      persistItem: async () => {
        attempts += 1
        if (attempts < 3) throw new Error('transient transaction abort')
      },
      onWriteError,
      onWriteSuccess,
      retry: { attempts: 3, baseDelayMs: 0 },
    })

    backend.setItem('nf_scenes', '[]')
    await backend.flush()

    expect(attempts).toBe(3)
    expect(onWriteError).not.toHaveBeenCalled()
    expect(onWriteSuccess).toHaveBeenCalledWith('nf_scenes')
    expect(backend.getDurabilityState()).toEqual({ pending: 0, lastError: null })
  })

  it('tracks pending writes while a persist is still in flight', async () => {
    let resolvePersist
    const backend = createIndexedDbBackend({
      persistItem: () => new Promise(resolve => { resolvePersist = resolve }),
    })

    backend.setItem('nf_scenes', '[]')
    expect(backend.getDurabilityState().pending).toBe(1)

    // The queued task (which calls persistItem and assigns resolvePersist)
    // runs as a promise-chain continuation, not synchronously within
    // setItem — let it actually start before resolving it.
    await Promise.resolve()
    resolvePersist()
    await backend.flush()
    expect(backend.getDurabilityState().pending).toBe(0)
  })

  it('applyExternalWrite/applyExternalRemove update the mirror without re-persisting (another tab already did)', async () => {
    const persisted = []
    const backend = createIndexedDbBackend({
      persistItem: async (key, value) => { persisted.push(['set', key, value]) },
      removePersistedItem: async key => { persisted.push(['remove', key]) },
    })

    backend.applyExternalWrite('nf_characters', '[{"id":"char-1"}]')
    expect(backend.getItem('nf_characters')).toBe('[{"id":"char-1"}]')

    backend.applyExternalRemove('nf_characters')
    expect(backend.getItem('nf_characters')).toBeNull()

    await backend.flush()
    expect(persisted).toEqual([])
  })

  it('exposes a snapshot for backup and diagnostics', () => {
    const backend = createIndexedDbBackend({
      entries: new Map([['nf_maps', '[]']]),
    })
    backend.setItem('nf_activeMapByNovel', '{}')

    expect(backend.snapshot()).toEqual({
      nf_maps: '[]',
      nf_activeMapByNovel: '{}',
    })
  })
})
