import { describe, it, expect, vi } from 'vitest'
import { zipSync } from 'fflate'
import { MAX_ARCHIVE_INPUT_BYTES, MAX_ARCHIVE_FILE_COUNT, MAX_ARCHIVE_UNCOMPRESSED_BYTES } from '../utils/archiveImportLimits.js'
import { readZipFile, tryReadYowZip, readDocxFile, tryReadStructuredZip, processFiles } from './AIImportModal.jsx'

// Real fflate is used for ordinary zips, but two 1-byte "control" buffers
// (0xFF / 0xFE) are intercepted to hand back a synthetic decompressed file
// map — a huge file count or a huge reported total size — without actually
// allocating that much memory in the test, mirroring the guidance to avoid
// allocating a real multi-hundred-MB buffer. `opts` (carrying the
// ratio-check `filter`) is forwarded to the real unzip for every other
// buffer, including the real zip-bomb-shaped fixtures used below.
vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    unzip: (buf, opts, cb) => {
      if (!cb) { cb = opts; opts = undefined }
      if (buf.length === 1 && buf[0] === 0xff) {
        const files = {}
        for (let i = 0; i < MAX_ARCHIVE_FILE_COUNT + 1; i++) files[`f${i}.txt`] = new Uint8Array(0)
        cb(null, files)
        return
      }
      if (buf.length === 1 && buf[0] === 0xfe) {
        cb(null, { 'big.bin': { byteLength: MAX_ARCHIVE_UNCOMPRESSED_BYTES + 1 } })
        return
      }
      // A synthetic "compatible structured ZIP" (one NC-format entry, so
      // tryReadStructuredZip recognizes it) that also carries an oversized
      // `novel.docx` — reused to prove the nested-manuscript size guard
      // actually aborts the whole import instead of being swallowed by the
      // surrounding try/catch that otherwise tolerates a corrupt novel.docx.
      if (buf.length === 1 && buf[0] === 0xfd) {
        cb(null, {
          'characters/alice-abc1234567/metadata.json': new TextEncoder().encode(JSON.stringify({ attributes: { name: 'Alice' } })),
          'novel.docx': { byteLength: MAX_ARCHIVE_INPUT_BYTES + 1 },
        })
        return
      }
      actual.unzip(buf, opts, cb)
    },
  }
})

// A fake File-like object. `arrayBuffer()` resolves to a fake buffer that
// only needs to report a `byteLength` — the size guard in every call site
// runs on that value BEFORE fflate's unzip is ever invoked, so a real
// oversized ArrayBuffer never needs to be allocated to prove the guard
// fires first.
function fakeOversizedFile(name = 'huge.zip') {
  return {
    name,
    arrayBuffer: async () => ({ byteLength: MAX_ARCHIVE_INPUT_BYTES + 1 }),
  }
}

function fakeControlZipFile(name, byte) {
  return {
    name,
    arrayBuffer: async () => new Uint8Array([byte]).buffer,
  }
}

describe('oversized archive input is rejected before decompression is attempted', () => {
  it('readZipFile rejects a buffer over the input cap', async () => {
    await expect(readZipFile(fakeOversizedFile())).rejects.toThrow(/too large to import/)
  })

  it('tryReadYowZip rejects a buffer over the input cap', async () => {
    await expect(tryReadYowZip(fakeOversizedFile('huge.zip'))).rejects.toThrow(/too large to import/)
  })

  it('readDocxFile rejects a buffer over the input cap', async () => {
    await expect(readDocxFile(fakeOversizedFile('huge.docx'))).rejects.toThrow(/too large to import/)
  })

  it('tryReadStructuredZip rejects a buffer over the input cap', async () => {
    await expect(tryReadStructuredZip(fakeOversizedFile('huge.zip'))).rejects.toThrow(/too large to import/)
  })

  it('processFiles (the regular AI-import flow) surfaces the same rejection for an oversized .zip', async () => {
    await expect(processFiles([fakeOversizedFile('huge.zip')])).rejects.toThrow(/too large to import/)
  })
})

describe('a decompressed file-count over the cap is rejected', () => {
  it('readZipFile rejects rather than proceeding to process each of the many entries', async () => {
    await expect(readZipFile(fakeControlZipFile('many.zip', 0xff))).rejects.toThrow(/too many files to import safely/)
  })

  it('tryReadYowZip rejects rather than silently falling through to another parser', async () => {
    await expect(tryReadYowZip(fakeControlZipFile('many.zip', 0xff))).rejects.toThrow(/too many files to import safely/)
  })
})

