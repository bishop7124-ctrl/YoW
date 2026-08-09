// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { splitScenesForStorage, hydrateScenesFromStorage, sceneContentKey } from './sceneContentStore'
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
