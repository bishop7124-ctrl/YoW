// @vitest-environment jsdom
//
// The regular useStore.test.js suite runs against jsdom's plain localStorage,
// which is synchronously shared across "tabs" (separate renderHook instances)
// for free. In a real browser, every regular (non-desktop) session actually
// uses browserVaultAdapter's IndexedDB-backed backend instead — added for a
// browser-storage-quota fix — which hydrates a per-tab in-memory mirror once
// at startup with no built-in cross-tab sync. That gap was the real root
// cause of a multi-tab silent-overwrite bug reported by QA on 2026-08-02
// (docs/ROADMAP.md's Bugs table): the localStorage-only tests above all
// passed while the live browser bug persisted, because they never exercised
// this backend at all. This file re-runs the same class of scenario against
// the real IndexedDB adapter (via the fake-indexeddb polyfill) to prove the
// cross-tab BroadcastChannel bridge (browserVaultAdapter.js) and useStore's
// commitLocal rebase actually work together end-to-end, the way a real
// browser session does.
import 'fake-indexeddb/auto'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStore } from './useStore.js'

vi.mock('../utils/firestoreSync', () => ({
  upsertItems:        vi.fn().mockResolvedValue({}),
  deleteItem:         vi.fn().mockResolvedValue({}),
  deleteItemsByNovel: vi.fn().mockResolvedValue({}),
  saveUserSettings:   vi.fn().mockResolvedValue({}),
  saveSceneDoc:       vi.fn().mockResolvedValue({}),
  deleteSceneDoc:     vi.fn().mockResolvedValue({}),
  getUserStorageUsage: vi.fn().mockResolvedValue(0),
}))
vi.mock('../utils/projectStats', () => ({ buildProjectStats: vi.fn().mockReturnValue({}) }))
vi.mock('../utils/storageQuota', () => ({ estimateStoreSize: vi.fn().mockReturnValue(0) }))
vi.mock('../utils/uploadUserMedia', () => ({ deleteUserMedia: vi.fn().mockResolvedValue(undefined) }))

afterEach(() => {
  vi.resetModules()
})

