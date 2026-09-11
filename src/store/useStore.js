import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { upsertItems, deleteItem, deleteItemsByNovel, saveUserSettings, saveSceneDoc, deleteSceneDoc, getUserStorageUsage } from '../utils/firestoreSync'
import { buildProjectStats } from '../utils/projectStats'
import { getProjectType } from '../constants/projectTypes'
import { estimateStoreSize } from '../utils/storageQuota'
import { clearJourneyLinks } from '../utils/characterJourney'
import { buildCharacterAliases, relationshipValues } from '../utils/relationshipMap.js'
import { IDEA_STATUS_IDS, ideaContentPatch, normalizeIdea, nextIdeaOrder, planIdeaMove } from '../utils/ideaEntries.js'
import { getScheduleCalendar, normalizeScheduleEvent, prepareScheduleEvent } from '../utils/scheduleCalendar.js'
import { normalizeOutlineItem, outlinePatch, outlineText, sortOutlineItems } from '../utils/outlineDisplay.js'
import { CHARACTER_LINK_REL_TYPES, isCharacterLinkRelType } from '../constants/relationshipTypes.js'
import { chronicleContentPatch, chronicleLinkId, relinkChronicleRecords } from '../utils/chronicleLinks'
import { STORAGE_MODES, loadStorageMode, saveLocalFirstSnapshot } from '../utils/storageMode'
import { loadValue, readItem, writeItem, removeItem } from '../storage/projectStorage'
import { splitScenesForStorage, hydrateScenesFromStorage, sceneContentKey, deleteAllSceneContentForNovel } from '../storage/sceneContentStore'
import { clearSceneVersionsForNovel } from '../utils/sceneVersions'
import {
  LOCAL_WRITE_FAILED_KEY,
  markLocalWriteFailed,
  clearLocalWriteFailed,
  hasLocalWriteFailed,
  hasCorruptLocalData,
} from '../storage/writeDurability'
import { registerSyncFlush, unregisterSyncFlush } from './syncFlushRegistry'
import { normalizeRpgCharacter } from '../components/characterbuilder/rpgData'
import { deleteUserMedia, getUserMediaPath } from '../utils/uploadUserMedia'
import lastEmberDemoProject from '../data/theLastEmberDemoProject.json'

const load = (key, def) => loadValue(key, def)
const LOCAL_WRITE_AT_KEY = 'nf_localWriteAt'
const LOCAL_OWNER_KEY = 'nf_localOwner'
const lastActiveProjectKey = (ownerId) => ownerId ? `nf_lastActiveProject:${ownerId}` : null
const PROJECT_STORAGE_KEYS = [
  'nf_novels',
  'nf_characters',
  'nf_factions',
  'nf_locations',
  'nf_timeline',
  'nf_worldHistory',
  'nf_currentYear',
  'nf_acts',
  'nf_chapters',
  'nf_scenes',
  'nf_loreEntries',
  'nf_ideaEntries',
  'nf_maps',
  'nf_activeMapByNovel',
  'nf_whiteboards',
  'nf_series',
  'nf_storySchedule',
  'nf_activeNovel',
  'nf_rpg_characters',
  'nf_comicPages',
  'nf_comicPanels',
  'nf_eras',
  'nf_recordConflicts',
  LOCAL_WRITE_AT_KEY,
  LOCAL_OWNER_KEY,
  LOCAL_WRITE_FAILED_KEY,
]
const loadLocalWriteAt = () => {
  try { return Number(readItem(LOCAL_WRITE_AT_KEY) || 0) || 0 }
  catch { return 0 }
}
const loadLocalOwner = () => {
  try { return readItem(LOCAL_OWNER_KEY) || null }
  catch { return null }
}
const markLocalOwner = (ownerId) => {
  try {
    if (ownerId) writeItem(LOCAL_OWNER_KEY, ownerId)
    else removeItem(LOCAL_OWNER_KEY)
  } catch { /* Ignore metadata writes; content saves are handled separately. */ }
}
const markLocalWrite = (ownerId) => {
  try { writeItem(LOCAL_WRITE_AT_KEY, String(Date.now())) }
  catch { /* Ignore metadata writes; the actual content save is handled separately. */ }
  markLocalOwner(ownerId)
}
const saveLastActiveProject = (ownerId, projectId) => {
  const key = lastActiveProjectKey(ownerId)
  if (!key) return
  try {
    writeItem(key, JSON.stringify({ projectId: projectId ?? null, savedAt: Date.now() }))
  } catch { /* Best effort only; cloud settings remain the canonical account copy. */ }
}
const loadLastActiveProject = (ownerId) => {
  const key = lastActiveProjectKey(ownerId)
  if (!key) return null
  try {
    const parsed = JSON.parse(readItem(key) || 'null')
    if (!parsed || typeof parsed !== 'object') return null
    return {
      projectId: parsed.projectId ?? null,
      savedAt: Number(parsed.savedAt || 0) || 0,
    }
  } catch {
    return null
  }
}
// `sceneIds`: the scene ids known locally right before clearing, so their
// individual `nf_scene_content:<id>` keys (see src/storage/sceneContentStore.js
// — scene prose lives outside PROJECT_STORAGE_KEYS' flat per-collection
// list, one key per scene) get removed too, rather than silently surviving
// a sign-out and staying on disk for whichever account uses this browser
// next. Best-effort: a scene whose content key was written in an earlier
// session and never made it into this session's in-memory scenes (e.g. a
// prior storage hiccup) won't be enumerated here — an accepted small gap,
// not a regression versus today's behaviour, which cleans none of these up.
const clearProjectLocalStorage = (sceneIds = []) => {
  try {
    PROJECT_STORAGE_KEYS.forEach(key => removeItem(key))
    sceneIds.forEach(id => { if (id != null) removeItem(sceneContentKey(id)) })
  } catch { /* Best effort only; state setters will also overwrite these keys. */ }
}
const clearProjectRefs = (refs) => {
  refs.novelsRef.current = []
  refs.charactersRef.current = []
  refs.factionsRef.current = []
  refs.locationsRef.current = []
  refs.timelineRef.current = []
  refs.worldHistoryRef.current = []
  refs.actsRef.current = []
  refs.chaptersRef.current = []
  refs.scenesRef.current = []
  refs.loreEntriesRef.current = []
  refs.ideaEntriesRef.current = []
  refs.mapsRef.current = []
  refs.whiteboardsRef.current = []
  refs.storyScheduleRef.current = []
  refs.rpgCharactersRef.current = []
  refs.comicPagesRef.current = []
  refs.comicPanelsRef.current = []
  refs.erasRef.current = []
  refs.activeNovelIdRef.current = null
  refs.activeMapByNovelRef.current = {}
  refs.currentYearRef.current = 0
}
// markLocalWriteFailed/clearLocalWriteFailed/hasLocalWriteFailed now live in
// storage/writeDurability.js (imported above) — a storage-layer concern, not
// a store concern, and needed there so the IndexedDB/desktop-vault backends'
// real async write failures (audit P0-07) can feed the same tracking this
// module's own `save()` below already fed from its synchronous try/catch
// (which only the legacy localStorage backend actually throws through).
// Returns the exact raw string actually written (or null on failure) — commitLocal's
// externalWrite check below caches this per key so a later commit can tell "did
// anything else touch this key since I wrote it" with a cheap string comparison
// instead of re-parsing/re-diffing the whole collection every time.
const save = (key, val) => {
  try {
    const raw = JSON.stringify(val)
    writeItem(key, raw)
    clearLocalWriteFailed(key)
    return raw
  } catch (error) {
    if (key === 'nf_novels' && Array.isArray(val)) {
      try {
        const withoutCovers = val.map(item => ({ ...item, coverPhoto: null }))
        const raw = JSON.stringify(withoutCovers)
        writeItem(key, raw)
        clearLocalWriteFailed(key)
        console.warn('Project data was saved without cover photos because browser storage is full.', error)
        return raw
      } catch {
        // Fall through to the shared warning below.
      }
    }
    markLocalWriteFailed(key)
    console.warn(`Could not save ${key} to browser storage.`, error)
    return null
  }
}
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
// Best-effort Storage cleanup for uploaded images (cover photos, portraits,
// faction logos) belonging to a record that's being deleted. A failed delete
// here must never block the record's own deletion — just log and continue,
// matching this file's other best-effort local-storage patterns.
const deleteMediaUrls = (urls) => {
  const seen = new Set()
  urls.forEach(url => {
    if (!url || seen.has(url)) return
    seen.add(url)
    deleteUserMedia(url).catch(() => {})
  })
}
const countWords = value => {
  if (!value || typeof value !== 'string') return 0
  return value.trim().match(/\S+/g)?.length || 0
}
const dateKey = value => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const SYNC_CATEGORY_CONFIG = {
  characters: { storageKey: 'nf_characters', titleField: 'name' },
  locations: { storageKey: 'nf_locations', titleField: 'name' },
  factions: { storageKey: 'nf_factions', titleField: 'name' },
  lore: { storageKey: 'nf_loreEntries', titleField: 'title' },
  timeline: { storageKey: 'nf_timeline', titleField: 'title' },
  worldhistory: { storageKey: 'nf_worldHistory', titleField: 'title' },
  ideas: { storageKey: 'nf_ideaEntries', titleField: 'title' },
}

// Maps each cloud-synced table (the `table` argument passed to debouncedSaveItems)
// to where its array lives in localStorage and a human label for the
// cross-tab conflict banner. Used by debouncedSaveItems to (a) diff against
// the last-synced snapshot so an edit in one tab only pushes the record(s)
// it actually changed — not the whole stale collection — and (b) detect when
// another tab changed the same record in the meantime, so that can be
// surfaced as a conflict instead of silently overwritten.
const CLOUD_TABLE_CONFIG = {
  novels: { storageKey: 'nf_novels', label: 'Project' },
  series_items: { storageKey: 'nf_series', label: 'Series' },
  characters: { storageKey: 'nf_characters', label: 'Character' },
  factions: { storageKey: 'nf_factions', label: 'Faction' },
  locations: { storageKey: 'nf_locations', label: 'Location' },
  timeline_events: { storageKey: 'nf_timeline', label: 'Timeline event' },
  world_history: { storageKey: 'nf_worldHistory', label: 'World history entry' },
  acts: { storageKey: 'nf_acts', label: 'Act' },
  chapters: { storageKey: 'nf_chapters', label: 'Chapter' },
  lore_entries: { storageKey: 'nf_loreEntries', label: 'Lore entry' },
  idea_entries: { storageKey: 'nf_ideaEntries', label: 'Idea' },
  maps_data: { storageKey: 'nf_maps', label: 'Map' },
  whiteboards_data: { storageKey: 'nf_whiteboards', label: 'Whiteboard' },
  story_schedule: { storageKey: 'nf_storySchedule', label: 'Schedule event' },
  rpg_characters: { storageKey: 'nf_rpg_characters', label: 'RPG character' },
  comic_pages: { storageKey: 'nf_comicPages', label: 'Comic page' },
  comic_panels: { storageKey: 'nf_comicPanels', label: 'Comic panel' },
  eras: { storageKey: 'nf_eras', label: 'Era' },
}
const recordConflictLabel = (item) => item?.name || item?.title || 'Untitled'
// Bookkeeping fields that legitimately differ on every save and aren't
// meaningful to merge or flag as a conflict field-by-field.
const IGNORED_MERGE_FIELDS = new Set(['lastModified', 'updatedAt', 'wordHistory'])
const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const STORAGE_KEY_TO_TABLE = Object.fromEntries(
  Object.entries(CLOUD_TABLE_CONFIG).map(([table, config]) => [config.storageKey, table])
)

const normalizeSyncText = value => String(value || '').trim().toLowerCase()

const syncIdentity = (item, category) => {
  if (!item) return ''
  if (item.syncRootId) return `root:${item.syncRootId}`
  if (item.syncSourceId) return `root:${item.syncSourceId}`
  const field = SYNC_CATEGORY_CONFIG[category]?.titleField ?? 'title'
  const title = normalizeSyncText(item[field] || item.title || item.name)
  return title ? `title:${title}` : `id:${item.id}`
}

const buildStarterStructure = (novelId, type) => {
  const typeCfg = getProjectType(type)
  const isScriptType = ['play', 'screenplay', 'tv_show'].includes(type)
  const starterOutline = Array.isArray(typeCfg.starterOutline) && typeCfg.starterOutline.length
    ? typeCfg.starterOutline
    : [{ title: typeCfg.structure.level1, children: [{ title: typeCfg.structure.level2, scenes: [typeCfg.structure.level3] }] }]

  const starterActs = []
  const starterChapters = []
  const starterScenes = []

  starterOutline.forEach((level1, level1Index) => {
    const actId = uid()
    starterActs.push({
      id: actId,
      novelId,
      title: level1.title || `${typeCfg.structure.level1} ${level1Index + 1}`,
      synopsis: '',
      order: level1Index,
    })

    ;(level1.children || []).forEach((level2, level2Index) => {
      const chapterId = uid()
      starterChapters.push({
        id: chapterId,
        novelId,
        actId,
        title: level2.title || `${typeCfg.structure.level2} ${level2Index + 1}`,
        synopsis: '',
        order: starterChapters.length,
      })

      ;(level2.scenes || [typeCfg.structure.level3]).forEach((sceneTitle) => {
        starterScenes.push({
          id: uid(),
          novelId,
          chapterId,
          title: sceneTitle || typeCfg.structure.level3,
          synopsis: '',
          content: '',
          ...(isScriptType ? { textMode: 'script', scriptElement: 'scene_heading', scriptBlocks: [] } : {}),
          order: starterScenes.length,
          lastModified: Date.now(),
        })
      })
    })
  })

  return { acts: starterActs, chapters: starterChapters, scenes: starterScenes }
}

const buildManuscriptCopy = ({ project, acts, chapters, scenes, title }) => {
  const now = new Date().toISOString()
  return {
    id: uid(),
    projectId: project.id,
    title: title?.trim() || `Retired manuscript ${new Date(now).toLocaleDateString()}`,
    retiredAt: now,
    projectTitle: project.title || project.name || 'Untitled project',
    projectType: project.type || 'novel',
    acts: acts.map(act => ({ ...act })),
    chapters: chapters.map(chapter => ({ ...chapter })),
    scenes: scenes.map(scene => ({ ...scene })),
  }
}

const sampleProjectSeedKey = (ownerId) => ownerId ? `nf_sampleProjectSeeded:the-last-ember-v3:${ownerId}` : null

const collectIds = (value, idMap) => {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach(item => collectIds(item, idMap))
    return
  }
  if (typeof value.id === 'string' && value.id && !idMap[value.id]) idMap[value.id] = uid()
  Object.values(value).forEach(item => collectIds(item, idMap))
}

const remapExportValue = (value, idMap) => {
  if (typeof value === 'string') return idMap[value] || value
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => remapExportValue(item, idMap))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapExportValue(item, idMap)]))
}

const remapExportItems = (items, idMap) => (Array.isArray(items) ? remapExportValue(items, idMap) : [])

const buildSampleProjectData = () => {
  const now = new Date().toISOString()
  const source = lastEmberDemoProject
  const idMap = {}
  collectIds(source, idMap)
  const projectId = idMap[source.project.id] || uid()
  idMap[source.project.id] = projectId

  const project = {
    ...remapExportValue(source.project, idMap),
    id: projectId,
    focus: false,
    isSampleProject: true,
    sampleSource: 'the-last-ember',
    updatedAt: now,
  }

  return {
    project,
    acts: remapExportItems(source.acts, idMap),
    chapters: remapExportItems(source.chapters, idMap),
    scenes: remapExportItems(source.scenes, idMap),
    characters: remapExportItems(source.characters, idMap),
    factions: remapExportItems(source.factions, idMap),
    locations: remapExportItems(source.locations, idMap),
    loreEntries: remapExportItems(source.loreEntries, idMap),
    timeline: remapExportItems(source.timeline, idMap),
    worldHistory: remapExportItems(source.worldHistory, idMap),
    eras: remapExportItems(source.eras, idMap),
    maps: remapExportItems(source.maps, idMap),
    whiteboards: remapExportItems(source.whiteboards, idMap),
    storySchedule: remapExportItems(source.storySchedule, idMap),
    ideaEntries: remapExportItems(source.ideaEntries, idMap),
    rpgCharacters: remapExportItems(source.rpgCharacters, idMap),
  }
}

const withSceneContentHistory = (scene, content, now = Date.now()) => {
  const today = dateKey(now)
  const wordCount = countWords(content)
  const history = Array.isArray(scene.wordHistory) ? [...scene.wordHistory] : []
  const lastIndex = history.findLastIndex(entry => entry.date === today)
  const entry = { date: today, words: wordCount, timestamp: now }
  const wordHistory = lastIndex >= 0
    ? history.map((item, index) => index === lastIndex ? entry : item)
    : [...history, entry].slice(-120)
  return { ...scene, content, lastModified: now, wordHistory }
}

const createSceneConflictCopy = (scene, now = Date.now()) => ({
  ...scene,
  id: uid(),
  title: `${scene.title || 'Scene'} (conflict copy)`,
  conflictOf: scene.id,
  conflictCreatedAt: now,
  lastModified: now,
})

const mergeSceneUpdateWithPersistedCopy = (prev, sceneId, updateScene) => {
  // Only used to detect a stale-tab conflict for this one scene — never as the
  // base for the rebuilt array. Falling back to a persisted snapshot for the
  // whole array would silently discard live edits to every other scene (e.g.
  // after a localStorage write failure left `nf_scenes` stale).
  const persisted = hydrateScenesFromStorage(load('nf_scenes', []))
  const stateScene = prev.find(s => s.id === sceneId)
  const persistedScene = (Array.isArray(persisted) ? persisted : []).find(s => s.id === sceneId)
  if (!stateScene && !persistedScene) return prev

  const sourceScene = persistedScene || stateScene
  const updated = updateScene(sourceScene)
  const persistedChangedOutsideThisTab = Boolean(
    persistedScene &&
    stateScene &&
    (
      persistedScene.content !== stateScene.content ||
      Number(persistedScene.lastModified || 0) > Number(stateScene.lastModified || 0)
    )
  )
  const contentChanged = Object.prototype.hasOwnProperty.call(updated, 'content') && updated.content !== persistedScene?.content
  const shouldPreserveConflict = persistedChangedOutsideThisTab && contentChanged
  const hasConflictCopy = shouldPreserveConflict && prev.some(scene =>
    scene.conflictOf === sceneId && scene.content === persistedScene.content
  )
  const next = stateScene ? prev.map(s => s.id === sceneId ? updated : s) : [...prev, updated]
  return shouldPreserveConflict && !hasConflictCopy
    ? [...next, createSceneConflictCopy(persistedScene)]
    : next
}

const getLocalSnapshot = () => ({
  novels: load('nf_novels', []),
  characters: load('nf_characters', []),
  factions: load('nf_factions', []),
  locations: load('nf_locations', []),
  timeline: load('nf_timeline', []),
  worldHistory: load('nf_worldHistory', []),
  acts: load('nf_acts', []),
  chapters: load('nf_chapters', []),
  scenes: hydrateScenesFromStorage(load('nf_scenes', [])),
  loreEntries: load('nf_loreEntries', []),
  ideaEntries: load('nf_ideaEntries', []),
  maps: load('nf_maps', []),
  activeMapByNovel: load('nf_activeMapByNovel', {}),
  whiteboards: load('nf_whiteboards', []),
  series: load('nf_series', []),
  storySchedule: load('nf_storySchedule', []),
  rpgCharacters: load('nf_rpg_characters', []),
  currentYear: load('nf_currentYear', 0),
  activeNovelId: load('nf_activeNovel', null),
  comicPages: load('nf_comicPages', []),
  comicPanels: load('nf_comicPanels', []),
  eras: load('nf_eras', []),
})

const _buildAppDataPayload = (data) => ({
  novels: data.novels ?? [],
  characters: data.characters ?? [],
  factions: data.factions ?? [],
  locations: data.locations ?? [],
  timeline: data.timeline ?? [],
  worldHistory: data.worldHistory ?? [],
  acts: data.acts ?? [],
  chapters: data.chapters ?? [],
  loreEntries: data.loreEntries ?? [],
  ideaEntries: data.ideaEntries ?? [],
  maps: data.maps ?? [],
  activeMapByNovel: data.activeMapByNovel ?? {},
  whiteboards: data.whiteboards ?? [],
  series: data.series ?? [],
  storySchedule: data.storySchedule ?? [],
  currentYear: data.currentYear ?? 0,
  activeNovelId: data.activeNovelId ?? null,
  comicPages: data.comicPages ?? [],
  comicPanels: data.comicPanels ?? [],
})

const resolveActiveNovelId = (data, ownerId, remoteSavedAt = 0) => {
  const novels = data.novels ?? []
  const projectIds = new Set(novels.map(novel => novel.id))
  const marker = loadLastActiveProject(ownerId)
  if (marker?.savedAt > remoteSavedAt && projectIds.has(marker.projectId)) return marker.projectId
  if (projectIds.has(data.activeNovelId)) return data.activeNovelId
  return novels[0]?.id ?? null
}

// Simple debounce helper: returns a function that delays calling fn by ms
function debounce(fn, ms) {
  let timer
  let pendingArgs = null
  const debounced = (...args) => {
    pendingArgs = args
    clearTimeout(timer)
    timer = setTimeout(() => { pendingArgs = null; fn(...args) }, ms)
  }
  // Immediately runs any pending call instead of waiting out the delay, so a
  // caller (e.g. sign-out) can await the in-flight write before it's too late
  // to send it with a still-valid auth session.
  debounced.flush = () => {
    if (!pendingArgs) return null
    clearTimeout(timer)
    const args = pendingArgs
    pendingArgs = null
    return fn(...args)
  }
  return debounced
}

function createKeyedDebounce(fn, ms) {
  const timers = new Map()
  const pending = new Map()
  const debounced = (key, ...args) => {
    if (timers.has(key)) clearTimeout(timers.get(key))
    pending.set(key, args)
    timers.set(key, setTimeout(() => {
      timers.delete(key)
      pending.delete(key)
      fn(key, ...args)
    }, ms))
  }
  debounced.cancel = (key) => {
    if (!timers.has(key)) return
    clearTimeout(timers.get(key))
    timers.delete(key)
    pending.delete(key)
  }
  // Immediately runs every pending call instead of waiting out the delay, so
  // a caller (e.g. sign-out) can await in-flight writes before it's too late
  // to send them with a still-valid auth session.
  debounced.flushAll = () => {
    const results = []
    for (const [key, args] of pending) {
      clearTimeout(timers.get(key))
      timers.delete(key)
      pending.delete(key)
      results.push(fn(key, ...args))
    }
    return results
  }
  return debounced
}

