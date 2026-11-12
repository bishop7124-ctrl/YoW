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

describe('R9 characters in scenes outside their lifetime', () => {
  const characters = [ch('a', { birthDate: 'Year 10', deathDate: 'Year 50' }), ch('nodates')]
  const sc = (id, extra = {}) => ({ id, title: `Scene ${id}`, ...extra })
  it('flags a linked character in a scene after their death or before their birth, as possible', () => {
    const r = runStoryCheck({ characters, scenes: [
      sc('late', { characterIds: ['a'], storyYear: 60 }),
      sc('early', { characterIds: ['a'], storyYear: 5 }),
      sc('fine', { characterIds: ['a'], storyYear: 30 }),
    ] })
    const hits = ids(r, 'R9')
    expect(hits.map(h => h.title).sort()).toEqual(['Appears in a scene after their death', 'Appears in a scene before they were born'])
    expect(hits.every(h => h.kind === 'possible')).toBe(true)
    expect(hits[0].evidence.map(e => e.recordType).sort()).toEqual(['character', 'scene'])
  })
  it('uses the year of the linked timeline events when the scene has no year of its own', () => {
    const r = runStoryCheck({ characters, timeline: [ev('e', { startYear: 70 })], scenes: [sc('s', { characterIds: ['a'], timelineEventIds: ['e'] })] })
    expect(ids(r, 'R9')).toHaveLength(1)
  })
  it('never guesses: no scene year, no character dates, or no link means no finding', () => {
    expect(ids(runStoryCheck({ characters, scenes: [sc('s', { characterIds: ['a'] })] }), 'R9')).toEqual([])
    expect(ids(runStoryCheck({ characters, scenes: [sc('s', { characterIds: ['nodates'], storyYear: 900 })] }), 'R9')).toEqual([])
    expect(ids(runStoryCheck({ characters, scenes: [sc('s', { storyYear: 900 })] }), 'R9')).toEqual([])
  })
  it('a dismissed finding stays dismissed (a ghost scene)', () => {
    const data = { characters, scenes: [sc('late', { characterIds: ['a'], storyYear: 60 })] }
    const first = runStoryCheck(data).findings.find(f => f.ruleId === 'R9')
    expect(runStoryCheck(data, { dismissed: { [first.fingerprint]: true } }).findings.some(f => f.ruleId === 'R9')).toBe(false)
  })
})

describe('R10 scene order against the story timeline', () => {
  const acts = [{ id: 'a1', order: 0 }]
  const chapters = [{ id: 'c1', actId: 'a1', order: 0 }, { id: 'c2', actId: 'a1', order: 1 }]
  const sc = (id, chapterId, order, extra = {}) => ({ id, title: `S${id}`, chapterId, order, ...extra })
  const run = scenes => ids(runStoryCheck({ acts, chapters, scenes }), 'R10')
  it('flags a scene set earlier than the scene before it, in manuscript order', () => {
    const hits = run([sc('3', 'c2', 0, { storyYear: 5 }), sc('1', 'c1', 0, { storyYear: 10 }), sc('2', 'c1', 1, { storyYear: 20 })])
    expect(hits).toHaveLength(1)
    expect(hits[0].kind).toBe('possible')
    expect(hits[0].evidence.map(e => e.recordId)).toEqual(['2', '3'])
  })
  it('skips flashbacks and flash-forwards and does not let them move the baseline', () => {
    expect(run([sc('1', 'c1', 0, { storyYear: 10 }), sc('2', 'c1', 1, { storyYear: 2, timeShift: 'flashback' }), sc('3', 'c2', 0, { storyYear: 11 })])).toEqual([])
    expect(run([sc('1', 'c1', 0, { storyYear: 10 }), sc('2', 'c1', 1, { storyYear: 90, timeShift: 'flashforward' }), sc('3', 'c2', 0, { storyYear: 11 })])).toEqual([])
  })
  it('ignores scenes without a known year and equal years', () => {
    expect(run([sc('1', 'c1', 0, { storyYear: 10 }), sc('2', 'c1', 1), sc('3', 'c2', 0, { storyYear: 10 })])).toEqual([])
  })
})

