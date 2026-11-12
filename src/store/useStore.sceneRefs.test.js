// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStore } from './useStore.js'
import { resetStorageBackend } from '../storage/projectStorage.js'

vi.mock('../utils/firestoreSync', () => ({
  upsertItems: vi.fn().mockResolvedValue({}),
  mergeItems: vi.fn().mockResolvedValue({ results: [], fallback: false }),
  deleteItem: vi.fn().mockResolvedValue({}),
  saveUserSettings: vi.fn().mockResolvedValue({}),
  saveSceneDoc: vi.fn().mockResolvedValue({}),
  deleteSceneDoc: vi.fn().mockResolvedValue({}),
  deleteProjectData: vi.fn().mockResolvedValue({}),
  replaceUserData: vi.fn().mockResolvedValue({}),
  getUserStorageUsage: vi.fn().mockResolvedValue(0),
  fetchPlotThreads: vi.fn().mockResolvedValue({ ok: true, threads: [] }),
}))
vi.mock('../utils/cloudSceneVersions', () => ({ markCloudScenesDeleted: vi.fn(), markCloudNovelDeleted: vi.fn() }))
vi.mock('../utils/projectStats', () => ({ buildProjectStats: vi.fn().mockReturnValue({}) }))
vi.mock('../utils/storageQuota', () => ({ estimateStoreSize: vi.fn().mockReturnValue(0) }))

beforeEach(() => { resetStorageBackend(); localStorage.clear() })

// A project with one scene already linked to a lore entry, a faction and a history entry.
function setup() {
  const hook = renderHook(() => useStore(null))
  let novel, lore, faction, history, scene
  act(() => { novel = hook.result.current.addNovel({ title: 'World', type: 'novel' }) })
  act(() => { lore = hook.result.current.addLoreEntry({ title: 'The Long Winter' }) })
  act(() => { faction = hook.result.current.saveFaction({ name: 'The Wardens' }) })
  act(() => { history = hook.result.current.addHistoryEntry({ title: 'Founding', startYear: 1 }) })
  act(() => { const a = hook.result.current.addAct('Act'); const c = hook.result.current.addChapter(a.id, 'Ch'); scene = hook.result.current.addScene(c.id, 'Pass') })
  act(() => { hook.result.current.updateScene(scene.id, { loreIds: [lore.id], factionIds: [faction.id], historyEntryIds: [history.id] }) })
  return { hook, novel, lore, faction, history, scene }
}
const sceneOf = (hook, id) => hook.result.current.scenes.find(s => s.id === id)

describe('scene links to lore, factions and history entries', () => {
  it('keeps the links on the scene', () => {
    const { hook, scene, lore, faction, history } = setup()
    expect(sceneOf(hook, scene.id)).toMatchObject({ loreIds: [lore.id], factionIds: [faction.id], historyEntryIds: [history.id] })
  })

  it('removes each link from the scene when its record is deleted, and leaves the others', () => {
    const { hook, scene, lore, faction, history } = setup()
    act(() => { hook.result.current.deleteLoreEntry(lore.id) })
    expect(sceneOf(hook, scene.id)).toMatchObject({ loreIds: [], factionIds: [faction.id], historyEntryIds: [history.id] })
    act(() => { hook.result.current.deleteFaction(faction.id) })
    expect(sceneOf(hook, scene.id)).toMatchObject({ factionIds: [], historyEntryIds: [history.id] })
    act(() => { hook.result.current.deleteHistoryEntry(history.id) })
    expect(sceneOf(hook, scene.id).historyEntryIds).toEqual([])
  })

  it('re-points the links at the copied records when a project is exported and imported', () => {
    const { hook, novel, lore, faction, history } = setup()
    const exported = hook.result.current.getProjectExportData(novel.id)
    act(() => { hook.result.current.importProjectFromData(JSON.parse(JSON.stringify(exported))) })
    const all = hook.result.current.scenes
    const copy = all.find(s => s.title === 'Pass' && s.novelId !== novel.id)
    expect(copy.loreIds).toHaveLength(1)
    expect(copy.loreIds[0]).not.toBe(lore.id)
    expect(copy.factionIds[0]).not.toBe(faction.id)
    expect(copy.historyEntryIds[0]).not.toBe(history.id)
    const copiedLore = hook.result.current.loreEntries.find(e => e.id === copy.loreIds[0])
    expect(copiedLore).toMatchObject({ title: 'The Long Winter', novelId: copy.novelId })
    expect(hook.result.current.factions.find(f => f.id === copy.factionIds[0])).toMatchObject({ name: 'The Wardens', novelId: copy.novelId })
    expect(hook.result.current.worldHistory.find(h => h.id === copy.historyEntryIds[0])).toMatchObject({ title: 'Founding', novelId: copy.novelId })
  })
})
