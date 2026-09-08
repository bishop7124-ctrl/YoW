import { describe, expect, it } from 'vitest'
import { buildIdeaEntityIndex, buildIdeaIndex, filterIdeaEntries, ideaContentPatch, ideaEntityKey, ideaExportFields, nextIdeaOrder, normalizeIdea, normalizeIdeaTags, planIdeaMove } from './ideaEntries.js'

describe('idea read model', () => {
  it('normalizes legacy text, tags, statuses and invalid dates without rewriting source records', () => {
    const input = { id: 'i', title: 0, body: 42, status: '__proto__', tags: [' # Plot Twist ', 'plot-twist', 0, null], order: 'bad', updatedAt: 'bad', linkedEntities: [{ id: 'x', type: 'character', name: 0 }, { id: 'x', type: 'location', name: 'Place' }, { id: 'x', type: 'character', name: 1 }, null] }
    const before = structuredClone(input)
    expect(normalizeIdea(input)).toMatchObject({ title: '0', description: '42', status: 'raw', tags: ['plot-twist', '0'], order: 0, updatedAt: 0 })
    expect(normalizeIdea(input).linkedEntities).toHaveLength(2)
    expect(input).toEqual(before)
    expect(normalizeIdea({ description: '', body: 'stale', content: 'stale' }).description).toBe('')
    expect(normalizeIdea({ content: 'Legacy note' }).description).toBe('Legacy note')
  })

  it('keeps body/description in sync only for explicit content edits', () => {
    expect(ideaContentPatch({ body: 'Legacy capture' })).toEqual({ body: 'Legacy capture', description: 'Legacy capture' })
    expect(ideaContentPatch({ description: '', body: 'stale' })).toEqual({ description: '', body: '' })
    expect(ideaContentPatch({ title: 'Changed' })).toEqual({ title: 'Changed' })
    expect(normalizeIdeaTags([' a ', '#A', 'two words'])).toEqual(['a', 'two-words'])
  })

  it('uses typed live entity names and supports every conversion destination', () => {
    const entities = buildIdeaEntityIndex({ characters: [{ id: 'same', name: 0 }], locations: [{ id: 'same', name: 'Renamed Place' }], timeline: [{ id: 'e', title: 'Event' }], chapters: [{ id: 'ch', title: 'Chapter' }] })
    expect(entities.size).toBe(4)
    expect(entities.get(ideaEntityKey({ type: 'character', id: 'same' })).name).toBe('0')
    const fields = ideaExportFields({ linkedEntities: [{ id: 'same', type: 'location', name: 'Old Place' }, { id: 'gone', type: 'lore', name: 'Missing' }] }, entities)
    expect(fields.find(([label]) => label === 'Linked to')[1]).toBe('location: Renamed Place\nlore: Missing (unavailable)')
  })

  it('keeps invalid statuses visible, sorts deterministically, exposes all tags and recovers stale filters', () => {
    const index = buildIdeaIndex([
      { id: 'b', title: 'B', status: 'mystery', order: 0, createdAt: 2, updatedAt: 4, tags: ['beta'], isFavourite: true },
      { id: 'a', title: 'A', status: null, order: 0, createdAt: 1, tags: ['alpha'] },
      { id: 'c', title: 'C', status: 'archived', order: 2, createdAt: 3, updatedAt: 3, aiExpanded: true },
    ])
    expect(index.tags).toEqual(['alpha', 'beta'])
    expect(filterIdeaEntries(index).map(idea => idea.id)).toEqual(['a', 'b'])
    expect(filterIdeaEntries(index, { tag: 'gone' }).map(idea => idea.id)).toEqual(['a', 'b'])
    expect(filterIdeaEntries(index, { sort: 'newest', archived: true }).map(idea => idea.id)).toEqual(['c', 'b', 'a'])
    expect(filterIdeaEntries(index, { sort: 'active', archived: true }).map(idea => idea.id)).toEqual(['b', 'c', 'a'])
    expect(filterIdeaEntries(index, { favourite: true, tag: 'beta' }).map(idea => idea.id)).toEqual(['b'])
    expect(filterIdeaEntries(index, { aiExpanded: true, archived: true }).map(idea => idea.id)).toEqual(['c'])
  })

  it('does not count dangling or differently typed IDs as linked results', () => {
    const entities = buildIdeaEntityIndex({ characters: [{ id: 'x', name: 'X' }] })
    const index = buildIdeaIndex([{ id: 'wrong', linkedEntities: [{ type: 'location', id: 'x' }] }, { id: 'right', linkedEntities: [{ type: 'character', id: 'x' }] }], entities)
    expect(filterIdeaEntries(index, { linked: true }).map(idea => idea.id)).toEqual(['right'])
  })
})

describe('idea ordering', () => {
  const entries = [{ id: 'a', status: 'raw', order: 0 }, { id: 'b', status: 'raw', order: 1 }, { id: 'c', status: 'raw', order: 2 }, { id: 'd', status: 'developing', order: 4 }]
  it('supports moving to the end of the same column and between columns', () => {
    expect(planIdeaMove(entries, 'a', 'raw')).toEqual([{ id: 'a', data: { status: 'raw', order: 3 } }])
    expect(planIdeaMove(entries, 'a', 'raw', 'c')).toEqual([{ id: 'a', data: { status: 'raw', order: 1.5 } }])
    expect(planIdeaMove(entries, 'a', 'developing')).toEqual([{ id: 'a', data: { status: 'developing', order: 5 } }])
    expect(nextIdeaOrder(entries, 'raw')).toBe(3)
  })
  it.each([0, 1e20])('rebalances duplicate/exhausted ranks (%s) to preserve the exact requested slot', order => {
    const data = entries.map(entry => ({ ...entry, order }))
    const before = structuredClone(data)
    const plan = planIdeaMove(data, 'd', 'raw', 'b')
    const result = data.map(entry => ({ ...entry, ...plan.find(change => change.id === entry.id)?.data }))
    expect(filterIdeaEntries(buildIdeaIndex(result)).filter(idea => idea.status === 'raw').map(idea => idea.id)).toEqual(['a', 'd', 'b', 'c'])
    expect(data).toEqual(before)
  })
  it('ignores missing sources, invalid statuses and foreign/stale insertion targets', () => {
    expect(planIdeaMove(entries, 'gone', 'raw')).toEqual([])
    expect(planIdeaMove(entries, 'a', '__proto__')).toEqual([])
    expect(planIdeaMove(entries, 'a', 'raw', 'd')).toEqual([])
    expect(planIdeaMove(entries, 'a', 'raw', 'a')).toEqual([])
  })
})
