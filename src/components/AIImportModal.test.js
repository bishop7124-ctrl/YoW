import { describe, it, expect } from 'vitest'
import {
  populateProject, populateYowProject, populateProjectIntoExisting, populateYowProjectIntoExisting,
  relabelActsForType, parseManuscriptSections, buildUserMessage, isPromptTooLargeError, CONTENT_CHAR_CAPS, countLabel, stripFrontBackMatter,
} from './AIImportModal'

// Minimal store double capturing what the populate helpers create.
function mockStore() {
  const calls = {
    characters: [], locations: [], lore: [], history: [], events: [], ideas: [],
    acts: [], chapters: [], scenes: [], comicPages: [], comicPanels: [], rpgCharacters: [], eras: [], whiteboards: [], maps: [],
  }
  let n = 0
  const nid = (p) => `${p}-${++n}`
  return {
    calls,
    activeNovelId: 'novel-new',
    saveCharacter: (data, id) => {
      if (id) { Object.assign(calls.characters.find(c => c.id === id), data); return id }
      const newId = nid('char'); calls.characters.push({ ...data, id: newId }); return newId
    },
    addLocation: (data) => { const item = { ...data, id: nid('loc') }; calls.locations.push(item); return item },
    setFactions: () => {},
    addLoreEntry: (data) => { const item = { ...data, id: nid('lore') }; calls.lore.push(item); return item },
    addHistoryEntry: (data) => { const item = { ...data, id: nid('hist') }; calls.history.push(item); return item },
    addEvent: (data) => { const item = { ...data, id: nid('event') }; calls.events.push(item); return item },
    addIdeaEntry: (data) => { const item = { ...data, id: nid('idea') }; calls.ideas.push(item); return item },
    addAct: (title) => { const a = { id: nid('act'), title }; calls.acts.push(a); return a },
    updateAct: (id, data) => Object.assign(calls.acts.find(a => a.id === id), data),
    addChapter: (actId, title) => { const c = { id: nid('chap'), actId, title }; calls.chapters.push(c); return c },
    updateChapter: (id, data) => Object.assign(calls.chapters.find(c => c.id === id), data),
    addScene: (chapterId, title) => { const s = { id: nid('scene'), chapterId, title }; calls.scenes.push(s); return s },
    updateScene: (id, data) => Object.assign(calls.scenes.find(s => s.id === id), data),
    addComicPage: (issueId, data) => { const p = { id: nid('page'), issueId, ...data }; calls.comicPages.push(p); return p },
    addComicPanel: (pageId, data) => { const p = { id: nid('panel'), pageId, ...data }; calls.comicPanels.push(p); return p },
    saveRpgCharacter: (data) => { const id = nid('rpg'); calls.rpgCharacters.push({ ...data, id }); return id },
    addMap: (name, mapType) => {
      const id = nid('map')
      calls.maps.push({ id, name, mapType })
      return id
    },
    updateActiveMapData: () => {},
    updateMapData: (mapId, updater) => {
      const map = calls.maps.find(m => m.id === mapId)
      if (!map) return
      Object.assign(map, updater(map))
    },
    addScheduleEvent: () => {},
    addEra: (data) => { const item = { ...data, id: nid('era') }; calls.eras.push(item); return item },
    updateWhiteboard: (board) => { calls.whiteboards.push(board) },
  }
}

