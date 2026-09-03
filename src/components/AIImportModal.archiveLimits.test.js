import { describe, it, expect, vi } from 'vitest'
import { MAX_ARCHIVE_INPUT_BYTES, MAX_ARCHIVE_FILE_COUNT, MAX_ARCHIVE_UNCOMPRESSED_BYTES } from '../utils/archiveImportLimits.js'
import { readZipFile, tryReadYowZip, readDocxFile, tryReadStructuredZip, processFiles } from './AIImportModal.jsx'

// Real fflate is used for ordinary zips, but two 1-byte "control" buffers
// (0xFF / 0xFE) are intercepted to hand back a synthetic decompressed file
// map — a huge file count or a huge reported total size — without actually
// allocating that much memory in the test, mirroring the guidance to avoid
// allocating a real multi-hundred-MB buffer.
vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    unzip: (buf, cb) => {
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
      actual.unzip(buf, cb)
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
