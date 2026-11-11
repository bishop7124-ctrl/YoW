// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStore } from './useStore.js'
import { upsertItems, fetchPlotThreads, deleteItem } from '../utils/firestoreSync.js'
import { resetStorageBackend } from '../storage/projectStorage.js'

vi.mock('../utils/firestoreSync', () => {
  const upsertItems = vi.fn().mockResolvedValue({})
  return {
    upsertItems,
    mergeItems: vi.fn(async (table, ownerId, items) => { await upsertItems(table, ownerId, items); return { results: [], fallback: false } }),
    deleteItem: vi.fn().mockResolvedValue({}),
    saveUserSettings: vi.fn().mockResolvedValue({}),
    saveSceneDoc: vi.fn().mockResolvedValue({}),
    deleteSceneDoc: vi.fn().mockResolvedValue({}),
    deleteProjectData: vi.fn().mockResolvedValue({}),
    replaceUserData: vi.fn().mockResolvedValue({}),
    getUserStorageUsage: vi.fn().mockResolvedValue(0),
    fetchPlotThreads: vi.fn().mockResolvedValue({ ok: true, threads: [] }),
  }
})
vi.mock('../utils/cloudSceneVersions', () => ({ markCloudScenesDeleted: vi.fn(), markCloudNovelDeleted: vi.fn() }))
vi.mock('../utils/projectStats', () => ({ buildProjectStats: vi.fn().mockReturnValue({}) }))
vi.mock('../utils/storageQuota', () => ({ estimateStoreSize: vi.fn().mockReturnValue(0) }))

beforeEach(() => {
  resetStorageBackend()
  localStorage.clear()
  vi.mocked(upsertItems).mockClear()
  vi.mocked(deleteItem).mockClear()
  vi.mocked(fetchPlotThreads).mockReset()
  vi.mocked(fetchPlotThreads).mockResolvedValue({ ok: true, threads: [] })
})

const project = (hook, title = 'World') => {
  let novel
  act(() => { novel = hook.result.current.addNovel({ title, type: 'novel' }) })
  return novel
}

