// Regression coverage for docs/QA_PLAN.md's Priority -1 "Archive/document
// imports have no decompression limits" line's remaining "still
// open/not attempted" items: malformed DOCX/PDF/JSON handling, the
// oversized-PDF-restore-marker case, and unsupported schema version. The
// nested-archive/recursion-depth item is covered at the shared-helper level
// in archiveImportLimits.test.js (assertArchiveNestingDepthOk) plus the
// "still works" case below proving the new depth guard doesn't regress the
// one real nested case (novel.docx inside a compatible structured ZIP).
import { describe, it, expect } from 'vitest'
import { zipSync } from 'fflate'
import { MAX_PDF_INPUT_BYTES, MAX_PDF_RESTORE_MARKER_BYTES } from '../utils/archiveImportLimits.js'
import { YOW_EXPORT_SCHEMA_VERSION } from '../utils/projectExportHelpers.js'
import { tryReadYowZip, tryReadYowPdf, tryReadStructuredZip, processFiles } from './AIImportModal.jsx'

function fakeFile(name, arrayBuffer) {
  return { name, arrayBuffer: async () => arrayBuffer }
}

// A fake File-like object whose `arrayBuffer()` only reports a `byteLength`
// — the size guards run on that value before any real decode/decompression
// is attempted, so a real oversized buffer never needs to be allocated.
function fakeOversizedFile(name, byteLength) {
  return { name, arrayBuffer: async () => ({ byteLength }) }
}

function makeYowZipBuffer(manifestOverrides, projectDataBytesOrObject) {
  const manifest = {
    app: 'YOW',
    format: 'yow-project-export',
    exportedAt: '2026-09-01T00:00:00.000Z',
    projectId: 'p1',
    projectTitle: 'Test Project',
    ...manifestOverrides,
  }
  const projectDataBytes = projectDataBytesOrObject instanceof Uint8Array
    ? projectDataBytesOrObject
    : new TextEncoder().encode(JSON.stringify(projectDataBytesOrObject))
  const zipped = zipSync({
    'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
    'project-data.json': projectDataBytes,
  })
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength)
}

describe('tryReadYowZip — malformed JSON handling', () => {
  it('still imports a legacy export with no schemaVersion field at all (backward compatible)', async () => {
    const buffer = makeYowZipBuffer({}, { project: { id: 'p1', title: 'Legacy' }, characters: [] })
    const result = await tryReadYowZip(fakeFile('legacy.zip', buffer))
    expect(result).toEqual({ project: { id: 'p1', title: 'Legacy' }, characters: [] })
  })

  it('falls through gracefully (resolves null) when manifest.json itself is corrupted, rather than crashing', async () => {
    const zipped = zipSync({
      'manifest.json': new TextEncoder().encode('{not valid json'),
      'project-data.json': new TextEncoder().encode(JSON.stringify({ project: {} })),
    })
    const buffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength)
    await expect(tryReadYowZip(fakeFile('corrupt-manifest.zip', buffer))).resolves.toBeNull()
  })

  it('rejects with a clear, specific error when project-data.json is corrupted, instead of silently falling through to another importer', async () => {
    const buffer = makeYowZipBuffer({}, new TextEncoder().encode('{not valid json'))
    await expect(tryReadYowZip(fakeFile('corrupt-data.zip', buffer)))
      .rejects.toThrow(/looks like a YOW backup, but its project data is corrupted/)
  })
})

describe('tryReadYowZip — unsupported schema version', () => {
  it('imports a schema version at or below the current supported version', async () => {
    const buffer = makeYowZipBuffer({ schemaVersion: YOW_EXPORT_SCHEMA_VERSION }, { project: { id: 'p1' } })
    await expect(tryReadYowZip(fakeFile('current.zip', buffer))).resolves.toEqual({ project: { id: 'p1' } })
  })

  it('rejects a schema version newer than this app supports, with a clear, honest error, instead of misinterpreting the data', async () => {
    const futureVersion = YOW_EXPORT_SCHEMA_VERSION + 1
    const buffer = makeYowZipBuffer({ schemaVersion: futureVersion }, { project: { id: 'p1' }, someFutureField: { totallyDifferentShape: true } })
    await expect(tryReadYowZip(fakeFile('future.zip', buffer)))
      .rejects.toThrow(/newer version of YOW \(schema version 2\)/)
  })
})

describe('PDF import — oversized input is rejected before it is decoded', () => {
  it('tryReadYowPdf rejects a buffer over the PDF input cap', async () => {
    await expect(tryReadYowPdf(fakeOversizedFile('huge.pdf', MAX_PDF_INPUT_BYTES + 1)))
      .rejects.toThrow(/too large to import/)
  })

  it('processFiles (readPdfFile) rejects a buffer over the PDF input cap', async () => {
    await expect(processFiles([fakeOversizedFile('huge.pdf', MAX_PDF_INPUT_BYTES + 1)]))
      .rejects.toThrow(/too large to import/)
  })
})

