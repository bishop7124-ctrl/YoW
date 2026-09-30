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

  // Regression coverage for the 2026-08-08 ROADMAP bug row's remaining gap:
  // confirms a chat created via the full AI chat *panel* (AIPanel.jsx's
  // handleContextConfirm shape — extra session fields like context/agentId/
  // freedomLevel, and extra transient message fields like streaming/usage/
  // contextStats left on a completed message) renders identically to a
  // simple bottom-bar chat: same role/text/order, and its own internal line
  // breaks preserved via real <w:br/>/<w:p>, not lost or garbled by the
  // extra fields the export code never reads.
  it('exports a full-AI-chat-panel-shaped session correctly (role, text, ordering, internal line breaks)', async () => {
    const data = makeProjectData()
    data.project.aiChatSessions = [{
      id: 'panel_chat_1',
      novelId: 'project-1',
      title: 'Chat 1',
      context: { mode: 'manuscript', sceneId: 'scene-1', customInstruction: 'Help me punch up this scene.' },
      agentId: 'default',
      freedomLevel: 'balanced',
      pinned: false,
      category: '',
      createdAt: Date.parse('2026-09-20T10:00:00Z'),
      updatedAt: Date.parse('2026-09-20T10:05:00Z'),
      messages: [
        { id: 'm1', role: 'user', content: 'Can you suggest a stronger opening line for this scene?' },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Try leading with the storm imagery:\nIt sets mood before dialogue.\n\nA separate closing thought.',
          streaming: false,
          contextStats: { tokens: 128 },
          usage: { promptTokens: 400, completionTokens: 40 },
        },
      ],
    }]
    const xml = await readDocumentXml(await createProjectDocxBlob(data))

    expect(xml).toContain('Chat 1')
    expect(xml).toContain('Can you suggest a stronger opening line for this scene?')
    expect(xml).toContain('Try leading with the storm imagery')
    expect(xml).toContain('A separate closing thought.')

    const idxYou = xml.indexOf('>You<')
    const idxAI = xml.indexOf('>AI<')
    const idxUserMsg = xml.indexOf('Can you suggest a stronger opening line')
    const idxAssistantMsg = xml.indexOf('Try leading with the storm imagery')
    expect(idxYou).toBeGreaterThanOrEqual(0)
    expect(idxAI).toBeGreaterThan(idxYou)
    expect(idxUserMsg).toBeGreaterThan(idxYou)
    expect(idxAssistantMsg).toBeGreaterThan(idxAI)

    // The assistant message's own single-line break survives as a real
    // <w:br/> inside one <w:p>, and its blank-line break lands as a genuinely
    // separate <w:p>, matching the same fidelity guaranteed for manuscript
    // scene content.
    const assistantBlockMatch = xml.match(/<w:p[^>]*>(?:(?!<w:p[ >]).)*Try leading with the storm imagery(?:(?!<w:p[ >]).)*<\/w:p>/s)
    expect(assistantBlockMatch).toBeTruthy()
    expect((assistantBlockMatch[0].match(/<w:br\s*\/>/g) || []).length).toBe(1)
    expect(assistantBlockMatch[0]).not.toContain('A separate closing thought.')
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

  // Regression coverage for the 2026-08-07 ROADMAP bug row: addDocParagraphs
  // (used for manuscript scene content, AI chat messages, and every other
  // free-text section) must emit a real <w:br/> for a single line break the
  // writer typed on purpose (dialogue one line per beat, poetry, etc.), and a
  // genuinely separate <w:p> for a blank-line paragraph break — never joining
  // either into one run-on line with a plain space.
  it('emits real <w:br/> line breaks and separate <w:p> paragraph breaks for manuscript scene content', async () => {
    const data = makeProjectData()
    data.project.enabledSections = ['manuscript']
    data.scenes[0].content =
      '"Are you coming?" Mira asked.\n"Not yet," said Tomas.\n"We don\'t have much time."\n\nThe rain had not let up since morning, and the road ahead was a ribbon of mud.'
    const xml = await readDocumentXml(await createProjectDocxBlob(data))

    const dialogueBlockMatch = xml.match(/<w:p[^>]*>(?:(?!<w:p[ >]).)*Are you coming(?:(?!<w:p[ >]).)*<\/w:p>/s)
    expect(dialogueBlockMatch).toBeTruthy()
    expect((dialogueBlockMatch[0].match(/<w:br\s*\/>/g) || []).length).toBe(2)
    expect(dialogueBlockMatch[0]).toContain('Not yet')
    expect(xml).not.toMatch(/coming\?" Mira asked\. "Not yet/) // the old, buggy space-joined shape

    expect(dialogueBlockMatch[0]).not.toContain('road ahead was a ribbon of mud')
    const proseBlockMatch = xml.match(/<w:p[^>]*>(?:(?!<w:p[ >]).)*road ahead was a ribbon of mud(?:(?!<w:p[ >]).)*<\/w:p>/s)
    expect(proseBlockMatch).toBeTruthy()
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
