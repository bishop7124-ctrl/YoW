import { describe, expect, it, vi } from 'vitest'
import { populateYowProject } from './AIImportModal'

// Synthetic records only. The double models generated IDs and patch semantics,
// including typed collisions: an old character and location may share an ID.
function graphStore() {
  const rows = Object.fromEntries(['characters', 'factions', 'locations', 'loreEntries', 'worldHistory', 'timeline', 'eras', 'acts', 'chapters', 'scenes', 'comicPages', 'comicPanels', 'ideaEntries', 'rpgCharacters', 'maps', 'storySchedule'].map(key => [key, []]))
  let sequence = 0
  const create = (key, data) => {
    const record = { ...data, id: `${key}-${++sequence}`, novelId: 'destination' }
    rows[key].push(record)
    return record
  }
  const update = (key, id, patch) => Object.assign(rows[key].find(row => row.id === id), patch)
  const store = {
    rows, activeNovelId: 'destination',
    saveCharacter: (data, id) => id ? (update('characters', id, data), id) : create('characters', data).id,
    saveFaction: (data, id) => id ? update('factions', id, data) : create('factions', data),
    setFactions: updater => { rows.factions = updater(rows.factions) },
    addLocation: data => create('locations', data),
    saveLocation: (data, id) => id ? update('locations', id, data) : create('locations', data),
    addLoreEntry: data => create('loreEntries', data), updateLoreEntry: (id, data) => update('loreEntries', id, data),
    addHistoryEntry: data => create('worldHistory', data), updateHistoryEntry: (id, data) => update('worldHistory', id, data),
    addEvent: data => create('timeline', data), updateEvent: (id, data) => update('timeline', id, data),
    addEra: data => create('eras', data), updateEra: (id, data) => update('eras', id, data),
    addIdeaEntry: data => create('ideaEntries', data), updateIdeaEntry: (id, data) => update('ideaEntries', id, data),
    addAct: title => create('acts', { title }), updateAct: (id, data) => update('acts', id, data),
    addChapter: (actId, title) => create('chapters', { actId, title }), updateChapter: (id, data) => update('chapters', id, data),
    addScene: (chapterId, title) => create('scenes', { chapterId, title }), updateScene: (id, data) => update('scenes', id, data),
    addComicPage: (issueId, data) => create('comicPages', { ...data, issueId }), updateComicPage: (id, data) => update('comicPages', id, data),
    addComicPanel: (pageId, data) => create('comicPanels', { ...data, pageId }), updateComicPanel: (id, data) => update('comicPanels', id, data),
    saveRpgCharacter: (data, id) => id ? (update('rpgCharacters', id, data), id) : create('rpgCharacters', data).id,
    addMap: (name, mapType) => create('maps', { name, mapType }).id,
    updateMapData: (id, updater) => update('maps', id, updater(rows.maps.find(row => row.id === id))),
    addScheduleEvent: data => create('storySchedule', data), updateScheduleEvent: (id, data) => update('storySchedule', id, data),
    updateWhiteboard: vi.fn(),
  }
  return store
}

