// @vitest-environment jsdom
// Cloud-boundary fault injection for conflict preservation and project deletion.
import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { useStore } from './useStore.js'
import { saveSceneDoc, mergeItems, deleteProjectData } from '../utils/firestoreSync.js'
import { resetStorageBackend, createMemoryBackend, setStorageBackend } from '../storage/projectStorage.js'

vi.mock('../utils/firestoreSync', () => ({
  upsertItems: vi.fn().mockResolvedValue({}),
  mergeItems: vi.fn().mockResolvedValue({ results: [], fallback: false }),
  deleteItem: vi.fn().mockResolvedValue({}),
  saveUserSettings: vi.fn().mockResolvedValue({}),
  saveSceneDoc: vi.fn().mockResolvedValue({ saved: true, revision: 1 }),
  deleteSceneDoc: vi.fn().mockResolvedValue({}),
  deleteProjectData: vi.fn().mockResolvedValue({}),
  replaceUserData: vi.fn().mockResolvedValue({}),
  getUserStorageUsage: vi.fn().mockResolvedValue(0),
}))
vi.mock('../utils/projectStats', () => ({ buildProjectStats: vi.fn().mockReturnValue({}) }))
vi.mock('../utils/storageQuota', () => ({ estimateStoreSize: vi.fn().mockReturnValue(0) }))
beforeEach(() => {
  resetStorageBackend()
  localStorage.clear()
  vi.clearAllMocks()
  saveSceneDoc.mockReset().mockResolvedValue({ saved: true, revision: 1 })
  mergeItems.mockReset().mockResolvedValue({ results: [], fallback: false })
  deleteProjectData.mockReset().mockResolvedValue({})
})
afterEach(() => { cleanup() })

