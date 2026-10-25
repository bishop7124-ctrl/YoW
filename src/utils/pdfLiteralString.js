import { assertPdfInputSizeOk } from './archiveImportLimits.js'

// YOW's visual PDFs use WinAnsi, including octal-escaped bytes. Decode in one
// pass: chained replacements would turn an escaped backslash followed by "n"
// into a newline, or reinterpret an octal-decoded backslash as another escape.
// Windows-1252 bytes 0x80-0x9F come from an explicit table: some Node builds' TextDecoder("windows-1252")
// returns the raw C1 control character instead (the file is also read as latin-1, so unescaped bytes arrive that way).
const WIN_ANSI_HIGH = [
  '\u20ac', '\u0081', '\u201a', '\u0192', '\u201e', '\u2026', '\u2020', '\u2021', '\u02c6', '\u2030', '\u0160', '\u2039', '\u0152', '\u008d', '\u017d', '\u008f',
  '\u0090', '\u2018', '\u2019', '\u201c', '\u201d', '\u2022', '\u2013', '\u2014', '\u02dc', '\u2122', '\u0161', '\u203a', '\u0153', '\u009d', '\u017e', '\u0178',
]
const winAnsiChar = (code) => (code >= 0x80 && code <= 0x9f ? WIN_ANSI_HIGH[code - 0x80] : String.fromCharCode(code))

export function decodePdfLiteralString(value) {
  value = value.replace(/[\u0080-\u009f]/g, (c) => winAnsiChar(c.charCodeAt(0)))
  return value.replace(/\\(?:([0-7]{1,3})|(\r\n|\r|\n)|([\s\S]))/g, (_, octal, continuation, escaped) => {
    if (octal) return winAnsiChar(parseInt(octal, 8) & 255)
    if (continuation) return ''
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' })[escaped] ?? escaped
  })
}

// Extract plain text from a YOW visual PDF (uncompressed content streams).
// Decodes as latin-1 (lossless byte↔char), then extracts (text) Tj operators
// from BT...ET blocks — the exact format YOW's hand-crafted PDF generator produces.
export async function readPdfFile(file) {
  const buffer = await file.arrayBuffer()
  assertPdfInputSizeOk(buffer.byteLength, `"${file.name}"`)
  const raw = new TextDecoder('latin1').decode(buffer)
  // This reader only understands the plain text streams YOW's own PDF export writes. A PDF from another
  // app usually compresses its text, and the few uncompressed fragments it still has (titles, page
  // numbers) would import as if they were the whole document, so refuse it plainly (audit YOW-22).
  if (/\/FlateDecode/.test(raw) && !/\/Producer \(Your Own World\)/.test(raw)) {
    throw new Error(`"${file.name}" was not made by YOW, and its text cannot be read reliably from a PDF. Export it from the original app as a Word (.docx) or plain text file and import that instead.`)
  }
  const parts = []
  const btRe = /BT([\s\S]*?)ET/g
  let bt
  while ((bt = btRe.exec(raw)) !== null) {
    const tjRe = /\(((?:[^\\()]|\\[\s\S])*)\)\s*Tj/g
    let tj
    while ((tj = tjRe.exec(bt[1])) !== null) {
      const s = decodePdfLiteralString(tj[1])
      if (s.trim()) parts.push(s.trim())
    }
  }
  const content = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!content) throw new Error(`Could not extract text from "${file.name}". Try a YOW .zip export for lossless import.`)
  return { name: file.name, content }
}

