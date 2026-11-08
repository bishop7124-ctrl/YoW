import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runStoryCheck } from './index.js'
import demo from '../../data/theLastEmberDemoProject.json'

const ch = (id, extra = {}) => ({ id, name: id.toUpperCase(), ...extra })
const ev = (id, extra = {}) => ({ id, title: `Event ${id}`, ...extra })
const ids = (result, ruleId) => result.findings.filter(f => f.ruleId === ruleId)

describe('R1 death before birth', () => {
  it('flags confirmed, parses BC and "Year N" forms, ignores unreadable dates', () => {
    const r = runStoryCheck({ characters: [
      ch('a', { birthDate: 'Year 50', deathDate: 'Year 40' }),
      ch('b', { birthDate: '300 BC', deathDate: '250 BC' }),
      ch('c', { birthDate: 'long ago', deathDate: 'Year 10' }),
      ch('d', { birthDate: 'Year 5', deathDate: 'Year 5' }),
    ] })
    const hits = ids(r, 'R1')
    expect(hits.map(h => h.evidence[0].recordId)).toEqual(['a'])
    expect(hits[0].kind).toBe('confirmed')
  })
})

describe('R2 status consistency', () => {
  it('flags alive+death date, dead without date, unreadable dates', () => {
    const r = runStoryCheck({ characters: [
      ch('a', { status: 'alive', deathDate: 'Year 9' }),
      ch('b', { status: 'dead' }),
      ch('c', { birthDate: 'in the Age of Fire' }),
      ch('d', { status: 'alive', birthDate: 'Year 1' }),
    ] })
    const hits = ids(r, 'R2')
    expect(hits.find(h => h.evidence[0].recordId === 'a').kind).toBe('confirmed')
    expect(hits.find(h => h.evidence[0].recordId === 'b').kind).toBe('missing')
    expect(hits.find(h => h.evidence[0].recordId === 'c').kind).toBe('missing')
    expect(hits.some(h => h.evidence[0].recordId === 'd')).toBe(false)
  })
})

describe('R3/R4 events outside lifetime', () => {
  const characters = [ch('a', { birthDate: 'Year 10', deathDate: 'Year 50' })]
  it('flags as possible, never confirmed', () => {
    const r = runStoryCheck({ characters, timeline: [
      ev('late', { startYear: 60, linkedCharacters: ['a'] }),
      ev('early', { startYear: 5, linkedCharacters: ['a'] }),
      ev('ok', { startYear: 30, linkedCharacters: ['a'] }),
      ev('undated', { linkedCharacters: ['a'] }),
    ] })
    expect(ids(r, 'R3').map(h => h.kind)).toEqual(['possible'])
    expect(ids(r, 'R4').map(h => h.kind)).toEqual(['possible'])
    expect(ids(r, 'R3')[0].evidence.map(e => e.recordId).sort()).toEqual(['a', 'late'])
  })
  it('uses the end year of a ranged event for the before-birth check', () => {
    const r = runStoryCheck({ characters, timeline: [ev('range', { startYear: 1, endYear: 20, linkedCharacters: ['a'] })] })
    expect(ids(r, 'R4')).toHaveLength(0)
  })
})

describe('R5/R6 family chronology', () => {
  it('flags parent not older (confirmed) and small gap (possible); respects threshold', () => {
    const characters = [
      ch('p1', { birthDate: 'Year 100' }), ch('k1', { birthDate: 'Year 90', parentIds: ['p1'] }),
      ch('p2', { birthDate: 'Year 100' }), ch('k2', { birthDate: 'Year 105', parentIds: ['p2'] }),
      ch('p3', { birthDate: 'Year 100' }), ch('k3', { birthDate: 'Year 140', parentIds: ['p3'] }),
    ]
    const r = runStoryCheck({ characters })
    expect(ids(r, 'R5').map(h => h.kind).sort()).toEqual(['confirmed', 'possible'])
    expect(ids(runStoryCheck({ characters }, { minParentGap: 3 }), 'R5').map(h => h.kind)).toEqual(['confirmed'])
  })
  it('does not double-report when both parentIds and childIds are set', () => {
    const r = runStoryCheck({ characters: [
      ch('p', { birthDate: 'Year 100', childIds: ['k'] }), ch('k', { birthDate: 'Year 90', parentIds: ['p'] }),
    ] })
    expect(ids(r, 'R5')).toHaveLength(1)
  })
  it('R6 allows posthumous birth within a year but flags later births', () => {
    const r = runStoryCheck({ characters: [
      ch('p', { birthDate: 'Year 0', deathDate: 'Year 40' }),
      ch('ok', { birthDate: 'Year 41', parentIds: ['p'] }),
      ch('bad', { birthDate: 'Year 45', parentIds: ['p'] }),
    ] })
    expect(ids(r, 'R6').map(h => h.evidence.find(e => e.recordId !== 'p').recordId)).toEqual(['bad'])
  })
})

