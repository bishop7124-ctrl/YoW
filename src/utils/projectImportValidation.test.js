import { describe, expect, it } from 'vitest'
import { validateProjectImportData, assertValidProjectImport } from './projectImportValidation'

const valid = () => ({
  project: { id: 'p1', title: 'Book', type: 'novel' },
  characters: [{ id: 'c1', name: 'Ann' }, { id: 'c2', name: 'Bo' }],
  acts: [{ id: 'a1', title: 'Act' }],
  chapters: [{ id: 'ch1', actId: 'a1', title: 'One' }],
  scenes: [{ id: 's1', chapterId: 'ch1', content: 'Prose' }],
  comicPages: [{ id: 'pg1' }],
  comicPanels: [{ id: 'pn1', pageId: 'pg1' }],
})

describe('project import validation (audit YOW-12)', () => {
  it('accepts a well-formed export, including collections that are missing', () => {
    expect(validateProjectImportData(valid())).toEqual({ valid: true, errors: [] })
    expect(validateProjectImportData({ project: { id: 'p', title: 'T' } }).valid).toBe(true)
  })

  it('rejects data that is not an object with a project', () => {
    for (const bad of [null, [], 'text', 5, {}, { project: 'x' }, { project: [] }]) {
      expect(validateProjectImportData(bad).valid).toBe(false)
    }
  })

  it('rejects a collection that is not an array, or holds non-objects', () => {
    expect(validateProjectImportData({ ...valid(), characters: { id: 'c1' } }).errors[0]).toMatch(/characters.*list/)
    expect(validateProjectImportData({ ...valid(), characters: [{ id: 'c1' }, 'oops'] }).errors[0]).toMatch(/characters.*record/)
  })

  it('rejects records without an id, and duplicate ids inside one collection', () => {
    expect(validateProjectImportData({ ...valid(), characters: [{ name: 'No id' }] }).errors[0]).toMatch(/characters.*id/)
    expect(validateProjectImportData({ ...valid(), characters: [{ id: '' }] }).valid).toBe(false)
    const dup = validateProjectImportData({ ...valid(), characters: [{ id: 'c1' }, { id: 'c1' }] })
    expect(dup.valid).toBe(false)
    expect(dup.errors[0]).toMatch(/characters.*c1.*more than once/)
  })

  it('rejects links that point at a record missing from the export', () => {
    const orphanChapter = validateProjectImportData({ ...valid(), chapters: [{ id: 'ch1', actId: 'nope' }] })
    expect(orphanChapter.errors[0]).toMatch(/chapters.*ch1.*act.*nope/i)
    const orphanScene = validateProjectImportData({ ...valid(), scenes: [{ id: 's1', chapterId: 'nope' }] })
    expect(orphanScene.errors[0]).toMatch(/scenes.*s1.*chapter.*nope/i)
    const orphanPanel = validateProjectImportData({ ...valid(), comicPanels: [{ id: 'pn1', pageId: 'nope' }] })
    expect(orphanPanel.valid).toBe(false)
  })

  it('allows records with no parent link', () => {
    expect(validateProjectImportData({ ...valid(), scenes: [{ id: 's1' }, { id: 's2', chapterId: null }] }).valid).toBe(true)
  })

  it('rejects an absurd number of records', () => {
    const many = Array.from({ length: 20001 }, (_, i) => ({ id: `c${i}` }))
    expect(validateProjectImportData({ ...valid(), characters: many }).errors[0]).toMatch(/characters.*too many/i)
  })

  it('reports at most a handful of errors so the message stays readable', () => {
    const bad = Array.from({ length: 50 }, () => ({ name: 'No id' }))
    expect(validateProjectImportData({ ...valid(), characters: bad }).errors.length).toBeLessThanOrEqual(5)
  })

  it('assertValidProjectImport throws one clear message naming the file', () => {
    expect(() => assertValidProjectImport(valid(), '"a.zip"')).not.toThrow()
    expect(() => assertValidProjectImport({ ...valid(), characters: [{ id: 'x' }, { id: 'x' }] }, '"a.zip"')).toThrow(/"a\.zip".*cannot be imported.*more than once/s)
  })
})