function linkedProject() {
  return {
    project: { id: 'source' },
    characters: [
      { id: 'shared', name: 'shared', factionId: 'f', parentIds: ['other'], childIds: ['other'], spouseIds: ['other'], relationships: [{ targetId: 'other', type: 'shared' }], familyLinks: [{ id: 'fact', sourceCharacterId: 'shared', targetCharacterId: 'other', kind: 'sibling' }], journey: { beats: [{ id: 'beat', timelineEventId: 'e', chapterId: 'ch', sceneId: 's', linkedCharacterId: 'other', description: 'shared' }] } },
      { id: 'other', name: 'Other' },
    ],
    factions: [{ id: 'f', name: 'Faction', syncRootId: 'source-root', syncSourceId: 'source-row' }],
    locations: [{ id: 'shared', name: 'Place', characterIds: ['shared'], loreIds: ['l2'] }],
    loreEntries: [{ id: 'l1', title: 'First', characterIds: ['shared'], locationIds: ['shared'], loreIds: ['l2'] }, { id: 'l2', title: 'Second', loreIds: ['l1'] }],
    eras: [{ id: 'era', name: 'Age' }],
    worldHistory: [{ id: 'h', title: 'History', eraId: 'era', timelineEventId: 'e', linkedCharacters: ['shared'], linkedLocations: ['shared'] }],
    timeline: [{ id: 'e', title: 'Event', eraId: 'era', worldHistoryEntryId: 'h', linkedCharacters: ['shared'], linkedLocations: ['shared'] }],
    acts: [{ id: 'a', title: 'Act' }],
    chapters: [{ id: 'ch', actId: 'a', title: 'Chapter' }],
    scenes: [{ id: 's', chapterId: 'ch', actId: 'a', title: 'Scene', content: 'shared', characterIds: ['shared'], locationIds: ['shared'], timelineEventIds: ['e'], povCharacterId: 'shared', dismissedLinks: ['character:other'], pov: 'shared', locationTag: 'shared', storyYear: 7, timeShift: 'flashback' }],
    comicPages: [{ id: 'p', issueId: 'ch', title: 'Page', characterIds: ['shared'], locationIds: ['shared'] }],
    comicPanels: [{ id: 'panel', pageId: 'p', characterIds: ['shared'], locationIds: ['shared'], dialogue: [{ id: 'speech', characterId: 'shared', text: 'shared' }] }],
    ideaEntries: [{ id: 'i1', title: 'Idea', linkedEntities: [{ type: 'character', id: 'shared', name: 'shared' }, { type: 'location', id: 'shared' }, { type: 'faction', id: 'f' }, { type: 'lore', id: 'l1' }, { type: 'event', id: 'e' }, { type: 'chapter', id: 'ch' }], linkedIdeas: ['i2'], convertedTo: { type: 'lore', id: 'l2' } }, { id: 'i2', title: 'Other idea', linkedIdeas: ['i1'] }],
    rpgCharacters: [{ id: 'r', name: 'Hero', factionIds: ['f'], npcRelationships: [{ characterId: 'shared', notes: 'shared' }], class: 'shared', spellsKnown: ['shared'] }],
    maps: [{ id: 'm', name: 'Map', mapObjects: [{ id: 'object', properties: { stampId: 'shared', name: 'shared' }, linkedEntity: { entityType: 'location', entityId: 'shared' } }], mapRegions: [{ id: 'region', linkedEntity: { entityType: 'location', entityId: 'shared' } }], mapPins: [{ id: 'pin', linkedEntity: { entityType: 'location', entityId: 'shared' } }] }],
    storySchedule: [{ id: 'schedule', title: 'Day', linkedCharacters: ['shared'], linkedLocations: ['shared'] }],
    whiteboards: [{ id: 'board', whiteboard: { notes: [{ id: 'source-note', text: 'Source note' }], groups: [{ id: 'source-group' }] } }],
  }
}

const all = { characters: true, factions: true, locations: true, loreEntries: true, worldHistory: true, timeline: true, acts: true, ideaEntries: true, rpgCharacters: true, maps: true, storySchedule: true }

