import { describe, expect, it } from 'vitest'
import {
  getSceneLinks, addLinkPatch, removeLinkPatch, dismissSuggestionPatch, setPovPatch, suggestSceneLinks,
  countSuggestions, sceneStoryYear, parseStoryYearInput, scenesWithoutLinks, remapSceneLinks,
} from './sceneLinks'

const characters = [{ id: 'c1', name: 'Mira Ashford' }, { id: 'c2', name: 'Tomas' }, { id: 'c3', name: 'Ash' }]
const locations = [{ id: 'l1', name: 'Red Tower' }]
const timeline = [{ id: 't1', title: 'The Fall of Northwatch', startYear: 40 }, { id: 't2', title: 'Coronation Day', startYear: 10 }]
const data = { characters, locations, timeline }

describe('getSceneLinks', () => {
  it('normalises missing and malformed fields', () => {
    const l = getSceneLinks({ characterIds: 'x', locationIds: [1, 'a', ''], storyYear: 'soon', timeShift: 'sideways' })
    expect(l.characterIds).toEqual([])
    expect(l.locationIds).toEqual(['a'])
    expect(l.storyYear).toBeNull()
    expect(l.timeShift).toBeNull()
    expect(getSceneLinks(null).povCharacterId).toBeNull()
  })
})

describe('patches', () => {
  it('adds once, and un-dismisses a suggestion when it is accepted', () => {
    const scene = { characterIds: ['c1'], dismissedLinks: ['character:c2'] }
    expect(addLinkPatch(scene, 'character', 'c1')).toEqual({})
    expect(addLinkPatch(scene, 'character', 'c2')).toEqual({ characterIds: ['c1', 'c2'], dismissedLinks: [] })
    expect(addLinkPatch(scene, 'bogus', 'x')).toEqual({})
  })
  it('removing a character also clears them as POV', () => {
    expect(removeLinkPatch({ characterIds: ['c1', 'c2'], povCharacterId: 'c1' }, 'character', 'c1')).toEqual({ characterIds: ['c2'], povCharacterId: null })
    expect(removeLinkPatch({ locationIds: ['l1'] }, 'location', 'l1')).toEqual({ locationIds: [] })
  })
  it('setting POV also links the character', () => {
    expect(setPovPatch({ characterIds: [] }, 'c1')).toEqual({ povCharacterId: 'c1', characterIds: ['c1'] })
    expect(setPovPatch({ characterIds: ['c1'] }, '')).toEqual({ povCharacterId: null })
  })
  it('dismissing is remembered once', () => {
    expect(dismissSuggestionPatch({}, 'character', 'c2')).toEqual({ dismissedLinks: ['character:c2'] })
    expect(dismissSuggestionPatch({ dismissedLinks: ['character:c2'] }, 'character', 'c2')).toEqual({})
  })
})

describe('suggestSceneLinks', () => {
  const scene = { id: 's', title: 'Gate', content: 'Mira Ashford met Tomas at the Red Tower. Ashford was crowded. The Fall of Northwatch loomed.' }
  it('suggests whole-word name matches only, and not what is already linked', () => {
    const s = suggestSceneLinks(scene, data)
    expect(s.characters.map(c => c.id).sort()).toEqual(['c1', 'c2'])
    expect(s.locations.map(l => l.id)).toEqual(['l1'])
    expect(s.events.map(e => e.id)).toEqual(['t1'])
    const linked = suggestSceneLinks({ ...scene, characterIds: ['c1'] }, data)
    expect(linked.characters.map(c => c.id)).toEqual(['c2'])
  })
  it('does not suggest "Ash" for "Ashford"', () => {
    expect(suggestSceneLinks({ content: 'Ashford only.' }, data).characters).toEqual([])
  })
  it('does not re-suggest a dismissed link', () => {
    const s = suggestSceneLinks({ ...scene, dismissedLinks: ['character:c2'] }, data)
    expect(s.characters.map(c => c.id)).toEqual(['c1'])
  })
  it('turns the legacy POV and location strings into suggestions', () => {
    const s = suggestSceneLinks({ content: '', pov: ' tomas ', locationTag: 'red tower' }, data)
    expect(s.pov).toMatchObject({ id: 'c2' })
    expect(s.locations[0]).toMatchObject({ id: 'l1', reason: 'Matches the location text' })
    expect(countSuggestions(s)).toBe(2)
    expect(suggestSceneLinks({ content: '', pov: 'Nobody' }, data).pov).toBeNull()
  })
  it('handles an empty scene and missing data', () => {
    expect(countSuggestions(suggestSceneLinks({}, {}))).toBe(0)
    expect(countSuggestions(suggestSceneLinks(null))).toBe(0)
  })
})

describe('sceneStoryYear', () => {
  const byId = new Map(timeline.map(e => [e.id, e]))
  it('prefers the writer\'s own year, then the linked events\' year when they agree, else null', () => {
    expect(sceneStoryYear({ storyYear: 5, timelineEventIds: ['t1'] }, byId)).toBe(5)
    expect(sceneStoryYear({ timelineEventIds: ['t2'] }, byId)).toBe(10)
    expect(sceneStoryYear({ timelineEventIds: ['t1', 't2'] }, byId)).toBeNull() // events span years: never guess
    expect(sceneStoryYear({ timelineEventIds: ['missing'] }, byId)).toBeNull()
    expect(sceneStoryYear({}, byId)).toBeNull()
  })
  it('zero is a real year', () => {
    expect(sceneStoryYear({ storyYear: 0 }, byId)).toBe(0)
  })
})

