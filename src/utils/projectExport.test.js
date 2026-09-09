import { describe, it, expect } from 'vitest'
import {
  getProjectExportFilename,
  getProjectDocxFilename,
  getProjectPdfFilename,
  createProjectVisualPdfHtml,
  createProjectPdfBlob,
} from './projectExport.js'

describe('character dossier exports', () => {
  const data = () => ({
    project: { title: 'Characters', currentYear: 100, enabledSections: ['characters'] },
    characters: [
      { id: 'root', name: 0, bio: '', description: 'STALE BIOGRAPHY', birthDate: '20 BCE', deathDate: 0, keywords: [' Raven ', 'raven'],
        traits: { internalGoal: 'Find peace', disabilities: 'Limited sight', qualifications: 'Scholar', talents: 'Music' },
        background: { language: 'Elvish', historicEventsWitnessed: 'The first dawn' }, extraAbilities: [{ name: 'Flight', description: 'Silver wings' }],
        journey: { endingRelationships: 'Trusts the team', notes: 'Journey note', beats: [{ title: 'Final decision', choiceMade: 'Stay and help', consequence: 'The city survives' }] },
        relationships: [...Array.from({ length: 12 }, (_, index) => ({ targetId: `c${index}`, type: 'friend' })), { targetId: 'c0', type: 'friend' }],
      },
      ...Array.from({ length: 12 }, (_, index) => ({ id: `c${index}`, name: `Companion ${index}` })),
    ],
  })

  it('includes current traits, abilities, journey details and every unique relationship in HTML', () => {
    const html = createProjectVisualPdfHtml(data())
    for (const value of ['Find peace', 'Limited sight', 'Scholar', 'Music', 'Elvish', 'Silver wings', 'Trusts the team', 'Journey note', 'Stay and help', 'The city survives', '20 at death']) expect(html).toContain(value)
    expect(html).not.toContain('STALE BIOGRAPHY')
    expect(html.match(/<span>friend: Companion /g)).toHaveLength(12)
    expect(html).toContain('friend: Companion 11')
  })

  it('includes full dossier and journey content in visible PDF drawing text', async () => {
    const raw = await (await createProjectPdfBlob(data())).text()
    const drawn = [...raw.matchAll(/\((.*?)\) Tj/g)].map(match => match[1]).join('\n')
    for (const value of ['Find peace', 'Limited sight', 'Scholar', 'Music', 'Elvish', 'Silver wings', 'Trusts the team', 'Journey note', 'Stay and help', 'The city survives', '20 at death', 'friend: Companion 11']) expect(drawn).toContain(value)
    expect(drawn).not.toContain('STALE BIOGRAPHY')
  })
})

describe('Ideas Board exports', () => {
  const data = {
    project: { title: 'Ideas', enabledSections: ['ideas'] },
    ideaEntries: [
      { id: 'i', title: 0, description: 'Current description', body: 'STALE BODY', content: 'STALE CONTENT', tags: [' #Plot ', 'plot'], status: 'developing', linkedEntities: [{ type: 'character', id: 'c', name: 'Old name' }], convertedTo: { type: 'event', id: 'e', name: 'Old event' } },
      { id: 'cleared', title: 'Cleared', description: '', body: 'SHOULD STAY CLEARED' },
    ],
    characters: [{ id: 'c', name: 'Current character', bio: 'PRIVATE BIOGRAPHY' }],
    timeline: [{ id: 'e', title: 'Current event', description: 'UNRELATED EVENT BODY' }],
  }
  it('exports current prose, status and typed links without stale or unrelated content', async () => {
    const before = structuredClone(data)
    const html = createProjectVisualPdfHtml(data)
    const raw = await (await createProjectPdfBlob(data)).text()
    const drawn = [...raw.matchAll(/\((.*?)\) Tj/g)].map(match => match[1]).join('\n')
    for (const output of [html, drawn]) {
      for (const value of ['Current description', 'Developing', 'Current character', 'Current event']) expect(output).toContain(value)
      for (const value of ['STALE BODY', 'STALE CONTENT', 'SHOULD STAY CLEARED', 'PRIVATE BIOGRAPHY', 'UNRELATED EVENT BODY']) expect(output).not.toContain(value)
    }
    expect(data).toEqual(before)
  })
  it('respects the Ideas section switch', () => {
    expect(createProjectVisualPdfHtml({ ...data, project: { ...data.project, enabledSections: [] } })).not.toContain('Current description')
  })
})

