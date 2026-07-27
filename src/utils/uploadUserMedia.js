// Uploads user images (cover photos, portraits, faction logos, etc.) to the
// Supabase Storage `user-media` bucket instead of embedding them as base64
// data URLs in project JSON. See supabase/migrations/20260727_user_media_storage.sql
// for the bucket/RLS/quota-bookkeeping setup this depends on.

import { supabase } from '../supabase.js'
import { optimizeImage, optimizeImageToDataUrl } from './imageOptimize.js'
import { checkUploadAllowed } from './storageQuota.js'
import { OFFLINE_MODE } from './offlineMock.js'

const BUCKET_NAME = 'user-media'

function extensionForMimeType(type) {
  if (type === 'image/webp') return 'webp'
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg') return 'jpg'
  return 'bin'
}

/**
 * Optimises, quota-checks, and uploads an image file, returning its public URL.
 *
 * @param {File|Blob} file
 * @param {object} options
 * @param {string} options.userId - required; images are stored under {userId}/{category}/...
 * @param {string} options.category - e.g. 'covers', 'characters', 'factions', 'comic'
 * @param {number} [options.currentUsedBytes] - bytes already used against the plan quota
 * @param {number|null} [options.quotaBytes] - plan storage quota in bytes; null/undefined = unlimited (e.g. desktop local vault)
 * @returns {Promise<string>} the uploaded image's public URL
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

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Deletes a previously-uploaded user-media object given its public URL.
 * No-ops (does not throw) for anything that isn't a user-media Storage URL —
 * e.g. legacy base64 data: URLs or static /demo-projects/ assets — so callers
 * can call this unconditionally when replacing/removing an image field.
 */
export async function deleteUserMedia(url) {
  if (OFFLINE_MODE || !url || typeof url !== 'string') return
  const marker = `/storage/v1/object/public/${BUCKET_NAME}/`
  const index = url.indexOf(marker)
  if (index === -1) return

  const path = decodeURIComponent(url.slice(index + marker.length))
  try {
    await supabase.storage.from(BUCKET_NAME).remove([path])
  } catch (error) {
    console.warn('Could not delete previous uploaded image.', error)
  }
}
