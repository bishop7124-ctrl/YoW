const TABLE_CONFIG = {
  novels: { key: 'novels', label: 'Project' },
  series_items: { key: 'series', label: 'Series' },
  characters: { key: 'characters', label: 'Character' },
  factions: { key: 'factions', label: 'Faction' },
  locations: { key: 'locations', label: 'Location' },
  timeline_events: { key: 'timeline', label: 'Timeline event' },
  world_history: { key: 'worldHistory', label: 'World history entry' },
  acts: { key: 'acts', label: 'Act' },
  chapters: { key: 'chapters', label: 'Chapter' },
  scenes: { key: 'scenes', label: 'Scene' },
  lore_entries: { key: 'loreEntries', label: 'Lore entry' },
  idea_entries: { key: 'ideaEntries', label: 'Idea' },
  maps_data: { key: 'maps', label: 'Map' },
  whiteboards_data: { key: 'whiteboards', label: 'Whiteboard' },
  story_schedule: { key: 'storySchedule', label: 'Schedule event' },
  rpg_characters: { key: 'rpgCharacters', label: 'RPG character' },
  comic_pages: { key: 'comicPages', label: 'Comic page' },
  comic_panels: { key: 'comicPanels', label: 'Comic panel' },
  eras: { key: 'eras', label: 'Era' },
}

const IGNORED_FIELDS = new Set(['lastModified', 'updatedAt', 'wordHistory'])
const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const labelFor = item => item?.name || item?.title || 'Untitled'

function byId(items = []) {
  return new Map((Array.isArray(items) ? items : []).filter(item => item?.id != null).map(item => [item.id, item]))
}

function mergeRecord({ table, label, id, base, local, cloud, now, conflictId }) {
  if (!base) {
    if (local && cloud && !jsonEq(local, cloud)) {
      return {
        record: local,
        conflict: {
          id: conflictId(),
          table,
          recordId: id,
          label,
          name: labelFor(local),
          mine: local,
          theirs: cloud,
          detectedAt: now,
          source: 'cloud-sync-resume',
        },
      }
    }
    return { record: local || cloud || null, conflict: null }
  }

  if (!local) return { record: cloud && !jsonEq(cloud, base) ? cloud : null, conflict: null }
  if (!cloud) return { record: local && !jsonEq(local, base) ? local : null, conflict: null }
  if (jsonEq(local, cloud)) return { record: local, conflict: null }
  if (jsonEq(local, base)) return { record: cloud, conflict: null }
  if (jsonEq(cloud, base)) return { record: local, conflict: null }

  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(cloud)])
  let merged = { ...local }
  let hasConflict = false
  keys.forEach(key => {
    if (IGNORED_FIELDS.has(key)) return
    const localChanged = !jsonEq(local[key], base[key])
    const cloudChanged = !jsonEq(cloud[key], base[key])
    if (localChanged && cloudChanged) {
      if (!jsonEq(local[key], cloud[key])) hasConflict = true
      return
    }
    if (!localChanged && cloudChanged) merged[key] = cloud[key]
  })

  return {
    record: merged,
    conflict: hasConflict ? {
      id: conflictId(),
      table,
      recordId: id,
      label,
      name: labelFor(local),
      mine: merged,
      theirs: cloud,
      detectedAt: now,
      source: 'cloud-sync-resume',
    } : null,
  }
}

export function reconcileCloudSyncData(localData = {}, cloudData = {}, baseData = {}, options = {}) {
  const now = options.now || Date.now()
  const conflictId = options.conflictId || (() => Math.random().toString(36).slice(2) + Date.now().toString(36))
  const mergedData = { ...cloudData, ...localData }
  const conflicts = []
  let mergedCount = 0

  Object.entries(TABLE_CONFIG).forEach(([table, config]) => {
    const baseMap = byId(baseData[config.key])
    const localMap = byId(localData[config.key])
    const cloudMap = byId(cloudData[config.key])
    const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...cloudMap.keys()])
    const mergedItems = []

    ids.forEach(id => {
      const result = mergeRecord({
        table,
        label: config.label,
        id,
        base: baseMap.get(id),
        local: localMap.get(id),
        cloud: cloudMap.get(id),
        now,
        conflictId,
      })
      if (!result.record) return
      if (result.conflict) conflicts.push(result.conflict)
      if (!jsonEq(result.record, localMap.get(id)) || !jsonEq(result.record, cloudMap.get(id))) mergedCount += 1
      mergedItems.push(result.record)
    })

    mergedData[config.key] = mergedItems
  })

  mergedData.activeMapByNovel = {
    ...(cloudData.activeMapByNovel || {}),
    ...(baseData.activeMapByNovel || {}),
    ...(localData.activeMapByNovel || {}),
  }
  mergedData.currentYear = localData.currentYear ?? cloudData.currentYear ?? baseData.currentYear ?? 0
  const projectIds = new Set((mergedData.novels || []).map(project => project.id))
  mergedData.activeNovelId = projectIds.has(localData.activeNovelId)
    ? localData.activeNovelId
    : projectIds.has(cloudData.activeNovelId)
      ? cloudData.activeNovelId
      : mergedData.novels?.[0]?.id ?? null

  return { mergedData, conflicts, mergedCount }
}
