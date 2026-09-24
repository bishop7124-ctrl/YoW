// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
})

describe('scene version history (per-scene storage keys)', () => {
  beforeEach(async () => {
    const { resetStorageBackend } = await import('../storage/projectStorage.js')
    resetStorageBackend()
    localStorage.clear()
  })

  it('saves snapshots newest-first and skips a duplicate of the latest snapshot', async () => {
    const { saveSceneVersion, getSceneVersions } = await import('./sceneVersions.js')
    saveSceneVersion({ id: 'scene-1', novelId: 'novel-1', title: 'A', content: 'Hello' })
    saveSceneVersion({ id: 'scene-1', novelId: 'novel-1', title: 'A', content: 'Hello' }) // unchanged — skipped
    saveSceneVersion({ id: 'scene-1', novelId: 'novel-1', title: 'A', content: 'Hello world' })

    const versions = getSceneVersions('scene-1')
    expect(versions).toHaveLength(2)
    expect(versions[0].content).toBe('Hello world')
    expect(versions[1].content).toBe('Hello')
  })

  it('keeps every scene under its own storage key, never a shared blob', async () => {
    const { saveSceneVersion, sceneVersionsKey } = await import('./sceneVersions.js')
    const { readItem } = await import('../storage/projectStorage.js')
    saveSceneVersion({ id: 'scene-1', content: 'One' })
    saveSceneVersion({ id: 'scene-2', content: 'Two' })

    expect(readItem('nf_scene_versions')).toBeNull() // no shared blob at all
    expect(JSON.parse(readItem(sceneVersionsKey('scene-1')))[0].content).toBe('One')
    expect(JSON.parse(readItem(sceneVersionsKey('scene-2')))[0].content).toBe('Two')
  })

  it('deleteSceneVersion removes only the named version for that scene', async () => {
    const { saveSceneVersion, getSceneVersions, deleteSceneVersion } = await import('./sceneVersions.js')
    saveSceneVersion({ id: 'scene-1', content: 'One' })
    saveSceneVersion({ id: 'scene-1', content: 'Two' })
    const [latest, prior] = getSceneVersions('scene-1')
    deleteSceneVersion(prior.id, 'scene-1')
    expect(getSceneVersions('scene-1').map(v => v.id)).toEqual([latest.id])
  })

  it('clearSceneVersions removes the whole per-scene key (used by deleteScene/deleteNovel)', async () => {
    const { saveSceneVersion, getSceneVersions, clearSceneVersions, sceneVersionsKey } = await import('./sceneVersions.js')
    const { readItem } = await import('../storage/projectStorage.js')
    saveSceneVersion({ id: 'scene-1', content: 'One' })
    clearSceneVersions('scene-1')
    expect(readItem(sceneVersionsKey('scene-1'))).toBeNull()
    expect(getSceneVersions('scene-1')).toEqual([])
  })

  it('listSceneIdsWithVersions enumerates every scene with saved history (used by the orphan sweep)', async () => {
    const { saveSceneVersion, listSceneIdsWithVersions } = await import('./sceneVersions.js')
    saveSceneVersion({ id: 'scene-1', content: 'One' })
    saveSceneVersion({ id: 'scene-2', content: 'Two' })
    expect(listSceneIdsWithVersions().sort()).toEqual(['scene-1', 'scene-2'])
  })

  // Existing installs may still have the old shared `nf_scene_versions` blob
  // on disk. A fresh module instance (simulating first touch after upgrading)
  // must fold it into the new per-scene keys rather than silently discarding
  // it, and must never run the migration twice or clobber a per-scene key a
  // regular save already wrote.
  it('migrates legacy single-blob nf_scene_versions data into per-scene keys once', async () => {
    const { writeItem, readItem } = await import('../storage/projectStorage.js')
    writeItem('nf_scene_versions', JSON.stringify([
      { id: 'legacy-1', sceneId: 'scene-1', content: 'Legacy one', timestamp: 1 },
      { id: 'legacy-2', sceneId: 'scene-1', content: 'Legacy two', timestamp: 2 },
      { id: 'legacy-3', sceneId: 'scene-2', content: 'Legacy scene 2', timestamp: 1 },
    ]))

    const { getSceneVersions } = await import('./sceneVersions.js')
    expect(getSceneVersions('scene-1').map(v => v.id)).toEqual(['legacy-2', 'legacy-1'])
    expect(getSceneVersions('scene-2').map(v => v.id)).toEqual(['legacy-3'])
    expect(readItem('nf_scene_versions')).toBeNull() // legacy key cleaned up
  })

  it('legacy migration never overwrites a per-scene key that already has data', async () => {
    const { writeItem, readItem } = await import('../storage/projectStorage.js')
    const { sceneVersionsKey } = await import('./sceneVersions.js')
    writeItem(sceneVersionsKey('scene-1'), JSON.stringify([{ id: 'already-migrated', sceneId: 'scene-1' }]))
    writeItem('nf_scene_versions', JSON.stringify([{ id: 'legacy-1', sceneId: 'scene-1' }]))

    const { getSceneVersions } = await import('./sceneVersions.js')
    expect(getSceneVersions('scene-1').map(v => v.id)).toEqual(['already-migrated'])
    expect(readItem('nf_scene_versions')).toBeNull()
  })

  // Regression coverage for a code-review finding: clearSceneVersions (what
  // deleteScene/deleteNovel actually call) must migrate the legacy blob
  // first, not just remove a per-scene key that may not exist yet — otherwise
  // a scene deleted before this module was touched this session would have
  // its history left behind in the legacy blob, to be wrongly resurrected
  // later when an unrelated scene's access finally triggers migration.
  it('clearSceneVersions migrates the legacy blob first, so a deleted scene\'s history in it is never later resurrected', async () => {
    const { writeItem, readItem } = await import('../storage/projectStorage.js')
    writeItem('nf_scene_versions', JSON.stringify([
      { id: 'v-deleted', sceneId: 'deleted-scene', timestamp: 1 },
      { id: 'v-other', sceneId: 'other-scene', timestamp: 1 },
    ]))

    const { clearSceneVersions, getSceneVersions } = await import('./sceneVersions.js')
    clearSceneVersions('deleted-scene')

    // The legacy blob is gone (folded into per-scene keys) and the deleted
    // scene's own key was cleared in the same call...
    expect(readItem('nf_scene_versions')).toBeNull()
    expect(getSceneVersions('deleted-scene')).toEqual([])
    // ...while an unrelated scene's legacy data survived the migration.
    expect(getSceneVersions('other-scene').map(v => v.id)).toEqual(['v-other'])
  })
})