describe('Schedule exports', () => {
  const data = {
    project: { title: 'Schedule', enabledSections: ['schedule'], scheduleCalendar: { months: [{ name: 'Darkfall', days: 3 }, { name: 'Sunrise', days: 2 }], weekLength: 2 }, categoryOptions: { schedule: ['Ritual'] } },
    storySchedule: [
      { id: 'late', title: 7, description: 'Current schedule prose', notes: 'STALE NOTES', year: 1, month: 2, day: 2, duration: 2, category: 'ritual', tags: [' #Omen ', 'omen'], linkedCharacters: ['c'], linkedLocations: ['missing'] },
      { id: 'early', title: 'Cleared event', description: '', content: 'STALE CONTENT', year: 1, month: 1, day: 1 },
    ],
    characters: [{ id: 'c', name: 'Current character', bio: 'PRIVATE BIOGRAPHY' }], locations: [],
  }

  it('includes chronological current prose, custom dates, ranges and live links in HTML and visible PDF text', async () => {
    const before = structuredClone(data)
    const html = createProjectVisualPdfHtml(data)
    const raw = await (await createProjectPdfBlob(data)).text()
    const drawn = [...raw.matchAll(/\((.*?)\) Tj/g)].map(match => match[1]).join('\n')
    for (const output of [html, drawn]) {
      for (const value of ['Current schedule prose', 'Current character', 'Ritual', 'Sunrise, Day 2']) expect(output).toContain(value)
      for (const value of ['STALE NOTES', 'STALE CONTENT', 'PRIVATE BIOGRAPHY']) expect(output).not.toContain(value)
    }
    expect(html).toContain('Location missing (unavailable)')
    expect(drawn).toContain('Location missing \\(unavailable\\)')
    expect(html.indexOf('Cleared event')).toBeLessThan(html.indexOf('>7<'))
    expect(data).toEqual(before)
  })

  it('respects the Schedule section switch', () => {
    expect(createProjectVisualPdfHtml({ ...data, project: { ...data.project, enabledSections: [] } })).not.toContain('Current schedule prose')
  })
})

describe('Outline exports', () => {
  const data = {
    project: { title: 'Outline', type: 'novel', enabledSections: ['outline'] },
    acts: [{ id: 'a', title: 'Act One', synopsis: 'Act synopsis', storyEvent: 'hook', order: 0 }],
    chapters: Array.from({ length: 10 }, (_, index) => ({ id: `c${index}`, actId: 'a', title: `Chapter ${index + 1} custom`, synopsis: `Chapter synopsis ${index + 1}`, order: index })),
    scenes: [
      ...Array.from({ length: 10 }, (_, index) => ({ id: `s${index}`, chapterId: `c${index}`, title: `Scene ${index + 1} custom`, synopsis: index === 9 ? 'Tenth scene synopsis' : '', content: index === 0 ? 'SECRET MANUSCRIPT PROSE' : 'draft words', storyEvent: index === 9 ? 'climax' : '', order: 0 })),
      { id: 'orphan', chapterId: 'missing', title: 42, synopsis: 'Recovered scene synopsis', content: 'orphan words', order: 0 },
      { id: 'cleared', chapterId: 'c0', title: 'Cleared scene', synopsis: '', summary: 'STALE SUMMARY', content: 'STALE CONTENT', order: 1 },
    ],
  }

  it('includes every chapter, scene synopsis, indicator, and unavailable-parent record without manuscript prose', async () => {
    const before = structuredClone(data)
    const html = createProjectVisualPdfHtml(data)
    const raw = await (await createProjectPdfBlob(data)).text()
    const drawn = [...raw.matchAll(/\((.*?)\) Tj/g)].map(match => match[1]).join('\n')
    for (const output of [html, drawn].map(value => value.replace(/\s+/g, ' '))) {
      for (const value of ['Chapter 10 custom', 'Climax', 'Unplaced outline items', 'Recovered scene synopsis']) expect(output).toContain(value)
      for (const value of ['SECRET MANUSCRIPT PROSE', 'STALE SUMMARY', 'STALE CONTENT']) expect(output).not.toContain(value)
    }
    expect(html).toContain('Tenth scene synopsis')
    expect(drawn).toContain('Tenth')
    expect(drawn).toContain('scene synopsis')
    expect(data).toEqual(before)
  })

  it('respects the Outline section switch', () => {
    expect(createProjectVisualPdfHtml({ ...data, project: { ...data.project, enabledSections: [] } })).not.toContain('Act synopsis')
  })
})

