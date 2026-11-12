import { describe, expect, it } from 'vitest'
import { buildSearchIndex, searchIndex, plainText, makeSnippet, countByType } from './globalSearch'
import demo from '../data/theLastEmberDemoProject.json'

const store = {
  activeNovelId: 'n1',
  characters: [
    { id: 'c1', novelId: 'n1', name: 'Mira Ashford', role: 'Cartographer', bio: 'Draws maps of the <b>Red Pines</b>.', tags: ['north'] },
    { id: 'c2', novelId: 'n1', name: 'Tomas', bio: 'Brother of Mira. Hates the sea.' },
    { id: 'cx', novelId: 'other', name: 'Mira Elsewhere' },
  ],
  locations: [{ id: 'l1', novelId: 'n1', name: 'Tower of the Red Pines', category: 'Fortress', description: 'Old watchtower.' }],
  loreEntries: [{ id: 'g1', novelId: 'n1', title: 'The Ember Rite', category: 'Ritual', content: 'Performed at dusk by the Cartographers.' }],
  timeline: [{ id: 't1', novelId: 'n1', title: 'Fall of the Tower', date: 'Year 40', description: 'The Tower burns.' }],
  worldHistory: [{ id: 'h1', novelId: 'n1', title: 'The Long Winter', content: 'Cold years.' }],
  factions: [{ id: 'f1', novelId: 'n1', name: 'Pine Wardens', description: 'Guard the Red Pines.' }],
  ideaEntries: [{ id: 'i1', novelId: 'n1', title: 'Heist idea', body: 'Steal the ember.' }],
  acts: [{ id: 'a1', novelId: 'n1', title: 'Act One' }],
  chapters: [{ id: 'ch1', novelId: 'n1', actId: 'a1', title: 'Arrival' }],
  scenes: [{ id: 's1', novelId: 'n1', chapterId: 'ch1', title: 'The gate', content: 'Mira walked to the gate in **silence** and said nothing.', notes: [{ title: 'Beat', body: 'foreshadow the fall' }] }],
}
const index = buildSearchIndex(store)
const find = (q, opts) => searchIndex(index, q, opts)

describe('buildSearchIndex', () => {
  it('indexes every record type for the active project only', () => {
    expect(new Set(index.map(e => e.type))).toEqual(new Set(['character', 'location', 'lore', 'timeline', 'history', 'faction', 'idea', 'act', 'chapter', 'scene']))
    expect(index.some(e => e.id === 'cx')).toBe(false)
  })

  it('hides record types for sections the project has switched off', () => {
    const limited = buildSearchIndex(store, { enabledSections: new Set(['characters']) })
    expect(new Set(limited.map(e => e.type))).toEqual(new Set(['character', 'scene', 'chapter', 'act']))
  })

  it('strips markup and flattens note objects', () => {
    expect(plainText('<p>Hello&nbsp;<b>world</b></p> **bold**')).toBe('Hello world bold')
    expect(plainText([{ title: 'Beat', body: 'x' }])).toBe('Beat — x')
  })

  it('indexes maps from the store\'s mapProject and keeps punctuation in titles', () => {
    const idx = buildSearchIndex({
      activeNovelId: 'n',
      mapProject: { maps: [{ id: 'm1', novelId: 'n', name: 'Northern Reach', notes: 'Border forts' }] },
      characters: [{ id: 'c', novelId: 'n', name: 'Dr_Q: the C# Wizard' }],
    })
    expect(searchIndex(idx, 'northern').map(r => r.type)).toEqual(['map'])
    expect(searchIndex(idx, 'c#')[0].title).toBe('Dr_Q: the C# Wizard')
    expect(searchIndex(idx, 'dr_q').length).toBe(1)
  })

  it('tolerates missing lists and malformed records', () => {
    expect(buildSearchIndex({})).toEqual([])
    expect(() => buildSearchIndex({ characters: [null, {}, { id: 'x' }], scenes: 'nope' })).not.toThrow()
  })
})

