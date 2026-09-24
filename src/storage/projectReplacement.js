import { listKeys, replaceItemsAtomically } from './projectStorage.js'
import { sceneContentKey } from './sceneContentStore.js'
import { ensureLegacySceneVersionsMigrated } from '../utils/sceneVersions.js'

const COLLECTIONS = [
  ['nf_novels', 'novels'],
  ['nf_characters', 'characters'],
  ['nf_factions', 'factions'],
  ['nf_locations', 'locations'],
  ['nf_timeline', 'timeline'],
  ['nf_worldHistory', 'worldHistory'],
  ['nf_acts', 'acts'],
  ['nf_chapters', 'chapters'],
  ['nf_loreEntries', 'loreEntries'],
  ['nf_ideaEntries', 'ideaEntries'],
  ['nf_maps', 'maps'],
  ['nf_whiteboards', 'whiteboards'],
  ['nf_series', 'series'],
  ['nf_storySchedule', 'storySchedule'],
  ['nf_rpg_characters', 'rpgCharacters'],
  ['nf_comicPages', 'comicPages'],
  ['nf_comicPanels', 'comicPanels'],
  ['nf_eras', 'eras'],
  ['nf_recordConflicts', 'recordConflicts'],
]

export function buildProjectReplacementEntries(data, { ownerId = null, writtenAt = Date.now() } = {}) {
  const source = data && typeof data === 'object' ? data : {}
  const entries = {}
  COLLECTIONS.forEach(([storageKey, field]) => {
    entries[storageKey] = JSON.stringify(source[field] ?? [])
  })
  entries.nf_activeMapByNovel = JSON.stringify(source.activeMapByNovel ?? {})
  entries.nf_currentYear = JSON.stringify(source.currentYear ?? 0)
  entries.nf_activeNovel = JSON.stringify(source.activeNovelId ?? null)
  entries.nf_localWriteAt = String(writtenAt)
  if (ownerId) entries.nf_localOwner = String(ownerId)

  const scenes = Array.isArray(source.scenes) ? source.scenes : []
  entries.nf_scenes = JSON.stringify(scenes.map(scene => {
    if (!scene || typeof scene !== 'object' || scene.id == null) return scene
    const { content: _content, ...metadata } = scene
    entries[sceneContentKey(scene.id)] = typeof scene.content === 'string' ? scene.content : ''
    return metadata
  }))
  return entries
}

const SCENE_CONTENT_PREFIX = 'nf_scene_content:'
// Version history now lives under its own per-scene key (see
// src/utils/sceneVersions.js for why: a single shared `nf_scene_versions`
// blob let two tabs snapshotting two *different* scenes race on the same
// storage key). It is local recovery data, not part of a scene's own
// metadata/content, so a replacement never rewrites it directly — it only
// sweeps the version-history key of any scene that no longer exists in the
// complete authoritative dataset being written, the same way stale content
// keys are swept below (audit finding #16's "orphaned nf_scene_versions
// entries" half).
const SCENE_VERSIONS_PREFIX = 'nf_scene_versions:'

export async function replaceProjectStorageAtomically(data, options = {}) {
  // Must run before computing the sweep below: a scene (or whole project)
  // being deleted right now might have its version history still trapped in
  // the legacy shared blob rather than its own `nf_scene_versions:<id>` key
  // (e.g. this is the very first scene-version-touching operation this
  // session) — the sweep below only ever looks at keys that already exist,
  // so without this it would miss that data entirely, leaving it to be
  // wrongly resurrected later. See ensureLegacySceneVersionsMigrated's own
  // comment for the full explanation.
  ensureLegacySceneVersionsMigrated()
  const entries = buildProjectReplacementEntries(data, options)
  const retainedSceneIds = new Set(
    Object.keys(entries)
      .filter(key => key.startsWith(SCENE_CONTENT_PREFIX))
      .map(key => key.slice(SCENE_CONTENT_PREFIX.length))
  )
  const staleSceneKeys = listKeys(SCENE_CONTENT_PREFIX).filter(key => !retainedSceneIds.has(key.slice(SCENE_CONTENT_PREFIX.length)))
  const staleSceneVersionKeys = listKeys(SCENE_VERSIONS_PREFIX).filter(key => !retainedSceneIds.has(key.slice(SCENE_VERSIONS_PREFIX.length)))
  const keysToRemove = ['nf_localWriteFailed', ...staleSceneKeys, ...staleSceneVersionKeys]
  if (!options.ownerId) keysToRemove.push('nf_localOwner')
  await replaceItemsAtomically(entries, keysToRemove)
  return entries
}
