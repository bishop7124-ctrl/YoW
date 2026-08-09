import { unzipSync } from 'fflate'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

// Standard OOXML heading style IDs (case-insensitive, spaces stripped).
// `heading` (bare, no number) is Apple Pages' own top-level heading style —
// confirmed directly against a real user file (2026-08-09, see
// docs/ROADMAP.md): a manuscript re-saved by Pages before being re-imported
// here had its 3 real act titles ("Act 1: Arrival", etc.) tagged with the
// bare "Heading" style, distinct from "Heading 2" (which Pages used for
// both real chapter headings and, in that same file, nearly every body
// paragraph — see MAX_HEADING_LEVEL_FRACTION below for how that's handled).
// Without this entry those act titles carried no recognized style at all
// and were silently swallowed into scene content, collapsing every act
// into one.
const HEADING_LEVEL_MAP = {
  title: 1,
  heading: 1,
  heading1: 1,
  heading2: 2,
  heading3: 3,
  heading4: 4,
  heading5: 4,
  subtitle: 3,
}

function getHeadingLevel(styleId) {
  if (!styleId) return 0
  return HEADING_LEVEL_MAP[styleId.toLowerCase().replace(/\s+/g, '')] ?? 0
}

// A paragraph tagged with a heading style is only trusted as a title up to
// this length. Real act/chapter/scene titles are short; a "heading" holding
// hundreds of characters of prose means the source file mis-tagged body text
// as a heading — most commonly a .docx re-saved by a different word
// processor (Apple Pages, in the incident this guards, has been seen writing
// its own "Heading 2" style onto nearly every body paragraph) before being
// re-imported here, not a writer who wrote an actual 300-character chapter
// title. Demoting an over-length "heading" back to body content is always
// the safer read: a real title never approaches this length, and a
// mis-tagged paragraph lands as scene content instead of silently
// swallowing it as the chapter name — see docs/ROADMAP.md, 2026-08-09.
const MAX_PLAUSIBLE_HEADING_LENGTH = 200

