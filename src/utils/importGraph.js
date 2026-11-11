import { IDEA_ENTITY_TYPES } from './ideaEntries'

// Additive copies are independent records, not series mirrors of the source.
const IDENTITY_FIELDS = new Set(['id', 'novelId', 'sourceNovelId', 'syncRootId', 'syncSourceId', 'syncHiddenInIds', 'syncDeleted'])
export const importRecordContent = record => Object.fromEntries(Object.entries(record).filter(([key]) => !IDENTITY_FIELDS.has(key)))

const ENTITY_COLLECTIONS = Object.fromEntries(IDEA_ENTITY_TYPES.map(type => [type.id, type.collection]))
const LIST_REFERENCES = {
  characterIds: 'characters', linkedCharacters: 'characters',
  locationIds: 'locations', linkedLocations: 'locations',
  factionIds: 'factions', loreIds: 'loreEntries', linkedIdeas: 'ideaEntries',
}

// Resolve only declared reference fields, never arbitrary strings equal to IDs.
// Each collection has its own map: a legacy character and location can share
// the same old ID. Missing/unselected targets are deliberately unlinked; an
// identically named/identified destination record is not evidence of identity.
export function createImportGraph() {
  const maps = new Map()
  const register = (collection, oldId, newId) => {
    if (!maps.has(collection)) maps.set(collection, new Map())
    maps.get(collection).set(String(oldId), newId)
  }
  const at = (collection, id) => id === undefined || id === null || id === '' ? null : maps.get(collection)?.get(String(id)) || null
  const ids = (collection, values) => (Array.isArray(values) ? values : []).map(id => at(collection, id)).filter(Boolean)
  const entity = link => {
    const id = link && at(ENTITY_COLLECTIONS[link.type], link.id)
    return id ? { ...link, id } : null
  }

  // Return a patch, rather than an entire record, so the second pass does not
  // reset generated order, timestamps, recovery parents, or unrelated content.
  const references = (collection, record) => {
    const patch = {}
    const list = (field, target) => {
      if (Object.hasOwn(record, field)) patch[field] = ids(target, record[field])
    }
    const scalar = (field, target, empty = null) => {
      if (Object.hasOwn(record, field)) patch[field] = at(target, record[field]) || empty
    }
    for (const [field, target] of Object.entries(LIST_REFERENCES)) list(field, target)
    if (collection === 'characters') {
      scalar('factionId', 'factions', '')
      for (const field of ['parentIds', 'childIds', 'spouseIds']) list(field, 'characters')
      if (Array.isArray(record.relationships)) patch.relationships = record.relationships
        .map(rel => ({ ...rel, targetId: at('characters', rel.targetId) })).filter(rel => rel.targetId)
      if (Array.isArray(record.familyLinks)) patch.familyLinks = record.familyLinks
        .map(link => ({ ...link, sourceCharacterId: at('characters', link.sourceCharacterId), targetCharacterId: at('characters', link.targetCharacterId) }))
        .filter(link => link.sourceCharacterId && link.targetCharacterId)
      if (record.journey) patch.journey = {
        ...record.journey,
        ...(Array.isArray(record.journey.beats) ? { beats: record.journey.beats.map(beat => ({
          ...beat,
          timelineEventId: at('timeline', beat.timelineEventId) || '',
          chapterId: at('chapters', beat.chapterId) || '',
          sceneId: at('scenes', beat.sceneId) || '',
          linkedCharacterId: at('characters', beat.linkedCharacterId) || '',
        })) } : {}),
      }
    }
    if (collection === 'timeline' || collection === 'worldHistory') {
      scalar('eraId', 'eras')
      scalar('worldHistoryEntryId', 'worldHistory')
      scalar('linkedHistoryEntryId', 'worldHistory')
      scalar('timelineEventId', 'timeline')
      scalar('linkedTimelineEventId', 'timeline')
    }
    if (collection === 'scenes') {
      scalar('actId', 'acts')
      scalar('conflictOf', 'scenes')
      scalar('povCharacterId', 'characters')
      list('timelineEventIds', 'timeline')
      // Suggestion dismissals are scoped to the original project. Reset them
      // just as the native partial importer did when scene links were added.
      if (Object.hasOwn(record, 'dismissedLinks')) patch.dismissedLinks = []
    }
    if (collection === 'ideaEntries') {
      if (Array.isArray(record.linkedEntities)) patch.linkedEntities = record.linkedEntities.map(entity).filter(Boolean)
      if (Object.hasOwn(record, 'convertedTo')) patch.convertedTo = entity(record.convertedTo)
    }
    if (collection === 'rpgCharacters' && Array.isArray(record.npcRelationships)) patch.npcRelationships = record.npcRelationships
      .map(rel => ({ ...rel, characterId: at('characters', rel.characterId) })).filter(rel => rel.characterId)
    if (collection === 'comicPanels' && Array.isArray(record.dialogue)) patch.dialogue = record.dialogue.map(line => ({
      ...line,
      ...(Object.hasOwn(line, 'characterId') ? { characterId: at('characters', line.characterId) || '' } : {}),
    }))
    if (collection === 'maps') {
      for (const field of ['mapObjects', 'mapRegions', 'mapPins']) {
        if (!Array.isArray(record[field])) continue
        // Object/wall/stamp IDs are local to their map and stay together.
        patch[field] = record[field].map(item => {
          if (item.linkedEntity?.entityType !== 'location') return item
          const id = at('locations', item.linkedEntity.entityId)
          return { ...item, linkedEntity: id ? { ...item.linkedEntity, entityId: id } : null }
        })
      }
    }
    return patch
  }
  return { register, at, references }
}
