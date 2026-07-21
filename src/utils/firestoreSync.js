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

const TABLE_TO_KEY = {
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

const APP_DATA_TABLES = [...USER_TABLES, ...NOVEL_TABLES]

function getTableRows(table, userId, items = []) {
  if (!items?.length) return []

  if (table === 'scenes') {
    return items.map(item => ({ user_id: userId, scene_id: item.id, data: item }))
  }

  const isUserLevel = USER_TABLES.includes(table)
  return items.map(item => ({
    id:      item.id,
    user_id: userId,
    ...(isUserLevel ? {} : { novel_id: item.novelId ?? null }),
    data:    item,
    updated_at: new Date().toISOString(),
  }))
}

function getUserSettingsPayload(data = {}) {
  return {
    activeNovelId: data.activeNovelId ?? null,
    currentYear: data.currentYear ?? 0,
    activeMapByNovel: data.activeMapByNovel ?? {},
  }
}

function throwIfSupabaseError(error, label) {
  if (error) throw new Error(`[sync] ${label}: ${error.message || 'Unknown cloud error'}`)
}

function timestampMs(value) {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

// Load all user data from normalized tables on login
export async function loadUserData(userId) {
  if (OFFLINE_MODE) return { _savedAt: 0 }

  const [settingsResult, ...entityResults] = await Promise.all([
    supabase.from('user_settings').select('data, updated_at').eq('user_id', userId).maybeSingle(),
    ...APP_DATA_TABLES.map(table => {
      // scenes uses scene_id as the id column (legacy schema)
      const idCol = table === 'scenes' ? 'scene_id' : 'id'
      const columns = table === 'scenes' ? `${idCol}, data` : `${idCol}, data, updated_at`
      return supabase.from(table).select(columns).eq('user_id', userId)
    }),
  ])

  const settings = settingsResult.data?.data ?? {}
  let remoteSavedAt = timestampMs(settingsResult.data?.updated_at)

  const result = {
    _savedAt:        0,
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

  APP_DATA_TABLES.forEach((table, i) => {
    const { data, error } = entityResults[i]
    if (error) { console.warn(`[sync] load error for ${table}:`, error); return }
    const key = TABLE_TO_KEY[table]
    result[key] = (data ?? []).map(row => row.data).filter(Boolean)
    ;(data ?? []).forEach(row => {
      remoteSavedAt = Math.max(remoteSavedAt, timestampMs(row.updated_at))
    })
  })

  result._savedAt = remoteSavedAt

  return result
}

// Upsert an array of items into a table (one row per item).
// Each item must have an `id` field. novel_id is taken from item.novelId.
// Throws on a Supabase-reported error (rather than only logging) so callers —
// notably useStore's sync-status tracking — can tell a push actually failed.
export async function upsertItems(table, userId, items) {
  if (OFFLINE_MODE || !items?.length) return

  const rows = getTableRows(table, userId, items)
  const { error } = await supabase.from(table).upsert(rows)
  throwIfSupabaseError(error, `upsert error for ${table}`)
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
  throwIfSupabaseError(error, 'user_settings upsert error')
}

export async function saveUserData(userId, data = {}) {
  if (OFFLINE_MODE || !userId) return

  const settings = getUserSettingsPayload(data)
  const { error: settingsError } = await supabase.from('user_settings').upsert({
    user_id: userId,
    data: settings,
    updated_at: new Date().toISOString(),
  })
  throwIfSupabaseError(settingsError, 'user_settings upsert error')

  await Promise.all(APP_DATA_TABLES.map(async table => {
    const key = TABLE_TO_KEY[table]
    const rows = getTableRows(table, userId, data[key] ?? [])
    if (!rows.length) return
    const { error } = await supabase.from(table).upsert(rows)
    throwIfSupabaseError(error, `${table} upsert error`)
  }))
}

export async function replaceUserData(userId, data = {}) {
  if (OFFLINE_MODE || !userId) return

  await Promise.all([...APP_DATA_TABLES, 'user_settings'].map(async table => {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    throwIfSupabaseError(error, `${table} delete error`)
  }))

  await saveUserData(userId, data)
}

// Per-scene saves (called directly from updateScene / updateSceneContent)
export async function saveSceneDoc(userId, scene) {
  if (OFFLINE_MODE) return
  const { error } = await supabase.from('scenes').upsert({ user_id: userId, scene_id: scene.id, data: scene })
  throwIfSupabaseError(error, 'scene upsert error')
}

export async function deleteSceneDoc(userId, sceneId) {
  if (OFFLINE_MODE) return
  await supabase.from('scenes').delete().eq('user_id', userId).eq('scene_id', sceneId)
}

// Wipe everything for a user (account deletion)
export async function deleteAllUserData(userId) {
  if (OFFLINE_MODE) return
  const allTables = [
    ...USER_TABLES,
    ...NOVEL_TABLES,
    'user_settings',
    'user_profiles',
    'ai_findings',
    'character_interviews',
    'feedback',
    // legacy pre-migration tables
    'project_data',
    'user_data',
  ]
  await Promise.all(allTables.map(table =>
    supabase.from(table).delete().eq('user_id', userId)
  ))
}
