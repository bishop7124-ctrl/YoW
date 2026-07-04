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