const project = { id: 'n', title: 'Book', type: 'novel' }
const initialScene = { id: 's', novelId: 'n', title: 'Scene', content: 'Initial text' }
function deferred() {
  let resolve, reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
function mountAccount(extra = {}) {
  const hook = renderHook(() => useStore('audit-owner'))
  act(() => hook.result.current.importData({ novels: [project], activeNovelId: 'n', scenes: [initialScene], _sceneRevisions: { s: 1 }, ...extra }, { preferLocal: false }))
  act(() => hook.result.current.finishRemoteLoad(true))
  return hook
}

it('keeps the cloud original when a conflict-copy upload fails, then retries only the copy (AUD-01)', async () => {
  let remote = { ...initialScene, content: 'Other device newer text' }
  let revision = 2
  const copies = new Map()
  let copyAttempts = 0
  const originalRevisions = []
  saveSceneDoc.mockImplementation(async (_owner, scene, options) => {
    if (scene.conflictOf) {
      copyAttempts++
      if (copyAttempts === 1) throw new Error('Injected conflict-copy network failure')
      copies.set(scene.id, { ...scene })
      return { saved: true, revision: 1 }
    }
    originalRevisions.push(options.expectedRevision)
    if (options.expectedRevision !== revision) return { saved: false, reason: 'stale', revision, remoteScene: remote }
    remote = { ...scene }; revision++
    return { saved: true, revision, remoteScene: remote }
  })
  const hook = mountAccount()
  act(() => hook.result.current.updateSceneContent('s', 'This device attempted text'))
  await act(async () => { await hook.result.current.flushPendingSync() })
  await waitFor(() => expect(copyAttempts).toBe(2), { timeout: 5000 })
  expect(originalRevisions).toEqual([1])
  expect(remote.content).toBe('Other device newer text')
  expect([...copies.values()].map(s => s.content)).toEqual(['This device attempted text'])
  expect(hook.result.current.scenes.find(s => s.id === 's').content).toBe(remote.content)
  await waitFor(() => expect(hook.result.current.syncStatus.state).toBe('synced'))
  hook.unmount()
}, 10000)

it('preserves typing that arrives while a rejected scene request is in flight (AUD-01)', async () => {
  const guardedSave = deferred()
  const remote = { ...initialScene, content: 'Other device newer text' }
  const copies = []
  saveSceneDoc.mockImplementation(async (_owner, scene) => {
    if (!scene.conflictOf) return guardedSave.promise
    copies.push(scene)
    return { saved: true, revision: 1 }
  })
  const hook = mountAccount()
  act(() => hook.result.current.updateSceneContent('s', 'First local edit'))
  let flushing
  await act(async () => { flushing = hook.result.current.flushPendingSync(); await Promise.resolve() })
  expect(saveSceneDoc).toHaveBeenCalledTimes(1)
  act(() => hook.result.current.updateSceneContent('s', 'Newest typing during the request'))
  await act(async () => {
    guardedSave.resolve({ saved: false, reason: 'stale', revision: 2, remoteScene: remote })
    await flushing
    await hook.result.current.flushPendingSync()
  })
  expect(saveSceneDoc.mock.calls.filter(([, scene]) => scene.id === 's')).toHaveLength(1)
  expect(copies.map(scene => scene.content)).toEqual(['Newest typing during the request'])
  expect(hook.result.current.scenes.find(scene => scene.id === 's').content).toBe(remote.content)
  expect(hook.result.current.sceneConflicts.find(scene => scene.conflictOf === 's').content).toBe('Newest typing during the request')
}, 10000)

it('retires queued pre-conflict edits while allowing a new edit based on the remote scene (AUD-01)', async () => {
  const guardedSave = deferred()
  const copySave = deferred()
  let remote = { ...initialScene, content: 'Other device newer text' }
  const originalWrites = []
  let preservedCopy
  saveSceneDoc.mockImplementation(async (_owner, scene, options) => {
    if (scene.conflictOf) {
      preservedCopy = scene
      return copySave.promise
    }
    originalWrites.push({ content: scene.content, revision: options?.expectedRevision })
    if (originalWrites.length === 1) return guardedSave.promise
    remote = { ...scene }
    return { saved: true, revision: 3 }
  })
  const hook = mountAccount()
  act(() => hook.result.current.updateSceneContent('s', 'First local edit'))
  let firstFlush, queuedFlush, newFlush
  await act(async () => { firstFlush = hook.result.current.flushPendingSync(); await Promise.resolve() })
  act(() => hook.result.current.updateSceneContent('s', 'Queued local edit before conflict'))
  await act(async () => { queuedFlush = hook.result.current.flushPendingSync(); await Promise.resolve() })
  await act(async () => {
    guardedSave.resolve({ saved: false, reason: 'stale', revision: 2, remoteScene: remote })
    await Promise.resolve()
  })
  await waitFor(() => expect(preservedCopy).toBeDefined())
  // Hold the conflict-copy acknowledgement so the earlier original-ID save is still queued.
  // A new intentional edit must not accidentally make that obsolete queued request valid again.
  act(() => hook.result.current.updateSceneContent('s', 'Other device newer text, deliberately revised'))
  await act(async () => { newFlush = hook.result.current.flushPendingSync(); await Promise.resolve() })
  await act(async () => {
    copySave.resolve({ saved: true, revision: 1 })
    await Promise.all([firstFlush, queuedFlush, newFlush])
  })
  expect(preservedCopy.content).toBe('Queued local edit before conflict')
  expect(originalWrites).toEqual([
    { content: 'First local edit', revision: 1 },
    { content: 'Other device newer text, deliberately revised', revision: 2 },
  ])
  expect(remote.content).toBe('Other device newer text, deliberately revised')
  expect(hook.result.current.sceneConflicts.find(scene => scene.conflictOf === 's').content).toBe('Queued local edit before conflict')
}, 10000)

it('waits for an in-flight scene save before deleting the project (AUD-02)', async () => {
  let cloudScene = initialScene
  let releaseGuardedSave
  saveSceneDoc.mockImplementation(async (_owner, scene, options) => {
    if (options) return new Promise(resolve => { releaseGuardedSave = () => { cloudScene = scene; resolve({ saved: true, revision: 2 }) } })
    cloudScene = { ...scene }
    return { saved: true, revision: null }
  })
  deleteProjectData.mockImplementation(async () => { cloudScene = null })
  const hook = mountAccount()
  act(() => hook.result.current.updateSceneContent('s', 'Final edit before delete'))
  let flushing
  await act(async () => { flushing = hook.result.current.flushPendingSync(); await Promise.resolve() })
  let deletion
  await act(async () => { deletion = hook.result.current.deleteNovel('n'); await Promise.resolve() })
  expect(deleteProjectData).not.toHaveBeenCalled()
  await act(async () => { releaseGuardedSave(); await flushing; await deletion })
  expect(deleteProjectData).toHaveBeenCalledTimes(1)
  expect(cloudScene).toBeNull()
  expect(hook.result.current.novels).toEqual([])
  expect(hook.result.current.scenes).toEqual([])
  hook.unmount()
}, 10000)

it('does not recreate a missing scene after project deletion has begun (AUD-02)', async () => {
  const guardedSave = deferred()
  let cloudScene = initialScene
  saveSceneDoc.mockImplementation(async (_owner, scene, options) => {
    if (options) return guardedSave.promise
    cloudScene = { ...scene }
    return { saved: true, revision: 1 }
  })
  deleteProjectData.mockImplementation(async () => { cloudScene = null })
  const hook = mountAccount()
  act(() => hook.result.current.updateSceneContent('s', 'Pending edit'))
  let flushing, deletion
  await act(async () => { flushing = hook.result.current.flushPendingSync(); await Promise.resolve() })
  await act(async () => { deletion = hook.result.current.deleteNovel('n'); await Promise.resolve() })
  await act(async () => {
    guardedSave.resolve({ saved: false, reason: 'missing', revision: null, remoteScene: null })
    await Promise.all([flushing, deletion])
  })
  expect(saveSceneDoc).toHaveBeenCalledTimes(1)
  expect(saveSceneDoc.mock.calls[0][2]).toEqual({ expectedRevision: 1 })
  expect(deleteProjectData).toHaveBeenCalledTimes(1)
  expect(cloudScene).toBeNull()
  expect(hook.result.current.scenes).toEqual([])
}, 10000)

it('re-arms scene and entity edits suppressed while a project deletion fails (AUD-02)', async () => {
  const cloudDelete = deferred()
  deleteProjectData.mockReturnValue(cloudDelete.promise)
  const hook = mountAccount({ characters: [{ id: 'c', novelId: 'n', name: 'Initial name' }] })
  let deletion, blockedFlush
  await act(async () => {
    deletion = hook.result.current.deleteNovel('n').catch(error => error)
    await Promise.resolve()
  })
  act(() => {
    hook.result.current.updateSceneContent('s', 'Edit retained after failed delete')
    hook.result.current.saveCharacter({ name: 'Name retained after failed delete' }, 'c')
  })
  await act(async () => { blockedFlush = hook.result.current.flushPendingSync(); await Promise.resolve() })
  const writesBeforeFailure = { scenes: saveSceneDoc.mock.calls.length, entities: mergeItems.mock.calls.length }
  const failure = new Error('Injected cloud project delete failure')
  await act(async () => {
    cloudDelete.reject(failure)
    expect(await deletion).toBe(failure)
    await blockedFlush
    await hook.result.current.flushPendingSync()
  })
  expect(writesBeforeFailure).toEqual({ scenes: 0, entities: 0 })
  expect(hook.result.current.novels.map(novel => novel.id)).toEqual(['n'])
  expect(hook.result.current.scenes.find(scene => scene.id === 's').content).toBe('Edit retained after failed delete')
  expect(saveSceneDoc.mock.calls.map(([, scene]) => scene.content)).toEqual(['Edit retained after failed delete'])
  expect(mergeItems.mock.calls.flatMap(([table, , items]) => table === 'characters' ? items : []).map(item => item.name))
    .toEqual(['Name retained after failed delete'])
  deleteProjectData.mockResolvedValueOnce({})
  await act(async () => { await hook.result.current.deleteNovel('n') })
  expect(hook.result.current.novels).toEqual([])
}, 10000)

it('allows another project to save while deletion is pending and retains those edits locally (AUD-02)', async () => {
  const cloudDelete = deferred()
  deleteProjectData.mockReturnValue(cloudDelete.promise)
  const otherScene = { id: 'other-scene', novelId: 'other', title: 'Other scene', content: 'Initial other text' }
  const hook = mountAccount({
    novels: [project, { id: 'other', title: 'Other project', type: 'novel' }],
    scenes: [initialScene, otherScene],
    characters: [{ id: 'other-character', novelId: 'other', name: 'Initial other name' }],
    _sceneRevisions: { s: 1, 'other-scene': 1 },
  })
  let deletion, flushing
  await act(async () => { deletion = hook.result.current.deleteNovel('n'); await Promise.resolve() })
  act(() => hook.result.current.setActiveNovelId('other'))
  act(() => {
    hook.result.current.updateSceneContent('other-scene', 'Other project concurrent edit')
    hook.result.current.saveCharacter({ name: 'Other project concurrent name' }, 'other-character')
  })
  await act(async () => { flushing = hook.result.current.flushPendingSync(); await Promise.resolve() })
  await waitFor(() => expect(saveSceneDoc).toHaveBeenCalledWith('audit-owner', expect.objectContaining({
    id: 'other-scene', content: 'Other project concurrent edit',
  }), { expectedRevision: 1 }))
  expect(mergeItems.mock.calls.flatMap(([table, , items]) => table === 'characters' ? items : []).map(item => item.name))
    .toEqual(['Other project concurrent name'])
  await act(async () => { cloudDelete.resolve({}); await Promise.all([deletion, flushing]) })
  expect(hook.result.current.novels.map(novel => novel.id)).toEqual(['other'])
  const retained = hook.result.current.getProjectExportData('other')
  expect(retained.scenes.map(scene => scene.content)).toEqual(['Other project concurrent edit'])
  expect(retained.characters.map(character => character.name)).toEqual(['Other project concurrent name'])
  expect(saveSceneDoc.mock.calls.every(([, scene]) => scene.novelId === 'other')).toBe(true)
}, 10000)

it('preserves another project edit made while the local deletion commit is pending (AUD-02)', async () => {
  const backend = createMemoryBackend()
  const commit = backend.replaceItems
  const localCommit = deferred()
  backend.replaceItems = vi.fn(async (entries, removed) => {
    await localCommit.promise
    commit(entries, removed)
  })
  setStorageBackend(backend)
  const hook = mountAccount({
    novels: [project, { id: 'other', title: 'Other project', type: 'novel' }],
    scenes: [initialScene, { id: 'other-scene', novelId: 'other', title: 'Other scene', content: 'Initial other text' }],
    _sceneRevisions: { s: 1, 'other-scene': 1 },
  })
  let deletion
  await act(async () => { deletion = hook.result.current.deleteNovel('n'); await Promise.resolve() })
  await waitFor(() => expect(backend.replaceItems).toHaveBeenCalledTimes(1))
  act(() => hook.result.current.setActiveNovelId('other'))
  act(() => hook.result.current.updateSceneContent('other-scene', 'Typing during local commit'))
  await act(async () => {
    localCommit.resolve()
    await deletion
    await hook.result.current.flushPendingSync()
  })
  expect(hook.result.current.getProjectExportData('other').scenes[0].content).toBe('Typing during local commit')
  expect(backend.getItem('nf_scene_content:other-scene')).toBe('Typing during local commit')
}, 10000)

it('allows edits after an explicit restore recreates a previously deleted project ID (AUD-02)', async () => {
  const hook = mountAccount()
  await act(async () => { await hook.result.current.deleteNovel('n') })
  await act(async () => {
    await hook.result.current.replaceData({
      novels: [project], activeNovelId: 'n', scenes: [initialScene], _sceneRevisions: { s: 1 },
    })
  })
  act(() => hook.result.current.finishRemoteLoad(true))
  act(() => hook.result.current.updateSceneContent('s', 'Edit after deliberate restore'))
  await act(async () => { await hook.result.current.flushPendingSync() })
  expect(saveSceneDoc).toHaveBeenCalledWith('audit-owner', expect.objectContaining({
    id: 's', content: 'Edit after deliberate restore',
  }), { expectedRevision: 1 })
}, 10000)

it('a restore retires saves queued before it, so old records cannot be written back afterwards (AUD-23)', async () => {
  const hook = mountAccount()
  // Edits made just before the restore: a scene, and a project record, each waiting in a save queue.
  act(() => hook.result.current.updateSceneContent('s', 'Edit queued before the restore'))
  act(() => hook.result.current.updateNovel('n', { title: 'Title queued before the restore' }))
  saveSceneDoc.mockClear()
  mergeItems.mockClear()
  await act(async () => {
    await hook.result.current.replaceData({
      novels: [{ ...project, title: 'Chosen backup' }], activeNovelId: 'n',
      scenes: [{ ...initialScene, content: 'Backup text' }], _sceneRevisions: { s: 1 },
    })
  })
  act(() => hook.result.current.finishRemoteLoad(true))
  await act(async () => { await hook.result.current.flushPendingSync() })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 2600)) })
  const sentScenes = saveSceneDoc.mock.calls.map(call => call[1]?.content)
  const sentTitles = mergeItems.mock.calls.flatMap(call => (call[2] || []).map(item => item?.title))
  expect(sentScenes).not.toContain('Edit queued before the restore')
  expect(sentTitles).not.toContain('Title queued before the restore')
  expect(hook.result.current.novels[0].title).toBe('Chosen backup')
  expect(hook.result.current.getProjectExportData('n').scenes[0].content).toBe('Backup text')
}, 15000)

it('a deletion still waiting to retry cannot delete a record the restore brings back (AUD-23)', async () => {
  const { addPendingDelete } = await import('../utils/pendingDeletes.js')
  const hook = mountAccount()
  addPendingDelete('audit-owner', 'characters', 'c-restored')
  expect((await import('../utils/pendingDeletes.js')).loadPendingDeletes('audit-owner').some(entry => entry.id === 'c-restored')).toBe(true)
  await act(async () => {
    await hook.result.current.replaceData({
      novels: [project], activeNovelId: 'n', scenes: [initialScene], _sceneRevisions: { s: 1 },
      characters: [{ id: 'c-restored', novelId: 'n', name: 'Brought back' }],
    })
  })
  const { loadPendingDeletes } = await import('../utils/pendingDeletes.js')
  expect(loadPendingDeletes('audit-owner').some(entry => entry.id === 'c-restored')).toBe(false)
}, 15000)