// Fuller store double for the "import into existing project" path: unlike
// mockStore() above (which only ever creates), this one holds a seeded
// destination project's existing records and supports the update/delete
// calls duplicate resolution and rollback rely on. All mutations are
// immutable (replace the array, never mutate in place) — matching the real
// store's commitLocal/setState pattern, which matters here because
// populate*IntoExisting reads store.X once per category into a local
// `existing` snapshot and must not see its own writes mid-loop.
function mockMergeStore(seed = {}) {
  let n = 0
  const nid = (p) => `${p}-${++n}`
  const state = {
    characters: [...(seed.characters || [])],
    locations: [...(seed.locations || [])],
    factions: [...(seed.factions || [])],
    loreEntries: [...(seed.loreEntries || [])],
    worldHistory: [...(seed.worldHistory || [])],
    timeline: [...(seed.timeline || [])],
    ideaEntries: [...(seed.ideaEntries || [])],
    storySchedule: [...(seed.storySchedule || [])],
    maps: [...(seed.maps || [])],
    acts: [], chapters: [], scenes: [],
    comicPages: [...(seed.comicPages || [])],
    comicPanels: [...(seed.comicPanels || [])],
    rpgCharacters: [...(seed.rpgCharacters || [])],
    eras: [...(seed.eras || [])],
  }
  const upsert = (key, id, patch) => { state[key] = state[key].map(x => x.id === id ? { ...x, ...patch } : x) }
  const remove = (key, id) => { state[key] = state[key].filter(x => x.id !== id) }
  const add = (key, record) => { state[key] = [...state[key], record] }

  return {
    _state: state,
    activeNovelId: 'dest-novel',
    setActiveNovelId: () => {},
    get characters() { return state.characters },
    get locations() { return state.locations },
    get factions() { return state.factions },
    get loreEntries() { return state.loreEntries },
    get worldHistory() { return state.worldHistory },
    get timeline() { return state.timeline },
    get ideaEntries() { return state.ideaEntries },
    get storySchedule() { return state.storySchedule },
    get mapProject() { return { maps: state.maps } },
    // Not read by populate*IntoExisting itself (comic pages/panels, RPG
    // characters, acts/chapters/scenes, eras, and maps are always-create or
    // written via mapProject) — exposed here purely for test assertions.
    get maps() { return state.maps },
    get acts() { return state.acts },
    get chapters() { return state.chapters },
    get scenes() { return state.scenes },
    get comicPages() { return state.comicPages },
    get comicPanels() { return state.comicPanels },
    get rpgCharacters() { return state.rpgCharacters },
    get eras() { return state.eras },

    saveCharacter: (data, id) => {
      if (id) { upsert('characters', id, data); return id }
      const newId = nid('char'); add('characters', { id: newId, ...data }); return newId
    },
    deleteCharacter: (id) => remove('characters', id),

    addLocation: (data) => { const rec = { id: nid('loc'), ...data }; add('locations', rec); return rec },
    saveLocation: (data, id) => { upsert('locations', id, data); return { id, ...data } },
    deleteLocation: (id) => remove('locations', id),

    setFactions: (updater) => { state.factions = updater(state.factions) },

    addLoreEntry: (data) => { const rec = { id: nid('lore'), ...data }; add('loreEntries', rec); return rec },
    updateLoreEntry: (id, data) => upsert('loreEntries', id, data),
    deleteLoreEntry: (id) => remove('loreEntries', id),

    addHistoryEntry: (data) => { const rec = { id: nid('hist'), ...data }; add('worldHistory', rec); return rec },
    updateHistoryEntry: (id, data) => upsert('worldHistory', id, data),
    deleteHistoryEntry: (id) => remove('worldHistory', id),

    addEvent: (data) => {
      // Mirrors the real store: the input key is `linkedHistoryEntryId`, but
      // the field persisted on the record is `worldHistoryEntryId`.
      const { linkedHistoryEntryId, ...rest } = data
      const historyId = linkedHistoryEntryId ?? data.worldHistoryEntryId ?? null
      const rec = { id: nid('event'), ...rest, worldHistoryEntryId: historyId }
      add('timeline', rec)
      if (historyId) upsert('worldHistory', historyId, { timelineEventId: rec.id })
      return rec
    },
    updateEvent: (id, data) => upsert('timeline', id, data),
    deleteEvent: (id) => remove('timeline', id),

    addIdeaEntry: (data) => { const rec = { id: nid('idea'), ...data }; add('ideaEntries', rec); return rec },
    updateIdeaEntry: (id, data) => upsert('ideaEntries', id, data),
    deleteIdeaEntry: (id) => remove('ideaEntries', id),

    addScheduleEvent: (data) => { const rec = { id: nid('sched'), ...data }; add('storySchedule', rec); return rec },
    updateScheduleEvent: (id, data) => upsert('storySchedule', id, data),
    deleteScheduleEvent: (id) => remove('storySchedule', id),

    addMap: (name, mapType) => { const id = nid('map'); add('maps', { id, name, mapType, mapPins: [], mapObjects: [] }); return id },
    updateMapData: (mapId, updater) => {
      const map = state.maps.find(m => m.id === mapId)
      if (!map) return
      upsert('maps', mapId, updater(map) || {})
    },
    deleteMap: (id) => remove('maps', id),

    addEra: (data) => { const rec = { id: nid('era'), ...data }; add('eras', rec); return rec },
    deleteEra: (id) => remove('eras', id),

    addAct: (title) => { const rec = { id: nid('act'), title }; add('acts', rec); return rec },
    updateAct: (id, data) => upsert('acts', id, data),
    deleteAct: (id) => {
      const chapIds = state.chapters.filter(c => c.actId === id).map(c => c.id)
      remove('acts', id)
      state.chapters = state.chapters.filter(c => c.actId !== id)
      state.scenes = state.scenes.filter(s => !chapIds.includes(s.chapterId))
    },
    addChapter: (actId, title) => { const rec = { id: nid('chap'), actId, title }; add('chapters', rec); return rec },
    updateChapter: (id, data) => upsert('chapters', id, data),
    addScene: (chapterId, title) => { const rec = { id: nid('scene'), chapterId, title }; add('scenes', rec); return rec },
    updateScene: (id, data) => upsert('scenes', id, data),

    addComicPage: (issueId, data) => { const rec = { id: nid('page'), issueId, ...data }; add('comicPages', rec); return rec },
    deleteComicPage: (id) => remove('comicPages', id),
    addComicPanel: (pageId, data) => { const rec = { id: nid('panel'), pageId, ...data }; add('comicPanels', rec); return rec },
    deleteComicPanel: (id) => remove('comicPanels', id),

    saveRpgCharacter: (data) => { const id = nid('rpg'); add('rpgCharacters', { id, ...data }); return id },
    deleteRpgCharacter: (id) => remove('rpgCharacters', id),
  }
}

