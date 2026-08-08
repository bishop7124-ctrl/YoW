import { supabase } from '../supabase'
import { OFFLINE_MODE } from './offlineMock'
import { uploadEmbeddedImage } from './uploadUserMedia'

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

// Storage category per table, mirroring the categories the app's own upload
// UIs already use (see uploadUserMedia() call sites) so relocated images land
// next to freshly-uploaded ones instead of in a separate bucket layout.
const CATEGORY_BY_TABLE = {
  characters: 'characters',
  factions: 'factions',
  locations: 'locations',
  novels: 'covers',
  series_items: 'series',
  comic_pages: 'comic',
  comic_panels: 'comic',
}

const BASE64_IMAGE_PREFIX = 'data:image'
const MAX_SCAN_DEPTH = 4

// Recursively finds any string field holding an inline base64 image (a
// `data:image/...;base64,...` value) and uploads it via uploadEmbeddedImage,
// replacing the field with the returned yow-media: Storage reference.
//
// Why this exists: uploadUserMedia() has routed new uploads made through the
// app's own file pickers to Storage since 2026-07-27, but that only covers
// that one entry point. Anything that lands in these tables another way —
// importing/restoring a project export whose JSON still has images inlined,
// or an older row from before that migration shipped — skips uploadUserMedia
// entirely and gets written to the JSONB `data` column as-is. On a
// large/image-heavy account that turns into multi-MB rows, which is what
// caused the login statement-timeout failures this was written to fix (see
// scripts/migrate_embedded_images_to_storage.mjs for the one-off backfill of
// data that already made it into the DB before this existed). This is the
// forward-looking half of that fix: a safety net at the single choke point
// every entity write passes through, so no future code path can reintroduce
// the same bloat, whether or not it remembers to call uploadUserMedia itself.
//
// Failures are logged and left as-is rather than thrown — one bad image
// shouldn't block the rest of a save. maxDepth guards against pathological
// nesting; every field shape in these tables is well within it.
async function stripEmbeddedImages(table, userId, items) {
  const category = CATEGORY_BY_TABLE[table]
  if (!category || !items?.length) return items

  let changed = false

  async function walk(value, depth) {
    if (depth > MAX_SCAN_DEPTH || value == null) return value

    if (typeof value === 'string') {
      if (!value.startsWith(BASE64_IMAGE_PREFIX)) return value
      try {
        const ref = await uploadEmbeddedImage(value, { userId, category })
        changed = true
        return ref
      } catch (error) {
        console.warn(`[sync] could not relocate embedded image in ${table}:`, error)
        return value
      }
    }

    if (Array.isArray(value)) {
      return Promise.all(value.map(v => walk(v, depth + 1)))
    }

    if (typeof value === 'object') {
      const entries = await Promise.all(
        Object.entries(value).map(async ([k, v]) => [k, await walk(v, depth + 1)])
      )
      return Object.fromEntries(entries)
    }

    return value
  }

  const next = await Promise.all(items.map(item => walk(item, 0)))
  return changed ? next : items
}

function getTableRows(table, userId, items = []) {
  if (!items?.length) return []

  if (table === 'scenes') {
    return items.map(item => ({ user_id: userId, scene_id: item.id, novel_id: item.novelId ?? null, data: item }))
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

// The full load below fans out into ~20 fully-parallel per-table requests
// (see loadUserData). With that many requests in flight, the odds that any
// single one hits a one-off network blip are much higher than for a lone
// request — and since a real failure must never be papered over as "this
// project is just empty" (see the note below), one flaky table used to fail
// the entire load and bounce the user to the connection-hiccup screen even
// though the other ~19 tables came back fine. Retry each query a couple of
// times with a short backoff before letting it count as a genuine failure.
async function withRetry(queryFn, attempts = 3, delayMs = 300) {
  let result
  for (let i = 0; i < attempts; i++) {
    result = await queryFn()
    if (!result.error) return result
    if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)))
  }
  return result
}

// Load all user data from normalized tables on login
export async function loadUserData(userId) {
  if (OFFLINE_MODE) return { _savedAt: 0 }

  const [settingsResult, ...entityResults] = await Promise.all([
    withRetry(() => supabase.from('user_settings').select('data, updated_at').eq('user_id', userId).maybeSingle()),
    ...APP_DATA_TABLES.map(table => {
      // scenes uses scene_id as the id column (legacy schema)
      const idCol = table === 'scenes' ? 'scene_id' : 'id'
      const columns = table === 'scenes' ? `${idCol}, data` : `${idCol}, data, updated_at`
      return withRetry(() => supabase.from(table).select(columns).eq('user_id', userId))
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

  // A partial failure here must never be treated as "this project has no
  // data" — a project with real content whose characters query happened to
  // fail would otherwise render as silently empty, indistinguishable from an
  // actually-empty account. Collect failures and throw once every table has
  // been checked, so the caller can show a retry prompt instead of hydrating
  // the store with zeroed-out categories.
  const failedTables = []
  APP_DATA_TABLES.forEach((table, i) => {
    const { data, error } = entityResults[i]
    if (error) { console.warn(`[sync] load error for ${table}:`, error); failedTables.push(table); return }
    const key = TABLE_TO_KEY[table]
    result[key] = (data ?? []).map(row => row.data).filter(Boolean)
    ;(data ?? []).forEach(row => {
      remoteSavedAt = Math.max(remoteSavedAt, timestampMs(row.updated_at))
    })
  })

  if (failedTables.length) {
    throw new Error(`[sync] failed to load: ${failedTables.join(', ')}`)
  }

  result._savedAt = remoteSavedAt

  return result
}

// Upsert an array of items into a table (one row per item).
// Each item must have an `id` field. novel_id is taken from item.novelId.
// Throws on a Supabase-reported error (rather than only logging) so callers —
// notably useStore's sync-status tracking — can tell a push actually failed.
export async function upsertItems(table, userId, items) {
  if (OFFLINE_MODE || !items?.length) return

  const cleanItems = await stripEmbeddedImages(table, userId, items)
  const rows = getTableRows(table, userId, cleanItems)
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
  await Promise.all(NOVEL_TABLES.map(table =>
    supabase.from(table).delete().eq('user_id', userId).eq('novel_id', novelId)
  ))
}

// Reads the authoritative storage-usage counter for a user, maintained by a DB
// trigger on the user-media Storage bucket (see
// supabase/migrations/20260727_user_media_storage.sql). Returns 0 if the
// profile row doesn't exist yet (no uploads made) or in offline mode.
export async function getUserStorageUsage(userId) {
  if (OFFLINE_MODE || !userId) return 0
  const { data, error } = await supabase
    .from('user_profiles')
    .select('storage_used_bytes')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) { console.warn('[sync] load error for user_profiles storage usage:', error); return 0 }
  return data?.storage_used_bytes ?? 0
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
  const { error } = await supabase.from('scenes').upsert({
    user_id: userId,
    scene_id: scene.id,
    novel_id: scene.novelId ?? null,
    data: scene,
  })
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
    'synced_ai_settings',
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
