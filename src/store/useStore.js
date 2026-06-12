import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { saveAppData, saveSceneDoc, deleteSceneDoc, deleteProjectData } from '../utils/firestoreSync'
import { buildAllProjectStats, buildProjectStats } from '../utils/projectStats'
import { getProjectType } from '../constants/projectTypes'
import { estimateStoreSize } from '../utils/storageQuota'

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

  const charactersRef = useRef(characters)
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

  const [selectedCharacterId, setSelectedCharacterId] = useState(null)
  const [selectedLocationId, setSelectedLocationId] = useState(null)
  const [selectedLoreEntryId, setSelectedLoreEntryId] = useState(null)
  const [selectedIdeaEntryId, setSelectedIdeaEntryId] = useState(null)

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
  useEffect(() => save('nf_factions', factions), [factions])
  useEffect(() => { locationsRef.current = locations; save('nf_locations', locations) }, [locations])
  useEffect(() => { timelineRef.current = timeline; save('nf_timeline', timeline) }, [timeline])
  useEffect(() => { worldHistoryRef.current = worldHistory; save('nf_worldHistory', worldHistory) }, [worldHistory])
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

  // Debounced Firestore save for all non-scene data (2s delay)
  const debouncedSaveAppData = useMemo(
    () => debounce((uid, data) => saveAppData(uid, data).catch(console.error), 2000),
    []
  )

  // Debounced Firestore save for individual scenes (1s delay)
  const debouncedSaveScene = useMemo(
    () => createKeyedDebounce((sceneId, uid, scene) => saveSceneDoc(uid, scene).catch(console.error), 1000),
    []
  )

  // Sync non-scene data to Firestore whenever anything changes
  useEffect(() => {
    if (!userId || importing.current || !remoteReady.current) return
    debouncedSaveAppData(userId, buildAppDataPayload({
      novels, characters, factions, locations, timeline,
      worldHistory, acts, chapters, loreEntries, ideaEntries,
      maps, activeMapByNovel, whiteboards, series, storySchedule,
      currentYear, activeNovelId,
    }))
  }, [userId, novels, characters, factions, locations, timeline,
      worldHistory, acts, chapters, loreEntries, ideaEntries, maps, activeMapByNovel, whiteboards, series, storySchedule, currentYear, activeNovelId, debouncedSaveAppData])

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

    if (shouldPreferLocal && userId) {
      const snapshot = getLocalSnapshot()
      saveAppData(userId, buildAppDataPayload(snapshot)).catch(console.error)
      ;(snapshot.scenes ?? []).forEach(scene => {
        saveSceneDoc(userId, scene).catch(console.error)
      })
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
    // Allow effects to settle before re-enabling Firestore saves
    setTimeout(() => {
      importing.current = false
      remoteReady.current = true
    }, 500)
  }, [userId])

  const finishRemoteLoad = useCallback((allowSaves = true) => {
    importing.current = false
    remoteReady.current = allowSaves
  }, [])

  const replaceData = useCallback((data) => {
    importData(data)

    if (!userId) return

    setTimeout(() => {
      saveAppData(userId, {
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
        activeNovelId: data.activeNovelId ?? null
      }).catch(console.error)

      ;(data.scenes ?? []).forEach(scene => {
        saveSceneDoc(userId, scene).catch(console.error)
      })
    }, 700)
  }, [importData, userId])

  // Clear all local state on sign-out
  const clearData = useCallback(() => {
    importing.current = true
    remoteReady.current = false
    clearProjectLocalStorage()
    clearProjectRefs({
      charactersRef,
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
    })
    setNovels([]); setCharacters([]); setFactions([]); setLocations([])
    setTimeline([]); setWorldHistory([]); setActs([]); setChapters([])
    setScenes([]); setLoreEntries([]); setIdeaEntries([]); setMaps([]); setActiveMapByNovel({}); setWhiteboards([]); setSeries([]); setStorySchedule([]); setRpgCharacters([]); setCurrentYear(0); setActiveNovelId(null)
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
  const allProjectStats = buildAllProjectStats(novels, projectStatsData)
  const activeProjectStats = activeNovel ? buildProjectStats(activeNovel, projectStatsData) : null

  // Series sync: directional — data flows from earlier books to later ones.
  // Each series stores projectOrder: [novelId, ...] for explicit ordering.
  // A project with includeLaterWorks:true also pulls data from books after it.
  const activeSeries = activeNovel?.seriesId ? series.find(s => s.id === activeNovel.seriesId) : null
  const syncCategories = activeSeries?.syncCategories ?? []

  const getSeriesVisibleIds = (ser, projectId, projectIncludeLater) => {
    if (!ser) return [projectId]
    const order = ser.projectOrder ?? novels.filter(n => n.seriesId === ser.id).map(n => n.id)
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

  const activeIncludeLater = activeNovel?.includeLaterWorks ?? false
  const seriesVisibleIds = getSeriesVisibleIds(activeSeries, activeNovelId, activeIncludeLater)

  const seriesScope = (arr, category) =>
    syncCategories.includes(category)
      ? arr.filter(item => seriesVisibleIds.includes(item.novelId))
      : arr.filter(item => item.novelId === activeNovelId)

  const getProjectContextData = (projectId = activeNovelId) => {
    const project = novels.find(n => n.id === projectId) ?? null
    const projectSeries = project?.seriesId ? series.find(s => s.id === project.seriesId) : null
    const projectSyncCategories = projectSeries?.syncCategories ?? []
    const projectIncludeLater = project?.includeLaterWorks ?? false
    const projectVisibleIds = getSeriesVisibleIds(projectSeries, projectId, projectIncludeLater)
    const projectScope = (arr, category) =>
      projectSyncCategories.includes(category)
        ? arr.filter(item => projectVisibleIds.includes(item.novelId))
        : arr.filter(item => item.novelId === projectId)

    return {
      activeNovelId: projectId,
      activeNovel: project,
      characters: projectScope(characters, 'characters'),
      factions: projectScope(factions, 'factions'),
      locations: projectScope(locations, 'locations'),
      timeline: projectScope(timeline, 'timeline'),
      worldHistory: projectScope(worldHistory, 'worldhistory'),
      loreEntries: projectScope(loreEntries, 'lore'),
      ideaEntries: projectScope(ideaEntries, 'ideas'),
      acts: acts.filter(a => a.novelId === projectId).sort((a, b) => a.order - b.order),
      chapters: chapters.filter(c => c.novelId === projectId).sort((a, b) => a.order - b.order),
      scenes: scenes.filter(s => s.novelId === projectId).sort((a, b) => a.order - b.order),
      maps: maps.filter(m => m.novelId === projectId),
      storySchedule: storySchedule.filter(e => e.novelId === projectId),
    }
  }

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
    if (isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
    const order = actsRef.current.filter(a => a.novelId === activeNovelId).length
    const newAct = { id: uid(), novelId: activeNovelId, title, synopsis: '', order }
    commitLocal(actsRef, setActs, 'nf_acts', prev => [...prev, newAct])
    return newAct
  }

  const addChapter = (actId, title) => {
    if (isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
    const order = chaptersRef.current.filter(c => c.novelId === activeNovelId).length
    const newChap = { id: uid(), novelId: activeNovelId, actId, title, synopsis: '', order }
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => [...prev, newChap])
    return newChap
  }

  const addScene = (chapterId, title) => {
    if (isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
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
    if (userId) saveSceneDoc(userId, newScene).catch(console.error)
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
        if (userId) debouncedSaveScene(sceneId, userId, updated)
        return updated
      })
    })
  }, [userId, debouncedSaveScene, commitLocal])

  const deleteAct = (id) => {
    const chapterIds = chaptersRef.current.filter(c => c.actId === id).map(c => c.id)
    const sceneIds = scenesRef.current.filter(s => chapterIds.includes(s.chapterId)).map(s => s.id)
    sceneIds.forEach(sceneId => debouncedSaveScene.cancel(sceneId))
    commitLocal(actsRef, setActs, 'nf_acts', prev => prev.filter(a => a.id !== id))
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => prev.filter(c => c.actId !== id))
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      return prev.filter(s => {
        const keep = !sceneIds.includes(s.id)
        if (!keep && userId) deleteSceneDoc(userId, s.id).catch(console.error)
        return keep
      })
    })
  }
  const deleteChapter = (id) => {
    const sceneIds = scenesRef.current.filter(s => s.chapterId === id).map(s => s.id)
    sceneIds.forEach(sceneId => debouncedSaveScene.cancel(sceneId))
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => prev.filter(c => c.id !== id))
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => {
      return prev.filter(s => {
        const keep = !sceneIds.includes(s.id)
        if (!keep && userId) deleteSceneDoc(userId, s.id).catch(console.error)
        return keep
      })
    })
  }
  const deleteScene = (id) => {
    debouncedSaveScene.cancel(id)
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => prev.filter(s => s.id !== id))
    if (userId) deleteSceneDoc(userId, id).catch(console.error)
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
        if (userId) debouncedSaveScene(id, userId, updated)
        return updated
      })
    })
  }

  const saveCharacter = (data, id) => {
    if (!id && isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
    const characterId = id || uid()
    const childIds = data.childIds || []
    const parentIds = data.parentIds || []
    const spouseIds = data.spouseIds || []
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => {
      const next = id
        ? prev.map(c => c.id === id ? { ...c, ...data } : c)
        : [...prev, { id: characterId, novelId: activeNovelId, ...data }]

      return next.map(c => {
        if (c.id === characterId || c.novelId !== activeNovelId) return c
        let updated = c
        let changed = false

        // childIds → sync parentIds on children
        const cParents = updated.parentIds || []
        const shouldBeChild = childIds.includes(c.id)
        if (shouldBeChild && !cParents.includes(characterId)) {
          updated = { ...updated, parentIds: [...cParents, characterId] }
          changed = true
        } else if (!shouldBeChild && cParents.includes(characterId)) {
          updated = { ...updated, parentIds: cParents.filter(p => p !== characterId) }
          changed = true
        }

        // parentIds → sync childIds on parents
        const cChildren = updated.childIds || []
        const shouldBeParent = parentIds.includes(c.id)
        if (shouldBeParent && !cChildren.includes(characterId)) {
          updated = { ...updated, childIds: [...cChildren, characterId] }
          changed = true
        } else if (!shouldBeParent && cChildren.includes(characterId)) {
          updated = { ...updated, childIds: cChildren.filter(ch => ch !== characterId) }
          changed = true
        }

        // spouseIds → sync bidirectionally
        const cSpouses = updated.spouseIds || []
        const shouldBeSpouse = spouseIds.includes(c.id)
        if (shouldBeSpouse && !cSpouses.includes(characterId)) {
          updated = { ...updated, spouseIds: [...cSpouses, characterId] }
          changed = true
        } else if (!shouldBeSpouse && cSpouses.includes(characterId)) {
          updated = { ...updated, spouseIds: cSpouses.filter(s => s !== characterId) }
          changed = true
        }

        return changed ? updated : c
      })
    })
    return characterId
  }
  const deleteCharacter = (id) => {
    commitLocal(charactersRef, setCharacters, 'nf_characters', prev => {
      return prev
        .filter(c => c.id !== id)
        .map(c => ({
          ...c,
          childIds: (c.childIds || []).filter(childId => childId !== id),
          parentIds: (c.parentIds || []).filter(parentId => parentId !== id),
          spouseIds: (c.spouseIds || []).filter(spouseId => spouseId !== id),
          relationships: (c.relationships || []).filter(rel => rel.characterId !== id),
        }))
    })
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => {
      return prev.map(entry => ({
        ...entry,
        characterIds: (entry.characterIds || []).filter(characterId => characterId !== id),
      }))
    })
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => {
      return prev.map(event => ({
        ...event,
        linkedCharacters: (event.linkedCharacters || []).filter(characterId => characterId !== id),
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
    commitLocal(rpgCharactersRef, setRpgCharacters, 'nf_rpg_characters', prev => prev.filter(c => c.id !== id))
  }

  const saveLocation = (data, id) => {
    if (!id && isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
    if (id) {
      const updated = { ...(locationsRef.current.find(l => l.id === id) || { id, novelId: activeNovelId }), ...data }
      commitLocal(locationsRef, setLocations, 'nf_locations', prev => prev.map(l => l.id === id ? { ...l, ...data } : l))
      return updated
    } else {
      const newLoc = { id: uid(), novelId: activeNovelId, ...data }
      commitLocal(locationsRef, setLocations, 'nf_locations', prev => [...prev, newLoc])
      return newLoc
    }
  }
  const deleteLocation = (id) => {
    commitLocal(locationsRef, setLocations, 'nf_locations', prev => prev.filter(l => l.id !== id))
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => {
      return prev.map(entry => ({
        ...entry,
        locationIds: (entry.locationIds || []).filter(locationId => locationId !== id),
      }))
    })
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => {
      return prev.map(event => ({
        ...event,
        linkedLocations: (event.linkedLocations || []).filter(locationId => locationId !== id),
      }))
    })
  }

  const addEvent = (data, options = {}) => {
    if (isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
    const eventId = uid()
    const shouldCreateHistory = options.createHistory !== false && !data.linkedHistoryEntryId
    const historyId = data.linkedHistoryEntryId || (shouldCreateHistory ? uid() : null)
    const createdAt = Date.now() // eslint-disable-line react-hooks/purity
    const event = { id: eventId, novelId: activeNovelId, createdAt, ...data, worldHistoryEntryId: historyId }
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
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => prev.map(e => e.id === id ? { ...e, ...data, worldHistoryEntryId: linkedHistoryId ?? e.worldHistoryEntryId ?? null } : e))
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => {
      return prev.map(h => {
        if (linkedHistoryId && h.timelineEventId === id && h.id !== linkedHistoryId) {
          return { ...h, timelineEventId: null }
        }
        if (h.timelineEventId === id || (linkedHistoryId && h.id === linkedHistoryId)) {
          return {
            ...h,
            timelineEventId: id,
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
  }
  const deleteEvent = (id) => {
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => prev.filter(e => e.id !== id))
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => prev.map(h => h.timelineEventId === id ? { ...h, timelineEventId: null } : h))
  }

  const addScheduleEvent = (data) => {
    if (isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
    const entry = { id: uid(), novelId: activeNovelId, createdAt: Date.now(), category: 'scene', duration: 1, tags: [], linkedCharacters: [], linkedLocations: [], ...data } // eslint-disable-line react-hooks/purity
    commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => [...prev, entry])
    return entry
  }
  const updateScheduleEvent = (id, data) => commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => prev.map(e => e.id === id ? { ...e, ...data } : e))
  const deleteScheduleEvent = (id) => commitLocal(storyScheduleRef, setStorySchedule, 'nf_storySchedule', prev => prev.filter(e => e.id !== id))

  const addHistoryEntry = (data, options = {}) => {
    if (isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
    const createdAt = Date.now() // eslint-disable-line react-hooks/purity
    const timelineEventId = data.linkedTimelineEventId || data.timelineEventId || null
    const entryId = uid()
    const entry = { id: entryId, novelId: activeNovelId, createdAt, ...data, timelineEventId }
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => [...prev, entry])
    if (timelineEventId) {
      commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => prev.map(e => e.id === timelineEventId ? { ...e, worldHistoryEntryId: entry.id } : e))
    } else if (options.createTimeline) {
      const eventId = uid()
      const event = {
        id: eventId,
        novelId: activeNovelId,
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
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => prev.map(h => h.id === id ? { ...h, ...data, timelineEventId: linkedTimelineId ?? h.timelineEventId ?? null } : h))
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => {
      return prev.map(e => {
        if (linkedTimelineId && e.id === linkedTimelineId) return { ...e, worldHistoryEntryId: id }
        if (e.worldHistoryEntryId === id && linkedTimelineId && e.id !== linkedTimelineId) return { ...e, worldHistoryEntryId: null }
        if (e.worldHistoryEntryId === id) {
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
  }
  const deleteHistoryEntry = (id) => {
    commitLocal(worldHistoryRef, setWorldHistory, 'nf_worldHistory', prev => prev.filter(h => h.id !== id))
    commitLocal(timelineRef, setTimeline, 'nf_timeline', prev => prev.map(e => e.worldHistoryEntryId === id ? { ...e, worldHistoryEntryId: null } : e))
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
    if (isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
    const entry = { id: uid(), novelId: activeNovelId, createdAt: Date.now(), characterIds: [], category: '', content: '', ...data } // eslint-disable-line react-hooks/purity
    commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => [...prev, entry])
    return entry
  }
  const updateLoreEntry = (id, data) => commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => prev.map(e => e.id === id ? { ...e, ...data } : e))
  const deleteLoreEntry = (id) => commitLocal(loreEntriesRef, setLoreEntries, 'nf_loreEntries', prev => prev.filter(e => e.id !== id))

  const addIdeaEntry = (data) => {
    if (isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
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
    commitLocal(ideaEntriesRef, setIdeaEntries, 'nf_ideaEntries', prev => [...prev, entry])
    return entry
  }
  const updateIdeaEntry = (id, data) => commitLocal(ideaEntriesRef, setIdeaEntries, 'nf_ideaEntries', prev => prev.map(e => e.id === id ? { ...e, ...data } : e))
  const deleteIdeaEntry = (id) => commitLocal(ideaEntriesRef, setIdeaEntries, 'nf_ideaEntries', prev => prev.filter(e => e.id !== id))

  const addMap = (name, mapType) => {
    if (isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
    const map = { id: uid(), novelId: activeNovelId, name, mapType: mapType || 'regional', mapPins: [], mapRegions: [], created: Date.now() } // eslint-disable-line react-hooks/purity
    setMaps(prev => [...prev, map])
    setActiveMapByNovel(prev => ({ ...prev, [activeNovelId]: map.id }))
    return map.id
  }

  const selectMap = (mapId) => {
    setActiveMapByNovel(prev => ({ ...prev, [activeNovelId]: mapId }))
  }

  const deleteMap = (mapId) => {
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

  const addNovel = (data) => {
    if (freeProjectId !== null) {
      notifyReadOnly('free-limit')
      return null
    }
    if (isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
    const novel = { id: uid(), createdAt: new Date().toISOString(), ...data }
    const starter = buildStarterStructure(novel.id, novel.type)
    commitLocal(actsRef, setActs, 'nf_acts', prev => [...prev, ...starter.acts])
    commitLocal(chaptersRef, setChapters, 'nf_chapters', prev => [...prev, ...starter.chapters])
    commitLocal(scenesRef, setScenes, 'nf_scenes', prev => [...prev, ...starter.scenes])
    if (userId) {
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
    }
  }

  const addSeries = (name) => {
    const s = { id: uid(), name, createdAt: new Date().toISOString() }
    setSeries(prev => [...prev, s])
    return s
  }
  const deleteSeries = (id) => {
    setSeries(prev => prev.filter(s => s.id !== id))
    setNovels(prev => prev.map(n => n.seriesId === id ? { ...n, seriesId: null } : n))
  }
  const updateSeries = (id, data) => setSeries(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))
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
      if (userId) toDelete.forEach(s => deleteSceneDoc(userId, s.id).catch(console.error))
      return prev.filter(s => s.novelId !== id)
    })
    setLoreEntries(prev => prev.filter(e => e.novelId !== id))
    setIdeaEntries(prev => prev.filter(e => e.novelId !== id))
    setMaps(prev => prev.filter(m => m.novelId !== id))
    setWhiteboards(prev => prev.filter(w => w.novelId !== id))
    setStorySchedule(prev => prev.filter(e => e.novelId !== id))
    setRpgCharacters(prev => prev.filter(c => c.novelId !== id))
    setActiveMapByNovel(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (userId) {
      deleteProjectData(userId, id).catch(console.error)
      // Immediately persist updated novels list so deletion survives logout
      // (the debounced save may not fire in time if user logs out quickly)
      saveAppData(userId, buildAppDataPayload({
        novels: updatedNovels, characters, factions, locations, timeline,
        worldHistory, acts, chapters, loreEntries, ideaEntries,
        maps, activeMapByNovel, whiteboards, series, storySchedule,
        currentYear, activeNovelId,
      })).catch(console.error)
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
    if (isStorageExceeded()) { notifyReadOnly('storage-exceeded'); return null }
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
    setActiveNovelId(newId)
    return project
  }

  // Per-project read-only: free tier users can only edit their chosen project
  const readOnly = globalReadOnly || (
    freeProjectId !== null && activeNovelId !== null && activeNovelId !== freeProjectId
  )

  const notifyReadOnly = (reason = 'trial-ended') => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('membership-read-only', { detail: { reason } }))
    }
  }

  const isStorageExceeded = () => {
    if (!storageQuotaBytes) return false
    const used = estimateStoreSize({
      novels, characters, factions, locations, timeline, worldHistory,
      acts, chapters, scenes, loreEntries, ideaEntries, maps, whiteboards,
      series, storySchedule,
    })
    return used >= storageQuotaBytes
  }

  const readOnlyValue = (name) => {
    const reason = globalReadOnly ? 'trial-ended' : 'free-project'
    notifyReadOnly(reason)
    if (name.startsWith('add') || name === 'saveLocation') return null
    return undefined
  }

  const api = {
    readOnly,
    freeProjectId,
    novels, activeNovelId, activeNovel, setActiveNovelId, addNovel, updateNovel, deleteNovel, importProjectFromData, getProjectExportData, getProjectContextData,
    series, addSeries, deleteSeries, updateSeries, reorderSeries, reorderNovels,
    allProjectStats, activeProjectStats,
    characters: seriesScope(characters, 'characters'),
    saveCharacter, deleteCharacter,
    factions: novelFactions,
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
    storySchedule: novelStorySchedule, addScheduleEvent, updateScheduleEvent, deleteScheduleEvent,
    rpgCharacters: rpgCharacters.filter(c => c.novelId === activeNovelId),
    saveRpgCharacter, deleteRpgCharacter,
    importData, replaceData, clearData, finishRemoteLoad
  }

  if (!readOnly) return api

  const guardedMethods = [
    'addNovel', 'updateNovel', 'deleteNovel', 'importProjectFromData', 'addSeries', 'deleteSeries', 'updateSeries', 'reorderSeries', 'reorderNovels',
    'saveCharacter', 'deleteCharacter', 'setFactions', 'saveLocation', 'deleteLocation',
    'addEvent', 'updateEvent', 'deleteEvent', 'linkTimelineHistory', 'unlinkTimelineHistory', 'addHistoryEntry', 'updateHistoryEntry', 'deleteHistoryEntry',
    'updateCurrentYear', 'addLoreEntry', 'updateLoreEntry', 'deleteLoreEntry',
    'addIdeaEntry', 'updateIdeaEntry', 'deleteIdeaEntry', 'updateWhiteboard', 'updateMapProject',
    'addMap', 'deleteMap', 'renameMap', 'updateActiveMapData', 'addLocation',
    'addAct', 'deleteAct', 'updateAct', 'reorderAct', 'moveAct',
    'addChapter', 'deleteChapter', 'updateChapter', 'reorderChapter', 'moveChapter',
    'addScene', 'deleteScene', 'updateScene', 'reorderScene', 'moveScene', 'updateSceneContent',
    'addScheduleEvent', 'updateScheduleEvent', 'deleteScheduleEvent', 'replaceData',
    'saveRpgCharacter', 'deleteRpgCharacter',
  ]

  const guardedApi = { ...api }
  guardedMethods.forEach(name => {
    guardedApi[name] = () => readOnlyValue(name)
  })
  return guardedApi
}