describe('relabelActsForType', () => {
  const acts = [{
    title: 'Act 1',
    chapters: [
      { title: 'Chapter 1', scenes: [{ title: 'Chapter 1', content: 'x' }] },
      { title: 'The Fall of Kings', scenes: [{ title: 'The Fall of Kings', content: 'y' }] },
    ],
  }]

  it('renames generated fallback titles to the target type structure', () => {
    const out = relabelActsForType(acts, 'dnd_campaign')
    expect(out[0].title).toBe('Story Arc 1')
    expect(out[0].chapters[0].title).toBe('Session 1')
    // scene title mirrors its chapter, so it follows the rename
    expect(out[0].chapters[0].scenes[0].title).toBe('Session 1')
  })

  it('keeps titles taken from real document headings', () => {
    const out = relabelActsForType(acts, 'tabletop_rpg')
    expect(out[0].chapters[1].title).toBe('The Fall of Kings')
    expect(out[0].chapters[1].scenes[0].title).toBe('The Fall of Kings')
  })

  it('is a no-op for novel projects', () => {
    const out = relabelActsForType(acts, 'novel')
    expect(out[0].title).toBe('Act 1')
    expect(out[0].chapters[0].title).toBe('Chapter 1')
  })
})

describe('populateProject', () => {
  const proseData = {
    acts: [{
      title: 'Act 1',
      synopsis: 'The setup',
      chapters: [{
        title: 'Chapter 1',
        synopsis: 'It begins',
        scenes: [{ title: 'Chapter 1', synopsis: 'It begins', content: 'Once upon a time.' }],
      }],
    }],
    ideaEntries: [{ title: 'Loose note', description: 'A thought', body: 'A thought' }],
  }

  it('creates scenes with content for non-comic types', () => {
    const store = mockStore()
    populateProject(store, proseData, { acts: true }, 'novella')
    expect(store.calls.acts[0].title).toBe('Part 1')
    expect(store.calls.scenes).toHaveLength(1)
    expect(store.calls.scenes[0].content).toBe('Once upon a time.')
    expect(store.calls.comicPages).toHaveLength(0)
  })

  it('creates comic pages instead of scenes for comic projects', () => {
    const store = mockStore()
    populateProject(store, proseData, { acts: true }, 'comic')
    expect(store.calls.acts[0].title).toBe('Volume 1')
    expect(store.calls.chapters[0].title).toBe('Issue 1')
    expect(store.calls.scenes).toHaveLength(0)
    expect(store.calls.comicPages).toHaveLength(1)
    expect(store.calls.comicPages[0].issueId).toBe(store.calls.chapters[0].id)
    expect(store.calls.comicPages[0].summary).toBe('Once upon a time.')
  })

  it('imports idea entries when selected', () => {
    const store = mockStore()
    populateProject(store, proseData, { ideaEntries: true }, 'novel')
    expect(store.calls.ideas).toHaveLength(1)
    expect(store.calls.ideas[0].title).toBe('Loose note')
  })
})

describe('populateYowProject', () => {
  it('restores comic pages/panels with remapped issue, page, and character ids', () => {
    const store = mockStore()
    const data = {
      characters: [{ id: 'old-char', name: 'Mika' }],
      acts: [{ id: 'old-act', title: 'Volume 1', order: 0 }],
      chapters: [{ id: 'old-chap', actId: 'old-act', title: 'Issue 1', order: 0 }],
      scenes: [],
      comicPages: [{ id: 'old-page', novelId: 'old-novel', issueId: 'old-chap', order: 0, title: 'Page 1', summary: 'Beat', characterIds: ['old-char'] }],
      comicPanels: [{ id: 'old-panel', novelId: 'old-novel', pageId: 'old-page', order: 0, description: 'Close-up', characterIds: ['old-char'] }],
    }
    populateYowProject(store, data, { acts: true, characters: true })
    const page = store.calls.comicPages[0]
    const panel = store.calls.comicPanels[0]
    expect(page.issueId).toBe(store.calls.chapters[0].id)
    expect(page.characterIds).toEqual([store.calls.characters[0].id])
    expect(panel.pageId).toBe(page.id)
    expect(panel.characterIds).toEqual([store.calls.characters[0].id])
  })

  it('recreates eras and remaps eraId on world history entries and timeline events', () => {
    const store = mockStore()
    const data = {
      eras: [{ id: 'old-era', novelId: 'old-novel', name: 'The Second Age', startYear: 0, endYear: 100 }],
      worldHistory: [{ id: 'old-hist', novelId: 'old-novel', title: 'The Founding', eraId: 'old-era' }],
      timeline: [{ id: 'old-event', novelId: 'old-novel', title: 'The Founding', eraId: 'old-era' }],
    }
    populateYowProject(store, data, { worldHistory: true, timeline: true })
    expect(store.calls.eras).toHaveLength(1)
    const newEraId = store.calls.eras[0].id
    expect(newEraId).not.toBe('old-era')
    expect(store.calls.history[0].eraId).toBe(newEraId)
    expect(store.calls.events[0].eraId).toBe(newEraId)
  })

  it('restores each imported map\'s pins/objects onto its own new map, not a stale active one', () => {
    const store = mockStore()
    const data = {
      maps: [
        { id: 'old-map-1', novelId: 'old-novel', name: 'Continent', mapType: 'region', mapPins: [{ id: 'p1' }], mapObjects: [{ id: 'o1' }] },
        { id: 'old-map-2', novelId: 'old-novel', name: 'Capital City', mapType: 'local', mapPins: [{ id: 'p2' }], mapObjects: [{ id: 'o2' }] },
      ],
    }
    populateYowProject(store, data, { maps: true })
    expect(store.calls.maps).toHaveLength(2)
    expect(store.calls.maps[0].name).toBe('Continent')
    expect(store.calls.maps[0].mapPins).toEqual([{ id: 'p1' }])
    expect(store.calls.maps[1].name).toBe('Capital City')
    expect(store.calls.maps[1].mapPins).toEqual([{ id: 'p2' }])
  })

  it('does not recreate eras when neither world history nor timeline is selected', () => {
    const store = mockStore()
    const data = {
      eras: [{ id: 'old-era', novelId: 'old-novel', name: 'The Second Age' }],
      characters: [{ id: 'old-char', name: 'Mika' }],
    }
    populateYowProject(store, data, { characters: true })
    expect(store.calls.eras).toHaveLength(0)
  })

  it('restores the whiteboard without needing a section toggle', () => {
    const store = mockStore()
    const data = {
      whiteboards: [{ id: 'old-wb', novelId: 'old-novel', whiteboard: { notes: [{ id: 'n1', text: 'Idea' }], groups: [] } }],
    }
    populateYowProject(store, data, {})
    expect(store.calls.whiteboards).toHaveLength(1)
    expect(store.calls.whiteboards[0].notes[0].text).toBe('Idea')
  })

  it('restores character builder party members', () => {
    const store = mockStore()
    const data = { rpgCharacters: [{ id: 'old-rpg', novelId: 'old-novel', name: 'Thorn', class: 'Ranger' }] }
    populateYowProject(store, data, { rpgCharacters: true })
    expect(store.calls.rpgCharacters).toHaveLength(1)
    expect(store.calls.rpgCharacters[0].name).toBe('Thorn')
    expect(store.calls.rpgCharacters[0]).not.toHaveProperty('novelId')
  })
})