describe('parseStoryYearInput', () => {
  it('accepts years, BC and blanks; rejects nonsense', () => {
    expect(parseStoryYearInput('')).toEqual({ ok: true, value: null })
    expect(parseStoryYearInput('Year 40')).toEqual({ ok: true, value: 40 })
    expect(parseStoryYearInput('300 BC')).toEqual({ ok: true, value: -300 })
    expect(parseStoryYearInput('long ago')).toEqual({ ok: false, value: null })
  })
})

describe('scenesWithoutLinks', () => {
  it('clears deleted ids and POV, returning only changed scenes', () => {
    const scenes = [
      { id: 'a', characterIds: ['c1', 'c2'], povCharacterId: 'c1', locationIds: ['l1'] },
      { id: 'b', characterIds: ['c2'] },
      { id: 'c', timelineEventIds: ['t1', 't2'] },
    ]
    const changed = scenesWithoutLinks(scenes, { characterIds: ['c1'], timelineEventIds: ['t2'] })
    expect(changed).toEqual([
      { id: 'a', patch: { characterIds: ['c2'], povCharacterId: null } },
      { id: 'c', patch: { timelineEventIds: ['t1'] } },
    ])
    expect(scenesWithoutLinks(scenes, {})).toEqual([])
    expect(scenesWithoutLinks(null, { characterIds: ['x'] })).toEqual([])
  })
})

describe('remapSceneLinks', () => {
  it('points links at the new records and drops ones that were not imported', () => {
    const map = { c1: 'N1', l1: 'M1' }
    expect(remapSceneLinks({ characterIds: ['c1', 'c2'], locationIds: ['l1'], timelineEventIds: ['t9'], povCharacterId: 'c1' }, map))
      .toEqual({ characterIds: ['N1'], locationIds: ['M1'], timelineEventIds: [], povCharacterId: 'N1' })
    expect(remapSceneLinks({ povCharacterId: 'c2' }, map)).toEqual({ povCharacterId: null })
  })
  it('returns nothing for a scene without links or without a map', () => {
    expect(remapSceneLinks({ title: 'x' }, { a: 'b' })).toEqual({})
    expect(remapSceneLinks(null, null)).toEqual({})
    expect(remapSceneLinks({ characterIds: ['c1'] }, undefined)).toEqual({ characterIds: [] })
  })
})

describe('lore, faction and history links (C1d)', () => {
  const lore = [{ id: 'k1', title: 'The Long Winter', aliases: ['the Cold Years'] }]
  const factions = [{ id: 'f1', name: 'The Wardens', aliases: ['the Watch'] }]
  const history = [{ id: 'h1', title: 'Founding of Ashport' }]

  it('reads the new fields, defaulting to empty', () => {
    expect(getSceneLinks({}).loreIds).toEqual([])
    expect(getSceneLinks({ loreIds: ['k1', 7], factionIds: ['f1'], historyEntryIds: ['h1'] })).toMatchObject({ loreIds: ['k1'], factionIds: ['f1'], historyEntryIds: ['h1'] })
  })
  it('adds and removes links for the new types, and clears a matching dismissal on add', () => {
    expect(addLinkPatch({}, 'lore', 'k1')).toEqual({ loreIds: ['k1'] })
    expect(addLinkPatch({ factionIds: ['f1'] }, 'faction', 'f1')).toEqual({})
    expect(addLinkPatch({ dismissedLinks: ['history:h1'] }, 'history', 'h1')).toEqual({ historyEntryIds: ['h1'], dismissedLinks: [] })
    expect(removeLinkPatch({ loreIds: ['k1', 'k2'] }, 'lore', 'k1')).toEqual({ loreIds: ['k2'] })
  })
  it('suggests them from names and other names in the text, but not once linked or dismissed', () => {
    const scene = { content: '<p>During the Cold Years the Watch held the pass after the Founding of Ashport.</p>' }
    const found = suggestSceneLinks(scene, { lore, factions, history })
    expect(found.lore.map(i => i.id)).toEqual(['k1'])
    expect(found.factions.map(i => i.id)).toEqual(['f1'])
    expect(found.history.map(i => i.id)).toEqual(['h1'])
    expect(countSuggestions(found)).toBe(3)
    const quiet = suggestSceneLinks({ ...scene, loreIds: ['k1'], dismissedLinks: ['faction:f1'] }, { lore, factions, history })
    expect(quiet.lore).toEqual([])
    expect(quiet.factions).toEqual([])
  })
  it('gives no suggestions of these types when their lists are not passed', () => {
    const found = suggestSceneLinks({ content: 'The Wardens and the Long Winter' }, {})
    expect(found.lore).toEqual([])
    expect(found.factions).toEqual([])
    expect(countSuggestions(found)).toBe(0)
  })
  it('remaps them on import and drops links to records that were not imported', () => {
    expect(remapSceneLinks({ loreIds: ['a', 'x'], factionIds: ['b'], historyEntryIds: ['c'] }, { a: 'A', b: 'B' }))
      .toEqual({ loreIds: ['A'], factionIds: ['B'], historyEntryIds: [] })
  })
  it('removes deleted records from every scene and reports only the scenes that changed', () => {
    const scenes = [{ id: 's1', loreIds: ['k1', 'k2'] }, { id: 's2', factionIds: ['f1'] }, { id: 's3', loreIds: ['k2'] }]
    expect(scenesWithoutLinks(scenes, { loreIds: ['k1'], factionIds: ['f1'] })).toEqual([
      { id: 's1', patch: { loreIds: ['k2'] } },
      { id: 's2', patch: { factionIds: [] } },
    ])
  })
})