describe('a decompressed total-uncompressed-size over the cap is rejected', () => {
  it('readZipFile rejects rather than proceeding', async () => {
    await expect(readZipFile(fakeControlZipFile('bigcontent.zip', 0xfe))).rejects.toThrow(/too large once decompressed/)
  })

  it('tryReadYowZip rejects rather than silently falling through', async () => {
    await expect(tryReadYowZip(fakeControlZipFile('bigcontent.zip', 0xfe))).rejects.toThrow(/too large once decompressed/)
  })
})

describe('an oversized nested novel.docx inside a compatible structured ZIP aborts the whole import', () => {
  it('tryReadStructuredZip rejects rather than silently dropping the manuscript and resolving the rest', async () => {
    // Before the fix, the size guard on novel.docx threw inside a try/catch
    // meant only to tolerate a corrupt/invalid nested .docx, so the error
    // was swallowed and the import silently resolved without a manuscript.
    await expect(tryReadStructuredZip(fakeControlZipFile('withNovel.zip', 0xfd))).rejects.toThrow(/too large to import/)
  })
})

// A real, fflate-built ZIP whose one entry is a large run of a repeated
// byte — DEFLATE compresses it to a tiny fraction of its real size, the
// exact shape a zip bomb exploits. 20MB of zeros compresses to roughly
// 20KB (~1000:1), comfortably over the 100:1 cap and the 10MB floor the
// ratio check requires before it applies at all.
function realZipBombBytes(entryName = 'bomb.bin') {
  const zipped = zipSync({ [entryName]: new Uint8Array(20 * 1024 * 1024) })
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength)
}

function fakeRealZipFile(name, arrayBuffer) {
  return { name, arrayBuffer: async () => arrayBuffer }
}

describe('a single entry with an unsafe compression ratio is rejected (zip-bomb heuristic)', () => {
  it('readZipFile rejects a real zip-bomb-shaped fixture before it is fully decompressed', async () => {
    await expect(readZipFile(fakeRealZipFile('bomb.zip', realZipBombBytes())))
      .rejects.toThrow(/compressed at an unsafe ratio/)
  })

  it('tryReadYowZip rejects the same fixture rather than falling through to another parser', async () => {
    await expect(tryReadYowZip(fakeRealZipFile('bomb.zip', realZipBombBytes())))
      .rejects.toThrow(/compressed at an unsafe ratio/)
  })

  it('tryReadStructuredZip rejects a compatible structured ZIP whose nested novel.docx is itself a real zip bomb', async () => {
    // The outer archive looks like a normal, small "compatible structured
    // ZIP" (one NC-format entry) — the only thing wrong with it is that its
    // embedded novel.docx is a real zip bomb, proving the ratio check
    // applies to the nested unzipSync(docxBytes) call too, not just the
    // outer unzip.
    const novelDocxBomb = zipSync({ 'bomb.bin': new Uint8Array(20 * 1024 * 1024) })
    const outer = zipSync({
      'characters/alice-abc1234567/metadata.json': new TextEncoder().encode(JSON.stringify({ attributes: { name: 'Alice' } })),
      'novel.docx': novelDocxBomb,
    })
    const buffer = outer.buffer.slice(outer.byteOffset, outer.byteOffset + outer.byteLength)
    await expect(tryReadStructuredZip(fakeRealZipFile('withNovelBomb.zip', buffer)))
      .rejects.toThrow(/compressed at an unsafe ratio/)
  })

  it('does not reject an ordinary, non-bomb small text-heavy ZIP', async () => {
    // A small manuscript-shaped ZIP (a couple of ordinary .txt entries) —
    // proves the new ratio check doesn't false-positive on legitimate
    // content that already imports successfully today.
    const zipped = zipSync({
      'chapter-1.txt': new TextEncoder().encode('It was a dark and stormy night. '.repeat(200)),
      'chapter-2.txt': new TextEncoder().encode('The next morning brought clear skies. '.repeat(200)),
    })
    const buffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength)
    const results = await readZipFile(fakeRealZipFile('ok.zip', buffer))
    expect(results.map(r => r.name).sort()).toEqual(['chapter-1.txt', 'chapter-2.txt'])
  })
})
