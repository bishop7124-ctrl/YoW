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

// Regression test for a real user report (2026-08-09, see docs/ROADMAP.md):
// a manuscript exported from this app, then re-saved by a different word
// processor (Apple Pages, confirmed by comparing the reported file's OOXML
// structure directly against this app's own real export output) before
// being re-imported, came back with "most of the text in the chapter name."
// Pages had tagged nearly every body paragraph with its own "Heading 2"
// style. This app's own export never does that (verified: it always leaves
// scene-content paragraphs with no explicit style, i.e. Word's default
// "Normal"), so the round trip through this app alone was never broken —
// but the importer trusted *any* heading-styled paragraph's full text as a
// title with no sanity check, so a different app's mis-tagging silently
// swallowed real prose as a chapter name. These tests build the exact shape
// of a mis-tagged file directly (not through this app's own export helper,
// which never produces it) to confirm the importer now defends against it
// regardless of which tool did the mis-tagging.
describe('docx import defends against heading styles mis-applied to body text', () => {
  async function buildDocxWithHeadingStyledParagraphs(paragraphs) {
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx')
    const HEADING_BY_LEVEL = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2 }
    const children = paragraphs.map(({ text, level, bareHeadingStyle }) => new Paragraph({
      text,
      // `bareHeadingStyle` sets the raw style ID directly, the same way
      // Apple Pages' own bare "Heading" (no number) style comes through —
      // there's no numbered `HeadingLevel` shorthand for it.
      ...(bareHeadingStyle ? { style: 'Heading' } : level ? { heading: HEADING_BY_LEVEL[level] } : {}),
    }))
    const doc = new Document({ sections: [{ properties: {}, children }] })
    const blob = await Packer.toBlob(doc)
    return { arrayBuffer: () => blob.arrayBuffer() }
  }

  it('treats an implausibly long "heading" paragraph as scene content, not a chapter title', async () => {
    const longMisTaggedParagraph = 'She turned without ceremony and he followed her through a narrow alley that smelled of brine and old rain, out onto a cobblestone plaza where a fountain stood dry, its basin cracked down the centre as though something enormous had struck it from above. Several people sat on the rim, talking in low voices that stopped entirely when they saw him.'
    expect(longMisTaggedParagraph.length).toBeGreaterThan(200) // sanity-check the fixture itself

    const file = await buildDocxWithHeadingStyledParagraphs([
      { text: 'Act 1', level: 1 },
      { text: 'Chapter 1', level: 2 },
      { text: longMisTaggedParagraph, level: 2 }, // mis-tagged, like Pages did
    ])
    const acts = await parseDocxToStructure(file)

    const chapter = acts[0].chapters[0]
    expect(chapter.title).toBe('Chapter 1') // NOT the long paragraph
    const sceneText = chapter.scenes.map(s => s.content).join('\n\n')
    expect(sceneText).toContain(longMisTaggedParagraph) // landed as content instead
  })

  it('still treats a real, short heading-styled paragraph as a title', async () => {
    const file = await buildDocxWithHeadingStyledParagraphs([
      { text: 'Act 1', level: 1 },
      { text: 'Chapter 3: The Impossible Map', level: 2 },
      { text: 'Real scene content here.', level: 0 },
    ])
    const acts = await parseDocxToStructure(file)
    expect(acts[0].chapters[0].title).toBe('Chapter 3: The Impossible Map')
  })

  it('reproduces the exact reported shape: dozens of body paragraphs all mis-tagged as headings collapse into one chapter, not dozens of one-line chapters', async () => {
    const bodyParagraphs = Array.from({ length: 30 }, (_, i) =>
      `This is body paragraph number ${i + 1}, a normal sentence of real manuscript prose that a different word processor mis-tagged as a heading style before this file was re-imported into this app, well past the two-hundred-character plausible-heading-length threshold.`
    )
    bodyParagraphs.forEach(p => expect(p.length).toBeGreaterThan(200)) // sanity-check the fixture
    const file = await buildDocxWithHeadingStyledParagraphs([
      { text: 'Chapter 1', level: 2 },
      ...bodyParagraphs.map(text => ({ text, level: 2 })), // every single one mis-tagged
    ])
    const acts = await parseDocxToStructure(file)

    // Without the fix, each mis-tagged paragraph starts its own new chapter
    // titled with its own text — the exact "text went into the chapter
    // name" report. With it, they all fall back to being one chapter's
    // scene content.
    const allChapters = acts.flatMap(a => a.chapters)
    expect(allChapters).toHaveLength(1)
    expect(allChapters[0].title).toBe('Chapter 1')
    const sceneText = allChapters[0].scenes.map(s => s.content).join('\n\n')
    bodyParagraphs.forEach(p => expect(sceneText).toContain(p))
  })

  // Regression test for a second real finding on the same reported file
  // (2026-08-09, see docs/ROADMAP.md): after the fixes above stopped body
  // text from swallowing chapter names, the user reported the import still
  // wasn't picking up the manuscript's real act/chapter structure — "there
  // are most definitely multiple acts... but it's only made one act".
  // Root cause: Apple Pages tags its own top-level heading with a *bare*
  // "Heading" style (no number), which this importer's HEADING_LEVEL_MAP
  // didn't recognize at all — the file's 3 real act titles ("Act 1:
  // Arrival", "Act 2: The Wood", "Act 3: Resolution") carried that style
  // and were silently read as ordinary body text, collapsing every act
  // into one.
  it('recognizes Apple Pages\' bare "Heading" style as a top-level (act) heading', async () => {
    const file = await buildDocxWithHeadingStyledParagraphs([
      { text: 'Act 1: Arrival', bareHeadingStyle: true },
      { text: 'Chapter 1', level: 2 },
      { text: 'Scene content in act one.', level: 0 },
      { text: 'Act 2: The Wood', bareHeadingStyle: true },
      { text: 'Chapter 2', level: 2 },
      { text: 'Scene content in act two.', level: 0 },
    ])
    const acts = await parseDocxToStructure(file)
    expect(acts.map(a => a.title)).toEqual(['Act 1: Arrival', 'Act 2: The Wood'])
  })

  // The other half of the same finding: real chapter headings in that file
  // shared the exact same "Heading 2" style as ~1,279 mis-tagged body
  // paragraphs, with nothing in the style itself to tell them apart. The
  // density guard (previous test) correctly demotes the level as a whole,
  // but a blanket demotion would also have erased the real chapter
  // headings mixed into the same noisy level — this confirms they survive
  // because their own text still looks like a real chapter title.
  it('keeps real chapter headings that share an over-used style with mis-tagged body text, alongside demoting the noise', async () => {
    // Deliberately short — under MAX_PLAUSIBLE_HEADING_LENGTH — so the
    // per-paragraph length guard can't demote these on its own. That's the
    // real reported shape: the file's mis-tagged body text was often short
    // dialogue lines, not long prose, so only the density guard (not the
    // length guard) is what has to tell real titles apart from the noise
    // here. A body paragraph this short must never look like a title either
    // (no leading "Chapter"/"Act" wording) so it can't accidentally survive
    // via looksLikeAStructuralTitle instead of via a real fix.
    const bodyParagraphs = Array.from({ length: 25 }, (_, i) => `Body line ${i + 1} of ordinary prose.`)
    bodyParagraphs.forEach(p => expect(p.length).toBeLessThan(200)) // sanity-check the fixture
    const file = await buildDocxWithHeadingStyledParagraphs([
      { text: 'Chapter 1', level: 2 },
      ...bodyParagraphs.slice(0, 12).map(text => ({ text, level: 2 })),
      { text: 'Chapter 2', level: 2 }, // a real chapter title, same style as the noise around it
      ...bodyParagraphs.slice(12).map(text => ({ text, level: 2 })),
    ])
    const acts = await parseDocxToStructure(file)

    const chapterTitles = acts.flatMap(a => a.chapters).map(c => c.title)
    expect(chapterTitles).toEqual(['Chapter 1', 'Chapter 2'])
    const sceneText = acts.flatMap(a => a.chapters).flatMap(c => c.scenes).map(s => s.content).join('\n\n')
    bodyParagraphs.forEach(p => expect(sceneText).toContain(p))
  })
})
