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

  it('records persistence errors without breaking the synchronous mirror', async () => {
    const onWriteError = vi.fn()
    const backend = createDesktopVaultBackend({
      persistItem: async () => { throw new Error('sqlite unavailable') },
      onWriteError,
    })

    backend.setItem('nf_scenes', '[]')
    expect(backend.getItem('nf_scenes')).toBe('[]')

    await backend.flush()
    expect(onWriteError).toHaveBeenCalledOnce()
    expect(onWriteError.mock.calls[0][0].message).toBe('sqlite unavailable')
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
