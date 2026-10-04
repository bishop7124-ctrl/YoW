// @vitest-environment jsdom
//
// 4 Oct data-safety matrix, item 5: project archive identity. For every project type, an
// exported archive (the same payload the ZIP carries in project-data.json) imported
//   (a) beside its original in the same account,
//   (b) twice, and
//   (c) into a different account that already holds records with the same ids
// must never reuse, overwrite or re-parent an existing record id, must keep every
// parent link pointing at the new copy, and must leave the original project unchanged.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { strFromU8, unzipSync } from 'fflate'
import { useStore } from './useStore.js'
import { createProjectZipBlob } from '../utils/projectExport.js'
import { createMemoryBackend, resetStorageBackend, setStorageBackend } from '../storage/projectStorage.js'

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
  }
})
vi.mock('../utils/projectStats', () => ({ buildProjectStats: vi.fn().mockReturnValue({}) }))
vi.mock('../utils/storageQuota', () => ({ estimateStoreSize: vi.fn().mockReturnValue(0) }))

beforeEach(() => {
  setStorageBackend(createMemoryBackend())
  localStorage.clear()
})

const TYPES = ['novel', 'novella', 'short_story', 'dnd_campaign', 'ttrpg', 'comic']

const makeData = (type) => {
  const id = `p-${type}`
  return {
    project: { id, title: `Matrix ${type}`, type, aiChatSessions: [{ id: 'chat', novelId: id, title: 'Chat', category: 'Outline', messages: [{ id: 'm1', role: 'user', content: 'hi' }] }] },
    characters: [
      { id: 'c1', novelId: id, name: 'Hero', bio: `BIO ${type}`, factionId: 'f1', spouseIds: ['c2'], relationships: [{ targetId: 'c2', type: 'ally' }] },
      { id: 'c2', novelId: id, name: 'Friend', spouseIds: ['c1'] },
    ],
    factions: [{ id: 'f1', novelId: id, name: 'Guild' }],
    locations: [{ id: 'l1', novelId: id, name: 'Place' }],
    timeline: [{ id: 't1', novelId: id, title: 'Event', eraId: 'e1', linkedCharacters: ['c1'], linkedLocations: ['l1'] }],
    worldHistory: [{ id: 'h1', novelId: id, title: 'History', eraId: 'e1', timelineEventId: 't1' }],
    eras: [{ id: 'e1', novelId: id, name: 'Age' }],
    acts: [{ id: 'a1', novelId: id, title: 'Act', order: 1 }],
    chapters: [{ id: 'ch1', novelId: id, actId: 'a1', title: 'Chapter', order: 1 }],
    scenes: [{ id: 's1', novelId: id, chapterId: 'ch1', title: 'Scene', order: 1, content: `PROSE ${type}` }],
    loreEntries: [{ id: 'lo1', novelId: id, title: 'Lore', characterIds: ['c1'], locationIds: ['l1'] }],
    ideaEntries: [{ id: 'i1', novelId: id, title: 'Idea' }],
    maps: [], whiteboards: [], storySchedule: [], rpgCharacters: [],
    ...(type === 'comic' ? { comicPages: [{ id: 'cp1', novelId: id, order: 1 }], comicPanels: [{ id: 'cpn1', pageId: 'cp1', novelId: id, description: 'PANEL' }] } : {}),
  }
}

const COLLECTIONS = ['characters', 'factions', 'locations', 'timeline', 'worldHistory', 'eras', 'acts', 'chapters',
  'scenes', 'loreEntries', 'ideaEntries', 'comicPages', 'comicPanels']
const stable = (data) => JSON.stringify({ ...data, exportedAt: undefined })
const idsOf = (data) => COLLECTIONS.flatMap(key => (data[key] ?? []).map(item => item.id))

describe.each(TYPES)('archive identity matrix: %s', (type) => {
  it('beside the original and twice: no id is reused, links point at the new copy, original unchanged', () => {
    const { result } = renderHook(() => useStore('acct-A'))
    let original; let copyA; let copyB
    act(() => { original = result.current.importProjectFromData(makeData(type)) })
    const originalBefore = stable(result.current.getProjectExportData(original.id))
    const archive = result.current.getProjectExportData(original.id)
    act(() => { copyA = result.current.importProjectFromData(archive) })
    act(() => { copyB = result.current.importProjectFromData(archive) })

    const dOrig = result.current.getProjectExportData(original.id)
    const dA = result.current.getProjectExportData(copyA.id)
    const dB = result.current.getProjectExportData(copyB.id)
    expect(idsOf(dOrig).length).toBeGreaterThan(8)
    expect(idsOf(dA).length).toBe(idsOf(dOrig).length)       // nothing silently dropped
    for (const [name, [x, y]] of Object.entries({ 'copy A vs original': [dA, dOrig], 'copy B vs original': [dB, dOrig], 'copy A vs copy B': [dA, dB] })) {
      const overlap = idsOf(x).filter(id => idsOf(y).includes(id))
      expect(overlap, name).toEqual([])
    }
    expect(stable(result.current.getProjectExportData(original.id))).toBe(originalBefore)

    // every parent link in the copy resolves inside the copy
    const ids = new Set(idsOf(dA))
    expect(dA.characters.find(c => c.name === 'Hero').spouseIds.every(id => ids.has(id))).toBe(true)
    expect(ids.has(dA.characters.find(c => c.name === 'Hero').factionId)).toBe(true)
    expect(ids.has(dA.chapters[0].actId)).toBe(true)
    expect(ids.has(dA.scenes[0].chapterId)).toBe(true)
    expect(ids.has(dA.timeline[0].eraId)).toBe(true)
    expect(dA.scenes.every(s => s.novelId === copyA.id) && dA.characters.every(c => c.novelId === copyA.id)).toBe(true)
    if (type === 'comic') expect(ids.has(dA.comicPanels[0].pageId)).toBe(true)
    expect(dA.scenes[0].content).toBe(`PROSE ${type}`)
  })

  it('a ZIP round trip into ANOTHER account that already holds records with the same ids keeps both intact', async () => {
    const source = makeData(type)
    const zip = unzipSync(new Uint8Array(await (await createProjectZipBlob(source)).arrayBuffer()))
    const payload = JSON.parse(strFromU8(zip['project-data.json']))

    // account B already owns a project whose records use the very same ids as the archive
    setStorageBackend(createMemoryBackend())
    const b = renderHook(() => useStore('acct-B'))
    let existing
    act(() => { existing = b.result.current.importProjectFromData(source) })
    const existingBefore = stable(b.result.current.getProjectExportData(existing.id))
    let restored
    act(() => { restored = b.result.current.importProjectFromData(payload) })

    const dExisting = b.result.current.getProjectExportData(existing.id)
    const dRestored = b.result.current.getProjectExportData(restored.id)
    expect(stable(dExisting)).toBe(existingBefore)
    expect(idsOf(dRestored).filter(id => idsOf(dExisting).includes(id))).toEqual([])
    expect(dRestored.scenes[0].content).toBe(`PROSE ${type}`)
    expect(dRestored.project.type).toBe(type)
    expect(b.result.current.novels.map(n => n.id).sort()).toEqual([existing.id, restored.id].sort())
    resetStorageBackend()
  })
})
