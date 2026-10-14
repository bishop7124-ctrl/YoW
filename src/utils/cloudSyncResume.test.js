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
    const loadUserData = vi.fn(() => Promise.resolve({
      novels: [{ id: 'project-1', title: 'Project' }],
      characters: [
        { id: 'char-1', novelId: 'project-1', name: 'Antagonist', pronouns: 'desktop choice' },
      ],
      scenes: [
        { id: 'scene-1', novelId: 'project-1', title: 'Opening', content: 'desktop manuscript' },
      ],
      activeNovelId: 'project-1',
      activeMapByNovel: {},
    }))
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

    const persisted = await persistReviewedCloudSyncResume('user-1', reviewedMerge, {
      replaceUserData,
      loadUserData,
      trackSync,
    })

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
    expect(loadUserData).toHaveBeenCalledWith('user-1')
    expect(persisted.characters[0].pronouns).toBe('desktop choice')
    expect(persisted.scenes[0].content).toBe('desktop manuscript')
    expect(loadLocalFirstSnapshot('user-1')).toEqual(persisted)
  })

  it('fails before resuming if cloud still has the browser version after the merge write', async () => {
    const replaceUserData = vi.fn(() => Promise.resolve())
    const loadUserData = vi.fn(() => Promise.resolve({
      novels: [{ id: 'project-1', title: 'Project' }],
      characters: [
        { id: 'char-1', novelId: 'project-1', name: 'Antagonist', pronouns: 'browser choice' },
      ],
      scenes: [
        { id: 'scene-1', novelId: 'project-1', title: 'Opening', content: 'browser manuscript' },
      ],
      activeNovelId: 'project-1',
      activeMapByNovel: {},
    }))

    await expect(persistReviewedCloudSyncResume('user-1', {
      novels: [{ id: 'project-1', title: 'Project' }],
      characters: [
        { id: 'char-1', novelId: 'project-1', name: 'Antagonist', pronouns: 'desktop choice' },
      ],
      scenes: [
        { id: 'scene-1', novelId: 'project-1', title: 'Opening', content: 'desktop manuscript' },
      ],
    }, { replaceUserData, loadUserData })).rejects.toThrow('Cloud Sync resume did not persist characters char-1 (differs in: pronouns).')
  })

  it('ignores key order when checking what the cloud stored', async () => {
    const replaceUserData = vi.fn(() => Promise.resolve())
    const loadUserData = vi.fn(() => Promise.resolve({
      novels: [{ title: 'Project', id: 'project-1' }],
      scenes: [{ content: 'text', novelId: 'project-1', id: 'scene-1', meta: { b: 2, a: 1 } }],
      activeNovelId: 'project-1',
      activeMapByNovel: {},
    }))
    await expect(persistReviewedCloudSyncResume('user-1', {
      novels: [{ id: 'project-1', title: 'Project' }],
      scenes: [{ id: 'scene-1', novelId: 'project-1', content: 'text', meta: { a: 1, b: 2 } }],
      activeNovelId: 'project-1',
    }, { replaceUserData, loadUserData })).resolves.toBeTruthy()
  })

  it('names the differing scene fields without including their content', async () => {
    const replaceUserData = vi.fn(() => Promise.resolve())
    const loadUserData = vi.fn(() => Promise.resolve({
      novels: [{ id: 'project-1', title: 'Project' }],
      scenes: [{ id: 'scene-1', novelId: 'project-1', content: 'SECRET MANUSCRIPT', wordCount: 3 }],
      activeNovelId: 'project-1',
      activeMapByNovel: {},
    }))
    const error = await persistReviewedCloudSyncResume('user-1', {
      novels: [{ id: 'project-1', title: 'Project' }],
      scenes: [{ id: 'scene-1', novelId: 'project-1', content: 'other text', wordCount: 2 }],
      activeNovelId: 'project-1',
    }, { replaceUserData, loadUserData }).catch(e => e)
    expect(error.message).toBe('Cloud Sync resume did not persist scenes scene-1 (differs in: content, wordCount).')
    expect(error.message).not.toContain('SECRET')
  })
})
