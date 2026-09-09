import { describe, it, expect } from 'vitest'
import {
  MAX_ARCHIVE_INPUT_BYTES,
  MAX_ARCHIVE_FILE_COUNT,
  MAX_ARCHIVE_UNCOMPRESSED_BYTES,
  assertArchiveInputSizeOk,
  assertUnzippedResultOk,
} from './archiveImportLimits.js'

describe('assertArchiveInputSizeOk', () => {
  it('allows a buffer at or under the cap', () => {
    expect(() => assertArchiveInputSizeOk(MAX_ARCHIVE_INPUT_BYTES, '"ok.zip"')).not.toThrow()
    expect(() => assertArchiveInputSizeOk(1024, '"ok.zip"')).not.toThrow()
  })

  it('throws a clear, user-facing error for a buffer over the cap', () => {
    expect(() => assertArchiveInputSizeOk(MAX_ARCHIVE_INPUT_BYTES + 1, '"huge.zip"'))
      .toThrow(/"huge\.zip" is too large to import \(max \d+MB\)/)
  })

  it('ignores a missing/non-numeric byteLength rather than false-positive rejecting', () => {
    expect(() => assertArchiveInputSizeOk(undefined, '"ok.zip"')).not.toThrow()
    expect(() => assertArchiveInputSizeOk(NaN, '"ok.zip"')).not.toThrow()
  })
})

describe('assertUnzippedResultOk', () => {
  it('allows a small, ordinary decompressed file map', () => {
    const files = {
      'manifest.json': new Uint8Array(10),
      'project-data.json': new Uint8Array(500),
    }
    expect(() => assertUnzippedResultOk(files, '"ok.zip"')).not.toThrow()
  })

  it('rejects a file map with too many entries, without needing real file content', () => {
    const files = {}
    for (let i = 0; i < MAX_ARCHIVE_FILE_COUNT + 1; i++) files[`f${i}.txt`] = new Uint8Array(0)
    expect(() => assertUnzippedResultOk(files, '"bomb.zip"'))
      .toThrow(/"bomb\.zip" contains too many files to import safely/)
  })

  it('rejects a file map whose combined uncompressed size exceeds the cap, without allocating that much real memory', () => {
    // Entries only need to report their size (byteLength) for the guard to
    // sum — no need to actually allocate gigabytes of bytes in the test.
    const files = {
      'huge.bin': { byteLength: MAX_ARCHIVE_UNCOMPRESSED_BYTES + 1 },
    }
    expect(() => assertUnzippedResultOk(files, '"bomb.zip"'))
      .toThrow(/"bomb\.zip" is too large once decompressed to import safely/)
  })

  it('sums multiple entries toward the total-size cap', () => {
    const files = {
      a: { byteLength: Math.ceil(MAX_ARCHIVE_UNCOMPRESSED_BYTES / 2) + 1 },
      b: { byteLength: Math.ceil(MAX_ARCHIVE_UNCOMPRESSED_BYTES / 2) },
    }
    expect(() => assertUnzippedResultOk(files, '"bomb.zip"')).toThrow(/too large once decompressed/)
  })
})
