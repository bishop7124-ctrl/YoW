// Shared defense-in-depth limits for client-side archive (ZIP/DOCX) import
// parsing — see docs/YOW_CODE_AUDIT_2026-09-01.md finding #19.
//
// fflate's `unzip`/`unzipSync` decompress synchronously in one shot — there
// is no true streaming/incremental API to abort mid-decompression — so the
// size check on the *compressed* input, applied BEFORE unzip/unzipSync is
// ever called, is the primary defense against a huge or maliciously-crafted
// archive (a "zip bomb") freezing or crashing the tab. The file-count and
// total-uncompressed-size checks below run AFTER decompression and are a
// second layer: they can't prevent the decompression pass itself from
// using memory, but they stop the app from going on to process (parse,
// store to IndexedDB/Supabase, render) a result that's already
// unreasonable. A third layer, the per-entry compression-ratio check further
// down this file, runs BEFORE each individual entry is decompressed (via
// fflate's `filter` option, which sees each entry's compressed/uncompressed
// sizes from the ZIP's central directory ahead of inflating it) — closing
// the gap the other two only cover indirectly: a single wildly-compressed
// entry can be caught on its own disproportionate ratio even if the archive
// as a whole would otherwise stay under the absolute totals above.
//
// ── Input size cap ──────────────────────────────────────────────────────
// The largest per-account plan quota in the app is 15 GB (beta/founder —
// see PLAN_STORAGE_BYTES in membership.js), but that's a whole-account
// cloud quota shared across every project, not a sane bound for a single
// archive being unzipped synchronously, in one JS-thread pass, inside a
// browser tab. 500 MB is generous for a legitimate project export/import
// (even one heavy with cover art and map images — well above the 250 MB
// Free-plan storage quota) while staying bounded well below anything that
// would meaningfully risk hanging or crashing the tab.
export const MAX_ARCHIVE_INPUT_BYTES = 500 * 1024 * 1024 // 500 MB

// ── Post-decompression caps ─────────────────────────────────────────────
// A legitimate YOW project export or Word/OOXML document is at most a few
// hundred to a few thousand small XML/JSON/text entries — the "compatible
// structured ZIP" format writes ~2 files per codex entry (metadata.json +
// entry.md), so even a genuinely huge worldbuilding project (thousands of
// characters/locations/lore entries) stays well under this. Past that many
// files inside one archive is either corrupt or adversarial (e.g. a zip
// bomb fanned out into many tiny files), not a real project.
export const MAX_ARCHIVE_FILE_COUNT = 5000

// Uncompressed content can legitimately run larger than the compressed
// input (project text/JSON compresses well), so this is set above
// MAX_ARCHIVE_INPUT_BYTES rather than equal to it — but still bounded in
// the same "hundreds of MB, not GB" spirit, so a small, heavily-compressed
// archive can't decompress into a multi-GB result in memory.
export const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024 // 1 GB

// ── Per-entry compression ratio cap ─────────────────────────────────────
// The two caps above bound zip-bomb risk only indirectly, through totals:
// entry count and combined uncompressed size. Neither one actually looks at
// how disproportionate any single entry's decompression is. A small,
// deliberately crafted archive could in principle stay under
// MAX_ARCHIVE_UNCOMPRESSED_BYTES in aggregate while still containing one
// wildly-compressed entry, or — since a future legitimate need might raise
// that absolute cap (e.g. to support bigger real exports) — a ratio-only
// bomb hiding under a more generous future ceiling would quietly become
// possible again. A direct compressed:uncompressed ratio check closes that
// gap regardless of where the absolute totals are set.
//
// This is checked per entry, not only in aggregate, because a single
// bomb-shaped entry hidden among many ordinary ones is the harder case: an
// aggregate-only ratio (whole-archive compressed bytes vs. whole-archive
// decompressed bytes) could be diluted below the threshold by other large
// but legitimate, poorly-compressible entries (e.g. cover art, already-
// compressed images) sitting alongside the one hostile entry. Checking each
// entry individually catches that case an aggregate check could miss, and
// is no more complex to implement: fflate's `unzip`/`unzipSync` accept a
// `filter` option that is invoked with each entry's compressed `size` and
// `originalSize` — read straight out of the ZIP's central directory —
// *before* that entry is inflated, so this check runs ahead of the actual
// decompression work for the entry it rejects, not only after the fact on
// already-decompressed output. (It also gets the aggregate case for free as
// a side effect: if every entry's ratio is bounded, total decompressed
// bytes across the whole archive can't exceed the ratio cap times the total
// compressed input size either.)
//
// 100:1 is a conservative, widely-cited zip-bomb heuristic (e.g. OWASP's
// Denial of Service cheat sheet calls out checking the ratio between
// compressed and uncompressed data, with commonly-used thresholds in the
// 100:1 range) — comfortably above anything genuinely repetitive real
// content (prose, JSON, XML/OOXML markup) achieves with DEFLATE in
// practice (typically single digits to low tens of times its compressed
// size), while still being tight enough to catch the many-hundreds-to-one
// or more ratios zip bombs rely on (a 20MB all-zero test entry compresses
// over 1000:1, for scale).
export const MAX_ARCHIVE_COMPRESSION_RATIO = 100