// ── Import into an existing project ───────────────────────────────────────────

describe('populateProjectIntoExisting', () => {
  it('creates brand-new records that have no name match in the destination', () => {
    const store = mockMergeStore({ characters: [{ id: 'd1', name: 'Someone Else' }] })
    const summary = populateProjectIntoExisting(store, { characters: [{ name: 'Mika', role: 'Protagonist' }] }, { characters: true }, 'novel', {})
    expect(store.characters).toHaveLength(2)
    expect(store.characters.some(c => c.name === 'Mika')).toBe(true)
    expect(summary).toEqual({ new: 1, skipped: 0, merged: 0, replaced: 0 })
  })

  it('defaults duplicates to Skip — the existing record is left completely untouched', () => {
    const store = mockMergeStore({ characters: [{ id: 'd1', name: 'Mika', bio: 'Original bio', role: 'Antagonist' }] })
    const summary = populateProjectIntoExisting(store, { characters: [{ name: 'Mika', bio: 'Imported bio', role: 'Protagonist' }] }, { characters: true }, 'novel', {})
    expect(store.characters).toHaveLength(1)
    expect(store.characters[0]).toEqual({ id: 'd1', name: 'Mika', bio: 'Original bio', role: 'Antagonist' })
    expect(summary).toEqual({ new: 0, skipped: 1, merged: 0, replaced: 0 })
  })

  it('Merge fills only empty fields on the destination record, never overwriting a populated one', () => {
    const store = mockMergeStore({ characters: [{ id: 'd1', name: 'Mika', bio: '', role: 'Antagonist' }] })
    const summary = populateProjectIntoExisting(
      store,
      { characters: [{ name: 'Mika', bio: 'Imported bio', role: 'Protagonist' }] },
      { characters: true }, 'novel', { characters: 'merge' },
    )
    const merged = store.characters.find(c => c.id === 'd1')
    expect(merged.bio).toBe('Imported bio') // was empty — filled in
    expect(merged.role).toBe('Antagonist')  // was already populated — untouched
    expect(summary).toEqual({ new: 0, skipped: 0, merged: 1, replaced: 0 })
  })

  it('Replace overwrites the destination record\'s fields from the imported one', () => {
    const store = mockMergeStore({ locations: [{ id: 'd1', name: 'Old Port', category: 'City', description: 'stale' }] })
    const summary = populateProjectIntoExisting(
      store,
      { locations: [{ name: 'Old Port', category: 'Ruins', description: 'fresh' }] },
      { locations: true }, 'novel', { locations: 'replace' },
    )
    const replaced = store.locations.find(l => l.id === 'd1')
    expect(replaced.category).toBe('Ruins')
    expect(replaced.description).toBe('fresh')
    expect(summary).toEqual({ new: 0, skipped: 0, merged: 0, replaced: 1 })
  })

  it('Create separate imports a same-named record as a brand-new one instead of resolving the match', () => {
    const store = mockMergeStore({ factions: [{ id: 'd1', name: 'The Guild' }] })
    const summary = populateProjectIntoExisting(
      store,
      { factions: [{ name: 'The Guild', description: 'A second, distinct guild' }] },
      { factions: true }, 'novel', { factions: 'createSeparate' },
    )
    expect(store.factions).toHaveLength(2)
    expect(summary).toEqual({ new: 1, skipped: 0, merged: 0, replaced: 0 })
  })

  it('rolls back every write and leaves the destination project exactly as found when a write throws', () => {
    const seedCharacters = [{ id: 'd1', name: 'Mika', bio: '' }]
    const seedLocations = [{ id: 'd2', name: 'Old Port' }]
    const store = mockMergeStore({ characters: seedCharacters, locations: seedLocations })
    // Simulate a failure partway through: locations succeed, then the second
    // character write throws.
    let charWrites = 0
    const realSaveCharacter = store.saveCharacter
    store.saveCharacter = (data, id) => {
      charWrites++
      if (charWrites === 2) throw new Error('simulated failure')
      return realSaveCharacter(data, id)
    }
    const data = {
      locations: [{ name: 'New Harbor' }],
      characters: [{ name: 'New Character 1' }, { name: 'New Character 2' }],
    }
    expect(() => populateProjectIntoExisting(store, data, { locations: true, characters: true }, 'novel', {})).toThrow('simulated failure')
    // Everything this import touched — including the location write that
    // succeeded before the character write failed — must be rolled back.
    expect(store.locations).toEqual(seedLocations)
    expect(store.characters).toEqual(seedCharacters)
  })

  it('rolls back a Merge/Replace to the exact pre-import record, not just the touched fields', () => {
    const store = mockMergeStore({ characters: [{ id: 'd1', name: 'Mika', bio: '', role: 'Antagonist' }] })
    const original = { ...store.characters[0] }
    const realSaveCharacter = store.saveCharacter
    let writes = 0
    store.saveCharacter = (data, id) => {
      writes++
      // The merge write (writes === 1) is allowed to land; the second write
      // (creating "Someone New") fails outright — a real failed write never
      // partially applies, so throw before delegating, not after.
      if (writes === 2) throw new Error('simulated failure')
      return realSaveCharacter(data, id)
    }
    const data = { characters: [{ name: 'Mika', bio: 'filled in' }, { name: 'Someone New' }] }
    expect(() => populateProjectIntoExisting(store, data, { characters: true }, 'novel', { characters: 'merge' })).toThrow()
    expect(store.characters).toEqual([original])
  })
})