describe('R8 broken scene links', () => {
  it('flags scene links to characters, point of view, locations and events that no longer exist', () => {
    const r = runStoryCheck({
      characters: [ch('a')], locations: [{ id: 'l', name: 'Keep' }], timeline: [ev('e')],
      scenes: [{ id: 's', title: 'S', characterIds: ['a', 'gone'], povCharacterId: 'ghost', locationIds: ['l', 'lost'], timelineEventIds: ['e', 'zzz'] }],
    })
    const hits = ids(r, 'R8')
    expect(hits).toHaveLength(4)
    expect(hits.every(h => h.kind === 'confirmed' && h.evidence[0].recordType === 'scene')).toBe(true)
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

describe('R13-R16 plot thread checks', () => {
  const acts = [{ id: 'a1', order: 0 }]
  // Twenty scenes, two per chapter, in ten chapters.
  const chapters = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, actId: 'a1', order: i }))
  const baseScenes = () => Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, title: `Scene ${i}`, chapterId: `c${Math.floor(i / 2)}`, order: i % 2 }))
  const link = (scenes, sceneIndex, threadId, role) => { scenes[sceneIndex] = { ...scenes[sceneIndex], threadLinks: [...(scenes[sceneIndex].threadLinks || []), { threadId, role }] } }
  const thread = (id, extra = {}) => ({ id, name: `Thread ${id}`, status: 'open', ...extra })
  const run = (plotThreads, scenes, rule, settings) => ids(runStoryCheck({ acts, chapters, scenes, plotThreads }, settings), rule)

  it('R13 flags a payoff with no earlier set-up or development, and accepts one with it', () => {
    const bad = baseScenes(); link(bad, 5, 't', 'payoff'); link(bad, 9, 't', 'setup')
    const hits = run([thread('t')], bad, 'R13')
    expect(hits).toHaveLength(1)
    expect(hits[0].kind).toBe('possible')
    expect(hits[0].evidence.map(e => e.recordType)).toEqual(['thread', 'scene'])
    const good = baseScenes(); link(good, 2, 't', 'development'); link(good, 5, 't', 'payoff')
    expect(run([thread('t')], good, 'R13')).toEqual([])
  })
  it('R13 flags a resolved thread with no payoff, but not an open one or one with a payoff', () => {
    const s = baseScenes(); link(s, 1, 't', 'setup'); link(s, 3, 't', 'development')
    expect(run([thread('t', { status: 'resolved' })], s, 'R13')).toHaveLength(1)
    expect(run([thread('t', { status: 'open' })], s, 'R13')).toEqual([])
    link(s, 4, 't', 'payoff')
    expect(run([thread('t', { status: 'resolved' })], s, 'R13')).toEqual([])
  })
  it('R14 flags an open thread that stops before the closing stretch, not a resolved, dropped or ending one', () => {
    const early = baseScenes(); link(early, 1, 't', 'setup'); link(early, 4, 't', 'development')
    const hits = run([thread('t')], early, 'R14')
    expect(hits).toHaveLength(1)
    expect(hits[0].kind).toBe('info')
    expect(run([thread('t', { status: 'resolved' })], early, 'R14')).toEqual([])
    expect(run([thread('t', { status: 'dropped' })], early, 'R14')).toEqual([])
    const reaches = baseScenes(); link(reaches, 1, 't', 'setup'); link(reaches, 17, 't', 'development') // chapter 8 of 10: inside the last three chapters
    expect(run([thread('t')], reaches, 'R14')).toEqual([])
  })
  it('R14 stays quiet for a short manuscript', () => {
    const few = baseScenes().slice(0, 6); link(few, 0, 't', 'setup')
    expect(run([thread('t')], few, 'R14')).toEqual([])
  })
  it('R15 reports only the longest gap, using the setting, and ignores gaps of exactly the limit', () => {
    const s = baseScenes(); link(s, 0, 't', 'setup'); link(s, 4, 't', 'development'); link(s, 19, 't', 'payoff') // gaps of 3 and 14 scenes
    const hits = run([thread('t')], s, 'R15')
    expect(hits).toHaveLength(1)
    expect(hits[0].evidence.map(e => e.value)).toEqual(['14 scenes', 'before the gap', 'after the gap'])
    expect(run([thread('t')], s, 'R15', { maxThreadGap: 14 })).toEqual([])
    expect(run([thread('t')], s, 'R15', { maxThreadGap: 3 })).toHaveLength(1)
  })
  it('R16 flags a live thread with no scenes, and not a dropped one', () => {
    expect(run([thread('t')], baseScenes(), 'R16')).toHaveLength(1)
    expect(run([thread('t', { status: 'dropped' })], baseScenes(), 'R16')).toEqual([])
    const s = baseScenes(); link(s, 0, 't', 'setup')
    expect(run([thread('t')], s, 'R16')).toEqual([])
  })
  it('does nothing without threads, ignores links to missing threads, and a dismissal sticks', () => {
    const s = baseScenes(); link(s, 0, 'ghost', 'payoff')
    expect(runStoryCheck({ acts, chapters, scenes: s }).findings.filter(f => /^R1[3-6]$/.test(f.ruleId))).toEqual([])
    expect(runStoryCheck({ acts, chapters, scenes: s, plotThreads: [] }).findings.filter(f => /^R1[3-6]$/.test(f.ruleId))).toEqual([])
    const data = { acts, chapters, scenes: baseScenes(), plotThreads: [thread('t')] }
    const first = runStoryCheck(data).findings.find(f => f.ruleId === 'R16')
    expect(runStoryCheck(data, { dismissed: { [first.fingerprint]: true } }).findings.some(f => f.ruleId === 'R16')).toBe(false)
  })
  it('can be muted like any other rule', () => {
    expect(runStoryCheck({ acts, chapters, scenes: baseScenes(), plotThreads: [thread('t')] }, { mutedRules: ['R16'] }).findings.some(f => f.ruleId === 'R16')).toBe(false)
  })
  it('ignores scenes whose chapter is not placed in an act, so R14 matches the grid', () => {
    const scenes = baseScenes()
    link(scenes, 0, 't', 'setup'); link(scenes, 17, 't', 'development') // inside the closing chapters: no R14
    const strays = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, title: `Stray ${i}`, chapterId: 'nowhere', order: i }))
    expect(run([thread('t')], [...scenes, ...strays], 'R14')).toEqual([])
    expect(run([thread('t')], [...scenes, ...strays], 'R15')).toHaveLength(1) // the gap is real (16 scenes) and unaffected by the strays
  })
})

