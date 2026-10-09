// Uploads user images (cover photos, portraits, faction logos, etc.) to the
// Supabase Storage `user-media` bucket instead of embedding them as base64
// data URLs in project JSON. See supabase/migrations/20260727_user_media_storage.sql
// for the bucket/RLS/quota-bookkeeping setup this depends on.

import { supabase } from '../supabase.js'
import { optimizeImage, optimizeImageToDataUrl } from './imageOptimize.js'
import { checkUploadAllowed } from './storageQuota.js'
import { OFFLINE_MODE } from './offlineMock.js'
import { areCloudWritesAllowed, assertCloudWritesAllowed } from './cloudWritePolicy.js'

const BUCKET_NAME = 'user-media'
const PRIVATE_MEDIA_PREFIX = 'yow-media:'
const SIGNED_URL_TTL_SECONDS = 60 * 60
const SIGNED_URL_REFRESH_SKEW_MS = 5 * 60 * 1000
const STORAGE_PAGE_SIZE = 1000
const signedUrlCache = new Map()

function extensionForMimeType(type) {
  if (type === 'image/webp') return 'webp'
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg') return 'jpg'
  return 'bin'
}

/**
 * Optimises, quota-checks, and uploads an image file, returning a stable private
 * media reference. Renderers resolve this to a short-lived signed URL.
 *
 * @param {File|Blob} file
 * @param {object} options
 * @param {string} options.userId - required; images are stored under {userId}/{category}/...
 * @param {string} options.category - e.g. 'covers', 'characters', 'factions', 'comic'
 * @param {number} [options.currentUsedBytes] - bytes already used against the plan quota
 * @param {number|null} [options.quotaBytes] - plan storage quota in bytes; null/undefined = unlimited (e.g. desktop local vault)
 * @returns {Promise<string>} the uploaded image's private media reference
 */
export async function uploadUserMedia(file, options = {}) {
  const { userId, category, currentUsedBytes = 0, quotaBytes, ...optimizeOptions } = options
  if (!category) throw new Error('uploadUserMedia requires a category.')

  // Offline dev mode never touches the network (no real Supabase session
  // exists) — fall back to the old local-only data URL so images still work
  // for local testing, matching every other Supabase-backed function in this
  // codebase (see the OFFLINE_MODE guards in utils/firestoreSync.js).
  // Local Mode (hosting lapsed), Local-first and archived accounts keep the
  // image on this device as a data URL; it is relocated to Storage by the
  // embedded-image safety net once cloud sync is allowed again.
  if (OFFLINE_MODE || !areCloudWritesAllowed()) return optimizeImageToDataUrl(file, optimizeOptions)

  if (!userId) throw new Error('Sign in to upload images.')

  const blob = await optimizeImage(file, optimizeOptions)

  const effectiveQuota = Number.isFinite(quotaBytes) ? quotaBytes : Infinity
  const quotaError = checkUploadAllowed(blob.size, currentUsedBytes, effectiveQuota)
  if (quotaError) throw new Error(quotaError)

  const path = `${userId}/${category}/${crypto.randomUUID()}.${extensionForMimeType(blob.type)}`
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(path, blob, {
    contentType: blob.type,
    upsert: false,
  })
  if (error) throw new Error(`Upload failed: ${error.message}`)

  return `${PRIVATE_MEDIA_PREFIX}${path}`
}

/**
 * Uploads an already-encoded base64 image (a `data:image/...;base64,...`
 * string) straight to Storage, skipping optimizeImage's resize/recompress
 * pass. Used by firestoreSync's embedded-image safety net (see
 * stripEmbeddedImages below) to move legacy base64 image data — e.g. from a
 * pre-2026-07-27 upload, or a project import/restore whose export JSON still
 * had images inlined — out of the JSONB columns and into Storage, the same
 * place uploadUserMedia() puts new uploads. No quota check: this is
 * relocating bytes the account already "has" (as inline JSON) rather than
 * adding new usage, and refusing to relocate them for being over quota would
 * just leave the account stuck with the oversized rows that cause the
 * statement-timeout failure this exists to prevent.
 *
 * @param {string} dataUrl
 * @param {object} options
 * @param {string} options.userId
 * @param {string} options.category
 * @returns {Promise<string>} the uploaded image's private media reference
 */
export async function uploadEmbeddedImage(dataUrl, options = {}) {
  const { userId, category } = options
  if (!category) throw new Error('uploadEmbeddedImage requires a category.')
  if (!userId) throw new Error('uploadEmbeddedImage requires a userId.')
  assertCloudWritesAllowed('Uploading an image')

  const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Not a base64 image data URL.')
  const [, mimeType, base64] = match

  if (OFFLINE_MODE) return dataUrl

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: mimeType })

  const path = `${userId}/${category}/${crypto.randomUUID()}.${extensionForMimeType(mimeType)}`
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(path, blob, {
    contentType: mimeType,
    upsert: false,
  })
  if (error) throw new Error(`Upload failed: ${error.message}`)

  return `${PRIVATE_MEDIA_PREFIX}${path}`
}