describe('populateYowProjectIntoExisting', () => {
  it('remaps relationships through a Skip-resolved duplicate to the existing destination record\'s id', () => {
    const store = mockMergeStore({ characters: [{ id: 'existing-mika', name: 'Mika', bio: 'Already here', parentIds: [] }] })
    const data = {
      characters: [
        { id: 'old-mika', name: 'Mika', bio: 'Imported bio (should be ignored)' },
        { id: 'old-child', name: 'Kip', parentIds: ['old-mika'] },
      ],
    }
    populateYowProjectIntoExisting(store, data, { characters: true }, { characters: 'skip' })
    // Mika (skip-resolved) must be left completely untouched...
    const mika = store.characters.find(c => c.id === 'existing-mika')
    expect(mika.bio).toBe('Already here')
    // ...but Kip's parentIds must resolve to Mika's *existing* id, not a new one.
    const kip = store.characters.find(c => c.name === 'Kip')
    expect(kip.parentIds).toEqual(['existing-mika'])
    expect(store.characters).toHaveLength(2) // no duplicate Mika created
  })

  it('a brand-new timeline event auto-links back to a Skip-resolved existing world-history entry', () => {
    const store = mockMergeStore({
      worldHistory: [{ id: 'existing-hist', title: 'The Founding', content: 'Original content' }],
    })
    const data = {
      worldHistory: [{ id: 'old-hist', title: 'The Founding', content: 'Imported content (ignored)' }],
      timeline: [{ id: 'old-event', title: 'The Founding Ceremony', worldHistoryEntryId: 'old-hist' }],
    }
    populateYowProjectIntoExisting(store, data, { worldHistory: true, timeline: true }, { worldHistory: 'skip' })
    expect(store.worldHistory).toHaveLength(1)
    expect(store.worldHistory[0].content).toBe('Original content') // untouched content
    const event = store.timeline.find(e => e.title === 'The Founding Ceremony')
    expect(event.worldHistoryEntryId).toBe('existing-hist')
    // The back-reference this creates on the history entry must roll back too.
    expect(store.worldHistory[0].timelineEventId).toBe(event.id)
  })

  it('Merge fills only empty fields on a matched map, never overwriting populated ones', () => {
    const store = mockMergeStore({ maps: [{ id: 'd1', name: 'Continent', mapType: 'region', mapPins: [{ id: 'p-old' }], notes: '' }] })
    const data = { maps: [{ id: 'old-map', name: 'Continent', mapType: 'region', mapPins: [{ id: 'p-new' }], notes: 'fresh notes' }] }
    populateYowProjectIntoExisting(store, data, { maps: true }, { maps: 'merge' })
    const merged = store.maps.find(m => m.id === 'd1')
    expect(merged.mapPins).toEqual([{ id: 'p-old' }]) // already populated — untouched
    expect(merged.notes).toBe('fresh notes')          // was empty — filled in
  })

  it('rolls back every category it touched — including comic pages/panels and eras — on a simulated failure', () => {
    const store = mockMergeStore({
      characters: [{ id: 'd1', name: 'Mika' }],
      locations: [{ id: 'd2', name: 'Old Port' }],
    })
    const charSnapshot = [...store.characters]
    const locSnapshot = [...store.locations]
    let mapCalls = 0
    const realAddMap = store.addMap
    store.addMap = (...args) => {
      mapCalls++
      if (mapCalls === 1) throw new Error('simulated failure')
      return realAddMap(...args)
    }
    const data = {
      characters: [{ id: 'old-char', name: 'New Character' }],
      locations: [{ id: 'old-loc', name: 'New Harbor' }],
      maps: [{ id: 'old-map', name: 'World Map', mapType: 'world' }],
    }
    expect(() => populateYowProjectIntoExisting(store, data, { characters: true, locations: true, maps: true }, {})).toThrow('simulated failure')
    expect(store.characters).toEqual(charSnapshot)
    expect(store.locations).toEqual(locSnapshot)
    expect(store.maps).toEqual([])
  })

  it('leaves comic pages/panels and RPG characters as always-create-separate (no resolution policy applied)', () => {
    const store = mockMergeStore({})
    const data = {
      acts: [{ id: 'old-act', title: 'Volume 1', order: 0 }],
      chapters: [{ id: 'old-chap', actId: 'old-act', title: 'Issue 1', order: 0 }],
      scenes: [],
      comicPages: [{ id: 'old-page', issueId: 'old-chap', order: 0, title: 'Page 1' }],
      rpgCharacters: [{ id: 'old-rpg', name: 'Thorn', class: 'Ranger' }],
    }
    const summary = populateYowProjectIntoExisting(store, data, { acts: true, rpgCharacters: true }, {})
    expect(store.comicPages).toHaveLength(1)
    expect(store.rpgCharacters).toHaveLength(1)
    expect(summary.new).toBeGreaterThan(0)
  })

  it('a Merge-resolved character never overwrites relationships/parentIds/factionId already populated on the destination record', () => {
    const store = mockMergeStore({
      factions: [{ id: 'existing-faction', name: 'Old Guard' }],
      characters: [{ id: 'existing-mika', name: 'Mika', bio: '', parentIds: ['existing-parent'], factionId: 'existing-faction' }],
    })
    const data = {
      factions: [{ id: 'old-faction', name: 'New Faction' }],
      characters: [
        { id: 'old-mika', name: 'Mika', bio: 'Imported bio (should fill — was blank)', parentIds: ['old-other'], factionId: 'old-faction' },
        { id: 'old-other', name: 'Someone Else' },
      ],
    }
    populateYowProjectIntoExisting(store, data, { factions: true, characters: true }, { characters: 'merge' })
    const mika = store.characters.find(c => c.id === 'existing-mika')
    // Blank field: merge fills it in.
    expect(mika.bio).toBe('Imported bio (should fill — was blank)')
    // Already-populated relationship-shaped fields: merge must leave them untouched.
    expect(mika.parentIds).toEqual(['existing-parent'])
    expect(mika.factionId).toBe('existing-faction')
  })

  it('remaps an RPG character\'s factionIds and NPC-relationship characterIds through idMap', () => {
    const store = mockMergeStore({
      factions: [{ id: 'existing-faction', name: 'Old Guard' }],
      characters: [{ id: 'existing-npc', name: 'Garrick' }],
    })
    const data = {
      factions: [{ id: 'old-faction', name: 'Old Guard' }], // name-matches → skip-resolved onto existing-faction
      characters: [{ id: 'old-npc', name: 'Garrick' }],      // name-matches → skip-resolved onto existing-npc
      rpgCharacters: [{
        id: 'old-rpg', name: 'Thorn', class: 'Ranger',
        factionIds: ['old-faction'],
        npcRelationships: [{ id: 'rel-1', characterId: 'old-npc', type: 'Ally' }],
      }],
    }
    populateYowProjectIntoExisting(store, data, { factions: true, characters: true, rpgCharacters: true }, {})
    const rpg = store.rpgCharacters.find(c => c.name === 'Thorn')
    expect(rpg.factionIds).toEqual(['existing-faction'])
    expect(rpg.npcRelationships).toEqual([{ id: 'rel-1', characterId: 'existing-npc', type: 'Ally' }])
    // No duplicate faction/character created — the skip-resolved matches were reused, not re-created.
    expect(store.factions).toHaveLength(1)
    expect(store.characters).toHaveLength(1)
  })
})

