// Uploads user images (cover photos, portraits, faction logos, etc.) to the
// Supabase Storage `user-media` bucket instead of embedding them as base64
// data URLs in project JSON. See supabase/migrations/20260727_user_media_storage.sql
// for the bucket/RLS/quota-bookkeeping setup this depends on.

import { supabase } from '../supabase.js'
import { optimizeImage, optimizeImageToDataUrl } from './imageOptimize.js'
import { checkUploadAllowed } from './storageQuota.js'
import { OFFLINE_MODE } from './offlineMock.js'

const BUCKET_NAME = 'user-media'
const PRIVATE_MEDIA_PREFIX = 'yow-media:'
const SIGNED_URL_TTL_SECONDS = 60 * 60
const SIGNED_URL_REFRESH_SKEW_MS = 5 * 60 * 1000
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
  if (OFFLINE_MODE) return optimizeImageToDataUrl(file, optimizeOptions)

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
    // Reproduced live against the real bucket: the sign/list endpoints can
    // return a hard "Object not found" (S3 NoSuchKey) for an object that
    // upload() just confirmed writing and that download()/getPublicUrl()
    // can both reach immediately and indefinitely afterward — not a
    // propagation race (persisted 24s+ across repeated attempts, unaffected
    // by retries). While the bucket is still public (see
    // supabase/migrations/20260804_private_user_media.sql — not yet
    // applied), fall back to the plain public URL rather than showing a
    // blank image for an object that plainly exists. Once the bucket is
    // actually made private this fallback naturally stops helping — the
    // public URL 403s the same way signing failed to resolve — so it's safe
    // to leave in as a defensive fallback, not a fix for the sign endpoint
    // itself (that needs following up with Supabase separately).
    const { data: pub } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path)
    if (pub?.publicUrl) return pub.publicUrl
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
  if (OFFLINE_MODE || !url || typeof url !== 'string') return
  const path = getUserMediaPath(url)
  if (!path) return
  try {
    await supabase.storage.from(BUCKET_NAME).remove([path])
    signedUrlCache.delete(path)
  } catch (error) {
    console.warn('Could not delete previous uploaded image.', error)
  }
}