describe('PDF import — oversized embedded restore marker is rejected', () => {
  it('tryReadYowPdf rejects a legacy YOW PDF whose embedded marker exceeds the marker size cap, without hanging or crashing', async () => {
    // A real buffer is built here (not a mocked byteLength) because the
    // marker-size guard runs on the *decoded content between the two
    // markers*, not the outer file size — this proves it fires even though
    // the whole file stays comfortably under the overall PDF input cap.
    const begin = '%%YOW-DATA-BEGIN%%'
    const end = '%%YOW-DATA-END%%'
    const oversizedMarker = 'x'.repeat(MAX_PDF_RESTORE_MARKER_BYTES + 1024)
    const text = `%PDF-1.4 garbage header bytes ${begin}${oversizedMarker}${end} trailing bytes`
    const bytes = new TextEncoder().encode(text)
    expect(bytes.byteLength).toBeLessThan(MAX_PDF_INPUT_BYTES) // isolates the marker cap from the overall input cap
    await expect(tryReadYowPdf(fakeFile('legacy-bomb.pdf', bytes.buffer)))
      .rejects.toThrow(/contains an embedded project payload that is too large to import safely/)
  }, 20000)

  it('still extracts a normal-sized legacy embedded marker', async () => {
    const begin = '%%YOW-DATA-BEGIN%%'
    const end = '%%YOW-DATA-END%%'
    const payload = JSON.stringify({ project: { id: 'p1', title: 'Legacy PDF Export' } })
    const text = `%PDF-1.4 garbage header bytes ${begin}${payload}${end} trailing bytes`
    const bytes = new TextEncoder().encode(text)
    const result = await tryReadYowPdf(fakeFile('legacy-ok.pdf', bytes.buffer))
    expect(result).toEqual({ project: { id: 'p1', title: 'Legacy PDF Export' } })
  })
})

describe('PDF import — malformed/foreign PDF fails gracefully', () => {
  it('readPdfFile (via processFiles) throws a clear error for a PDF with no extractable text, instead of silently importing an empty document', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\nnot a real YOW-generated content stream\n%%EOF')
    const file = fakeFile('garbage.pdf', bytes.buffer)
    await expect(processFiles([file])).rejects.toThrow(/Could not extract text from/)
  })

  it('tryReadYowPdf resolves null (falls through) for an ordinary, non-YOW PDF rather than throwing', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\nsome ordinary PDF bytes with no embedded marker\n%%EOF')
    await expect(tryReadYowPdf(fakeFile('ordinary.pdf', bytes.buffer))).resolves.toBeNull()
  })
})

describe('nested-archive depth guard does not regress the one real nested case (novel.docx)', () => {
  it('tryReadStructuredZip still extracts a legitimate, ordinary-sized nested novel.docx', async () => {
    const novelDocx = zipSync({
      'word/document.xml': new TextEncoder().encode(
        '<w:document><w:body><w:p><w:r><w:t>Once upon a time.</w:t></w:r></w:p></w:body></w:document>'
      ),
    })
    const outer = zipSync({
      'characters/alice-abc1234567/metadata.json': new TextEncoder().encode(JSON.stringify({ attributes: { name: 'Alice' } })),
      'novel.docx': novelDocx,
    })
    const buffer = outer.buffer.slice(outer.byteOffset, outer.byteOffset + outer.byteLength)
    const result = await tryReadStructuredZip(fakeFile('withNovel.zip', buffer))
    expect(result.characters).toEqual([{ name: 'Alice', role: '', bio: '' }])
  })
})

describe('native import validates the project graph (audit YOW-12)', () => {
  it('rejects a backup with duplicate ids instead of silently merging the records', async () => {
    const buffer = makeYowZipBuffer({}, { project: { id: 'p1' }, characters: [{ id: 'c1', name: 'A' }, { id: 'c1', name: 'B' }] })
    await expect(tryReadYowZip(fakeFile('dup.zip', buffer))).rejects.toThrow(/more than once.*Nothing was imported/s)
  })

  it('rejects a backup whose links point outside the file', async () => {
    const buffer = makeYowZipBuffer({}, { project: { id: 'p1' }, chapters: [{ id: 'ch1', actId: 'missing' }] })
    await expect(tryReadYowZip(fakeFile('orphan.zip', buffer))).rejects.toThrow(/not in the file/)
  })

  it('rejects a legacy PDF payload that is structurally broken, rather than treating it as "not a YOW PDF"', async () => {
    const payload = JSON.stringify({ project: { id: 'p1' }, scenes: [{ id: 's1' }, { id: 's1' }] })
    const pdf = new TextEncoder().encode(`%PDF-1.4\n%%YOW-DATA-BEGIN%%${payload}%%YOW-DATA-END%%`)
    await expect(tryReadYowPdf(fakeFile('dup.pdf', pdf.buffer))).rejects.toThrow(/more than once/)
  })
})

describe('PDF import refuses files it cannot read reliably (audit YOW-22)', () => {
  const pdfFile = (name, body) => fakeFile(name, new TextEncoder().encode(body).buffer)

  it('rejects a PDF whose text streams are compressed and not made by YOW, instead of importing a fragment', async () => {
    const body = '%PDF-1.7\n1 0 obj << /Filter /FlateDecode /Length 10 >> stream\nxxxxxxxx\nendstream\nBT (Only a title) Tj ET\n%%EOF'
    await expect(processFiles([pdfFile('scan.pdf', body)])).rejects.toThrow(/not made by YOW.*\.docx/s)
  })

  it('still reads a PDF written by YOW itself', async () => {
    const body = '%PDF-1.4\n/Producer (Your Own World)\nBT /F1 12 Tf (Chapter one text) Tj ET\n%%EOF'
    const result = await processFiles([pdfFile('mine.pdf', body)])
    expect(result[0].content).toContain('Chapter one text')
  })
})

it('rejects numeric/string IDs that collapse onto one importer map key before returning native data', async () => {
  const buffer = makeYowZipBuffer({}, { project: { id: 'p1' }, characters: [{ id: 1 }, { id: '1' }] })
  await expect(tryReadYowZip(fakeFile('collision.zip', buffer))).rejects.toThrow(/more than once/)
})
