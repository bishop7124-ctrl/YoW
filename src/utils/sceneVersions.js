import { readItem, writeItem } from '../storage/projectStorage'

const STORAGE_KEY = 'nf_scene_versions'
const MAX_VERSIONS_PER_SCENE = 50
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

function load() {
  try { return JSON.parse(readItem(STORAGE_KEY) || '[]') }
  catch { return [] }
}

function save(versions) {
  try { writeItem(STORAGE_KEY, JSON.stringify(versions)) }
  catch { console.warn('Could not save scene versions.') }
}

export function saveSceneVersion(scene) {
  if (!scene?.id) return
  const all = load()
  const existing = all.filter(v => v.sceneId === scene.id)
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

  const sceneVersions = [version, ...existing].slice(0, MAX_VERSIONS_PER_SCENE)
  const others = all.filter(v => v.sceneId !== scene.id)
  save([...others, ...sceneVersions])
}

export function getSceneVersions(sceneId) {
  const all = load()
  return all
    .filter(v => v.sceneId === sceneId)
    .sort((a, b) => b.timestamp - a.timestamp)
}

export function clearSceneVersions(sceneId) {
  const all = load()
  save(all.filter(v => v.sceneId !== sceneId))
}

export function deleteSceneVersion(versionId) {
  const all = load()
  save(all.filter(v => v.id !== versionId))
}

/**
 * Removes every saved version snapshot belonging to a deleted project —
 * the version-history half of audit finding #16 ("Project deletion can
 * leave per-scene keys"): all scene versions live in one flat blob under
 * `nf_scene_versions` rather than per-scene keys, but that blob was never
 * filtered on project delete at all, so every version of every scene in a
 * deleted project stayed on disk indefinitely.
 *
 * Matches primarily on each version's own `novelId` (set at save time —
 * see `saveSceneVersion` above). `sceneIds` is an optional fallback set
 * (the caller — `deleteNovel` in useStore.js — already has it from
 * `deleteAllSceneContentForNovel`'s return value) for the rare version
 * record saved before `novelId` existed on the scene it snapshotted, or
 * where the scene itself never carried one: those records have
 * `novelId: null`, so `novelId` alone can't identify them, but their
 * `sceneId` still can.
 */
export function clearSceneVersionsForNovel(novelId, sceneIds = []) {
  if (novelId == null) return
  const sceneIdSet = new Set(sceneIds)
  const all = load()
  save(all.filter(v => {
    if (v.novelId === novelId) return false
    if (v.novelId == null && sceneIdSet.has(v.sceneId)) return false
    return true
  }))
}
