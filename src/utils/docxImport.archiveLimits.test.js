import { describe, it, expect, vi } from 'vitest'
import { MAX_ARCHIVE_INPUT_BYTES, MAX_ARCHIVE_FILE_COUNT, MAX_ARCHIVE_UNCOMPRESSED_BYTES } from './archiveImportLimits.js'

// Real fflate is used normally; a single 1-byte "control" buffer (0xff) is
// intercepted to hand back a synthetic decompressed file map with too many
// entries, without allocating that much real memory in the test.
vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    unzipSync: (buf) => {
      if (buf.length === 1 && buf[0] === 0xff) {
        const files = {}
        for (let i = 0; i < MAX_ARCHIVE_FILE_COUNT + 1; i++) files[`f${i}.txt`] = new Uint8Array(0)
        return files
      }
      if (buf.length === 1 && buf[0] === 0xfe) {
        return { 'word/document.xml': { byteLength: MAX_ARCHIVE_UNCOMPRESSED_BYTES + 1 } }
      }
      return actual.unzipSync(buf)
    },
  }
})

const { parseDocxToStructure } = await import('./docxImport.js')

describe('parseDocxToStructure — archive import limits', () => {
  it('rejects a file over the input size cap before attempting to unzip it', async () => {
    // Only `byteLength` needs to be reported for the pre-decompression guard
    // to fire — no real oversized buffer is allocated.
    const file = { name: 'huge.docx', arrayBuffer: async () => ({ byteLength: MAX_ARCHIVE_INPUT_BYTES + 1 }) }
    await expect(parseDocxToStructure(file)).rejects.toThrow(/too large to import/)
  })

  it('rejects a decompressed result with an unreasonable number of entries', async () => {
    const file = { name: 'many.docx', arrayBuffer: async () => new Uint8Array([0xff]).buffer }
    await expect(parseDocxToStructure(file)).rejects.toThrow(/too many files to import safely/)
  })

  it('rejects a decompressed result whose total uncompressed size is over the cap', async () => {
    const file = { name: 'bigcontent.docx', arrayBuffer: async () => new Uint8Array([0xfe]).buffer }
    await expect(parseDocxToStructure(file)).rejects.toThrow(/too large once decompressed/)
  })
})
