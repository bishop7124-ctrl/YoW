// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useStore } from '../store/useStore'
import { createMemoryBackend, resetStorageBackend, setStorageBackend } from '../storage/projectStorage'
import { populateYowProject } from './AIImportModal'

vi.mock('../utils/firestoreSync', () => ({
  upsertItems: vi.fn().mockResolvedValue({}), mergeItems: vi.fn().mockResolvedValue({ results: [], fallback: false }),
  deleteItem: vi.fn().mockResolvedValue({}), saveUserSettings: vi.fn().mockResolvedValue({}),
  saveSceneDoc: vi.fn().mockResolvedValue({}), deleteSceneDoc: vi.fn().mockResolvedValue({}),
  deleteProjectData: vi.fn().mockResolvedValue({}), replaceUserData: vi.fn().mockResolvedValue({}),
  getUserStorageUsage: vi.fn().mockResolvedValue(0),
}))
vi.mock('../utils/projectStats', () => ({ buildProjectStats: vi.fn().mockReturnValue({}) }))
vi.mock('../utils/storageQuota', () => ({ estimateStoreSize: vi.fn().mockReturnValue(0) }))

beforeEach(() => { localStorage.clear(); setStorageBackend(createMemoryBackend()) })
afterEach(() => { cleanup(); resetStorageBackend() })

