import { describe, expect, it } from 'vitest'
import { buildEntityIndex, clashesForTexts, collisionsForRecord, recordAliases, parseAliasText } from './entityResolver'

// The map the editor built before this module existed, kept here as the behaviour to preserve.
const legacyMap = ({ characters = [], locations = [], loreEntries = [], worldHistory = [], timeline = [] }) => {
  const map = {}
  const put = (name, entity) => { if (name?.trim().length >= 2) map[name.trim().toLowerCase()] = entity }
  characters.forEach(c => {
    const entity = { id: c.id, section: 'characters', sectionLabel: 'Character', name: c.name, preview: c.summary || c.description || c.notes || c.role || '' }
    put(c.name, entity); (c.keywords || []).forEach(kw => put(kw, entity))
  })
  locations.forEach(l => put(l.name, { id: l.id, section: 'locations', sectionLabel: 'Location', name: l.name, preview: l.description || l.notes || l.summary || '' }))
  loreEntries.forEach(e => put(e.title, { id: e.id, section: 'lore', sectionLabel: 'Lore', name: e.title, preview: e.content || e.summary || e.category || '' }))
  ;[...worldHistory, ...timeline].forEach(e => put(e.title, { id: e.id, section: 'worldhistory', sectionLabel: 'History', name: e.title, preview: e.content || e.summary || e.dateRange || e.era || '' }))
  return map
}

const data = {
  characters: [
    { id: 'c1', name: 'Mira Vale', keywords: ['Mira', 'the Wolf'], summary: 'A scout' },
    { id: 'c2', name: 'Tomas', role: 'Smith' },
  ],
  locations: [{ id: 'l1', name: 'Ashport', description: 'A harbour town' }],
  loreEntries: [{ id: 'k1', title: 'The Long Winter', content: 'It lasted nine years' }],
  worldHistory: [{ id: 'h1', title: 'Founding of Ashport', dateRange: 'Year 1' }],
  timeline: [{ id: 't1', title: 'The Siege', era: 'Third' }],
}

describe('buildEntityIndex', () => {
  it('reproduces the editor\'s previous map exactly when there are no aliases', () => {
    expect(buildEntityIndex(data).map).toEqual(legacyMap(data))
  })

  it('later records win a shared key, as before, and the clash is reported', () => {
    const clash = { ...data, locations: [{ id: 'l1', name: 'Mira' }] } // same text as a character keyword
    const { map, collisions } = buildEntityIndex(clash)
    expect(map.mira.section).toBe('locations')
    expect(map).toEqual(legacyMap(clash))
    expect(collisions).toHaveLength(1)
    expect(collisions[0].entities.map(e => e.id)).toEqual(['c1', 'l1'])
  })

  it('supports aliases on every record type', () => {
    const { map } = buildEntityIndex({
      characters: [{ id: 'c1', name: 'Mira', aliases: ['Lady M'] }],
      locations: [{ id: 'l1', name: 'Ashport', aliases: ['the Harbour'] }],
      loreEntries: [{ id: 'k1', title: 'Winter', aliases: ['the Long Night'] }],
      worldHistory: [{ id: 'h1', title: 'Founding', aliases: ['Day One'] }],
    })
    expect(map['lady m'].id).toBe('c1')
    expect(map['the harbour'].id).toBe('l1')
    expect(map['the long night'].id).toBe('k1')
    expect(map['day one'].id).toBe('h1')
  })

  it('indexes factions, with aliases, only when they are passed', () => {
    expect(buildEntityIndex(data).map).toEqual(legacyMap(data))
    const { map } = buildEntityIndex({ ...data, factions: [{ id: 'f1', name: 'The Wardens', aliases: ['the Watch'], description: 'Border guard' }] })
    expect(map['the wardens']).toEqual({ id: 'f1', section: 'factions', sectionLabel: 'Faction', name: 'The Wardens', preview: 'Border guard' })
    expect(map['the watch'].id).toBe('f1')
  })

  it('does not report a record repeating its own name or the same alias twice', () => {
    const { collisions } = buildEntityIndex({ characters: [{ id: 'c1', name: 'Mira', aliases: ['mira', 'Mira', 'Mi'], keywords: ['Mi'] }] })
    expect(collisions).toEqual([])
  })

  it('treats a character and a location with the same id as different records', () => {
    const { collisions } = buildEntityIndex({ characters: [{ id: 'x', name: 'Ash' }], locations: [{ id: 'x', name: 'Ash' }] })
    expect(collisions).toHaveLength(1)
  })

  it('ignores too-short, blank and non-string entries and tolerates missing lists', () => {
    const { map } = buildEntityIndex({ characters: [{ id: 'c1', name: 'A', aliases: ['', ' ', 'B', 7, null, 'Okay'] }] })
    expect(Object.keys(map)).toEqual(['okay'])
    expect(buildEntityIndex().map).toEqual({})
  })
})