describe('R7 events vs eras', () => {
  it('flags outside as possible and eras with no years as missing; skips undated events', () => {
    const r = runStoryCheck({
      eras: [{ id: 'e1', name: 'One', startYear: 0, endYear: 100 }, { id: 'e2', name: 'Blank' }],
      timeline: [
        ev('in', { startYear: 50, eraId: 'e1' }), ev('out', { startYear: 150, eraId: 'e1' }),
        ev('blank', { startYear: 5, eraId: 'e2' }), ev('undated', { eraId: 'e1' }),
      ],
    })
    expect(ids(r, 'R7').map(h => h.kind).sort()).toEqual(['missing', 'possible'])
  })
})

describe('R8 dangling references', () => {
  it('flags missing characters/locations in links', () => {
    const r = runStoryCheck({
      characters: [ch('a', { parentIds: ['ghost'], relationships: [{ targetId: 'nobody' }] })],
      locations: [{ id: 'l1', name: 'Town' }],
      timeline: [ev('e', { linkedCharacters: ['a', 'gone'], linkedLocations: ['l1', 'lost'] })],
    })
    expect(ids(r, 'R8')).toHaveLength(4)
    expect(ids(r, 'R8').every(h => h.kind === 'confirmed')).toBe(true)
  })
})

describe('observations', () => {
  it('reports undated events, overlapping eras and reversed eras', () => {
    const r = runStoryCheck({
      timeline: [ev('x'), ev('y', { startYear: 5 })],
      eras: [{ id: 'a', name: 'A', startYear: 0, endYear: 50 }, { id: 'b', name: 'B', startYear: 40, endYear: 90 }, { id: 'c', name: 'C', startYear: 20, endYear: 10 }],
    })
    expect(ids(r, 'I1')).toHaveLength(1)
    expect(ids(r, 'I3')).toHaveLength(1)
    expect(ids(r, 'I2')[0].kind).toBe('confirmed')
  })
})

describe('runner behaviour', () => {
  const data = { characters: [ch('a', { birthDate: 'Year 50', deathDate: 'Year 40' })] }
  it('has stable fingerprints and supports dismissal and muting', () => {
    const first = runStoryCheck(data)
    const second = runStoryCheck(JSON.parse(JSON.stringify(data)))
    expect(first.findings[0].fingerprint).toBe(second.findings[0].fingerprint)
    const dismissed = runStoryCheck(data, { dismissed: { [first.findings[0].fingerprint]: { note: 'intentional' } } })
    expect(dismissed.findings).toHaveLength(0)
    expect(dismissed.dismissed).toHaveLength(1)
    expect(runStoryCheck(data, { mutedRules: ['R1'] }).findings).toHaveLength(0)
  })
  it('re-surfaces when the facts change', () => {
    const changed = runStoryCheck({ characters: [ch('a', { birthDate: 'Year 60', deathDate: 'Year 40' })] })
    expect(changed.findings[0].fingerprint).not.toBe(runStoryCheck(data).findings[0].fingerprint)
  })
  it('tolerates empty, null and malformed input', () => {
    expect(runStoryCheck().findings).toEqual([])
    expect(runStoryCheck({ characters: null, timeline: 'nope', eras: [null, undefined] }).findings).toEqual([])
    expect(() => runStoryCheck({ characters: [{ id: 1, birthDate: {}, parentIds: 'x' }] })).not.toThrow()
  })
  it('counts by kind', () => {
    const r = runStoryCheck({ characters: [ch('a', { birthDate: 'Year 50', deathDate: 'Year 40' }), ch('b', { status: 'dead' })] })
    expect(r.counts.confirmed).toBe(1)
    expect(r.counts.missing).toBe(1)
  })
})

describe('acceptance', () => {
  it('sample project: the only confirmed finding is a genuine data inconsistency', () => {
    // The sample lists Iyra of the Red Pines (born -28) as a parent of Sera Thorn
    // (born -30). That is a true positive in the sample's own data, pinned here so
    // any NEW confirmed finding on the sample (a false positive) fails this test.
    const r = runStoryCheck(demo)
    expect(r.grouped.confirmed.map(f => `${f.ruleId}:${f.evidence.map(e => e.label).join('>')}`))
      .toEqual(['R5:Iyra of the Red Pines>Sera Thorn'])
  })
  it('engine modules make no network calls and import no AI code', () => {
    ;['rules.js', 'index.js'].forEach(file => {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
      expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|supabase|aiApi|aiProxy|anthropic|openai/i)
    })
  })
})
