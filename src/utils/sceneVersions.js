import { readItem, writeItem, removeItem, listKeys } from '../storage/projectStorage'

// Each scene's version-history snapshots live under their own
// `nf_scene_versions:<sceneId>` key, instead of one shared `nf_scene_versions`
// blob holding every scene's history for the whole account.
//
// Why (2026-09-24 investigation, docs/ROADMAP.md's Bugs table and
// docs/QA_PLAN.md's Priority -1 audit finding #16): the previous single-key
// design meant two *different* browser tabs snapshotting two *different*
// scenes' history (e.g. each tab has its own project open, and both happen
// to hit the periodic snapshot throttle in manuscriptUtils.js's
// runPersistSceneDraft around the same moment — very plausible in practice,
// since a `visibilitychange`/`pagehide` flush fires in every open tab near-
// simultaneously the instant the user switches away from the browser) raced
// on the exact same storage key. Each tab's write is computed synchronously
// from its own in-memory mirror (see browserVaultAdapter.js's per-tab
// BroadcastChannel bridge) and posts a `{ type: 'set', key: 'nf_scene_versions',
// value }` broadcast carrying its own full, independently-computed replacement
// array — not a diff. If both tabs' writes happen before either's broadcast
// has been delivered and applied to the other tab's mirror, whichever tab's
// message is processed last completely overwrites the other's, silently
// discarding that tab's newly-added version snapshot for a scene the
// "winning" tab never even touched. Splitting the key per scene removes this
// collision entirely for the realistic case (two different scenes/projects
// open in two tabs) since the two tabs' writes then target different keys
// and never share a broadcast message at all. It also makes deleting a
// single scene's version history a plain, already-atomic single-key removal
// (see clearSceneVersions/deleteScene in useStore.js) instead of a
// read-whole-blob/filter/rewrite-whole-blob operation.
const STORAGE_KEY_PREFIX = 'nf_scene_versions:'
// The legacy shared key this replaced — migrated once (best-effort, lazily)
// so existing installs don't lose their already-saved history outright.
const LEGACY_STORAGE_KEY = 'nf_scene_versions'
const MAX_VERSIONS_PER_SCENE = 50
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export const sceneVersionsKey = (sceneId) => `${STORAGE_KEY_PREFIX}${sceneId}`
export const SCENE_VERSIONS_KEY_PREFIX = STORAGE_KEY_PREFIX

// Best-effort migration of the old single-blob `nf_scene_versions` key into
// the new per-scene keys. Guarded by re-checking whether the legacy key
// itself still has a value — not a one-time in-memory flag — so it's
// idempotent and self-healing rather than session-scoped: it only ever fills
// in a per-scene key that's still empty, never overwrites one that already
// has data (see the `existingRaw` check below), so re-running it (every call
// site below calls this first) can never clobber real version history a
// later regular save already wrote under the new scheme, and it correctly
// re-runs if a different storage backend gets swapped in mid-session (e.g.
// tests that call setStorageBackend more than once) rather than silently
// skipping that backend's own legacy data forever.
//
// Called from every exported function in this module, AND eagerly from
// replaceProjectStorageAtomically (src/storage/projectReplacement.js) before
// its own orphan sweep runs — without that second call site, a project (or
// scene) could be deleted before this module was ever touched this session,
// leaving its version history still trapped in the legacy blob where the
// sweep (which only looks at already-existing `nf_scene_versions:*` keys)
// can't see it; a later, unrelated access to *any* scene's version history
// would then migrate that already-deleted scene's stale data into a
// freshly-orphaned per-scene key with nothing left to ever clean it up.
export function ensureLegacySceneVersionsMigrated() {
  let raw
  try { raw = readItem(LEGACY_STORAGE_KEY) } catch { return }
  if (!raw) return
  let all
  try { all = JSON.parse(raw) } catch { all = null }
  if (!Array.isArray(all) || all.length === 0) {
    try { removeItem(LEGACY_STORAGE_KEY) } catch { /* best effort */ }
    return
  }
  const bySceneId = new Map()
  all.forEach(version => {
    if (!version?.sceneId) return
    const list = bySceneId.get(version.sceneId) || []
    list.push(version)
    bySceneId.set(version.sceneId, list)
  })
  bySceneId.forEach((versions, sceneId) => {
    let existingRaw
    try { existingRaw = readItem(sceneVersionsKey(sceneId)) } catch { existingRaw = null }
    if (existingRaw) return // new-format key already has data — never clobber it
    const sorted = [...versions].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, MAX_VERSIONS_PER_SCENE)
    try { writeItem(sceneVersionsKey(sceneId), JSON.stringify(sorted)) } catch { /* best effort */ }
  })
  try { removeItem(LEGACY_STORAGE_KEY) } catch { /* best effort */ }
}

function loadForScene(sceneId) {
  ensureLegacySceneVersionsMigrated()
  try { return JSON.parse(readItem(sceneVersionsKey(sceneId)) || '[]') }
  catch { return [] }
}

function saveForScene(sceneId, versions) {
  try {
    if (!versions.length) removeItem(sceneVersionsKey(sceneId))
    else writeItem(sceneVersionsKey(sceneId), JSON.stringify(versions))
  } catch { console.warn('Could not save scene versions.') }
}

export function saveSceneVersion(scene) {
  if (!scene?.id) return
  const existing = loadForScene(scene.id)
  const latest = existing[0]
  const wordCount = scene.content?.trim().match(/\S+/g)?.length || 0

  // Skip duplicate if content hasn't changed since last snapshot
  if (latest && latest.content === (scene.content || '') && latest.title === (scene.title || '')) return

  const version = {
    id: uid(),
    sceneId: scene.id,
    novelId: scene.novelId || null,
    title: scene.title || '',
    content: scene.content || '',
    wordCount,
    timestamp: Date.now(),
  }

  saveForScene(scene.id, [version, ...existing].slice(0, MAX_VERSIONS_PER_SCENE))
}

export function getSceneVersions(sceneId) {
  if (!sceneId) return []
  return loadForScene(sceneId).sort((a, b) => b.timestamp - a.timestamp)
}

export function clearSceneVersions(sceneId) {
  if (!sceneId) return
  // Must migrate first, not just rely on saveForScene: if this scene's
  // history is still trapped in the legacy blob (never yet migrated this
  // session), removing only the not-yet-existing per-scene key would leave
  // the legacy copy behind — to be wrongly resurrected later when some
  // *other* scene's access finally triggers the migration, recreating a
  // version-history key for a scene that was deliberately deleted.
  ensureLegacySceneVersionsMigrated()
  saveForScene(sceneId, [])
}

// `sceneId` is required now that history is keyed per scene (the version
// object itself also carries `sceneId`, so a caller that only has the
// version, not the scene, can pass `version.sceneId`).
export function deleteSceneVersion(versionId, sceneId) {
  if (!sceneId) return
  saveForScene(sceneId, loadForScene(sceneId).filter(v => v.id !== versionId))
}

// Every scene id that currently has a version-history key in storage —
// used by replaceProjectStorageAtomically (src/storage/projectReplacement.js)
// to sweep `nf_scene_versions:*` keys for scenes that no longer exist in the
// complete authoritative dataset a destructive local operation is writing
// (audit finding #16's "orphaned nf_scene_versions entries" half — deleting
// a single scene, or a whole project, previously left its version history
// behind forever with nothing ever cleaning it up).
export function listSceneIdsWithVersions() {
  ensureLegacySceneVersionsMigrated()
  return listKeys(STORAGE_KEY_PREFIX).map(key => key.slice(STORAGE_KEY_PREFIX.length))
}
