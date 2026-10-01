import { buildStructureFromParagraphs } from './docxImport.js'

const MAX_PLAIN_TEXT_BYTES = 20 * 1024 * 1024
const NUMBER_LABEL = '(?:\\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)'
const ACT_RE = new RegExp(`^(?:act|part|book)\\s+${NUMBER_LABEL}\\b`, 'i')
const CHAPTER_RE = new RegExp(`^(?:chapter\\s+${NUMBER_LABEL}\\b|ch\\.?\\s*${NUMBER_LABEL}\\b|prologue\\b|epilogue\\b|interlude\\b|coda\\b|preface\\b|afterword\\b)`, 'i')
const SCENE_RE = new RegExp(`^scene(?:\\s+${NUMBER_LABEL}\\b|\\s*:)`, 'i')

function isSceneBreak(text) {
  const stripped = text.replace(/\s/g, '')
  return stripped.length >= 3 && /^[*\-~#]+$/.test(stripped)
}

function plainTextParagraphs(source) {
  const text = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const raw = text.split('\n')
  const hasExplicitActs = raw.some(line => ACT_RE.test(line.trim().replace(/^#{1,6}\s+/, '')))

  return raw.map(line => {
    const trimmed = line.trim()
    const markdown = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/)
    if (markdown) {
      return { text: markdown[2].trim(), level: Math.min(markdown[1].length, 4), sceneBreak: false, styleId: 'markdown' }
    }
    if (ACT_RE.test(trimmed)) return { text: trimmed, level: 1, sceneBreak: false, styleId: 'plain-act' }
    if (CHAPTER_RE.test(trimmed)) return { text: trimmed, level: hasExplicitActs ? 2 : 1, sceneBreak: false, styleId: 'plain-chapter' }
    if (SCENE_RE.test(trimmed)) return { text: trimmed, level: hasExplicitActs ? 3 : 2, sceneBreak: false, styleId: 'plain-scene' }
    return { text: trimmed, level: 0, sceneBreak: isSceneBreak(trimmed), styleId: '' }
  })
}

/**
 * Convert a UTF-8 .txt/.md manuscript into the same act/chapter/scene shape
 * used by DOCX imports. Structural labels are deliberately conservative so
 * ordinary short prose lines are not mistaken for headings.
 */
export function parsePlainTextToStructure(text) {
  if (!String(text || '').trim()) throw new Error('No manuscript text was found in this file.')
  return buildStructureFromParagraphs(plainTextParagraphs(text))
}

export async function parsePlainTextFileToStructure(file) {
  const label = file?.name ? `"${file.name}"` : 'This file'
  if (typeof file?.size === 'number' && file.size > MAX_PLAIN_TEXT_BYTES) {
    throw new Error(`${label} is too large to import as plain text (max 20MB).`)
  }
  try {
    return parsePlainTextToStructure(await file.text())
  } catch (error) {
    if (/No manuscript text|too large/.test(error?.message || '')) throw error
    throw new Error(`Could not read ${label} as UTF-8 text.`, { cause: error })
  }
}
