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
// unreasonable.
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