describe('plot threads in the store', () => {
  it('adds, edits and lists threads for the active project only, and persists them', () => {
    const hook = renderHook(() => useStore(null))
    const a = project(hook, 'A')
    let thread
    act(() => { thread = hook.result.current.addPlotThread({ name: ' Main plot ', kind: 'main', status: 'resolved', id: 'evil', novelId: 'evil' }) })
    expect(thread).toMatchObject({ name: 'Main plot', kind: 'main', status: 'resolved', novelId: a.id })
    expect(thread.id).not.toBe('evil')
    act(() => { hook.result.current.updatePlotThread(thread.id, { name: 'Renamed', novelId: 'evil' }) })
    expect(hook.result.current.plotThreads).toHaveLength(1)
    expect(hook.result.current.plotThreads[0]).toMatchObject({ name: 'Renamed', novelId: a.id })
    expect(JSON.parse(localStorage.getItem('nf_plotThreads'))).toHaveLength(1)

    const b = project(hook, 'B')
    act(() => { hook.result.current.setActiveNovelId(b.id) })
    expect(hook.result.current.plotThreads).toEqual([]) // threads of project A are not shown in B
    expect(hook.result.current.updatePlotThread(thread.id, { name: 'Hijack' })).toBeNull()
    expect(JSON.parse(localStorage.getItem('nf_plotThreads'))[0].name).toBe('Renamed')
  })

  it('deleting a thread removes it from every scene\'s links and leaves other links alone', () => {
    const hook = renderHook(() => useStore(null))
    project(hook)
    let t1, t2, chapter, s1, s2
    act(() => { t1 = hook.result.current.addPlotThread({ name: 'One' }); t2 = hook.result.current.addPlotThread({ name: 'Two' }) })
    act(() => { const act1 = hook.result.current.addAct('Act'); chapter = hook.result.current.addChapter(act1.id, 'Ch') })
    act(() => { s1 = hook.result.current.addScene(chapter.id, 'S1'); s2 = hook.result.current.addScene(chapter.id, 'S2') })
    act(() => {
      hook.result.current.updateScene(s1.id, { threadLinks: [{ threadId: t1.id, role: 'setup' }, { threadId: t2.id, role: 'payoff' }] })
      hook.result.current.updateScene(s2.id, { threadLinks: [{ threadId: t2.id, role: 'mention' }] })
    })
    act(() => { expect(hook.result.current.deletePlotThread(t1.id)).toBe(true) })
    const scenes = hook.result.current.scenes
    expect(scenes.find(s => s.id === s1.id).threadLinks).toEqual([{ threadId: t2.id, role: 'payoff' }])
    expect(scenes.find(s => s.id === s2.id).threadLinks).toEqual([{ threadId: t2.id, role: 'mention' }])
    expect(hook.result.current.plotThreads.map(t => t.id)).toEqual([t2.id])
    expect(hook.result.current.deletePlotThread('missing')).toBe(false)
  })

  it('exports a project\'s threads and re-imports them with new ids, remapping scene links', () => {
    const hook = renderHook(() => useStore(null))
    const source = project(hook)
    let thread, chapter, scene
    act(() => { thread = hook.result.current.addPlotThread({ name: 'Romance', kind: 'romance' }) })
    act(() => { const a = hook.result.current.addAct('Act'); chapter = hook.result.current.addChapter(a.id, 'Ch') })
    act(() => { scene = hook.result.current.addScene(chapter.id, 'Kiss') })
    act(() => { hook.result.current.updateScene(scene.id, { threadLinks: [{ threadId: thread.id, role: 'payoff' }] }) })
    const exported = hook.result.current.getProjectExportData(source.id)
    expect(exported.plotThreads).toHaveLength(1)

    act(() => { hook.result.current.importProjectFromData(JSON.parse(JSON.stringify(exported))) })
    const all = JSON.parse(localStorage.getItem('nf_plotThreads'))
    expect(all).toHaveLength(2)
    const copy = all.find(t => t.id !== thread.id)
    expect(copy).toMatchObject({ name: 'Romance', kind: 'romance' })
    expect(copy.novelId).not.toBe(source.id)
    const copiedScene = JSON.parse(localStorage.getItem('nf_scenes')).find(s => s.novelId === copy.novelId && s.title === 'Kiss')
    expect(copiedScene.threadLinks).toEqual([{ threadId: copy.id, role: 'payoff' }])
  })

  it('an export from before threads existed still imports, and leaves threads empty', () => {
    const hook = renderHook(() => useStore(null))
    const source = project(hook)
    const exported = hook.result.current.getProjectExportData(source.id)
    delete exported.plotThreads
    act(() => { hook.result.current.importProjectFromData(JSON.parse(JSON.stringify(exported))) })
    expect(hook.result.current.novels).toHaveLength(2)
    expect(JSON.parse(localStorage.getItem('nf_plotThreads') || '[]')).toEqual([])
  })

  it('deleting a project removes its threads', async () => {
    const hook = renderHook(() => useStore(null))
    const a = project(hook, 'A')
    act(() => { hook.result.current.addPlotThread({ name: 'Gone' }) })
    const b = project(hook, 'B')
    act(() => { hook.result.current.setActiveNovelId(b.id) })
    act(() => { hook.result.current.addPlotThread({ name: 'Stays' }) })
    await act(async () => { await hook.result.current.deleteNovel(a.id) })
    expect(JSON.parse(localStorage.getItem('nf_plotThreads')).map(t => t.name)).toEqual(['Stays'])
  })
})