describe('searchIndex', () => {
  it('ranks an exact title above a prefix, a word match and a text-only match', () => {
    const results = find('tomas')
    expect(results[0].id).toBe('c2')
    const mira = find('mira')
    expect(mira.map(r => r.id).slice(0, 2)).toEqual(['c1', 'c2'])
    expect(mira.find(r => r.id === 'c2').matchField).toBe('Bio')
  })

  it('lists the character before events that merely start with the same word', () => {
    const local = buildSearchIndex({
      activeNovelId: 'n',
      characters: [{ id: 'c', novelId: 'n', name: 'Captain Garrick Thorn' }],
      timeline: [{ id: 't', novelId: 'n', title: 'Garrick ambushes the convoy' }],
    })
    expect(searchIndex(local, 'garrick').map(r => r.type)).toEqual(['character', 'timeline'])
    // an exact title still wins over the bonus
    const exact = buildSearchIndex({ activeNovelId: 'n', characters: [{ id: 'c', novelId: 'n', name: 'Garrick Thorn' }], timeline: [{ id: 't', novelId: 'n', title: 'Garrick' }] })
    expect(searchIndex(exact, 'garrick')[0].type).toBe('timeline')
  })

  it('requires every word and is case-insensitive', () => {
    expect(find('RED pines').map(r => r.id)).toEqual(expect.arrayContaining(['l1', 'f1', 'c1']))
    expect(find('red zebra')).toEqual([])
  })

  it('finds scene prose and notes, with a highlighted snippet', () => {
    const hit = find('silence').find(r => r.id === 's1')
    expect(hit.matchField).toBe('Text')
    expect(hit.snippet.some(p => p.match && p.text.toLowerCase() === 'silence')).toBe(true)
    expect(find('foreshadow').find(r => r.id === 's1').matchField).toBe('Notes')
  })

  it('filters by type and reports counts', () => {
    const all = find('tower')
    expect(countByType(all).location).toBe(1)
    expect(find('tower', { types: ['timeline'] }).map(r => r.id)).toEqual(['t1'])
  })

  it('returns nothing for an empty or whitespace query', () => {
    expect(find('')).toEqual([])
    expect(find('   ')).toEqual([])
  })

  it('treats regex characters as plain text', () => {
    expect(() => find('(.*[')).not.toThrow()
    expect(find('(.*[')).toEqual([])
  })

  it('searches the sample project', () => {
    const results = searchIndex(buildSearchIndex({ ...demo, activeNovelId: demo.project.id }), 'sera')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title.toLowerCase()).toContain('sera')
  })
})

describe('makeSnippet', () => {
  it('adds ellipses and merges overlapping highlights', () => {
    const text = `${'a '.repeat(80)}needle needle ${'b '.repeat(80)}`
    const snippet = makeSnippet(text, ['needle'])
    expect(snippet.text.startsWith('…')).toBe(true)
    expect(snippet.ranges.length).toBe(2)
    expect(makeSnippet('nothing here', ['zzz'])).toBeNull()
  })
})

describe('references in search', () => {
  const withRefs = { ...store, referenceEntries: [{ id: 'r1', novelId: 'n1', title: 'Granary design', citation: 'Smith 2001', content: 'Raised on staddle stones.' }, { id: 'rx', novelId: 'other', title: 'Granary elsewhere' }] }
  it('indexes the active project\'s references as their own type, with citation and notes searchable', () => {
    const idx = buildSearchIndex(withRefs)
    const hits = searchIndex(idx, 'staddle')
    expect(hits.map(h => [h.type, h.id])).toEqual([['reference', 'r1']])
    expect(searchIndex(idx, 'Smith 2001').some(h => h.id === 'r1')).toBe(true)
    expect(searchIndex(idx, 'granary').map(h => h.id)).toEqual(['r1'])
  })
  it('leaves them out when the References room is not among the enabled sections', () => {
    const idx = buildSearchIndex(withRefs, { enabledSections: new Set(['lore', 'characters']) })
    expect(searchIndex(idx, 'granary')).toEqual([])
  })
  it('does not mix them into lore results', () => {
    expect(searchIndex(buildSearchIndex(withRefs), 'granary').some(h => h.type === 'lore')).toBe(false)
  })
})
