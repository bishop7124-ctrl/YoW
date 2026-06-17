import { describe, it, expect } from 'vitest'
import {
  getProjectExportFilename,
  getProjectDocxFilename,
  getProjectPdfFilename,
} from './projectExport.js'

// ─── filename helpers ────────────────────────────────────────────────────────

describe('getProjectExportFilename', () => {
  it('uses the project title sanitized', () => {
    expect(getProjectExportFilename({ title: 'My Novel' })).toBe('My-Novel.zip')
  })

  it('strips special characters from title', () => {
    expect(getProjectExportFilename({ title: 'Fire & Ice: A Story!' }))
      .toBe('Fire-_-Ice_-A-Story.zip')
  })

  it('falls back to yow-project when title is empty', () => {
    expect(getProjectExportFilename({ title: '' })).toBe('yow-project.zip')
  })

  it('falls back when project is null', () => {
    expect(getProjectExportFilename(null)).toBe('yow-project.zip')
  })
})

describe('getProjectDocxFilename', () => {
  it('includes novel export label slug', () => {
    const filename = getProjectDocxFilename({ title: 'Stormrider', type: 'novel' })
    expect(filename).toMatch(/^Stormrider-.*\.docx$/)
    expect(filename).toContain('encyclopaedia')
  })

  it('uses correct slug for script project type', () => {
    const filename = getProjectDocxFilename({ title: 'My Script', type: 'script' })
    expect(filename).toMatch(/\.docx$/)
    expect(filename).toMatch(/^My-Script-/)
  })

  it('falls back gracefully with no title', () => {
    const filename = getProjectDocxFilename({ type: 'novel' })
    expect(filename).toMatch(/yow-project.*\.docx$/)
  })
})

describe('getProjectPdfFilename', () => {
  it('produces a .pdf extension', () => {
    expect(getProjectPdfFilename({ title: 'My Novel', type: 'novel' })).toMatch(/\.pdf$/)
  })

  it('matches docx base name pattern', () => {
    const project = { title: 'Dunebreaker', type: 'novel' }
    const docx = getProjectDocxFilename(project)
    const pdf = getProjectPdfFilename(project)
    expect(docx.replace('.docx', '')).toBe(pdf.replace('.pdf', ''))
  })
})