// ── Manuscript parsing (Gutenberg-style ebooks and plain manuscripts) ─────────

const gutenberg = `The Project Gutenberg eBook of Alice's Adventures in Wonderland

Title: Alice's Adventures in Wonderland
Author: Lewis Carroll

*** START OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***

Alice's Adventures in Wonderland

by Lewis Carroll

Contents

 CHAPTER I.     Down the Rabbit-Hole
 CHAPTER II.    The Pool of Tears
 CHAPTER III.   A Caucus-Race and a Long Tale



CHAPTER I.
Down the Rabbit-Hole


Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading.

CHAPTER II.
The Pool of Tears


"Curiouser and curiouser!" cried Alice; she was so much surprised that for the moment she quite forgot how to speak good English.

CHAPTER III.
A Caucus-Race and a Long Tale


They were indeed a queer-looking party that assembled on the bank — the birds with draggled feathers, the animals with their fur clinging close to them.

THE END

*** END OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***

Updated editions will replace the previous one — the old editions will be renamed. Creating the works from print editions not protected by U.S. copyright law means that no one owns a United States copyright in these works.
`

describe('parseManuscriptSections', () => {
  it('parses a Gutenberg ebook into correctly titled chapters with no boilerplate', () => {
    const sections = parseManuscriptSections(gutenberg)
    expect(sections.map(s => s.title)).toEqual([
      'CHAPTER I. Down the Rabbit-Hole',
      'CHAPTER II. The Pool of Tears',
      'CHAPTER III. A Caucus-Race and a Long Tale',
    ])
    expect(sections[0].content).toMatch(/^Alice was beginning/)
    // License text and TOC must not leak into any chapter
    const all = sections.map(s => s.content).join('\n')
    expect(all).not.toMatch(/Project Gutenberg/i)
    expect(all).not.toMatch(/CHAPTER II\.\s+The Pool/) // TOC line
  })

  it('merges a title line following a bare heading, but not prose', () => {
    const text = `Chapter 1\nThe Beginning\n\n${'Once upon a time there was a kingdom by the sea. '.repeat(5)}\n\nChapter 2\nIt was raining hard that night and the road to the castle\nwas washed out entirely, so the riders turned back.\n\nMore prose here to pad the section out past the minimum length for a section.`
    const sections = parseManuscriptSections(text)
    expect(sections[0].title).toBe('Chapter 1 The Beginning')
    // Chapter 2's next line is wrapped prose (line after it is not blank) — no merge
    expect(sections[1].title).toBe('Chapter 2')
    expect(sections[1].content).toMatch(/^It was raining/)
  })

  it('does not treat an inline-subtitled heading as bare', () => {
    const text = `Chapter 1: The Fall\n\n${'Words of the first chapter go here to pass length checks. '.repeat(3)}\n\nChapter 2: The Rise\n\n${'Words of the second chapter go here to pass length checks. '.repeat(3)}`
    const sections = parseManuscriptSections(text)
    expect(sections.map(s => s.title)).toEqual(['Chapter 1: The Fall', 'Chapter 2: The Rise'])
  })

  it('keeps a "Contents" line that is not followed by a TOC listing', () => {
    const text = `Some preamble text here.\n\nContents\n\nShe opened the box and examined the contents carefully, one item at a time, laying each on the table.`
    expect(stripFrontBackMatter(text)).toContain('Contents')
  })

  it('tolerates a blank line between a bare heading and its subtitle', () => {
    // Some books put a blank line between "CHAPTER SIX" and its subtitle
    // rather than stacking them on consecutive lines.
    const text = `Chapter One\n\nThe Journey Begins\n\n${'Once the travelers set out, nothing was ever quite the same again. '.repeat(4)}`
    const sections = parseManuscriptSections(text)
    expect(sections[0].title).toBe('Chapter One The Journey Begins')
  })
})

