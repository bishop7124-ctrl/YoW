import { useSyncExternalStore } from 'react'
import { supabase } from '../supabase'
import { OFFLINE_MODE } from './offlineMock'
import { registerSceneVersionSink } from './sceneVersions'

// Postgres codes for a bad request (invalid argument, too large): the request is wrong, the service is
// fine, so they must not pause history for every other scene.
const PER_CALL_ERROR_CODES = new Set(['22023', '54000', '22P02', '23514'])

// Cloud scene version history (roadmap A2). Everything here is best effort and
// additive: the local history in sceneVersions.js is untouched, and any failure is
// swallowed so typing, saving and local snapshots are never affected. Server-side
// retention/ownership lives in supabase/migrations/20261109120000_scene_versions.sql.

const FAILURE_BACKOFF_MS = 5 * 60 * 1000
const LIST_LIMIT = 60
const MARK_BATCH = 500

let state = { enabled: false, userId: null, since: 0 }
let blockedUntil = 0
const listeners = new Set()
const emit = () => listeners.forEach(listener => listener())

export function isCloudSceneHistoryActive() {
  return Boolean(state.enabled && state.userId) && !OFFLINE_MODE
}

export function configureCloudSceneVersions({ enabled, userId }) {
  const on = Boolean(enabled && userId)
  if (on === state.enabled && (userId || null) === state.userId) return
  // `since` marks when this account's session began: a snapshot written before it (for example by a
  // late flush from the previous account) is never sent under the new account.
  state = { enabled: on, userId: userId || null, since: Date.now() }
  blockedUntil = 0
  // The local-to-cloud hook exists only while the feature is on for this account.
  registerSceneVersionSink(on ? (version, source) => { pushCloudSceneVersion(version, source) } : null)
  emit()
  // Housekeeping: drop this user's expired "recently deleted" versions once per sign-in.
  if (on) call(() => supabase.rpc('purge_expired_scene_versions'), { backoff: false })
}

export function useCloudSceneHistoryActive() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener) },
    () => isCloudSceneHistoryActive(),
    () => false,
  )
}

const nowMs = () => Date.now()
const usable = () => isCloudSceneHistoryActive() && nowMs() >= blockedUntil

// True while cloud history is paused after a connection problem (it retries by itself after a few minutes).
export const isCloudSceneHistoryPaused = () => isCloudSceneHistoryActive() && nowMs() < blockedUntil
export function retryCloudSceneHistoryNow() { blockedUntil = 0; emit() }
export function useCloudSceneHistoryPaused() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener) },
    () => isCloudSceneHistoryPaused(),
    () => false,
  )
}

// Runs an RPC/query for the CURRENT user. Returns { ok, data }. A result that arrives after the
// account changed is discarded, and a failure pauses cloud calls for five minutes.
let lastErrorCode = ''
// Bumps whenever the signed-in account (or the feature state) changes, so a list that was discarded because the
// account changed mid-request can be loaded again.
export const cloudHistoryEpoch = () => state.since
export function useCloudHistoryEpoch() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener) },
    cloudHistoryEpoch,
    () => 0,
  )
}
export const lastCloudHistoryError = () => lastErrorCode

async function call(run, { backoff = true } = {}) {
  if (!usable()) { lastErrorCode = isCloudSceneHistoryActive() ? 'paused' : 'not-signed-in'; return { ok: false, data: null } }
  const userAtStart = state.userId
  try {
    const { data, error } = await run()
    if (userAtStart !== state.userId) { lastErrorCode = 'account-changed'; return { ok: false, data: null } }
    if (error) throw error
    lastErrorCode = ''
    return { ok: true, data }
  } catch (error) {
    lastErrorCode = String(error?.code || error?.message || 'unknown').slice(0, 60)
    // Housekeeping calls (purge, marking deletions) never pause history: a missing function or a hiccup there
    // must not silently stop snapshots and listing for everyone.
    if (backoff && !PER_CALL_ERROR_CODES.has(error?.code)) {
      blockedUntil = nowMs() + FAILURE_BACKOFF_MS
      emit()
    }
    return { ok: false, data: null }
  }
}

