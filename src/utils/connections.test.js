import { describe, expect, it } from 'vitest'
import { getConnections } from './connections'

const store = {
  characters: [
    { id: 'a', name: 'Iyra', parentIds: [], childIds: ['b'], spouseIds: ['ghost'], factionId: 'f1', locationIds: ['l1'], loreIds: ['g1'], relationships: [{ targetId: 'c', type: 'Rival' }] },
    { id: 'b', name: 'Sera', parentIds: ['a'] },
    { id: 'c', name: 'Ash', relationships: [{ targetId: 'a' }], keywords: ['the Ember'] },
  ],
  locations: [{ id: 'l1', name: 'Red Tower', characterIds: ['b'] }],
  loreEntries: [{ id: 'g1', title: 'The Ember Rite', characterIds: ['a'], loreIds: ['g2'] }, { id: 'g2', title: 'Old Oaths' }],
  timeline: [{ id: 't1', title: 'Fall of the Tower', linkedCharacters: ['a', 'zombie'], linkedLocations: ['l1'] }],
  worldHistory: [{ id: 'h1', title: 'Fall (history)', timelineId: 't1' }],
  factions: [{ id: 'f1', name: 'Wardens', leaderId: 'a', enemyFactionIds: ['f2'] }, { id: 'f2', name: 'Raiders', enemyFactionIds: ['f1'] }],
  storySchedule: [{ id: 'e1', title: 'Council', linkedCharacters: ['a'] }],
  chapters: [{ id: 'ch1', title: 'Arrival', povCharacterId: 'a' }],
  scenes: [
    { id: 's1', title: 'Gate', content: 'Iyra waited at the gate.' },
    { id: 's2', title: 'Market', content: 'Ashford was crowded; nobody named Ash was there? Ash!' },
    { id: 's3', title: 'Quiet', content: 'Nobody here.' },
  ],
}
const names = (result, group) => result.groups.find(g => g.name === group)?.items.map(i => i.title) || []

describe('mention matching', () => {
  const only = content => ({ characters: [{ id: 'c', name: 'Ash' }], scenes: [{ id: 's', title: 'S', content }] })
  const hits = content => getConnections(only(content), { type: 'character', id: 'c' }).groups.length
  it('matches at the start, after punctuation and before punctuation, but not inside another word', () => {
    expect(hits('Ash arrived.')).toBe(1)
    expect(hits('"Ash," she said')).toBe(1)
    expect(hits('met (ash) there')).toBe(1)
    expect(hits('Ashford and Trash')).toBe(0)
  })
  it('does not rely on regex lookbehind (unsupported by older iOS Safari)', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(new URL('./connections.js', import.meta.url), 'utf8')).not.toMatch(/\(\?<[=!]/)
  })
})

describe('getConnections', () => {
  it('collects a character\'s family, relationships, faction, places, lore, events and POV chapters', () => {
    const r = getConnections(store, { type: 'character', id: 'a' })
    expect(names(r, 'Family')).toEqual(expect.arrayContaining(['Sera']))
    expect(names(r, 'Relationships')).toEqual(expect.arrayContaining(['Ash']))
    expect(names(r, 'Faction')).toEqual(['Wardens'])
    expect(names(r, 'Locations')).toEqual(['Red Tower'])
    expect(names(r, 'Lore')).toEqual(['The Ember Rite'])
    expect(names(r, 'Timeline')).toEqual(['Fall of the Tower'])
    expect(names(r, 'Schedule')).toEqual(['Council'])
    expect(names(r, 'Chapters')).toEqual(['Arrival'])
  })

  it('lists links to deleted records as placeholders and counts them', () => {
    const r = getConnections(store, { type: 'character', id: 'a' })
    expect(r.missing).toBe(1) // the deleted spouse; the event's dead character link is counted on the event
    const family = r.groups.find(g => g.name === 'Family').items
    expect(family.some(i => i.missing && i.title === 'Deleted character')).toBe(true)
  })

  it('finds scenes that mention a name as a whole word only', () => {
    const iyra = getConnections(store, { type: 'character', id: 'a' })
    expect(names(iyra, 'Scenes that mention it')).toEqual(['Gate'])
    const ash = getConnections(store, { type: 'character', id: 'c' })
    expect(names(ash, 'Scenes that mention it')).toEqual(['Market']) // "Ash" and "Ash!" match, "Ashford" alone would not
    const onlyAshford = { ...store, scenes: [{ id: 'x', title: 'X', content: 'Ashford only.' }] }
    expect(names(getConnections(onlyAshford, { type: 'character', id: 'c' }), 'Scenes that mention it')).toEqual([])
  })

  it('works from the other side: locations, lore, events and factions', () => {
    expect(names(getConnections(store, { type: 'location', id: 'l1' }), 'Characters')).toEqual(expect.arrayContaining(['Sera', 'Iyra']))
    expect(names(getConnections(store, { type: 'lore', id: 'g2' }), 'Lore')).toEqual(['The Ember Rite'])
    const event = getConnections(store, { type: 'timeline', id: 't1' })
    expect(names(event, 'History')).toEqual(['Fall (history)'])
    expect(event.missing).toBe(1)
    const faction = getConnections(store, { type: 'faction', id: 'f1' })
    expect(names(faction, 'Characters')).toEqual(['Iyra'])
    expect(names(faction, 'Faction')).toEqual(['Raiders'])
  })

  it('returns an empty result for an unknown record or bad input', () => {
    expect(getConnections(store, { type: 'character', id: 'nope' }).total).toBe(0)
    expect(getConnections(null, { type: 'character', id: 'a' }).total).toBe(0)
    expect(getConnections({}, { type: 'location', id: 'l1' }).groups).toEqual([])
  })
})