describe('buildUserMessage', () => {
  it('sends small files whole', () => {
    const msg = buildUserMessage([{ name: 'a.txt', content: 'Short story text.' }], [])
    expect(msg).toContain('=== a.txt ===')
    expect(msg).toContain('Short story text.')
  })

  it('sends the full manuscript untouched when under the cap, even if long', () => {
    // A book-length manuscript (e.g. Alice in Wonderland, ~145K chars) should
    // go through whole — sampling is a last resort, not the common path.
    const sections = Array.from({ length: 12 }, (_, i) => ({
      title: `Chapter ${i + 1}`,
      content: `UNIQUE_MARKER_${i + 1}_START ` + 'lorem ipsum '.repeat(1000) + ` UNIQUE_MARKER_${i + 1}_END`,
    }))
    const files = [{ name: 'book.txt', content: sections.map(s => `${s.title}\n${s.content}`).join('\n\n') }]
    const msg = buildUserMessage(files, sections)
    expect(msg).toContain('Analyze these writing files')
    expect(msg).toContain('UNIQUE_MARKER_1_START')
    expect(msg).toContain('UNIQUE_MARKER_12_END')
  })

  it('samples the start, middle, and end of every chapter when content exceeds the cap', () => {
    const sections = Array.from({ length: 40 }, (_, i) => ({
      title: `Chapter ${i + 1}`,
      content: `MARKER_${i + 1}_START ` + 'lorem ipsum '.repeat(2000) + ` MARKER_${i + 1}_MID ` + 'lorem ipsum '.repeat(2000) + ` MARKER_${i + 1}_END`,
    }))
    const files = [{ name: 'book.txt', content: sections.map(s => `${s.title}\n${s.content}`).join('\n\n') }]
    const msg = buildUserMessage(files, sections)
    expect(msg.length).toBeLessThan(310000)
    // Truncating at the head would lose late chapters entirely, and a
    // head-only excerpt per chapter would lose each chapter's ending.
    expect(msg).toContain('MARKER_1_START')
    expect(msg).toContain('MARKER_39_START')
    expect(msg).toContain('=== Chapter 40 ===')
  })
})

describe('isPromptTooLargeError', () => {
  it('recognizes the OpenRouter free-tier prompt token cap message', () => {
    expect(isPromptTooLargeError('Prompt tokens limit exceeded: 47195 > 29866. To increase, visit https://openrouter.ai/settings/credits and upgrade to a paid account')).toBe(true)
  })

  it('recognizes generic "maximum context length" style messages', () => {
    expect(isPromptTooLargeError("This model's maximum context length is 16385 tokens")).toBe(true)
    expect(isPromptTooLargeError('input is too long for requested model')).toBe(true)
  })

  it('does not misclassify unrelated errors', () => {
    expect(isPromptTooLargeError('Invalid API key')).toBe(false)
    expect(isPromptTooLargeError('The AI provider is rate-limiting requests')).toBe(false)
    expect(isPromptTooLargeError('')).toBe(false)
    expect(isPromptTooLargeError(undefined)).toBe(false)
  })
})

