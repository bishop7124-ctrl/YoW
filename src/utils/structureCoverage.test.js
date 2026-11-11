import { describe, expect, it } from 'vitest'
import {
  coverageTemplates, templateBeats, normalizeStructureMap, chooseTemplateMap, assignChapterMap, unassignChapterMap, buildStructureCoverage,
} from './structureCoverage'
import { MANUSCRIPT_TEMPLATES, getTemplatesForProjectType } from '../components/Manuscript/manuscriptTemplates'

const template = {
  id: 't', name: 'T',
  acts: [
    { title: 'Act I', chapters: [{ title: 'Hook', guidance: 'g1' }, { title: 'Turn' }] },
    { title: 'Act II', chapters: [{ title: 'Turn' }, { title: 'Midpoint!' }] },
  ],
}
const chapters = [{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two' }, { id: 'c3' }, { id: 'c4', title: 'Four' }]

describe('templateBeats', () => {
  it('flattens acts in order and keeps keys unique and stable', () => {
    expect(templateBeats(template).map(b => [b.key, b.label, b.actTitle])).toEqual([
      ['hook', 'Hook', 'Act I'], ['turn', 'Turn', 'Act I'], ['turn-2', 'Turn', 'Act II'], ['midpoint', 'Midpoint!', 'Act II'],
    ])
    expect(templateBeats(null)).toEqual([])
  })
  it('works on every real template, with unique keys', () => {
    MANUSCRIPT_TEMPLATES.forEach(t => {
      const keys = templateBeats(t).map(b => b.key)
      expect(new Set(keys).size).toBe(keys.length)
    })
  })
})

describe('the shipped structures', () => {
  it('offers the classic structures for novels, each with beats, and leaves out the blank ones', () => {
    const ids = coverageTemplates(getTemplatesForProjectType('novel')).map(t => t.id)
    expect(ids).toEqual(expect.arrayContaining(['three-act', 'heros-journey', 'save-the-cat', 'seven-point', 'story-circle', 'five-act']))
    expect(ids).not.toContain('novel-blank')
    expect(templateBeats(MANUSCRIPT_TEMPLATES.find(t => t.id === 'seven-point')).map(b => b.label)).toEqual(['Hook', 'Plot Turn 1', 'Pinch 1', 'Midpoint', 'Pinch 2', 'Plot Turn 2', 'Resolution'])
    expect(templateBeats(MANUSCRIPT_TEMPLATES.find(t => t.id === 'story-circle'))).toHaveLength(8)
  })
})

describe('structureMap patches', () => {
  it('normalises junk and drops empty beats and duplicate ids', () => {
    expect(normalizeStructureMap(null)).toEqual({ templateId: '', byTemplate: {} })
    expect(normalizeStructureMap({ templateId: 5, byTemplate: { t: { hook: ['c1', 'c1', '', 3], empty: [], bad: 'x' }, junk: 4 } }))
      .toEqual({ templateId: '', byTemplate: { t: { hook: ['c1'] } } })
  })
  it('chooses a template without losing other templates\' maps', () => {
    const map = { templateId: 'a', byTemplate: { a: { x: ['c1'] } } }
    expect(chooseTemplateMap(map, 'a')).toBeNull()
    expect(chooseTemplateMap(map, 'b')).toEqual({ templateId: 'b', byTemplate: { a: { x: ['c1'] } } })
  })
  it('assigns once, allows several chapters on a beat, and unassigns', () => {
    const first = assignChapterMap(null, 't', 'hook', 'c1')
    expect(first).toEqual({ templateId: '', byTemplate: { t: { hook: ['c1'] } } })
    expect(assignChapterMap(first, 't', 'hook', 'c1')).toBeNull()
    const second = assignChapterMap(first, 't', 'hook', 'c2')
    expect(second.byTemplate.t.hook).toEqual(['c1', 'c2'])
    expect(unassignChapterMap(second, 't', 'hook', 'c1').byTemplate.t.hook).toEqual(['c2'])
    expect(unassignChapterMap(first, 't', 'hook', 'c1').byTemplate.t).toEqual({})
    expect(unassignChapterMap(first, 't', 'hook', 'zzz')).toBeNull()
    expect(assignChapterMap(first, '', 'hook', 'c1')).toBeNull()
  })
})

describe('buildStructureCoverage', () => {
  it('reports placed and empty beats, chapters in manuscript order, and unmapped chapters', () => {
    const map = { byTemplate: { t: { hook: ['c1'], midpoint: ['c4', 'c3'] } } }
    const result = buildStructureCoverage({ template, structureMap: map, chapters })
    expect(result.placedCount).toBe(2)
    expect(result.total).toBe(4)
    expect(result.beats.map(b => b.placed)).toEqual([true, false, false, true])
    expect(result.beats[3].chapters.map(c => [c.number, c.title])).toEqual([[3, 'Untitled chapter'], [4, 'Four']])
    expect(result.unmappedChapters.map(c => c.id)).toEqual(['c2'])
  })
  it('ignores chapters that no longer exist', () => {
    const result = buildStructureCoverage({ template, structureMap: { byTemplate: { t: { hook: ['gone'] } } }, chapters })
    expect(result.placedCount).toBe(0)
    expect(result.beats[0].chapters).toEqual([])
  })
  it('flags a beat placed before an earlier beat, and nothing else', () => {
    const ordered = buildStructureCoverage({ template, structureMap: { byTemplate: { t: { hook: ['c1'], turn: ['c2'], midpoint: ['c4'] } } }, chapters })
    expect(ordered.beats.some(b => b.outOfOrder)).toBe(false)
    const backwards = buildStructureCoverage({ template, structureMap: { byTemplate: { t: { hook: ['c3'], turn: ['c1'] } } }, chapters })
    expect(backwards.beats.map(b => b.outOfOrder)).toEqual([false, true, false, false])
  })
  it('survives no template and no chapters', () => {
    expect(buildStructureCoverage({})).toEqual({ beats: [], placedCount: 0, total: 0, unmappedChapters: [] })
  })
})