// Below this decompressed size, a high ratio isn't a real risk on its own —
// a small file that happens to compress very well (e.g. a mostly-repetitive
// metadata.json) is common and harmless in isolation. But the floor can't be
// picked in isolation from MAX_ARCHIVE_FILE_COUNT either: an archive can
// contain up to that many entries, so an attacker could otherwise fan a bomb
// out into many separate entries each sized just under the floor to dodge
// this check entirely, one per entry, while still reaching an enormous
// combined total once actually decompressed (that total is still bounded by
// MAX_ARCHIVE_UNCOMPRESSED_BYTES, but only *after* every entry has already
// been decompressed in full to measure it — the exact cost this check
// exists to avoid paying). Deriving the floor from the other two caps
// (MAX_ARCHIVE_UNCOMPRESSED_BYTES / MAX_ARCHIVE_FILE_COUNT) keeps that
// fan-out worst case from exceeding what the aggregate cap already accepts
// as a legitimate outcome today — MAX_ARCHIVE_FILE_COUNT entries every one
// of them sized right at the floor sums to ~MAX_ARCHIVE_UNCOMPRESSED_BYTES,
// not some much larger multiple of it — and keeps the floor self-consistent
// if either of those two constants is ever changed later, rather than a
// second, independently-tuned number that could quietly drift out of sync
// with them.
export const MIN_RATIO_CHECK_UNCOMPRESSED_BYTES = Math.floor(MAX_ARCHIVE_UNCOMPRESSED_BYTES / MAX_ARCHIVE_FILE_COUNT) // ~210 KB

function formatMb(bytes) {
  return `${Math.round(bytes / (1024 * 1024))}MB`
}

/**
 * Throws a clear, user-facing error if `byteLength` (the archive's raw,
 * still-compressed size) exceeds the input cap. Must be called with the
 * raw buffer's byteLength BEFORE fflate's unzip/unzipSync is invoked —
 * that's the whole point: it's the one check capable of stopping a huge or
 * hostile archive before any decompression work happens.
 */
export function assertArchiveInputSizeOk(byteLength, label = 'This file') {
  if (typeof byteLength === 'number' && byteLength > MAX_ARCHIVE_INPUT_BYTES) {
    throw makeArchiveLimitError(`${label} is too large to import (max ${formatMb(MAX_ARCHIVE_INPUT_BYTES)}).`)
  }
}

// Marks errors thrown by the two guards above so callers that wrap
// decompression in a broad try/catch (e.g. to tolerate a corrupt nested
// document without aborting the whole import) can tell a deliberate
// limit-exceeded rejection apart from a generic parse failure and make sure
// it still propagates as a user-facing error instead of being swallowed.
function makeArchiveLimitError(message) {
  const err = new Error(message)
  err.isArchiveLimitError = true
  return err
}

/**
 * Throws a clear, user-facing error if a decompressed fflate file map
 * (path -> Uint8Array) is unreasonably large — either too many entries, or
 * too much combined uncompressed content — before the caller goes on to
 * process (parse, store, render) any of it.
 */