describe('buildUserMessage with a reduced cap (retry ladder)', () => {
  it('fits a manuscript that overflowed the largest cap into a much smaller one', () => {
    const sections = Array.from({ length: 12 }, (_, i) => ({
      title: `Chapter ${i + 1}`,
      content: `MARKER_${i + 1} ` + 'lorem ipsum '.repeat(1500),
    }))
    const files = [{ name: 'book.txt', content: sections.map(s => `${s.title}\n${s.content}`).join('\n\n') }]
    const smallCap = CONTENT_CHAR_CAPS[CONTENT_CHAR_CAPS.length - 1]
    const msg = buildUserMessage(files, sections, smallCap)
    expect(msg.length).toBeLessThan(smallCap + 5000) // small formatting overhead is fine
    expect(msg).toContain('=== Chapter 12 ===')
    expect(msg).toContain('MARKER_1')
  })
})

describe('countLabel', () => {
  it('pluralizes already-plural keys correctly instead of double-appending "s"', () => {
    expect(countLabel({ characters: Array(34).fill({}) }, 'characters')).toBe('34 characters')
    expect(countLabel({ characters: [{}] }, 'characters')).toBe('1 character')
    expect(countLabel({ locations: Array(9).fill({}) }, 'locations')).toBe('9 locations')
    expect(countLabel({ locations: [{}] }, 'locations')).toBe('1 location')
    expect(countLabel({ factions: Array(5).fill({}) }, 'factions')).toBe('5 factions')
    expect(countLabel({ factions: [{}] }, 'factions')).toBe('1 faction')
  })

  it('gives worldHistory an irregular plural instead of "world historys"', () => {
    expect(countLabel({ worldHistory: Array(2).fill({}) }, 'worldHistory')).toBe('2 world history entries')
    expect(countLabel({ worldHistory: [{}] }, 'worldHistory')).toBe('1 world history entry')
  })

  it('pluralizes timeline as "timeline events"', () => {
    expect(countLabel({ timeline: Array(2).fill({}) }, 'timeline')).toBe('2 timeline events')
    expect(countLabel({ timeline: [{}] }, 'timeline')).toBe('1 timeline event')
  })

  it('keeps lore as "entries"/"entry"', () => {
    expect(countLabel({ lore: Array(7).fill({}) }, 'lore')).toBe('7 entries')
    expect(countLabel({ lore: [{}] }, 'lore')).toBe('1 entry')
  })
})

describe('parseManuscriptSections — decorative headings and false-positive guarding', () => {
  it('recognizes headings wrapped in decorative dashes (e.g. "— CHAPTER ONE —")', () => {
    const text = [
      '— CHAPTER ONE —', '', 'The Boy Who Lived', '',
      `${'Mr and Mrs Dursley were perfectly normal, thank you very much. '.repeat(4)}`,
      '', '— CHAPTER TWO —', '', 'The Vanishing Glass', '',
      `${'Nearly ten years had passed since the Dursleys had found their nephew. '.repeat(4)}`,
    ].join('\n')
    const sections = parseManuscriptSections(text)
    expect(sections.map(s => s.title)).toEqual(['CHAPTER ONE The Boy Who Lived', 'CHAPTER TWO The Vanishing Glass'])
  })

  it('does not split on an in-story ALL-CAPS letterhead once real chapter markers are established', () => {
    // Mirrors a real book: explicit "— CHAPTER N —" markers throughout, plus
    // an in-fiction letter with an ALL-CAPS letterhead and a numbered list —
    // neither should be mistaken for a chapter break once real markers exist.
    const para = (s) => s.repeat(4)
    const text = [
      '— CHAPTER ONE —', '', 'The Boy Who Lived', '', para('First chapter prose goes here. '),
      '', '— CHAPTER TWO —', '', 'The Vanishing Glass', '', para('Second chapter prose goes here. '),
      '', 'He read the letter:', '',
      'HOGWARTS SCHOOL OF WITCHCRAFT AND WIZARDRY', '',
      'Headmaster: Albus Dumbledore', '',
      '1. Three sets of plain work robes', '',
      para('The rest of the second chapter continues here after the letter. '),
      '', '— CHAPTER THREE —', '', 'The Letters from No One', '', para('Third chapter prose goes here. '),
    ].join('\n')
    const sections = parseManuscriptSections(text)
    expect(sections.map(s => s.title)).toEqual([
      'CHAPTER ONE The Boy Who Lived',
      'CHAPTER TWO The Vanishing Glass',
      'CHAPTER THREE The Letters from No One',
    ])
    // The letterhead and list item should still be present as ordinary body text
    expect(sections[1].content).toContain('HOGWARTS SCHOOL OF WITCHCRAFT AND WIZARDRY')
    expect(sections[1].content).toContain('Three sets of plain work robes')
  })

  it('still uses the ALL-CAPS fallback when a document has no explicit chapter markers at all', () => {
    const para = (s) => s.repeat(6)
    const text = [
      'THE FIRST BETRAYAL', '', para('Opening section prose goes here. '),
      '', 'THE LONG ROAD HOME', '', para('Second section prose goes here. '),
    ].join('\n')
    const sections = parseManuscriptSections(text)
    expect(sections.map(s => s.title)).toEqual(['THE FIRST BETRAYAL', 'THE LONG ROAD HOME'])
  })
})
