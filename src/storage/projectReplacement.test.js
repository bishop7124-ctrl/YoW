import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryBackend, resetStorageBackend, setStorageBackend } from './projectStorage.js'
import { buildProjectReplacementEntries, replaceProjectStorageAtomically } from './projectReplacement.js'

describe('atomic project storage replacement', () => {
  beforeEach(() => resetStorageBackend())

  it('serializes scene prose separately and supplies complete defaults', () => {
    const entries = buildProjectReplacementEntries({
      novels: [{ id: 'novel-1' }],
      scenes: [{ id: 'scene-1', novelId: 'novel-1', title: 'Opening', content: 'Prose' }],
      activeNovelId: 'novel-1',
    }, { ownerId: 'user-1', writtenAt: 123 })

    expect(JSON.parse(entries.nf_scenes)).toEqual([
      { id: 'scene-1', novelId: 'novel-1', title: 'Opening' },
    ])
    expect(entries['nf_scene_content:scene-1']).toBe('Prose')
    expect(entries.nf_characters).toBe('[]')
    expect(entries.nf_activeMapByNovel).toBe('{}')
    expect(entries.nf_localOwner).toBe('user-1')
    expect(entries.nf_localWriteAt).toBe('123')
  })

  it('removes stale scene prose in the same backend operation', async () => {
    const backend = createMemoryBackend({
      'nf_scene_content:stale': 'old prose',
      nf_localWriteFailed: '["nf_scenes"]',
    })
    backend.replaceItems = vi.fn(backend.replaceItems)
    setStorageBackend(backend)

    await replaceProjectStorageAtomically({
      scenes: [{ id: 'kept', content: 'new prose' }],
    }, { ownerId: 'user-1', writtenAt: 456 })

    expect(backend.replaceItems).toHaveBeenCalledOnce()
    const [, removed] = backend.replaceItems.mock.calls[0]
    expect(removed).toEqual(expect.arrayContaining(['nf_localWriteFailed', 'nf_scene_content:stale']))
    expect(backend.getItem('nf_scene_content:stale')).toBeNull()
    expect(backend.getItem('nf_scene_content:kept')).toBe('new prose')
  })
})
