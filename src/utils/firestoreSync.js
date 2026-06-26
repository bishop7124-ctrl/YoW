import { supabase } from '../supabase'
import { OFFLINE_MODE } from './offlineMock'

// Tables that hold per-novel entity rows
const NOVEL_TABLES = [
  'characters',
  'factions',
  'locations',
  'timeline_events',
  'world_history',
  'acts',
  'chapters',
  'scenes',
  'lore_entries',
  'idea_entries',
  'maps_data',
  'whiteboards_data',
  'story_schedule',
  'rpg_characters',
  'comic_pages',
  'comic_panels',
  'eras',
]

// Tables that hold user-level rows (no novel_id)
const USER_TABLES = ['novels', 'series_items']

// Load all user data from normalized tables on login
export async function loadUserData(userId) {
  if (OFFLINE_MODE) return { _savedAt: 0 }

  const entityTables = [...USER_TABLES, ...NOVEL_TABLES]

  const [settingsResult, ...entityResults] = await Promise.all([
    supabase.from('user_settings').select('data').eq('user_id', userId).maybeSingle(),
    ...entityTables.map(table => {
      // scenes uses scene_id as the id column (legacy schema)
      const idCol = table === 'scenes' ? 'scene_id' : 'id'
      return supabase.from(table).select(`${idCol}, data`).eq('user_id', userId)
    }),
  ])

  const settings = settingsResult.data?.data ?? {}

  const result = {
    _savedAt:        Date.now(),
    activeNovelId:   settings.activeNovelId   ?? null,
    currentYear:     settings.currentYear     ?? 0,
    activeMapByNovel: settings.activeMapByNovel ?? {},
    novels:          [],
    series:          [],
    characters:      [],
    factions:        [],
    locations:       [],
    timeline:        [],
    worldHistory:    [],
    acts:            [],
    chapters:        [],
    scenes:          [],
    loreEntries:     [],
    ideaEntries:     [],
    maps:            [],
    whiteboards:     [],
    storySchedule:   [],
    rpgCharacters:   [],
    comicPages:      [],
    comicPanels:     [],
    eras:            [],
  }

  const tableToKey = {
    novels:           'novels',
    series_items:     'series',
    characters:       'characters',
    factions:         'factions',
    locations:        'locations',
    timeline_events:  'timeline',
    world_history:    'worldHistory',
    acts:             'acts',
    chapters:         'chapters',
    scenes:           'scenes',
    lore_entries:     'loreEntries',
    idea_entries:     'ideaEntries',
    maps_data:        'maps',
    whiteboards_data: 'whiteboards',
    story_schedule:   'storySchedule',
    rpg_characters:   'rpgCharacters',
    comic_pages:      'comicPages',
    comic_panels:     'comicPanels',
    eras:             'eras',
  }

  entityTables.forEach((table, i) => {
    const { data, error } = entityResults[i]
    if (error) { console.warn(`[sync] load error for ${table}:`, error); return }
    const key = tableToKey[table]
    result[key] = (data ?? []).map(row => row.data).filter(Boolean)
  })

  return result
}

// Upsert an array of items into a table (one row per item).
// Each item must have an `id` field. novel_id is taken from item.novelId.
export async function upsertItems(table, userId, items) {
  if (OFFLINE_MODE || !items?.length) return

  // scenes uses scene_id (legacy schema kept intact)
  if (table === 'scenes') {
    await Promise.all(items.map(item =>
      supabase.from('scenes').upsert({ user_id: userId, scene_id: item.id, data: item })
    ))
    return
  }

  const isUserLevel = USER_TABLES.includes(table)
  const rows = items.map(item => ({
    id:      item.id,
    user_id: userId,
    ...(isUserLevel ? {} : { novel_id: item.novelId ?? null }),
    data:    item,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from(table).upsert(rows)
  if (error) console.error(`[sync] upsert error for ${table}:`, error)
}

// Delete a single item row by id
export async function deleteItem(table, userId, itemId) {
  if (OFFLINE_MODE || !itemId) return
  if (table === 'scenes') {
    await supabase.from('scenes').delete().eq('user_id', userId).eq('scene_id', itemId)
    return
  }
  const { error } = await supabase.from(table).delete().eq('user_id', userId).eq('id', itemId)
  if (error) console.error(`[sync] delete error for ${table}:`, error)
}

// Delete all entity rows for a novel (used when deleting a project)
export async function deleteItemsByNovel(userId, novelId) {
  if (OFFLINE_MODE || !novelId) return
  await Promise.all(NOVEL_TABLES.map(table => {
    const col = table === 'scenes' ? 'scene_id' : 'id'
    void col // unused in delete — we filter by user_id + novel_id
    return supabase.from(table).delete().eq('user_id', userId).eq('novel_id', novelId)
  }))
}

// Save user-level scalars (activeNovelId, currentYear, activeMapByNovel)
export async function saveUserSettings(userId, settings) {
  if (OFFLINE_MODE) return
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    data: settings,
    updated_at: new Date().toISOString(),
  })
  if (error) console.error('[sync] user_settings upsert error:', error)
}

// Per-scene saves (called directly from updateScene / updateSceneContent)
export async function saveSceneDoc(userId, scene) {
  if (OFFLINE_MODE) return
  await supabase.from('scenes').upsert({ user_id: userId, scene_id: scene.id, data: scene })
}

export async function deleteSceneDoc(userId, sceneId) {
  if (OFFLINE_MODE) return
  await supabase.from('scenes').delete().eq('user_id', userId).eq('scene_id', sceneId)
}

// Wipe everything for a user (account deletion)
export async function deleteAllUserData(userId) {
  if (OFFLINE_MODE) return
  const allTables = [...USER_TABLES, ...NOVEL_TABLES, 'user_settings']
  await Promise.all(allTables.map(table =>
    supabase.from(table).delete().eq('user_id', userId)
  ))
}
