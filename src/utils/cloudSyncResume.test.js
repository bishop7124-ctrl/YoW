import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLocalFirstSnapshot } from './storageMode'
import { persistReviewedCloudSyncResume } from './cloudSyncResume'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(key => store.get(key) ?? null),
    setItem: vi.fn((key, value) => { store.set(key, String(value)) }),
    removeItem: vi.fn(key => { store.delete(key) }),
    clear: vi.fn(() => { store.clear() }),
  })
  localStorage.clear()
})

describe('persistReviewedCloudSyncResume', () => {
  it('writes the reviewed desktop choices to cloud before Cloud Sync resumes', async () => {
    const replaceUserData = vi.fn(() => Promise.resolve())
    const trackSync = vi.fn(promise => promise)
    const reviewedMerge = {
      novels: [{ id: 'project-1', title: 'Project' }],
      characters: [
        { id: 'char-1', novelId: 'project-1', name: 'Antagonist', pronouns: 'desktop choice' },
      ],
      scenes: [
        { id: 'scene-1', novelId: 'project-1', title: 'Opening', content: 'desktop manuscript' },
      ],
      loreEntries: [
        { id: 'orphan-lore', novelId: 'deleted-project', title: 'Should not sync' },
      ],
    }

    const persisted = await persistReviewedCloudSyncResume('user-1', reviewedMerge, { replaceUserData, trackSync })

    expect(trackSync).toHaveBeenCalledTimes(1)
    expect(replaceUserData).toHaveBeenCalledWith('user-1', expect.objectContaining({
      novels: [{ id: 'project-1', title: 'Project' }],
      characters: [
        { id: 'char-1', novelId: 'project-1', name: 'Antagonist', pronouns: 'desktop choice' },
      ],
      scenes: [
        { id: 'scene-1', novelId: 'project-1', title: 'Opening', content: 'desktop manuscript' },
      ],
      activeNovelId: 'project-1',
      activeMapByNovel: {},
      loreEntries: [],
    }))
    expect(persisted.characters[0].pronouns).toBe('desktop choice')
    expect(persisted.scenes[0].content).toBe('desktop manuscript')
    expect(loadLocalFirstSnapshot('user-1')).toEqual(persisted)
  })
})