describe('multi-tab sync against the real IndexedDB-backed browser adapter', () => {
  it('a second tab (fresh IndexedDB-backed mirror) no longer clobbers a first tab\'s edit to an unrelated record', async () => {
    const { initializeIndexedDbStorage } = await import('../storage/browserVaultAdapter.js')
    const { resetStorageBackend } = await import('../storage/projectStorage.js')

    // Tab A boots first and installs its own IndexedDB-backed mirror.
    await initializeIndexedDbStorage()
    const owner = 'user-indexeddb-multitab'
    const seed = [
      { id: 'char-A', novelId: 'novel-1', name: 'Alice', notes: 'original' },
      { id: 'char-B', novelId: 'novel-1', name: 'Bob', notes: 'original' },
    ]
    const novels = [{ id: 'novel-1', title: 'World', type: 'novel' }]
    const tabA = renderHook(() => useStore(owner, { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })

    // resetStorageBackend + a fresh initializeIndexedDbStorage() call simulates
    // Tab B opening its own tab: its own hydration, its own mirror, wired to
    // the same underlying IndexedDB database and the same BroadcastChannel.
    resetStorageBackend()
    await initializeIndexedDbStorage()
    const tabB = renderHook(() => useStore(owner, { cloudSyncEnabled: false }))
    act(() => { tabB.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })

    act(() => { tabA.result.current.saveCharacter({ name: 'Alice', notes: 'edited by tab A' }, 'char-A') })
    // Let the cross-tab BroadcastChannel message land in Tab B's mirror.
    await new Promise(resolve => setTimeout(resolve, 60))

    act(() => { tabB.result.current.saveCharacter({ name: 'Bob', notes: 'edited by tab B' }, 'char-B') })

    expect(tabB.result.current.characters.find(c => c.id === 'char-A').notes).toBe('edited by tab A')
    expect(tabB.result.current.characters.find(c => c.id === 'char-B').notes).toBe('edited by tab B')
  })

  it('two tabs editing the SAME scene: main scene keeps the latest edit and the other survives as a conflict copy (real IndexedDB backend)', async () => {
    const { initializeIndexedDbStorage } = await import('../storage/browserVaultAdapter.js')
    const { resetStorageBackend } = await import('../storage/projectStorage.js')

    await initializeIndexedDbStorage()
    const tabA = renderHook(() => useStore('user-scene-multitab', { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.addNovel({ title: 'Two Tabs', type: 'novel' }) })
    const sceneId = tabA.result.current.scenes[0].id

    resetStorageBackend()
    await initializeIndexedDbStorage()
    const tabB = renderHook(() => useStore('user-scene-multitab', { cloudSyncEnabled: false }))
    act(() => { tabB.result.current.importData({
      novels: tabA.result.current.novels,
      acts: tabA.result.current.acts,
      chapters: tabA.result.current.chapters,
      scenes: tabA.result.current.scenes,
      _savedAt: 1,
    }) })

    act(() => { tabA.result.current.updateSceneContent(sceneId, 'Tab A newer text') })
    await new Promise(resolve => setTimeout(resolve, 60))

    act(() => { tabB.result.current.updateSceneContent(sceneId, 'Tab B stale text') })

    expect(tabB.result.current.scenes.find(s => s.id === sceneId).content).toBe('Tab B stale text')
    const conflict = tabB.result.current.sceneConflicts.find(s => s.conflictOf === sceneId)
    expect(conflict?.content).toBe('Tab A newer text')
  })

  it('surviving a refresh: after both tabs save and both "refresh" (fresh mounts reading the real IndexedDB), the main scene and the conflict copy are both still there', async () => {
    const { initializeIndexedDbStorage } = await import('../storage/browserVaultAdapter.js')
    const { resetStorageBackend } = await import('../storage/projectStorage.js')
    const owner = 'user-scene-refresh'

    await initializeIndexedDbStorage()
    const tabA = renderHook(() => useStore(owner, { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.addNovel({ title: 'Two Tabs', type: 'novel' }) })
    const sceneId = tabA.result.current.scenes[0].id

    resetStorageBackend()
    await initializeIndexedDbStorage()
    const tabB = renderHook(() => useStore(owner, { cloudSyncEnabled: false }))
    act(() => { tabB.result.current.importData({
      novels: tabA.result.current.novels,
      acts: tabA.result.current.acts,
      chapters: tabA.result.current.chapters,
      scenes: tabA.result.current.scenes,
      _savedAt: 1,
    }) })

    // Tab A edits and "waits for it to save" (no debounce here — updateSceneContent
    // commits synchronously; the 1s delay in the real app is only for the cloud push).
    act(() => { tabA.result.current.updateSceneContent(sceneId, 'Sentinel A text') })
    await new Promise(resolve => setTimeout(resolve, 60))

    // Tab B, without refreshing, edits and waits for its own save.
    act(() => { tabB.result.current.updateSceneContent(sceneId, 'Sentinel B text') })
    await new Promise(resolve => setTimeout(resolve, 60))

    // Both tabs "refresh": fresh store mounts, each with its own fresh
    // IndexedDB-backed mirror hydrated from whatever is actually on disk now.
    resetStorageBackend()
    await initializeIndexedDbStorage()
    const tabARefreshed = renderHook(() => useStore(owner, { cloudSyncEnabled: false }))

    resetStorageBackend()
    await initializeIndexedDbStorage()
    const tabBRefreshed = renderHook(() => useStore(owner, { cloudSyncEnabled: false }))

    for (const tab of [tabARefreshed, tabBRefreshed]) {
      const mainScene = tab.result.current.scenes.find(s => s.id === sceneId)
      expect(mainScene?.content).toBe('Sentinel B text')
      const conflict = tab.result.current.sceneConflicts.find(s => s.conflictOf === sceneId)
      expect(conflict?.content).toBe('Sentinel A text')
    }
  })

  it('a real refresh that re-fetches a STALE cloud snapshot (cloud hasn\'t caught up yet) still keeps both edits, via shouldPreferLocal', async () => {
    // Every previous test in this file uses cloudSyncEnabled: false, so
    // "refresh" only ever re-hydrates from the local IndexedDB mirror. A
    // real browser refresh (App.jsx) also calls loadUserData(userId) and
    // importData(cloudData) — and if the debounced cloud push for either
    // tab's edit hasn't landed yet (real network latency, or the user
    // refreshing quickly), that cloudData can be stale relative to what's
    // already on disk locally. importData's shouldPreferLocal check exists
    // exactly to protect against a stale cloud fetch clobbering a fresher
    // local write on reload — this test exercises that path directly for
    // scenes, which no other test in this file (or useStore.test.js) does.
    const { initializeIndexedDbStorage } = await import('../storage/browserVaultAdapter.js')
    const { resetStorageBackend } = await import('../storage/projectStorage.js')
    const owner = 'user-scene-stale-cloud'

    await initializeIndexedDbStorage()
    const tabA = renderHook(() => useStore(owner, { cloudSyncEnabled: true }))
    act(() => { tabA.result.current.addNovel({ title: 'Two Tabs', type: 'novel' }) })
    const sceneId = tabA.result.current.scenes[0].id
    act(() => { tabA.result.current.finishRemoteLoad(true) })

    resetStorageBackend()
    await initializeIndexedDbStorage()
    const tabB = renderHook(() => useStore(owner, { cloudSyncEnabled: true }))
    act(() => { tabB.result.current.importData({
      novels: tabA.result.current.novels,
      acts: tabA.result.current.acts,
      chapters: tabA.result.current.chapters,
      scenes: tabA.result.current.scenes,
      _savedAt: 1,
    }) })
    act(() => { tabB.result.current.finishRemoteLoad(true) })

    act(() => { tabA.result.current.updateSceneContent(sceneId, 'Sentinel A text') })
    await new Promise(resolve => setTimeout(resolve, 60))
    act(() => { tabB.result.current.updateSceneContent(sceneId, 'Sentinel B text') })
    await new Promise(resolve => setTimeout(resolve, 60))

    // Simulate a real refresh: a fresh mount that re-hydrates locally (already
    // correct, per the other tests) AND calls importData with a STALE cloud
    // payload — the ORIGINAL scene, pre-edit, as if neither tab's debounced
    // cloud push has landed yet.
    resetStorageBackend()
    await initializeIndexedDbStorage()
    const refreshed = renderHook(() => useStore(owner, { cloudSyncEnabled: true }))
    const staleCloudScenes = [{ ...tabA.result.current.scenes[0], id: sceneId }] // original, pre-edit content
    act(() => { refreshed.result.current.importData({
      novels: tabA.result.current.novels,
      acts: tabA.result.current.acts,
      chapters: tabA.result.current.chapters,
      scenes: staleCloudScenes,
      _savedAt: 1,
    }) })

    const mainScene = refreshed.result.current.scenes.find(s => s.id === sceneId)
    expect(mainScene?.content).toBe('Sentinel B text')
    const conflict = refreshed.result.current.sceneConflicts.find(s => s.conflictOf === sceneId)
    expect(conflict?.content).toBe('Sentinel A text')
  })

  it('two tabs editing DIFFERENT scenes: the untouched scene keeps the other tab\'s edit (real IndexedDB backend)', async () => {
    const { initializeIndexedDbStorage } = await import('../storage/browserVaultAdapter.js')
    const { resetStorageBackend } = await import('../storage/projectStorage.js')

    await initializeIndexedDbStorage()
    const tabA = renderHook(() => useStore('user-scene-multitab-2', { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.addNovel({ title: 'Two Tabs', type: 'novel' }) })
    const chapterId = tabA.result.current.chapters[0].id
    const sceneOneId = tabA.result.current.scenes[0].id
    act(() => { tabA.result.current.addScene(chapterId, 'Scene Two') })
    const sceneTwoId = tabA.result.current.scenes.find(s => s.id !== sceneOneId).id

    resetStorageBackend()
    await initializeIndexedDbStorage()
    const tabB = renderHook(() => useStore('user-scene-multitab-2', { cloudSyncEnabled: false }))
    act(() => { tabB.result.current.importData({
      novels: tabA.result.current.novels,
      acts: tabA.result.current.acts,
      chapters: tabA.result.current.chapters,
      scenes: tabA.result.current.scenes,
      _savedAt: 1,
    }) })

    act(() => { tabA.result.current.updateSceneContent(sceneOneId, 'Scene one edited by tab A') })
    await new Promise(resolve => setTimeout(resolve, 60))

    act(() => { tabB.result.current.updateSceneContent(sceneTwoId, 'Scene two edited by tab B') })

    expect(tabB.result.current.scenes.find(s => s.id === sceneOneId).content).toBe('Scene one edited by tab A')
    expect(tabB.result.current.scenes.find(s => s.id === sceneTwoId).content).toBe('Scene two edited by tab B')
  })

  it('two tabs editing DIFFERENT FIELDS on the SAME scene (content vs. status) both survive (real IndexedDB backend)', async () => {
    const { initializeIndexedDbStorage } = await import('../storage/browserVaultAdapter.js')
    const { resetStorageBackend } = await import('../storage/projectStorage.js')

    await initializeIndexedDbStorage()
    const tabA = renderHook(() => useStore('user-scene-fields', { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.addNovel({ title: 'Two Tabs', type: 'novel' }) })
    const sceneId = tabA.result.current.scenes[0].id

    resetStorageBackend()
    await initializeIndexedDbStorage()
    const tabB = renderHook(() => useStore('user-scene-fields', { cloudSyncEnabled: false }))
    act(() => { tabB.result.current.importData({
      novels: tabA.result.current.novels,
      acts: tabA.result.current.acts,
      chapters: tabA.result.current.chapters,
      scenes: tabA.result.current.scenes,
      _savedAt: 1,
    }) })

    // Tab A only changes content (mirrors the manuscript editor's debounced
    // per-keystroke updateSceneContent call).
    act(() => { tabA.result.current.updateSceneContent(sceneId, 'Content edited by tab A') })
    await new Promise(resolve => setTimeout(resolve, 60))

    // Tab B, unaware of Tab A's edit, only changes status (mirrors
    // SceneMetaBar's onUpdate({ status }) call via updateScene).
    act(() => { tabB.result.current.updateScene(sceneId, { status: 'editing' }) })

    const stored = tabB.result.current.scenes.find(s => s.id === sceneId)
    expect(stored.content).toBe('Content edited by tab A')
    expect(stored.status).toBe('editing')
    expect(tabB.result.current.sceneConflicts).toHaveLength(0)
  })
})
