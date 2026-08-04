import { describe, it, expect } from 'vitest'
import {
  getProjectExportFilename,
  getProjectDocxFilename,
  getProjectPdfFilename,
  createProjectVisualPdfHtml,
  createProjectPdfBlob,
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

describe('createProjectVisualPdfHtml', () => {
  const projectData = {
    project: {
      title: 'Export QA',
      type: 'novel',
      enabledSections: ['factions', 'locations', 'lore', 'timeline', 'map', 'ideas'],
    },
    factions: [{
      name: 'Merchant Guild of the River Exchange',
      logo: {
        source: 'builder',
        backgroundTransparent: true,
        shapes: [{ type: 'shield', cx: 50, cy: 50, size: 30, color: '#999999' }],
      },
      description: 'Controls river tolls.',
    }],
    locations: [{
      name: 'Archive of Saint Oris',
      type: 'Archive',
      image: '/location-image-should-not-render.jpg',
      description: 'A quiet archive under blue glass.',
    }],
    loreEntries: [{ title: 'Ash Messages', content: 'Only visible near flame.' }],
    timeline: [{ title: 'Ember Falls', year: 212, description: 'This should not render on the visual timeline.' }],
    maps: [{ name: 'Citadel Map', mapObjects: [{ type: 'marker', x: 100, y: 100, width: 20, height: 20, metadata: { name: 'Gate' } }] }],
    ideaEntries: [{ title: 'Opening image', content: 'A cold brazier.' }],
  }

  it('renders faction logos and omits irrelevant location/lore/idea plates', () => {
    const html = createProjectVisualPdfHtml(projectData)

    expect(html).toContain('data:image/svg+xml')
    expect(html).not.toContain('Location Art')
    expect(html).not.toContain('/location-image-should-not-render.jpg')
    expect(html).not.toContain('Lore Plate')
    expect(html).toContain('<article class="article-card article-card--text">')
    expect(html).not.toContain('class="article-image" src=""')
  })

  it('exports timeline and map as visual summaries', () => {
    const html = createProjectVisualPdfHtml(projectData)

    expect(html).toContain('Ember Falls')
    expect(html).toContain('212')
    expect(html).not.toContain('This should not render on the visual timeline.')
    expect(html).not.toContain('Object counts')
    expect(html).not.toContain('Labels and places')
  })

  it('keeps all timeline events in generated PDF pages', async () => {
    const timeline = Array.from({ length: 13 }, (_, index) => ({
      title: `Timeline Event ${index + 1}`,
      year: 200 + index,
      order: index,
    }))
    const blob = await createProjectPdfBlob({
      project: {
        title: 'Timeline Pagination',
        type: 'novel',
        enabledSections: ['timeline'],
      },
      timeline,
    })
    const pdfText = new TextDecoder().decode(await blob.arrayBuffer())

    expect(pdfText).toContain('Timeline Event 1')
    expect(pdfText).toContain('Timeline Event 13')
    expect(pdfText).toContain('Events 13-13 of 13')
    expect(pdfText).not.toContain('+ 1 more events')
  })
})