export function assertUnzippedResultOk(files, label = 'This archive') {
  const paths = Object.keys(files || {})
  if (paths.length > MAX_ARCHIVE_FILE_COUNT) {
    throw makeArchiveLimitError(`${label} contains too many files to import safely (${paths.length} entries, max ${MAX_ARCHIVE_FILE_COUNT}).`)
  }
  let total = 0
  for (const path of paths) total += files[path]?.byteLength ?? files[path]?.length ?? 0
  if (total > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
    throw makeArchiveLimitError(`${label} is too large once decompressed to import safely (max ${formatMb(MAX_ARCHIVE_UNCOMPRESSED_BYTES)}).`)
  }
}

/**
 * Throws a clear, user-facing error if one ZIP entry's compressed:
 * uncompressed ratio looks like a "zip bomb" rather than genuine content.
 * Intended to be called from fflate's `unzip`/`unzipSync` `filter` option
 * (see `makeZipEntryRatioFilter` below), which is invoked with each entry's
 * `size` (compressed) and `originalSize` (uncompressed) — read from the
 * ZIP's central directory — BEFORE that entry is decompressed. A missing or
 * non-numeric size is ignored rather than false-positive rejecting (mirrors
 * `assertArchiveInputSizeOk` above), since that shape only occurs for
 * archives built in a streaming fashion, not the whole-file ZIPs read here.
 */
export function assertZipEntryCompressionRatioOk(entryInfo, label = 'This archive') {
  const compressedSize = entryInfo?.size
  const uncompressedSize = entryInfo?.originalSize
  if (typeof compressedSize !== 'number' || typeof uncompressedSize !== 'number') return
  if (uncompressedSize < MIN_RATIO_CHECK_UNCOMPRESSED_BYTES) return
  const ratio = compressedSize > 0 ? uncompressedSize / compressedSize : Infinity
  if (ratio > MAX_ARCHIVE_COMPRESSION_RATIO) {
    const name = entryInfo?.name ? ` ("${entryInfo.name}")` : ''
    // A reported compressed size of 0 (Infinity ratio) gets its own clean
    // wording rather than showing the literal string "Infinity" to the user.
    const ratioDesc = Number.isFinite(ratio) ? `${Math.round(ratio)}x its compressed size` : 'far more than its (effectively zero) compressed size'
    throw makeArchiveLimitError(
      `${label} contains a file${name} compressed at an unsafe ratio to import safely ` +
      `(decompresses to ${ratioDesc}, max ${MAX_ARCHIVE_COMPRESSION_RATIO}x).`
    )
  }
}

/**
 * Builds an fflate `filter` option that checks `assertZipEntryCompressionRatioOk`
 * against every entry before it's decompressed.
 *
 * Deliberately does NOT throw directly from inside the filter callback, even
 * though fflate would let a thrown error propagate out of unzip/unzipSync —
 * fflate's async `unzip` does not wrap that call in a try/catch, so an
 * exception thrown there escapes mid-loop without giving fflate a chance to
 * run its own cleanup (e.g. terminating Worker-based decompressions it may
 * have already dispatched for earlier, legitimate entries in the same
 * archive). Instead, a violation is recorded and the filter returns `false`
 * — fflate's own, intended way to skip decompressing one entry — for that
 * entry and every entry after it, so nothing past the first bad entry is
 * ever decompressed (the same early-stop benefit throwing would have given)
 * while still letting fflate finish the call through its normal, own
 * control flow. Call the returned filter's `.check()` once unzip/unzipSync
 * has finished (on success or on an unrelated fflate-reported error) to
 * throw the recorded violation, if any, using the same `isArchiveLimitError`
 * marker as every other guard in this file.
 */
export function makeZipEntryRatioFilter(label = 'This archive') {
  let violation = null
  const filter = (entryInfo) => {
    if (violation) return false
    try {
      assertZipEntryCompressionRatioOk(entryInfo, label)
      return true
    } catch (err) {
      violation = err
      return false
    }
  }
  filter.check = () => { if (violation) throw violation }
  return filter
}
