import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { createProjectDocxBlob, createProjectDocxZipBlob } from './projectExportDocx.js'

async function readDocumentXml(blob) {
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  return strFromU8(zip['word/document.xml'])
}

const makeProjectData = () => ({
  project: {
    id: 'project-1',
    title: 'Stormrider',
    type: 'novel',
    enabledSections: ['outline', 'characters', 'familytree', 'locations', 'lore', 'ideas', 'schedule', 'timeline', 'worldhistory'],
    aiChatSessions: [{
      id: 'chat-1',
      novelId: 'project-1',
      title: 'Plot Help',
      category: 'Outline',
      messages: [
        { role: 'user', content: 'What should happen in chapter two?' },
        { role: 'assistant', content: 'Raise the cost of the rescue.' },
      ],
    }],
  },
  characters: [{ id: 'char-1', novelId: 'project-1', name: 'Mara Vale', role: 'Mentor', bio: 'Keeps the old lighthouse.' }],
  factions: [],
  locations: [{ id: 'loc-1', novelId: 'project-1', name: 'Stormwatch', description: 'A cliff city.' }],
  timeline: [{ id: 'time-1', novelId: 'project-1', title: 'The Beacon Falls', description: 'The first signal dies.' }],
  worldHistory: [{ id: 'history-1', novelId: 'project-1', title: 'Founding', content: 'The city was carved from salt rock.' }],
  eras: [],
  acts: [{ id: 'act-1', novelId: 'project-1', title: 'Act One', order: 1 }],
  chapters: [{ id: 'chapter-1', novelId: 'project-1', actId: 'act-1', title: 'Chapter One', order: 1 }],
  scenes: [{ id: 'scene-1', novelId: 'project-1', chapterId: 'chapter-1', title: 'Opening', order: 1, content: 'Rain hits the glass.' }],
  loreEntries: [{ id: 'lore-1', novelId: 'project-1', title: 'Signal Law', content: 'No false lights.' }],
  ideaEntries: [{ id: 'idea-1', novelId: 'project-1', title: 'Twist', body: 'The lighthouse chooses its keeper.' }],
  maps: [],
  whiteboards: [],
  storySchedule: [{ id: 'schedule-1', novelId: 'project-1', title: 'Beacon Festival', year: 1, month: 2, day: 3, category: 'festival', description: 'The city gathers below the tower.' }],
})

