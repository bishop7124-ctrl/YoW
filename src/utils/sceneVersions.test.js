// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { saveSceneVersion, getSceneVersions, clearSceneVersionsForNovel } from './sceneVersions'
import { resetStorageBackend } from '../storage/projectStorage'

const STORAGE_KEY = 'nf_scene_versions'

beforeEach(() => {
  localStorage.clear()
  resetStorageBackend()
})

describe('clearSceneVersionsForNovel', () => {
  // Regression coverage for audit finding #16 ("Project deletion can leave
  // per-scene keys") — the version-history half. Before this fix, deleting a
  // project never touched `nf_scene_versions` at all, so every saved version
  // of every scene in the deleted project stayed on disk indefinitely.
  it('removes every version belonging to the deleted project, matched by novelId, leaving other projects untouched', () => {
    saveSceneVersion({ id: 'scene-1', novelId: 'novel-1', title: 'A', content: 'v1' })
    saveSceneVersion({ id: 'scene-1', novelId: 'novel-1', title: 'A', content: 'v2' })
    saveSceneVersion({ id: 'scene-2', novelId: 'novel-1', title: 'B', content: 'v1' })
    saveSceneVersion({ id: 'scene-3', novelId: 'novel-2', title: 'C', content: 'v1' })

    clearSceneVersionsForNovel('novel-1')

    expect(getSceneVersions('scene-1')).toHaveLength(0)
    expect(getSceneVersions('scene-2')).toHaveLength(0)
    expect(getSceneVersions('scene-3')).toHaveLength(1)
  })

  // Versions saved before a scene's `novelId` was ever populated (or where
  // the source scene had none) store `novelId: null` and so can't be matched
  // by novelId alone — the caller passes the deleted project's scene ids as
  // a fallback (see useStore.js's deleteNovel).
  it('also removes legacy novelId-less versions whose sceneId is in the supplied fallback set', () => {
    saveSceneVersion({ id: 'scene-legacy', novelId: null, title: 'Legacy', content: 'v1' })
    saveSceneVersion({ id: 'scene-legacy', novelId: undefined, title: 'Legacy', content: 'v2' })
    saveSceneVersion({ id: 'scene-other', novelId: null, title: 'Unrelated legacy', content: 'v1' })

    clearSceneVersionsForNovel('novel-1', ['scene-legacy'])

    expect(getSceneVersions('scene-legacy')).toHaveLength(0)
    expect(getSceneVersions('scene-other')).toHaveLength(1)
  })

  it('reads directly from storage, not from any in-memory state, so it cleans up versions this tab never touched', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'v1', sceneId: 'scene-1', novelId: 'novel-1', title: 'A', content: 'from another session', wordCount: 1, timestamp: 1 },
      { id: 'v2', sceneId: 'scene-2', novelId: 'novel-2', title: 'B', content: 'other project', wordCount: 1, timestamp: 2 },
    ]))

    clearSceneVersionsForNovel('novel-1')

    const remaining = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(remaining.map(v => v.id)).toEqual(['v2'])
  })

  it('is a no-op for a null/undefined novelId rather than wiping everything', () => {
    saveSceneVersion({ id: 'scene-1', novelId: 'novel-1', title: 'A', content: 'v1' })
    clearSceneVersionsForNovel(null)
    expect(getSceneVersions('scene-1')).toHaveLength(1)
  })
})
