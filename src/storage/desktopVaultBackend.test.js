import { describe, expect, it, vi } from 'vitest'
import { createDesktopVaultBackend } from './desktopVaultBackend.js'

describe('desktop vault backend shell', () => {
  it('serves synchronous reads from the hydrated mirror', () => {
    const backend = createDesktopVaultBackend({
      entries: { nf_novels: '[{"id":"novel-1"}]' },
    })

    expect(backend.name).toBe('desktop-vault')
    expect(backend.getItem('nf_novels')).toBe('[{"id":"novel-1"}]')
    expect(backend.getItem('nf_missing')).toBeNull()
  })

  it('updates the mirror synchronously and persists writes asynchronously in order', async () => {
    const persisted = []
    const backend = createDesktopVaultBackend({
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
    const backend = createDesktopVaultBackend({
      persistItem: async () => { throw new Error('sqlite unavailable') },
      onWriteError,
      retry: { attempts: 1 }, // disable retry — this test cares about failure reporting, not timing
    })

    backend.setItem('nf_scenes', '[]')
    expect(backend.getItem('nf_scenes')).toBe('[]')

    await backend.flush()
    expect(onWriteError).toHaveBeenCalledOnce()
    expect(onWriteError.mock.calls[0][0].message).toBe('sqlite unavailable')
    expect(onWriteError.mock.calls[0][1]).toBe('nf_scenes')
    expect(backend.getDurabilityState()).toEqual({ pending: 0, lastError: expect.any(Error) })
  })

  it('retries a failing write before giving up, and recovers durability state on eventual success', async () => {
    const onWriteError = vi.fn()
    const onWriteSuccess = vi.fn()
    let attempts = 0
    const backend = createDesktopVaultBackend({
      persistItem: async () => {
        attempts += 1
        if (attempts < 3) throw new Error('transient IPC hiccup')
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
    const backend = createDesktopVaultBackend({
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

  it('exposes a snapshot for backup and diagnostics', () => {
    const backend = createDesktopVaultBackend({
      entries: new Map([['nf_maps', '[]']]),
    })
    backend.setItem('nf_activeMapByNovel', '{}')

    expect(backend.snapshot()).toEqual({
      nf_maps: '[]',
      nf_activeMapByNovel: '{}',
    })
  })
})
