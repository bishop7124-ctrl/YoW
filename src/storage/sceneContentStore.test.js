// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { splitScenesForStorage, hydrateScenesFromStorage, sceneContentKey, deleteAllSceneContentForNovel } from './sceneContentStore'
import { resetStorageBackend } from './projectStorage'

describe('sceneContentStore', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStorageBackend()
  })

  // Direct regression test for a real data-loss incident (2026-08-09, see
  // docs/ROADMAP.md): an earlier version of splitScenesForStorage wrote a
  // scene's content key only when that specific call's own update touched
  // it, relying on the (false) assumption that every *other* scene must
  // already have a content key from some earlier write. On the very first
  // call ever made for a set of scenes — real content already in memory
  // (e.g. from a page load or a prior in-memory-only session), nothing yet
  // migrated to the new per-scene keys — that assumption is false for
  // every scene, and only the one actually-touched scene's content
  // survived; every other scene's content was stripped from the metadata
  // and never written anywhere, a silent total loss for the rest of the
  // account. This test isolates that exact call shape directly against the
  // function, independent of anything in useStore.js that happens to
  // compensate for it (the initial-mount effect's own fix, tested
  // separately in useStore.test.js, does compensate for the *common* path
  // — but this function must be correct on its own, since nothing
  // guarantees every caller goes through that effect first).
  it('writes every scene\'s content key on the first-ever call, not just the one scene that changed', () => {
    const lastWrittenContentById = new Map()
    const knownContentKeyIds = new Set()

    // prevScenes deliberately mirrors `scenes` except for the one scene
    // being edited — real content already present for every scene, exactly
    // as it would be after a normal page load, but knownContentKeyIds is
    // empty because nothing has been through this function before.
    const makeScenes = (editedContent) => [
      { id: 'a', content: 'Scene A original content.' },
      { id: 'b', content: 'Scene B original content.' },
      { id: 'c', content: editedContent },
    ]
    const prevScenes = makeScenes('Scene C original content.')
    const nextScenes = makeScenes('Scene C EDITED content.')

    const metadata = splitScenesForStorage(nextScenes, prevScenes, lastWrittenContentById, knownContentKeyIds)

    // The metadata itself should have content stripped for every scene —
    // that's the point of the split.
    metadata.forEach(s => expect(s.content).toBeUndefined())

    // Every scene's content — not just the touched one — must actually be
    // retrievable from its own key. This is the assertion the original bug
    // failed: scenes A and B would come back `null` here.
    expect(localStorage.getItem(sceneContentKey('a'))).toBe('Scene A original content.')
    expect(localStorage.getItem(sceneContentKey('b'))).toBe('Scene B original content.')
    expect(localStorage.getItem(sceneContentKey('c'))).toBe('Scene C EDITED content.')

    expect(knownContentKeyIds.has('a')).toBe(true)
    expect(knownContentKeyIds.has('b')).toBe(true)
    expect(knownContentKeyIds.has('c')).toBe(true)
  })

  it('does not re-write an untouched scene\'s content key on a second call once it is known', () => {
    const lastWrittenContentById = new Map()
    const knownContentKeyIds = new Set()
    const scenesV1 = [
      { id: 'a', content: 'Scene A.' },
      { id: 'b', content: 'Scene B.' },
    ]
    splitScenesForStorage(scenesV1, [], lastWrittenContentById, knownContentKeyIds)
    localStorage.setItem(sceneContentKey('a'), '__TAMPERED__') // simulate another tab's fresher write

    // A second commit that only touches 'b' — 'a' should be left completely
    // alone (matches commitLocal's own untouched-record semantics).
    const scenesV2 = [scenesV1[0], { id: 'b', content: 'Scene B EDITED.' }]
    splitScenesForStorage(scenesV2, scenesV1, lastWrittenContentById, knownContentKeyIds)

    expect(localStorage.getItem(sceneContentKey('a'))).toBe('__TAMPERED__')
    expect(localStorage.getItem(sceneContentKey('b'))).toBe('Scene B EDITED.')
  })

  it('never uses a "differs from what I last wrote" cache as the write trigger (would clobber another tab\'s fresher content)', () => {
    // Two independent caches, simulating two browser tabs that have each
    // independently already split-written these scenes once (so both
    // start with full knownContentKeyIds), then diverge: tab A edits
    // scene X, tab B — whose own in-memory copy of X is now stale —
    // commits an update to a *different* scene, Y, without knowing about
    // tab A's edit.
    const initial = [
      { id: 'x', content: 'X original.' },
      { id: 'y', content: 'Y original.' },
    ]
    const tabACache = { last: new Map(), known: new Set() }
    const tabBCache = { last: new Map(), known: new Set() }
    splitScenesForStorage(initial, [], tabACache.last, tabACache.known)
    splitScenesForStorage(initial, [], tabBCache.last, tabBCache.known)

    // Tab A edits X for real.
    const afterTabA = [{ id: 'x', content: 'X edited by tab A.' }, initial[1]]
    splitScenesForStorage(afterTabA, initial, tabACache.last, tabACache.known)
    expect(localStorage.getItem(sceneContentKey('x'))).toBe('X edited by tab A.')

    // Tab B commits an update to Y only — its own `prevScenes` still shows
    // X's stale original content, unchanged from tab B's own perspective,
    // so X must not be touched even though tab B's cache never saw tab A's
    // write and would (wrongly) think X "differs from what I last wrote".
    const tabBNext = [initial[0], { id: 'y', content: 'Y edited by tab B.' }]
    splitScenesForStorage(tabBNext, initial, tabBCache.last, tabBCache.known)

    expect(localStorage.getItem(sceneContentKey('x'))).toBe('X edited by tab A.') // untouched by tab B
    expect(localStorage.getItem(sceneContentKey('y'))).toBe('Y edited by tab B.')
  })

  it('removes a deleted scene\'s content key and stops tracking it', () => {
    const lastWrittenContentById = new Map()
    const knownContentKeyIds = new Set()
    const scenesV1 = [{ id: 'a', content: 'A.' }, { id: 'b', content: 'B.' }]
    splitScenesForStorage(scenesV1, [], lastWrittenContentById, knownContentKeyIds)
    expect(localStorage.getItem(sceneContentKey('b'))).toBe('B.')

    splitScenesForStorage([scenesV1[0]], scenesV1, lastWrittenContentById, knownContentKeyIds)

    expect(localStorage.getItem(sceneContentKey('b'))).toBeNull()
    expect(knownContentKeyIds.has('b')).toBe(false)
  })

  // Regression coverage for audit finding #16 ("Project deletion can leave
  // per-scene keys"): the fix reads the deleted project's scene ids straight
  // from persisted `nf_scenes`, independent of any in-memory
  // knownContentKeyIds/scenesRef state — see deleteAllSceneContentForNovel's
  // own doc comment for the two passes this exercises.
  describe('deleteAllSceneContentForNovel', () => {
    it('removes a project\'s scene content keys directly from storage, even when the caller\'s in-memory caches never knew about them', () => {
      // Seed storage directly, the way a scene created/synced in a different
      // tab (or an earlier session) would appear — never routed through
      // splitScenesForStorage in *this* tab, so knownContentKeyIds/
      // lastWrittenContentById (both empty here) never learned its id.
      localStorage.setItem('nf_scenes', JSON.stringify([
        { id: 'scene-1', novelId: 'novel-1', title: 'Chapter One' },
        { id: 'scene-2', novelId: 'novel-1', title: 'Chapter Two' },
        { id: 'scene-3', novelId: 'novel-2', title: 'Other project scene' },
      ]))
      localStorage.setItem(sceneContentKey('scene-1'), 'Novel 1 scene 1 prose.')
      localStorage.setItem(sceneContentKey('scene-2'), 'Novel 1 scene 2 prose.')
      localStorage.setItem(sceneContentKey('scene-3'), 'Novel 2 scene prose.')

      const knownContentKeyIds = new Set() // deliberately empty — the bug this fix closes
      const lastWrittenContentById = new Map()

      const removed = deleteAllSceneContentForNovel('novel-1', { knownContentKeyIds, lastWrittenContentById })

      expect(removed.sort()).toEqual(['scene-1', 'scene-2'])
      expect(localStorage.getItem(sceneContentKey('scene-1'))).toBeNull()
      expect(localStorage.getItem(sceneContentKey('scene-2'))).toBeNull()
      // Another project's scene content must survive untouched.
      expect(localStorage.getItem(sceneContentKey('scene-3'))).toBe('Novel 2 scene prose.')
    })

    it('also sweeps orphaned content keys with no living scene record in nf_scenes at all, regardless of project', () => {
      // A key left behind by some earlier gap in cleanup — its scene no
      // longer appears in nf_scenes under any project.
      localStorage.setItem('nf_scenes', JSON.stringify([
        { id: 'scene-1', novelId: 'novel-1', title: 'Still here' },
      ]))
      localStorage.setItem(sceneContentKey('scene-1'), 'Live content.')
      localStorage.setItem(sceneContentKey('orphan-1'), 'Nobody references this scene any more.')

      const removed = deleteAllSceneContentForNovel('novel-1', { knownContentKeyIds: new Set(), lastWrittenContentById: new Map() })

      expect(removed.sort()).toEqual(['orphan-1', 'scene-1'])
      expect(localStorage.getItem(sceneContentKey('orphan-1'))).toBeNull()
      expect(localStorage.getItem(sceneContentKey('scene-1'))).toBeNull()
    })

    it('leaves other projects\' orphan-free content untouched and removes nothing when the project has no scenes', () => {
      localStorage.setItem('nf_scenes', JSON.stringify([
        { id: 'scene-9', novelId: 'novel-9', title: 'Untouched' },
      ]))
      localStorage.setItem(sceneContentKey('scene-9'), 'Should survive.')

      const removed = deleteAllSceneContentForNovel('novel-empty', { knownContentKeyIds: new Set(), lastWrittenContentById: new Map() })

      expect(removed).toEqual([])
      expect(localStorage.getItem(sceneContentKey('scene-9'))).toBe('Should survive.')
    })

    it('purges removed ids from the caller-supplied caches so a later commit does not carry stale bookkeeping', () => {
      localStorage.setItem('nf_scenes', JSON.stringify([{ id: 'scene-1', novelId: 'novel-1' }]))
      localStorage.setItem(sceneContentKey('scene-1'), 'Content.')
      const knownContentKeyIds = new Set(['scene-1'])
      const lastWrittenContentById = new Map([['scene-1', 'Content.']])

      deleteAllSceneContentForNovel('novel-1', { knownContentKeyIds, lastWrittenContentById })

      expect(knownContentKeyIds.has('scene-1')).toBe(false)
      expect(lastWrittenContentById.has('scene-1')).toBe(false)
    })

    it('is a no-op when nf_scenes is missing or corrupt, beyond sweeping any content keys it finds as orphans', () => {
      localStorage.setItem(sceneContentKey('scene-x'), 'Unreachable metadata.')
      // No 'nf_scenes' key at all.
      const removed = deleteAllSceneContentForNovel('novel-1', { knownContentKeyIds: new Set(), lastWrittenContentById: new Map() })
      expect(removed).toEqual(['scene-x'])
      expect(localStorage.getItem(sceneContentKey('scene-x'))).toBeNull()
    })
  })

  describe('hydrateScenesFromStorage', () => {
    it('reads content back from each scene\'s own key', () => {
      localStorage.setItem(sceneContentKey('a'), 'Hydrated A.')
      const result = hydrateScenesFromStorage([{ id: 'a' }])
      expect(result[0].content).toBe('Hydrated A.')
    })

    it('trusts pre-existing inline content on legacy (unsplit) records', () => {
      const result = hydrateScenesFromStorage([{ id: 'a', content: 'Legacy inline content.' }])
      expect(result[0].content).toBe('Legacy inline content.')
    })

    it('falls back to empty content, not a throw, when no key exists', () => {
      const result = hydrateScenesFromStorage([{ id: 'missing' }])
      expect(result[0].content).toBe('')
    })
  })
})
