// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStore } from './useStore.js'
import { resetStorageBackend } from '../storage/projectStorage.js'

vi.mock('../utils/firestoreSync', () => ({
  upsertItems: vi.fn().mockResolvedValue({}), mergeItems: vi.fn().mockResolvedValue({ results: [], fallback: false }),
  deleteItem: vi.fn().mockResolvedValue({}), saveUserSettings: vi.fn().mockResolvedValue({}), saveSceneDoc: vi.fn().mockResolvedValue({}),
  deleteSceneDoc: vi.fn().mockResolvedValue({}), deleteProjectData: vi.fn().mockResolvedValue({}), replaceUserData: vi.fn().mockResolvedValue({}),
  getUserStorageUsage: vi.fn().mockResolvedValue(0), fetchPlotThreads: vi.fn().mockResolvedValue({ ok: true, threads: [] }),
}))
vi.mock('../utils/cloudSceneVersions', () => ({ markCloudScenesDeleted: vi.fn(), markCloudNovelDeleted: vi.fn() }))
vi.mock('../utils/storageQuota', () => ({ estimateStoreSize: vi.fn().mockReturnValue(0) }))

beforeEach(() => { resetStorageBackend(); localStorage.clear() })

function setup() {
  const hook = renderHook(() => useStore(null))
  let novel, character, s1, s2, event
  act(() => { novel = hook.result.current.addNovel({ title: 'World', type: 'novel' }) })
  act(() => { character = { id: hook.result.current.saveCharacter({ name: 'Mira' }) } })
  act(() => { const a = hook.result.current.addAct('Act'); const c = hook.result.current.addChapter(a.id, 'Ch'); s1 = hook.result.current.addScene(c.id, 'Gate'); s2 = hook.result.current.addScene(c.id, 'Cellar') })
  act(() => { event = hook.result.current.addEvent({ title: 'The siege', startYear: 3 }) })
  act(() => {
    hook.result.current.saveCharacterKnowledge(character.id, [
      { id: 'f1', text: 'The bridge is mined', learnedAtSceneId: s2.id, learnedAtEventId: event.id, usedInSceneIds: [s1.id, s2.id], via: 'told' },
    ])
  })
  return { hook, novel, character, s1, s2, event }
}
const mira = hook => hook.result.current.characters.find(c => c.name === 'Mira')

describe('character knowledge in the store', () => {
  it('saves a cleaned list on the character', () => {
    const { hook } = setup()
    expect(mira(hook).knowledge).toHaveLength(1)
    expect(mira(hook).knowledge[0]).toMatchObject({ id: 'f1', text: 'The bridge is mined', via: 'told', confidence: 'believed' })
    act(() => { hook.result.current.saveCharacterKnowledge(mira(hook).id, [{ text: '' }, { id: 'f2', text: 'Another' }]) })
    expect(mira(hook).knowledge.map(f => f.id)).toEqual(['f2'])
  })

  it('takes a deleted scene off the fact but keeps the fact and its other links', () => {
    const { hook, s1, s2 } = setup()
    act(() => { hook.result.current.deleteScene(s1.id) })
    expect(mira(hook).knowledge[0]).toMatchObject({ learnedAtSceneId: s2.id, usedInSceneIds: [s2.id] })
    act(() => { hook.result.current.deleteScene(s2.id) })
    expect(mira(hook).knowledge[0]).toMatchObject({ text: 'The bridge is mined', learnedAtSceneId: '', usedInSceneIds: [] })
  })

  it('clears a deleted event, and leaves characters without knowledge untouched', () => {
    const { hook, event } = setup()
    let other
    act(() => { other = { id: hook.result.current.saveCharacter({ name: 'Tomas' }) } })
    const before = hook.result.current.characters.find(c => c.id === other.id)
    act(() => { hook.result.current.deleteEvent(event.id) })
    expect(mira(hook).knowledge[0].learnedAtEventId).toBe('')
    expect(hook.result.current.characters.find(c => c.id === other.id)).toEqual(before)
    expect(hook.result.current.characters.find(c => c.id === other.id)).not.toHaveProperty('knowledge')
  })

  it('travels with the character through a project export and import, pointing at the copied scenes', () => {
    const { hook, novel, s2 } = setup()
    const exported = hook.result.current.getProjectExportData(novel.id)
    act(() => { hook.result.current.importProjectFromData(JSON.parse(JSON.stringify(exported))) })
    const copy = hook.result.current.getLocalSnapshot().characters.find(c => c.name === 'Mira' && c.novelId !== novel.id)
    const copiedScene = hook.result.current.getLocalSnapshot().scenes.find(s => s.title === 'Cellar' && s.novelId === copy.novelId)
    expect(copy.knowledge[0].learnedAtSceneId).toBe(copiedScene.id)
    expect(copy.knowledge[0].learnedAtSceneId).not.toBe(s2.id)
  })

  it('is refused in a read-only project', () => {
    const hook = renderHook(() => useStore(null, { readOnly: true }))
    expect(hook.result.current.saveCharacterKnowledge('x', [{ text: 'y' }])).toBeFalsy()
  })
})
