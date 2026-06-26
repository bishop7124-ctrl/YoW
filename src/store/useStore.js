import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { upsertItems, deleteItem, deleteItemsByNovel, saveUserSettings, saveSceneDoc, deleteSceneDoc } from '../utils/firestoreSync'
import { buildProjectStats } from '../utils/projectStats'
import { getProjectType } from '../constants/projectTypes'
import { estimateStoreSize } from '../utils/storageQuota'
import { clearJourneyLinks } from '../utils/characterJourney'

const load = (key, def) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? def }
  catch { return def }
}
const LOCAL_WRITE_AT_KEY = 'nf_localWriteAt'
const LOCAL_OWNER_KEY = 'nf_localOwner'
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
  LOCAL_WRITE_AT_KEY,
  LOCAL_OWNER_KEY,
]
const loadLocalWriteAt = () => {
  try { return Number(localStorage.getItem(LOCAL_WRITE_AT_KEY) || 0) || 0 }
  catch { return 0 }
}
const loadLocalOwner = () => {
  try { return localStorage.getItem(LOCAL_OWNER_KEY) || null }
  catch { return null }
}
const markLocalOwner = (ownerId) => {
  try {
    if (ownerId) localStorage.setItem(LOCAL_OWNER_KEY, ownerId)
    else localStorage.removeItem(LOCAL_OWNER_KEY)
  } catch { /* Ignore metadata writes; content saves are handled separately. */ }
}
const markLocalWrite = (ownerId) => {
  try { localStorage.setItem(LOCAL_WRITE_AT_KEY, String(Date.now())) }
  catch { /* Ignore metadata writes; the actual content save is handled separately. */ }
  markLocalOwner(ownerId)
}
const clearProjectLocalStorage = () => {
  try {
    PROJECT_STORAGE_KEYS.forEach(key => localStorage.removeItem(key))
  } catch { /* Best effort only; state setters will also overwrite these keys. */ }
}
const clearProjectRefs = (refs) => {
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
  refs.storyScheduleRef.current = []
  refs.rpgCharactersRef.current = []
  refs.comicPagesRef.current = []
  refs.comicPanelsRef.current = []
}
const save = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch (error) {
    if (key === 'nf_novels' && Array.isArray(val)) {
      try {
        const withoutCovers = val.map(item => ({ ...item, coverPhoto: null }))
        localStorage.setItem(key, JSON.stringify(withoutCovers))
        console.warn('Project data was saved without cover photos because browser storage is full.', error)
        return
      } catch {
        // Fall through to the shared warning below.
      }
    }
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
  currentYear: load('nf_currentYear', 0),
  activeNovelId: load('nf_activeNovel', null),
  comicPages: load('nf_comicPages', []),
  comicPanels: load('nf_comicPanels', []),
})

const buildAppDataPayload = (data) => ({
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

// Simple debounce helper: returns a function that delays calling fn by ms
function debounce(fn, ms) {
  let timer
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms) }
}