describe('social relationship exports', () => {
  const data = sections => ({
    project: { title: 'Social export', enabledSections: sections },
    characters: [
      { id: 'a', name: 'Ada', familyGroup: 42, bio: 'PRIVATE BIOGRAPHY', relationships: [
        ...Array.from({ length: 32 }, (_, i) => ({ targetId: `b${i}`, type: 'friend' })),
        { targetId: 'b0', type: 'friend' }, { targetId: 'b0', type: 'mentor' }, { targetId: 'a', type: 'enemy' }, { targetId: 'missing', type: 'enemy' },
      ] },
      ...Array.from({ length: 32 }, (_, i) => ({ id: `b${i}`, name: `Companion ${i}`, parentIds: i === 0 ? ['a'] : [], relationships: i === 0 ? [{ targetId: 'a', type: 'enemy' }] : [] })),
    ],
  })

  it('exports Relationships independently with all directed social types and no duplicate, family or biography content', async () => {
    const input = data(['relationships'])
    const before = structuredClone(input)
    const html = createProjectVisualPdfHtml(input)
    expect(html.match(/<span>Friend →<\/span>/g)).toHaveLength(32)
    expect(html).toContain('<span>mentor →</span>')
    expect(html).toContain('<span>Enemy →</span>')
    expect(html).not.toContain('<span>Parent / Child</span>')
    expect(html).not.toContain('PRIVATE BIOGRAPHY')
    const raw = await (await createProjectPdfBlob(input)).text()
    const drawn = [...raw.matchAll(/\((.*?)\) Tj/g)].map(match => match[1]).join('\n')
    expect(drawn).toContain('Ada -> Companion 31: Friend')
    expect(drawn).toContain('Companion 0 -> Ada: Enemy')
    expect(drawn.match(/Ada -> Companion 0: Friend/g)).toHaveLength(1)
    expect(drawn).not.toContain('PRIVATE BIOGRAPHY')
    expect(input).toEqual(before)
  })

  it('keeps family and social section switches independent and combines enabled facts once', () => {
    const familyOnly = createProjectVisualPdfHtml(data(['familytree']))
    expect(familyOnly).toContain('<span>Parent / Child</span>')
    expect(familyOnly).not.toContain('<span>Friend →</span>')
    const both = createProjectVisualPdfHtml(data(['familytree', 'relationships']))
    expect(both.match(/<span>Parent \/ Child<\/span>/g)).toHaveLength(1)
    expect(both.match(/<span>Friend →<\/span>/g)).toHaveLength(32)
    expect(createProjectVisualPdfHtml(data([]))).not.toContain('Relationship Atlas')
    expect(createProjectVisualPdfHtml(data(undefined))).toContain('<span>Friend →</span>')
  })
})