describe('createProjectDocxBlob', () => {
  it('exports complete Outline metadata and recovered records without duplicating manuscript prose', async () => {
    const data = makeProjectData()
    data.project.enabledSections = ['outline']
    data.acts[0].synopsis = 'Act synopsis'
    data.acts[0].storyEvent = 'hook'
    data.chapters[0].synopsis = 'Chapter synopsis'
    data.scenes[0] = { ...data.scenes[0], synopsis: '', summary: 'STALE SUMMARY', content: 'SECRET MANUSCRIPT PROSE', storyEvent: 'climax' }
    data.scenes.push({ id: 'orphan', novelId: 'project-1', chapterId: 'missing', title: 42, synopsis: 'Recovered scene synopsis', content: 'orphan prose', order: 0 })
    const full = await readDocumentXml(await createProjectDocxBlob(data))
    const zip = unzipSync(new Uint8Array(await (await createProjectDocxZipBlob(data)).arrayBuffer()))
    const category = strFromU8(unzipSync(zip['Stormrider-Outline.docx'])['word/document.xml'])
    for (const xml of [full, category]) {
      for (const value of ['Act synopsis', 'Chapter synopsis', 'Story event', 'Hook', 'Climax', 'Unplaced outline items', 'Recovered scene synopsis']) expect(xml).toContain(value)
      for (const value of ['SECRET MANUSCRIPT PROSE', 'STALE SUMMARY', 'orphan prose']) expect(xml).not.toContain(value)
    }
  })

  it('exports current idea prose and resolved conversion links in full and Notes-only documents', async () => {
    const data = makeProjectData()
    data.project.enabledSections = ['ideas']
    data.ideaEntries = [
      { id: 'i', title: 'Current Idea', description: 'Current idea text', body: 'STALE BODY', content: 'STALE CONTENT', status: 'inStory', linkedEntities: [{ type: 'character', id: 'char-1', name: 'Old name' }], convertedTo: { type: 'chapter', id: 'chapter-1', name: 'Old chapter' } },
      { id: 'cleared', title: 'Cleared', description: '', body: 'SHOULD STAY CLEARED' },
    ]
    const full = await readDocumentXml(await createProjectDocxBlob(data))
    const zip = unzipSync(new Uint8Array(await (await createProjectDocxZipBlob(data)).arrayBuffer()))
    const category = strFromU8(unzipSync(zip['Stormrider-Notes.docx'])['word/document.xml'])
    for (const output of [full, category]) {
      for (const value of ['Current idea text', 'In Story', 'character: Mara Vale', 'chapter: Chapter One']) expect(output).toContain(value)
      for (const value of ['STALE BODY', 'STALE CONTENT', 'SHOULD STAY CLEARED', 'Keeps the old lighthouse.']) expect(output).not.toContain(value)
    }
  })

  it('exports Relationships independently in full and category Word documents with exact directed facts', async () => {
    const data = makeProjectData()
    data.project.enabledSections = ['relationships']
    data.characters = [
      { id: 'a', name: 'Ada', bio: 'PRIVATE BIOGRAPHY', relationships: [{ targetId: 'b', type: 'friend' }, { targetId: 'b', type: 'friend' }, { targetId: 'b', type: 'mentor' }, { targetId: 'gone', type: 'ally' }] },
      { id: 'b', name: 'Ben', parentIds: ['a'], relationships: [{ targetId: 'a', type: 'enemy' }] },
    ]
    const full = await readDocumentXml(await createProjectDocxBlob(data))
    const zip = unzipSync(new Uint8Array(await (await createProjectDocxZipBlob(data)).arrayBuffer()))
    const category = strFromU8(unzipSync(zip['Stormrider-Relationships.docx'])['word/document.xml'])
    for (const xml of [full, category]) {
      expect(xml.match(/Ada → Ben: Friend/g)).toHaveLength(1)
      expect(xml).toContain('Ada → Ben: mentor')
      expect(xml).toContain('Ben → Ada: Enemy')
      expect(xml).not.toContain('PRIVATE BIOGRAPHY')
      expect(xml).not.toContain('Direct Family Relationships')
    }
    expect(zip['Stormrider-Family-Tree.docx']).toBeUndefined()
    expect(zip['Stormrider-Characters.docx']).toBeUndefined()
  })

  it('exports modern character fields and journey details in full and character-only Word documents', async () => {
    const data = makeProjectData()
    data.project.enabledSections = ['characters']
    data.project.currentYear = 100
    data.characters = [{ id: 'c', name: 0, bio: '', description: 'OLD BIOGRAPHY', birthDate: '20 BCE', deathDate: 0, traits: { externalGoal: 'Save the city', disabilities: 'Limited sight', qualifications: 'Scholar', talents: 'Music' }, background: { language: 'Elvish' }, extraAbilities: [{ name: 'Flight', description: 'Silver wings' }], journey: { endingRelationships: 'Trusts the team', beats: [{ title: 'Final decision', consequence: 'The city survives' }] }, relationships: [{ targetId: 'other', type: 'ally' }, { targetId: 'other', type: 'ally' }] }, { id: 'other', name: 'Friend' }]
    const full = await readDocumentXml(await createProjectDocxBlob(data))
    const zip = unzipSync(new Uint8Array(await (await createProjectDocxZipBlob(data)).arrayBuffer()))
    const entry = Object.entries(zip).find(([name]) => /Characters\.docx$/.test(name))
    expect(entry).toBeTruthy()
    const category = strFromU8(unzipSync(entry[1])['word/document.xml'])
    for (const xml of [full, category]) {
      for (const value of ['Save the city', 'Limited sight', 'Scholar', 'Music', 'Elvish', 'Silver wings', 'Trusts the team', 'The city survives', '20 at death']) expect(xml).toContain(value)
      expect(xml).not.toContain('OLD BIOGRAPHY')
      expect(xml.match(/ally: Friend/g)).toHaveLength(1)
    }
  })
  it('includes typed lore links in full and category Word exports without exporting linked biographies', async () => {
    const data = makeProjectData()
    data.project.enabledSections = ['lore']
    data.loreEntries = [
      { id: 'root', title: 'Root', content: 'Lore body', characterIds: ['char-1', 'char-1'], locationIds: ['loc-1'], loreIds: ['related'] },
      { id: 'related', title: 'Related', loreIds: ['root'] },
      { id: 'incoming', title: 'Incoming', loreIds: ['root'] },
    ]
    const full = await readDocumentXml(await createProjectDocxBlob(data))
    const zip = unzipSync(new Uint8Array(await (await createProjectDocxZipBlob(data)).arrayBuffer()))
    const category = strFromU8(unzipSync(zip['Stormrider-Lore.docx'])['word/document.xml'])
    for (const xml of [full, category]) {
      expect(xml.match(/Character: Mara Vale/g)).toHaveLength(1)
      expect(xml).toContain('Location: Stormwatch')
      expect(xml).toContain('Related lore: Related')
      expect(xml).toContain('Referenced by lore: Incoming')
      expect(xml).toContain('Lore body')
      expect(xml).not.toContain('Keeps the old lighthouse.')
      expect(xml).not.toContain('A cliff city.')
    }
  })

  it('includes History category and respects intentionally cleared content', async () => {
    const data = makeProjectData()
    data.project.enabledSections = ['worldhistory']
    data.worldHistory = [
      { id: 'cleared', title: 'Cleared', content: '', description: 'Stale prose', notes: 'Stale notes' },
      { id: 'legacy', title: 'Legacy', notes: 'Legacy body', category: 'Founding' },
    ]
    const xml = await readDocumentXml(await createProjectDocxBlob(data))
    expect(xml).toContain('Founding')
    expect(xml).toContain('Legacy body')
    expect(xml).not.toContain('Stale prose')
    expect(xml).not.toContain('Stale notes')
  })

  it('uses chronological order and preserves timeline/history ranges and precise dates', async () => {
    const data = makeProjectData()
    data.project.enabledSections = ['timeline', 'worldhistory']
    data.timeline = [
      { id: 'late', title: 'Late event', date: 'Year 12, First Month', startYear: 12 },
      { id: 'early', title: 'Early range', startYear: -10, endYear: 0 },
      { id: 'unknown', title: 'Undated event' },
    ]
    data.worldHistory = [{ id: 'history', title: 'Legacy date range', dateRange: 'Year 3, Last Month' }]
    const xml = await readDocumentXml(await createProjectDocxBlob(data))
    expect(xml.indexOf('Early range')).toBeLessThan(xml.indexOf('Late event'))
    expect(xml.indexOf('Late event')).toBeLessThan(xml.indexOf('Undated event'))
    expect(xml).toContain('-10 – 0')
    expect(xml).toContain('Year 12, First Month')
    expect(xml).toContain('Year 3, Last Month')
  })

  it('includes project AI chat sessions in the Word export', async () => {
    const blob = await createProjectDocxBlob(makeProjectData())

    const xml = await readDocumentXml(blob)

    expect(xml).toContain('AI Chats')
    expect(xml).toContain('Plot Help')
    expect(xml).toContain('What should happen in chapter two?')
    expect(xml).toContain('Raise the cost of the rescue.')
  })

  it('exports Schedule chronologically with custom ranges, current prose and live linked names', async () => {
    const data = makeProjectData()
    data.project.enabledSections = ['schedule']
    data.project.scheduleCalendar = { months: [{ name: 'Darkfall', days: 3 }, { name: 'Sunrise', days: 2 }], weekLength: 2 }
    data.project.categoryOptions = { schedule: ['Ritual'] }
    data.characters = [{ id: 'c', name: 'Current hero', bio: 'PRIVATE BIOGRAPHY' }]
    data.locations = []
    data.storySchedule = [
      { id: 'late', title: 'Late ritual', description: 'Current prose', notes: 'STALE NOTES', year: 1, month: 2, day: 2, duration: 2, category: 'ritual', linkedCharacters: ['c'], linkedLocations: ['gone'] },
      { id: 'early', title: 'Early ritual', description: '', content: 'STALE CONTENT', year: 1, month: 1, day: 1 },
    ]
    const xml = await readDocumentXml(await createProjectDocxBlob(data))
    expect(xml.indexOf('Early ritual')).toBeLessThan(xml.indexOf('Late ritual'))
    for (const value of ['Current prose', 'Current hero', 'Location gone (unavailable)', 'Ritual', 'Sunrise, Day 2', 'Darkfall, Day 1']) expect(xml).toContain(value)
    for (const value of ['STALE NOTES', 'STALE CONTENT', 'PRIVATE BIOGRAPHY']) expect(xml).not.toContain(value)
  })

  it('can create a ZIP containing separate Word documents per export category', async () => {
    const blob = await createProjectDocxZipBlob(makeProjectData())
    const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    const names = Object.keys(zip).sort()

    expect(names).toEqual([
      'Stormrider-AI-Chats.docx',
      'Stormrider-Characters.docx',
      'Stormrider-Family-Tree.docx',
      'Stormrider-Locations.docx',
      'Stormrider-Lore.docx',
      'Stormrider-Manuscript.docx',
      'Stormrider-Notes.docx',
      'Stormrider-Outline.docx',
      'Stormrider-Overview.docx',
      'Stormrider-Schedule.docx',
      'Stormrider-Timeline.docx',
      'Stormrider-World-History.docx',
    ])

    const characterDoc = unzipSync(zip['Stormrider-Characters.docx'])
    const characterXml = strFromU8(characterDoc['word/document.xml'])
    expect(characterXml).toContain('Characters')
    expect(characterXml).toContain('Mara Vale')
    expect(characterXml).not.toContain('Signal Law')

    const manuscriptDoc = unzipSync(zip['Stormrider-Manuscript.docx'])
    const manuscriptXml = strFromU8(manuscriptDoc['word/document.xml'])
    expect(manuscriptXml).toContain('Manuscript')
    expect(manuscriptXml).toContain('Rain hits the glass.')

    const scheduleDoc = unzipSync(zip['Stormrider-Schedule.docx'])
    const scheduleXml = strFromU8(scheduleDoc['word/document.xml'])
    expect(scheduleXml).toContain('Schedule')
    expect(scheduleXml).toContain('Beacon Festival')
  })

  it('includes direct family facts once, respects privacy, and exports family-only documents', async () => {
    const data = makeProjectData()
    data.characters = [
      { id: 'parent', name: 'Mara', familyGroup: 'Vale', childIds: ['child'], familyLinks: [
        { id: 'adoptive', sourceCharacterId: 'parent', targetCharacterId: 'child', kind: 'parent_child', type: 'adoptive' },
        { id: 'secret', sourceCharacterId: 'parent', targetCharacterId: 'hidden', kind: 'guardian', type: 'magical', status: 'secret' },
      ] },
      { id: 'child', name: 'Cara', familyGroup: 'Vale', parentIds: ['parent'] },
      { id: 'hidden', name: 'Hidden relationship target' },
    ]
    const xml = await readDocumentXml(await createProjectDocxBlob(data))
    expect(xml).toContain('Direct Family Relationships')
    expect(xml.match(/Mara \(Adoptive Parent\)/g)).toHaveLength(1)
    expect(xml).toContain('Cara (Adoptive Child)')
    expect(xml).not.toContain('Magical Guardian')
    const zip = unzipSync(new Uint8Array(await (await createProjectDocxZipBlob(data)).arrayBuffer()))
    const familyXml = strFromU8(unzipSync(zip['Stormrider-Family-Tree.docx'])['word/document.xml'])
    expect(familyXml).toContain('Adoptive Parent')
    expect(familyXml).not.toContain('Rain hits the glass.')
  })
})