// `force` is for text the writer is looking at right now (opening a scene's history): it skips the "written
// before this session began" guard, which exists only to stop a late flush from a previous account.
export function pushCloudSceneVersion(version, source = 'auto', { force = false } = {}) {
  if (!version?.sceneId || typeof version.content !== 'string') return Promise.resolve(false)
  if (!force && !(Number(version.timestamp) >= state.since)) return Promise.resolve(false)
  return call(() => supabase.rpc('save_scene_version', {
    p_scene_id: String(version.sceneId),
    p_novel_id: version.novelId ? String(version.novelId) : null,
    p_title: version.title || '',
    p_content: version.content,
    p_source: ['auto', 'restore', 'replace'].includes(source) ? source : 'auto',
  })).then(result => result.ok)
}

const toVersion = row => ({
  id: `cloud:${row.id}`,
  cloudId: row.id,
  sceneId: row.scene_id,
  novelId: row.novel_id || null,
  title: row.title || '',
  wordCount: row.word_count || 0,
  timestamp: Date.parse(row.created_at) || 0,
  hash: row.content_hash,
  source: row.source,
  content: undefined,
  cloud: true,
})

// Like listCloudSceneVersions but says whether the lookup worked, so callers can tell "no versions" from "could not
// check".
export async function loadCloudSceneVersions(sceneId) {
  if (!sceneId) return { ok: true, versions: [] }
  const { ok, data } = await call(() => supabase.from('scene_versions')
    .select('id,scene_id,novel_id,title,word_count,content_hash,source,created_at')
    .eq('scene_id', String(sceneId)).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(LIST_LIMIT))
  if (ok && !Array.isArray(data)) lastErrorCode = 'empty-response'
  return ok && Array.isArray(data) ? { ok: true, versions: data.map(toVersion) } : { ok: false, versions: [] }
}
export async function listCloudSceneVersions(sceneId) {
  return (await loadCloudSceneVersions(sceneId)).versions
}

export async function fetchCloudVersionContent(cloudId) {
  const { ok, data } = await call(() => supabase.from('scene_versions').select('content,title').eq('id', cloudId).maybeSingle())
  return ok && data ? { content: data.content || '', title: data.title || '' } : null
}

export const deleteCloudSceneVersion = cloudId =>
  call(() => supabase.rpc('delete_scene_version', { p_id: cloudId })).then(r => r.ok)
export const clearCloudSceneVersions = sceneId =>
  call(() => supabase.rpc('clear_scene_versions', { p_scene_id: String(sceneId) })).then(r => r.ok)

// Deleting a scene/project keeps its cloud versions for 30 days ("Recently deleted").
export function markCloudScenesDeleted(sceneIds = []) {
  if (!isCloudSceneHistoryActive()) return
  const ids = [...new Set(sceneIds.map(String))]
  for (let i = 0; i < ids.length; i += MARK_BATCH) {
    const chunk = ids.slice(i, i + MARK_BATCH)
    call(() => supabase.rpc('mark_scenes_versions_deleted', { p_scene_ids: chunk }), { backoff: false })
  }
}
export function markCloudNovelDeleted(novelId) {
  if (!novelId || !isCloudSceneHistoryActive()) return
  call(() => supabase.rpc('mark_novel_versions_deleted', { p_novel_id: String(novelId) }), { backoff: false })
}
export const unmarkCloudSceneDeleted = sceneId =>
  call(() => supabase.rpc('unmark_scene_versions_deleted', { p_scene_id: String(sceneId) }), { backoff: false }).then(r => r.ok)

// Most recent version of each deleted scene in a project, newest deletion first.
export async function listRecentlyDeletedScenes(novelId) {
  if (!novelId) return []
  const { ok, data } = await call(() => supabase.from('scene_versions')
    .select('id,scene_id,novel_id,title,word_count,created_at,deleted_at')
    .eq('novel_id', String(novelId)).not('deleted_at', 'is', null)
    .order('created_at', { ascending: false }).limit(500))
  if (!ok || !Array.isArray(data)) return []
  const latest = new Map()
  data.forEach(row => { if (!latest.has(row.scene_id)) latest.set(row.scene_id, row) })
  return [...latest.values()]
    .map(row => ({ ...toVersion(row), deletedAt: Date.parse(row.deleted_at) || 0 }))
    .sort((a, b) => b.deletedAt - a.deletedAt)
}

// Same hash the server stores, so local snapshots can be matched to cloud ones.
export async function sceneVersionHash(title, content) {
  try {
    const bytes = new TextEncoder().encode(`${title || ''}\n${content || ''}`)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  } catch { return null }
}
