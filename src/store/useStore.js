import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { upsertItems, deleteItem, deleteItemsByNovel, saveUserSettings, saveSceneDoc, deleteSceneDoc } from '../utils/firestoreSync'
import { buildProjectStats } from '../utils/projectStats'
import { getProjectType } from '../constants/projectTypes'
import { estimateStoreSize } from '../utils/storageQuota'
import { clearJourneyLinks } from '../utils/characterJourney'
import { STORAGE_MODES, loadStorageMode, saveLocalFirstSnapshot } from '../utils/storageMode'
import { loadValue, readItem, writeItem, removeItem } from '../storage/projectStorage'
import { registerSyncFlush, unregisterSyncFlush } from './syncFlushRegistry'
import { normalizeRpgCharacter } from '../components/characterbuilder/rpgData'

const load = (key, def) => loadValue(key, def)
const LOCAL_WRITE_AT_KEY = 'nf_localWriteAt'
const LOCAL_OWNER_KEY = 'nf_localOwner'
const LOCAL_WRITE_FAILED_KEY = 'nf_localWriteFailed'
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
const clearProjectLocalStorage = () => {
  try {
    PROJECT_STORAGE_KEYS.forEach(key => removeItem(key))
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
  refs.activeNovelIdRef.current = null
  refs.activeMapByNovelRef.current = {}
  refs.currentYearRef.current = 0
}
// Tracks which storage keys most recently failed to persist (e.g. quota
// exceeded). A stale key on disk must never be treated as "fresher than the
// cloud" during import reconciliation just because *some* other key's write
// happened to succeed and bumped nf_localWriteAt.
const readFailedWriteKeys = () => {
  try { return new Set(JSON.parse(readItem(LOCAL_WRITE_FAILED_KEY) || '[]')) }
  catch { return new Set() }
}
const markLocalWriteFailed = (key) => {
  try {
    const failed = readFailedWriteKeys()
    if (failed.has(key)) return
    failed.add(key)
    writeItem(LOCAL_WRITE_FAILED_KEY, JSON.stringify([...failed]))
  } catch { /* best effort */ }
}
const clearLocalWriteFailed = (key) => {
  try {
    const failed = readFailedWriteKeys()
    if (!failed.has(key)) return
    failed.delete(key)
    writeItem(LOCAL_WRITE_FAILED_KEY, JSON.stringify([...failed]))
  } catch { /* best effort */ }
}
const hasLocalWriteFailed = () => readFailedWriteKeys().size > 0
const save = (key, val) => {
  try {
    writeItem(key, JSON.stringify(val))
    clearLocalWriteFailed(key)
  } catch (error) {
    if (key === 'nf_novels' && Array.isArray(val)) {
      try {
        const withoutCovers = val.map(item => ({ ...item, coverPhoto: null }))
        writeItem(key, JSON.stringify(withoutCovers))
        clearLocalWriteFailed(key)
        console.warn('Project data was saved without cover photos because browser storage is full.', error)
        return
      } catch {
        // Fall through to the shared warning below.
      }
    }
    markLocalWriteFailed(key)
    console.warn(`Could not save ${key} to browser storage.`, error)
  }
}
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
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
  const persisted = load('nf_scenes', [])
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
  scenes: load('nf_scenes', []),
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
  const [scenes, setScenes] = useState(() => loadInitial('nf_scenes', []))
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
  const activeNovelIdRef = useRef(activeNovelId)
  const activeMapByNovelRef = useRef(activeMapByNovel)
  const currentYearRef = useRef(currentYear)

  const [selectedCharacterId, setSelectedCharacterId] = useState(null)
  const [selectedLocationId, setSelectedLocationId] = useState(null)
  const [selectedLoreEntryId, setSelectedLoreEntryId] = useState(null)
  const [selectedIdeaEntryId, setSelectedIdeaEntryId] = useState(null)
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState(null)
  const [selectedSceneId, setSelectedSceneId] = useState(null)
  // Which scene is open in writing mode — mirrored into the URL so a refresh
  // returns to the same scene instead of the top of the manuscript.
  const [writingSceneId, setWritingSceneId] = useState(null)

  // Track whether we're mid-import to suppress Firestore saves during bulk load
  const importing = useRef(false)
  const remoteReady = useRef(!userId)
  const previousUserId = useRef(userId)

  // Cloud sync status — surfaced to the desktop Storage settings UI (last synced/syncing/error).
  // pendingRef counts in-flight pushes so overlapping debounced saves settle into one
  // 'syncing' → 'synced' transition instead of flickering per-entity.
  const syncPendingRef = useRef(0)
  const [syncStatus, setSyncStatus] = useState({ state: 'idle', lastSyncedAt: null, lastError: null })

  // Surfaces a UI warning when browser storage (localStorage) can't keep up —
  // e.g. quota exceeded from many populated projects. save() flags failing
  // keys as it goes; poll rather than thread a setter through every call site.
  const [localStorageWarning, setLocalStorageWarning] = useState(() => hasLocalWriteFailed())
  useEffect(() => {
    const check = () => setLocalStorageWarning(hasLocalWriteFailed())
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
    clearProjectLocalStorage()
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

  const commitLocal = useCallback((ref, setter, key, updater) => {
    const next = typeof updater === 'function' ? updater(ref.current) : updater
    ref.current = next
    markLocalWrite(userId)
    save(key, next)
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
    if (canSyncCloud) trackSync(saveUserSettings(userId, settings)).catch(() => {})
    return settings
  }, [userId, canSyncCloud, trackSync])

  const selectActiveNovel = useCallback((id) => {
    const nextId = id ?? null
    saveSettingsNow({ activeNovelId: nextId })
    setActiveNovelId(nextId)
    setWritingSceneId(null)
  }, [saveSettingsNow])

  // localStorage persistence
  useEffect(() => { novelsRef.current = novels; save('nf_novels', novels) }, [novels])
  useEffect(() => { activeNovelIdRef.current = activeNovelId; save('nf_activeNovel', activeNovelId) }, [activeNovelId])
  useEffect(() => { charactersRef.current = characters; save('nf_characters', characters) }, [characters])
  useEffect(() => { factionsRef.current = factions; save('nf_factions', factions) }, [factions])
  useEffect(() => { locationsRef.current = locations; save('nf_locations', locations) }, [locations])
  useEffect(() => { timelineRef.current = timeline; save('nf_timeline', timeline) }, [timeline])
  useEffect(() => { worldHistoryRef.current = worldHistory; save('nf_worldHistory', worldHistory) }, [worldHistory])
  useEffect(() => { save('nf_eras', eras) }, [eras])
  useEffect(() => { currentYearRef.current = currentYear; save('nf_currentYear', currentYear) }, [currentYear])
  useEffect(() => { actsRef.current = acts; save('nf_acts', acts) }, [acts])
  useEffect(() => { chaptersRef.current = chapters; save('nf_chapters', chapters) }, [chapters])
  useEffect(() => { scenesRef.current = scenes; save('nf_scenes', scenes) }, [scenes])
  useEffect(() => { loreEntriesRef.current = loreEntries; save('nf_loreEntries', loreEntries) }, [loreEntries])
  useEffect(() => { ideaEntriesRef.current = ideaEntries; save('nf_ideaEntries', ideaEntries) }, [ideaEntries])
  useEffect(() => { mapsRef.current = maps; save('nf_maps', maps) }, [maps])
  useEffect(() => { activeMapByNovelRef.current = activeMapByNovel; save('nf_activeMapByNovel', activeMapByNovel) }, [activeMapByNovel])
  useEffect(() => { whiteboardsRef.current = whiteboards; save('nf_whiteboards', whiteboards) }, [whiteboards])
  useEffect(() => save('nf_series', series), [series])
  useEffect(() => { storyScheduleRef.current = storySchedule; save('nf_storySchedule', storySchedule) }, [storySchedule])
  useEffect(() => { rpgCharactersRef.current = rpgCharacters; save('nf_rpg_characters', rpgCharacters) }, [rpgCharacters])
  useEffect(() => { comicPagesRef.current = comicPages; save('nf_comicPages', comicPages) }, [comicPages])
  useEffect(() => { comicPanelsRef.current = comicPanels; save('nf_comicPanels', comicPanels) }, [comicPanels])

  // Debounced per-entity save — key is the table name
  const debouncedSaveItems = useMemo(
    () => createKeyedDebounce((table, uid, items) => trackSync(upsertItems(table, uid, items)).catch(() => {}), 2000),
    [trackSync]
  )

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
    return () => unregisterSyncFlush(flushPendingSync)
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
    const shouldPreferLocal = ownerMatchesCurrentUser && localWriteAt > remoteSavedAt && !hasLocalWriteFailed()
    const sourceData = shouldPreferLocal ? getLocalSnapshot() : data
    const resolvedActiveNovelId = shouldPreferLocal
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
        saveUserSettings(userId, { activeNovelId: snapshot.activeNovelId ?? null, currentYear: snapshot.currentYear ?? 0, activeMapByNovel: snapshot.activeMapByNovel ?? {} }),
        upsertItems('scenes', userId, snapshot.scenes ?? []),
      ])).catch(() => {})
    }
    markLocalOwner(userId)

    // Migrate orphan worldHistory entries into timeline so both sections share one store
    const rawTimeline = sourceData.timeline ?? []
    const rawHistory = sourceData.worldHistory ?? []
    const linkedHistoryIds = new Set(rawTimeline.map(e => e.worldHistoryEntryId).filter(Boolean))
    const orphans = rawHistory.filter(h => !h.timelineEventId && !linkedHistoryIds.has(h.id))
    const mergedTimeline = orphans.length > 0
      ? [
          ...rawTimeline,
          ...orphans.map(h => ({
            id: uid(),
            novelId: h.novelId,
            createdAt: h.createdAt,
            title: h.title,
            date: h.dateRange || '',
            era: h.era || '',
            description: h.content || '',
            category: h.category || '',
            tags: h.tags || [],
            linkedCharacters: [],
            linkedLocations: [],
          })),
        ]
      : rawTimeline

    setNovels(sourceData.novels ?? [])
    setCharacters(sourceData.characters ?? [])
    setFactions(sourceData.factions ?? [])
    setLocations(sourceData.locations ?? [])
    setTimeline(mergedTimeline)
    setWorldHistory(rawHistory)
    setActs(sourceData.acts ?? [])
    setChapters(sourceData.chapters ?? [])
    setScenes(sourceData.scenes ?? [])
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
    // Allow effects to settle before re-enabling Firestore saves
    setTimeout(() => {
      importing.current = false
      remoteReady.current = true
      if (canSyncCloud && healedRpgCharacterChanges.length) {
        trackSync(upsertItems('rpg_characters', userId, healedRpgCharacterChanges)).catch(() => {})
      }
    }, 500)
  }, [userId, canSyncCloud, trackSync])

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
    clearProjectLocalStorage()
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
      activeNovelIdRef,
      activeMapByNovelRef,
      currentYearRef,
    })
    setNovels([]); setCharacters([]); setFactions([]); setLocations([])
    setTimeline([]); setWorldHistory([]); setActs([]); setChapters([])
    setScenes([]); setLoreEntries([]); setIdeaEntries([]); setMaps([]); setActiveMapByNovel({}); setWhiteboards([]); setSeries([]); setStorySchedule([]); setRpgCharacters([]); setComicPages([]); setComicPanels([]); setCurrentYear(0); setActiveNovelId(null)
    setEras([])
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

  const saveSeriesSyncedItem = (ref, setter, category, data, id, buildNewItem) => {
    const config = SYNC_CATEGORY_CONFIG[category]
    if (!config) {
      commitLocal(ref, setter, '', prev => id
        ? prev.map(item => item.id === id ? { ...item, ...data } : item)
        : [...prev, buildNewItem()])
      return id
    }

    if (!id) {
      const created = buildNewItem()
      const item = { ...created, syncRootId: created.syncRootId || created.id }
      commitLocal(ref, setter, config.storageKey, prev => [...prev, item])
      return item
    }

    const existing = ref.current.find(item => item.id === id)
    if (!existing) return null
    const project = novels.find(n => n.id === activeNovelId) ?? activeNovel
    const projectSeries = project?.seriesId ? series.find(s => s.id === project.seriesId) : null
    const isSynced = Boolean(projectSeries?.syncCategories?.includes(category))

    if (!isSynced) {
      const updated = { ...existing, ...data }
      commitLocal(ref, setter, config.storageKey, prev => prev.map(item => item.id === id ? updated : item))
      return updated
    }

    const rootId = existing.syncRootId || existing.syncSourceId || existing.id
    const chain = getSyncChain(ref.current, category, existing)
    const forwardIds = getForwardProjectIds(activeNovelId, projectSeries)
    let target = chain.find(item => item.novelId === activeNovelId)
    const forkId = target?.id || uid()
    const fork = target
      ? { ...target, ...data, syncRootId: rootId, syncDeleted: false }
      : { ...existing, id: forkId, novelId: activeNovelId, syncRootId: rootId, syncSourceId: existing.id, syncHiddenInIds: [], syncDeleted: false, ...data }

    commitLocal(ref, setter, config.storageKey, prev => {
      const next = target ? prev : [...prev, fork]
      return next.map(item => {
        if (item.id === fork.id) return fork
        if (!forwardIds.has(item.novelId)) return item
        if (syncIdentity(item, category) !== syncIdentity(existing, category)) return item
        return { ...item, ...data, syncRootId: item.syncRootId || rootId, syncDeleted: false }
      })
    })

    return fork
  }

  const deleteSeriesSyncedItem = (ref, setter, category, id, options = {}) => {
    const config = SYNC_CATEGORY_CONFIG[category]
    const existing = ref.current.find(item => item.id === id)
    if (!existing || !config) return []
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
  const novelTimeline = seriesScope(timeline, 'timeline')
  const novelWorldHistory = seriesScope(worldHistory, 'worldhistory')
  const novelFactions = seriesScope(factions, 'factions')
  const novelLoreEntries = seriesScope(loreEntries, 'lore')
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
    if (!activeNovelId) return
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
    if (!activeNovelId) return
    setWhiteboards(prev => {
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
  }, [activeNovelId])

  const addAct = (title) => {
    if (storageExceededCheck()) { return null }
    const order = actsRef.current.filter(a => a.novelId === activeNovelId).length
    const newAct = { id: uid(), novelId: activeNovelId, title, synopsis: '', order }
    commitLocal(actsRef, setActs, 'nf_acts', prev => [...prev, newAct])
    return newAct
  }

  const addChapter = (actId, title) => {
    if (storageExceededCheck()) { return null }
    const order = chaptersRef.current.filter(c => c.novelId === activeNovelId).length
    const newChap = { id: uid(), novelId: activeNovelId, actId, title, synopsis: '', order }
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => [...prev, newChap])
    return newChap
  }

  const addScene = (chapterId, title) => {
    if (storageExceededCheck()) { return null }
    const newScene = {
      id: uid(),
      novelId: activeNovelId,
      chapterId,
      title,
      synopsis: '',
      content: '',
      order: scenesRef.current.filter(s => s.novelId === activeNovelId).length,
      lastModified: Date.now() // eslint-disable-line react-hooks/purity
    }
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => [...prev, newScene])
    if (canSyncCloud) saveSceneDoc(userId, newScene).catch(console.error)
    return newScene
  }

  const reorderAct = (id, direction) => {
    commitLocal(actsRef, setActs, 'nf_acts', prev => {
      const scoped = prev.filter(a => a.novelId === activeNovelId).sort((a, b) => a.order - b.order)
      const idx = scoped.findIndex(a => a.id === id)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= scoped.length) return prev
      const newOrder = scoped[swapIdx].order
      const oldOrder = scoped[idx].order
      return prev.map(a => {
        if (a.id === id) return { ...a, order: newOrder }
        if (a.id === scoped[swapIdx].id) return { ...a, order: oldOrder }
        return a
      })
    })
  }

  const moveAct = useCallback((actId, toIndex) => {
    commitLocal(actsRef, setActs, 'nf_acts', prev => {
      const scoped = prev.filter(a => a.novelId === activeNovelId).sort((a, b) => a.order - b.order)
      const others = prev.filter(a => a.novelId !== activeNovelId)
      const fromIndex = scoped.findIndex(a => a.id === actId)
      if (fromIndex === -1) return prev
      const reordered = [...scoped]
      const [item] = reordered.splice(fromIndex, 1)
      const clampedTo = Math.max(0, Math.min(toIndex, reordered.length))
      reordered.splice(clampedTo, 0, item)
      return [...others, ...reordered.map((a, i) => ({ ...a, order: i }))]
    })
  }, [activeNovelId, commitLocal])

  const reorderChapter = (id, direction) => {
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => {
      const chapter = prev.find(c => c.id === id)
      if (!chapter) return prev
      const scoped = prev.filter(c => c.actId === chapter.actId).sort((a, b) => a.order - b.order)
      const idx = scoped.findIndex(c => c.id === id)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= scoped.length) return prev
      const newOrder = scoped[swapIdx].order
      const oldOrder = scoped[idx].order
      return prev.map(c => {
        if (c.id === id) return { ...c, order: newOrder }
        if (c.id === scoped[swapIdx].id) return { ...c, order: oldOrder }
        return c
      })
    })
  }

  const moveChapter = useCallback((chapterId, toActId, toIndex) => {
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => {
      const chapter = prev.find(c => c.id === chapterId)
      if (!chapter) return prev
      const updatedChapter = { ...chapter, actId: toActId }
      const destChaps = prev.filter(c => c.actId === toActId && c.id !== chapterId).sort((a, b) => a.order - b.order)
      const clampedTo = Math.max(0, Math.min(toIndex, destChaps.length))
      const reinserted = [...destChaps.slice(0, clampedTo), updatedChapter, ...destChaps.slice(clampedTo)]
        .map((c, i) => ({ ...c, order: i }))
      if (chapter.actId !== toActId) {
        const srcChaps = prev.filter(c => c.actId === chapter.actId && c.id !== chapterId)
          .sort((a, b) => a.order - b.order).map((c, i) => ({ ...c, order: i }))
        const others = prev.filter(c => c.actId !== toActId && c.actId !== chapter.actId)
        return [...others, ...srcChaps, ...reinserted]
      }
      const others = prev.filter(c => c.actId !== toActId)
      return [...others, ...reinserted]
    })
  }, [commitLocal])

  const reorderScene = (id, direction) => {
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      const scene = prev.find(s => s.id === id)
      if (!scene) return prev
      const scoped = prev.filter(s => s.chapterId === scene.chapterId).sort((a, b) => a.order - b.order)
      const idx = scoped.findIndex(s => s.id === id)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= scoped.length) return prev
      const newOrder = scoped[swapIdx].order
      const oldOrder = scoped[idx].order
      return prev.map(s => {
        if (s.id === id) return { ...s, order: newOrder }
        if (s.id === scoped[swapIdx].id) return { ...s, order: oldOrder }
        return s
      })
    })
  }

  const moveScene = useCallback((sceneId, toChapterId, toIndex) => {
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      const scene = prev.find(s => s.id === sceneId)
      if (!scene) return prev
      const updatedScene = { ...scene, chapterId: toChapterId }
      const destScenes = prev.filter(s => s.chapterId === toChapterId && s.id !== sceneId).sort((a, b) => a.order - b.order)
      const clampedTo = Math.max(0, Math.min(toIndex, destScenes.length))
      const reinserted = [...destScenes.slice(0, clampedTo), updatedScene, ...destScenes.slice(clampedTo)]
        .map((s, i) => ({ ...s, order: i }))
      if (scene.chapterId !== toChapterId) {
        const srcScenes = prev.filter(s => s.chapterId === scene.chapterId && s.id !== sceneId)
          .sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, order: i }))
        const others = prev.filter(s => s.chapterId !== toChapterId && s.chapterId !== scene.chapterId)
        return [...others, ...srcScenes, ...reinserted]
      }
      const others = prev.filter(s => s.chapterId !== toChapterId)
      return [...others, ...reinserted]
    })
  }, [commitLocal])

  const updateSceneContent = useCallback((sceneId, content) => {
    const nextScenes = commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      return mergeSceneUpdateWithPersistedCopy(prev, sceneId, s => {
        const updated = withSceneContentHistory(s, content)
        if (canSyncCloud) debouncedSaveScene(sceneId, userId, updated)
        return updated
      })
    })
    if (canSyncCloud) {
      nextScenes
        .filter(scene => scene.conflictOf === sceneId)
        .forEach(scene => saveSceneDoc(userId, scene).catch(console.error))
    }
  }, [userId, canSyncCloud, debouncedSaveScene, commitLocal])

  const deleteAct = (id) => {
    const chapterIds = chaptersRef.current.filter(c => c.actId === id).map(c => c.id)
    const sceneIds = scenesRef.current.filter(s => chapterIds.includes(s.chapterId)).map(s => s.id)
    sceneIds.forEach(sceneId => debouncedSaveScene.cancel(sceneId))
    if (canSyncCloud) {
      deleteItem('acts', userId, id).catch(console.error)
      chapterIds.forEach(cId => deleteItem('chapters', userId, cId).catch(console.error))
    }
    commitLocal(actsRef, setActs, 'nf_acts', prev => prev.filter(a => a.id !== id))
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => prev.filter(c => c.actId !== id))
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      return prev.filter(s => {
        const keep = !sceneIds.includes(s.id)
        if (!keep && canSyncCloud) deleteSceneDoc(userId, s.id).catch(console.error)
        return keep
      })
    })
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character => character.journey ? {
      ...character,
      journey: clearJourneyLinks(character.journey, { chapterIds, sceneIds }),
    } : character))
  }
  const deleteChapter = (id) => {
    const sceneIds = scenesRef.current.filter(s => s.chapterId === id).map(s => s.id)
    sceneIds.forEach(sceneId => debouncedSaveScene.cancel(sceneId))
    if (canSyncCloud) deleteItem('chapters', userId, id).catch(console.error)
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => prev.filter(c => c.id !== id))
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      return prev.filter(s => {
        const keep = !sceneIds.includes(s.id)
        if (!keep && canSyncCloud) deleteSceneDoc(userId, s.id).catch(console.error)
        return keep
      })
    })
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character => character.journey ? {
      ...character,
      journey: clearJourneyLinks(character.journey, { chapterIds: [id], sceneIds }),
    } : character))
  }
  const deleteScene = (id) => {
    debouncedSaveScene.cancel(id)
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => prev.filter(s => s.id !== id))
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character => character.journey ? {
      ...character,
      journey: clearJourneyLinks(character.journey, { sceneIds: [id] }),
    } : character))
    if (canSyncCloud) deleteSceneDoc(userId, id).catch(console.error)
  }
  const updateAct = (id, data) => commitLocal(actsRef, setActs, 'nf_acts', prev => prev.map(a => a.id === id ? { ...a, ...data } : a))
  const updateChapter = (id, data) => commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => prev.map(c => c.id === id ? { ...c, ...data } : c))
  const updateScene = (id, data) => {
    const nextScenes = commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      return mergeSceneUpdateWithPersistedCopy(prev, id, s => {
        const hasContent = Object.prototype.hasOwnProperty.call(data, 'content')
        const updated = hasContent && data.content !== s.content
          ? withSceneContentHistory({ ...s, ...data }, data.content)
          : { ...s, ...data }
        if (canSyncCloud) debouncedSaveScene(id, userId, updated)
        return updated
      })
    })
    if (canSyncCloud && Object.prototype.hasOwnProperty.call(data, 'content')) {
      nextScenes
        .filter(scene => scene.conflictOf === id)
        .forEach(scene => saveSceneDoc(userId, scene).catch(console.error))
    }
  }

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

  const saveCharacter = (data, id) => {
    if (!id && storageExceededCheck()) { return null }
    const characterId = id || uid()
    const childIds = data.childIds || []
    const parentIds = data.parentIds || []
    const spouseIds = data.spouseIds || []
    const saved = saveSeriesSyncedItem(
      charactersRef,
      setCharacters,
      'characters',
      data,
      id,
      () => ({ id: characterId, novelId: activeNovelId, ...data })
    )
    const savedId = saved?.id || characterId

    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => {
      const next = prev

      return next.map(c => {
        if (c.id === savedId || c.novelId !== activeNovelId) return c
        let updated = c
        let changed = false

        // childIds → sync parentIds on children
        const cParents = updated.parentIds || []
        const shouldBeChild = childIds.includes(c.id)
        if (shouldBeChild && !cParents.includes(savedId)) {
          updated = { ...updated, parentIds: [...cParents, savedId] }
          changed = true
        } else if (!shouldBeChild && cParents.includes(savedId)) {
          updated = { ...updated, parentIds: cParents.filter(p => p !== savedId) }
          changed = true
        }

        // parentIds → sync childIds on parents
        const cChildren = updated.childIds || []
        const shouldBeParent = parentIds.includes(c.id)
        if (shouldBeParent && !cChildren.includes(savedId)) {
          updated = { ...updated, childIds: [...cChildren, savedId] }
          changed = true
        } else if (!shouldBeParent && cChildren.includes(savedId)) {
          updated = { ...updated, childIds: cChildren.filter(ch => ch !== savedId) }
          changed = true
        }

        // spouseIds → sync bidirectionally
        const cSpouses = updated.spouseIds || []
        const shouldBeSpouse = spouseIds.includes(c.id)
        if (shouldBeSpouse && !cSpouses.includes(savedId)) {
          updated = { ...updated, spouseIds: [...cSpouses, savedId] }
          changed = true
        } else if (!shouldBeSpouse && cSpouses.includes(savedId)) {
          updated = { ...updated, spouseIds: cSpouses.filter(s => s !== savedId) }
          changed = true
        }

        return changed ? updated : c
      })
    })
    return savedId
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
    const deletedIds = deleteSeriesSyncedItem(charactersRef, setCharacters, 'characters', id, options)
    const deletedSet = new Set(deletedIds.length ? deletedIds : [id])
    if (canSyncCloud) [...deletedSet].forEach(dId => deleteItem('characters', userId, dId).catch(console.error))
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => {
      return prev
        .map(c => ({
          ...c,
          childIds: (c.childIds || []).filter(childId => !deletedSet.has(childId)),
          parentIds: (c.parentIds || []).filter(parentId => !deletedSet.has(parentId)),
          spouseIds: (c.spouseIds || []).filter(spouseId => !deletedSet.has(spouseId)),
          relationships: (c.relationships || []).filter(rel => !deletedSet.has(rel.targetId)),
          ...(c.journey ? { journey: clearJourneyLinks(c.journey, { characterIds: [...deletedSet] }) } : {}),
        }))
    })
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => {
      return prev.map(entry => ({
        ...entry,
        characterIds: (entry.characterIds || []).filter(characterId => !deletedSet.has(characterId)),
      }))
    })
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => {
      return prev.map(event => ({
        ...event,
        linkedCharacters: (event.linkedCharacters || []).filter(characterId => !deletedSet.has(characterId)),
      }))
    })
  }

  const saveRpgCharacter = (data, id) => {
    const characterId = id || uid()
    commitLocal(rpgCharactersRef, setRpgCharacters, 'nf_rpg_characters', prev => {
      if (id) return prev.map(c => c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c)
      return [...prev, normalizeRpgCharacter({ ...data, id: characterId, novelId: activeNovelId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })]
    })
    return characterId
  }

  const deleteRpgCharacter = (id) => {
    if (canSyncCloud) deleteItem('rpg_characters', userId, id).catch(console.error)
    commitLocal(rpgCharactersRef, setRpgCharacters, 'nf_rpg_characters', prev => prev.filter(c => c.id !== id))
  }

  const saveFaction = (data, id) => {
    if (!id && storageExceededCheck()) { return null }
    const factionId = id || uid()
    return saveSeriesSyncedItem(
      factionsRef,
      setFactions,
      'factions',
      data,
      id,
      () => ({ id: factionId, novelId: activeNovelId, ...data })
    )
  }

  const deleteFaction = (id, options = {}) => {
    const deletedIds = deleteSeriesSyncedItem(factionsRef, setFactions, 'factions', id, options)
    const deletedSet = new Set(deletedIds.length ? deletedIds : [id])
    if (canSyncCloud) [...deletedSet].forEach(dId => deleteItem('factions', userId, dId).catch(console.error))
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character =>
      deletedSet.has(character.factionId) ? { ...character, factionId: '' } : character
    ))
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
    const deletedSet = new Set(deletedIds.length ? deletedIds : [id])
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
  }

  const addEvent = (data, options = {}) => {
    if (storageExceededCheck()) { return null }
    const eventId = uid()
    const shouldCreateHistory = options.createHistory !== false && !data.linkedHistoryEntryId
    const historyId = data.linkedHistoryEntryId || (shouldCreateHistory ? uid() : null)
    const createdAt = Date.now() // eslint-disable-line react-hooks/purity
    const event = { id: eventId, novelId: activeNovelId, syncRootId: eventId, createdAt, ...data, worldHistoryEntryId: historyId }
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => [...prev, event])
    if (data.linkedHistoryEntryId) {
      commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => {
        return prev.map(h => h.id === data.linkedHistoryEntryId
        ? { ...h, timelineEventId: eventId }
        : h
        )
      })
    } else if (shouldCreateHistory) {
      const historyEntry = {
        id: historyId,
        novelId: activeNovelId,
        syncRootId: historyId,
        createdAt,
        timelineEventId: eventId,
        title: data.title ?? '',
        era: data.era ?? '',
        dateRange: data.date ?? data.dateRange ?? '',
        content: data.description ?? data.content ?? '',
        category: data.category ?? data.type ?? '',
        tags: data.tags ?? [],
      }
      commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => [...prev, historyEntry])
    }
    return event
  }
  const updateEvent = (id, data) => {
    const linkedHistoryId = data.linkedHistoryEntryId ?? data.worldHistoryEntryId
    const savedEvent = saveSeriesSyncedItem(
      timelineRef,
      setTimeline,
      'timeline',
      { ...data, worldHistoryEntryId: linkedHistoryId },
      id,
      () => ({ id: uid(), novelId: activeNovelId, createdAt: Date.now(), ...data, worldHistoryEntryId: linkedHistoryId })
    )
    const savedEventId = savedEvent?.id || id
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => {
      return prev.map(h => {
        if (linkedHistoryId && h.timelineEventId === savedEventId && h.id !== linkedHistoryId) {
          return { ...h, timelineEventId: null }
        }
        if (h.timelineEventId === savedEventId || (linkedHistoryId && h.id === linkedHistoryId)) {
          return {
            ...h,
            timelineEventId: savedEventId,
            title: data.title ?? h.title,
            era: data.era ?? h.era,
            dateRange: data.date ?? data.dateRange ?? h.dateRange,
            content: data.description ?? data.content ?? h.content,
            category: data.category ?? data.type ?? h.category,
            tags: data.tags ?? h.tags,
          }
        }
        return h
      })
    })
    return savedEvent
  }
  const deleteEvent = (id, options = {}) => {
    const deletedIds = deleteSeriesSyncedItem(timelineRef, setTimeline, 'timeline', id, options)
    const deletedSet = new Set(deletedIds.length ? deletedIds : [id])
    if (canSyncCloud) [...deletedSet].forEach(dId => deleteItem('timeline_events', userId, dId).catch(console.error))
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => prev.map(h => deletedSet.has(h.timelineEventId) ? { ...h, timelineEventId: null } : h))
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.map(character => character.journey ? {
      ...character,
      journey: clearJourneyLinks(character.journey, { timelineEventIds: [...deletedSet] }),
    } : character))
  }

  const addScheduleEvent = (data) => {
    if (storageExceededCheck()) { return null }
    const entry = { id: uid(), novelId: activeNovelId, createdAt: Date.now(), category: 'scene', duration: 1, tags: [], linkedCharacters: [], linkedLocations: [], ...data } // eslint-disable-line react-hooks/purity
    commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => [...prev, entry])
    return entry
  }
  const updateScheduleEvent = (id, data) => commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => prev.map(e => e.id === id ? { ...e, ...data } : e))
  const deleteScheduleEvent = (id) => {
    if (canSyncCloud) deleteItem('story_schedule', userId, id).catch(console.error)
    commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => prev.filter(e => e.id !== id))
  }

  const addHistoryEntry = (data, options = {}) => {
    if (storageExceededCheck()) { return null }
    const createdAt = Date.now() // eslint-disable-line react-hooks/purity
    const timelineEventId = data.linkedTimelineEventId || data.timelineEventId || null
    const entryId = uid()
    const entry = { id: entryId, novelId: activeNovelId, syncRootId: entryId, createdAt, ...data, timelineEventId }
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => [...prev, entry])
    if (timelineEventId) {
      commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => prev.map(e => e.id === timelineEventId ? { ...e, worldHistoryEntryId: entry.id } : e))
    } else if (options.createTimeline) {
      const eventId = uid()
      const event = {
        id: eventId,
        novelId: activeNovelId,
        syncRootId: eventId,
        createdAt,
        title: data.title ?? '',
        date: data.dateRange ?? data.date ?? '',
        description: data.content ?? data.description ?? '',
        category: data.category ?? data.type ?? '',
        tags: data.tags ?? [],
        linkedCharacters: [],
        linkedLocations: [],
        worldHistoryEntryId: entryId,
      }
      const linkedEntry = { ...entry, timelineEventId: eventId }
      commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => [...prev, event])
      commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => prev.map(h => h.id === entryId ? linkedEntry : h))
    }
    return entry
  }
  const updateHistoryEntry = (id, data) => {
    const linkedTimelineId = data.linkedTimelineEventId ?? data.timelineEventId
    const savedHistory = saveSeriesSyncedItem(
      worldHistoryRef,
      setWorldHistory,
      'worldhistory',
      { ...data, timelineEventId: linkedTimelineId },
      id,
      () => ({ id: uid(), novelId: activeNovelId, createdAt: Date.now(), ...data, timelineEventId: linkedTimelineId })
    )
    const savedHistoryId = savedHistory?.id || id
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => {
      return prev.map(e => {
        if (linkedTimelineId && e.id === linkedTimelineId) return { ...e, worldHistoryEntryId: savedHistoryId }
        if (e.worldHistoryEntryId === savedHistoryId && linkedTimelineId && e.id !== linkedTimelineId) return { ...e, worldHistoryEntryId: null }
        if (e.worldHistoryEntryId === savedHistoryId) {
          return {
            ...e,
            title: data.title ?? e.title,
            date: data.dateRange ?? data.date ?? e.date,
            description: data.content ?? data.description ?? e.description,
            category: data.category ?? data.type ?? e.category,
            tags: data.tags ?? e.tags,
          }
        }
        return e
      })
    })
    return savedHistory
  }
  const deleteHistoryEntry = (id, options = {}) => {
    const deletedIds = deleteSeriesSyncedItem(worldHistoryRef, setWorldHistory, 'worldhistory', id, options)
    const deletedSet = new Set(deletedIds.length ? deletedIds : [id])
    if (canSyncCloud) [...deletedSet].forEach(dId => deleteItem('world_history', userId, dId).catch(console.error))
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => prev.map(e => deletedSet.has(e.worldHistoryEntryId) ? { ...e, worldHistoryEntryId: null } : e))
  }
  const linkTimelineHistory = (timelineEventId, historyEntryId) => {
    if (!timelineEventId || !historyEntryId) return
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => prev.map(e => e.id === timelineEventId ? { ...e, worldHistoryEntryId: historyEntryId } : e))
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => prev.map(h => h.id === historyEntryId ? { ...h, timelineEventId } : (h.timelineEventId === timelineEventId ? { ...h, timelineEventId: null } : h)))
  }
  const unlinkTimelineHistory = (timelineEventId, historyEntryId) => {
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => prev.map(e => e.id === timelineEventId ? { ...e, worldHistoryEntryId: null } : e))
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => prev.map(h => h.id === historyEntryId ? { ...h, timelineEventId: null } : h))
  }

  const addLoreEntry = (data) => {
    if (storageExceededCheck()) { return null }
    const id = uid()
    const entry = { id, novelId: activeNovelId, syncRootId: id, createdAt: Date.now(), characterIds: [], category: '', content: '', ...data } // eslint-disable-line react-hooks/purity
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => [...prev, entry])
    return entry
  }
  const updateLoreEntry = (id, data) => saveSeriesSyncedItem(loreEntriesRef, setLoreEntries, 'lore', data, id, () => ({ id: uid(), novelId: activeNovelId, createdAt: Date.now(), characterIds: [], category: '', content: '', ...data }))
  const deleteLoreEntry = (id, options = {}) => {
    const deletedIds = deleteSeriesSyncedItem(loreEntriesRef, setLoreEntries, 'lore', id, options)
    const deletedSet = new Set(deletedIds.length ? deletedIds : [id])
    if (canSyncCloud) [...deletedSet].forEach(dId => deleteItem('lore_entries', userId, dId).catch(console.error))
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => {
      return prev.map(entry => ({
        ...entry,
        loreIds: (entry.loreIds || []).filter(loreId => !deletedSet.has(loreId)),
      }))
    })
  }

  const addIdeaEntry = (data) => {
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
      order: ideaEntriesRef.current.filter(entry => entry.novelId === activeNovelId).length,
      isFavourite: false,
      isPinned: false,
      aiExpanded: false,
      linkedEntities: [],
      linkedIdeas: [],
      convertedTo: null,
      ...data,
    }
    entry.syncRootId = entry.id
    commitLocal(ideaEntriesRef, setIdeaEntries, 'nf_ideaEntries', prev => [...prev, entry])
    return entry
  }
  const updateIdeaEntry = (id, data) => saveSeriesSyncedItem(ideaEntriesRef, setIdeaEntries, 'ideas', data, id, () => ({ id: uid(), novelId: activeNovelId, createdAt: Date.now(), updatedAt: Date.now(), title: '', description: '', body: '', group: '', tags: [], status: 'raw', order: 0, isFavourite: false, isPinned: false, aiExpanded: false, linkedEntities: [], linkedIdeas: [], convertedTo: null, ...data }))
  const deleteIdeaEntry = (id, options = {}) => {
    const deletedIds = deleteSeriesSyncedItem(ideaEntriesRef, setIdeaEntries, 'ideas', id, options)
    if (canSyncCloud) (deletedIds.length ? deletedIds : [id]).forEach(dId => deleteItem('idea_entries', userId, dId).catch(console.error))
  }

  const addMap = (name, mapType, options = {}) => {
    if (storageExceededCheck()) { return null }
    const normalizedMapType = mapType || 'region'
    const isInterior = normalizedMapType === 'interior'
    const isCampaignInterior = ['dnd_campaign', 'tabletop_rpg'].includes(activeNovel?.type)
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
      novelId: activeNovelId,
      name,
      mapType: normalizedMapType,
      mapPins: [],
      mapRegions: [],
      mapObjects: [],
      mapLayers: [],
      metadata,
      created: Date.now(), // eslint-disable-line react-hooks/purity
    }
    setMaps(prev => [...prev, map])
    setActiveMapByNovel(prev => ({ ...prev, [activeNovelId]: map.id }))
    return map.id
  }

  const selectMap = (mapId) => {
    setActiveMapByNovel(prev => ({ ...prev, [activeNovelId]: mapId }))
  }

  const deleteMap = (mapId) => {
    if (canSyncCloud) deleteItem('maps_data', userId, mapId).catch(console.error)
    setMaps(prev => prev.filter(m => m.id !== mapId))
    setActiveMapByNovel(prev => {
      if (prev[activeNovelId] !== mapId) return prev
      const nextMap = maps.find(m => m.novelId === activeNovelId && m.id !== mapId)
      return { ...prev, [activeNovelId]: nextMap?.id || null }
    })
  }

  const renameMap = (mapId, name) => {
    setMaps(prev => prev.map(m => m.id === mapId ? { ...m, name } : m))
  }

  const updateActiveMapData = (updater) => {
    const currentActiveMapId = activeMapByNovel[activeNovelId] ?? maps.find(m => m.novelId === activeNovelId)?.id
    if (!currentActiveMapId) return
    setMaps(prev => prev.map(m => {
      if (m.id !== currentActiveMapId) return m
      const patch = updater(m) || {}
      delete patch.mapData
      delete patch.mapOverlay
      return { ...m, ...patch }
    }))
  }

  const updateCurrentYear = (value) => {
    const next = Number(value)
    const normalized = Number.isFinite(next) ? next : 0
    if (activeNovelId) {
      setNovels(prev => prev.map(n => n.id === activeNovelId ? { ...n, currentYear: normalized } : n))
    } else {
      setCurrentYear(normalized)
    }
  }

  // Comic page CRUD
  const novelComicPages = comicPages.filter(p => p.novelId === activeNovelId)
  const novelComicPanels = comicPanels.filter(p => p.novelId === activeNovelId)

  const addComicPage = (issueId, data = {}) => {
    const pagesInIssue = comicPagesRef.current.filter(p => p.novelId === activeNovelId && p.issueId === issueId)
    const page = {
      id: uid(),
      novelId: activeNovelId,
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
      ...data,
    }
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev => [...prev, page])
    return page
  }

  const updateComicPage = (pageId, data) => {
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev =>
      prev.map(p => p.id === pageId ? { ...p, ...data, updatedAt: new Date().toISOString() } : p)
    )
  }

  const deleteComicPage = (pageId) => {
    if (canSyncCloud) {
      deleteItem('comic_pages', userId, pageId).catch(console.error)
      comicPanelsRef.current.filter(p => p.pageId === pageId).forEach(p => deleteItem('comic_panels', userId, p.id).catch(console.error))
    }
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev => prev.filter(p => p.id !== pageId))
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => prev.filter(p => p.pageId !== pageId))
  }

  const reorderComicPage = (issueId, orderedIds) => {
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev => {
      const inIssue = new Map(prev.filter(p => p.issueId === issueId).map(p => [p.id, p]))
      const rest = prev.filter(p => p.issueId !== issueId)
      const reordered = orderedIds.map((id, i) => inIssue.has(id) ? { ...inIssue.get(id), order: i } : null).filter(Boolean)
      return [...rest, ...reordered]
    })
  }

  const duplicateComicPage = (pageId) => {
    const src = comicPagesRef.current.find(p => p.id === pageId)
    if (!src) return null
    const newPageId = uid()
    const pagesInIssue = comicPagesRef.current.filter(p => p.issueId === src.issueId)
    const newPage = { ...src, id: newPageId, order: pagesInIssue.length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const srcPanels = comicPanelsRef.current.filter(p => p.pageId === pageId)
    const newPanels = srcPanels.map(p => ({ ...p, id: uid(), pageId: newPageId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev => [...prev, newPage])
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => [...prev, ...newPanels])
    return newPage
  }

  // Comic panel CRUD
  const addComicPanel = (pageId, data = {}) => {
    const panelsOnPage = comicPanelsRef.current.filter(p => p.pageId === pageId)
    const panel = {
      id: uid(),
      novelId: activeNovelId,
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
      ...data,
    }
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => [...prev, panel])
    return panel
  }

  const updateComicPanel = (panelId, data) => {
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev =>
      prev.map(p => p.id === panelId ? { ...p, ...data, updatedAt: new Date().toISOString() } : p)
    )
  }

  const deleteComicPanel = (panelId) => {
    if (canSyncCloud) deleteItem('comic_panels', userId, panelId).catch(console.error)
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => prev.filter(p => p.id !== panelId))
  }

  const reorderComicPanel = (pageId, orderedIds) => {
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => {
      const onPage = new Map(prev.filter(p => p.pageId === pageId).map(p => [p.id, p]))
      const rest = prev.filter(p => p.pageId !== pageId)
      const reordered = orderedIds.map((id, i) => onPage.has(id) ? { ...onPage.get(id), order: i } : null).filter(Boolean)
      return [...rest, ...reordered]
    })
  }

  const addNovel = (data) => {
    if (freeProjectId !== null) {
      notifyReadOnly('free-limit')
      return null
    }
    if (storageExceededCheck()) { return null }
    const novel = { id: uid(), createdAt: new Date().toISOString(), ...data }
    const starter = buildStarterStructure(novel.id, novel.type)
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
    if (isFreeLockedProject(id)) { notifyReadOnly('free-project'); return }
    commitLocal(novelsRef, setNovels, 'nf_novels', prev => prev.map(n => n.id === id ? { ...n, ...data } : n))
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

  const novelEras = eras.filter(e => e.novelId === activeNovelId)

  const addEra = (data) => {
    const era = { id: uid(), novelId: activeNovelId, createdAt: Date.now(), ...data } // eslint-disable-line react-hooks/purity
    setEras(prev => [...prev, era])
    return era
  }
  const updateEra = (id, data) => setEras(prev => prev.map(e => e.id === id ? { ...e, ...data } : e))
  const deleteEra = (id) => {
    if (canSyncCloud) deleteItem('eras', userId, id).catch(console.error)
    setEras(prev => prev.filter(e => e.id !== id))
    // clear era reference from timeline entries
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev =>
      prev.map(e => e.eraId === id ? { ...e, eraId: null, era: '' } : e)
    )
  }

  const addSeries = (name) => {
    const s = { id: uid(), name, createdAt: new Date().toISOString() }
    setSeries(prev => [...prev, s])
    return s
  }
  const deleteSeries = (id) => {
    if (canSyncCloud) deleteItem('series_items', userId, id).catch(console.error)
    setSeries(prev => prev.filter(s => s.id !== id))
    setNovels(prev => prev.map(n => n.seriesId === id ? { ...n, seriesId: null } : n))
  }
  const updateSeries = (id, data) => setSeries(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))
  const updateSeriesContinuity = (id, patch) => setSeries(prev => prev.map(s => s.id === id ? {
    ...s,
    continuity: {
      ...(s.continuity || {}),
      ...patch,
    },
    updatedAt: new Date().toISOString(),
  } : s))
  const reorderSeries = (orderedIds) => setSeries(prev => {
    const map = new Map(prev.map(s => [s.id, s]))
    return orderedIds.map(id => map.get(id)).filter(Boolean)
  })
  const reorderNovels = (orderedIds) => setNovels(prev => {
    const map = new Map(prev.map(n => [n.id, n]))
    return orderedIds.map(id => map.get(id)).filter(Boolean)
  })
  const deleteNovel = (id) => {
    if (isFreeLockedProject(id)) { notifyReadOnly('free-project'); return }
    const updatedNovels = novelsRef.current.filter(n => n.id !== id)
    commitLocal(novelsRef, setNovels, 'nf_novels', updatedNovels)
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => prev.filter(c => c.novelId !== id))
    commitLocal(factionsRef, setFactions, 'nf_factions', prev => prev.filter(f => f.novelId !== id))
    commitLocal(locationsRef, setLocations, 'nf_locations', prev => prev.filter(l => l.novelId !== id))
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => prev.filter(e => e.novelId !== id))
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => prev.filter(h => h.novelId !== id))
    commitLocal(actsRef, setActs, 'nf_acts', prev => prev.filter(a => a.novelId !== id))
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => prev.filter(c => c.novelId !== id))
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      const toDelete = prev.filter(s => s.novelId === id)
      if (canSyncCloud) toDelete.forEach(s => deleteSceneDoc(userId, s.id).catch(console.error))
      return prev.filter(s => s.novelId !== id)
    })
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
  }

  const importProjectFromData = (data) => {
    if (freeProjectId !== null) {
      notifyReadOnly('free-limit')
      return null
    }
    if (storageExceededCheck()) { return null }
    const oldId = data.project?.id
    const newId = uid()
    const remap = (item) => item?.novelId === oldId ? { ...item, novelId: newId } : item
    const project = { ...data.project, id: newId, importedAt: new Date().toISOString(), focus: false }
    commitLocal(novelsRef, setNovels, 'nf_novels', prev => [...prev, project])
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => [...prev, ...(data.characters ?? []).map(remap)])
    commitLocal(factionsRef, setFactions, 'nf_factions', prev => [...prev, ...(data.factions ?? []).map(remap)])
    commitLocal(locationsRef, setLocations, 'nf_locations', prev => [...prev, ...(data.locations ?? []).map(remap)])
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => [...prev, ...(data.timeline ?? []).map(remap)])
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => [...prev, ...(data.worldHistory ?? []).map(remap)])
    commitLocal(actsRef, setActs, 'nf_acts', prev => [...prev, ...(data.acts ?? []).map(remap)])
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => [...prev, ...(data.chapters ?? []).map(remap)])
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => [...prev, ...(data.scenes ?? []).map(remap)])
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => [...prev, ...(data.loreEntries ?? []).map(remap)])
    commitLocal(ideaEntriesRef, setIdeaEntries, 'nf_ideaEntries', prev => [...prev, ...(data.ideaEntries ?? []).map(remap)])
    commitLocal(mapsRef, setMaps, 'nf_maps', prev => [...prev, ...(data.maps ?? []).map(remap)])
    commitLocal(whiteboardsRef, setWhiteboards, 'nf_whiteboards', prev => [...prev, ...(data.whiteboards ?? []).map(remap)])
    commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => [...prev, ...(data.storySchedule ?? []).map(remap)])
    commitLocal(rpgCharactersRef, setRpgCharacters, 'nf_rpg_characters', prev => [...prev, ...(data.rpgCharacters ?? []).map(remap).map(normalizeRpgCharacter)])
    commitLocal(comicPagesRef, setComicPages, 'nf_comicPages', prev => [...prev, ...(data.comicPages ?? []).map(remap)])
    commitLocal(comicPanelsRef, setComicPanels, 'nf_comicPanels', prev => [...prev, ...(data.comicPanels ?? []).map(remap)])
    selectActiveNovel(newId)
    return project
  }

  // Per-project read-only: free tier users can only edit their chosen project
  const readOnly = globalReadOnly || (
    freeProjectId !== null && activeNovelId !== null && activeNovelId !== freeProjectId
  )

  const notifyReadOnly = (reason = 'trial-ended', extra = {}) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('membership-read-only', { detail: { reason, ...extra } }))
    }
  }

  const storageExceededCheck = () => {
    if (!storageQuotaBytes) return false
    const used = estimateStoreSize({
      novels, characters, factions, locations, timeline, worldHistory,
      acts, chapters, scenes, loreEntries, ideaEntries, maps, whiteboards,
      series, storySchedule,
    })
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
    novels, activeNovelId, activeNovel, setActiveNovelId: selectActiveNovel, addNovel, updateNovel, deleteNovel, importProjectFromData, getProjectExportData, getProjectContextData,
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
    characters: seriesScope(characters, 'characters'),
    saveCharacter, saveCharacterJourney, updateCharacterJourneyForSeries, deleteCharacter,
    factions: novelFactions,
    saveFaction, deleteFaction,
    setFactions: (updater) => {
      setFactions(prev => {
        const untouched = prev.filter(f => f.novelId !== activeNovelId)
        const scoped = prev.filter(f => f.novelId === activeNovelId)
        const nextScoped = typeof updater === 'function' ? updater(scoped) : updater
        return [...untouched, ...nextScoped.map(f => ({ ...f, novelId: f.novelId ?? activeNovelId }))]
      })
    },
    locations: seriesScope(locations, 'locations'),
    saveLocation, deleteLocation,
    timeline: novelTimeline,
    addEvent, updateEvent, deleteEvent, linkTimelineHistory, unlinkTimelineHistory,
    worldHistory: novelWorldHistory,
    addHistoryEntry, updateHistoryEntry, deleteHistoryEntry,
    eras: novelEras, addEra, updateEra, deleteEra,
    currentYear: activeNovel?.currentYear ?? currentYear, updateCurrentYear,
    loreEntries: novelLoreEntries, addLoreEntry, updateLoreEntry, deleteLoreEntry,
    ideaEntries: novelIdeaEntries, addIdeaEntry, updateIdeaEntry, deleteIdeaEntry,
    whiteboard, updateWhiteboard, mapProject, updateMapProject, addMap, selectMap, deleteMap, renameMap, updateActiveMapData,
    addLocation: saveLocation,
    acts: novelActs, addAct, deleteAct, updateAct, reorderAct, moveAct,
    chapters: novelChapters, addChapter, deleteChapter, updateChapter, reorderChapter, moveChapter,
    scenes: novelScenes, addScene, deleteScene, updateScene, reorderScene, moveScene,
    updateSceneContent,
    sceneConflicts: novelSceneConflicts, restoreSceneConflict, discardSceneConflict,
    selectedCharacterId, setSelectedCharacterId,
    selectedLocationId, setSelectedLocationId,
    selectedLoreEntryId, setSelectedLoreEntryId,
    selectedIdeaEntryId, setSelectedIdeaEntryId,
    selectedTimelineEventId, setSelectedTimelineEventId,
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
    getLocalSnapshot: getCurrentSnapshot,
    syncStatus, trackSync, flushPendingSync,
    localStorageWarning,
  }

  if (!readOnly) return api

  const guardedMethods = [
    'addNovel', 'updateNovel', 'deleteNovel', 'importProjectFromData', 'addSeries', 'deleteSeries', 'updateSeries', 'reorderSeries', 'reorderNovels',
    'saveCharacter', 'saveCharacterJourney', 'deleteCharacter', 'setFactions', 'saveLocation', 'deleteLocation',
    'addEvent', 'updateEvent', 'deleteEvent', 'linkTimelineHistory', 'unlinkTimelineHistory', 'addHistoryEntry', 'updateHistoryEntry', 'deleteHistoryEntry',
    'addEra', 'updateEra', 'deleteEra',
    'updateCurrentYear', 'addLoreEntry', 'updateLoreEntry', 'deleteLoreEntry',
    'addIdeaEntry', 'updateIdeaEntry', 'deleteIdeaEntry', 'updateWhiteboard', 'updateMapProject',
    'addMap', 'deleteMap', 'renameMap', 'updateActiveMapData', 'addLocation',
    'addAct', 'deleteAct', 'updateAct', 'reorderAct', 'moveAct',
    'addChapter', 'deleteChapter', 'updateChapter', 'reorderChapter', 'moveChapter',
    'addScene', 'deleteScene', 'updateScene', 'reorderScene', 'moveScene', 'updateSceneContent',
    'restoreSceneConflict', 'discardSceneConflict',
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
