// Graphic Novel PDF export must carry the real comic pages, panel text and
// any images attached to pages/panels (owner-reported export bug, 2026-10-02).
import { describe, expect, it } from 'vitest'
import { createProjectPdfBlob } from './projectExportPdf.js'

const TINY_JPEG = 'data:image/jpeg;base64,/9j/wAARCAAEAAQDAREAAhEAAxEA/9k='

const makeComicData = () => ({
  project: { id: 'p1', title: 'Skyline', type: 'comic', enabledSections: ['outline'] },
  characters: [], factions: [], locations: [], timeline: [], worldHistory: [], eras: [],
  loreEntries: [], ideaEntries: [], maps: [], whiteboards: [], storySchedule: [], scenes: [],
  acts: [{ id: 'vol1', novelId: 'p1', title: 'Volume One', order: 1 }],
  chapters: [{ id: 'issue1', novelId: 'p1', actId: 'vol1', title: 'Issue One', order: 1 }],
  comicPages: [
    { id: 'pg1', issueId: 'issue1', order: 1, summary: 'PAGE_ONE_SUMMARY', referenceImage: TINY_JPEG },
    { id: 'pg2', issueId: 'issue1', order: 2, summary: 'PAGE_TWO_SUMMARY' },
  ],
  comicPanels: [
    { id: 'pn1', pageId: 'pg1', order: 1, description: 'PANEL_DESCRIPTION', referenceImage: TINY_JPEG, dialogue: [{ speaker: 'Ria', text: 'DIALOGUE_LINE' }] },
  ],
})

const latin1 = async (blob) => new TextDecoder('latin1').decode(await blob.arrayBuffer())
const imageCount = (raw) => (raw.match(/\/Subtype \/Image/g) ?? []).length

describe('createProjectPdfBlob for Graphic Novel projects', () => {
  it('includes comic pages, panel text and attached images', async () => {
    const raw = await latin1(await createProjectPdfBlob(makeComicData()))
    expect(raw).toContain('PAGE_ONE_SUMMARY')
    expect(raw).toContain('PAGE_TWO_SUMMARY')
    expect(raw).toContain('PANEL_DESCRIPTION')
    expect(raw).toContain('DIALOGUE_LINE')
    // one page-art image plus one full-size panel image
    expect(imageCount(raw)).toBeGreaterThanOrEqual(2)
  })

  it('omits comic pages when the outline section is switched off', async () => {
    const data = makeComicData()
    data.project.enabledSections = ['characters']
    const raw = await latin1(await createProjectPdfBlob(data))
    expect(raw).not.toContain('PAGE_ONE_SUMMARY')
  })
})