describe('family relationship exports', () => {
  const familyData = () => ({
    project: { title: 'Family export', type: 'novel', enabledSections: ['familytree'] },
    characters: [
      { id: 'parent', name: 'Parent', familyLinks: [
        { id: 'secret', sourceCharacterId: 'parent', targetCharacterId: 'hidden', kind: 'guardian', type: 'magical', status: 'secret' },
      ] },
      ...Array.from({ length: 30 }, (_, index) => ({ id: `child${index}`, name: `Child${index}`, parentIds: ['parent'] })),
      { id: 'hidden', name: 'Hidden' },
    ],
  })

  it('includes all direct family facts in HTML without duplicating reciprocals or exposing hidden labels', () => {
    const data = familyData()
    data.characters[0].childIds = ['child0']
    const html = createProjectVisualPdfHtml(data)
    expect(html.match(/<span>Parent \/ Child<\/span>/g)).toHaveLength(30)
    expect(html).toContain('<strong>Child29</strong>')
    expect(html).not.toContain('Magical Guardian')
  })

  it('paginates the PDF relationship index beyond the overview and keeps hidden facts out of visible text', async () => {
    const blob = await createProjectPdfBlob(familyData())
    const raw = await blob.text()
    // Private backup payloads must never be embedded in a shareable PDF.
    expect(raw).not.toContain('%%YOW-DATA-BEGIN%%')
    expect(raw).not.toContain('"sourceCharacterId"')
    const drawnText = [...raw.matchAll(/\((.*?)\) Tj/g)].map(match => match[1]).join('\n')
    expect(drawnText).toContain('Parent - Parent / Child - Child0')
    expect(drawnText).toContain('Parent - Parent / Child - Child29')
    expect(drawnText).not.toContain('Magical Guardian')
    expect(drawnText).toContain('Family Group Membership')
  })

  it('omits the family section when disabled', () => {
    const data = familyData()
    data.project.enabledSections = ['locations']
    expect(createProjectVisualPdfHtml(data)).not.toContain('<span>Parent / Child</span>')
  })
})

describe('timeline chronology exports', () => {
  const data = {
    project: { title: 'Chronicle', type: 'novel', enabledSections: ['timeline', 'worldhistory'] },
    timeline: [
      { title: 'Late date', startYear: 12, date: 'Year 12, First Month' },
      { title: 'Early range', startYear: -10, endYear: 0 },
      { title: 'Legacy zero', year: 0 },
    ],
    worldHistory: [{ title: 'Old history', dateRange: '3 BCE' }],
  }

  it('shares chronology and full date labels with the HTML timeline', () => {
    const html = createProjectVisualPdfHtml(data)
    expect(html.indexOf('<h2>Early range</h2>')).toBeLessThan(html.indexOf('<h2>Legacy zero</h2>'))
    expect(html.indexOf('<h2>Legacy zero</h2>')).toBeLessThan(html.indexOf('<h2>Late date</h2>'))
    expect(html).toContain('<span>-10 – 0</span>')
    expect(html).toContain('<span>Year 12, First Month</span>')
    expect(html).toContain('<span>3 BCE</span>')
  })

  it('uses ranges and precise dates in the visible PDF drawing commands', async () => {
    const raw = await (await createProjectPdfBlob(data)).text()
    const drawn = [...raw.matchAll(/\((.*?)\) Tj/g)].map(match => match[1]).join('\n')
    expect(drawn).toContain('-10 - 0')
    expect(drawn).toContain('Year 12, First Month')
    expect(drawn).toContain('3 BCE')
  })
})

