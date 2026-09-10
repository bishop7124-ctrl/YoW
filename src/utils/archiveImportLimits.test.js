import { describe, it, expect } from 'vitest'
import { zipSync, unzipSync } from 'fflate'
import {
  MAX_ARCHIVE_INPUT_BYTES,
  MAX_ARCHIVE_FILE_COUNT,
  MAX_ARCHIVE_UNCOMPRESSED_BYTES,
  MAX_ARCHIVE_COMPRESSION_RATIO,
  MIN_RATIO_CHECK_UNCOMPRESSED_BYTES,
  assertArchiveInputSizeOk,
  assertUnzippedResultOk,
  assertZipEntryCompressionRatioOk,
  makeZipEntryRatioFilter,
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

describe('assertZipEntryCompressionRatioOk', () => {
  const overCapRatio = MAX_ARCHIVE_COMPRESSION_RATIO + 1

  it('allows an entry at or under the ratio cap once it is large enough to be checked', () => {
    const originalSize = MIN_RATIO_CHECK_UNCOMPRESSED_BYTES * 2
    expect(() => assertZipEntryCompressionRatioOk(
      { name: 'ok.bin', size: Math.ceil(originalSize / MAX_ARCHIVE_COMPRESSION_RATIO), originalSize },
      '"ok.zip"'
    )).not.toThrow()
  })

  it('allows an entry over the ratio cap when it is below the size floor (too small to matter)', () => {
    expect(() => assertZipEntryCompressionRatioOk(
      { name: 'tiny.bin', size: 1, originalSize: MIN_RATIO_CHECK_UNCOMPRESSED_BYTES - 1 },
      '"ok.zip"'
    )).not.toThrow()
  })

  it('rejects a large entry whose ratio exceeds the cap', () => {
    const originalSize = MIN_RATIO_CHECK_UNCOMPRESSED_BYTES * 2
    expect(() => assertZipEntryCompressionRatioOk(
      { name: 'bomb.bin', size: Math.floor(originalSize / overCapRatio), originalSize },
      '"bomb.zip"'
    )).toThrow(/"bomb\.zip" contains a file \("bomb\.bin"\) compressed at an unsafe ratio/)
  })

  it('treats a reported zero compressed size on a large entry as an infinite (rejected) ratio', () => {
    expect(() => assertZipEntryCompressionRatioOk(
      { name: 'zero.bin', size: 0, originalSize: MIN_RATIO_CHECK_UNCOMPRESSED_BYTES * 2 },
      '"bomb.zip"'
    )).toThrow(/compressed at an unsafe ratio/)
  })

  it('ignores missing/non-numeric size fields rather than false-positive rejecting', () => {
    expect(() => assertZipEntryCompressionRatioOk({ name: 'x', originalSize: MIN_RATIO_CHECK_UNCOMPRESSED_BYTES * 2 }, '"ok.zip"')).not.toThrow()
    expect(() => assertZipEntryCompressionRatioOk({ name: 'x', size: 10 }, '"ok.zip"')).not.toThrow()
    expect(() => assertZipEntryCompressionRatioOk(undefined, '"ok.zip"')).not.toThrow()
  })
})

describe('makeZipEntryRatioFilter', () => {
  const bigOriginalSize = MIN_RATIO_CHECK_UNCOMPRESSED_BYTES * 2
  const bigOk = { name: 'ok.bin', size: Math.ceil(bigOriginalSize / MAX_ARCHIVE_COMPRESSION_RATIO), originalSize: bigOriginalSize }
  const bigBomb = { name: 'bomb.bin', size: 1, originalSize: bigOriginalSize }

  it('returns true and does not record a violation for entries under the cap', () => {
    const filter = makeZipEntryRatioFilter('"ok.zip"')
    expect(filter(bigOk)).toBe(true)
    expect(() => filter.check()).not.toThrow()
  })

  it('returns false (fflate\'s own "skip this entry" signal) rather than throwing directly, and records the violation for `.check()`', () => {
    const filter = makeZipEntryRatioFilter('"bomb.zip"')
    expect(filter(bigBomb)).toBe(false)
    expect(() => filter.check()).toThrow(/"bomb\.zip" contains a file \("bomb\.bin"\) compressed at an unsafe ratio/)
  })

  it('keeps returning false for every entry after the first violation, even an otherwise-ok one', () => {
    // This is what lets fflate stop decompressing further entries once a
    // bomb is found, the same early-stop benefit a thrown exception would
    // give — without actually throwing through fflate's internals (see the
    // function's own doc comment for why that matters).
    const filter = makeZipEntryRatioFilter('"bomb.zip"')
    filter(bigBomb)
    expect(filter(bigOk)).toBe(false)
    expect(() => filter.check()).toThrow(/compressed at an unsafe ratio/)
  })
})

describe('makeZipEntryRatioFilter against real fflate fixtures', () => {
  it('rejects a real zip-bomb-shaped fixture built with zipSync — one entry, a huge run of a repeated byte, compressing to a tiny size', () => {
    // Real fflate end to end, not hand-rolled ZIP bytes or mocked sizes:
    // 20MB of zeros compresses to roughly 20KB (~1000:1) — far over the
    // 100:1 cap and the floor — and the assertions below confirm the guard
    // actually fires via the same `filter`/`.check()` wiring the real call
    // sites use, catching the entry before it is inflated.
    const bombZip = zipSync({ 'bomb.bin': new Uint8Array(20 * 1024 * 1024) })
    expect(bombZip.length).toBeLessThan(1024 * 1024) // sanity check: the archive itself is small
    const ratioFilter = makeZipEntryRatioFilter('"bomb.zip"')
    unzipSync(bombZip, { filter: ratioFilter }) // does not throw directly — see makeZipEntryRatioFilter
    expect(() => ratioFilter.check())
      .toThrow(/"bomb\.zip" contains a file \("bomb\.bin"\) compressed at an unsafe ratio/)
  })

  it('skips decompressing entries after the bomb entry too, once found', () => {
    const bombZip = zipSync({
      'before.txt': new TextEncoder().encode('ordinary content before the bomb'),
      'bomb.bin': new Uint8Array(20 * 1024 * 1024),
      'after.txt': new TextEncoder().encode('ordinary content after the bomb'),
    })
    const ratioFilter = makeZipEntryRatioFilter('"bomb.zip"')
    const files = unzipSync(bombZip, { filter: ratioFilter })
    expect(files['before.txt']).toBeTruthy() // already fine before the bomb was found
    expect(files['bomb.bin']).toBeUndefined() // the bomb itself is never decompressed
    expect(files['after.txt']).toBeUndefined() // nor is anything found after it
    expect(() => ratioFilter.check()).toThrow(/compressed at an unsafe ratio/)
  })

  it('does not reject a real, ordinary small text-heavy manuscript ZIP', () => {
    const zipped = zipSync({
      'chapter-1.txt': new TextEncoder().encode('It was a dark and stormy night. '.repeat(200)),
      'metadata.json': new TextEncoder().encode(JSON.stringify({ title: 'Test Novel' })),
    })
    const ratioFilter = makeZipEntryRatioFilter('"ok.zip"')
    const files = unzipSync(zipped, { filter: ratioFilter })
    expect(() => ratioFilter.check()).not.toThrow()
    expect(Object.keys(files).sort()).toEqual(['chapter-1.txt', 'metadata.json'])
  })
})
