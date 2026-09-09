import { describe, expect, it } from 'vitest'
import { buildLoreIndex, buildLoreTagIndex, createLoreReferenceIndex, groupLoreEntries, loreReferenceRows, normalizeLoreEntry, normalizeLoreTags, relatedLoreFor } from './loreEntries'

describe('Lore normalization and grouping', () => {
  it('normalizes malformed/legacy display fields without mutating raw records', () => {
    const source = { id: 'self', title: 0, category: 9, content: 123, tags: [' #Magic ', 'magic', 0, null], characterIds: ['c', 'c', null], locationIds: 'bad', loreIds: ['self', 'other', 'other'] }
    const before = JSON.stringify(source)
    expect(normalizeLoreEntry(source)).toMatchObject({ title: '0', category: '9', content: '123', tags: ['Magic', '0'], characterIds: ['c'], locationIds: [], loreIds: ['other'] })
    expect(JSON.stringify(source)).toBe(before)
    expect(normalizeLoreTags('not-an-array')).toEqual([])
  })

  it('safely groups prototype-key and All categories and filters numeric content', () => {
    const { entries } = buildLoreIndex(['__proto__', 'constructor', 'toString', 'All', ''].map((category, index) => ({ id: `${index}`, title: index, category, content: index })))
    expect(groupLoreEntries(entries)).toHaveLength(5)
    expect(groupLoreEntries(entries, { category: 'All' })[0][1][0].id).toBe('3')
    expect(groupLoreEntries(entries, { search: ' 0 ' })[0][1][0].id).toBe('0')
  })

  it('keeps category and title ordering deterministic in every mode without mutating source order', () => {
    const { entries } = buildLoreIndex([{ id: 'b', title: 'Beta', category: 'Z' }, { id: 'a', title: 'Alpha', category: 'Z' }, { id: 'c', title: 'Other', category: 'A' }])
    expect(groupLoreEntries(entries).map(([category]) => category)).toEqual(['A', 'Z'])
    expect(groupLoreEntries(entries, { sortBy: 'category-desc' }).map(([category]) => category)).toEqual(['Z', 'A'])
    expect(groupLoreEntries(entries, { sortBy: 'title-desc' })[1][1].map(entry => entry.id)).toEqual(['b', 'a'])
    expect(groupLoreEntries(entries, { sortBy: 'category-asc' })[1][1].map(entry => entry.id)).toEqual(['a', 'b'])
    expect(entries.map(entry => entry.id)).toEqual(['b', 'a', 'c'])
  })

  it('matches trimmed case-insensitive tags consistently across all six source types', () => {
    const index = buildLoreTagIndex({ loreEntries: [{ id: 'same', title: 'Lore', tags: [' #Magic ', 'magic'] }], ideaEntries: [{ id: 'idea', tags: ['MAGIC'] }], characters: [{ id: 'c', keywords: ['magic'] }], locations: [{ id: 'l', tags: ['magic'] }], worldHistory: [{ id: 'same', tags: ['magic'] }], timeline: [{ id: 'same', tags: ['magic'] }] })
    expect(index.size).toBe(1)
    expect(index.get('magic').matches.size).toBe(6)
    expect(index.get('magic').label).toBe('Magic')
    const { entries } = buildLoreIndex([{ id: 'l', tags: ['Magic'] }])
    expect(groupLoreEntries(entries, { tag: ' #MAGIC ' })).toHaveLength(1)
  })

  it('uses typed lore references and deduplicates reciprocal links without confusing entity IDs', () => {
    const index = createLoreReferenceIndex({ loreEntries: [
      { id: 'a', title: 'Alpha', characterIds: ['a'], locationIds: ['a'], loreIds: ['b', 'b', 'a'] },
      { id: 'b', title: 'Beta', loreIds: ['a'] },
      { id: 'c', title: 'Incoming', loreIds: ['a'] },
      { id: 'd', title: 'Not a lore reference', characterIds: ['a'], locationIds: ['a'] },
    ], characters: [{ id: 'a', name: 'Character' }], locations: [{ id: 'a', name: 'Location' }] })
    const entry = index.byId.get('a')
    const related = relatedLoreFor(entry, index)
    expect(related.outgoing.map(item => item.id)).toEqual(['b'])
    expect(related.incoming.map(item => item.id)).toEqual(['c'])
    expect(loreReferenceRows(entry, index)).toEqual([
      { type: 'Character', id: 'a', title: 'Character' },
      { type: 'Location', id: 'a', title: 'Location' },
      { type: 'Related lore', id: 'b', title: 'Beta' },
      { type: 'Referenced by lore', id: 'c', title: 'Incoming' },
    ])
  })
})
