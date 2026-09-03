import { describe, expect, it } from 'vitest'
import { createProjectPdfBlob } from './projectExportPdf.js'

const YOW_BEGIN = '%%YOW-DATA-BEGIN%%'
const YOW_END = '%%YOW-DATA-END%%'

const extractEmbeddedYowData = (pdfText) => {
  const start = pdfText.indexOf(YOW_BEGIN)
  const end = pdfText.indexOf(YOW_END)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return JSON.parse(pdfText.slice(start + YOW_BEGIN.length, end).trim())
}

const baseProjectData = (enabledSections) => ({
  project: {
    id: 'project-1',
    title: 'Embed Scoping QA',
    type: 'novel',
    enabledSections,
  },
  characters: [{ id: 'char-1', name: 'Rendered Hero', bio: 'A visible hero bio.' }],
  factions: [{ id: 'faction-1', name: 'Secret Cabal', description: 'GM-only faction secrets.' }],
  locations: [{ id: 'loc-1', name: 'Hidden Vault', description: 'A private location note.' }],
  loreEntries: [{ id: 'lore-1', title: 'Forbidden Lore', content: 'Not meant for beta readers.' }],
  timeline: [{ id: 'tl-1', title: 'Secret Event', description: 'A confidential timeline beat.' }],
  worldHistory: [{ id: 'wh-1', title: 'Hidden History', description: 'A private history entry.' }],
  maps: [{ id: 'map-1', name: 'Undisclosed Map' }],
  ideaEntries: [{ id: 'idea-1', title: 'Secret Idea', content: 'A private idea note.' }],
  acts: [{ id: 'act-1', novelId: 'project-1', title: 'Act One', order: 0 }],
  chapters: [{ id: 'chap-1', novelId: 'project-1', actId: 'act-1', title: 'Chapter One', order: 0 }],
  scenes: [{ id: 'scene-1', novelId: 'project-1', chapterId: 'chap-1', title: 'Scene One', content: 'Private manuscript prose that never renders in the visual PDF.', order: 0 }],
  storySchedule: [{ id: 'sched-1', title: 'Private session date' }],
})

describe('createProjectPdfBlob — embedded /YOW data scoping', () => {
  it('excludes a disabled section\'s data from the embedded stream while keeping it for enabled sections', async () => {
    const projectData = baseProjectData(['characters', 'locations', 'timeline'])
    const blob = await createProjectPdfBlob(projectData)
    const pdfText = new TextDecoder().decode(await blob.arrayBuffer())
    const embedded = extractEmbeddedYowData(pdfText)

    // Enabled sections keep their data in the embed.
    expect(embedded.characters).toHaveLength(1)
    expect(embedded.characters[0].name).toBe('Rendered Hero')
    expect(embedded.locations).toHaveLength(1)
    expect(embedded.timeline).toHaveLength(1)

    // Disabled sections are emptied out of the embed, not just off the visible pages.
    expect(embedded.factions).toEqual([])
    expect(embedded.loreEntries).toEqual([])
    expect(embedded.worldHistory).toEqual([])
    expect(embedded.maps).toEqual([])
    expect(embedded.ideaEntries).toEqual([])
    expect(embedded.storySchedule).toEqual([])

    // 'outline' is disabled here, so manuscript prose — never shown on any
    // visual PDF page — must not ride along in the embed either.
    expect(embedded.acts).toEqual([])
    expect(embedded.chapters).toEqual([])
    expect(embedded.scenes).toEqual([])
    expect(pdfText).not.toContain('Private manuscript prose that never renders')

    // Disabled-section text must not appear anywhere in the file at all —
    // neither on the rendered pages nor in the embed.
    expect(pdfText).not.toContain('Secret Cabal')
    expect(pdfText).not.toContain('GM-only faction secrets')
    expect(pdfText).not.toContain('Forbidden Lore')
  })

  it('includes a section\'s data in the embed once it is enabled', async () => {
    const projectData = baseProjectData(['characters', 'factions', 'lore', 'outline'])
    const blob = await createProjectPdfBlob(projectData)
    const pdfText = new TextDecoder().decode(await blob.arrayBuffer())
    const embedded = extractEmbeddedYowData(pdfText)

    expect(embedded.factions).toHaveLength(1)
    expect(embedded.factions[0].name).toBe('Secret Cabal')
    expect(embedded.loreEntries).toHaveLength(1)
    expect(embedded.loreEntries[0].title).toBe('Forbidden Lore')
    expect(embedded.acts).toHaveLength(1)
    expect(embedded.chapters).toHaveLength(1)
    expect(embedded.scenes).toHaveLength(1)

    expect(pdfText).toContain('Secret Cabal')
  })

  it('keeps characters embedded when only familytree (not characters) is enabled, matching what the Relationship Atlas page renders', async () => {
    const projectData = baseProjectData(['familytree'])
    const blob = await createProjectPdfBlob(projectData)
    const pdfText = new TextDecoder().decode(await blob.arrayBuffer())
    const embedded = extractEmbeddedYowData(pdfText)

    expect(embedded.characters).toHaveLength(1)
    expect(embedded.characters[0].name).toBe('Rendered Hero')
  })

  it('leaves visible-page rendering unaffected by the embed scoping', async () => {
    const projectData = baseProjectData(['characters', 'locations'])
    const blob = await createProjectPdfBlob(projectData)
    const pdfText = new TextDecoder().decode(await blob.arrayBuffer())

    // Enabled sections still render their content on the vector-drawn pages.
    expect(pdfText).toContain('Rendered Hero')
    expect(pdfText).toContain('Hidden Vault')
    // Disabled section content is correctly absent from the pages too.
    expect(pdfText).not.toContain('Secret Cabal')
  })
})
