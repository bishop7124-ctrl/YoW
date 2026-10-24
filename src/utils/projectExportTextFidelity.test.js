import { readPdfFile } from './pdfLiteralString.js'
import { describe, expect, it } from 'vitest'
import { cleanText, stripHtml, wordCount } from './projectExportHelpers.js'
import { createProjectPdfBlob } from './projectExportPdf.js'

// Decodes a PDF literal string the way a viewer does for WinAnsiEncoding (Latin-1 range, plus the
// handful of 0x80-0x9F punctuation codes the tests use).
const WIN_ANSI_HIGH = { 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—' }
const decodePdfString = value => value
  .replace(/\\([0-7]{3})/g, (_, octal) => {
    const code = parseInt(octal, 8)
    return WIN_ANSI_HIGH[code] || String.fromCharCode(code)
  })
  .replace(/\\([\\()])/g, '$1')

const drawnText = async (blob) => {
  const raw = new TextDecoder('latin1').decode(await blob.arrayBuffer())
  return [...raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(match => decodePdfString(match[1])).join('\n')
}

const projectWith = (bio) => ({
  project: { id: 'p', title: 'Unicode Book', type: 'novel', enabledSections: ['characters'] },
  characters: [{ id: 'c', novelId: 'p', name: 'Zoë', bio }],
})

describe('readable export text fidelity (audit YOW-08)', () => {
  it('keeps literal angle-bracket prose but still removes real markup', () => {
    expect(cleanText('She read <door opens> and left.')).toBe('She read <door opens> and left.')
    expect(cleanText('If 1 < 2 and 3 > 2 then <b>bold</b> and <em>soft</em>.')).toBe('If 1 < 2 and 3 > 2 then bold and soft.')
    expect(stripHtml('one<br>two</p>three')).toBe('one\ntwo\n\nthree')
    expect(wordCount('<door opens> now')).toBe(3)
  })

  it('draws accented Latin text accurately in the PDF instead of stripping the accents', async () => {
    const blob = await createProjectPdfBlob(projectWith('A café in São Paulo, über naïve façade — “quoted” … 5€'))
    const drawn = await drawnText(blob)
    expect(drawn).toContain('café')
    expect(drawn).toContain('São Paulo')
    expect(drawn).toContain('über naïve façade')
    expect(drawn).toContain('—')
    expect(drawn).toContain('“quoted”')
    expect(blob.unsupportedCharacters).toEqual([])
  })

  it('declares the encoding the drawn bytes use', async () => {
    const raw = new TextDecoder('latin1').decode(await (await createProjectPdfBlob(projectWith('hello'))).arrayBuffer())
    expect(raw).toContain('/Encoding /WinAnsiEncoding')
  })

  it('never silently drops writing the PDF font cannot draw: it marks the gap and reports the characters', async () => {
    const blob = await createProjectPdfBlob(projectWith('Привет 你好 مرحبا'))
    const drawn = await drawnText(blob)
    expect(drawn).not.toMatch(/Привет|你好|مرحبا/)
    expect(drawn).toContain('??????')
    expect(blob.unsupportedCharacters).toEqual(expect.arrayContaining(['П', '你', 'م']))
  })
})

it('reimports the real visual PDF with WinAnsi punctuation and literal backslashes intact', async () => {
  const prose = 'A café — “quoted” … 5€ (notes) and a literal \\n.'
  const blob = await createProjectPdfBlob(projectWith(prose))
  const imported = await readPdfFile({ name: 'roundtrip.pdf', arrayBuffer: () => blob.arrayBuffer() })
  expect(imported.content).toContain(prose)
})