export function useStore(userId = null, options = {}) {
  const globalReadOnly = Boolean(options.readOnly)
  const freeProjectId = options.freeProjectId ?? null
  const storageQuotaBytes = options.storageQuotaBytes ?? null
  const cloudSyncEnabled = options.cloudSyncEnabled !== false
  const canSyncCloud = Boolean(userId && cloudSyncEnabled)
  const canUseInitialLocal = !userId || loadLocalOwner() === userId
  const loadInitial = (key, def) => canUseInitialLocal ? load(key, def) : def
  const [novels, setNovels] = useState(() => loadInitial('nf_novels', []))
  const [activeNovelId, setActiveNovelId] = useState(() => loadInitial('nf_activeNovel', null))
  const [characters, setCharacters] = useState(() => loadInitial('nf_characters', []))
  const [factions, setFactions] = useState(() => loadInitial('nf_factions', []))
  const [locations, setLocations] = useState(() => loadInitial('nf_locations', []))
  const [timeline, setTimeline] = useState(() => loadInitial('nf_timeline', []))
  const [worldHistory, setWorldHistory] = useState(() => loadInitial('nf_worldHistory', []))
  const [currentYear, setCurrentYear] = useState(() => loadInitial('nf_currentYear', 0))
  const [acts, setActs] = useState(() => loadInitial('nf_acts', []))
  const [chapters, setChapters] = useState(() => loadInitial('nf_chapters', []))
  const [scenes, setScenes] = useState(() => hydrateScenesFromStorage(loadInitial('nf_scenes', [])))
  const [loreEntries, setLoreEntries] = useState(() => loadInitial('nf_loreEntries', []))
  const [ideaEntries, setIdeaEntries] = useState(() => loadInitial('nf_ideaEntries', []))
  const [maps, setMaps] = useState(() => loadInitial('nf_maps', []))
  const [activeMapByNovel, setActiveMapByNovel] = useState(() => loadInitial('nf_activeMapByNovel', {}))
  const [whiteboards, setWhiteboards] = useState(() => loadInitial('nf_whiteboards', []))
  const [series, setSeries] = useState(() => loadInitial('nf_series', []))
  const [storySchedule, setStorySchedule] = useState(() => loadInitial('nf_storySchedule', []))
  const [rpgCharacters, setRpgCharacters] = useState(() => loadInitial('nf_rpg_characters', []))
  const [comicPages, setComicPages] = useState(() => loadInitial('nf_comicPages', []))
  const [comicPanels, setComicPanels] = useState(() => loadInitial('nf_comicPanels', []))
  const [eras, setEras] = useState(() => loadInitial('nf_eras', []))
  // Cross-tab conflicts detected by debouncedSaveItems (see CLOUD_TABLE_CONFIG):
  // a record this tab is about to sync that another tab also changed in the
  // meantime. Local-only bookkeeping, not synced to the cloud itself.
  const [recordConflicts, setRecordConflicts] = useState(() => loadInitial('nf_recordConflicts', []))
  // table -> Map(id -> item reference) as of the last successful (attempted)
  // cloud push, used by debouncedSaveItems to diff out unchanged records.
  const lastSyncedByTableRef = useRef({})

  const novelsRef = useRef(novels)
  const charactersRef = useRef(characters)
  const factionsRef = useRef(factions)
  const locationsRef = useRef(locations)
  const timelineRef = useRef(timeline)
  const worldHistoryRef = useRef(worldHistory)
  const actsRef = useRef(acts)
  const chaptersRef = useRef(chapters)
  const scenesRef = useRef(scenes)
  const loreEntriesRef = useRef(loreEntries)
  const ideaEntriesRef = useRef(ideaEntries)
  const mapsRef = useRef(maps)
  const whiteboardsRef = useRef(whiteboards)
  const storyScheduleRef = useRef(storySchedule)
  const rpgCharactersRef = useRef(rpgCharacters)
  const comicPagesRef = useRef(comicPages)
  const comicPanelsRef = useRef(comicPanels)
  const erasRef = useRef(eras)
  const activeNovelIdRef = useRef(activeNovelId)
  const activeMapByNovelRef = useRef(activeMapByNovel)
  const currentYearRef = useRef(currentYear)

  const [selectedCharacterId, setSelectedCharacterId] = useState(null)
  const [selectedLocationId, setSelectedLocationId] = useState(null)
  const [selectedLoreEntryId, setSelectedLoreEntryId] = useState(null)
  const [selectedIdeaEntryId, setSelectedIdeaEntryId] = useState(null)
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState(null)
  const [selectedHistoryEntryId, setSelectedHistoryEntryId] = useState(null)
  const selectTimelineEvent = useCallback(id => { setSelectedHistoryEntryId(null); setSelectedTimelineEventId(id) }, [])
  const selectHistoryEntry = useCallback(id => { setSelectedTimelineEventId(null); setSelectedHistoryEntryId(id) }, [])
  const [selectedSceneId, setSelectedSceneId] = useState(null)
  // Which scene is open in writing mode — mirrored into the URL so a refresh
  // returns to the same scene instead of the top of the manuscript.
  const [writingSceneId, setWritingSceneId] = useState(null)

  // Track whether we're mid-import to suppress Firestore saves during bulk load
  const importing = useRef(false)
  // Existing-project archive imports populate several collections in one
  // synchronous pass. Keep their intermediate state off the network so a
  // failed pass can restore its snapshot before cloud effects observe it.
  const projectImportDepthRef = useRef(0)
  const projectImportSceneIdsRef = useRef(new Set())
  const remoteReady = useRef(!userId)
  const previousUserId = useRef(userId)

  // Cloud sync status — surfaced to the desktop Storage settings UI (last synced/syncing/error).
  // pendingRef counts in-flight pushes so overlapping debounced saves settle into one
  // 'syncing' → 'synced' transition instead of flickering per-entity.
  const syncPendingRef = useRef(0)
  const [syncStatus, setSyncStatus] = useState({ state: 'idle', lastSyncedAt: null, lastError: null })

  // Total storage usage = uploaded media (DB-authoritative counter, maintained
  // by a trigger on the user-media Storage bucket) + text/JSON content (still
  // estimated client-side, same as before images moved out of the JSON blob).
  // Refetching the media half on login and after any upload/delete keeps the
  // Storage settings UI and upload-time/creation-time quota checks accurate.
  const [storageMediaBytes, setStorageMediaBytes] = useState(0)
  const refreshStorageUsedBytes = useCallback(async () => {
    if (!canSyncCloud) { setStorageMediaBytes(0); return 0 }
    const used = await getUserStorageUsage(userId)
    setStorageMediaBytes(used)
    return used
  }, [canSyncCloud, userId])
  useEffect(() => { refreshStorageUsedBytes().catch(console.error) }, [refreshStorageUsedBytes])
  // estimateStoreSize used to JSON.stringify + Blob-size the *entire* account's data —
  // every novel, character, and scene's full text, across every project — as one combined
  // blob on every call. Computing that synchronously in this `useMemo`, keyed on `scenes`
  // among everything else, meant every single scene-content commit while typing (every
  // ~400ms, via SceneEditor's own debounced store commit) forced a full-account
  // JSON.stringify on the main thread, in the middle of a keystroke's render — flagged as
  // a likely lag contributor when it landed (2026-08-06 ROADMAP note) but never actually
  // fixed, and confirmed live 2026-08-08 via a user screen recording showing multi-second
  // keystroke-to-paint delay unrelated to anything in SceneEditor.jsx/
  // useCaretComfortScroll.js. estimateStoreSize itself now caches each key's serialised
  // size against that key's own array/object reference (storageQuota.js), so a scene edit
  // — which only changes the `scenes` reference — re-stringifies just `scenes`, not
  // `novels`/`characters`/`factions`/`locations`/etc. too. That keeps this fully
  // synchronous (no staleness, quota enforcement exactly as responsive as before — a
  // debounced version was tried first and reverted here because it weakened
  // storageExceededCheck's responsiveness and broke its test coverage) while cutting the
  // actual per-keystroke cost down to "the one array that changed."
  const storageUsedBytes = useMemo(() => storageMediaBytes + estimateStoreSize({
    novels, characters, factions, locations, timeline, worldHistory,
    acts, chapters, scenes, loreEntries, ideaEntries, maps, whiteboards,
    series, storySchedule,
  }), [
    storageMediaBytes, novels, characters, factions, locations, timeline, worldHistory,
    acts, chapters, scenes, loreEntries, ideaEntries, maps, whiteboards, series, storySchedule,
  ])

  const notifyReadOnly = (reason = 'trial-ended', extra = {}) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('membership-read-only', { detail: { reason, ...extra } }))
    }
  }

  // Surfaces a UI warning when local storage can't keep up — quota exceeded,
  // or (audit P0-07) the IndexedDB/desktop-vault backend's real async
  // persist failing after retries are exhausted. save() and the storage
  // backends both flag failing keys as they go (see writeDurability.js);
  // poll rather than thread a setter through every call site.
  const [localStorageWarning, setLocalStorageWarning] = useState(() => hasLocalWriteFailed())
  // Separate signal: a stored value existed but failed to parse as JSON —
  // genuine on-disk corruption, not a write failure, so it needs different
  // user guidance (nothing to "free up space" for; some data just didn't
  // load).
  const [localDataCorrupted, setLocalDataCorrupted] = useState(() => hasCorruptLocalData())
  useEffect(() => {
    const check = () => {
      setLocalStorageWarning(hasLocalWriteFailed())
      setLocalDataCorrupted(hasCorruptLocalData())
    }
    const interval = setInterval(check, 4000)
    return () => clearInterval(interval)
  }, [])
  const trackSync = useCallback((promise) => {
    syncPendingRef.current += 1
    setSyncStatus(s => ({ ...s, state: 'syncing' }))
    promise
      .then(() => {
        syncPendingRef.current = Math.max(0, syncPendingRef.current - 1)
        setSyncStatus(() => ({
          state: syncPendingRef.current > 0 ? 'syncing' : 'synced',
          lastSyncedAt: Date.now(),
          lastError: null,
        }))
      })
      .catch(err => {
        console.error(err)
        syncPendingRef.current = Math.max(0, syncPendingRef.current - 1)
        setSyncStatus(s => ({
          state: syncPendingRef.current > 0 ? 'syncing' : 'error',
          lastSyncedAt: s.lastSyncedAt,
          lastError: err?.message || 'Sync failed',
        }))
      })
    return promise
  }, [])

  const getCurrentSnapshot = useCallback(() => ({
    novels,
    characters,
    factions,
    locations,
    timeline,
    worldHistory,
    acts,
    chapters,
    scenes,
    loreEntries,
    ideaEntries,
    maps,
    activeMapByNovel,
    whiteboards,
    series,
    storySchedule,
    rpgCharacters,
    currentYear,
    activeNovelId,
    comicPages,
    comicPanels,
    eras,
    recordConflicts,
  }), [
    novels,
    characters,
    factions,
    locations,
    timeline,
    worldHistory,
    acts,
    chapters,
    scenes,
    loreEntries,
    ideaEntries,
    maps,
    activeMapByNovel,
    whiteboards,
    series,
    storySchedule,
    rpgCharacters,
    currentYear,
    activeNovelId,
    comicPages,
    comicPanels,
    eras,
    recordConflicts,
  ])

  useEffect(() => {
    if (previousUserId.current === userId) return
    const previous = previousUserId.current
    if (previous && loadStorageMode(previous) === STORAGE_MODES.LOCAL_FIRST) {
      saveLocalFirstSnapshot(previous, getCurrentSnapshot())
    }
    previousUserId.current = userId
    remoteReady.current = false
    importing.current = true
    syncPendingRef.current = 0
    setSyncStatus({ state: 'idle', lastSyncedAt: null, lastError: null })
    clearProjectLocalStorage((scenesRef.current || []).map(s => s?.id))
    clearProjectRefs({
      novelsRef,
      charactersRef,
      factionsRef,
      locationsRef,
      timelineRef,
      worldHistoryRef,
      actsRef,
      chaptersRef,
      scenesRef,
      loreEntriesRef,
      ideaEntriesRef,
      mapsRef,
      whiteboardsRef,
      storyScheduleRef,
      rpgCharactersRef,
      comicPagesRef,
      comicPanelsRef,
      erasRef,
      activeNovelIdRef,
      activeMapByNovelRef,
      currentYearRef,
    })
    setNovels([])
    setCharacters([])
    setFactions([])
    setLocations([])
    setTimeline([])
    setWorldHistory([])
    setActs([])
    setChapters([])
    setScenes([])
    setLoreEntries([])
    setIdeaEntries([])
    setMaps([])
    setActiveMapByNovel({})
    setWhiteboards([])
    setSeries([])
    setStorySchedule([])
    setRpgCharacters([])
    setComicPages([])
    setComicPanels([])
    setCurrentYear(0)
    setActiveNovelId(null)
    if (userId) {
      markLocalOwner(userId)
      return
    }
    if (!previous) {
      importing.current = false
      remoteReady.current = true
    }
  }, [userId, getCurrentSnapshot])

  // Per-key raw string this tab's own commitLocal last actually wrote — lets a later
  // commit for the same key answer "has anything else (another real browser tab, via
  // the cross-tab storage broadcast) touched this key since I wrote it" with one cheap
  // string comparison, instead of unconditionally paying for load(key)'s JSON.parse
  // plus the full per-record merge/rebase loop below on every single commit. See the
  // skip-check inside commitLocal for why this is provably safe, not just a perf hack.
  // A ref (not module-level state) so each real tab's own useStore() instance gets an
  // independent cache — critical for the multi-tab tests in useStore.test.js, which
  // simulate two tabs as two renderHook() instances sharing this same module: a
  // module-level cache would conflate "tab A wrote this" with "tab B wrote this" and
  // silently skip the rebase tab B actually needs.
  const lastWrittenRawByKeyRef = useRef(new Map())

  // `commitLocal` already writes `save(key, next)` itself (see below) and calls
  // `setter(next)` with that exact same array reference — but a handful of
  // per-collection "persist on state change" effects further down (one per
  // collection, `useEffect(() => save(key, collection), [collection])`) also
  // exist for the few code paths that legitimately bypass `commitLocal`
  // entirely (full-account reset on logout, project import replacing a whole
  // collection at once — see the raw `setScenes(...)` calls in this file).
  // Those effects fire on *every* state change regardless of source, so a
  // commitLocal-driven update pays for a second, fully redundant save() of
  // the exact value it just wrote. For most collections that's cheap and
  // harmless; for `nf_scenes` specifically (this account's single largest
  // collection by far, into the low single-digit MB — see the 2026-08
  // typing-lag investigation in docs/ROADMAP.md) it doubled the cost of an
  // already-expensive full-array stringify+localStorage write on every
  // ~400ms debounce cycle while typing. Tracking the exact reference
  // commitLocal already persisted per key lets that effect skip its own
  // save() when nothing has changed since — a plain reference-equality
  // check, not a re-serialize, so it's free to check — while still saving
  // for real when state changed via one of the non-commitLocal paths above
  // (a fresh array reference commitLocal never saw). A ref, not module-level
  // state, for the same reason as lastWrittenRawByKeyRef above.
  const lastCommitLocalValueByKeyRef = useRef(new Map())

  // Per-scene write cache and id set for the `nf_scenes` content split (see
  // src/storage/sceneContentStore.js) — a scene's own prose is persisted
  // under its own `nf_scene_content:<id>` key instead of inline inside the
  // account-wide `nf_scenes` blob, so a single scene's edit only ever
  // serializes and writes that one scene instead of every scene in every
  // project. Refs, not module-level state, for the same per-tab-instance
  // reason as lastWrittenRawByKeyRef above.
  const lastWrittenSceneContentByIdRef = useRef(new Map())
  const knownSceneContentIdsRef = useRef(new Set())

  // Exposed so a caller outside commitLocal that independently writes straight to one
  // of these storage keys (today: SceneEditor.jsx's persistSceneDraftToLocalStorage,
  // which writes `nf_scenes` directly, immediately before the debounced store commit's
  // own commitLocal call for the same key — see manuscriptUtils.js's comment) can tell
  // commitLocal "this was me, not another tab," so it doesn't mistake its own sibling
  // write for an external change and pay for the full merge unnecessarily.
  const recordLocalWrite = useCallback((key, raw) => {
    if (!key || raw == null) return
    lastWrittenRawByKeyRef.current.set(key, raw)
  }, [])

  const commitLocal = useCallback((ref, setter, key, updater) => {
    const prevLocal = ref.current
    const rawNext = typeof updater === 'function' ? updater(prevLocal) : updater
    // True no-op — every element unchanged by reference, which `.map()`
    // passes that found nothing to update (e.g. saveCharacter's second,
    // bidirectional-relationship-sync commitLocal call when no relationship
    // actually changed) produce despite building a brand new outer array.
    // Skip storage/broadcast entirely: writing an unchanged copy back out
    // would otherwise re-read `persisted` and re-broadcast for no reason,
    // racing against whatever another tab wrote in the moment between this
    // update's own back-to-back commitLocal calls and clobbering it with a
    // stale snapshot this tab never actually intended to save.
    if (Array.isArray(prevLocal) && Array.isArray(rawNext) &&
        rawNext.length === prevLocal.length && rawNext.every((item, i) => item === prevLocal[i])) {
      return prevLocal
    }
    let next = rawNext
    // `next` here is built from `prevLocal` — THIS tab's own last-known copy
    // of the whole collection, which can be stale for any record another tab
    // changed without this tab knowing. Writing it straight to storage below
    // would silently overwrite those records with this tab's stale copies,
    // even though this update never touched them (the original multi-tab
    // clobber, at the local-storage layer — happens with or without cloud
    // sync, and independently of the cloud-side fix in debouncedSaveItems).
    // Fix: read what's on disk right now and, for every record this update
    // did NOT touch, adopt the fresher on-disk version instead of this tab's
    // stale one. For the record this update DID touch, merge field-by-field
    // against another tab's on-disk version instead of a blind whole-record
    // overwrite: this tab's edit form only ever intentionally changed the
    // field(s) the user actually typed into, but it submits the WHOLE record
    // (including every other field exactly as this tab's — possibly stale —
    // form loaded it). Without merging, saving just one field silently
    // reverts every other field to this tab's stale snapshot, discarding
    // whatever another tab saved for those fields in the meantime — this is
    // the actual shape of the "two tabs, same record, different fields" QA
    // failure, not just a whole-record race. Only when the SAME field was
    // changed by both tabs to different values is it a genuine conflict:
    // this tab's value wins there (consistent with everything else being a
    // "last write wins per field" merge) and it's flagged for review rather
    // than silently decided (see recordConflicts / RecordConflictReview).
    // Scenes are excluded from the conflict-flagging (they have their own,
    // older conflict-copy mechanism — mergeSceneUpdateWithPersistedCopy) but
    // still benefit from the same rebase/merge, so an edit to one field of a
    // scene doesn't clobber a different field (or a different scene) another
    // tab saved.
    //
    // That whole rebase is only ever *necessary* when something else actually
    // wrote to `key` since this tab's own last write to it — if nothing did,
    // "on disk" and "this tab's last-known copy" are identical by construction,
    // and the merge loop below would just hand every record back unchanged
    // (persisted === prevLocal for all of them). Skipping it in that case is
    // provably equivalent, not an approximation: `next` is already `rawNext`,
    // exactly what the merge would have produced. On a large collection (e.g.
    // an account's full `nf_scenes`, which can run into the low single-digit
    // MB across many projects — see the 2026-08 typing-lag investigation in
    // docs/ROADMAP.md) the skipped `load(key, [])` JSON.parse and the
    // per-record diff loop are the dominant cost of every commit, so this
    // turns the common single-tab case (by far the hottest path — every
    // scene-content commit while typing goes through here) from an O(whole
    // collection) read-modify-write into effectively just the O(whole
    // collection) write `save()` already has to do regardless.
    const externalWrite = key && (
      lastWrittenRawByKeyRef.current.get(key) === undefined ||
      readItem(key) !== lastWrittenRawByKeyRef.current.get(key)
    )
    if (key && externalWrite && Array.isArray(prevLocal) && Array.isArray(rawNext)) {
      const persisted = key === 'nf_scenes' ? hydrateScenesFromStorage(load(key, [])) : load(key, [])
      if (Array.isArray(persisted)) {
        const table = STORAGE_KEY_TO_TABLE[key]
        const config = table ? CLOUD_TABLE_CONFIG[table] : null
        const persistedMap = new Map(persisted.map(r => [r?.id, r]))
        const prevMap = new Map(prevLocal.map(r => [r?.id, r]))
        const conflicts = []
        next = rawNext.map(item => {
          if (!item || item.id == null) return item
          const mineBase = prevMap.get(item.id)
          const touchedByThisUpdate = !mineBase || mineBase !== item
          const theirs = persistedMap.get(item.id)
          if (!touchedByThisUpdate) {
            return theirs && !jsonEq(theirs, item) ? theirs : item
          }
          if (!mineBase || !theirs || theirs === mineBase || jsonEq(theirs, mineBase)) return item
          const keys = new Set([...Object.keys(item), ...Object.keys(theirs), ...Object.keys(mineBase)])
          let merged = null
          let fieldConflict = false
          keys.forEach(fieldKey => {
            if (IGNORED_MERGE_FIELDS.has(fieldKey)) return
            const mineChanged = !jsonEq(item[fieldKey], mineBase[fieldKey])
            const theirsChanged = !jsonEq(theirs[fieldKey], mineBase[fieldKey])
            if (mineChanged && theirsChanged) {
              if (!jsonEq(item[fieldKey], theirs[fieldKey])) fieldConflict = true
              return
            }
            if (!mineChanged && theirsChanged) {
              if (!merged) merged = { ...item }
              merged[fieldKey] = theirs[fieldKey]
            }
          })
          if (fieldConflict && config) {
            conflicts.push({
              id: uid(),
              table,
              recordId: item.id,
              label: config.label,
              name: recordConflictLabel(item),
              mine: item,
              theirs,
              detectedAt: Date.now(),
            })
          }
          return merged || item
        })
        // A record present on disk but never seen by this tab at all (not in
        // prevLocal, so this update can't have deleted it) — another tab
        // created it since this tab last loaded; keep it rather than drop it.
        const nextIds = new Set(next.map(r => r?.id))
        const prevIds = new Set(prevLocal.map(r => r?.id))
        const additions = persisted.filter(item => item && item.id != null && !nextIds.has(item.id) && !prevIds.has(item.id))
        if (additions.length) next = [...next, ...additions]
        if (conflicts.length) setRecordConflicts(prev => [...prev, ...conflicts])
      }
    }
    ref.current = next
    markLocalWrite(userId)
    // `next` stays the full (content-included) array for everything else in
    // this function and for the caller's own use of commitLocal's return
    // value — only the bytes handed to save() for `nf_scenes` are split, via
    // splitScenesForStorage's own prevLocal-based safety check (see that
    // function's doc comment for why it's keyed off prevLocal, not a cache).
    const rawWritten = key === 'nf_scenes'
      ? save(key, splitScenesForStorage(next, prevLocal, lastWrittenSceneContentByIdRef.current, knownSceneContentIdsRef.current))
      : save(key, next)
    if (key) {
      if (rawWritten != null) {
        lastWrittenRawByKeyRef.current.set(key, rawWritten)
        lastCommitLocalValueByKeyRef.current.set(key, next)
      } else {
        lastWrittenRawByKeyRef.current.delete(key) // write failed — force the safe path next time
        lastCommitLocalValueByKeyRef.current.delete(key)
      }
    }
    setter(next)
    return next
  }, [userId])

  const saveSettingsNow = useCallback((patch = {}) => {
    const settings = {
      activeNovelId: activeNovelIdRef.current,
      currentYear: currentYearRef.current,
      activeMapByNovel: activeMapByNovelRef.current,
      ...patch,
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'activeNovelId')) {
      activeNovelIdRef.current = patch.activeNovelId ?? null
      markLocalWrite(userId)
      save('nf_activeNovel', activeNovelIdRef.current)
      saveLastActiveProject(userId, activeNovelIdRef.current)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'currentYear')) {
      currentYearRef.current = patch.currentYear ?? 0
      markLocalWrite(userId)
      save('nf_currentYear', currentYearRef.current)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'activeMapByNovel')) {
      activeMapByNovelRef.current = patch.activeMapByNovel ?? {}
      markLocalWrite(userId)
      save('nf_activeMapByNovel', activeMapByNovelRef.current)
    }
    if (canSyncCloud && projectImportDepthRef.current === 0) trackSync(saveUserSettings(userId, settings)).catch(() => {})
    return settings
  }, [userId, canSyncCloud, trackSync])

  const selectActiveNovel = useCallback((id) => {
    const nextId = id ?? null
    saveSettingsNow({ activeNovelId: nextId })
    setActiveNovelId(nextId)
    setWritingSceneId(null)
  }, [saveSettingsNow])

  const focusDashboardProject = useCallback((id) => {
    const nextId = id ?? null
    if (!nextId) return
    commitLocal(novelsRef, setNovels, 'nf_novels', prev => prev.map(novel => {
      const shouldFocus = novel.id === nextId
      return novel.focus === shouldFocus ? novel : { ...novel, focus: shouldFocus }
    }))
  }, [commitLocal])

  const selectDashboardActiveProject = useCallback((id) => {
    const nextId = id ?? null
    if (!nextId) return
    selectActiveNovel(nextId)
    focusDashboardProject(nextId)
  }, [selectActiveNovel, focusDashboardProject])

  // localStorage persistence
  useEffect(() => { novelsRef.current = novels; save('nf_novels', novels) }, [novels])
  useEffect(() => { activeNovelIdRef.current = activeNovelId; save('nf_activeNovel', activeNovelId) }, [activeNovelId])
  useEffect(() => { charactersRef.current = characters; save('nf_characters', characters) }, [characters])
  useEffect(() => { factionsRef.current = factions; save('nf_factions', factions) }, [factions])
  useEffect(() => { locationsRef.current = locations; save('nf_locations', locations) }, [locations])
  useEffect(() => { timelineRef.current = timeline; save('nf_timeline', timeline) }, [timeline])
  useEffect(() => { worldHistoryRef.current = worldHistory; save('nf_worldHistory', worldHistory) }, [worldHistory])
  useEffect(() => { erasRef.current = eras; save('nf_eras', eras) }, [eras])
  useEffect(() => { currentYearRef.current = currentYear; save('nf_currentYear', currentYear) }, [currentYear])
  useEffect(() => { actsRef.current = acts; save('nf_acts', acts) }, [acts])
  useEffect(() => { chaptersRef.current = chapters; save('nf_chapters', chapters) }, [chapters])
  useEffect(() => {
    scenesRef.current = scenes
    // Skip the save() entirely when commitLocal already persisted this exact
    // array reference moments ago (the hot path during typing) — see
    // lastCommitLocalValueByKeyRef's comment above for why this is safe: a
    // plain reference check, not a re-serialize, so it costs nothing to
    // check, and it still saves for real whenever `scenes` changed via one
    // of the few paths that legitimately bypass commitLocal (full-account
    // reset, project import).
    if (lastCommitLocalValueByKeyRef.current.get('nf_scenes') === scenes) return
    // Route through the same split-aware save as commitLocal (see its own
    // comment above `splitScenesForStorage`'s import) — this effect is the
    // *other* place `nf_scenes` gets written, for the handful of paths that
    // replace `scenes` wholesale instead of going through commitLocal
    // (initial load, full-account reset, project import). Calling the plain
    // `save('nf_scenes', scenes)` here (as this effect did before) bypassed
    // the split entirely and was one half of a real data-loss incident
    // (2026-08-09): it silently re-inlined every scene's content back into
    // the metadata blob on every load, and the *other* half — the old
    // touched-only content-key write — then stripped it right back out
    // without ever having written it anywhere. `prevScenes: []` here is
    // deliberate, not an oversight: for every path that reaches this
    // effect, `scenes` is a wholesale replacement with no meaningful
    // "before" state in this tab, so every scene should be verified/written
    // as needed rather than assumed already correct on disk.
    save('nf_scenes', splitScenesForStorage(scenes, [], lastWrittenSceneContentByIdRef.current, knownSceneContentIdsRef.current))
  }, [scenes])
  useEffect(() => { loreEntriesRef.current = loreEntries; save('nf_loreEntries', loreEntries) }, [loreEntries])
  useEffect(() => { ideaEntriesRef.current = ideaEntries; save('nf_ideaEntries', ideaEntries) }, [ideaEntries])
  useEffect(() => { mapsRef.current = maps; save('nf_maps', maps) }, [maps])
  useEffect(() => { activeMapByNovelRef.current = activeMapByNovel; save('nf_activeMapByNovel', activeMapByNovel) }, [activeMapByNovel])
  useEffect(() => { whiteboardsRef.current = whiteboards; save('nf_whiteboards', whiteboards) }, [whiteboards])
  useEffect(() => { save('nf_series', series) }, [series])
  useEffect(() => { storyScheduleRef.current = storySchedule; save('nf_storySchedule', storySchedule) }, [storySchedule])
  useEffect(() => { rpgCharactersRef.current = rpgCharacters; save('nf_rpg_characters', rpgCharacters) }, [rpgCharacters])
  useEffect(() => { comicPagesRef.current = comicPages; save('nf_comicPages', comicPages) }, [comicPages])
  useEffect(() => { comicPanelsRef.current = comicPanels; save('nf_comicPanels', comicPanels) }, [comicPanels])
  useEffect(() => { save('nf_recordConflicts', recordConflicts) }, [recordConflicts])

  // Debounced per-entity save — key is the table name. Diffs `items` against
  // the last snapshot this tab actually pushed for `table` (lastSyncedByTableRef)
  // and only upserts the records that changed, instead of resending the whole
  // in-memory array. Without this, a second tab whose own copy of the
  // collection is stale (it never learned about an edit made in the other
  // tab) would, on its own next save, re-push its stale copy of every OTHER
  // record too — silently reverting edits it never touched. (Same-record
  // conflict detection happens earlier, synchronously in commitLocal — by
  // the time this debounced callback runs, this tab's own commitLocal has
  // already overwritten localStorage with its own edit, so it's too late to
  // tell what the other tab had written.)
  const debouncedSaveItems = useMemo(
    () => createKeyedDebounce((table, ownerId, items) => {
      const prevMap = lastSyncedByTableRef.current[table] || new Map()
      const changed = items.filter(item => prevMap.get(item.id) !== item)
      lastSyncedByTableRef.current[table] = new Map(items.map(item => [item.id, item]))
      if (!changed.length) return
      trackSync(upsertItems(table, ownerId, changed)).catch(() => {})
    }, 2000),
    [trackSync]
  )

  // Table -> { setter, ref, storageKey } for the entity collections covered by
  // CLOUD_TABLE_CONFIG, used to apply a recordConflicts resolution back onto
  // the actual collection. `ref` is optional (a couple of collections, e.g.
  // eras/series, don't keep a ref) — restoreRecordConflict captures the
  // updated array itself rather than relying on the ref when absent.
  const RECORD_STATE_SETTERS = useMemo(() => ({
    novels: { setter: setNovels, ref: novelsRef, storageKey: 'nf_novels' },
    series_items: { setter: setSeries, ref: null, storageKey: 'nf_series' },
    characters: { setter: setCharacters, ref: charactersRef, storageKey: 'nf_characters' },
    factions: { setter: setFactions, ref: factionsRef, storageKey: 'nf_factions' },
    locations: { setter: setLocations, ref: locationsRef, storageKey: 'nf_locations' },
    timeline_events: { setter: setTimeline, ref: timelineRef, storageKey: 'nf_timeline' },
    world_history: { setter: setWorldHistory, ref: worldHistoryRef, storageKey: 'nf_worldHistory' },
    acts: { setter: setActs, ref: actsRef, storageKey: 'nf_acts' },
    chapters: { setter: setChapters, ref: chaptersRef, storageKey: 'nf_chapters' },
    lore_entries: { setter: setLoreEntries, ref: loreEntriesRef, storageKey: 'nf_loreEntries' },
    idea_entries: { setter: setIdeaEntries, ref: ideaEntriesRef, storageKey: 'nf_ideaEntries' },
    maps_data: { setter: setMaps, ref: mapsRef, storageKey: 'nf_maps' },
    whiteboards_data: { setter: setWhiteboards, ref: whiteboardsRef, storageKey: 'nf_whiteboards' },
    story_schedule: { setter: setStorySchedule, ref: storyScheduleRef, storageKey: 'nf_storySchedule' },
    rpg_characters: { setter: setRpgCharacters, ref: rpgCharactersRef, storageKey: 'nf_rpg_characters' },
    comic_pages: { setter: setComicPages, ref: comicPagesRef, storageKey: 'nf_comicPages' },
    comic_panels: { setter: setComicPanels, ref: comicPanelsRef, storageKey: 'nf_comicPanels' },
    scenes: { setter: setScenes, ref: scenesRef, storageKey: 'nf_scenes' },
    eras: { setter: setEras, ref: erasRef, storageKey: 'nf_eras' },
  }), [])

  // Applies the OTHER tab's version of a conflicted record on top of the
  // current (this tab's) version, and re-syncs it so the restored value
  // becomes authoritative in the cloud too.
  const restoreRecordConflict = useCallback((conflictId) => {
    setRecordConflicts(prev => {
      const conflict = prev.find(c => c.id === conflictId)
      if (!conflict) return prev
      const entry = RECORD_STATE_SETTERS[conflict.table]
      if (entry) {
        let nextItems = null
        entry.setter(prevItems => {
          nextItems = prevItems.map(r => (r.id === conflict.recordId ? conflict.theirs : r))
          save(entry.storageKey, nextItems)
          if (entry.ref) entry.ref.current = nextItems
          return nextItems
        })
        markLocalWrite(userId)
        if (canSyncCloud && nextItems) {
          if (conflict.table === 'scenes') trackSync(saveSceneDoc(userId, conflict.theirs)).catch(() => {})
          else debouncedSaveItems(conflict.table, userId, nextItems)
        }
      }
      return prev.filter(c => c.id !== conflictId)
    })
  }, [canSyncCloud, userId, debouncedSaveItems, trackSync, RECORD_STATE_SETTERS])

  // Keeps this tab's version (already saved) and just dismisses the warning.
  const discardRecordConflict = useCallback((conflictId) => {
    setRecordConflicts(prev => prev.filter(c => c.id !== conflictId))
  }, [])

  const addRecordConflicts = useCallback((conflicts = []) => {
    if (!Array.isArray(conflicts) || conflicts.length === 0) return
    setRecordConflicts(prev => [...prev, ...conflicts])
  }, [])

  // Debounced user-settings save (activeNovelId, currentYear, activeMapByNovel)
  const debouncedSaveSettings = useMemo(
    () => debounce((uid, settings) => trackSync(saveUserSettings(uid, settings)).catch(() => {}), 2000),
    [trackSync]
  )

  // Debounced Firestore save for individual scenes (1s delay)
  const debouncedSaveScene = useMemo(
    () => createKeyedDebounce((sceneId, uid, scene) => trackSync(saveSceneDoc(uid, scene)).catch(() => {}), 1000),
    [trackSync]
  )

  // Immediately sends any debounced cloud writes that are still waiting out
  // their delay. Must be awaited before sign-out: once the Supabase session
  // is revoked, these same requests would go out unauthenticated and be
  // silently rejected by RLS, permanently losing whatever was edited in the
  // last couple of seconds (e.g. a Party character created right before
  // logging out).
  const flushPendingSync = useCallback(() => {
    const results = [
      ...debouncedSaveItems.flushAll(),
      ...debouncedSaveScene.flushAll(),
    ]
    const settingsFlush = debouncedSaveSettings.flush()
    if (settingsFlush) results.push(settingsFlush)
    return Promise.allSettled(results)
  }, [debouncedSaveItems, debouncedSaveScene, debouncedSaveSettings])

  useEffect(() => {
    if (!canSyncCloud) return undefined
    registerSyncFlush(flushPendingSync)
    // Debounced cloud writes (2s for most entities) otherwise only flush before
    // sign-out — a refresh or tab close during that window silently drops the
    // edit, since the next login re-hydrates from whatever Supabase last had.
    // Mirrors the local-storage backend's own pagehide/beforeunload/hidden
    // flush pattern (see browserVaultAdapter.js's installFlushHandlers).
    const flush = () => { flushPendingSync() }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      unregisterSyncFlush(flushPendingSync)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [canSyncCloud, flushPendingSync])

  // Per-entity cloud sync effects — each only fires when its own collection changes
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('novels', userId, novels) }, [userId, canSyncCloud, novels])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('series_items', userId, series) }, [userId, canSyncCloud, series])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('characters', userId, characters) }, [userId, canSyncCloud, characters])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('factions', userId, factions) }, [userId, canSyncCloud, factions])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('locations', userId, locations) }, [userId, canSyncCloud, locations])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('timeline_events', userId, timeline) }, [userId, canSyncCloud, timeline])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('world_history', userId, worldHistory) }, [userId, canSyncCloud, worldHistory])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('acts', userId, acts) }, [userId, canSyncCloud, acts])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('chapters', userId, chapters) }, [userId, canSyncCloud, chapters])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('lore_entries', userId, loreEntries) }, [userId, canSyncCloud, loreEntries])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('idea_entries', userId, ideaEntries) }, [userId, canSyncCloud, ideaEntries])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('maps_data', userId, maps) }, [userId, canSyncCloud, maps])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('whiteboards_data', userId, whiteboards) }, [userId, canSyncCloud, whiteboards])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('story_schedule', userId, storySchedule) }, [userId, canSyncCloud, storySchedule])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('rpg_characters', userId, rpgCharacters) }, [userId, canSyncCloud, rpgCharacters])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('comic_pages', userId, comicPages) }, [userId, canSyncCloud, comicPages])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('comic_panels', userId, comicPanels) }, [userId, canSyncCloud, comicPanels])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveItems('eras', userId, eras) }, [userId, canSyncCloud, eras])
  useEffect(() => { if (!canSyncCloud || importing.current || !remoteReady.current) return; debouncedSaveSettings(userId, { activeNovelId, currentYear, activeMapByNovel }) }, [userId, canSyncCloud, activeNovelId, currentYear, activeMapByNovel])
  /* eslint-enable react-hooks/exhaustive-deps */

  // Bulk import from Firestore after login
  const importData = useCallback((data) => {
    importing.current = true
    remoteReady.current = false
    const localWriteAt = loadLocalWriteAt()
    const localOwner = loadLocalOwner()
    const remoteSavedAt = Number(data?._savedAt || 0) || 0
    const ownerMatchesCurrentUser = Boolean(userId && localOwner === userId)
    // nf_localWriteAt advances on every commitLocal call regardless of which
    // key it was for, so a healthy small write (e.g. acts) can make a stale,
    // quota-failed nf_scenes snapshot look "fresher than the cloud." If any
    // key is known to have failed to persist, the on-disk snapshot cannot be
    // trusted as authoritative — always prefer the cloud copy instead.
    // remoteSavedAt is derived from MAX(updated_at) across rows that still
    // exist in the cloud, so it is NOT monotonic — deleting content (or an
    // account simply sitting mostly-empty) can make it lower than it used to
    // be. Without a staleness ceiling, a long-dormant browser tab/profile
    // that never reloaded (e.g. after switching accounts on the same device)
    // can still be holding an old nf_localWriteAt that outlives that dip,
    // making genuinely stale/deleted local data look "newer than the cloud"
    // and get resurrected and re-pushed to Supabase. This logic exists to
    // protect a real recent edit from a slow cloud round-trip, not to revive
    // dormant data, so cap how old "local" is allowed to be to still win.
    const LOCAL_TRUST_WINDOW_MS = 30 * 60 * 1000
    const localWriteIsRecent = localWriteAt > 0 && (Date.now() - localWriteAt) < LOCAL_TRUST_WINDOW_MS
    // A known-failed local write should only ever cost the one poisoned key —
    // never the rest of the account. `!hasLocalWriteFailed()` below refuses
    // to let a poisoned local snapshot win purely on the nf_localWriteAt
    // "freshness" signal, but naively applied that also means "prefer the
    // cloud copy" whenever ANYTHING has ever failed to write, even a cloud
    // copy that has no data at all (VITE_OFFLINE_MODE's loadUserData always
    // returns `{ _savedAt: 0 }` with no novels — see firestoreSync.js — and
    // the same is true for real accounts before their first successful sync,
    // or while cloud sync is unreachable). Live-reproduced: create several
    // projects, force one scene's write to fail (simulating real quota
    // exhaustion), then reload with no logout — every project vanished, not
    // just the poisoned scene, because importData treated an empty "cloud"
    // as more authoritative than a local copy holding real, otherwise-
    // untouched data. An empty cloud snapshot is never more trustworthy than
    // a local one that actually has projects in it, regardless of any
    // failed-write flag, so only let hasLocalWriteFailed() override local
    // when the cloud copy actually has something to offer instead.
    const cloudHasAnyData = Array.isArray(data?.novels) && data.novels.length > 0
    const shouldPreferLocal = ownerMatchesCurrentUser && localWriteAt > remoteSavedAt && localWriteIsRecent && (!hasLocalWriteFailed() || !cloudHasAnyData)
    const sourceData = shouldPreferLocal ? getLocalSnapshot() : data
    const sourceProjectIds = new Set((sourceData.novels ?? []).map(novel => novel.id))
    const resolvedActiveNovelId = freeProjectId && sourceProjectIds.has(freeProjectId)
      ? freeProjectId
      : shouldPreferLocal
        ? sourceData.activeNovelId ?? null
        : resolveActiveNovelId(sourceData, userId, remoteSavedAt)

    if (shouldPreferLocal && canSyncCloud) {
      const snapshot = getLocalSnapshot()
      trackSync(Promise.all([
        upsertItems('novels', userId, snapshot.novels ?? []),
        upsertItems('series_items', userId, snapshot.series ?? []),
        upsertItems('characters', userId, snapshot.characters ?? []),
        upsertItems('factions', userId, snapshot.factions ?? []),
        upsertItems('locations', userId, snapshot.locations ?? []),
        upsertItems('timeline_events', userId, snapshot.timeline ?? []),
        upsertItems('world_history', userId, snapshot.worldHistory ?? []),
        upsertItems('acts', userId, snapshot.acts ?? []),
        upsertItems('chapters', userId, snapshot.chapters ?? []),
        upsertItems('lore_entries', userId, snapshot.loreEntries ?? []),
        upsertItems('idea_entries', userId, snapshot.ideaEntries ?? []),
        upsertItems('maps_data', userId, snapshot.maps ?? []),
        upsertItems('whiteboards_data', userId, snapshot.whiteboards ?? []),
        upsertItems('story_schedule', userId, snapshot.storySchedule ?? []),
        upsertItems('rpg_characters', userId, snapshot.rpgCharacters ?? []),
        upsertItems('comic_pages', userId, snapshot.comicPages ?? []),
        upsertItems('comic_panels', userId, snapshot.comicPanels ?? []),
        upsertItems('eras', userId, snapshot.eras ?? []),
        saveUserSettings(userId, { activeNovelId: resolvedActiveNovelId, currentYear: snapshot.currentYear ?? 0, activeMapByNovel: snapshot.activeMapByNovel ?? {} }),
        upsertItems('scenes', userId, snapshot.scenes ?? []),
      ])).catch(() => {})
    }
    markLocalOwner(userId)

    // History reads its own records directly. Loading must not manufacture
    // unlinked Timeline copies (which used to duplicate on every import).
    const rawTimeline = sourceData.timeline ?? []
    const rawHistory = sourceData.worldHistory ?? []

    const importedNovels = sourceData.novels ?? []
    const freeProjectExists = freeProjectId && importedNovels.some(novel => novel.id === freeProjectId)
    const nextNovels = freeProjectExists
      ? importedNovels.map(novel => ({ ...novel, focus: novel.id === freeProjectId }))
      : importedNovels
    const focusChanged = freeProjectExists && JSON.stringify(importedNovels) !== JSON.stringify(nextNovels)

    setNovels(nextNovels)
    setCharacters(sourceData.characters ?? [])
    setFactions(sourceData.factions ?? [])
    setLocations(sourceData.locations ?? [])
    setTimeline(rawTimeline)
    setWorldHistory(rawHistory)
    setActs(sourceData.acts ?? [])
    setChapters(sourceData.chapters ?? [])
    setScenes((() => {
      const importedScenes = sourceData.scenes ?? []
      // A scene conflict copy (see mergeSceneUpdateWithPersistedCopy) is this
      // tab's own safety net for a same-scene multi-tab edit — its push to
      // the cloud is a separate, immediate, non-debounced `saveSceneDoc` call
      // with no retry (unlike the batched per-table upserts), so a transient
      // network/auth failure there fails silently (`.catch(console.error)`).
      // If that happens and this import ends up trusting a local-vs-cloud
      // snapshot that doesn't include the copy yet, it must not be silently
      // dropped just because a plain `setScenes(sourceData.scenes)` replace
      // doesn't know about it — union it back in from whatever's actually on
      // local disk right now (which already correctly reflects any discard/
      // restore the user has done through the app).
      const localScenes = hydrateScenesFromStorage(load('nf_scenes', []))
      const importedIds = new Set(importedScenes.map(s => s.id))
      const missingLocalConflicts = (Array.isArray(localScenes) ? localScenes : [])
        .filter(s => s.conflictOf && !importedIds.has(s.id))
      return missingLocalConflicts.length ? [...importedScenes, ...missingLocalConflicts] : importedScenes
    })())
    setLoreEntries(sourceData.loreEntries ?? [])
    setIdeaEntries(sourceData.ideaEntries ?? [])
    setMaps(sourceData.maps ?? [])
    setActiveMapByNovel(sourceData.activeMapByNovel ?? {})
    setWhiteboards(sourceData.whiteboards ?? [])
    setSeries(sourceData.series ?? [])
    setStorySchedule(sourceData.storySchedule ?? [])
    // Normalizing here (not just at the read boundary — see rpgCharacters in
    // the API below) means a healed character (e.g. backfilled hp) is part
    // of state from the start, not just papered over on render. The regular
    // debounced cloud-sync effect for 'rpg_characters' won't push it, though
    // — it's suppressed by `importing.current` for the whole import (see the
    // trailing setTimeout below), and nothing changes rpgCharacters again
    // afterward to re-trigger it. So any records that actually needed
    // healing are pushed explicitly once import settles, to fix the bad row
    // in Supabase itself rather than re-healing it in memory on every login.
    const rawRpgCharacters = sourceData.rpgCharacters ?? []
    const healedRpgCharacters = rawRpgCharacters.map(normalizeRpgCharacter)
    const healedRpgCharacterChanges = healedRpgCharacters.filter((healed, i) =>
      JSON.stringify(healed) !== JSON.stringify(rawRpgCharacters[i])
    )
    setRpgCharacters(healedRpgCharacters)
    setCurrentYear(sourceData.currentYear ?? 0)
    setActiveNovelId(resolvedActiveNovelId)
    setComicPages(sourceData.comicPages ?? [])
    setComicPanels(sourceData.comicPanels ?? [])
    setEras(sourceData.eras ?? [])
    if (!shouldPreferLocal && canSyncCloud && resolvedActiveNovelId !== (data.activeNovelId ?? null)) {
      trackSync(saveUserSettings(userId, {
        activeNovelId: resolvedActiveNovelId,
        currentYear: sourceData.currentYear ?? 0,
        activeMapByNovel: sourceData.activeMapByNovel ?? {},
      })).catch(() => {})
    }
    if (canSyncCloud && focusChanged) {
      trackSync(upsertItems('novels', userId, nextNovels)).catch(() => {})
    }
    // Seed the per-table "last synced" snapshot from what was just loaded, so
    // the first real edit after login only pushes that one changed record
    // instead of re-diffing against an empty map and pushing the whole
    // collection again (see debouncedSaveItems).
    lastSyncedByTableRef.current = {
      novels: new Map(nextNovels.map(item => [item.id, item])),
      series_items: new Map((sourceData.series ?? []).map(item => [item.id, item])),
      characters: new Map((sourceData.characters ?? []).map(item => [item.id, item])),
      factions: new Map((sourceData.factions ?? []).map(item => [item.id, item])),
      locations: new Map((sourceData.locations ?? []).map(item => [item.id, item])),
      timeline_events: new Map(rawTimeline.map(item => [item.id, item])),
      world_history: new Map(rawHistory.map(item => [item.id, item])),
      acts: new Map((sourceData.acts ?? []).map(item => [item.id, item])),
      chapters: new Map((sourceData.chapters ?? []).map(item => [item.id, item])),
      lore_entries: new Map((sourceData.loreEntries ?? []).map(item => [item.id, item])),
      idea_entries: new Map((sourceData.ideaEntries ?? []).map(item => [item.id, item])),
      maps_data: new Map((sourceData.maps ?? []).map(item => [item.id, item])),
      whiteboards_data: new Map((sourceData.whiteboards ?? []).map(item => [item.id, item])),
      story_schedule: new Map((sourceData.storySchedule ?? []).map(item => [item.id, item])),
      rpg_characters: new Map(healedRpgCharacters.map(item => [item.id, item])),
      comic_pages: new Map((sourceData.comicPages ?? []).map(item => [item.id, item])),
      comic_panels: new Map((sourceData.comicPanels ?? []).map(item => [item.id, item])),
      eras: new Map((sourceData.eras ?? []).map(item => [item.id, item])),
    }
    // Allow effects to settle before re-enabling Firestore saves
    setTimeout(() => {
      importing.current = false
      remoteReady.current = true
      if (canSyncCloud && healedRpgCharacterChanges.length) {
        trackSync(upsertItems('rpg_characters', userId, healedRpgCharacterChanges)).catch(() => {})
      }
    }, 500)
  }, [userId, canSyncCloud, freeProjectId, trackSync])

  useEffect(() => {
    if (!freeProjectId || !novels.some(novel => novel.id === freeProjectId)) return
    if (activeNovelIdRef.current !== freeProjectId) selectActiveNovel(freeProjectId)
    if (novels.some(novel => Boolean(novel.focus) !== (novel.id === freeProjectId))) {
      focusDashboardProject(freeProjectId)
    }
  }, [freeProjectId, novels, selectActiveNovel, focusDashboardProject])

  const finishRemoteLoad = useCallback((allowSaves = true) => {
    importing.current = false
    remoteReady.current = allowSaves
  }, [])

  const replaceData = useCallback((data) => {
    importData(data)

    if (!canSyncCloud) return

    setTimeout(() => {
      upsertItems('novels', userId, data.novels ?? []).catch(console.error)
      upsertItems('series_items', userId, data.series ?? []).catch(console.error)
      upsertItems('characters', userId, data.characters ?? []).catch(console.error)
      upsertItems('factions', userId, data.factions ?? []).catch(console.error)
      upsertItems('locations', userId, data.locations ?? []).catch(console.error)
      upsertItems('timeline_events', userId, data.timeline ?? []).catch(console.error)
      upsertItems('world_history', userId, data.worldHistory ?? []).catch(console.error)
      upsertItems('acts', userId, data.acts ?? []).catch(console.error)
      upsertItems('chapters', userId, data.chapters ?? []).catch(console.error)
      upsertItems('lore_entries', userId, data.loreEntries ?? []).catch(console.error)
      upsertItems('idea_entries', userId, data.ideaEntries ?? []).catch(console.error)
      upsertItems('maps_data', userId, data.maps ?? []).catch(console.error)
      upsertItems('whiteboards_data', userId, data.whiteboards ?? []).catch(console.error)
      upsertItems('story_schedule', userId, data.storySchedule ?? []).catch(console.error)
      upsertItems('rpg_characters', userId, data.rpgCharacters ?? []).catch(console.error)
      upsertItems('comic_pages', userId, data.comicPages ?? []).catch(console.error)
      upsertItems('comic_panels', userId, data.comicPanels ?? []).catch(console.error)
      upsertItems('eras', userId, data.eras ?? []).catch(console.error)
      saveUserSettings(userId, { activeNovelId: data.activeNovelId ?? null, currentYear: data.currentYear ?? 0, activeMapByNovel: data.activeMapByNovel ?? {} }).catch(console.error)
      upsertItems('scenes', userId, data.scenes ?? []).catch(console.error)
    }, 700)
  }, [importData, userId, canSyncCloud])

  // Clear all local state on sign-out
  const clearData = useCallback(() => {
    importing.current = true
    remoteReady.current = false
    clearProjectLocalStorage((scenesRef.current || []).map(s => s?.id))
    clearProjectRefs({
      novelsRef,
      charactersRef,
      factionsRef,
      locationsRef,
      timelineRef,
      worldHistoryRef,
      actsRef,
      chaptersRef,
      scenesRef,
      loreEntriesRef,
      ideaEntriesRef,
      mapsRef,
      whiteboardsRef,
      storyScheduleRef,
      rpgCharactersRef,
      comicPagesRef,
      comicPanelsRef,
      erasRef,
      activeNovelIdRef,
      activeMapByNovelRef,
      currentYearRef,
    })
    setNovels([]); setCharacters([]); setFactions([]); setLocations([])
    setTimeline([]); setWorldHistory([]); setActs([]); setChapters([])
    setScenes([]); setLoreEntries([]); setIdeaEntries([]); setMaps([]); setActiveMapByNovel({}); setWhiteboards([]); setSeries([]); setStorySchedule([]); setRpgCharacters([]); setComicPages([]); setComicPanels([]); setCurrentYear(0); setActiveNovelId(null)
    setEras([])
    setRecordConflicts([])
    lastSyncedByTableRef.current = {}
    setTimeout(() => {
      importing.current = false
      remoteReady.current = true
    }, 500)
  }, [])

  const activeNovel = novels.find(n => n.id === activeNovelId) ?? null
  const projectStatsData = {
    characters,
    factions,
    locations,
    timeline,
    worldHistory,
    acts,
    chapters,
    scenes,
    loreEntries,
    ideaEntries,
    maps,
    activeMapByNovel,
    whiteboards,
  }
  // Series sync: directional — data flows from earlier books to later ones.
  // Each series stores projectOrder: [novelId, ...] for explicit ordering.
  // A project with includeLaterWorks:true also pulls data from books after it.

  const getSeriesProjectOrder = (ser) => {
    if (!ser) return []
    const seriesProjectIds = new Set(novels.filter(n => n.seriesId === ser.id).map(n => n.id))
    const ordered = (ser.projectOrder ?? []).filter(id => seriesProjectIds.has(id))
    const unordered = [...seriesProjectIds].filter(id => !ordered.includes(id))
    return [...ordered, ...unordered]
  }

  const getSeriesVisibleIds = (ser, projectId, projectIncludeLater) => {
    if (!ser) return [projectId]
    const order = getSeriesProjectOrder(ser)
    const idx = order.indexOf(projectId)
    if (idx === -1) {
      // Not in order list yet — treat as earliest, only see self unless includeLater
      return projectIncludeLater ? order.filter(id => novels.some(n => n.id === id && n.seriesId === ser.id)) : [projectId]
    }
    const earlier = order.slice(0, idx + 1).filter(id => novels.some(n => n.id === id && n.seriesId === ser.id))
    if (projectIncludeLater) {
      const later = order.slice(idx + 1).filter(id => novels.some(n => n.id === id && n.seriesId === ser.id))
      return [...earlier, ...later]
    }
    return earlier
  }

  const resolveSeriesScope = (arr, category, projectId = activeNovelId) => {
    const project = novels.find(n => n.id === projectId) ?? null
    const projectSeries = project?.seriesId ? series.find(s => s.id === project.seriesId) : null
    const projectSyncCategories = projectSeries?.syncCategories ?? []
    if (!projectSyncCategories.includes(category)) {
      return (arr || []).filter(item => item.novelId === projectId && !item.syncDeleted)
    }

    const visibleIds = getSeriesVisibleIds(projectSeries, projectId, project?.includeLaterWorks ?? false)
    const order = getSeriesProjectOrder(projectSeries)
    const rank = new Map(order.map((id, index) => [id, index]))
    const visibleSet = new Set(visibleIds)
    const resolved = new Map()

    ;(arr || []).forEach(item => {
      if (!visibleSet.has(item.novelId)) return
      if ((item.syncHiddenInIds || []).includes(projectId)) return
      const key = syncIdentity(item, category)
      const current = resolved.get(key)
      const currentRank = current ? rank.get(current.novelId) ?? -1 : -1
      const itemRank = rank.get(item.novelId) ?? -1
      if (!current || itemRank >= currentRank) resolved.set(key, item)
    })

    return [...resolved.values()].filter(item => !item.syncDeleted)
  }

  const seriesScope = (arr, category) => resolveSeriesScope(arr, category, activeNovelId)

  // `characters`/`locations` below feed straight into Manuscript.jsx's `entityMap`/
  // `characterNames`/`locationNames` useMemo (the @mention/highlight lookups every
  // SceneEditor's memo comparator was built around — see the "Typing lag" ROADMAP row).
  // seriesScope()/resolveSeriesScope() always builds a brand-new filtered-or-merged array,
  // and the `api` object further down used to call it inline on every render of whatever
  // component calls useStore() — not only when `characters`/`locations` themselves
  // changed. Any unrelated state update elsewhere in this hook (e.g. the
  // localStorageWarning/localDataCorrupted poll a few lines up, which fires every 4s
  // regardless of typing) re-runs the whole hook and was handing Manuscript.jsx a
  // brand-new reference for both, every time, defeating entityMap/characterNames/
  // locationNames' own memoization for every scene in the document simultaneously.
  // Memoizing here keeps the reference stable across renders unless characters/locations/
  // novels/series/activeNovelId actually changed.
  const scopedCharacters = useMemo(
    () => seriesScope(characters, 'characters'),
    [characters, novels, series, activeNovelId] // eslint-disable-line react-hooks/exhaustive-deps -- seriesScope is a fresh closure every render; its real inputs are listed here
  )
  const scopedLocations = useMemo(
    () => seriesScope(locations, 'locations'),
    [locations, novels, series, activeNovelId] // eslint-disable-line react-hooks/exhaustive-deps -- seriesScope is a fresh closure every render; its real inputs are listed here
  )

  const getSyncChain = (arr, category, item) => {
    if (!item) return []
    const project = novels.find(n => n.id === item.novelId) ?? activeNovel
    const projectSeries = project?.seriesId ? series.find(s => s.id === project.seriesId) : null
    if (!projectSeries) return [item]
    const projectIds = new Set(getSeriesProjectOrder(projectSeries))
    const key = syncIdentity(item, category)
    return (arr || []).filter(candidate =>
      projectIds.has(candidate.novelId) && syncIdentity(candidate, category) === key
    )
  }

  const getForwardProjectIds = (fromProjectId, ser) => {
    const order = getSeriesProjectOrder(ser)
    const idx = order.indexOf(fromProjectId)
    return idx >= 0 ? new Set(order.slice(idx)) : new Set([fromProjectId])
  }

  const currentActiveProjectId = () => {
    if (!activeNovelId || activeNovelIdRef.current !== activeNovelId) return null
    return novelsRef.current.some(novel => novel.id === activeNovelId) ? activeNovelId : null
  }

  const withoutRecordIdentity = (data = {}) => {
    const {
      id: _id,
      novelId: _novelId,
      syncRootId: _syncRootId,
      syncSourceId: _syncSourceId,
      syncHiddenInIds: _syncHiddenInIds,
      syncDeleted: _syncDeleted,
      createdAt: _createdAt,
      ...safeData
    } = data
    return safeData
  }

  const saveSeriesSyncedItem = (ref, setter, category, data, id, buildNewItem, batch = null) => {
    const projectId = currentActiveProjectId()
    if (!projectId) return null
    const config = SYNC_CATEGORY_CONFIG[category]
    const items = batch ? batch.items : ref.current
    const safeData = withoutRecordIdentity(data)
    const commit = updater => {
      if (batch) batch.items = updater(batch.items)
      else commitLocal(ref, setter, config?.storageKey || '', updater)
    }
    if (!config) {
      commit(prev => id
        ? prev.map(item => item.id === id ? { ...item, ...safeData } : item)
        : [...prev, buildNewItem()])
      return id
    }

    if (!id) {
      const created = buildNewItem()
      const item = { ...created, ...safeData, id: created.id, novelId: projectId, syncRootId: created.syncRootId || created.id }
      commit(prev => [...prev, item])
      return item
    }

    const existing = items.find(item => item.id === id)
    const visible = resolveSeriesScope(items, category, projectId)
    if (!existing || !visible.some(item => item.id === id)) return null
    const project = novels.find(n => n.id === activeNovelId) ?? activeNovel
    const projectSeries = project?.seriesId ? series.find(s => s.id === project.seriesId) : null
    const isSynced = Boolean(projectSeries?.syncCategories?.includes(category))

    if (!isSynced) {
      const updated = { ...existing, ...safeData }
      commit(prev => prev.map(item => item.id === id ? updated : item))
      return updated
    }

    const rootId = existing.syncRootId || existing.syncSourceId || existing.id
    const chain = getSyncChain(items, category, existing)
    const forwardIds = getForwardProjectIds(activeNovelId, projectSeries)
    let target = chain.find(item => item.novelId === activeNovelId)
    const forkId = target?.id || uid()
    const fork = target
      ? { ...target, ...safeData, syncRootId: rootId, syncDeleted: false }
      : { ...existing, ...safeData, id: forkId, novelId: projectId, syncRootId: rootId, syncSourceId: existing.id, syncHiddenInIds: [], syncDeleted: false }

    commit(prev => {
      const next = target ? prev : [...prev, fork]
      return next.map(item => {
        if (item.id === fork.id) return fork
        if (!forwardIds.has(item.novelId)) return item
        if (syncIdentity(item, category) !== syncIdentity(existing, category)) return item
        return { ...item, ...safeData, syncRootId: item.syncRootId || rootId, syncDeleted: false }
      })
    })

    return fork
  }

  const deleteSeriesSyncedItem = (ref, setter, category, id, options = {}) => {
    const projectId = currentActiveProjectId()
    if (!projectId) return []
    const config = SYNC_CATEGORY_CONFIG[category]
    const existing = ref.current.find(item => item.id === id)
    if (!existing || !config || !resolveSeriesScope(ref.current, category, projectId).some(item => item.id === id)) return []
    const project = novels.find(n => n.id === activeNovelId) ?? activeNovel
    const projectSeries = project?.seriesId ? series.find(s => s.id === project.seriesId) : null
    const isSynced = Boolean(projectSeries?.syncCategories?.includes(category))
    const chain = isSynced ? getSyncChain(ref.current, category, existing) : [existing]
    const activeItem = chain.find(item => item.novelId === activeNovelId)
    const idsToClean = []

    if (!isSynced || options.scope === 'all') {
      const ids = new Set(chain.map(item => item.id))
      idsToClean.push(...ids)
      commitLocal(ref, setter, config.storageKey, prev => prev.filter(item => !ids.has(item.id)))
      return idsToClean
    }

    commitLocal(ref, setter, config.storageKey, prev => {
      let next = activeItem
        ? prev.filter(item => item.id !== activeItem.id)
        : prev
      idsToClean.push(activeItem?.id || existing.id)

      const source = chain
        .filter(item => item.novelId !== activeNovelId)
        .sort((a, b) => (getSeriesProjectOrder(projectSeries).indexOf(a.novelId)) - (getSeriesProjectOrder(projectSeries).indexOf(b.novelId)))[0]

      if (source) {
        next = next.map(item => {
          if (item.id !== source.id) return item
          const hidden = new Set(item.syncHiddenInIds || [])
          hidden.add(activeNovelId)
          return { ...item, syncRootId: item.syncRootId || existing.syncRootId || existing.id, syncHiddenInIds: [...hidden] }
        })
      }
      return next
    })

    return idsToClean
  }

  const getProjectContextData = (projectId = activeNovelId) => {
    const project = novels.find(n => n.id === projectId) ?? null
    return {
      activeNovelId: projectId,
      activeNovel: project,
      characters: resolveSeriesScope(characters, 'characters', projectId),
      factions: resolveSeriesScope(factions, 'factions', projectId),
      locations: resolveSeriesScope(locations, 'locations', projectId),
      timeline: resolveSeriesScope(timeline, 'timeline', projectId),
      worldHistory: resolveSeriesScope(worldHistory, 'worldhistory', projectId),
      loreEntries: resolveSeriesScope(loreEntries, 'lore', projectId),
      ideaEntries: resolveSeriesScope(ideaEntries, 'ideas', projectId),
      acts: acts.filter(a => a.novelId === projectId).sort((a, b) => a.order - b.order),
      chapters: chapters.filter(c => c.novelId === projectId).sort((a, b) => a.order - b.order),
      scenes: scenes.filter(s => s.novelId === projectId).sort((a, b) => a.order - b.order),
      maps: maps.filter(m => m.novelId === projectId),
      storySchedule: storySchedule.filter(e => e.novelId === projectId),
    }
  }

  const asStatsOwned = (items, projectId) =>
    items.map(item => item.novelId === projectId ? item : { ...item, sourceNovelId: item.novelId, novelId: projectId })

  const getProjectStatsData = (projectId) => ({
    ...projectStatsData,
    characters: asStatsOwned(resolveSeriesScope(characters, 'characters', projectId), projectId),
    factions: asStatsOwned(resolveSeriesScope(factions, 'factions', projectId), projectId),
    locations: asStatsOwned(resolveSeriesScope(locations, 'locations', projectId), projectId),
    timeline: asStatsOwned(resolveSeriesScope(timeline, 'timeline', projectId), projectId),
    worldHistory: asStatsOwned(resolveSeriesScope(worldHistory, 'worldhistory', projectId), projectId),
    loreEntries: asStatsOwned(resolveSeriesScope(loreEntries, 'lore', projectId), projectId),
    ideaEntries: asStatsOwned(resolveSeriesScope(ideaEntries, 'ideas', projectId), projectId),
  })

  const allProjectStats = (novels || []).map(project => buildProjectStats(project, getProjectStatsData(project.id)))
  const activeProjectStats = activeNovel ? buildProjectStats(activeNovel, getProjectStatsData(activeNovel.id)) : null

  // Manuscripts (acts/chapters/scenes) are NEVER synced — always project-only
  const novelActs = acts.filter(a => a.novelId === activeNovelId).sort((a, b) => a.order - b.order)
  const novelChapters = chapters.filter(c => c.novelId === activeNovelId).sort((a, b) => a.order - b.order)
  // Conflict copies (see mergeSceneUpdateWithPersistedCopy) are excluded from the
  // normal scene list — they'd otherwise appear as phantom duplicate scenes in the
  // sidebar, word counts, and exports. They're surfaced separately via sceneConflicts
  // so the app can warn about them and offer a restore/discard path instead.
  const novelScenes = scenes.filter(s => s.novelId === activeNovelId && !s.conflictOf).sort((a, b) => a.order - b.order)
  const novelSceneConflicts = scenes.filter(s => s.novelId === activeNovelId && s.conflictOf).sort((a, b) => (b.conflictCreatedAt || 0) - (a.conflictCreatedAt || 0))
  // Memoized for the same reason scopedCharacters/scopedLocations are above:
  // Manuscript.jsx's `entityMap` useMemo (the one this file's "Typing lag" ROADMAP
  // row is about) depends on `loreEntries`/`worldHistory`/`timeline` in addition to
  // `characters`/`locations` — an unmemoized seriesScope() call here would still
  // leave entityMap churning on every render even after characters/locations were
  // fixed, just via a different set of props feeding the exact same memo.
  const novelTimeline = useMemo(
    () => seriesScope(timeline, 'timeline'),
    [timeline, novels, series, activeNovelId] // eslint-disable-line react-hooks/exhaustive-deps -- seriesScope is a fresh closure every render; its real inputs are listed here
  )
  const novelWorldHistory = useMemo(
    () => seriesScope(worldHistory, 'worldhistory'),
    [worldHistory, novels, series, activeNovelId] // eslint-disable-line react-hooks/exhaustive-deps -- seriesScope is a fresh closure every render; its real inputs are listed here
  )
  const novelLoreEntries = useMemo(
    () => seriesScope(loreEntries, 'lore'),
    [loreEntries, novels, series, activeNovelId] // eslint-disable-line react-hooks/exhaustive-deps -- seriesScope is a fresh closure every render; its real inputs are listed here
  )
  // factions/ideaEntries don't currently feed any memo comparator the way the three
  // above (and characters/locations) do, so they're deliberately left unmemoized here
  // — same scope decision as novelFactions/novelIdeaEntries noted in ROADMAP.md.
  const novelFactions = seriesScope(factions, 'factions')
  const novelIdeaEntries = seriesScope(ideaEntries, 'ideas')
  const novelStorySchedule = storySchedule.filter(e => e.novelId === activeNovelId)
  const novelMaps = maps.filter(m => m.novelId === activeNovelId)
  const activeMapId = activeMapByNovel[activeNovelId] ?? novelMaps[0]?.id ?? null
  const activeWhiteboard = whiteboards.find(w => w.novelId === activeNovelId) ?? null
  const whiteboard = activeWhiteboard?.whiteboard || { notes: [], groups: [] }
  const mapProject = activeNovel ? {
    id: activeNovel.id,
    name: activeNovel.title || activeNovel.name || 'Untitled',
    type: activeNovel.type || 'novel',
    locations: locations.filter(l => l.novelId === activeNovelId),
    maps: novelMaps,
    activeMapId,
    whiteboard,
    mapData: null,
    mapPins: [],
    mapType: null,
  } : null

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const updateMapProject = useCallback((updater) => {
    if (!activeNovelId || activeNovelIdRef.current !== activeNovelId || !novelsRef.current.some(novel => novel.id === activeNovelId)) return
    const currentMaps = maps.filter(m => m.novelId === activeNovelId)
    const currentActiveMapId = activeMapByNovel[activeNovelId] ?? currentMaps[0]?.id ?? null
    const currentWhiteboard = whiteboards.find(w => w.novelId === activeNovelId)?.whiteboard || { notes: [], groups: [] }
    const currentProject = {
      id: activeNovelId,
      type: activeNovel?.type || 'novel',
      locations: locations.filter(l => l.novelId === activeNovelId),
      maps: currentMaps,
      activeMapId: currentActiveMapId,
      whiteboard: currentWhiteboard,
      mapData: null,
      mapPins: [],
      mapType: null,
    }
    const patch = updater(currentProject) || {}

    if (Object.prototype.hasOwnProperty.call(patch, 'maps')) {
      setMaps(prev => [
        ...prev.filter(m => m.novelId !== activeNovelId),
        ...(patch.maps || []).map(m => ({ ...m, novelId: m.novelId ?? activeNovelId })),
      ])
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'activeMapId')) {
      setActiveMapByNovel(prev => ({ ...prev, [activeNovelId]: patch.activeMapId ?? null }))
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'whiteboard')) {
      setWhiteboards(prev => {
        const existing = prev.find(w => w.novelId === activeNovelId)
        const currentWhiteboard = existing?.whiteboard || { notes: [], groups: [] }
        const nextWhiteboard = typeof patch.whiteboard === 'function'
          ? patch.whiteboard(currentWhiteboard)
          : patch.whiteboard
        const entry = { id: existing?.id || uid(), novelId: activeNovelId, whiteboard: nextWhiteboard || { notes: [], groups: [] } }
        return [...prev.filter(w => w.novelId !== activeNovelId), entry]
      })
    }
  }, [activeNovelId, activeNovel?.type, activeMapByNovel, locations, maps, whiteboards]) // eslint-disable-line react-hooks/preserve-manual-memoization

  const updateWhiteboard = useCallback((updater) => {
    if (!activeNovelId || activeNovelIdRef.current !== activeNovelId || !novelsRef.current.some(novel => novel.id === activeNovelId)) return
    commitLocal(whiteboardsRef, setWhiteboards, 'nf_whiteboards', prev => {
      const existing = prev.find(w => w.novelId === activeNovelId)
      const currentWhiteboard = existing?.whiteboard || { notes: [], groups: [] }
      const nextWhiteboard = typeof updater === 'function'
        ? updater(currentWhiteboard)
        : updater
      const entry = {
        id: existing?.id || uid(),
        novelId: activeNovelId,
        whiteboard: nextWhiteboard || { notes: [], groups: [] },
      }
      return [...prev.filter(w => w.novelId !== activeNovelId), entry]
    })
  }, [activeNovelId, commitLocal])

  const activeOutlineProjectId = useCallback(() => {
    if (!activeNovelId || activeNovelIdRef.current !== activeNovelId) return null
    return novelsRef.current.some(novel => novel.id === activeNovelId) ? activeNovelId : null
  }, [activeNovelId])
  const nextOutlineOrder = items => items.reduce((max, item) => (
    Number.isFinite(Number(item?.order)) ? Math.max(max, Number(item.order)) : max
  ), -1) + 1
  const outlineExpectedMatches = (item, type, expected) => {
    const normalized = normalizeOutlineItem(item, type)
    return !Object.entries(expected || {}).some(([field, value]) => (
      JSON.stringify(Object.hasOwn(normalized, field) ? normalized[field] : item?.[field]) !== JSON.stringify(value)
    ))
  }

  const addAct = (title) => {
    const projectId = activeOutlineProjectId()
    if (!projectId || storageExceededCheck()) return null
    const siblings = actsRef.current.filter(act => act.novelId === projectId)
    const newAct = { id: uid(), novelId: projectId, title: outlineText(title), synopsis: '', order: nextOutlineOrder(siblings) }
    commitLocal(actsRef, setActs, 'nf_acts', prev => [...prev, newAct])
    return newAct
  }

  const addChapter = (actId, title, data = {}) => {
    const projectId = activeOutlineProjectId()
    const parent = actsRef.current.find(act => act.id === actId && act.novelId === projectId)
    if (!projectId || !parent || storageExceededCheck()) return null
    const siblings = chaptersRef.current.filter(chapter => chapter.novelId === projectId && chapter.actId === actId)
    const { id: _id, novelId: _novelId, actId: _actId, order: _order, ...safeData } = outlinePatch(data, 'chapter')
    const newChap = {
      ...safeData,
      id: uid(), novelId: projectId, actId, title: outlineText(title),
      synopsis: Object.hasOwn(safeData, 'synopsis') ? safeData.synopsis : '',
      order: nextOutlineOrder(siblings),
    }
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => [...prev, newChap])
    return newChap
  }

  const addScene = (chapterId, title) => {
    const projectId = activeOutlineProjectId()
    const parent = chaptersRef.current.find(chapter => chapter.id === chapterId && chapter.novelId === projectId)
    if (!projectId || !parent || storageExceededCheck()) return null
    const siblings = scenesRef.current.filter(scene => scene.novelId === projectId && scene.chapterId === chapterId)
    const newScene = {
      id: uid(),
      novelId: projectId,
      chapterId,
      title: outlineText(title),
      synopsis: '',
      content: '',
      order: nextOutlineOrder(siblings),
      lastModified: Date.now() // eslint-disable-line react-hooks/purity
    }
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => [...prev, newScene])
    if (projectImportDepthRef.current > 0) projectImportSceneIdsRef.current.add(newScene.id)
    else if (canSyncCloud) saveSceneDoc(userId, newScene).catch(console.error)
    return newScene
  }

  const reorderAct = (id, direction) => {
    const projectId = activeOutlineProjectId()
    if (!projectId || !['up', 'down'].includes(direction)) return false
    let changed = false
    commitLocal(actsRef, setActs, 'nf_acts', prev => {
      const scoped = sortOutlineItems(prev.filter(act => act.novelId === projectId))
      const idx = scoped.findIndex(a => a.id === id)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= scoped.length) return prev
      changed = true
      const reordered = [...scoped]
      ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
      const byId = new Map(reordered.map((act, index) => [act.id, { ...act, order: index }]))
      return prev.map(a => {
        return a.novelId === projectId && byId.has(a.id) ? byId.get(a.id) : a
      })
    })
    return changed
  }

  const moveAct = useCallback((actId, toIndex) => {
    const projectId = activeOutlineProjectId()
    if (!projectId) return null
    let moved = null
    commitLocal(actsRef, setActs, 'nf_acts', prev => {
      const scoped = sortOutlineItems(prev.filter(act => act.novelId === projectId))
      const fromIndex = scoped.findIndex(a => a.id === actId)
      if (fromIndex === -1) return prev
      const reordered = [...scoped]
      const [item] = reordered.splice(fromIndex, 1)
      const requested = Number.isFinite(Number(toIndex)) ? Number(toIndex) : fromIndex
      const clampedTo = Math.max(0, Math.min(requested, reordered.length))
      reordered.splice(clampedTo, 0, item)
      const byId = new Map(reordered.map((act, index) => [act.id, { ...act, order: index }]))
      moved = byId.get(actId)
      return prev.map(act => act.novelId === projectId && byId.has(act.id) ? byId.get(act.id) : act)
    })
    return moved
  }, [activeOutlineProjectId, commitLocal])

  const reorderChapter = (id, direction) => {
    const projectId = activeOutlineProjectId()
    if (!projectId || !['up', 'down'].includes(direction)) return false
    let changed = false
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => {
      const chapter = prev.find(c => c.id === id && c.novelId === projectId)
      if (!chapter) return prev
      const scoped = sortOutlineItems(prev.filter(c => c.novelId === projectId && c.actId === chapter.actId))
      const idx = scoped.findIndex(c => c.id === id)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= scoped.length) return prev
      changed = true
      const reordered = [...scoped]
      ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
      const byId = new Map(reordered.map((item, index) => [item.id, { ...item, order: index }]))
      return prev.map(item => item.novelId === projectId && byId.has(item.id) ? byId.get(item.id) : item)
    })
    return changed
  }

  const moveChapter = useCallback((chapterId, toActId, toIndex) => {
    const projectId = activeOutlineProjectId()
    if (!projectId || !actsRef.current.some(act => act.id === toActId && act.novelId === projectId)) return null
    let moved = null
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => {
      const chapter = prev.find(c => c.id === chapterId && c.novelId === projectId)
      if (!chapter) return prev
      const updatedChapter = { ...chapter, actId: toActId }
      const destChaps = sortOutlineItems(prev.filter(c => c.novelId === projectId && c.actId === toActId && c.id !== chapterId))
      const requested = Number.isFinite(Number(toIndex)) ? Number(toIndex) : destChaps.length
      const clampedTo = Math.max(0, Math.min(requested, destChaps.length))
      const reinserted = [...destChaps.slice(0, clampedTo), updatedChapter, ...destChaps.slice(clampedTo)]
        .map((c, i) => ({ ...c, order: i }))
      moved = reinserted.find(item => item.id === chapterId)
      if (chapter.actId !== toActId) {
        const srcChaps = sortOutlineItems(prev.filter(c => c.novelId === projectId && c.actId === chapter.actId && c.id !== chapterId))
          .map((c, i) => ({ ...c, order: i }))
        const changed = new Map([...srcChaps, ...reinserted].map(item => [item.id, item]))
        return prev.map(item => item.novelId === projectId && changed.has(item.id) ? changed.get(item.id) : item)
      }
      const changed = new Map(reinserted.map(item => [item.id, item]))
      return prev.map(item => item.novelId === projectId && changed.has(item.id) ? changed.get(item.id) : item)
    })
    return moved
  }, [activeOutlineProjectId, commitLocal])

  const reorderScene = (id, direction) => {
    const projectId = activeOutlineProjectId()
    if (!projectId || !['up', 'down'].includes(direction)) return false
    let changedIds = []
    const next = commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      const scene = prev.find(s => s.id === id && s.novelId === projectId)
      if (!scene) return prev
      const scoped = sortOutlineItems(prev.filter(s => s.novelId === projectId && s.chapterId === scene.chapterId))
      const idx = scoped.findIndex(s => s.id === id)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= scoped.length) return prev
      changedIds = [id, scoped[swapIdx].id]
      const reordered = [...scoped]
      ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
      const byId = new Map(reordered.map((item, index) => [item.id, { ...item, order: index }]))
      return prev.map(item => item.novelId === projectId && byId.has(item.id) ? byId.get(item.id) : item)
    })
    if (canSyncCloud) changedIds.forEach(sceneId => {
      const scene = next.find(s => s.id === sceneId)
      if (scene) debouncedSaveScene(sceneId, userId, scene)
    })
    return changedIds.length > 0
  }

  const moveScene = useCallback((sceneId, toChapterId, toIndex) => {
    const projectId = activeOutlineProjectId()
    if (!projectId || !chaptersRef.current.some(chapter => chapter.id === toChapterId && chapter.novelId === projectId)) return null
    let changedIds = []
    let moved = null
    const next = commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      const scene = prev.find(s => s.id === sceneId && s.novelId === projectId)
      if (!scene) return prev
      const updatedScene = { ...scene, chapterId: toChapterId }
      const destScenes = sortOutlineItems(prev.filter(s => s.novelId === projectId && s.chapterId === toChapterId && s.id !== sceneId))
      const requested = Number.isFinite(Number(toIndex)) ? Number(toIndex) : destScenes.length
      const clampedTo = Math.max(0, Math.min(requested, destScenes.length))
      const reinserted = [...destScenes.slice(0, clampedTo), updatedScene, ...destScenes.slice(clampedTo)]
        .map((s, i) => ({ ...s, order: i }))
      moved = reinserted.find(item => item.id === sceneId)
      changedIds = reinserted.map(s => s.id)
      if (scene.chapterId !== toChapterId) {
        const srcScenes = sortOutlineItems(prev.filter(s => s.novelId === projectId && s.chapterId === scene.chapterId && s.id !== sceneId))
          .map((s, i) => ({ ...s, order: i }))
        changedIds = changedIds.concat(srcScenes.map(s => s.id))
        const changed = new Map([...srcScenes, ...reinserted].map(item => [item.id, item]))
        return prev.map(item => item.novelId === projectId && changed.has(item.id) ? changed.get(item.id) : item)
      }
      const changed = new Map(reinserted.map(item => [item.id, item]))
      return prev.map(item => item.novelId === projectId && changed.has(item.id) ? changed.get(item.id) : item)
    })
    if (canSyncCloud) changedIds.forEach(id => {
      const scene = next.find(s => s.id === id)
      if (scene) debouncedSaveScene(id, userId, scene)
    })
    return moved
  }, [activeOutlineProjectId, commitLocal, canSyncCloud, userId, debouncedSaveScene])

  const updateSceneContent = useCallback((sceneId, content) => {
    const projectId = activeOutlineProjectId()
    const previous = scenesRef.current.find(scene => scene.id === sceneId && scene.novelId === projectId)
    if (!projectId || !previous) return null
    const nextContent = outlineText(content)
    // Block growing a scene once storage is full — same gate as the add* actions
    // below (storageExceededCheck), but content edits aren't "add" calls so they
    // never hit that check. Only the growing direction is blocked: trimming or
    // rewriting existing text (deletes, replaces) must still go through, or a
    // full-quota account couldn't even edit its way back under the limit.
    const isGrowing = nextContent.length > outlineText(previous.content).length
    if (isGrowing && storageQuotaBytes && storageUsedBytes >= storageQuotaBytes) {
      notifyReadOnly('storage-exceeded', { usedBytes: storageUsedBytes, quotaBytes: storageQuotaBytes })
      return
    }
    const nextScenes = commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      return mergeSceneUpdateWithPersistedCopy(prev, sceneId, s => {
        const updated = withSceneContentHistory(s, nextContent)
        if (canSyncCloud) debouncedSaveScene(sceneId, userId, updated)
        return updated
      })
    })
    if (canSyncCloud) {
      nextScenes
        .filter(scene => scene.conflictOf === sceneId)
        .forEach(scene => saveSceneDoc(userId, scene).catch(console.error))
    }
    return nextScenes.find(scene => scene.id === sceneId) || null
  }, [activeOutlineProjectId, userId, canSyncCloud, debouncedSaveScene, commitLocal, storageQuotaBytes, storageUsedBytes])

  const deleteAct = (id) => {
    const projectId = activeOutlineProjectId()
    if (!projectId || !actsRef.current.some(act => act.id === id && act.novelId === projectId)) return false
    const chapterIds = chaptersRef.current.filter(c => c.novelId === projectId && c.actId === id).map(c => c.id)
    const chapterSet = new Set(chapterIds)
    const sceneIds = scenesRef.current.filter(s => s.novelId === projectId && chapterSet.has(s.chapterId)).map(s => s.id)
    const sceneSet = new Set(sceneIds)
    sceneIds.forEach(sceneId => debouncedSaveScene.cancel(sceneId))
    if (canSyncCloud) {
      deleteItem('acts', userId, id).catch(console.error)
      chapterIds.forEach(cId => deleteItem('chapters', userId, cId).catch(console.error))
    }
    commitLocal(actsRef, setActs, 'nf_acts', prev => prev.filter(a => !(a.id === id && a.novelId === projectId)))
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => prev.filter(c => !(c.novelId === projectId && chapterSet.has(c.id))))
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      return prev.filter(s => {
        const keep = !(s.novelId === projectId && sceneSet.has(s.id))
        if (!keep && canSyncCloud) deleteSceneDoc(userId, s.id).catch(console.error)
        return keep
      })
    })
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character => character.journey ? {
      ...character,
      journey: clearJourneyLinks(character.journey, { chapterIds, sceneIds }),
    } : character))
    if (sceneSet.has(selectedSceneId)) setSelectedSceneId(null)
    if (sceneSet.has(writingSceneId)) setWritingSceneId(null)
    return true
  }
  const deleteChapter = (id) => {
    const projectId = activeOutlineProjectId()
    if (!projectId || !chaptersRef.current.some(chapter => chapter.id === id && chapter.novelId === projectId)) return false
    const sceneIds = scenesRef.current.filter(s => s.novelId === projectId && s.chapterId === id).map(s => s.id)
    const sceneSet = new Set(sceneIds)
    sceneIds.forEach(sceneId => debouncedSaveScene.cancel(sceneId))
    if (canSyncCloud) deleteItem('chapters', userId, id).catch(console.error)
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => prev.filter(c => !(c.id === id && c.novelId === projectId)))
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      return prev.filter(s => {
        const keep = !(s.novelId === projectId && sceneSet.has(s.id))
        if (!keep && canSyncCloud) deleteSceneDoc(userId, s.id).catch(console.error)
        return keep
      })
    })
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character => character.journey ? {
      ...character,
      journey: clearJourneyLinks(character.journey, { chapterIds: [id], sceneIds }),
    } : character))
    if (sceneSet.has(selectedSceneId)) setSelectedSceneId(null)
    if (sceneSet.has(writingSceneId)) setWritingSceneId(null)
    return true
  }
  const deleteScene = (id) => {
    const projectId = activeOutlineProjectId()
    if (!projectId || !scenesRef.current.some(scene => scene.id === id && scene.novelId === projectId)) return false
    debouncedSaveScene.cancel(id)
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => prev.filter(s => !(s.id === id && s.novelId === projectId)))
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character => character.journey ? {
      ...character,
      journey: clearJourneyLinks(character.journey, { sceneIds: [id] }),
    } : character))
    if (canSyncCloud) deleteSceneDoc(userId, id).catch(console.error)
    if (selectedSceneId === id) setSelectedSceneId(null)
    if (writingSceneId === id) setWritingSceneId(null)
    return true
  }
  const updateAct = (id, data, { expected = {} } = {}) => {
    const projectId = activeOutlineProjectId()
    const current = actsRef.current.find(act => act.id === id && act.novelId === projectId)
    if (!projectId || !current || !outlineExpectedMatches(current, 'act', expected)) return null
    const { id: _id, novelId: _novelId, order: _order, ...patch } = outlinePatch(data, 'act')
    const updated = { ...current, ...patch }
    commitLocal(actsRef, setActs, 'nf_acts', prev => prev.map(act => (
      act.id === id && act.novelId === projectId ? updated : act
    )))
    return updated
  }
  const updateChapter = (id, data, { expected = {} } = {}) => {
    const projectId = activeOutlineProjectId()
    const current = chaptersRef.current.find(chapter => chapter.id === id && chapter.novelId === projectId)
    if (!projectId || !current || !outlineExpectedMatches(current, 'chapter', expected)) return null
    const { id: _id, novelId: _novelId, actId: _actId, order: _order, ...patch } = outlinePatch(data, 'chapter')
    const updated = { ...current, ...patch }
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => prev.map(chapter => (
      chapter.id === id && chapter.novelId === projectId ? updated : chapter
    )))
    return updated
  }
  const updateScene = (id, data, { expected = {} } = {}) => {
    const projectId = activeOutlineProjectId()
    const current = scenesRef.current.find(scene => scene.id === id && scene.novelId === projectId)
    if (!projectId || !current || !outlineExpectedMatches(current, 'scene', expected)) return null
    let saved = null
    const nextScenes = commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      return mergeSceneUpdateWithPersistedCopy(prev, id, s => {
        // A field's value in `data` may itself be a function (prevValue => nextValue)
        // instead of a precomputed value. Note editors use this so rapid field
        // updates resolve against the latest known scene instead of stale render
        // closures overwriting sibling edits. Resolve those here, against `s` (the
        // freshest source scene mergeSceneUpdateWithPersistedCopy already picked),
        // before merging; otherwise the function itself gets written into the scene
        // record and corrupts that field for later readers.
        const resolvedData = outlinePatch(Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, typeof value === 'function' ? value(s[key]) : value])
        ), 'scene')
        delete resolvedData.id
        delete resolvedData.novelId
        delete resolvedData.chapterId
        delete resolvedData.order
        const hasContent = Object.prototype.hasOwnProperty.call(resolvedData, 'content')
        if (hasContent) resolvedData.content = outlineText(resolvedData.content)
        const updated = hasContent && resolvedData.content !== s.content
          ? withSceneContentHistory({ ...s, ...resolvedData }, resolvedData.content)
          : { ...s, ...resolvedData }
        if (canSyncCloud && projectImportDepthRef.current === 0) debouncedSaveScene(id, userId, updated)
        saved = updated
        return updated
      })
    })
    if (canSyncCloud && projectImportDepthRef.current === 0 && Object.prototype.hasOwnProperty.call(data, 'content')) {
      nextScenes
        .filter(scene => scene.conflictOf === id)
        .forEach(scene => saveSceneDoc(userId, scene).catch(console.error))
    }
    return saved || nextScenes.find(scene => scene.id === id && scene.novelId === projectId) || null
  }

  const replaceProjectManuscript = useCallback((projectId, nextStructure) => {
    if (!projectId) return null
    const currentActIds = actsRef.current
      .filter(act => act.novelId === projectId)
      .map(act => act.id)
    const currentChapterIds = chaptersRef.current
      .filter(chapter => chapter.novelId === projectId)
      .map(chapter => chapter.id)
    const currentSceneIds = scenesRef.current
      .filter(scene => scene.novelId === projectId)
      .map(scene => scene.id)
    currentSceneIds.forEach(sceneId => debouncedSaveScene.cancel(sceneId))

    const nextActs = (nextStructure.acts || []).map(act => ({ ...act, novelId: projectId }))
    const nextChapters = (nextStructure.chapters || []).map(chapter => ({ ...chapter, novelId: projectId }))
    const nextScenes = (nextStructure.scenes || []).map(scene => ({ ...scene, novelId: projectId }))

    commitLocal(actsRef, setActs, 'nf_acts', prev => [
      ...prev.filter(act => act.novelId !== projectId),
      ...nextActs,
    ])
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => [
      ...prev.filter(chapter => chapter.novelId !== projectId),
      ...nextChapters,
    ])
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => [
      ...prev.filter(scene => scene.novelId !== projectId),
      ...nextScenes,
    ])
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character => {
      if (character.novelId !== projectId || !character.journey) return character
      return { ...character, journey: clearJourneyLinks(character.journey, { sceneIds: currentSceneIds }) }
    }))

    if (canSyncCloud) {
      currentActIds.forEach(actId => deleteItem('acts', userId, actId).catch(console.error))
      currentChapterIds.forEach(chapterId => deleteItem('chapters', userId, chapterId).catch(console.error))
      currentSceneIds.forEach(sceneId => deleteSceneDoc(userId, sceneId).catch(console.error))
      if (nextActs.length) trackSync(upsertItems('acts', userId, nextActs)).catch(console.error)
      if (nextChapters.length) trackSync(upsertItems('chapters', userId, nextChapters)).catch(console.error)
      if (nextScenes.length) trackSync(upsertItems('scenes', userId, nextScenes)).catch(console.error)
    }

    setWritingSceneId(null)
    setSelectedSceneId(null)
    return { acts: nextActs, chapters: nextChapters, scenes: nextScenes }
  }, [canSyncCloud, userId, commitLocal, debouncedSaveScene, trackSync])

  const retireManuscript = useCallback((title) => {
    const projectId = activeNovelIdRef.current
    const project = novelsRef.current.find(novel => novel.id === projectId)
    if (!project || isFreeLockedProject(projectId)) {
      if (projectId) notifyReadOnly('free-project')
      return null
    }
    const copy = buildManuscriptCopy({
      project,
      acts: actsRef.current.filter(act => act.novelId === projectId).sort((a, b) => a.order - b.order),
      chapters: chaptersRef.current.filter(chapter => chapter.novelId === projectId).sort((a, b) => a.order - b.order),
      scenes: scenesRef.current.filter(scene => scene.novelId === projectId && !scene.conflictOf).sort((a, b) => a.order - b.order),
      title,
    })
    const starter = buildStarterStructure(projectId, project.type)
    commitLocal(novelsRef, setNovels, 'nf_novels', prev => prev.map(novel => (
      novel.id === projectId
        ? {
            ...novel,
            manuscriptCopies: [copy, ...(Array.isArray(novel.manuscriptCopies) ? novel.manuscriptCopies : [])].slice(0, 30),
            lastRetiredManuscriptAt: copy.retiredAt,
          }
        : novel
    )))
    replaceProjectManuscript(projectId, starter)
    return copy
  }, [commitLocal, replaceProjectManuscript])

  const restoreManuscriptCopy = useCallback((copyId, options = {}) => {
    const projectId = activeNovelIdRef.current
    const project = novelsRef.current.find(novel => novel.id === projectId)
    if (!project || isFreeLockedProject(projectId)) {
      if (projectId) notifyReadOnly('free-project')
      return null
    }
    const copies = Array.isArray(project.manuscriptCopies) ? project.manuscriptCopies : []
    const copy = copies.find(item => item.id === copyId)
    if (!copy) return null

    let currentCopy = null
    if (options.retireCurrentFirst) {
      currentCopy = buildManuscriptCopy({
        project,
        acts: actsRef.current.filter(act => act.novelId === projectId).sort((a, b) => a.order - b.order),
        chapters: chaptersRef.current.filter(chapter => chapter.novelId === projectId).sort((a, b) => a.order - b.order),
        scenes: scenesRef.current.filter(scene => scene.novelId === projectId && !scene.conflictOf).sort((a, b) => a.order - b.order),
        title: options.currentTitle,
      })
    }

    commitLocal(novelsRef, setNovels, 'nf_novels', prev => prev.map(novel => {
      if (novel.id !== projectId) return novel
      const existingCopies = Array.isArray(novel.manuscriptCopies) ? novel.manuscriptCopies : []
      return {
        ...novel,
        manuscriptCopies: currentCopy
          ? [currentCopy, ...existingCopies].slice(0, 30)
          : existingCopies,
        lastRestoredManuscriptAt: new Date().toISOString(),
      }
    }))
    replaceProjectManuscript(projectId, {
      acts: copy.acts || [],
      chapters: copy.chapters || [],
      scenes: copy.scenes || [],
    })
    return copy
  }, [commitLocal, replaceProjectManuscript])

  // Replaces the original scene's content with a conflict copy's content (see
  // mergeSceneUpdateWithPersistedCopy), then removes the copy — the "restore" side
  // of the conflict-copy safety net.
  const restoreSceneConflict = (conflictId) => {
    const conflict = scenesRef.current.find(s => s.id === conflictId)
    if (!conflict || !conflict.conflictOf) return
    updateScene(conflict.conflictOf, { content: conflict.content, title: conflict.title.replace(/ \(conflict copy\)$/, '') })
    discardSceneConflict(conflictId)
  }

  // Discards a conflict copy without touching the original scene.
  const discardSceneConflict = (conflictId) => {
    debouncedSaveScene.cancel(conflictId)
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => prev.filter(s => s.id !== conflictId))
    if (canSyncCloud) deleteSceneDoc(userId, conflictId).catch(console.error)
  }

  const cleanupCharacterPortraits = (urls, overrides = {}) => {
    const candidates = urls.filter(Boolean)
    if (!candidates.length) return
    const referenced = new Set()
    const mediaKey = value => {
      try { return getUserMediaPath(value) || value } catch { return value }
    }
    const collect = value => {
      if (typeof value === 'string') referenced.add(mediaKey(value))
      else if (value && typeof value === 'object') Object.values(value).forEach(collect)
    }
    // Save/delete update refs synchronously; the render snapshot may still
    // contain the old character. Keep media used by any other saved record.
    collect({ ...getCurrentSnapshot(), characters: charactersRef.current, ...overrides })
    deleteMediaUrls(candidates.filter(url => !referenced.has(mediaKey(url))))
  }
  const saveCharacter = (data, id) => {
    if (!id && storageExceededCheck()) { return null }
    const previousImage = id ? charactersRef.current.find(character => character.id === id)?.image : null
    const characterId = id || uid()
    const saved = saveSeriesSyncedItem(
      charactersRef,
      setCharacters,
      'characters',
      data,
      id,
      () => ({ id: characterId, novelId: activeNovelId, ...data })
    )
    if (!saved) return null
    if (Object.hasOwn(data, 'image') && previousImage !== saved.image) cleanupCharacterPortraits([previousImage])
    const savedId = saved?.id || characterId
    // Partial edits (including Family Tree and Relationship Map) must not
    // clear reciprocal links for fields that were not edited at all.
    const familyFields = [
      ['childIds', 'parentIds'],
      ['parentIds', 'childIds'],
      ['spouseIds', 'spouseIds'],
    ].filter(([field]) => Object.hasOwn(data, field))
    if (!familyFields.length) return savedId

    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => {
      return prev.map(c => {
        if (c.id === savedId || c.novelId !== activeNovelId) return c
        let updated = c
        familyFields.forEach(([field, reciprocalField]) => {
          const reciprocalIds = updated[reciprocalField] || []
          const shouldLink = (data[field] || []).includes(c.id)
          if (shouldLink && !reciprocalIds.includes(savedId)) {
            updated = { ...updated, [reciprocalField]: [...reciprocalIds, savedId] }
          } else if (!shouldLink && reciprocalIds.includes(savedId)) {
            updated = { ...updated, [reciprocalField]: reciprocalIds.filter(value => value !== savedId) }
          }
        })
        return updated
      })
    })
    return savedId
  }
  const saveRelationship = (sourceId, targetId, type, { remove = false } = {}) => {
    // Read current records rather than replacing a rendered relationship array.
    // A directed fact belongs to one source; never clear the reverse link.
    if (activeNovelIdRef.current !== activeNovelId || !activeNovelId || !isCharacterLinkRelType(type)) return null
    if (!remove && !CHARACTER_LINK_REL_TYPES.some(relationship => relationship.id === type)) return null
    const visible = resolveSeriesScope(charactersRef.current, 'characters')
    const aliases = buildCharacterAliases(visible, charactersRef.current)
    const resolvedSourceId = aliases.get(sourceId)
    const resolvedTargetId = aliases.get(targetId)
    const source = visible.find(character => character.id === resolvedSourceId)
    if (!source || source.readOnly || !resolvedTargetId || resolvedTargetId === resolvedSourceId) return null
    const relationships = relationshipValues(source.relationships)
    const matches = relationship => String(relationship?.type ?? '') === type && aliases.get(String(relationship?.targetId ?? '')) === resolvedTargetId
    const exists = relationships.some(matches)
    if (remove && !exists) return null
    if (!remove && exists) return source.id
    return saveCharacter({ relationships: remove
      ? relationships.filter(relationship => !matches(relationship))
      : [...relationships, { targetId: resolvedTargetId, type }],
    }, source.id)
  }
  const saveCharacterJourney = (id, journey) => saveSeriesSyncedItem(
    charactersRef,
    setCharacters,
    'characters',
    { journey },
    id,
    () => null
  )
  const updateCharacterJourneyForSeries = (id, journey) => {
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character => (
      character.id === id ? { ...character, journey } : character
    )))
  }
  const deleteCharacter = (id, options = {}) => {
    const beforeDelete = charactersRef.current
    const deletedIds = deleteSeriesSyncedItem(charactersRef, setCharacters, 'characters', id, options)
    if (!deletedIds.length) return false
    const remainingIds = new Set(charactersRef.current.map(character => character.id))
    const deletedSet = new Set(deletedIds.filter(deletedId => !remainingIds.has(deletedId)))
    if (!deletedSet.size) return true // An inherited hide retains the source and its links/media.
    cleanupCharacterPortraits(beforeDelete.filter(c => deletedSet.has(c.id)).map(c => c.image))
    if (canSyncCloud) [...deletedSet].forEach(dId => deleteItem('characters', userId, dId).catch(console.error))
    const removeLinks = (entry, field, matches = value => deletedSet.has(value)) => Array.isArray(entry[field]) && entry[field].some(matches)
      ? { ...entry, [field]: entry[field].filter(value => !matches(value)) }
      : entry
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character => {
      let next = character
      ;['parentIds', 'childIds', 'spouseIds'].forEach(field => { next = removeLinks(next, field) })
      next = removeLinks(next, 'relationships', rel => deletedSet.has(rel?.targetId))
      next = removeLinks(next, 'familyLinks', link => deletedSet.has(link?.sourceCharacterId) || deletedSet.has(link?.targetCharacterId))
      if (Array.isArray(next.journey?.beats) && next.journey.beats.some(beat => deletedSet.has(beat?.linkedCharacterId))) {
        next = { ...next, journey: clearJourneyLinks(next.journey, { characterIds: [...deletedSet] }) }
      }
      return next
    }))
    ;[
      [loreEntriesRef, setLoreEntries, 'nf_loreEntries', 'characterIds'],
      [timelineRef, setTimeline, 'nf_timeline', 'linkedCharacters'],
      [worldHistoryRef, setWorldHistory, 'nf_worldHistory', 'linkedCharacters'],
      [storyScheduleRef, setStorySchedule, 'nf_storySchedule', 'linkedCharacters'],
      [comicPagesRef, setComicPages, 'nf_comicPages', 'characterIds'],
      [comicPanelsRef, setComicPanels, 'nf_comicPanels', 'characterIds'],
    ].forEach(([ref, setter, key, field]) => commitLocal(ref, setter, key, prev => prev.map(entry => removeLinks(entry, field))))
    commitLocal(rpgCharactersRef, setRpgCharacters, 'nf_rpg_characters', prev => prev.map(entry => removeLinks(entry, 'npcRelationships', rel => deletedSet.has(rel?.characterId))))
    return true
  }

  const saveRpgCharacter = (data, id) => {
    const projectId = currentActiveProjectId()
    if (!projectId) return null
    if (!id && storageExceededCheck()) { return null }
    const characterId = id || uid()
    const { id: _id, novelId: _novelId, createdAt: _createdAt, ...safeData } = data || {}
    const existing = id ? rpgCharactersRef.current.find(character => character.id === id && character.novelId === projectId) : null
    if (id && !existing) return null
    const timestamp = new Date().toISOString()
    commitLocal(rpgCharactersRef, setRpgCharacters, 'nf_rpg_characters', prev => {
      if (id) return prev.map(c => c.id === id ? normalizeRpgCharacter({ ...c, ...safeData, updatedAt: timestamp }) : c)
      return [...prev, normalizeRpgCharacter({ ...safeData, id: characterId, novelId: projectId, createdAt: timestamp, updatedAt: timestamp })]
    })
    return characterId
  }

  const deleteRpgCharacter = (id) => {
    const projectId = currentActiveProjectId()
    if (!projectId || !rpgCharactersRef.current.some(character => character.id === id && character.novelId === projectId)) return false
    if (canSyncCloud) deleteItem('rpg_characters', userId, id).catch(console.error)
    commitLocal(rpgCharactersRef, setRpgCharacters, 'nf_rpg_characters', prev => prev.filter(c => c.id !== id))
    return true
  }

  const saveFaction = (data, id) => {
    if (!id && storageExceededCheck()) { return null }
    const factionId = id || uid()
    const previousLogo = id ? factionsRef.current.find(faction => faction.id === id)?.logo?.image : null
    const saved = saveSeriesSyncedItem(
      factionsRef,
      setFactions,
      'factions',
      data,
      id,
      () => ({ id: factionId, novelId: activeNovelId, ...data })
    )
    if (!saved) return null
    if (Object.hasOwn(data, 'logo') && previousLogo !== saved.logo?.image) {
      cleanupCharacterPortraits([previousLogo], { factions: factionsRef.current })
    }
    return saved
  }

  const setScopedFactions = (updater) => {
    const projectId = currentActiveProjectId()
    if (!projectId) return null
    let nextScoped = null
    commitLocal(factionsRef, setFactions, 'nf_factions', prev => {
      const untouched = prev.filter(faction => faction.novelId !== projectId)
      const scoped = prev.filter(faction => faction.novelId === projectId)
      const requested = typeof updater === 'function' ? updater(scoped) : updater
      nextScoped = (Array.isArray(requested) ? requested : []).map(faction => ({
        ...faction,
        novelId: faction.novelId ?? projectId,
      }))
      return [...untouched, ...nextScoped]
    })
    return nextScoped
  }

  const deleteFaction = (id, options = {}) => {
    const beforeDelete = factionsRef.current
    const deletedIds = deleteSeriesSyncedItem(factionsRef, setFactions, 'factions', id, options)
    if (!deletedIds.length) return false
    const remainingIds = new Set(factionsRef.current.map(faction => faction.id))
    const deletedSet = new Set(deletedIds.filter(deletedId => !remainingIds.has(deletedId)))
    if (!deletedSet.size) return true
    cleanupCharacterPortraits(beforeDelete.filter(f => deletedSet.has(f.id)).map(f => f.logo?.image), { factions: factionsRef.current })
    if (canSyncCloud) [...deletedSet].forEach(dId => deleteItem('factions', userId, dId).catch(console.error))
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character =>
      deletedSet.has(character.factionId) ? { ...character, factionId: '' } : character
    ))
    commitLocal(rpgCharactersRef, setRpgCharacters, 'nf_rpg_characters', prev => prev.map(character => (
      character.factionIds?.some(factionId => deletedSet.has(factionId))
        ? { ...character, factionIds: character.factionIds.filter(factionId => !deletedSet.has(factionId)) }
        : character
    )))
    return true
  }

  const saveLocation = (data, id) => {
    if (!id && storageExceededCheck()) { return null }
    const locationId = id || uid()
    return saveSeriesSyncedItem(
      locationsRef,
      setLocations,
      'locations',
      data,
      id,
      () => ({ id: locationId, novelId: activeNovelId, ...data })
    )
  }
  const deleteLocation = (id, options = {}) => {
    const deletedIds = deleteSeriesSyncedItem(locationsRef, setLocations, 'locations', id, options)
    if (!deletedIds.length) return false
    const remainingIds = new Set(locationsRef.current.map(location => location.id))
    const deletedSet = new Set(deletedIds.filter(deletedId => !remainingIds.has(deletedId)))
    if (!deletedSet.size) return true
    if (canSyncCloud) [...deletedSet].forEach(dId => deleteItem('locations', userId, dId).catch(console.error))
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => {
      return prev.map(entry => ({
        ...entry,
        locationIds: (entry.locationIds || []).filter(locationId => !deletedSet.has(locationId)),
      }))
    })
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => {
      return prev.map(event => ({
        ...event,
        linkedLocations: (event.linkedLocations || []).filter(locationId => !deletedSet.has(locationId)),
      }))
    })
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => prev.map(entry => entry.linkedLocations?.some(locationId => deletedSet.has(locationId))
      ? { ...entry, linkedLocations: entry.linkedLocations.filter(locationId => !deletedSet.has(locationId)) }
      : entry))
    commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => prev.map(event => event.linkedLocations?.some(locationId => deletedSet.has(locationId))
      ? { ...event, linkedLocations: event.linkedLocations.filter(locationId => !deletedSet.has(locationId)) }
      : event))
    ;[
      [comicPagesRef, setComicPages, 'nf_comicPages'],
      [comicPanelsRef, setComicPanels, 'nf_comicPanels'],
    ].forEach(([ref, setter, key]) => commitLocal(ref, setter, key, prev => prev.map(entry => entry.locationIds?.some(locationId => deletedSet.has(locationId))
      ? { ...entry, locationIds: entry.locationIds.filter(locationId => !deletedSet.has(locationId)) }
      : entry)))
    return true
  }

  const applyChronicleLink = (eventId, historyId) => {
    const linked = relinkChronicleRecords(timelineRef.current, worldHistoryRef.current, eventId, historyId)
    commitLocal(timelineRef, setTimeline, 'nf_timeline', linked.timeline)
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', linked.history)
  }

  const syncChronicleCounterpart = (record, data, fromTimeline) => {
    const ref = fromTimeline ? worldHistoryRef : timelineRef
    const setter = fromTimeline ? setWorldHistory : setTimeline
    const category = fromTimeline ? 'worldhistory' : 'timeline'
    const linkField = fromTimeline ? 'worldHistoryEntryId' : 'timelineEventId'
    const reverseField = fromTimeline ? 'timelineEventId' : 'worldHistoryEntryId'
    const linkedId = record[linkField]
    let counterpart = linkedId ? ref.current.find(item => item.id === linkedId) : null
    if (counterpart && counterpart.novelId !== record.novelId) {
      // A forward-series edit must fork its inherited mirror, not rewrite the
      // earlier project's historical record through a shared ID.
      const source = counterpart
      counterpart = ref.current.find(item => item.novelId === record.novelId && !item.syncDeleted && syncIdentity(item, category) === syncIdentity(source, category))
        || { ...source, id: uid(), novelId: record.novelId, syncRootId: source.syncRootId || source.id, syncSourceId: source.id, syncHiddenInIds: [], syncDeleted: false }
    }
    if (counterpart) {
      const next = { ...counterpart, ...chronicleContentPatch(data), [reverseField]: record.id }
      commitLocal(ref, setter, SYNC_CATEGORY_CONFIG[category].storageKey, prev => prev.some(item => item.id === next.id)
        ? prev.map(item => item.id === next.id ? next : item)
        : [...prev, next])
    }
    if (fromTimeline) applyChronicleLink(record.id, counterpart?.id || null)
    else applyChronicleLink(counterpart?.id || null, record.id)
  }

  const chronicleEditTargets = (ref, category, existing, saved) => {
    const project = novels.find(novel => novel.id === activeNovelId)
    const projectSeries = series.find(item => item.id === project?.seriesId)
    if (!projectSeries?.syncCategories?.includes(category)) return [saved]
    const forwardIds = getForwardProjectIds(activeNovelId, projectSeries)
    return ref.current.filter(item => item.id === saved.id || (forwardIds.has(item.novelId) && syncIdentity(item, category) === syncIdentity(existing, category)))
  }

  const addEvent = (data, options = {}) => {
    if (!currentActiveProjectId()) return null
    if (storageExceededCheck()) { return null }
    const safeData = withoutRecordIdentity(data)
    const eventId = uid()
    const requestedHistoryId = chronicleLinkId(safeData, 'worldHistoryEntryId', 'linkedHistoryEntryId')
    if (requestedHistoryId && !worldHistoryRef.current.some(entry => entry.id === requestedHistoryId && entry.novelId === activeNovelId)) return null
    const shouldCreateHistory = options.createHistory !== false && !requestedHistoryId
    const historyId = requestedHistoryId || (shouldCreateHistory ? uid() : null)
    const createdAt = Date.now() // eslint-disable-line react-hooks/purity
    const event = { ...safeData, id: eventId, novelId: activeNovelId, syncRootId: eventId, createdAt, worldHistoryEntryId: historyId }
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => [...prev, event])
    if (requestedHistoryId) {
      applyChronicleLink(eventId, requestedHistoryId)
    } else if (shouldCreateHistory) {
      const historyEntry = {
        id: historyId,
        novelId: activeNovelId,
        syncRootId: historyId,
        createdAt,
        timelineEventId: eventId,
        ...chronicleContentPatch(safeData),
      }
      commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => [...prev, historyEntry])
    }
    return event
  }
  const updateEvent = (id, data) => {
    const existing = timelineRef.current.find(event => event.id === id)
    if (!existing) return null
    const fallback = chronicleLinkId(existing, 'worldHistoryEntryId', 'linkedHistoryEntryId', worldHistoryRef.current.find(entry => entry.timelineEventId === id)?.id)
    const linkedHistoryId = chronicleLinkId(data, 'worldHistoryEntryId', 'linkedHistoryEntryId', fallback)
    const linkChanged = Object.hasOwn(data, 'linkedHistoryEntryId') || Object.hasOwn(data, 'worldHistoryEntryId')
    if (linkChanged && linkedHistoryId && !worldHistoryRef.current.some(entry => entry.id === linkedHistoryId)) return null
    if (linkChanged && linkedHistoryId && linkedHistoryId !== fallback && !worldHistoryRef.current.some(entry => entry.id === linkedHistoryId && entry.novelId === activeNovelId)) return null
    const savedEvent = saveSeriesSyncedItem(
      timelineRef,
      setTimeline,
      'timeline',
      { ...chronicleContentPatch(data), ...data, ...(linkChanged ? { worldHistoryEntryId: linkedHistoryId } : {}) },
      id,
      () => ({ id: uid(), novelId: activeNovelId, createdAt: Date.now(), ...data, worldHistoryEntryId: linkedHistoryId })
    )
    if (!savedEvent) return null
    const targets = chronicleEditTargets(timelineRef, 'timeline', existing, savedEvent)
    targets.forEach(event => syncChronicleCounterpart({ ...event, worldHistoryEntryId: linkChanged ? linkedHistoryId : chronicleLinkId(event, 'worldHistoryEntryId', 'linkedHistoryEntryId', linkedHistoryId) }, data, true))
    return timelineRef.current.find(event => event.id === savedEvent.id)
  }
  const deleteEvent = (id, options = {}) => {
    const deletedIds = deleteSeriesSyncedItem(timelineRef, setTimeline, 'timeline', id, options)
    if (!deletedIds.length) return false
    // A current-project hide of inherited data is not a physical deletion.
    // Keep the earlier project's cloud row and reciprocal links intact.
    const remainingIds = new Set(timelineRef.current.map(event => event.id))
    const deletedSet = new Set(deletedIds.filter(deletedId => !remainingIds.has(deletedId)))
    if (!deletedSet.size) return true
    if (canSyncCloud) [...deletedSet].forEach(dId => deleteItem('timeline_events', userId, dId).catch(console.error))
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => prev.map(h => deletedSet.has(h.timelineEventId) ? { ...h, timelineEventId: null } : h))
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character => character.journey ? {
      ...character,
      journey: clearJourneyLinks(character.journey, { timelineEventIds: [...deletedSet] }),
    } : character))
    return true
  }

  const addScheduleEvent = (data) => {
    if (!activeNovelId || activeNovelIdRef.current !== activeNovelId) return null
    if (storageExceededCheck()) { return null }
    const project = novelsRef.current.find(novel => novel.id === activeNovelId)
    if (!project) return null
    const prepared = prepareScheduleEvent({ year: 1, month: 1, day: 1, category: 'scene', duration: 1, tags: [], linkedCharacters: [], linkedLocations: [], ...data }, getScheduleCalendar(project))
    if (prepared.error) return null
    const timestamp = Date.now() // eslint-disable-line react-hooks/purity -- Timestamped only when this explicit store action runs.
    const entry = { ...prepared.event, id: uid(), novelId: activeNovelId, createdAt: timestamp, updatedAt: timestamp }
    commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => [...prev, entry])
    return entry
  }
  const updateScheduleEvent = (id, data, { expected = {} } = {}) => {
    if (!activeNovelId || activeNovelIdRef.current !== activeNovelId) return null
    const existing = storyScheduleRef.current.find(event => event.id === id && event.novelId === activeNovelId)
    const project = novelsRef.current.find(novel => novel.id === activeNovelId)
    if (!existing || !project) return null
    const current = normalizeScheduleEvent(existing)
    if (Object.entries(expected).some(([field, value]) => JSON.stringify(current[field]) !== JSON.stringify(value))) return null
    const prepared = prepareScheduleEvent({ ...current, ...data }, getScheduleCalendar(project))
    if (prepared.error) return null
    const updated = { ...existing, ...prepared.event, updatedAt: Date.now() } // eslint-disable-line react-hooks/purity -- Timestamped only when this explicit store action runs.
    commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => prev.map(event => event.id === id ? updated : event))
    return updated
  }
  const deleteScheduleEvent = (id) => {
    if (!activeNovelId || activeNovelIdRef.current !== activeNovelId) return false
    if (!storyScheduleRef.current.some(event => event.id === id && event.novelId === activeNovelId)) return false
    if (canSyncCloud) deleteItem('story_schedule', userId, id).catch(console.error)
    commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => prev.filter(e => e.id !== id))
    return true
  }

  const addHistoryEntry = (data, options = {}) => {
    if (!currentActiveProjectId()) return null
    if (storageExceededCheck()) { return null }
    const safeData = withoutRecordIdentity(data)
    const createdAt = Date.now() // eslint-disable-line react-hooks/purity
    const timelineEventId = chronicleLinkId(safeData, 'timelineEventId', 'linkedTimelineEventId')
    if (timelineEventId && !timelineRef.current.some(event => event.id === timelineEventId && event.novelId === activeNovelId)) return null
    const entryId = uid()
    const entry = { ...safeData, id: entryId, novelId: activeNovelId, syncRootId: entryId, createdAt, timelineEventId }
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => [...prev, entry])
    if (timelineEventId) {
      applyChronicleLink(timelineEventId, entry.id)
    } else if (options.createTimeline) {
      const eventId = uid()
      const event = {
        id: eventId,
        novelId: activeNovelId,
        syncRootId: eventId,
        createdAt,
        ...chronicleContentPatch(safeData),
        worldHistoryEntryId: entryId,
      }
      const linkedEntry = { ...entry, timelineEventId: eventId }
      commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => [...prev, event])
      commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => prev.map(h => h.id === entryId ? linkedEntry : h))
    }
    return worldHistoryRef.current.find(item => item.id === entry.id)
  }
  const updateHistoryEntry = (id, data) => {
    const existing = worldHistoryRef.current.find(entry => entry.id === id)
    if (!existing) return null
    const fallback = chronicleLinkId(existing, 'timelineEventId', 'linkedTimelineEventId', timelineRef.current.find(event => event.worldHistoryEntryId === id)?.id)
    const linkedTimelineId = chronicleLinkId(data, 'timelineEventId', 'linkedTimelineEventId', fallback)
    const linkChanged = Object.hasOwn(data, 'linkedTimelineEventId') || Object.hasOwn(data, 'timelineEventId')
    if (linkChanged && linkedTimelineId && !timelineRef.current.some(event => event.id === linkedTimelineId)) return null
    if (linkChanged && linkedTimelineId && linkedTimelineId !== fallback && !timelineRef.current.some(event => event.id === linkedTimelineId && event.novelId === activeNovelId)) return null
    const savedHistory = saveSeriesSyncedItem(
      worldHistoryRef,
      setWorldHistory,
      'worldhistory',
      { ...chronicleContentPatch(data), ...data, ...(linkChanged ? { timelineEventId: linkedTimelineId } : {}) },
      id,
      () => ({ id: uid(), novelId: activeNovelId, createdAt: Date.now(), ...data, timelineEventId: linkedTimelineId })
    )
    if (!savedHistory) return null
    const targets = chronicleEditTargets(worldHistoryRef, 'worldhistory', existing, savedHistory)
    targets.forEach(entry => syncChronicleCounterpart({ ...entry, timelineEventId: linkChanged ? linkedTimelineId : chronicleLinkId(entry, 'timelineEventId', 'linkedTimelineEventId', linkedTimelineId) }, data, false))
    return worldHistoryRef.current.find(entry => entry.id === savedHistory.id)
  }
  const deleteHistoryEntry = (id, options = {}) => {
    const deletedIds = deleteSeriesSyncedItem(worldHistoryRef, setWorldHistory, 'worldhistory', id, options)
    if (!deletedIds.length) return false
    const remainingIds = new Set(worldHistoryRef.current.map(entry => entry.id))
    const deletedSet = new Set(deletedIds.filter(deletedId => !remainingIds.has(deletedId)))
    if (!deletedSet.size) return true
    if (canSyncCloud) [...deletedSet].forEach(dId => deleteItem('world_history', userId, dId).catch(console.error))
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => prev.map(e => deletedSet.has(e.worldHistoryEntryId) ? { ...e, worldHistoryEntryId: null } : e))
    return true
  }
  const linkTimelineHistory = (timelineEventId, historyEntryId) => {
    if (!timelineEventId || !historyEntryId) return
    const event = timelineRef.current.find(item => item.id === timelineEventId)
    const history = worldHistoryRef.current.find(item => item.id === historyEntryId)
    if (!event || !history || event.novelId !== activeNovelId || history.novelId !== activeNovelId) return
    applyChronicleLink(timelineEventId, historyEntryId)
  }
  const unlinkTimelineHistory = (timelineEventId, historyEntryId) => {
    const event = timelineRef.current.find(item => item.id === timelineEventId)
    if (!event || event.novelId !== activeNovelId || event.worldHistoryEntryId !== historyEntryId) return
    applyChronicleLink(timelineEventId, null)
  }

  const addLoreEntry = (data) => {
    if (!currentActiveProjectId()) return null
    if (storageExceededCheck()) { return null }
    const id = uid()
    const safeData = withoutRecordIdentity(data)
    const entry = { characterIds: [], category: '', content: '', ...safeData, id, novelId: activeNovelId, syncRootId: id, createdAt: Date.now() } // eslint-disable-line react-hooks/purity
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => [...prev, entry])
    return entry
  }
  const updateLoreEntry = (id, data) => saveSeriesSyncedItem(loreEntriesRef, setLoreEntries, 'lore', data, id, () => ({ id: uid(), novelId: activeNovelId, createdAt: Date.now(), characterIds: [], category: '', content: '', ...data }))
  const deleteLoreEntry = (id, options = {}) => {
    const deletedIds = deleteSeriesSyncedItem(loreEntriesRef, setLoreEntries, 'lore', id, options)
    if (!deletedIds.length) return false
    const remainingIds = new Set(loreEntriesRef.current.map(entry => entry.id))
    const deletedSet = new Set(deletedIds.filter(deletedId => !remainingIds.has(deletedId)))
    if (!deletedSet.size) return true // Current-project hide: keep earlier links/cloud rows.
    if (canSyncCloud) [...deletedSet].forEach(dId => deleteItem('lore_entries', userId, dId).catch(console.error))
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => {
      return prev.map(entry => Array.isArray(entry.loreIds) && entry.loreIds.some(loreId => deletedSet.has(loreId))
        ? { ...entry, loreIds: entry.loreIds.filter(loreId => !deletedSet.has(loreId)) }
        : entry)
    })
    return true
  }

  const addIdeaEntry = (data) => {
    if (!activeNovelId || activeNovelIdRef.current !== activeNovelId) return null
    if (storageExceededCheck()) { return null }
    const entry = {
      id: uid(),
      novelId: activeNovelId,
      createdAt: Date.now(), // eslint-disable-line react-hooks/purity
      updatedAt: Date.now(), // eslint-disable-line react-hooks/purity
      title: '',
      description: '',
      body: '',
      group: '',
      tags: [],
      status: 'raw',
      order: nextIdeaOrder(resolveSeriesScope(ideaEntriesRef.current, 'ideas'), normalizeIdea(data).status),
      isFavourite: false,
      isPinned: false,
      aiExpanded: false,
      linkedEntities: [],
      linkedIdeas: [],
      convertedTo: null,
      ...ideaContentPatch(data),
    }
    entry.syncRootId = entry.id
    commitLocal(ideaEntriesRef, setIdeaEntries, 'nf_ideaEntries', prev => [...prev, entry])
    return entry
  }
  const updateIdeaEntry = (id, data, { expected = {} } = {}) => {
    if (activeNovelIdRef.current !== activeNovelId) return null
    const existing = resolveSeriesScope(ideaEntriesRef.current, 'ideas').find(entry => entry.id === id)
    if (!existing) return null
    const normalized = normalizeIdea(existing)
    if (Object.entries(expected).some(([field, value]) => JSON.stringify(normalized[field]) !== JSON.stringify(value))) return null
    const updatedAt = Date.now() // eslint-disable-line react-hooks/purity -- Timestamped only when this store action is invoked, never during render.
    return saveSeriesSyncedItem(ideaEntriesRef, setIdeaEntries, 'ideas', { ...ideaContentPatch(data), updatedAt }, id, () => null)
  }
  const moveIdeaEntry = (id, status, beforeId = null) => {
    if (activeNovelIdRef.current !== activeNovelId) return null
    const visible = resolveSeriesScope(ideaEntriesRef.current, 'ideas')
    const source = visible.find(entry => entry.id === id)
    if (!source || !IDEA_STATUS_IDS.has(status)) return null
    if (beforeId && beforeId !== id && !visible.some(entry => entry.id === beforeId && normalizeIdea(entry).status === status)) return null
    const plan = planIdeaMove(visible, id, status, beforeId)
    if (!plan.length) return source
    const batch = { items: ideaEntriesRef.current }
    let moved
    const updatedAt = Date.now() // eslint-disable-line react-hooks/purity -- One timestamp for this explicit reorder action.
    for (const change of plan) {
      const saved = saveSeriesSyncedItem(ideaEntriesRef, setIdeaEntries, 'ideas', { ...change.data, updatedAt }, change.id, () => null, batch)
      if (!saved) return null
      if (change.id === id) moved = saved
    }
    commitLocal(ideaEntriesRef, setIdeaEntries, 'nf_ideaEntries', () => batch.items)
    return moved || visible.find(entry => entry.id === id)
  }
  const deleteIdeaEntry = (id, options = {}) => {
    if (activeNovelIdRef.current !== activeNovelId || !resolveSeriesScope(ideaEntriesRef.current, 'ideas').some(entry => entry.id === id)) return false
    const deletedIds = deleteSeriesSyncedItem(ideaEntriesRef, setIdeaEntries, 'ideas', id, options)
    const remainingIds = new Set(ideaEntriesRef.current.map(entry => entry.id))
    const deletedSet = new Set(deletedIds.filter(deletedId => !remainingIds.has(deletedId)))
    if (!deletedSet.size) return true
    if (canSyncCloud) [...deletedSet].forEach(dId => deleteItem('idea_entries', userId, dId).catch(console.error))
    commitLocal(ideaEntriesRef, setIdeaEntries, 'nf_ideaEntries', prev => prev.map(entry => Array.isArray(entry.linkedIdeas) && entry.linkedIdeas.some(linkedId => deletedSet.has(linkedId))
      ? { ...entry, linkedIdeas: entry.linkedIdeas.filter(linkedId => !deletedSet.has(linkedId)) } : entry))
    return true
  }

  const addMap = (name, mapType, options = {}) => {
    const projectId = currentActiveProjectId()
    if (!projectId) return null
    if (storageExceededCheck()) { return null }
    const normalizedMapType = mapType || 'region'
    const isInterior = normalizedMapType === 'interior'
    const project = novelsRef.current.find(novel => novel.id === projectId)
    const isCampaignInterior = ['dnd_campaign', 'tabletop_rpg'].includes(project?.type)
    const metadata = {
      // Region and local maps start land-first (you are usually inside a
      // continent); world maps start as open water. Existing maps without
      // this key keep rendering as water.
      baseLayer: ['region', 'local'].includes(normalizedMapType) ? 'land' : 'water',
      ...(isInterior ? {
        stylePreset: 'blueprint',
        gridSettings: {
          enabled: true,
          type: 'square',
          size: 80,
          opacity: 0.36,
          color: '#d0d5d8',
          snapToGrid: true,
          scale: isCampaignInterior ? '1 square = 5 ft' : '1 square = 1 unit',
        },
      } : {}),
      ...(options.metadata || {}),
    }
    if (options.stylePreset) metadata.stylePreset = options.stylePreset
    const map = {
      id: uid(),
      novelId: projectId,
      name,
      mapType: normalizedMapType,
      mapPins: [],
      mapRegions: [],
      mapObjects: [],
      mapLayers: [],
      metadata,
      created: Date.now(), // eslint-disable-line react-hooks/purity
    }
    commitLocal(mapsRef, setMaps, 'nf_maps', prev => [...prev, map])
    const nextActiveMaps = { ...activeMapByNovelRef.current, [projectId]: map.id }
    activeMapByNovelRef.current = nextActiveMaps
    setActiveMapByNovel(nextActiveMaps)
    saveSettingsNow({ activeMapByNovel: nextActiveMaps })
    return map.id
  }

  const selectMap = (mapId) => {
    const projectId = currentActiveProjectId()
    if (!projectId || !mapsRef.current.some(map => map.id === mapId && map.novelId === projectId)) return false
    const nextActiveMaps = { ...activeMapByNovelRef.current, [projectId]: mapId }
    activeMapByNovelRef.current = nextActiveMaps
    setActiveMapByNovel(nextActiveMaps)
    saveSettingsNow({ activeMapByNovel: nextActiveMaps })
    return true
  }

  const deleteMap = (mapId) => {
    const projectId = currentActiveProjectId()
    if (!projectId || !mapsRef.current.some(map => map.id === mapId && map.novelId === projectId)) return false
    if (canSyncCloud) deleteItem('maps_data', userId, mapId).catch(console.error)
    commitLocal(mapsRef, setMaps, 'nf_maps', prev => prev.filter(m => m.id !== mapId))
    if (activeMapByNovelRef.current[projectId] === mapId) {
      const nextMap = mapsRef.current.find(map => map.novelId === projectId)
      const nextActiveMaps = { ...activeMapByNovelRef.current, [projectId]: nextMap?.id || null }
      activeMapByNovelRef.current = nextActiveMaps
      setActiveMapByNovel(nextActiveMaps)
      saveSettingsNow({ activeMapByNovel: nextActiveMaps })
    }
    return true
  }

  const renameMap = (mapId, name) => {
    const projectId = currentActiveProjectId()
    const existing = mapsRef.current.find(map => map.id === mapId && map.novelId === projectId)
    if (!existing) return null
    const updated = { ...existing, name: String(name || '').trim() || existing.name }
    commitLocal(mapsRef, setMaps, 'nf_maps', prev => prev.map(map => map.id === mapId ? updated : map))
    return updated
  }

  // Patches a specific map by id. Unlike updateActiveMapData, this doesn't rely on
  // activeMapByNovel/maps state having caught up with a just-created map — safe to
  // call right after addMap() in the same tick (e.g. importing multiple maps in a loop).
  const updateMapData = (mapId, updater) => {
    const projectId = currentActiveProjectId()
    const existing = mapsRef.current.find(map => map.id === mapId && map.novelId === projectId)
    if (!existing || typeof updater !== 'function') return null
    const rawPatch = updater(existing) || {}
    const { id: _id, novelId: _novelId, created: _created, ...safePatch } = rawPatch
    delete safePatch.mapData
    delete safePatch.mapOverlay
    const updated = { ...existing, ...safePatch }
    commitLocal(mapsRef, setMaps, 'nf_maps', prev => prev.map(m => {
      if (m.id !== mapId) return m
      const patch = safePatch
      delete patch.mapData
      delete patch.mapOverlay
      return { ...m, ...patch }
    }))
    return updated
  }

  const updateActiveMapData = (updater) => {
    const projectId = currentActiveProjectId()
    if (!projectId) return null
    const currentActiveMapId = activeMapByNovelRef.current[projectId] ?? mapsRef.current.find(m => m.novelId === projectId)?.id
    return updateMapData(currentActiveMapId, updater)
  }

  const updateCurrentYear = (value) => {
    const projectId = currentActiveProjectId()
    if (!projectId) return null
    const next = Number(value)
    const normalized = Number.isFinite(next) ? next : 0
    commitLocal(novelsRef, setNovels, 'nf_novels', prev => prev.map(n => n.id === projectId ? { ...n, currentYear: normalized } : n))
    return normalized
  }

  // Comic page CRUD
  const novelComicPages = comicPages.filter(p => p.novelId === activeNovelId)
  const novelComicPanels = comicPanels.filter(p => p.novelId === activeNovelId)

  const addComicPage = (issueId, data = {}) => {
    const projectId = currentActiveProjectId()
    const issue = chaptersRef.current.find(chapter => chapter.id === issueId && chapter.novelId === projectId)
    if (!projectId || !issue) return null
    if (storageExceededCheck()) { return null }
    const pagesInIssue = comicPagesRef.current.filter(p => p.novelId === projectId && p.issueId === issueId)
    const { id: _id, novelId: _novelId, issueId: _issueId, createdAt: _createdAt, updatedAt: _updatedAt, ...safeData } = data || {}
    const page = {
      id: uid(),
      novelId: projectId,
      issueId,
      order: pagesInIssue.length,
      title: '',
      summary: '',
      pageType: 'standard',
      status: 'outline',
      pageTurn: 'none',
      characterIds: [],
      locationIds: [],
      timeOfDay: '',
      visualDirection: '',
      productionNotes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...safeData,
    }
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev => [...prev, page])
    return page
  }

  const updateComicPage = (pageId, data) => {
    const projectId = currentActiveProjectId()
    const existing = comicPagesRef.current.find(page => page.id === pageId && page.novelId === projectId)
    if (!existing) return null
    const { id: _id, novelId: _novelId, issueId: _issueId, createdAt: _createdAt, ...safeData } = data || {}
    const updated = { ...existing, ...safeData, updatedAt: new Date().toISOString() }
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev =>
      prev.map(p => p.id === pageId ? updated : p)
    )
    return updated
  }

  const deleteComicPage = (pageId) => {
    const projectId = currentActiveProjectId()
    if (!projectId || !comicPagesRef.current.some(page => page.id === pageId && page.novelId === projectId)) return false
    const panelIds = comicPanelsRef.current.filter(panel => panel.pageId === pageId && panel.novelId === projectId).map(panel => panel.id)
    if (canSyncCloud) {
      deleteItem('comic_pages', userId, pageId).catch(console.error)
      panelIds.forEach(id => deleteItem('comic_panels', userId, id).catch(console.error))
    }
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev => prev.filter(p => p.id !== pageId))
    const panelIdSet = new Set(panelIds)
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => prev.filter(p => !panelIdSet.has(p.id)))
    return true
  }

  const reorderComicPage = (issueId, orderedIds) => {
    const projectId = currentActiveProjectId()
    if (!projectId || !chaptersRef.current.some(chapter => chapter.id === issueId && chapter.novelId === projectId) || !Array.isArray(orderedIds)) return false
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev => {
      const scoped = prev.filter(p => p.novelId === projectId && p.issueId === issueId).sort((a, b) => a.order - b.order)
      const byId = new Map(scoped.map(page => [page.id, page]))
      const seen = new Set()
      const requested = orderedIds.filter(id => byId.has(id) && !seen.has(id) && seen.add(id))
      const finalIds = [...requested, ...scoped.map(page => page.id).filter(id => !seen.has(id))]
      const reordered = new Map(finalIds.map((id, order) => [id, { ...byId.get(id), order }]))
      return prev.map(page => reordered.get(page.id) || page)
    })
    return true
  }

  const duplicateComicPage = (pageId) => {
    const projectId = currentActiveProjectId()
    const src = comicPagesRef.current.find(p => p.id === pageId && p.novelId === projectId)
    if (!src) return null
    const newPageId = uid()
    const pagesInIssue = comicPagesRef.current.filter(p => p.novelId === projectId && p.issueId === src.issueId)
    const newPage = { ...src, id: newPageId, order: pagesInIssue.length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const srcPanels = comicPanelsRef.current.filter(p => p.novelId === projectId && p.pageId === pageId)
    const newPanels = srcPanels.map(p => ({ ...p, id: uid(), pageId: newPageId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev => [...prev, newPage])
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => [...prev, ...newPanels])
    return newPage
  }

  // Comic panel CRUD
  const addComicPanel = (pageId, data = {}) => {
    const projectId = currentActiveProjectId()
    const parent = comicPagesRef.current.find(page => page.id === pageId && page.novelId === projectId)
    if (!projectId || !parent) return null
    if (storageExceededCheck()) { return null }
    const panelsOnPage = comicPanelsRef.current.filter(p => p.novelId === projectId && p.pageId === pageId)
    const { id: _id, novelId: _novelId, pageId: _pageId, createdAt: _createdAt, updatedAt: _updatedAt, ...safeData } = data || {}
    const panel = {
      id: uid(),
      novelId: projectId,
      pageId,
      order: panelsOnPage.length,
      layoutHint: 'standard',
      shotType: 'medium',
      description: '',
      artNotes: '',
      dialogue: [],
      captions: [],
      sfx: [],
      characterIds: [],
      locationIds: [],
      continuityNotes: '',
      status: 'outline',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...safeData,
    }
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => [...prev, panel])
    return panel
  }

  const updateComicPanel = (panelId, data) => {
    const projectId = currentActiveProjectId()
    const existing = comicPanelsRef.current.find(panel => panel.id === panelId && panel.novelId === projectId)
    if (!existing) return null
    const { id: _id, novelId: _novelId, pageId: _pageId, createdAt: _createdAt, ...safeData } = data || {}
    const updated = { ...existing, ...safeData, updatedAt: new Date().toISOString() }
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev =>
      prev.map(p => p.id === panelId ? updated : p)
    )
    return updated
  }

  const deleteComicPanel = (panelId) => {
    const projectId = currentActiveProjectId()
    if (!projectId || !comicPanelsRef.current.some(panel => panel.id === panelId && panel.novelId === projectId)) return false
    if (canSyncCloud) deleteItem('comic_panels', userId, panelId).catch(console.error)
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => prev.filter(p => p.id !== panelId))
    return true
  }

  const reorderComicPanel = (pageId, orderedIds) => {
    const projectId = currentActiveProjectId()
    if (!projectId || !comicPagesRef.current.some(page => page.id === pageId && page.novelId === projectId) || !Array.isArray(orderedIds)) return false
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => {
      const scoped = prev.filter(p => p.novelId === projectId && p.pageId === pageId).sort((a, b) => a.order - b.order)
      const byId = new Map(scoped.map(panel => [panel.id, panel]))
      const seen = new Set()
      const requested = orderedIds.filter(id => byId.has(id) && !seen.has(id) && seen.add(id))
      const finalIds = [...requested, ...scoped.map(panel => panel.id).filter(id => !seen.has(id))]
      const reordered = new Map(finalIds.map((id, order) => [id, { ...byId.get(id), order }]))
      return prev.map(panel => reordered.get(panel.id) || panel)
    })
    return true
  }

  const addNovel = (data, { seedManuscript = true } = {}) => {
    if (freeProjectId !== null) {
      notifyReadOnly('free-limit')
      return null
    }
    if (storageExceededCheck()) { return null }
    const { id: _id, createdAt: _createdAt, ...safeData } = data || {}
    const novel = { ...safeData, id: uid(), createdAt: new Date().toISOString() }
    const starter = seedManuscript ? buildStarterStructure(novel.id, novel.type) : { acts: [], chapters: [], scenes: [] }
    commitLocal(actsRef, setActs, 'nf_acts', prev => [...prev, ...starter.acts])
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => [...prev, ...starter.chapters])
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => [...prev, ...starter.scenes])
    if (canSyncCloud) {
      starter.scenes.forEach(scene => saveSceneDoc(userId, scene).catch(console.error))
    }
    commitLocal(novelsRef, setNovels, 'nf_novels', prev => [...prev, novel])
    selectActiveNovel(novel.id)
    return novel
  }
  // Per-project read-only also applies when editing/deleting a project by id directly
  // (e.g. from a library card) even while a different, editable project is active.
  const isFreeLockedProject = (id) => freeProjectId !== null && id !== freeProjectId

  const updateNovel = (id, data) => {
    if (isFreeLockedProject(id)) { notifyReadOnly('free-project'); return null }
    const existing = novelsRef.current.find(novel => novel.id === id)
    if (!existing) return null
    const { id: _id, createdAt: _createdAt, type: _type, ...safeData } = data || {}
    const updated = { ...existing, ...safeData }
    commitLocal(novelsRef, setNovels, 'nf_novels', prev => prev.map(n => n.id === id ? updated : n))
    return updated
  }

  const getProjectExportData = (id) => {
    const project = novels.find(n => n.id === id) ?? null
    if (!project) return null
    const projectSeries = project.seriesId
      ? series.find(s => s.id === project.seriesId) ?? null
      : null
    return {
      exportedAt: new Date().toISOString(),
      project,
      series: projectSeries,
      activeMapId: activeMapByNovel[id] ?? null,
      characters: characters.filter(c => c.novelId === id),
      factions: factions.filter(f => f.novelId === id),
      locations: locations.filter(l => l.novelId === id),
      timeline: timeline.filter(e => e.novelId === id),
      worldHistory: worldHistory.filter(h => h.novelId === id),
      eras: eras.filter(e => e.novelId === id),
      acts: acts.filter(a => a.novelId === id),
      chapters: chapters.filter(c => c.novelId === id),
      scenes: scenes.filter(s => s.novelId === id),
      loreEntries: loreEntries.filter(e => e.novelId === id),
      ideaEntries: ideaEntries.filter(e => e.novelId === id),
      maps: maps.filter(m => m.novelId === id),
      whiteboards: whiteboards.filter(w => w.novelId === id),
      storySchedule: storySchedule.filter(e => e.novelId === id),
      rpgCharacters: rpgCharacters.filter(c => c.novelId === id).map(normalizeRpgCharacter),
      ...(project.type === 'comic' ? {
        comicPages: comicPages.filter(p => p.novelId === id),
        comicPanels: comicPanels.filter(p => p.novelId === id),
      } : {}),
    }
  }

  const beginProjectImport = () => {
    if (projectImportDepthRef.current === 0) projectImportSceneIdsRef.current.clear()
    projectImportDepthRef.current += 1
  }

  const endProjectImport = (commit = true) => {
    projectImportDepthRef.current = Math.max(0, projectImportDepthRef.current - 1)
    if (projectImportDepthRef.current > 0) return
    const sceneIds = [...projectImportSceneIdsRef.current]
    projectImportSceneIdsRef.current.clear()
    if (!commit || !canSyncCloud) return
    sceneIds.forEach(sceneId => {
      const scene = scenesRef.current.find(item => item.id === sceneId)
      if (scene) trackSync(saveSceneDoc(userId, scene)).catch(() => {})
    })
  }

  const restoreProjectSnapshot = (projectId, snapshot) => {
    if (!projectId || !snapshot || activeNovelIdRef.current !== projectId) return false

    const restoreCollection = (ref, setter, storageKey, items) => {
      const restored = Array.isArray(items) ? items : []
      commitLocal(ref, setter, storageKey, prev => [
        ...prev.filter(item => item.novelId !== projectId),
        ...restored,
      ])
    }

    const restoredSceneIds = new Set((snapshot.scenes || []).map(scene => scene.id))
    scenesRef.current
      .filter(scene => scene.novelId === projectId && !restoredSceneIds.has(scene.id))
      .forEach(scene => debouncedSaveScene.cancel(scene.id))

    restoreCollection(charactersRef, setCharacters, 'nf_characters', snapshot.characters)
    restoreCollection(factionsRef, setFactions, 'nf_factions', snapshot.factions)
    restoreCollection(locationsRef, setLocations, 'nf_locations', snapshot.locations)
    restoreCollection(timelineRef, setTimeline, 'nf_timeline', snapshot.timeline)
    restoreCollection(worldHistoryRef, setWorldHistory, 'nf_worldHistory', snapshot.worldHistory)
    restoreCollection(erasRef, setEras, 'nf_eras', snapshot.eras)
    restoreCollection(actsRef, setActs, 'nf_acts', snapshot.acts)
    restoreCollection(chaptersRef, setChapters, 'nf_chapters', snapshot.chapters)
    restoreCollection(scenesRef, setScenes, 'nf_scenes', snapshot.scenes)
    restoreCollection(loreEntriesRef, setLoreEntries, 'nf_loreEntries', snapshot.loreEntries)
    restoreCollection(ideaEntriesRef, setIdeaEntries, 'nf_ideaEntries', snapshot.ideaEntries)
    restoreCollection(mapsRef, setMaps, 'nf_maps', snapshot.maps)
    restoreCollection(whiteboardsRef, setWhiteboards, 'nf_whiteboards', snapshot.whiteboards)
    restoreCollection(storyScheduleRef, setStorySchedule, 'nf_storySchedule', snapshot.storySchedule)
    restoreCollection(rpgCharactersRef, setRpgCharacters, 'nf_rpg_characters', snapshot.rpgCharacters)
    restoreCollection(comicPagesRef, setComicPages, 'nf_comicPages', snapshot.comicPages)
    restoreCollection(comicPanelsRef, setComicPanels, 'nf_comicPanels', snapshot.comicPanels)

    const nextActiveMaps = {
      ...activeMapByNovelRef.current,
      [projectId]: snapshot.activeMapId ?? null,
    }
    activeMapByNovelRef.current = nextActiveMaps
    setActiveMapByNovel(nextActiveMaps)
    saveSettingsNow({ activeMapByNovel: nextActiveMaps })
    return true
  }

  const novelEras = eras.filter(e => e.novelId === activeNovelId)

  const addEra = (data) => {
    const projectId = currentActiveProjectId()
    if (!projectId) return null
    if (storageExceededCheck()) { return null }
    const { id: _id, novelId: _novelId, createdAt: _createdAt, ...safeData } = data || {}
    const era = { ...safeData, id: uid(), novelId: projectId, createdAt: Date.now() } // eslint-disable-line react-hooks/purity
    commitLocal(erasRef, setEras, 'nf_eras', prev => [...prev, era])
    return era
  }
  const updateEra = (id, data) => {
    const projectId = currentActiveProjectId()
    const existing = erasRef.current.find(era => era.id === id && era.novelId === projectId)
    if (!existing) return null
    const { id: _id, novelId: _novelId, createdAt: _createdAt, ...safeData } = data || {}
    const updated = { ...existing, ...safeData }
    commitLocal(erasRef, setEras, 'nf_eras', prev => prev.map(era => era.id === id ? updated : era))
    if (Object.hasOwn(safeData, 'name')) {
      const rename = prev => prev.map(entry => entry.eraId === id ? { ...entry, era: data.name } : entry)
      commitLocal(timelineRef, setTimeline, 'nf_timeline', rename)
      commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', rename)
    }
    return updated
  }
  const deleteEra = (id) => {
    const projectId = currentActiveProjectId()
    if (!projectId || !erasRef.current.some(era => era.id === id && era.novelId === projectId)) return false
    if (canSyncCloud) deleteItem('eras', userId, id).catch(console.error)
    commitLocal(erasRef, setEras, 'nf_eras', prev => prev.filter(e => e.id !== id))
    // clear era reference from timeline entries
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev =>
      prev.map(e => e.eraId === id ? { ...e, eraId: null, era: '' } : e)
    )
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev =>
      prev.map(entry => entry.eraId === id ? { ...entry, eraId: null, era: '' } : entry)
    )
    return true
  }

  const addSeries = (name) => {
    if (storageExceededCheck()) return null
    const normalizedName = String(name || '').trim()
    if (!normalizedName) return null
    const s = { id: uid(), name: normalizedName, createdAt: new Date().toISOString() }
    setSeries(prev => [...prev, s])
    return s
  }
  const deleteSeries = (id) => {
    const existing = series.find(item => item.id === id)
    if (!existing) return false
    deleteMediaUrls([existing.coverPhoto])
    if (canSyncCloud) deleteItem('series_items', userId, id).catch(console.error)
    setSeries(prev => prev.filter(s => s.id !== id))
    setNovels(prev => prev.map(n => n.seriesId === id ? { ...n, seriesId: null } : n))
    return true
  }
  const updateSeries = (id, data) => {
    const existing = series.find(item => item.id === id)
    if (!existing) return null
    const { id: _id, createdAt: _createdAt, ...safeData } = data || {}
    const updated = { ...existing, ...safeData }
    setSeries(prev => prev.map(item => item.id === id ? updated : item))
    return updated
  }
  const updateSeriesContinuity = (id, patch) => {
    const existing = series.find(item => item.id === id)
    if (!existing) return null
    const updated = {
    ...existing,
    continuity: {
      ...(existing.continuity || {}),
      ...patch,
    },
    updatedAt: new Date().toISOString(),
    }
    setSeries(prev => prev.map(item => item.id === id ? updated : item))
    return updated
  }
  const reorderSeries = (orderedIds) => setSeries(prev => {
    const map = new Map(prev.map(s => [s.id, s]))
    const seen = new Set()
    const ordered = (orderedIds || []).filter(id => map.has(id) && !seen.has(id) && seen.add(id)).map(id => map.get(id))
    return [...ordered, ...prev.filter(item => !seen.has(item.id))]
  })
  const reorderNovels = (orderedIds) => setNovels(prev => {
    const map = new Map(prev.map(n => [n.id, n]))
    const seen = new Set()
    const ordered = (orderedIds || []).filter(id => map.has(id) && !seen.has(id) && seen.add(id)).map(id => map.get(id))
    return [...ordered, ...prev.filter(item => !seen.has(item.id))]
  })
  const deleteNovel = (id) => {
    if (isFreeLockedProject(id)) { notifyReadOnly('free-project'); return false }
    const deletedNovel = novelsRef.current.find(n => n.id === id)
    if (!deletedNovel) return false
    deleteMediaUrls([
      deletedNovel?.coverPhoto,
      deletedNovel?.bannerImage,
      ...charactersRef.current.filter(c => c.novelId === id).map(c => c.image),
      ...factionsRef.current.filter(f => f.novelId === id).map(f => f.logo?.image),
    ])
    // Per-scene storage cleanup (audit finding #16: "Project deletion can
    // leave per-scene keys"). Deliberately reads `nf_scenes` straight from
    // the storage backend rather than trusting `scenesRef.current` — the
    // in-memory copy is normally in sync, but the whole point of the bug
    // being fixed here is a case where it silently isn't (a scene whose
    // content key was never "known" to this tab this session). Falls back to
    // `scenesRef.current` too (union, not replace) purely as a belt-and-braces
    // net for the reverse gap — a scene added this tick whose own persistence
    // effect hasn't flushed yet — not because the storage read is expected to
    // be incomplete in normal operation.
    const removedContentIds = deleteAllSceneContentForNovel(id, {
      knownContentKeyIds: knownSceneContentIdsRef.current,
      lastWrittenContentById: lastWrittenSceneContentByIdRef.current,
    })
    const inMemorySceneIds = scenesRef.current.filter(s => s.novelId === id).map(s => s.id).filter(sid => sid != null)
    clearSceneVersionsForNovel(id, [...new Set([...removedContentIds, ...inMemorySceneIds])])
    const updatedNovels = novelsRef.current.filter(n => n.id !== id)
    commitLocal(novelsRef, setNovels, 'nf_novels', updatedNovels)
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.filter(c => c.novelId !== id))
    commitLocal(factionsRef, setFactions, 'nf_factions', prev => prev.filter(f => f.novelId !== id))
    commitLocal(locationsRef, setLocations, 'nf_locations', prev => prev.filter(l => l.novelId !== id))
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => prev.filter(e => e.novelId !== id))
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => prev.filter(h => h.novelId !== id))
    setEras(prev => prev.filter(e => e.novelId !== id))
    commitLocal(actsRef, setActs, 'nf_acts', prev => prev.filter(a => a.novelId !== id))
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => prev.filter(c => c.novelId !== id))
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => prev.filter(s => s.novelId !== id))
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => prev.filter(e => e.novelId !== id))
    commitLocal(ideaEntriesRef, setIdeaEntries, 'nf_ideaEntries', prev => prev.filter(e => e.novelId !== id))
    commitLocal(mapsRef, setMaps, 'nf_maps', prev => prev.filter(m => m.novelId !== id))
    commitLocal(whiteboardsRef, setWhiteboards, 'nf_whiteboards', prev => prev.filter(w => w.novelId !== id))
    commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => prev.filter(e => e.novelId !== id))
    commitLocal(rpgCharactersRef, setRpgCharacters, 'nf_rpg_characters', prev => prev.filter(c => c.novelId !== id))
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev => prev.filter(p => p.novelId !== id))
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => prev.filter(p => p.novelId !== id))
    const nextActiveMapByNovel = { ...activeMapByNovelRef.current }
    if (Object.prototype.hasOwnProperty.call(nextActiveMapByNovel, id)) {
      delete nextActiveMapByNovel[id]
      setActiveMapByNovel(nextActiveMapByNovel)
      saveSettingsNow({ activeMapByNovel: nextActiveMapByNovel })
    }
    if (canSyncCloud) {
      deleteItemsByNovel(userId, id).catch(console.error)
      deleteItem('novels', userId, id).catch(console.error)
    }
    if (activeNovelIdRef.current === id) selectActiveNovel(null)
    setSelectedCharacterId(null)
    setSelectedLocationId(null)
    setSelectedLoreEntryId(null)
    setSelectedIdeaEntryId(null)
    setSelectedSceneId(null)
    return true
  }

  const importProjectFromData = (data) => {
    if (freeProjectId !== null) {
      notifyReadOnly('free-limit')
      return null
    }
    if (storageExceededCheck()) { return null }
    const newId = uid()

    // Every record type below gets a brand-new id, never the id it was
    // exported with — so re-importing the same export twice, or importing
    // it into an account that still has the source project, can never
    // collide with an existing record. Locally, colliding ids break
    // edit/delete-by-id and React keys across the two "different" projects;
    // in Supabase, normalized tables use globally unique text primary keys,
    // so a duplicate-id upsert can silently overwrite/reparent the
    // *original* project's row instead of creating a new one — real data
    // corruption, not just a display bug (audit finding P0-06). `data` is
    // only ever read here, never mutated, so the source project this was
    // exported from is untouched either way.
    const buildIdMap = (items) => Object.fromEntries((items ?? []).map(item => [item.id, uid()]))
    const eraIdMap = buildIdMap(data.eras)
    const characterIdMap = buildIdMap(data.characters)
    const factionIdMap = buildIdMap(data.factions)
    const locationIdMap = buildIdMap(data.locations)
    const timelineIdMap = buildIdMap(data.timeline)
    const worldHistoryIdMap = buildIdMap(data.worldHistory)
    const actIdMap = buildIdMap(data.acts)
    const chapterIdMap = buildIdMap(data.chapters)
    const sceneIdMap = buildIdMap(data.scenes)
    const loreIdMap = buildIdMap(data.loreEntries)
    const ideaIdMap = buildIdMap(data.ideaEntries)
    const mapIdMap = buildIdMap(data.maps)
    const whiteboardIdMap = buildIdMap(data.whiteboards)
    const storyScheduleIdMap = buildIdMap(data.storySchedule)
    const rpgCharacterIdMap = buildIdMap(data.rpgCharacters)
    const comicPageIdMap = buildIdMap(data.comicPages)
    const comicPanelIdMap = buildIdMap(data.comicPanels)

    // Fall back to the original id when it isn't in the map (e.g. a stale
    // reference to a record that no longer exists in the export) rather
    // than dropping the field — matches the existing remap convention used
    // by populateYowProject() (src/components/AIImportModal.jsx) for the
    // sibling YOW-import path this mirrors.
    const at = (map, id) => (id && map[id]) || id
    const mapIds = (map, ids) => (ids || []).map(id => at(map, id))
    const own = (item, idMap) => ({ ...item, id: at(idMap, item.id), novelId: newId })

    const remapJourney = (journey) => {
      if (!journey?.beats?.length) return journey
      return {
        ...journey,
        beats: journey.beats.map(beat => ({
          ...beat,
          timelineEventId: beat.timelineEventId ? at(timelineIdMap, beat.timelineEventId) : beat.timelineEventId,
          chapterId: beat.chapterId ? at(chapterIdMap, beat.chapterId) : beat.chapterId,
          sceneId: beat.sceneId ? at(sceneIdMap, beat.sceneId) : beat.sceneId,
          linkedCharacterId: beat.linkedCharacterId ? at(characterIdMap, beat.linkedCharacterId) : beat.linkedCharacterId,
        })),
      }
    }
    const remapCharacter = (character) => ({
      ...own(character, characterIdMap),
      factionId: character.factionId ? at(factionIdMap, character.factionId) : character.factionId,
      parentIds: mapIds(characterIdMap, character.parentIds),
      childIds: mapIds(characterIdMap, character.childIds),
      spouseIds: mapIds(characterIdMap, character.spouseIds),
      relationships: (character.relationships || []).map(rel => ({ ...rel, targetId: at(characterIdMap, rel.targetId) })),
      familyLinks: (character.familyLinks || []).map(link => ({
        ...link,
        sourceCharacterId: at(characterIdMap, link.sourceCharacterId),
        targetCharacterId: at(characterIdMap, link.targetCharacterId),
      })),
      ...(character.journey ? { journey: remapJourney(character.journey) } : {}),
    })
    const remapFaction = (faction) => own(faction, factionIdMap)
    const remapLocation = (location) => own(location, locationIdMap)
    const remapLore = (entry) => ({
      ...own(entry, loreIdMap),
      characterIds: mapIds(characterIdMap, entry.characterIds),
      locationIds: mapIds(locationIdMap, entry.locationIds),
    })
    const remapTimeline = (event) => ({
      ...own(event, timelineIdMap),
      eraId: event.eraId ? at(eraIdMap, event.eraId) : event.eraId,
      worldHistoryEntryId: event.worldHistoryEntryId ? at(worldHistoryIdMap, event.worldHistoryEntryId) : event.worldHistoryEntryId,
      linkedCharacters: mapIds(characterIdMap, event.linkedCharacters),
      linkedLocations: mapIds(locationIdMap, event.linkedLocations),
    })
    const remapWorldHistory = (entry) => ({
      ...own(entry, worldHistoryIdMap),
      eraId: entry.eraId ? at(eraIdMap, entry.eraId) : entry.eraId,
      timelineEventId: entry.timelineEventId ? at(timelineIdMap, entry.timelineEventId) : entry.timelineEventId,
    })
    const remapEra = (era) => own(era, eraIdMap)
    const remapAct = (act) => own(act, actIdMap)
    const remapChapter = (chapter) => ({
      ...own(chapter, chapterIdMap),
      actId: chapter.actId ? at(actIdMap, chapter.actId) : chapter.actId,
    })
    const remapScene = (scene) => ({
      ...own(scene, sceneIdMap),
      chapterId: scene.chapterId ? at(chapterIdMap, scene.chapterId) : scene.chapterId,
    })
    const linkedEntityIdMaps = { character: characterIdMap, location: locationIdMap, faction: factionIdMap, lore: loreIdMap, event: timelineIdMap, chapter: chapterIdMap }
    const remapIdeaEntity = entity => entity && linkedEntityIdMaps[entity.type]
      ? { ...entity, id: at(linkedEntityIdMaps[entity.type], entity.id) } : entity
    const remapIdea = (idea) => ({
      ...own(idea, ideaIdMap),
      linkedEntities: (idea.linkedEntities || []).map(remapIdeaEntity),
      linkedIdeas: mapIds(ideaIdMap, idea.linkedIdeas),
      convertedTo: remapIdeaEntity(idea.convertedTo),
    })
    // Only 'location' is a currently-supported linkedEntity.entityType (see
    // YOWMapBuilder.jsx), but remap defensively by type in case that grows.
    const remapMapLinkedEntity = (linkedEntity) => {
      if (!linkedEntity || linkedEntity.entityType !== 'location') return linkedEntity
      return { ...linkedEntity, entityId: at(locationIdMap, linkedEntity.entityId) }
    }
    const remapMap = (mapRecord) => ({
      ...own(mapRecord, mapIdMap),
      ...(mapRecord.mapObjects ? { mapObjects: mapRecord.mapObjects.map(o => o.linkedEntity ? { ...o, linkedEntity: remapMapLinkedEntity(o.linkedEntity) } : o) } : {}),
      ...(mapRecord.mapRegions ? { mapRegions: mapRecord.mapRegions.map(r => r.linkedEntity ? { ...r, linkedEntity: remapMapLinkedEntity(r.linkedEntity) } : r) } : {}),
      ...(mapRecord.mapPins ? { mapPins: mapRecord.mapPins.map(p => p.linkedEntity ? { ...p, linkedEntity: remapMapLinkedEntity(p.linkedEntity) } : p) } : {}),
    })
    const remapWhiteboard = (whiteboard) => own(whiteboard, whiteboardIdMap)
    const remapScheduleEvent = (event) => ({
      ...own(event, storyScheduleIdMap),
      linkedCharacters: mapIds(characterIdMap, event.linkedCharacters),
      linkedLocations: mapIds(locationIdMap, event.linkedLocations),
    })
    const remapRpgCharacter = (character) => ({
      ...own(character, rpgCharacterIdMap),
      factionIds: mapIds(factionIdMap, character.factionIds),
      npcRelationships: (character.npcRelationships || []).map(rel => ({ ...rel, characterId: at(characterIdMap, rel.characterId) })),
    })
    const remapComicPage = (page) => ({
      ...own(page, comicPageIdMap),
      issueId: page.issueId ? at(chapterIdMap, page.issueId) : page.issueId,
      characterIds: mapIds(characterIdMap, page.characterIds),
      locationIds: mapIds(locationIdMap, page.locationIds),
    })
    const remapComicPanel = (panel) => ({
      ...own(panel, comicPanelIdMap),
      pageId: panel.pageId ? at(comicPageIdMap, panel.pageId) : panel.pageId,
      characterIds: mapIds(characterIdMap, panel.characterIds),
      locationIds: mapIds(locationIdMap, panel.locationIds),
    })

    const project = { ...data.project, id: newId, importedAt: new Date().toISOString(), focus: false }
    commitLocal(novelsRef, setNovels, 'nf_novels', prev => [...prev, project])
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => [...prev, ...(data.characters ?? []).map(remapCharacter)])
    commitLocal(factionsRef, setFactions, 'nf_factions', prev => [...prev, ...(data.factions ?? []).map(remapFaction)])
    commitLocal(locationsRef, setLocations, 'nf_locations', prev => [...prev, ...(data.locations ?? []).map(remapLocation)])
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => [...prev, ...(data.timeline ?? []).map(remapTimeline)])
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => [...prev, ...(data.worldHistory ?? []).map(remapWorldHistory)])
    setEras(prev => [...prev, ...(data.eras ?? []).map(remapEra)])
    commitLocal(actsRef, setActs, 'nf_acts', prev => [...prev, ...(data.acts ?? []).map(remapAct)])
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => [...prev, ...(data.chapters ?? []).map(remapChapter)])
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => [...prev, ...(data.scenes ?? []).map(remapScene)])
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => [...prev, ...(data.loreEntries ?? []).map(remapLore)])
    commitLocal(ideaEntriesRef, setIdeaEntries, 'nf_ideaEntries', prev => [...prev, ...(data.ideaEntries ?? []).map(remapIdea)])
    commitLocal(mapsRef, setMaps, 'nf_maps', prev => [...prev, ...(data.maps ?? []).map(remapMap)])
    commitLocal(whiteboardsRef, setWhiteboards, 'nf_whiteboards', prev => [...prev, ...(data.whiteboards ?? []).map(remapWhiteboard)])
    commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => [...prev, ...(data.storySchedule ?? []).map(remapScheduleEvent)])
    commitLocal(rpgCharactersRef, setRpgCharacters, 'nf_rpg_characters', prev => [...prev, ...(data.rpgCharacters ?? []).map(remapRpgCharacter).map(normalizeRpgCharacter)])
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev => [...prev, ...(data.comicPages ?? []).map(remapComicPage)])
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => [...prev, ...(data.comicPanels ?? []).map(remapComicPanel)])
    if (data.activeMapId && mapIdMap[data.activeMapId]) {
      setActiveMapByNovel(prev => ({ ...prev, [newId]: mapIdMap[data.activeMapId] }))
    }
    selectActiveNovel(newId)
    return project
  }

  const enrichSampleProject = useCallback((projectId) => {
    const project = novelsRef.current.find(novel => novel.id === projectId)
      || novelsRef.current.find(novel => novel.isSampleProject && novel.sampleSource === 'the-last-ember')
    if (!project?.id || project.sampleSource !== 'the-last-ember') return project || null

    const projectCharacters = charactersRef.current.filter(character => character.novelId === project.id)
    const existingIdBySourceId = new Map()
    const byName = new Map(projectCharacters.map(character => [character.name, character]))
    ;(lastEmberDemoProject.characters || []).forEach(sourceCharacter => {
      const existing = byName.get(sourceCharacter.name)
      if (existing?.id) existingIdBySourceId.set(sourceCharacter.id, existing.id)
    })
    if (existingIdBySourceId.size < 6) return project

    const idMap = { [lastEmberDemoProject.project.id]: project.id }
    existingIdBySourceId.forEach((existingId, sourceId) => { idMap[sourceId] = existingId })
    const relationshipsByCharacter = new Map()
    const familyLinksByCharacter = new Map()
    ;(lastEmberDemoProject.characters || []).forEach(sourceCharacter => {
      const existingId = idMap[sourceCharacter.id]
      if (!existingId) return
      relationshipsByCharacter.set(existingId, remapExportValue(sourceCharacter.relationships || [], idMap))
      familyLinksByCharacter.set(existingId, remapExportValue(sourceCharacter.familyLinks || [], idMap))
    })
    const lastEmberCharacterIds = new Set(existingIdBySourceId.values())
    const sourceChapterByTitle = new Map(
      (lastEmberDemoProject.chapters || [])
        .map(chapter => [chapter.title, chapter])
    )
    const sourceChapterIdByProjectChapterId = new Map(
      chaptersRef.current
        .filter(chapter => chapter.novelId === project.id)
        .map(chapter => [chapter.id, sourceChapterByTitle.get(chapter.title)?.id])
        .filter(([, sourceChapterId]) => sourceChapterId)
    )
    const sourceSceneByChapterId = new Map(
      (lastEmberDemoProject.scenes || [])
        .filter(scene => scene.chapterId)
        .map(scene => [scene.chapterId, scene])
    )
    const mergeRelationships = (existing = [], generated = []) => {
      const seen = new Set()
      return [...existing, ...generated].filter(relationship => {
        if (!relationship?.targetId || !relationship.type) return false
        const key = `${relationship.targetId}:${relationship.type}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }
    const mergeFamilyLinks = (existing = [], generated = []) => {
      const seen = new Set()
      return [...existing, ...generated].filter(link => {
        if (!link?.sourceCharacterId || !link?.targetCharacterId || !link.kind) return false
        const key = [
          link.sourceCharacterId,
          link.targetCharacterId,
          link.kind,
          link.type || '',
          link.status || '',
          link.direction || '',
        ].join(':')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }

    commitLocal(novelsRef, setNovels, 'nf_novels', prev => prev.map(novel => (
      novel.id === project.id
        ? {
            ...novel,
            coverPhoto: novel.coverPhoto || lastEmberDemoProject.project.coverPhoto,
            bannerImage: novel.bannerImage || lastEmberDemoProject.project.bannerImage,
          }
        : novel
    )))
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character => {
      if (character.novelId !== project.id || !lastEmberCharacterIds.has(character.id)) return character
      return {
        ...character,
        relationships: mergeRelationships(character.relationships, relationshipsByCharacter.get(character.id) || []),
        familyLinks: mergeFamilyLinks(character.familyLinks, familyLinksByCharacter.get(character.id) || []),
      }
    }))
    const updatedScenes = commitLocal(scenesRef, setScenes, 'nf_scenes', prev => prev.map(scene => {
      if (scene.novelId !== project.id) return scene
      const sourceChapterId = sourceChapterIdByProjectChapterId.get(scene.chapterId)
      const sourceScene = sourceSceneByChapterId.get(sourceChapterId)
      if (!sourceScene?.content) return scene
      const content = countWords(scene.content || '') < 500 ? sourceScene.content : scene.content
      const wordHistory = Array.isArray(scene.wordHistory) && scene.wordHistory.length >= 8
        ? scene.wordHistory
        : remapExportValue(sourceScene.wordHistory || [], idMap)
      const lastHistoryEntry = wordHistory[wordHistory.length - 1]
      return {
        ...scene,
        content,
        wordHistory,
        lastModified: lastHistoryEntry?.timestamp || scene.lastModified || Date.now(),
      }
    }))
    if (canSyncCloud) {
      // `scenes` isn't covered by the per-collection debounced sync effects
      // (each scene syncs individually as it's edited in the manuscript UI),
      // so this bulk content upgrade needs an explicit push or the richer
      // seeded content stays local-only, same failure mode as the sample
      // project's initial creation above.
      const projectScenes = updatedScenes.filter(scene => scene.novelId === project.id)
      trackSync(upsertItems('scenes', userId, projectScenes)).catch(console.error)
    }
    const key = sampleProjectSeedKey(userId)
    if (key) writeItem(key, '1')
    return {
      ...project,
      coverPhoto: project.coverPhoto || lastEmberDemoProject.project.coverPhoto,
      bannerImage: project.bannerImage || lastEmberDemoProject.project.bannerImage,
    }
  }, [userId, commitLocal, canSyncCloud, trackSync])

  const ensureSampleProject = useCallback(() => {
    const key = sampleProjectSeedKey(userId)
    if (!key || novelsRef.current.length > 0 || readItem(key) === '1') return null
    const sample = buildSampleProjectData()
    writeItem(key, '1')
    commitLocal(novelsRef, setNovels, 'nf_novels', prev => [...prev, sample.project])
    commitLocal(actsRef, setActs, 'nf_acts', prev => [...prev, ...sample.acts])
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => [...prev, ...sample.chapters])
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => [...prev, ...sample.scenes])
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => [...prev, ...sample.characters])
    commitLocal(factionsRef, setFactions, 'nf_factions', prev => [...prev, ...sample.factions])
    commitLocal(locationsRef, setLocations, 'nf_locations', prev => [...prev, ...sample.locations])
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => [...prev, ...sample.loreEntries])
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => [...prev, ...sample.timeline])
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => [...prev, ...sample.worldHistory])
    setEras(prev => [...prev, ...sample.eras])
    commitLocal(mapsRef, setMaps, 'nf_maps', prev => [...prev, ...sample.maps])
    commitLocal(whiteboardsRef, setWhiteboards, 'nf_whiteboards', prev => [...prev, ...sample.whiteboards])
    commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => [...prev, ...sample.storySchedule])
    commitLocal(ideaEntriesRef, setIdeaEntries, 'nf_ideaEntries', prev => [...prev, ...sample.ideaEntries])
    commitLocal(rpgCharactersRef, setRpgCharacters, 'nf_rpg_characters', prev => [...prev, ...sample.rpgCharacters])
    if (canSyncCloud) {
      // Push the whole seeded world to Supabase immediately rather than
      // relying on the per-collection debounced sync effects below (which
      // only fire ~2s after the relevant state changes, and can miss this
      // write entirely if it lands before the account's initial cloud sync
      // has finished initializing). Without this, the sample project can
      // end up existing only in this browser's local storage — invisible,
      // with no warning, on any other device or after local data is cleared.
      trackSync(Promise.all([
        upsertItems('novels', userId, [sample.project]),
        upsertItems('acts', userId, sample.acts),
        upsertItems('chapters', userId, sample.chapters),
        upsertItems('scenes', userId, sample.scenes),
        upsertItems('characters', userId, sample.characters),
        upsertItems('factions', userId, sample.factions),
        upsertItems('locations', userId, sample.locations),
        upsertItems('lore_entries', userId, sample.loreEntries),
        upsertItems('timeline_events', userId, sample.timeline),
        upsertItems('world_history', userId, sample.worldHistory),
        upsertItems('eras', userId, sample.eras),
        upsertItems('maps_data', userId, sample.maps),
        upsertItems('whiteboards_data', userId, sample.whiteboards),
        upsertItems('story_schedule', userId, sample.storySchedule),
        upsertItems('idea_entries', userId, sample.ideaEntries),
        upsertItems('rpg_characters', userId, sample.rpgCharacters),
      ])).catch(console.error)
    }
    return sample.project
  }, [userId, canSyncCloud, commitLocal, trackSync])

  // Per-project read-only: free tier users can only edit their chosen project
  const readOnly = globalReadOnly || (
    freeProjectId !== null && activeNovelId !== null && activeNovelId !== freeProjectId
  )

  const storageExceededCheck = () => {
    if (!storageQuotaBytes) return false
    const used = storageUsedBytes
    if (used >= storageQuotaBytes) {
      notifyReadOnly('storage-exceeded', { usedBytes: used, quotaBytes: storageQuotaBytes })
      return true
    }
    return false
  }

  const readOnlyValue = (name) => {
    const reason = globalReadOnly ? 'trial-ended' : 'free-project'
    notifyReadOnly(reason)
    if (name.startsWith('add') || name === 'saveLocation' || name === 'saveFaction') return null
    return undefined
  }

  const api = {
    readOnly,
    freeProjectId,
    novels, activeNovelId, activeNovel, setActiveNovelId: selectActiveNovel, setDashboardActiveProject: selectDashboardActiveProject, addNovel, updateNovel, deleteNovel, importProjectFromData, ensureSampleProject, enrichSampleProject, getProjectExportData, getProjectContextData,
    series, addSeries, deleteSeries, updateSeries, updateSeriesContinuity, reorderSeries, reorderNovels,
    continuityRecords: {
      characters,
      factions,
      locations,
      loreEntries,
      timeline,
      worldHistory,
      maps,
    },
    allProjectStats, activeProjectStats,
    characters: scopedCharacters,
    saveCharacter, saveRelationship, saveCharacterJourney, updateCharacterJourneyForSeries, deleteCharacter,
    factions: novelFactions,
    saveFaction, deleteFaction,
    setFactions: setScopedFactions,
    locations: scopedLocations,
    saveLocation, deleteLocation,
    timeline: novelTimeline,
    addEvent, updateEvent, deleteEvent, linkTimelineHistory, unlinkTimelineHistory,
    worldHistory: novelWorldHistory,
    addHistoryEntry, updateHistoryEntry, deleteHistoryEntry,
    eras: novelEras, addEra, updateEra, deleteEra,
    currentYear: activeNovel?.currentYear ?? currentYear, updateCurrentYear,
    loreEntries: novelLoreEntries, addLoreEntry, updateLoreEntry, deleteLoreEntry,
    ideaEntries: novelIdeaEntries, addIdeaEntry, updateIdeaEntry, moveIdeaEntry, deleteIdeaEntry,
    whiteboard, updateWhiteboard, mapProject, updateMapProject, addMap, selectMap, deleteMap, renameMap, updateActiveMapData, updateMapData,
    addLocation: saveLocation,
    acts: novelActs, addAct, deleteAct, updateAct, reorderAct, moveAct,
    chapters: novelChapters, addChapter, deleteChapter, updateChapter, reorderChapter, moveChapter,
    scenes: novelScenes, addScene, deleteScene, updateScene, reorderScene, moveScene,
    retireManuscript, restoreManuscriptCopy,
    updateSceneContent,
    recordLocalWrite,
    sceneConflicts: novelSceneConflicts, restoreSceneConflict, discardSceneConflict,
    recordConflicts, restoreRecordConflict, discardRecordConflict, addRecordConflicts,
    selectedCharacterId, setSelectedCharacterId,
    selectedLocationId, setSelectedLocationId,
    selectedLoreEntryId, setSelectedLoreEntryId,
    selectedIdeaEntryId, setSelectedIdeaEntryId,
    selectedTimelineEventId,
    setSelectedTimelineEventId: selectTimelineEvent,
    selectedHistoryEntryId,
    setSelectedHistoryEntryId: selectHistoryEntry,
    selectedSceneId, setSelectedSceneId,
    writingSceneId, setWritingSceneId,
    storySchedule: novelStorySchedule, addScheduleEvent, updateScheduleEvent, deleteScheduleEvent,
    rpgCharacters: rpgCharacters.filter(c => c.novelId === activeNovelId).map(normalizeRpgCharacter),
    saveRpgCharacter, deleteRpgCharacter,
    comicPages: novelComicPages,
    comicPanels: novelComicPanels,
    addComicPage, updateComicPage, deleteComicPage, reorderComicPage, duplicateComicPage,
    addComicPanel, updateComicPanel, deleteComicPanel, reorderComicPanel,
    importData, replaceData, clearData, finishRemoteLoad,
    beginProjectImport, endProjectImport, restoreProjectSnapshot,
    getLocalSnapshot: getCurrentSnapshot,
    syncStatus, trackSync, flushPendingSync,
    localStorageWarning, localDataCorrupted,
    userId, storageQuotaBytes, storageUsedBytes, refreshStorageUsedBytes,
  }

  if (!readOnly) return api

  const guardedMethods = [
    'addNovel', 'updateNovel', 'deleteNovel', 'importProjectFromData', 'ensureSampleProject', 'enrichSampleProject', 'addSeries', 'deleteSeries', 'updateSeries', 'reorderSeries', 'reorderNovels',
    'saveCharacter', 'saveRelationship', 'saveCharacterJourney', 'deleteCharacter', 'setFactions', 'saveLocation', 'deleteLocation',
    'addEvent', 'updateEvent', 'deleteEvent', 'linkTimelineHistory', 'unlinkTimelineHistory', 'addHistoryEntry', 'updateHistoryEntry', 'deleteHistoryEntry',
    'addEra', 'updateEra', 'deleteEra',
    'updateCurrentYear', 'addLoreEntry', 'updateLoreEntry', 'deleteLoreEntry',
    'addIdeaEntry', 'updateIdeaEntry', 'moveIdeaEntry', 'deleteIdeaEntry', 'updateWhiteboard', 'updateMapProject',
    'addMap', 'deleteMap', 'renameMap', 'updateActiveMapData', 'updateMapData', 'addLocation',
    'addAct', 'deleteAct', 'updateAct', 'reorderAct', 'moveAct',
    'addChapter', 'deleteChapter', 'updateChapter', 'reorderChapter', 'moveChapter',
    'addScene', 'deleteScene', 'updateScene', 'reorderScene', 'moveScene', 'updateSceneContent',
    'retireManuscript', 'restoreManuscriptCopy',
    'restoreSceneConflict', 'discardSceneConflict', 'restoreRecordConflict', 'discardRecordConflict', 'addRecordConflicts',
    'addScheduleEvent', 'updateScheduleEvent', 'deleteScheduleEvent', 'replaceData',
    'saveRpgCharacter', 'deleteRpgCharacter',
    'addComicPage', 'updateComicPage', 'deleteComicPage', 'reorderComicPage', 'duplicateComicPage',
    'addComicPanel', 'updateComicPanel', 'deleteComicPanel', 'reorderComicPanel',
  ]

  const guardedApi = { ...api }
  guardedMethods.forEach(name => {
    guardedApi[name] = () => readOnlyValue(name)
  })
  return guardedApi
}