describe('collisionsForRecord', () => {
  it('lists the other records that share each text', () => {
    const index = buildEntityIndex({ characters: [{ id: 'c1', name: 'Ash' }], locations: [{ id: 'l1', name: 'Ash' }, { id: 'l2', name: 'Fen' }] })
    expect(collisionsForRecord(index, 'characters', 'c1')).toEqual([{ text: 'Ash', others: [expect.objectContaining({ id: 'l1' })] }])
    expect(collisionsForRecord(index, 'locations', 'l2')).toEqual([])
    expect(collisionsForRecord(undefined, 'locations', 'l2')).toEqual([])
  })
})

describe('recordAliases and parseAliasText', () => {
  it('drops the record\'s own name, duplicates and over-long entries, and caps the list', () => {
    expect(recordAliases({ name: 'Mira', aliases: ['mira', 'Lady M', 'lady m', 'x'.repeat(200)] })).toEqual(['Lady M'])
    expect(recordAliases({ name: 'N', aliases: Array.from({ length: 50 }, (_, i) => `alias ${i}`) })).toHaveLength(20)
  })
  it('splits free text on commas, semicolons and new lines', () => {
    expect(parseAliasText('Lady M, the Wolf;  \nMi\nMira', 'Mira')).toEqual(['Lady M', 'the Wolf', 'Mi'])
  })
})

describe('clashesForTexts', () => {
  const project = {
    characters: [{ id: 'c1', name: 'Mira Vale', aliases: ['Lady M'] }, { id: 'c2', name: 'Tomas' }],
    locations: [{ id: 'l1', name: 'Ashport', aliases: ['the Harbour'] }],
    factions: [{ id: 'f1', name: 'The Wardens' }],
  }
  it('reports texts already used by another record, by name or by alias', () => {
    const result = clashesForTexts(project, { list: 'characters', id: 'c2' }, ['Ashport', 'the harbour', 'Fresh name', 'Lady M'])
    expect(result.map(r => r.text)).toEqual(['Ashport', 'the harbour', 'Lady M'])
    expect(result[0].others[0]).toEqual(expect.objectContaining({ id: 'l1', sectionLabel: 'Location' }))
  })
  it('never reports the record being edited against itself, but does for a new record', () => {
    expect(clashesForTexts(project, { list: 'characters', id: 'c1' }, ['Mira Vale', 'Lady M'])).toEqual([])
    expect(clashesForTexts(project, { list: 'characters' }, ['Mira Vale'])).toHaveLength(1)
  })
  it('includes factions, ignores short and repeated texts, and tolerates missing data', () => {
    expect(clashesForTexts(project, { list: 'locations', id: 'l1' }, ['the wardens', 'the wardens', 'x', ''])).toHaveLength(1)
    expect(clashesForTexts(undefined, undefined, ['Mira'])).toEqual([])
  })
})

describe('linked history entries and timeline events', () => {
  const data = {
    worldHistory: [{ id: 'h1', title: 'The Siege', aliases: ['Siege of Ash'], timelineEventId: 't1' }],
    timeline: [{ id: 't1', title: 'The Siege', aliases: ['Siege of Ash'], worldHistoryEntryId: 'h1' }, { id: 't2', title: 'The Siege' }],
  }
  it('treats a linked pair as one record, but still reports a different record with the same name', () => {
    const { collisions } = buildEntityIndex(data)
    expect(collisions).toHaveLength(1)
    expect(collisions[0].text).toBe('The Siege')
    expect(collisions[0].entities.map(e => e.id).sort()).toEqual(['h1', 't2'].sort())
  })
  it('does not warn a linked pair about each other when editing either side', () => {
    const own = { worldHistory: data.worldHistory, timeline: [data.timeline[0]] }
    expect(clashesForTexts(own, { list: 'worldHistory', id: 'h1', alsoIds: ['t1'] }, ['The Siege', 'Siege of Ash'])).toEqual([])
    expect(clashesForTexts(own, { list: 'timeline', id: 't1', alsoIds: ['h1'] }, ['The Siege'])).toEqual([])
  })
})
