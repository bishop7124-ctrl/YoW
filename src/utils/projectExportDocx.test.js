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
    enabledSections: ['outline', 'characters', 'locations', 'lore', 'ideas', 'schedule', 'timeline', 'worldhistory'],
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
  it('includes project AI chat sessions in the Word export', async () => {
    const blob = await createProjectDocxBlob(makeProjectData())

    const xml = await readDocumentXml(blob)

    expect(xml).toContain('AI Chats')
    expect(xml).toContain('Plot Help')
    expect(xml).toContain('What should happen in chapter two?')
    expect(xml).toContain('Raise the cost of the rescue.')
  })

  it('can create a ZIP containing separate Word documents per export category', async () => {
    const blob = await createProjectDocxZipBlob(makeProjectData())
    const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    const names = Object.keys(zip).sort()

    expect(names).toEqual([
      'Stormrider-AI-Chats.docx',
      'Stormrider-Characters.docx',
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
})
