import { listKeys, replaceItemsAtomically } from './projectStorage.js'
import { sceneContentKey } from './sceneContentStore.js'

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
  // Version history is local recovery data rather than part of cloud exports.
  // A full replacement clears it unless a local destructive operation supplies
  // the subset that still belongs to retained projects.
  entries.nf_scene_versions = JSON.stringify(source.sceneVersions ?? [])
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

export async function replaceProjectStorageAtomically(data, options = {}) {
  const entries = buildProjectReplacementEntries(data, options)
  const retainedSceneKeys = new Set(Object.keys(entries).filter(key => key.startsWith('nf_scene_content:')))
  const staleSceneKeys = listKeys('nf_scene_content:').filter(key => !retainedSceneKeys.has(key))
  const keysToRemove = ['nf_localWriteFailed', ...staleSceneKeys]
  if (!options.ownerId) keysToRemove.push('nf_localOwner')
  await replaceItemsAtomically(entries, keysToRemove)
  return entries
}