describe('History narrative exports', () => {
  const data = {
    project: { title: 'World', type: 'novel', enabledSections: ['worldhistory'] },
    worldHistory: [
      { id: 'late', title: 'Late', dateRange: 'Year 5', content: 'Full history <script>text</script>\n\nSecond paragraph.', category: 'Founding' },
      { id: 'early', title: 'Early', date: 0, content: '', description: 'Stale cleared content', notes: 'Stale notes' },
    ],
  }

  it('includes the full escaped narrative in HTML, not just a title/date card', () => {
    const html = createProjectVisualPdfHtml(data)
    const historySection = html.match(/<section\b[^>]*id="world-history"[\s\S]*?<\/section>/)[0]
    expect(historySection).toContain('Full history text')
    expect(historySection).not.toContain('<script>')
    expect(historySection).toContain('Second paragraph.')
    expect(historySection).toContain('Founding')
    expect(historySection).not.toContain('Stale cleared content')
    expect(historySection).not.toContain('Stale notes')
    expect(historySection.indexOf('<h2>Early</h2>')).toBeLessThan(historySection.indexOf('<h2>Late</h2>'))
  })

  it('keeps cleared history text cleared in visible PDF output', async () => {
    const raw = await (await createProjectPdfBlob(data)).text()
    const drawn = [...raw.matchAll(/\((.*?)\) Tj/g)].map(match => match[1]).join('\n')
    expect(drawn).toContain('Second paragraph.')
    expect(drawn).not.toContain('Stale cleared content')
    expect(drawn).not.toContain('Stale notes')
  })
})

describe('Lore reference exports', () => {
  const data = {
    project: { title: 'Linked world', type: 'novel', enabledSections: ['lore'] },
    characters: Array.from({ length: 32 }, (_, index) => ({ id: `c${index}`, name: `Linked person ${index}` })),
    locations: [{ id: 'l', name: 'Linked place' }],
    loreEntries: [
      { id: 'root', title: 'A root entry', content: 'Full lore narrative', tags: [0, 'Magic', '#magic'], characterIds: [...Array.from({ length: 32 }, (_, index) => `c${index}`), 'c0'], locationIds: ['l'], loreIds: ['related', 'related', 'root'] },
      { id: 'related', title: 'Related entry', loreIds: ['root'] },
      { id: 'incoming', title: 'Incoming entry', loreIds: ['root'] },
    ],
  }

  it('includes all explicit HTML references, even without shared tags, and deduplicates IDs', () => {
    const html = createProjectVisualPdfHtml(data)
    const root = html.match(/<h2>A root entry<\/h2>[\s\S]*?<\/article>/)[0]
    expect(root).toContain('Full lore narrative')
    expect(root.match(/<span>Character: Linked person \d+<\/span>/g)).toHaveLength(32)
    expect(root).toContain('Location: Linked place')
    expect(root).toContain('Related lore: Related entry')
    expect(root).toContain('Referenced by lore: Incoming entry')
    expect(root).not.toContain('Related lore: A root entry')
  })

  it('paginates complete visible PDF references instead of limiting them to six matches', async () => {
    const raw = await (await createProjectPdfBlob(data)).text()
    const drawn = [...raw.matchAll(/\((.*?)\) Tj/g)].map(match => match[1]).join('\n')
    expect(drawn.match(/Character: Linked person 0\n/g)).toHaveLength(1)
    expect(drawn).toContain('Character: Linked person 31')
    expect(drawn).toContain('Location: Linked place')
    expect(drawn).toContain('Referenced by lore: Incoming entry')
    expect(drawn).toContain('A root entry continued')
  })
})

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


describe('share-safe PDF payload', () => {
  it('omits disabled private sections and hidden project metadata from the entire file', async () => {
    const blob = await createProjectPdfBlob({
      project: { title: 'Shareable', type: 'novel', enabledSections: ['locations'], privateNote: 'SECRET_PROJECT_CANARY' },
      locations: [{ id: 'place', name: 'Visible location', description: 'Visible description' }],
      loreEntries: [{ id: 'secret', title: 'SECRET_LORE_CANARY', content: 'Never share this' }],
    })
    const raw = await blob.text()
    expect(raw).toContain('Visible location')
    expect(raw).not.toContain('SECRET_PROJECT_CANARY')
    expect(raw).not.toContain('SECRET_LORE_CANARY')
    expect(raw).not.toContain('%%YOW-DATA-BEGIN%%')
    expect(raw).not.toContain('/YOW ')
  })
})