describe('native additive import graph', () => {
  it.each([all, { characters: true }])('does not replace destination whiteboard for selection %j', selection => {
    const store = graphStore()
    const destination = { notes: [{ id: 'keep', text: 'Destination prose' }], groups: [{ id: 'keep-group' }] }
    store.whiteboard = destination
    store.updateWhiteboard.mockImplementation(board => { store.whiteboard = board })
    const data = linkedProject()
    const original = structuredClone(data)
    populateYowProject(store, data, selection)
    expect(store.updateWhiteboard).not.toHaveBeenCalled()
    expect(store.whiteboard).toEqual(destination)
    expect(data).toEqual(original)
  })

  it('remaps each supported reference through its entity type, including cycles and nested fields', () => {
    const store = graphStore()
    populateYowProject(store, linkedProject(), all)
    const r = store.rows
    const hero = r.characters[0], other = r.characters[1], place = r.locations[0]
    expect(hero).toMatchObject({ factionId: r.factions[0].id, parentIds: [other.id], childIds: [other.id], spouseIds: [other.id], relationships: [{ targetId: other.id }], familyLinks: [{ sourceCharacterId: hero.id, targetCharacterId: other.id }] })
    expect(hero.journey.beats[0]).toMatchObject({ timelineEventId: r.timeline[0].id, chapterId: r.chapters[0].id, sceneId: r.scenes[0].id, linkedCharacterId: other.id })
    expect(place).toMatchObject({ characterIds: [hero.id], loreIds: [r.loreEntries[1].id] })
    expect(r.loreEntries[0]).toMatchObject({ characterIds: [hero.id], locationIds: [place.id], loreIds: [r.loreEntries[1].id] })
    expect(r.loreEntries[1].loreIds).toEqual([r.loreEntries[0].id])
    expect(r.timeline[0]).toMatchObject({ eraId: r.eras[0].id, worldHistoryEntryId: r.worldHistory[0].id, linkedCharacters: [hero.id], linkedLocations: [place.id] })
    expect(r.worldHistory[0]).toMatchObject({ eraId: r.eras[0].id, timelineEventId: r.timeline[0].id, linkedCharacters: [hero.id], linkedLocations: [place.id] })
    expect(r.chapters[0].actId).toBe(r.acts[0].id)
    expect(r.scenes[0]).toMatchObject({ chapterId: r.chapters[0].id, actId: r.acts[0].id, characterIds: [hero.id], locationIds: [place.id], timelineEventIds: [r.timeline[0].id], povCharacterId: hero.id, dismissedLinks: [], pov: 'shared', locationTag: 'shared', storyYear: 7, timeShift: 'flashback' })
    expect(r.comicPages[0]).toMatchObject({ issueId: r.chapters[0].id, characterIds: [hero.id], locationIds: [place.id] })
    expect(r.comicPanels[0]).toMatchObject({ pageId: r.comicPages[0].id, characterIds: [hero.id], locationIds: [place.id], dialogue: [{ characterId: hero.id }] })
    expect(r.ideaEntries[0].linkedEntities.map(link => link.id)).toEqual([hero.id, place.id, r.factions[0].id, r.loreEntries[0].id, r.timeline[0].id, r.chapters[0].id])
    expect(r.ideaEntries[0].linkedIdeas).toEqual([r.ideaEntries[1].id])
    expect(r.ideaEntries[1].linkedIdeas).toEqual([r.ideaEntries[0].id])
    expect(r.ideaEntries[0].convertedTo.id).toBe(r.loreEntries[1].id)
    expect(r.rpgCharacters[0]).toMatchObject({ factionIds: [r.factions[0].id], npcRelationships: [{ characterId: hero.id }] })
    for (const key of ['mapObjects', 'mapRegions', 'mapPins']) expect(r.maps[0][key][0].linkedEntity.entityId).toBe(place.id)
    expect(r.storySchedule[0]).toMatchObject({ linkedCharacters: [hero.id], linkedLocations: [place.id] })
    // Text, rulebook IDs and map-local IDs are not project references.
    expect(hero.name).toBe('shared')
    expect(hero.relationships[0].type).toBe('shared')
    expect(hero.journey.beats[0].description).toBe('shared')
    expect(r.scenes[0].content).toBe('shared')
    expect(r.rpgCharacters[0]).toMatchObject({ class: 'shared', spellsKnown: ['shared'], npcRelationships: [{ notes: 'shared' }] })
    expect(r.maps[0].mapObjects[0]).toMatchObject({ id: 'object', properties: { stampId: 'shared', name: 'shared' } })
    expect(r.factions[0].syncRootId).not.toBe('source-root')
    expect(r.factions[0].syncSourceId).toBeUndefined()
  })

  it('clears omitted or missing targets instead of linking to colliding destination records', () => {
    const store = graphStore()
    const kept = { id: 'shared', novelId: 'destination', name: 'Unrelated destination' }
    store.rows.characters.push(kept)
    populateYowProject(store, linkedProject(), { loreEntries: true, ideaEntries: true, rpgCharacters: true, maps: true, storySchedule: true })
    expect(store.rows.characters).toEqual([kept])
    expect(store.rows.loreEntries[0]).toMatchObject({ characterIds: [], locationIds: [], loreIds: [store.rows.loreEntries[1].id] })
    expect(store.rows.ideaEntries[0].linkedEntities).toEqual([{ type: 'lore', id: store.rows.loreEntries[0].id }])
    expect(store.rows.rpgCharacters[0]).toMatchObject({ factionIds: [], npcRelationships: [] })
    expect(store.rows.maps[0].mapObjects[0].linkedEntity).toBeNull()
    expect(store.rows.storySchedule[0]).toMatchObject({ linkedCharacters: [], linkedLocations: [] })
  })

  it('clears scene and journey links to omitted sections and resets scene suggestion dismissals', () => {
    const store = graphStore()
    populateYowProject(store, linkedProject(), { acts: true })
    expect(store.rows.scenes[0]).toMatchObject({ characterIds: [], locationIds: [], timelineEventIds: [], povCharacterId: null, dismissedLinks: [], content: 'shared', pov: 'shared', locationTag: 'shared' })
    const charactersOnly = graphStore()
    populateYowProject(charactersOnly, linkedProject(), { characters: true })
    expect(charactersOnly.rows.characters[0]).toMatchObject({ factionId: '', journey: { beats: [{ timelineEventId: '', chapterId: '', sceneId: '', linkedCharacterId: charactersOnly.rows.characters[1].id }] } })
  })

  it('gives a repeated import its own graph without editing the first import', () => {
    const store = graphStore()
    const data = linkedProject()
    populateYowProject(store, data, all)
    const first = structuredClone(store.rows)
    populateYowProject(store, data, all)
    for (const key of Object.keys(first)) {
      expect(store.rows[key].slice(0, first[key].length)).toEqual(first[key])
      expect(new Set(store.rows[key].map(row => row.id)).size).toBe(store.rows[key].length)
    }
    expect(store.rows.characters[2].familyLinks[0]).toMatchObject({ sourceCharacterId: store.rows.characters[2].id, targetCharacterId: store.rows.characters[3].id })
    expect(store.rows.loreEntries[2].loreIds).toEqual([store.rows.loreEntries[3].id])
  })

  it('keeps conflict copies attached to the imported scene and exposes an orphan as recoverable prose', () => {
    const store = graphStore()
    const data = linkedProject()
    data.scenes.push(
      { id: 'copy', chapterId: 'ch', title: 'Conflict copy', content: 'Candidate prose', conflictOf: 's' },
      { id: 'orphan-copy', chapterId: 'ch', title: 'Orphan candidate', content: 'Orphan prose', conflictOf: 'missing' },
    )
    populateYowProject(store, data, { acts: true })
    expect(store.rows.scenes[1]).toMatchObject({ content: 'Candidate prose', conflictOf: store.rows.scenes[0].id })
    expect(store.rows.scenes[2]).toMatchObject({ content: 'Orphan prose', conflictOf: null })
  })

  it.each(['create', 'patch'])('reports a refused %s so the caller can restore its snapshot', phase => {
    const store = graphStore()
    if (phase === 'create') store.addLoreEntry = () => null
    else store.updateLoreEntry = () => null
    expect(() => populateYowProject(store, linkedProject(), all)).toThrow(/Could not import loreEntries/)
    expect(store.updateWhiteboard).not.toHaveBeenCalled()
  })
})