it('populates the real store without changing either existing project and resolves the imported graph', () => {
  const { result } = renderHook(() => useStore(null))
  const source = { id: 'source', title: 'Source', type: 'comic' }
  const destination = { id: 'destination', title: 'Destination', type: 'comic' }
  const own = records => records.map(record => ({ ...record, novelId: source.id }))
  const board = { notes: [{ id: 'keep-note', text: 'Keep destination prose' }], groups: [{ id: 'keep-group', title: 'Keep group' }] }
  act(() => result.current.importData({
    novels: [source, destination], activeNovelId: destination.id,
    characters: [...own([
      { id: 'c', name: 'Source hero', factionId: 'f', familyLinks: [{ id: 'family', sourceCharacterId: 'c', targetCharacterId: 'c2', kind: 'sibling' }], journey: { beats: [{ id: 'beat', timelineEventId: 't', chapterId: 'ch', sceneId: 's', linkedCharacterId: 'c2' }] } },
      { id: 'c2', name: 'Source sibling' },
    ]), { id: 'keep-character', novelId: destination.id, name: 'Keep destination character' }],
    factions: own([{ id: 'f', name: 'Source faction' }]), locations: own([{ id: 'loc', name: 'Source location' }]),
    loreEntries: own([{ id: 'lore', title: 'Source lore', characterIds: ['c'], locationIds: ['loc'], loreIds: ['lore2'] }, { id: 'lore2', title: 'Other lore', loreIds: ['lore'] }]),
    eras: own([{ id: 'era', name: 'Source era' }]),
    timeline: own([{ id: 't', title: 'Source event', eraId: 'era', worldHistoryEntryId: 'h', linkedCharacters: ['c'], linkedLocations: ['loc'] }]),
    worldHistory: own([{ id: 'h', title: 'Source event', eraId: 'era', timelineEventId: 't', linkedCharacters: ['c'], linkedLocations: ['loc'] }]),
    acts: own([{ id: 'a', title: 'Source volume', order: 0 }]), chapters: own([{ id: 'ch', actId: 'a', title: 'Source issue', order: 0 }]),
    scenes: own([{ id: 's', chapterId: 'ch', title: 'Source scene', content: 'Source prose', order: 0, characterIds: ['c'], locationIds: ['loc'], timelineEventIds: ['t'], povCharacterId: 'c', dismissedLinks: ['character:c2'], pov: 'Source hero', storyYear: 7, timeShift: 'flashback' }]),
    comicPages: own([{ id: 'p', issueId: 'ch', title: 'Source page', characterIds: ['c'], locationIds: ['loc'] }]),
    comicPanels: own([{ id: 'panel', pageId: 'p', description: 'Source panel', characterIds: ['c'], locationIds: ['loc'] }]),
    ideaEntries: own([{ id: 'idea', title: 'Source idea', linkedEntities: [{ type: 'character', id: 'c' }, { type: 'lore', id: 'lore' }], linkedIdeas: ['idea2'] }, { id: 'idea2', title: 'Other idea', convertedTo: { type: 'chapter', id: 'ch' } }]),
    rpgCharacters: own([{ id: 'rpg', name: 'Source RPG', factionIds: ['f'], npcRelationships: [{ characterId: 'c', notes: 'NPC prose' }] }]),
    maps: own([{ id: 'map', name: 'Source map', mapObjects: [{ id: 'pin', linkedEntity: { entityType: 'location', entityId: 'loc' } }] }]),
    storySchedule: own([{ id: 'schedule', title: 'Source date', year: 1, month: 1, day: 1, linkedCharacters: ['c'], linkedLocations: ['loc'] }]),
    whiteboards: [{ id: 'keep-board', novelId: destination.id, whiteboard: board }, ...own([{ id: 'source-board', whiteboard: { notes: [{ id: 'new-note', text: 'Source board' }], groups: [] } }])],
  }))
  const sourceBefore = result.current.getProjectExportData(source.id)
  const destinationBefore = result.current.getProjectExportData(destination.id)
  const selection = { characters: true, factions: true, locations: true, loreEntries: true, worldHistory: true, timeline: true, acts: true, ideaEntries: true, rpgCharacters: true, maps: true, storySchedule: true }
  act(() => {
    result.current.beginProjectImport()
    populateYowProject(result.current, sourceBefore, selection)
    result.current.endProjectImport(true)
  })
  const imported = result.current.getProjectExportData(destination.id)
  const hero = imported.characters.find(character => character.name === 'Source hero')
  const sibling = imported.characters.find(character => character.name === 'Source sibling')
  const location = imported.locations[0], faction = imported.factions[0], event = imported.timeline[0], history = imported.worldHistory[0]
  expect(hero).toMatchObject({ factionId: faction.id, familyLinks: [{ sourceCharacterId: hero.id, targetCharacterId: sibling.id }] })
  expect(hero.journey.beats[0]).toMatchObject({ timelineEventId: event.id, chapterId: imported.chapters[0].id, sceneId: imported.scenes[0].id, linkedCharacterId: sibling.id })
  expect(event).toMatchObject({ worldHistoryEntryId: history.id, eraId: imported.eras[0].id, linkedCharacters: [hero.id], linkedLocations: [location.id] })
  expect(history).toMatchObject({ timelineEventId: event.id, eraId: imported.eras[0].id, linkedCharacters: [hero.id], linkedLocations: [location.id] })
  expect(imported.loreEntries[0]).toMatchObject({ characterIds: [hero.id], locationIds: [location.id], loreIds: [imported.loreEntries[1].id] })
  expect(imported.loreEntries[1].loreIds).toEqual([imported.loreEntries[0].id])
  expect(imported.rpgCharacters[0]).toMatchObject({ factionIds: [faction.id], npcRelationships: [{ characterId: hero.id, notes: 'NPC prose' }] })
  expect(imported.ideaEntries[0]).toMatchObject({ linkedIdeas: [imported.ideaEntries[1].id], linkedEntities: [{ type: 'character', id: hero.id }, { type: 'lore', id: imported.loreEntries[0].id }] })
  expect(imported.ideaEntries[1].convertedTo.id).toBe(imported.chapters[0].id)
  expect(imported.maps[0].mapObjects[0].linkedEntity.entityId).toBe(location.id)
  expect(imported.storySchedule[0]).toMatchObject({ linkedCharacters: [hero.id], linkedLocations: [location.id] })
  expect(imported.comicPages[0]).toMatchObject({ issueId: imported.chapters[0].id, characterIds: [hero.id], locationIds: [location.id] })
  expect(imported.comicPanels[0].pageId).toBe(imported.comicPages[0].id)
  expect(imported.scenes[0]).toMatchObject({ characterIds: [hero.id], locationIds: [location.id], timelineEventIds: [event.id], povCharacterId: hero.id, dismissedLinks: [], pov: 'Source hero', storyYear: 7, timeShift: 'flashback', content: 'Source prose' })
  expect(imported.whiteboards).toEqual(destinationBefore.whiteboards)
  expect(imported.characters.find(character => character.id === 'keep-character')).toEqual(destinationBefore.characters[0])
  // Export timestamps are generated per call; the saved content is unchanged.
  expect({ ...result.current.getProjectExportData(source.id), exportedAt: null }).toEqual({ ...sourceBefore, exportedAt: null })
})
