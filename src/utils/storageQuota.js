import { PLAN_STORAGE_BYTES } from './membership'

// Warning thresholds as fractions of total quota.
export const STORAGE_WARN_80 = 0.80
export const STORAGE_WARN_95 = 0.95

// Max size for a single image upload before optimisation is attempted (bytes).
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024 // 15 MB

// Max size for any single upload after optimisation (hard server-side limit mirror).
export const MAX_OPTIMISED_BYTES = 5 * 1024 * 1024 // 5 MB

// --------------------------------------------------------------------------
// Quota helpers
// --------------------------------------------------------------------------

export function getStorageQuota(membership) {
  if (!membership) return PLAN_STORAGE_BYTES.free
  if (Number.isFinite(membership.storageQuotaBytes)) return membership.storageQuotaBytes
  const key = membership.activePlanKey || 'free'
  return PLAN_STORAGE_BYTES[key] ?? PLAN_STORAGE_BYTES.free
}

// --------------------------------------------------------------------------
// Human-readable formatting
// --------------------------------------------------------------------------

export function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(decimals)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(decimals)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatQuotaLabel(bytes) {
  if (bytes >= 1024 * 1024 * 1024) {
    const gb = bytes / (1024 * 1024 * 1024)
    return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`
  }
  const mb = bytes / (1024 * 1024)
  return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`
}

// --------------------------------------------------------------------------
// Warning level
// --------------------------------------------------------------------------

/** @returns {'ok' | 'warning' | 'critical' | 'exceeded'} */
export function getStorageWarningLevel(usedBytes, quotaBytes) {
  if (!quotaBytes) return 'ok'
  const pct = usedBytes / quotaBytes
  if (pct >= 1) return 'exceeded'
  if (pct >= STORAGE_WARN_95) return 'critical'
  if (pct >= STORAGE_WARN_80) return 'warning'
  return 'ok'
}

export function getStoragePercent(usedBytes, quotaBytes) {
  if (!quotaBytes) return 0
  return Math.min(100, Math.round((usedBytes / quotaBytes) * 100))
}

// --------------------------------------------------------------------------
// Store size estimation
// --------------------------------------------------------------------------

// Keys in the store that contain meaningful binary-heavy data (cover images,
// map SVGs, etc.) that count towards the storage quota.  Lightweight text
// arrays (lore entries, outlines) still count but are negligible.
const STORE_ESTIMATE_KEYS = [
  'novels',       // covers stored as base64 inside each novel object
  'characters',
  'factions',
  'locations',
  'loreEntries',
  'maps',
  'scenes',
  'timeline',
  'worldHistory',
  'acts',
  'chapters',
  'ideaEntries',
  'storySchedule',
  'series',
  'whiteboards',
]

// Per-key cache of each STORE_ESTIMATE_KEYS entry's serialised byte size, keyed by that
// key's own array/object identity. Callers (useStore.js) recompute this on every change
// to *any* of these arrays — including a single scene's content commit, which happens on
// every ~400ms during a typing burst — but only one key's reference actually changes at a
// time in that case (`scenes`). Re-stringifying every other key too, every time, was
// measured causing multi-second keystroke-to-paint lag on a real multi-project account
// (2026-08-08). Caching per key means an edit to one array only re-stringifies that array;
// everything else reuses its last computed size until its own reference changes.
const storeSizeCache = new Map() // key -> { ref, size }

/**
 * Estimates storage used by the in-memory store.
 * Returns an integer number of bytes.  This is approximate — treat as a
 * lower bound since the serialised DB representation may differ slightly
 * (summing each key's own serialised size, rather than one combined blob,
 * also drops the shared wrapper object's own handful of bytes — negligible
 * next to real account content, and still a lower bound either way).
 */
export function estimateStoreSize(store) {
  try {
    let total = 0
    for (const key of STORE_ESTIMATE_KEYS) {
      const value = store[key]
      if (value === undefined) continue
      const cached = storeSizeCache.get(key)
      let size
      if (cached && cached.ref === value) {
        size = cached.size
      } else {
        size = new Blob([JSON.stringify(value)]).size
        storeSizeCache.set(key, { ref: value, size })
      }
      total += size
    }
    return total
  } catch {
    return 0
  }
}

// --------------------------------------------------------------------------
// Upload gate
// --------------------------------------------------------------------------

/**
 * Returns null if the upload is permitted, or an error message string if it
 * should be blocked.
 *
 * @param {number} fileSizeBytes   - size of the file about to be uploaded
 * @param {number} currentUsed     - current storage used (bytes)
 * @param {number} quota           - total quota (bytes)
 */
export function checkUploadAllowed(fileSizeBytes, currentUsed, quota) {
  if (fileSizeBytes > MAX_UPLOAD_BYTES) {
    return `This file is too large (${formatBytes(fileSizeBytes)}). Maximum upload size is ${formatBytes(MAX_UPLOAD_BYTES)}.`
  }
  if (currentUsed + fileSizeBytes > quota) {
    const remaining = Math.max(0, quota - currentUsed)
    return `Not enough storage. You have ${formatBytes(remaining)} remaining. Upgrade your plan to upload more.`
  }
  return null
}
