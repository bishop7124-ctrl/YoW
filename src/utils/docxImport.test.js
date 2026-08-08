// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseDocxToStructure } from './docxImport.js'

// Builds a docx paragraph the same way exportToDocx (Manuscript/FinalizedReader.jsx)
// and addDocParagraphs (projectExportDocx.js) do: one <w:p> per `\n{2,}`-separated
// block, with `break: 1` between lines within a block so single line breaks the
// writer typed on purpose (dialogue formatted one line per beat, poetry, etc.)
// survive as a real <w:br/> instead of being silently joined into one run-on line
// with a space — see the 2026-08-07 ROADMAP bug row for the incident this guards.
async function buildDocxFromContent(content) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
  const children = [new Paragraph({ text: 'Chapter 1', heading: HeadingLevel.HEADING_1 })]
  content.split(/\n{2,}/).forEach(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    children.push(new Paragraph({
      children: lines.map((line, index) => new TextRun({
        text: line,
        ...(index > 0 ? { break: 1 } : {}),
      })),
    }))
  })
  const doc = new Document({ sections: [{ properties: {}, children }] })
  const blob = await Packer.toBlob(doc)
  return { arrayBuffer: () => blob.arrayBuffer() }
}

describe('docx export/import line-break round trip', () => {
  it('preserves single line breaks within a paragraph as real line breaks, not spaces', async () => {
    const content = 'Line one.\nLine two.\nLine three.'
    const file = await buildDocxFromContent(content)
    const acts = await parseDocxToStructure(file)
    const sceneText = acts.flatMap(a => a.chapters).flatMap(c => c.scenes).map(s => s.content).join('\n\n')
    expect(sceneText).toContain('Line one.\nLine two.\nLine three.')
  })

  it('preserves double line breaks as separate paragraph blocks', async () => {
    const content = 'First paragraph.\n\nSecond paragraph.'
    const file = await buildDocxFromContent(content)
    const acts = await parseDocxToStructure(file)
    const sceneText = acts.flatMap(a => a.chapters).flatMap(c => c.scenes).map(s => s.content).join('\n\n')
    expect(sceneText).toContain('First paragraph.\n\nSecond paragraph.')
  })

  it('preserves a mix of soft (single) and hard (double) line breaks together', async () => {
    const content = 'Line one.\nLine two.\n\nA new paragraph.\nWith its own second line.'
    const file = await buildDocxFromContent(content)
    const acts = await parseDocxToStructure(file)
    const sceneText = acts.flatMap(a => a.chapters).flatMap(c => c.scenes).map(s => s.content).join('\n\n')
    expect(sceneText).toContain('Line one.\nLine two.\n\nA new paragraph.\nWith its own second line.')
  })
})