/**
 * Returns the object path for a saved user-media reference. Supports the new
 * private yow-media:path form as well as legacy public URLs already saved in
 * project records before the bucket was made private.
 */
export function getUserMediaPath(value) {
  if (!value || typeof value !== 'string') return null
  if (value.startsWith(PRIVATE_MEDIA_PREFIX)) {
    const path = value.slice(PRIVATE_MEDIA_PREFIX.length)
    return path || null
  }
  const publicMarker = `/storage/v1/object/public/${BUCKET_NAME}/`
  const publicIndex = value.indexOf(publicMarker)
  if (publicIndex !== -1) {
    return decodeURIComponent(value.slice(publicIndex + publicMarker.length).split('?')[0])
  }
  const signedMarker = `/storage/v1/object/sign/${BUCKET_NAME}/`
  const signedIndex = value.indexOf(signedMarker)
  if (signedIndex !== -1) {
    return decodeURIComponent(value.slice(signedIndex + signedMarker.length).split('?')[0])
  }
  return null
}

export function isUserMediaReference(value) {
  return Boolean(getUserMediaPath(value))
}

export async function getSignedUserMediaUrl(value, options = {}) {
  if (OFFLINE_MODE || !isUserMediaReference(value)) return value || ''
  const path = getUserMediaPath(value)
  const now = Date.now()
  const cached = signedUrlCache.get(path)
  if (cached && cached.expiresAt - SIGNED_URL_REFRESH_SKEW_MS > now) return cached.url

  const expiresIn = options.expiresIn || SIGNED_URL_TTL_SECONDS
  const { data, error } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(path, expiresIn)
  if (error) {
    // The bucket is private. A public-URL fallback cannot retrieve a missing
    // or unauthorized object and only causes a second noisy network failure.
    throw new Error(`Could not load image: ${error.message}`)
  }
  const url = data?.signedUrl || ''
  signedUrlCache.set(path, { url, expiresAt: now + expiresIn * 1000 })
  return url
}

/**
 * Deletes a previously-uploaded user-media object given its private reference
 * or legacy public URL.
 * No-ops (does not throw) for anything that isn't a user-media Storage URL —
 * e.g. legacy base64 data: URLs or static /demo-projects/ assets — so callers
 * can call this unconditionally when replacing/removing an image field.
 */
export async function deleteUserMedia(url) {
  // While cloud writes are off the remote object is left alone (no cloud
  // write); the reference is still dropped locally by the caller.
  if (OFFLINE_MODE || !areCloudWritesAllowed() || !url || typeof url !== 'string') return
  const path = getUserMediaPath(url)
  if (!path) return
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([path])
  if (error) throw new Error(`Delete failed: ${error.message}`)
  signedUrlCache.delete(path)
}

/**
 * Removes every uploaded object owned by one user. Supabase refuses to delete
 * an Auth user while that user still owns Storage objects, and deleting rows
 * from storage.objects directly would orphan the physical files. Account
 * deletion therefore uses the Storage API first, with paginated recursive
 * listing and the API's 1,000-object removal limit.
 */
export async function deleteAllUserMedia(userId) {
  if (OFFLINE_MODE || !userId) return 0

  const paths = []
  const pendingPrefixes = [userId]
  const visitedPrefixes = new Set()

  while (pendingPrefixes.length) {
    const prefix = pendingPrefixes.pop()
    if (visitedPrefixes.has(prefix)) continue
    visitedPrefixes.add(prefix)

    let offset = 0
    while (true) {
      const { data, error } = await supabase.storage.from(BUCKET_NAME).list(prefix, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw new Error(`Could not list account media: ${error.message}`)

      const entries = data || []
      for (const entry of entries) {
        const path = `${prefix}/${entry.name}`
        if (entry.id == null) pendingPrefixes.push(path)
        else paths.push(path)
      }
      if (entries.length < STORAGE_PAGE_SIZE) break
      offset += entries.length
    }
  }

  for (let start = 0; start < paths.length; start += STORAGE_PAGE_SIZE) {
    const batch = paths.slice(start, start + STORAGE_PAGE_SIZE)
    const { error } = await supabase.storage.from(BUCKET_NAME).remove(batch)
    if (error) throw new Error(`Could not delete account media: ${error.message}`)
    batch.forEach(path => signedUrlCache.delete(path))
  }

  return paths.length
}