function createKeyedDebounce(fn, ms) {
  const timers = new Map()
  const debounced = (key, ...args) => {
    if (timers.has(key)) clearTimeout(timers.get(key))
    timers.set(key, setTimeout(() => {
      timers.delete(key)
      fn(key, ...args)
    }, ms))
  }
  debounced.cancel = (key) => {
    if (!timers.has(key)) return
    clearTimeout(timers.get(key))
    timers.delete(key)
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
  const storyScheduleRef = useRef(storySchedule)
  const rpgCharactersRef = useRef(rpgCharacters)
  const comicPagesRef = useRef(comicPages)
  const comicPanelsRef = useRef(comicPanels)

  const [selectedCharacterId, setSelectedCharacterId] = useState(null)
  const [selectedLocationId, setSelectedLocationId] = useState(null)
  const [selectedLoreEntryId, setSelectedLoreEntryId] = useState(null)
  const [selectedIdeaEntryId, setSelectedIdeaEntryId] = useState(null)
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState(null)

  // Track whether we're mid-import to suppress Firestore saves during bulk load
  const importing = useRef(false)
  const remoteReady = useRef(!userId)
  const previousUserId = useRef(userId)

  useEffect(() => {
    if (previousUserId.current === userId) return
    const previous = previousUserId.current
    previousUserId.current = userId
    remoteReady.current = false
    importing.current = true
    clearProjectLocalStorage()
    clearProjectRefs({
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
      storyScheduleRef,
      rpgCharactersRef,
      comicPagesRef,
      comicPanelsRef,
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
  }, [userId])

  const commitLocal = useCallback((ref, setter, key, updater) => {
    const next = typeof updater === 'function' ? updater(ref.current) : updater
    ref.current = next
    markLocalWrite(userId)
    save(key, next)
    setter(next)
    return next
  }, [userId])

  // localStorage persistence
  useEffect(() => save('nf_novels', novels), [novels])
  useEffect(() => save('nf_activeNovel', activeNovelId), [activeNovelId])
  useEffect(() => { charactersRef.current = characters; save('nf_characters', characters) }, [characters])
  useEffect(() => { factionsRef.current = factions; save('nf_factions', factions) }, [factions])
  useEffect(() => { locationsRef.current = locations; save('nf_locations', locations) }, [locations])
  useEffect(() => { timelineRef.current = timeline; save('nf_timeline', timeline) }, [timeline])
  useEffect(() => { worldHistoryRef.current = worldHistory; save('nf_worldHistory', worldHistory) }, [worldHistory])
  useEffect(() => { save('nf_eras', eras) }, [eras])
  useEffect(() => save('nf_currentYear', currentYear), [currentYear])
  useEffect(() => { actsRef.current = acts; save('nf_acts', acts) }, [acts])
  useEffect(() => { chaptersRef.current = chapters; save('nf_chapters', chapters) }, [chapters])
  useEffect(() => { scenesRef.current = scenes; save('nf_scenes', scenes) }, [scenes])
  useEffect(() => { loreEntriesRef.current = loreEntries; save('nf_loreEntries', loreEntries) }, [loreEntries])
  useEffect(() => { ideaEntriesRef.current = ideaEntries; save('nf_ideaEntries', ideaEntries) }, [ideaEntries])
  useEffect(() => save('nf_maps', maps), [maps])
  useEffect(() => save('nf_activeMapByNovel', activeMapByNovel), [activeMapByNovel])
  useEffect(() => save('nf_whiteboards', whiteboards), [whiteboards])
  useEffect(() => save('nf_series', series), [series])
  useEffect(() => { storyScheduleRef.current = storySchedule; save('nf_storySchedule', storySchedule) }, [storySchedule])
  useEffect(() => { rpgCharactersRef.current = rpgCharacters; save('nf_rpg_characters', rpgCharacters) }, [rpgCharacters])
  useEffect(() => { comicPagesRef.current = comicPages; save('nf_comicPages', comicPages) }, [comicPages])
  useEffect(() => { comicPanelsRef.current = comicPanels; save('nf_comicPanels', comicPanels) }, [comicPanels])

  // Debounced per-entity save — key is the table name
  const debouncedSaveItems = useMemo(
    () => createKeyedDebounce((table, uid, items) => upsertItems(table, uid, items).catch(console.error), 2000),
    []
  )

  // Debounced user-settings save (activeNovelId, currentYear, activeMapByNovel)
  const debouncedSaveSettings = useMemo(
    () => debounce((uid, settings) => saveUserSettings(uid, settings).catch(console.error), 2000),
    []
  )

  // Debounced Firestore save for individual scenes (1s delay)
  const debouncedSaveScene = useMemo(
    () => createKeyedDebounce((sceneId, uid, scene) => saveSceneDoc(uid, scene).catch(console.error), 1000),
    []
  )

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
    const shouldPreferLocal = ownerMatchesCurrentUser && localWriteAt > remoteSavedAt
    const sourceData = shouldPreferLocal ? getLocalSnapshot() : data

    if (shouldPreferLocal && canSyncCloud) {
      const snapshot = getLocalSnapshot()
      upsertItems('novels', userId, snapshot.novels ?? []).catch(console.error)
      upsertItems('series_items', userId, snapshot.series ?? []).catch(console.error)
      upsertItems('characters', userId, snapshot.characters ?? []).catch(console.error)
      upsertItems('factions', userId, snapshot.factions ?? []).catch(console.error)
      upsertItems('locations', userId, snapshot.locations ?? []).catch(console.error)
      upsertItems('timeline_events', userId, snapshot.timeline ?? []).catch(console.error)
      upsertItems('world_history', userId, snapshot.worldHistory ?? []).catch(console.error)
      upsertItems('acts', userId, snapshot.acts ?? []).catch(console.error)
      upsertItems('chapters', userId, snapshot.chapters ?? []).catch(console.error)
      upsertItems('lore_entries', userId, snapshot.loreEntries ?? []).catch(console.error)
      upsertItems('idea_entries', userId, snapshot.ideaEntries ?? []).catch(console.error)
      upsertItems('maps_data', userId, snapshot.maps ?? []).catch(console.error)
      upsertItems('whiteboards_data', userId, snapshot.whiteboards ?? []).catch(console.error)
      upsertItems('story_schedule', userId, snapshot.storySchedule ?? []).catch(console.error)
      upsertItems('rpg_characters', userId, snapshot.rpgCharacters ?? []).catch(console.error)
      upsertItems('comic_pages', userId, snapshot.comicPages ?? []).catch(console.error)
      upsertItems('comic_panels', userId, snapshot.comicPanels ?? []).catch(console.error)
      upsertItems('eras', userId, snapshot.eras ?? []).catch(console.error)
      saveUserSettings(userId, { activeNovelId: snapshot.activeNovelId ?? null, currentYear: snapshot.currentYear ?? 0, activeMapByNovel: snapshot.activeMapByNovel ?? {} }).catch(console.error)
      ;(snapshot.scenes ?? []).forEach(scene => saveSceneDoc(userId, scene).catch(console.error))
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
    setCurrentYear(sourceData.currentYear ?? 0)
    setActiveNovelId(sourceData.activeNovelId ?? null)
    setComicPages(sourceData.comicPages ?? [])
    setComicPanels(sourceData.comicPanels ?? [])
    // Allow effects to settle before re-enabling Firestore saves
    setTimeout(() => {
      importing.current = false
      remoteReady.current = true
    }, 500)
  }, [userId, canSyncCloud])

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
      ;(data.scenes ?? []).forEach(scene => saveSceneDoc(userId, scene).catch(console.error))
    }, 700)
  }, [importData, userId, canSyncCloud])

  // Clear all local state on sign-out
  const clearData = useCallback(() => {
    importing.current = true
    remoteReady.current = false
    clearProjectLocalStorage()
    clearProjectRefs({
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
      storyScheduleRef,
      rpgCharactersRef,
      comicPagesRef,
      comicPanelsRef,
    })
    setNovels([]); setCharacters([]); setFactions([]); setLocations([])
    setTimeline([]); setWorldHistory([]); setActs([]); setChapters([])
    setScenes([]); setLoreEntries([]); setIdeaEntries([]); setMaps([]); setActiveMapByNovel({}); setWhiteboards([]); setSeries([]); setStorySchedule([]); setRpgCharacters([]); setComicPages([]); setComicPanels([]); setCurrentYear(0); setActiveNovelId(null)
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
  const novelScenes = scenes.filter(s => s.novelId === activeNovelId).sort((a, b) => a.order - b.order)
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
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      return prev.map(s => {
        if (s.id !== sceneId) return s
        const updated = withSceneContentHistory(s, content)
        if (canSyncCloud) debouncedSaveScene(sceneId, userId, updated)
        return updated
      })
    })
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
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      return prev.map(s => {
        if (s.id !== id) return s
        const hasContent = Object.prototype.hasOwnProperty.call(data, 'content')
        const updated = hasContent && data.content !== s.content
          ? withSceneContentHistory({ ...s, ...data }, data.content)
          : { ...s, ...data }
        if (canSyncCloud) debouncedSaveScene(id, userId, updated)
        return updated
      })
    })
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
          relationships: (c.relationships || []).filter(rel => !deletedSet.has(rel.characterId)),
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
      return [...prev, { ...data, id: characterId, novelId: activeNovelId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
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
    if (canSyncCloud) (deletedIds.length ? deletedIds : [id]).forEach(dId => deleteItem('lore_entries', userId, dId).catch(console.error))
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

  const addMap = (name, mapType) => {
    if (storageExceededCheck()) { return null }
    const normalizedMapType = mapType || 'regional'
    const isInterior = normalizedMapType === 'interior'
    const isCampaignInterior = ['dnd_campaign', 'tabletop_rpg'].includes(activeNovel?.type)
    const map = {
      id: uid(),
      novelId: activeNovelId,
      name,
      mapType: normalizedMapType,
      mapPins: [],
      mapRegions: [],
      metadata: isInterior ? {
        stylePreset: 'dungeon',
        gridSettings: {
          enabled: true,
          type: 'square',
          size: 80,
          opacity: 0.36,
          color: '#d0d5d8',
          snapToGrid: true,
          scale: isCampaignInterior ? '1 square = 5 ft' : '1 square = 1 unit',
        },
      } : {},
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
    setNovels(prev => [...prev, novel]); setActiveNovelId(novel.id); return novel
  }
  const updateNovel = (id, data) => setNovels(prev => prev.map(n => n.id === id ? { ...n, ...data } : n))

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
      rpgCharacters: rpgCharacters.filter(c => c.novelId === id),
      comicPages: comicPages.filter(p => p.novelId === id),
      comicPanels: comicPanels.filter(p => p.novelId === id),
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
    const updatedNovels = novels.filter(n => n.id !== id)
    setNovels(updatedNovels)
    setCharacters(prev => prev.filter(c => c.novelId !== id))
    setFactions(prev => prev.filter(f => f.novelId !== id))
    setLocations(prev => prev.filter(l => l.novelId !== id))
    setTimeline(prev => prev.filter(e => e.novelId !== id))
    setWorldHistory(prev => prev.filter(h => h.novelId !== id))
    setActs(prev => prev.filter(a => a.novelId !== id))
    setChapters(prev => prev.filter(c => c.novelId !== id))
    setScenes(prev => {
      const toDelete = prev.filter(s => s.novelId === id)
      if (canSyncCloud) toDelete.forEach(s => deleteSceneDoc(userId, s.id).catch(console.error))
      return prev.filter(s => s.novelId !== id)
    })
    setLoreEntries(prev => prev.filter(e => e.novelId !== id))
    setIdeaEntries(prev => prev.filter(e => e.novelId !== id))
    setMaps(prev => prev.filter(m => m.novelId !== id))
    setWhiteboards(prev => prev.filter(w => w.novelId !== id))
    setStorySchedule(prev => prev.filter(e => e.novelId !== id))
    setRpgCharacters(prev => prev.filter(c => c.novelId !== id))
    setComicPages(prev => prev.filter(p => p.novelId !== id))
    setComicPanels(prev => prev.filter(p => p.novelId !== id))
    setActiveMapByNovel(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (canSyncCloud) {
      deleteItemsByNovel(userId, id).catch(console.error)
      deleteItem('novels', userId, id).catch(console.error)
    }
    if (activeNovelId === id) setActiveNovelId(null)
    setSelectedCharacterId(null)
    setSelectedLocationId(null)
    setSelectedLoreEntryId(null)
    setSelectedIdeaEntryId(null)
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
    setNovels(prev => [...prev, project])
    setCharacters(prev => [...prev, ...(data.characters ?? []).map(remap)])
    setFactions(prev => [...prev, ...(data.factions ?? []).map(remap)])
    setLocations(prev => [...prev, ...(data.locations ?? []).map(remap)])
    setTimeline(prev => [...prev, ...(data.timeline ?? []).map(remap)])
    setWorldHistory(prev => [...prev, ...(data.worldHistory ?? []).map(remap)])
    setActs(prev => [...prev, ...(data.acts ?? []).map(remap)])
    setChapters(prev => [...prev, ...(data.chapters ?? []).map(remap)])
    setScenes(prev => [...prev, ...(data.scenes ?? []).map(remap)])
    setLoreEntries(prev => [...prev, ...(data.loreEntries ?? []).map(remap)])
    setIdeaEntries(prev => [...prev, ...(data.ideaEntries ?? []).map(remap)])
    setMaps(prev => [...prev, ...(data.maps ?? []).map(remap)])
    setWhiteboards(prev => [...prev, ...(data.whiteboards ?? []).map(remap)])
    setStorySchedule(prev => [...prev, ...(data.storySchedule ?? []).map(remap)])
    setRpgCharacters(prev => [...prev, ...(data.rpgCharacters ?? []).map(remap)])
    setComicPages(prev => [...prev, ...(data.comicPages ?? []).map(remap)])
    setComicPanels(prev => [...prev, ...(data.comicPanels ?? []).map(remap)])
    setActiveNovelId(newId)
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
    novels, activeNovelId, activeNovel, setActiveNovelId, addNovel, updateNovel, deleteNovel, importProjectFromData, getProjectExportData, getProjectContextData,
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
    selectedCharacterId, setSelectedCharacterId,
    selectedLocationId, setSelectedLocationId,
    selectedLoreEntryId, setSelectedLoreEntryId,
    selectedIdeaEntryId, setSelectedIdeaEntryId,
    selectedTimelineEventId, setSelectedTimelineEventId,
    storySchedule: novelStorySchedule, addScheduleEvent, updateScheduleEvent, deleteScheduleEvent,
    rpgCharacters: rpgCharacters.filter(c => c.novelId === activeNovelId),
    saveRpgCharacter, deleteRpgCharacter,
    comicPages: novelComicPages,
    comicPanels: novelComicPanels,
    addComicPage, updateComicPage, deleteComicPage, reorderComicPage, duplicateComicPage,
    addComicPanel, updateComicPanel, deleteComicPanel, reorderComicPanel,
    importData, replaceData, clearData, finishRemoteLoad
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
