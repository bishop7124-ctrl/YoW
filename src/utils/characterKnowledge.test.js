import { describe, expect, it } from 'vitest'
import {
  MAX_FACTS_PER_CHARACTER, clearKnowledgeLinks, hasKnowledge, normalizeFact, normalizeKnowledge, remapKnowledgeLinks, removeFact, upsertFact,
} from './characterKnowledge'

describe('normalizeFact', () => {
  it('keeps the fields it knows, with safe defaults', () => {
    const fact = normalizeFact({ text: '  The bridge is mined  ', learnedAtSceneId: 's1', usedInSceneIds: ['s2', 's2', '', 7], via: 'told', confidence: 'verified', note: 'n', evil: 'x' })
    expect(fact).toMatchObject({ text: 'The bridge is mined', learnedAtSceneId: 's1', learnedAtEventId: '', usedInSceneIds: ['s2'], via: 'told', confidence: 'verified', note: 'n' })
    expect(fact.id).toMatch(/^k/)
    expect(fact).not.toHaveProperty('evil')
  })
  it('falls back for unknown values and refuses an empty fact', () => {
    expect(normalizeFact({ text: 'x', via: 'telepathy', confidence: 'sure' })).toMatchObject({ via: '', confidence: 'believed' })
    expect(normalizeFact({ text: '   ' })).toBeNull()
    expect(normalizeFact(null)).toBeNull()
    expect(normalizeFact({ text: 'x'.repeat(900) }).text).toHaveLength(500)
  })
})

describe('normalizeKnowledge and edits', () => {
  it('drops bad and repeated entries and caps the list', () => {
    expect(normalizeKnowledge([{ id: 'a', text: 'one' }, { id: 'a', text: 'again' }, { text: '' }, 5]).map(f => f.id)).toEqual(['a'])
    expect(normalizeKnowledge('nope')).toEqual([])
    expect(normalizeKnowledge(Array.from({ length: 300 }, (_, i) => ({ id: `f${i}`, text: 't' })))).toHaveLength(MAX_FACTS_PER_CHARACTER)
  })
  it('adds a fact, replaces one with the same id, and removes one', () => {
    let list = upsertFact([], { text: 'The heir lives' })
    expect(list).toHaveLength(1)
    const id = list[0].id
    list = upsertFact(list, { id, text: 'The heir lives in Ashport', learnedAtSceneId: 's3' })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ text: 'The heir lives in Ashport', learnedAtSceneId: 's3' })
    expect(list[0].createdAt).toBe(normalizeKnowledge(list)[0].createdAt)
    expect(upsertFact(list, { text: '   ' })).toHaveLength(1)
    expect(removeFact(list, id)).toEqual([])
  })
})

describe('clearKnowledgeLinks', () => {
  const knowledge = [
    { id: 'f1', text: 'a', learnedAtSceneId: 's1', learnedAtEventId: 'e1', usedInSceneIds: ['s1', 's2'] },
    { id: 'f2', text: 'b', learnedAtSceneId: 's9', usedInSceneIds: [] },
  ]
  it('clears a deleted scene or event but keeps the fact and the writer\'s other links', () => {
    const next = clearKnowledgeLinks(knowledge, { sceneIds: ['s1'], eventIds: ['e1'] })
    expect(next[0]).toMatchObject({ id: 'f1', learnedAtSceneId: '', learnedAtEventId: '', usedInSceneIds: ['s2'] })
    expect(next[1]).toBe(knowledge[1])
  })
  it('returns the same list when nothing matches, and tolerates empty input', () => {
    expect(clearKnowledgeLinks(knowledge, { sceneIds: ['zz'] })).toBe(knowledge)
    expect(clearKnowledgeLinks(undefined, { sceneIds: ['s1'] })).toBeUndefined()
    expect(clearKnowledgeLinks(knowledge)).toBe(knowledge)
    expect(hasKnowledge({ knowledge })).toBe(true)
    expect(hasKnowledge({})).toBe(false)
  })
})

describe('remapKnowledgeLinks', () => {
  it('points links at the new records and drops ones that were not imported', () => {
    const map = { s1: 'S1', s2: 'S2', e1: 'E1' }
    const out = remapKnowledgeLinks([{ id: 'f1', text: 'a', learnedAtSceneId: 's1', learnedAtEventId: 'e9', usedInSceneIds: ['s2', 'gone'] }], { scenes: id => map[id], events: id => map[id] })
    expect(out[0]).toMatchObject({ learnedAtSceneId: 'S1', learnedAtEventId: '', usedInSceneIds: ['S2'] })
  })
})