// Regression coverage for the cross-tab race described in docs/QA_PLAN.md's
// Priority -1 section and fixed 2026-09-24 (see docs/ROADMAP.md's Bugs
// table). Uses the same real-IndexedDB-backend-plus-BroadcastChannel harness
// as useStore.multiTabIndexedDb.test.js, but drives two independent backend
// instances directly (rather than through the single shared
// projectStorage.js `activeBackend` indirection useStore's own multi-tab
// tests rely on) so both "tabs" genuinely write before either has received
// the other's cross-tab broadcast — the exact interleaving the bug needed.
describe('scene version history — cross-tab race regression (real IndexedDB + BroadcastChannel)', () => {
  it('two tabs snapshotting DIFFERENT scenes in the same instant (neither has seen the other\'s broadcast yet) both survive', async () => {
    await import('fake-indexeddb/auto')
    const { initializeIndexedDbStorage } = await import('../storage/browserVaultAdapter.js')
    const { resetStorageBackend, setStorageBackend, readItem } = await import('../storage/projectStorage.js')
    const { saveSceneVersion, sceneVersionsKey } = await import('./sceneVersions.js')

    // "Tab A" boots and hydrates its own mirror.
    const backendA = await initializeIndexedDbStorage()
    expect(backendA).toBeTruthy()

    // "Tab B" opens its own connection/mirror onto the same underlying
    // IndexedDB database and the same named BroadcastChannel — exactly like
    // a second real browser tab. `resetStorageBackend()` first, mirroring
    // the existing multi-tab test file's own setup.
    resetStorageBackend()
    const backendB = await initializeIndexedDbStorage()
    expect(backendB).toBeTruthy()
    expect(backendB).not.toBe(backendA)

    // Both tabs snapshot a DIFFERENT scene back-to-back, with no `await` in
    // between — a BroadcastChannel message is always delivered asynchronously
    // (a later task), so at the instant Tab B writes, it cannot yet have
    // applied Tab A's broadcast. This is exactly what happens in practice
    // when the user switches away from the browser entirely while two
    // different projects are open in two tabs: `visibilitychange` fires in
    // both tabs essentially simultaneously, each tab's crash-safety flush
    // (manuscriptUtils.js's runPersistSceneDraft) calls saveSceneVersion, and
    // under the pre-fix single shared `nf_scene_versions` key, whichever
    // tab's 'set' broadcast was processed last would silently overwrite the
    // other tab's just-added version outright — even though the two tabs
    // never touched the same scene at all.
    setStorageBackend(backendA)
    saveSceneVersion({ id: 'scene-1', novelId: 'novel-1', title: 'Scene One', content: 'Tab A snapshot' })

    setStorageBackend(backendB)
    saveSceneVersion({ id: 'scene-2', novelId: 'novel-2', title: 'Scene Two', content: 'Tab B snapshot' })

    // Let both tabs' broadcasts (and the real, async IndexedDB persistence
    // queued behind them) settle.
    await new Promise(resolve => setTimeout(resolve, 50))
    await backendA.flush?.()
    await backendB.flush?.()

    // Whichever backend is current now, BOTH scenes' version history must be
    // intact — this is the property the old shared-key design could not
    // guarantee once both tabs raced on the exact same broadcast key.
    setStorageBackend(backendA)
    expect(JSON.parse(readItem(sceneVersionsKey('scene-1')))[0].content).toBe('Tab A snapshot')
    expect(JSON.parse(readItem(sceneVersionsKey('scene-2')))[0].content).toBe('Tab B snapshot')

    setStorageBackend(backendB)
    expect(JSON.parse(readItem(sceneVersionsKey('scene-1')))[0].content).toBe('Tab A snapshot')
    expect(JSON.parse(readItem(sceneVersionsKey('scene-2')))[0].content).toBe('Tab B snapshot')
  })
})
