// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { zipSync } from 'fflate'
import { MAX_ARCHIVE_INPUT_BYTES, MAX_ARCHIVE_FILE_COUNT, MAX_ARCHIVE_UNCOMPRESSED_BYTES } from './archiveImportLimits.js'

// Real fflate is used normally; a single 1-byte "control" buffer (0xff) is
// intercepted to hand back a synthetic decompressed file map with too many
// entries, without allocating that much real memory in the test. `opts`
// (carrying the ratio-check `filter`) is forwarded to the real unzipSync so
// the fixture-driven ratio tests below exercise the real fflate filter path.
vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    unzipSync: (buf, opts) => {
      if (buf.length === 1 && buf[0] === 0xff) {
        const files = {}
        for (let i = 0; i < MAX_ARCHIVE_FILE_COUNT + 1; i++) files[`f${i}.txt`] = new Uint8Array(0)
        return files
      }
      if (buf.length === 1 && buf[0] === 0xfe) {
        return { 'word/document.xml': { byteLength: MAX_ARCHIVE_UNCOMPRESSED_BYTES + 1 } }
      }
      return actual.unzipSync(buf, opts)
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

describe('parseDocxToStructure — per-entry compression ratio (zip-bomb heuristic)', () => {
  it('rejects a real zip-bomb-shaped fixture — a tiny archive whose one entry decompresses to a huge size', async () => {
    // A genuine fflate-built ZIP (not hand-rolled bytes): one entry that's a
    // large run of a repeated byte, which DEFLATE compresses to a tiny
    // fraction of its real size — the exact shape a zip bomb exploits.
    // 20MB of zeros compresses to ~20KB (~1000:1), far over the 100:1 cap,
    // and well over the 10MB floor the ratio check requires before it
    // applies at all.
    const bomb = zipSync({ 'bomb.bin': new Uint8Array(20 * 1024 * 1024) })
    const file = { name: 'bomb.docx', arrayBuffer: async () => bomb.buffer.slice(bomb.byteOffset, bomb.byteOffset + bomb.byteLength) }
    await expect(parseDocxToStructure(file)).rejects.toThrow(/compressed at an unsafe ratio/)
  })

  it('does not reject an ordinary, non-bomb .docx-shaped fixture', async () => {
    // A small, text-heavy fixture shaped like a real .docx (a
    // word/document.xml entry with ordinary paragraph markup) — proves the
    // new ratio check doesn't false-positive on legitimate content that
    // already imports successfully today.
    const xml = `<w:document><w:body><w:p><w:r><w:t>${'Hello world. '.repeat(200)}</w:t></w:r></w:p></w:body></w:document>`
    const zipped = zipSync({ 'word/document.xml': new TextEncoder().encode(xml) })
    const file = { name: 'ok.docx', arrayBuffer: async () => zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) }
    const acts = await parseDocxToStructure(file)
    expect(acts.length).toBeGreaterThan(0)
  })
})