describe('plot threads and the cloud', () => {
  const settle = async (ms = 2600) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
  const pushedThreads = () => upsertItems.mock.calls.some(call => call[0] === 'plot_threads')
  const withCloud = (flag = true) => {
    const hook = renderHook(() => useStore('user-1', { cloudSyncEnabled: true, plotThreadsEnabled: flag }))
    return hook
  }
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('never touches the cloud while the flag is off', async () => {
    const hook = withCloud(false)
    act(() => { hook.result.current.finishRemoteLoad(true) })
    project(hook)
    act(() => { hook.result.current.addPlotThread({ name: 'Local only' }) })
    await settle()
    expect(pushedThreads()).toBe(false)
    expect(fetchPlotThreads).not.toHaveBeenCalled()
    expect(await hook.result.current.loadPlotThreadsFromCloud()).toEqual({ ok: false, reason: 'off' })
  })

  it('does not read the cloud until the main account load has finished', async () => {
    const hook = withCloud()
    await settle(50)
    expect(fetchPlotThreads).not.toHaveBeenCalled()
    act(() => { hook.result.current.finishRemoteLoad(true) })
    await settle(50)
    expect(fetchPlotThreads).toHaveBeenCalledTimes(1)
  })

  it('starts the thread read when a normal account load (importData) finishes, without finishRemoteLoad', async () => {
    const hook = withCloud()
    await settle(50)
    expect(fetchPlotThreads).not.toHaveBeenCalled()
    act(() => { hook.result.current.importData({ novels: [], characters: [] }) })
    await settle(700)
    expect(fetchPlotThreads).toHaveBeenCalledTimes(1)
  })

  it('pushes threads to the plot_threads table once the first read has succeeded', async () => {
    const hook = withCloud()
    act(() => { hook.result.current.finishRemoteLoad(true) })
    await settle(50)
    project(hook)
    act(() => { hook.result.current.addPlotThread({ name: 'Synced' }) })
    await settle()
    expect(upsertItems).toHaveBeenCalledWith('plot_threads', 'user-1', [expect.objectContaining({ name: 'Synced' })])
  })

  it('never pushes when the first cloud read fails (an older local copy must not overwrite a newer cloud one)', async () => {
    vi.mocked(fetchPlotThreads).mockResolvedValue({ ok: false, threads: [], reason: 'timeout' })
    const hook = withCloud()
    act(() => { hook.result.current.finishRemoteLoad(true) })
    await settle(50)
    project(hook)
    act(() => { hook.result.current.addPlotThread({ name: 'Stale?' }) })
    await settle()
    expect(pushedThreads()).toBe(false)
    expect(hook.result.current.plotThreads.map(t => t.name)).toEqual(['Stale?']) // still there locally
  })

  it('merges cloud threads in, keeping local-only ones and the newer copy of a shared one', async () => {
    const hook = withCloud()
    act(() => { hook.result.current.finishRemoteLoad(true) })
    await settle(50)
    const novel = project(hook)
    let local
    act(() => { local = hook.result.current.addPlotThread({ name: 'Local old' }) })
    vi.mocked(fetchPlotThreads).mockResolvedValueOnce({ ok: true, threads: [
      { id: local.id, novelId: novel.id, name: 'Cloud newer', updatedAt: local.updatedAt + 1000 },
      { id: 'remote-only', novelId: novel.id, name: 'From laptop', updatedAt: 5 },
    ] })
    let outcome
    await act(async () => { outcome = await hook.result.current.loadPlotThreadsFromCloud() })
    expect(outcome).toEqual({ ok: true, count: 2 })
    const names = Object.fromEntries(hook.result.current.plotThreads.map(t => [t.id, t.name]))
    expect(names).toEqual({ [local.id]: 'Cloud newer', 'remote-only': 'From laptop' })
  })

  it('ignores cloud threads whose project this device does not have', async () => {
    const hook = withCloud()
    act(() => { hook.result.current.finishRemoteLoad(true) })
    await settle(50)
    const novel = project(hook)
    vi.mocked(fetchPlotThreads).mockResolvedValueOnce({ ok: true, threads: [
      { id: 'mine', novelId: novel.id, name: 'Kept', updatedAt: 1 },
      { id: 'orphan', novelId: 'deleted-project', name: 'Orphan', updatedAt: 1 },
    ] })
    await act(async () => { await hook.result.current.loadPlotThreadsFromCloud() })
    expect(JSON.parse(localStorage.getItem('nf_plotThreads')).map(t => t.id)).toEqual(['mine'])
  })

  it('leaves local threads untouched when the cloud read fails (for example the table does not exist yet)', async () => {
    const hook = withCloud()
    act(() => { hook.result.current.finishRemoteLoad(true) })
    await settle(50)
    project(hook)
    act(() => { hook.result.current.addPlotThread({ name: 'Mine' }) })
    vi.mocked(fetchPlotThreads).mockResolvedValueOnce({ ok: false, threads: [], reason: '42P01' })
    let outcome
    await act(async () => { outcome = await hook.result.current.loadPlotThreadsFromCloud() })
    expect(outcome).toEqual({ ok: false, reason: '42P01' })
    expect(hook.result.current.plotThreads.map(t => t.name)).toEqual(['Mine'])
  })

  it('does not bring back a thread this device already deleted but could not yet delete in the cloud', async () => {
    const hook = withCloud()
    act(() => { hook.result.current.finishRemoteLoad(true) })
    await settle(50)
    const novel = project(hook)
    let t
    vi.mocked(deleteItem).mockRejectedValue(new Error('offline'))
    act(() => { t = hook.result.current.addPlotThread({ name: 'Doomed' }) })
    act(() => { hook.result.current.deletePlotThread(t.id) })
    vi.mocked(fetchPlotThreads).mockResolvedValueOnce({ ok: true, threads: [{ id: t.id, novelId: novel.id, name: 'Doomed', updatedAt: 1 }] })
    await act(async () => { await hook.result.current.loadPlotThreadsFromCloud() })
    expect(hook.result.current.plotThreads).toEqual([])
    vi.mocked(deleteItem).mockResolvedValue({})
  })
})