function isSceneBreak(text) {
  if (!text) return false
  const stripped = text.replace(/\s/g, '')
  // Must be at least 3 of the break chars, with nothing else
  return stripped.length >= 3 && /^[*\-~#]+$/.test(stripped)
}

function getWAttr(el, localName) {
  // Try prefixed form first (works in most browsers for XML), fall back to namespaced
  return el.getAttribute(`w:${localName}`)
    || el.getAttributeNS(W_NS, localName)
    || ''
}

function extractParaText(para) {
  let text = ''

  function walk(node) {
    const name = node.localName
    // Skip tracked deletions
    if (name === 'del') return
    // Text run content
    if (name === 't') { text += node.textContent; return }
    // Tab character
    if (name === 'tab') { text += '\t'; return }
    // Line break (but not page/column breaks)
    if (name === 'br') {
      const t = getWAttr(node, 'type')
      if (!t || t === 'textWrapping') text += '\n'
      return
    }
    // Recurse into children (handles hyperlinks, bookmarks, ins, etc.)
    for (const child of node.childNodes) walk(child)
  }

  walk(para)
  return text.trim()
}

// Patterns for recognizing a genuine structural heading by its own text —
// used both to classify H1s in detectMode() below, and, more importantly,
// as the thing that lets a real chapter/act title survive the density
// guard immediately below even when it shares a style with a pile of
// mis-tagged body text (a real user file did exactly this: real chapter
// headings and ~1,279 mis-tagged body paragraphs both carried "Heading 2",
// with nothing in the style itself to tell them apart — only the text
// does).
const ACT_RE = /^(act|part)\s*[\divxlcdm]+/i
const CHAPTER_RE = /^(chapter|ch\.?\s*\d+|prologue|epilogue|interlude|coda|preface|afterword)/i

// A second, independent guard against a heading style mis-applied to body
// text: even when every individual paragraph is short enough to pass the
// per-paragraph length check above (this app's own QA fixture that
// surfaced this incident has plenty of short dialogue lines, so the length
// guard alone didn't catch it), a heading level used on an implausibly
// large *fraction* of the whole document is itself the tell. A real
// chapter-heading style marks a handful of boundaries in a manuscript full
// of body paragraphs — it is never most of the document. Only applies past
// a minimum paragraph count so a short document with a handful of real
// headings can't trip it by chance.
const MAX_HEADING_LEVEL_FRACTION = 0.3
const MIN_PARAGRAPHS_FOR_FRACTION_CHECK = 20

function looksLikeAStructuralTitle(text) {
  return ACT_RE.test(text) || CHAPTER_RE.test(text)
}

function sanitizeHeadingLevels(paragraphs) {
  if (paragraphs.length < MIN_PARAGRAPHS_FOR_FRACTION_CHECK) return paragraphs

  const countsByLevel = new Map()
  paragraphs.forEach(p => {
    if (!p.level) return
    countsByLevel.set(p.level, (countsByLevel.get(p.level) || 0) + 1)
  })

  const untrustworthyLevels = new Set()
  countsByLevel.forEach((count, level) => {
    if (count / paragraphs.length > MAX_HEADING_LEVEL_FRACTION) untrustworthyLevels.add(level)
  })
  if (!untrustworthyLevels.size) return paragraphs

  // An over-used level isn't demoted wholesale: a paragraph that still
  // *reads* like a real chapter/act title (matches the same patterns
  // detectMode already trusts for classifying H1s) survives even inside an
  // untrustworthy level — real structure alongside the noise isn't lost,
  // only the paragraphs that don't look like titles are demoted to content.
  return paragraphs.map(p => (
    untrustworthyLevels.has(p.level) && !looksLikeAStructuralTitle(p.text) ? { ...p, level: 0 } : p
  ))
}

function parseParagraphs(xmlStr) {
  const xmlDoc = new DOMParser().parseFromString(xmlStr, 'application/xml')
  const paras = Array.from(xmlDoc.getElementsByTagNameNS(W_NS, 'p'))

  const withRawLevels = paras.map(para => {
    const pPr = para.getElementsByTagNameNS(W_NS, 'pPr')[0]
    const pStyle = pPr ? pPr.getElementsByTagNameNS(W_NS, 'pStyle')[0] : null
    const styleId = pStyle ? getWAttr(pStyle, 'val') : ''

    const text = extractParaText(para)
    const rawLevel = getHeadingLevel(styleId)
    const level = rawLevel && text.length > MAX_PLAUSIBLE_HEADING_LENGTH ? 0 : rawLevel

    return { styleId, text, level }
  })

  return sanitizeHeadingLevels(withRawLevels).map(p => (
    { ...p, sceneBreak: !p.level && isSceneBreak(p.text) }
  ))
}

function detectMode(paragraphs) {
  const h1s = paragraphs.filter(p => p.level === 1)
  const h2s = paragraphs.filter(p => p.level === 2)

  const anyActH1 = h1s.some(p => ACT_RE.test(p.text))
  const anyChapH1 = h1s.some(p => CHAPTER_RE.test(p.text))

  // If any H1 is explicitly labelled "Act" or "Part", or H1s are present but H2s look like
  // chapters (i.e. H1 is acting as a grouping above chapter level), use 3-tier structure.
  if (anyActH1 || (h1s.length > 0 && !anyChapH1 && h2s.length > 0)) {
    return 'act-chapter-scene'
  }
  // H1s that look like chapters (no acts)
  if (h1s.length > 0) return 'chapter-scene'
  // Only H2 headings present
  if (h2s.length > 0) return 'h2chapter-scene'
  // No headings — split by scene break markers only
  return 'flat'
}

function buildStructure(paragraphs) {
  const mode = detectMode(paragraphs)

  const acts = []
  let currentAct = null
  let currentChapter = null
  let pendingSceneTitle = 'Scene'
  let contentBuf = []

  const commitScene = () => {
    const content = contentBuf.join('\n\n').trim()
    contentBuf = []
    if (!content) return

    if (!currentAct) {
      currentAct = { title: 'Act 1', chapters: [] }
      acts.push(currentAct)
    }
    if (!currentChapter) {
      currentChapter = { title: 'Chapter 1', scenes: [] }
      currentAct.chapters.push(currentChapter)
    }

    currentChapter.scenes.push({ title: pendingSceneTitle, content })
    pendingSceneTitle = 'Scene'
  }

  const newAct = (title) => {
    commitScene()
    currentAct = { title, chapters: [] }
    currentChapter = null
    acts.push(currentAct)
  }

  const newChapter = (title) => {
    commitScene()
    if (!currentAct) { currentAct = { title: 'Act 1', chapters: [] }; acts.push(currentAct) }
    currentChapter = { title, scenes: [] }
    currentAct.chapters.push(currentChapter)
    pendingSceneTitle = 'Scene'
  }

  const newScene = (title = 'Scene') => {
    commitScene()
    pendingSceneTitle = title
  }

  for (const p of paragraphs) {
    if (mode === 'act-chapter-scene') {
      if (p.level === 1) newAct(p.text)
      else if (p.level === 2) newChapter(p.text)
      else if (p.level >= 3) newScene(p.text)
      else if (p.sceneBreak) newScene()
      else if (p.text) contentBuf.push(p.text)
    } else if (mode === 'chapter-scene') {
      if (p.level === 1) newChapter(p.text)
      else if (p.level === 2 || p.level === 3) newScene(p.text)
      else if (p.sceneBreak) newScene()
      else if (p.text) contentBuf.push(p.text)
    } else if (mode === 'h2chapter-scene') {
      if (p.level === 2) newChapter(p.text)
      else if (p.level === 3 || p.level === 4) newScene(p.text)
      else if (p.sceneBreak) newScene()
      else if (p.text) contentBuf.push(p.text)
    } else {
      // flat — split only on scene breaks
      if (p.sceneBreak) newScene()
      else if (p.text) contentBuf.push(p.text)
    }
  }

  commitScene()

  // Fallback: at minimum one act/chapter/scene
  if (!acts.length) {
    return [{ title: 'Act 1', chapters: [{ title: 'Chapter 1', scenes: [] }] }]
  }

  return acts
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function parseDocxToStructure(file) {
  const uint8 = new Uint8Array(await file.arrayBuffer())

  let files
  try {
    files = unzipSync(uint8)
  } catch {
    throw new Error('Could not open the file — make sure it is a valid .docx file.')
  }

  const docEntry = files['word/document.xml']
  if (!docEntry) throw new Error('No document content found in this file.')

  const xmlStr = new TextDecoder().decode(docEntry)
  const paragraphs = parseParagraphs(xmlStr)
  return buildStructure(paragraphs)
}

export function countImportStats(acts) {
  let chapters = 0, scenes = 0, words = 0
  for (const act of acts) {
    chapters += act.chapters.length
    for (const chapter of act.chapters) {
      scenes += chapter.scenes.length
      for (const scene of chapter.scenes) {
        words += scene.content?.trim().split(/\s+/).filter(Boolean).length || 0
      }
    }
  }
  return { totalActs: acts.length, totalChapters: chapters, totalScenes: scenes, totalWords: words }
}