describe('character knowledge rules (R17, R18)', () => {
  const acts = [{ id: 'a1', order: 0 }]
  const chapters = [{ id: 'ch1', actId: 'a1', order: 0 }, { id: 'ch2', actId: 'a1', order: 1 }]
  const scenes = [
    { id: 's1', chapterId: 'ch1', order: 0, title: 'The gate' },
    { id: 's2', chapterId: 'ch1', order: 1, title: 'The cellar' },
    { id: 's3', chapterId: 'ch2', order: 0, title: 'The reveal' },
    { id: 'sx', chapterId: 'unplaced', order: 0, title: 'Loose' },
  ]
  const run = (knowledge, extra = {}) => runStoryCheck({ acts, chapters, scenes: extra.scenes || scenes, characters: [{ id: 'c1', name: 'Mira', knowledge }] })
  const ids = result => result.findings.map(f => f.ruleId)

  it('R17 flags acting on a fact in a scene before the scene where it is learned', () => {
    const result = run([{ id: 'f1', text: 'The bridge is mined', learnedAtSceneId: 's3', usedInSceneIds: ['s2', 's1'] }])
    expect(ids(result)).toEqual(['R17'])
    expect(result.findings[0].kind).toBe('possible')
    expect(result.findings[0].evidence.map(e => e.recordId)).toEqual(['c1', 's1', 's3']) // the earliest use is reported
    expect(result.findings[0].explanation).toMatch(/learns it later/)
  })

  it('R17 is quiet when the fact is learned first, in the same scene, or the scene is a flashback or unplaced', () => {
    expect(ids(run([{ id: 'f1', text: 'x', learnedAtSceneId: 's1', usedInSceneIds: ['s2', 's3'] }]))).toEqual([])
    expect(ids(run([{ id: 'f1', text: 'x', learnedAtSceneId: 's2', usedInSceneIds: ['s2'] }]))).toEqual([])
    const flash = scenes.map(scene => (scene.id === 's1' ? { ...scene, timeShift: 'flashback' } : scene))
    expect(ids(run([{ id: 'f1', text: 'x', learnedAtSceneId: 's3', usedInSceneIds: ['s1'] }], { scenes: flash }))).toEqual([])
    expect(ids(run([{ id: 'f1', text: 'x', learnedAtSceneId: 's3', usedInSceneIds: ['sx'] }]))).toEqual([])
  })

  it('R18 notes a fact acted on but never learned, and stays quiet once an event or scene is recorded', () => {
    const result = run([{ id: 'f1', text: 'The heir lives', usedInSceneIds: ['s2', 's3'] }])
    expect(ids(result)).toEqual(['R18'])
    expect(result.findings[0].kind).toBe('info')
    expect(result.findings[0].explanation).toMatch(/and 1 other scene/)
    expect(ids(run([{ id: 'f1', text: 'x', usedInSceneIds: ['s2'], learnedAtEventId: 'e1' }]))).toEqual([])
    expect(ids(run([{ id: 'f1', text: 'x', usedInSceneIds: [] }]))).toEqual([])
  })

  it('does nothing for characters with no recorded knowledge, and a dismissal keeps a finding hidden', () => {
    expect(ids(run(undefined))).toEqual([])
    const first = run([{ id: 'f1', text: 'x', usedInSceneIds: ['s2'] }])
    const hidden = runStoryCheck({ acts, chapters, scenes, characters: [{ id: 'c1', name: 'Mira', knowledge: [{ id: 'f1', text: 'x', usedInSceneIds: ['s2'] }] }] }, { dismissed: { [first.findings[0].fingerprint]: {} } })
    expect(hidden.findings).toEqual([])
    expect(hidden.dismissed).toHaveLength(1)
  })
})
