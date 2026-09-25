// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { exportToDocx } from './FinalizedReader.jsx'

// exportToDocx (the manuscript toolbar's "Export manuscript as .docx" button)
// always ends by handing its Blob to downloadBlob(), which in a browser
// triggers a real file download. Capture the real Blob it builds instead by
// monkey-patching URL.createObjectURL — the same technique used in a prior
// qa-engineer live-verification pass (see docs/ROADMAP.md's 2026-07-22 row).
async function captureExportedBlob(...args) {
  let capturedBlob = null
  const originalCreate = globalThis.URL.createObjectURL
  const originalRevoke = globalThis.URL.revokeObjectURL
  globalThis.URL.createObjectURL = (blob) => { capturedBlob = blob; return 'blob:qa-test' }
  globalThis.URL.revokeObjectURL = () => {}
  try {
    await exportToDocx(...args)
  } finally {
    globalThis.URL.createObjectURL = originalCreate
    globalThis.URL.revokeObjectURL = originalRevoke
  }
  return capturedBlob
}

async function readDocumentXml(blob) {
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  return strFromU8(zip['word/document.xml'])
}

// Regression coverage for the 2026-08-07 ROADMAP bug row: a single `\n`
// within a scene (dialogue formatted one line per beat, poetry, etc.) must
// survive export as a real OOXML `<w:br/>` line break, not get silently
// joined into one run-on line with a space, while a genuine blank-line
// paragraph break must still land as its own separate `<w:p>`.
describe('FinalizedReader exportToDocx — line-break export fidelity', () => {
  const dialogueContent =
    '"Are you coming?" Mira asked.\n"Not yet," said Tomas.\n"We don\'t have much time."\n\nThe rain had not let up since morning, and the road ahead was a ribbon of mud.'

  const novel = { id: 'proj-1', title: 'QA Manuscript Export', type: 'novel' }
  const acts = [{ id: 'act-1', title: 'Act 1', order: 0 }]
  const chapters = [{ id: 'ch-1', actId: 'act-1', title: 'Chapter 1', order: 0 }]
  const scenes = [{ id: 'scene-9', chapterId: 'ch-1', title: 'Opening', order: 0, content: dialogueContent }]
  const chapterGlobalNumbers = { 'ch-1': 1 }

  it('emits a real <w:br/> at each single-line-break position, not a joining space', async () => {
    const blob = await captureExportedBlob(novel, acts, chapters, scenes, chapterGlobalNumbers)
    expect(blob).toBeTruthy()
    const xml = await readDocumentXml(blob)

    const dialogueBlockMatch = xml.match(/<w:p[^>]*>(?:(?!<w:p[ >]).)*Are you coming(?:(?!<w:p[ >]).)*<\/w:p>/s)
    expect(dialogueBlockMatch).toBeTruthy()
    const dialogueBlock = dialogueBlockMatch[0]
    // 3 lines joined by 2 line breaks within the same <w:p>.
    expect((dialogueBlock.match(/<w:br\s*\/>/g) || []).length).toBe(2)
    expect(dialogueBlock).toContain('Not yet')
    expect(xml).not.toMatch(/coming\?" Mira asked\. "Not yet/) // the old, buggy space-joined shape
  })

  it('emits a genuine separate <w:p> for a blank-line paragraph break, not another <w:br/>', async () => {
    const blob = await captureExportedBlob(novel, acts, chapters, scenes, chapterGlobalNumbers)
    const xml = await readDocumentXml(blob)

    const dialogueBlockMatch = xml.match(/<w:p[^>]*>(?:(?!<w:p[ >]).)*Are you coming(?:(?!<w:p[ >]).)*<\/w:p>/s)
    expect(dialogueBlockMatch[0]).not.toContain('road ahead was a ribbon of mud')
    const proseBlockMatch = xml.match(/<w:p[^>]*>(?:(?!<w:p[ >]).)*road ahead was a ribbon of mud(?:(?!<w:p[ >]).)*<\/w:p>/s)
    expect(proseBlockMatch).toBeTruthy()
    expect((proseBlockMatch[0].match(/<w:br\s*\/>/g) || []).length).toBe(0)
  })
})
