import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { getProjectType } from '../../constants/projectTypes'
import { BREAKPOINT_MS_OVERLAY, useMediaQuery } from '../../utils/useMediaQuery'
import ManuscriptRail from './ManuscriptRail.jsx'
import AIStar from '../ai/AIStar'
import ManuscriptInspector from './ManuscriptInspector.jsx'
import ManuscriptTopbar from './ManuscriptTopbar.jsx'
import ManuscriptSurface from './ManuscriptSurface.jsx'
import ManuscriptBookView from './ManuscriptBookView.jsx'
import { useToast } from './Toast.jsx'
import TemplateModal from './TemplateModal'
import DocxImportModal from './DocxImportModal'
import PacingChart from './PacingChart'
import { saveSceneVersion } from '../../utils/sceneVersions'
import ComicPlanner from '../comic/ComicPlanner'
import { SceneEditor } from './SceneEditor.jsx'
import FinalizedReader, { exportToDocx } from './FinalizedReader.jsx'
import ManuscriptCatalogue from './ManuscriptCatalogue.jsx'
import { SCRIPT_TYPES, buildFinalizedDraft, decodeHtmlEntities, loadFormat, persistSceneDraftToLocalStorage } from './manuscriptUtils.js'
import ManuscriptZoomControl from './ManuscriptZoomControl.jsx'
import SceneConflictReview from './SceneConflictReview.jsx'
import { useSceneWindow } from './useSceneWindow.js'
import { withDailyGoalHistory } from '../../utils/writingStreak.js'

const CAMPAIGN_PROJECT_TYPES = new Set(['dnd_campaign', 'tabletop_rpg'])

// Prose column target width (at the default 19px font) -- shared by Write
// and Edit mode via the --ms-prose-w custom property set below, so the line
// length is identical in both. Edit mode's document is simply this much
// wider again, reserved for the note gutter (.ms-scene-gutter's own 188px
// plus its 28px gap from the prose column) -- see .ms-scene-body/
// .ms-scene-body--write in index.css.
const PROSE_WIDTH_BASE = 1080
const PROSE_GUTTER_RESERVE = 216
// Matches .manuscript-document's own md:px-12 Tailwind padding (48px each side).
const MANUSCRIPT_DOC_PADDING = 96

// Rough placeholder height for a scene that hasn't been mounted (and measured) yet —
// see useSceneWindow.js and the SceneSlot component below. Doesn't need to be exact:
// it only has to be close enough that scrolling past an unmounted scene doesn't cause
// a jarring jump, and it's replaced with the real measured height (SceneSlot's
// ResizeObserver) the moment the scene is ever actually mounted, including on the very
// next scroll past it in most cases (see ROOT_MARGIN in useSceneWindow.js).
const PLACEHOLDER_HEADER_PX = 90
function estimateSceneHeight(scene, formatSettings) {
  const length = scene?.content?.length || 0
  const fontSize = formatSettings?.fontSize || 19
  const lineHeight = formatSettings?.lineHeight || 2
  const lineHeightPx = fontSize * lineHeight
  // ~77 characters/line at the default 19px font in the ~1080px prose column (Edit's
  // width, and also Write's since they share --ms-prose-w — see PROSE_WIDTH_BASE); a
  // bigger font fits fewer characters per line, so scale the estimate down as fontSize
  // grows. This is a rough placeholder estimate either way (see SceneSlot below), not a
  // hard layout constraint, so it doesn't need to track Write's wider 1fr fill exactly.
  const charsPerLine = Math.max(30, 77 * (19 / fontSize))
  const estimatedLines = Math.max(2, Math.ceil(length / charsPerLine))
  return Math.round(PLACEHOLDER_HEADER_PX + estimatedLines * lineHeightPx)
}

// Stable per-scene wrapper: this div (and its `id`/`data-scene-id`, which
// Manuscript.jsx's/StructureSidebar.jsx's scrollIntoView-by-id callers and
// useSceneWindow.js's IntersectionObserver both rely on) never unmounts — only its
// children swap between a real SceneEditor and a lightweight placeholder as the scene
// scrolls in and out of the virtualization window. Keeping the wrapper stable (instead
// of keying the whole scene item on `mount`) means useSceneWindow only has to
// register/unregister this element once per scene, not on every mount/unmount toggle.
function SceneSlot({ sceneId, mount, title, estimatedHeight, registerElement, onHeightMeasured, onActivatePlaceholder, children }) {
  const wrapperRef = useRef(null)

  useEffect(() => {
    registerElement(sceneId, wrapperRef.current)
    return () => registerElement(sceneId, null)
  }, [sceneId, registerElement])

  // Only measure while a real editor is mounted, and only via ResizeObserver (an
  // async, layout-already-computed callback) — never a synchronous
  // getBoundingClientRect()/scrollHeight read here, which would reintroduce exactly
  // the forced-reflow cost this whole feature exists to avoid.
  useEffect(() => {
    if (!mount) return undefined
    const el = wrapperRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(entries => {
      const height = entries[0]?.contentRect?.height
      if (height) onHeightMeasured(sceneId, height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [mount, sceneId, onHeightMeasured])

  return (
    <div ref={wrapperRef} id={`ms-scene-${sceneId}`} data-scene-id={sceneId}>
      {mount ? children : (
        <div
          className="ms-scene-placeholder"
          style={{ minHeight: estimatedHeight }}
          onClick={() => onActivatePlaceholder(sceneId)}
        >
          <span className="ms-scene-placeholder-title">{title}</span>
        </div>
      )}
    </div>
  )
}

const SESSION_PLAN_FIELDS = [
  { key: 'hooks', label: 'Hooks', placeholder: 'Opening hooks, rumors, clues, or pressure that pulls the group in.' },
  { key: 'encounters', label: 'Encounter flow', placeholder: 'Expected encounter order, alternate paths, and pacing notes.' },
  { key: 'npcs', label: 'NPCs', placeholder: 'NPCs in play, what they want, what they know, and how they might react.' },
  { key: 'rewards', label: 'Rewards', placeholder: 'Treasure, boons, clues, favors, levels, or information the group can earn.' },
  { key: 'consequences', label: 'Consequences', placeholder: 'What changes if the group succeeds, fails, delays, or surprises you.' },
  { key: 'notes', label: 'Session notes', placeholder: 'Prep reminders, table logistics, rules calls, safety notes, or improvisation anchors.' },
]

const SESSION_RECAP_FIELDS = [
  { key: 'summary', label: 'Recap', placeholder: 'What actually happened at the table.' },
  { key: 'playerChoices', label: 'Player choices', placeholder: 'Major decisions, alliances, routes, and unresolved questions.' },
  { key: 'fallout', label: 'Fallout', placeholder: 'World, faction, NPC, location, and campaign-state consequences.' },
  { key: 'nextHooks', label: 'Next hooks', placeholder: 'Threads to bring into the next session.' },
]

const filledFields = (source, fields) =>
  fields.filter(field => String(source?.[field.key] || '').trim()).length

const countWords = content => {
  const trimmed = content?.trim()
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
}

function CampaignSessionWorkflow({ chapter, encounters, labels, projectType, onUpdateChapter }) {
  const plan = chapter.sessionPlan || {}
  const recap = chapter.sessionRecap || {}
  const filledPlan = filledFields(plan, SESSION_PLAN_FIELDS)
  const filledRecap = filledFields(recap, SESSION_RECAP_FIELDS)
  const detailCount = filledPlan + filledRecap
  const roleLabel = projectType === 'dnd_campaign' ? 'DM' : 'GM'
  const groupLabel = projectType === 'dnd_campaign' ? 'party' : 'group'

  const updatePlan = (key, value) => onUpdateChapter(chapter.id, {
    sessionPlan: { ...plan, [key]: value },
  })
  const updateRecap = (key, value) => onUpdateChapter(chapter.id, {
    sessionRecap: { ...recap, [key]: value },
  })

  return (
    <details className="ms-campaign-session-panel" open={detailCount === 0}>
      <summary>
        <span>
          {labels.level2} prep & recap
          <small>{roleLabel} planning fields for hooks, encounters, NPCs, rewards, and consequences.</small>
        </span>
        <em>
          {encounters.length} {labels.level3.toLowerCase()}{encounters.length === 1 ? '' : 's'}
          {detailCount > 0 ? ` / ${detailCount} fields filled` : ''}
        </em>
      </summary>

      <div className="ms-campaign-session-grid">
        <section>
          <h3>Prep</h3>
          {SESSION_PLAN_FIELDS.map(field => (
            <label key={field.key}>
              <span>{field.label}</span>
              <textarea
                value={plan[field.key] || ''}
                onChange={event => updatePlan(field.key, event.target.value)}
                placeholder={field.placeholder.replace('group', groupLabel)}
                rows={2}
              />
            </label>
          ))}
        </section>

        <section>
          <h3>Recap</h3>
          {SESSION_RECAP_FIELDS.map(field => (
            <label key={field.key}>
              <span>{field.label}</span>
              <textarea
                value={recap[field.key] || ''}
                onChange={event => updateRecap(field.key, event.target.value)}
                placeholder={field.placeholder}
                rows={2}
              />
            </label>
          ))}
        </section>
      </div>
    </details>
  )
}

export default function Manuscript({ store, userId, membership = null }) {
  const {
    acts, chapters, scenes,
    addAct, addChapter, addScene,
    updateSceneContent, updateScene, updateAct, updateChapter,
    deleteAct, deleteChapter, deleteScene,
    moveAct, moveChapter, moveScene,
    characters, locations, loreEntries = [], worldHistory = [], timeline = [], factions = [], currentYear,
    setSelectedCharacterId, setSelectedLocationId, setSelectedLoreEntryId, setSelectedTimelineEventId,
    selectedSceneId, setSelectedSceneId,
    writingSceneId, setWritingSceneId,
    retireManuscript, restoreManuscriptCopy,
    activeNovel, updateNovel,
    sceneConflicts = [], restoreSceneConflict, discardSceneConflict,
    syncStatus,
    recordLocalWrite,
    localStorageWarning,
  } = store

  const projectTypeConfig = getProjectType(activeNovel?.type)
  const labels = projectTypeConfig.structure

  // Persisted in the URL (writingSceneId lives in the store) so a refresh in writing
  // mode returns to this scene instead of the top of the manuscript.
  const activeSceneId = writingSceneId
  const setActiveSceneId = setWritingSceneId
  // Redesign chrome state. `activeSidebarTab` (one string covering structure/
  // status/notes/format/ai) is gone — replaced by three independent pieces
  // matching the new layout: the rail's own collapse state, the inspector's
  // open flag + which of its four tabs is active, and the surface's which-
  // panel-if-any (AI/Search/History/Finalise, mutually exclusive with each
  // other but independent of the inspector, which it overlays rather than
  // replaces). On mobile the inspector becomes a bottom-sheet overlay instead
  // of a persistent side panel, so defaulting it open (as desktop does)
  // buries the manuscript behind it the moment a scene opens — same reasoning
  // the old activeSidebarTab default had.
  // Breakpoints per spec §3/§7 step 7: ≥1251px rail expanded, 901-1250px
  // auto-collapsed to the spine (unless the user's explicitly toggled it —
  // railUserToggledRef below), ≤900px rail becomes an off-canvas sheet
  // (railSheetOpen) instead of collapsing at all.
  const isNarrowBand = useMediaQuery(1250)
  const isMobileBand = useMediaQuery(BREAKPOINT_MS_OVERLAY)
  const [railCollapsed, setRailCollapsed] = useState(() => (
    typeof window !== 'undefined' && window.innerWidth <= 1250
  ))
  const [railSheetOpen, setRailSheetOpen] = useState(false)
  const railUserToggledRef = useRef(false)
  // Auto-collapse follows the breakpoint until the user makes an explicit
  // choice, at which point it stops overriding them (matches the
  // prototype's `if (!userRail) …` behavior) — this only runs above the
  // mobile band, where collapse-to-spine doesn't apply at all (rail is an
  // off-canvas sheet there instead, driven by railSheetOpen).
  useEffect(() => {
    if (railUserToggledRef.current || isMobileBand) return
    setRailCollapsed(isNarrowBand)
  }, [isNarrowBand, isMobileBand])
  const handleToggleRail = useCallback(() => {
    if (isMobileBand) { setRailSheetOpen(v => !v); return }
    railUserToggledRef.current = true
    setRailCollapsed(v => !v)
  }, [isMobileBand])
  // Matches `isMobileBand` (900px), not `isPhoneViewport` (640px) — below
  // 900px the inspector renders as an absolute-positioned, 62vh bottom-sheet
  // overlay (.ms-insp's own `@media (max-width: 900px)` rule in index.css),
  // not a side panel. Defaulting this to the phone-only breakpoint meant it
  // opened eagerly on tablet widths (641-900px) as that overlay, covering
  // the writing area's own placeholder/content underneath it on first load
  // (2026-08-27 manuscript-editor-redesign regression, caught by CI's
  // responsive-smoke spec failing at 768px — see docs/ROADMAP.md Bugs table).
  const [inspectorOpen, setInspectorOpen] = useState(() => !isMobileBand)
  // Also close if a later resize crosses into the overlay band. This catches
  // tablet rotation from landscape to portrait without fighting a user who
  // deliberately opens the inspector after already being in that band.
  useEffect(() => {
    if (!isMobileBand) return
    const timeout = window.setTimeout(() => {
      setInspectorOpen(prev => (prev ? false : prev))
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [isMobileBand])
  const [inspectorTab, setInspectorTab] = useState('scene') // 'scene' | 'notes' | 'format' | 'progress'
  const [surfaceId, setSurfaceId] = useState(null) // null | 'ai' | 'search' | 'history' | 'finalise'
  const [selectedCatalogueEntity, setSelectedCatalogueEntity] = useState(null)
  // Lazy initializer (not an effect) so this reads localStorage once, on
  // first render, rather than mounting with 'ai' and then correcting itself
  // a tick later via a setState-in-effect.
  const [lastSurfaceId, setLastSurfaceId] = useState(() => {
    try {
      return (activeNovel?.id && localStorage.getItem(`nf-manuscript-last-surface:${activeNovel.id}`)) || 'ai'
    } catch {
      return 'ai'
    }
  })
  // Three modes per spec §8 — persisted per project, same lazy-initializer
  // pattern as lastSurfaceId above (reads once on mount, no hydration
  // effect). 'edit' is the full apparatus and was this component's only
  // behavior before this step, so it's the fallback for a first-ever visit.
  const [mode, setMode] = useState(() => {
    try {
      return (activeNovel?.id && localStorage.getItem(`nf-manuscript-mode:${activeNovel.id}`)) || 'edit'
    } catch {
      return 'edit'
    }
  })
  const modeStorageKey = activeNovel?.id ? `nf-manuscript-mode:${activeNovel.id}` : null
  useEffect(() => {
    if (!modeStorageKey) return
    try { localStorage.setItem(modeStorageKey, mode) } catch { /* ignore */ }
  }, [modeStorageKey, mode])
  const [finalisedSubView, setFinalisedSubView] = useState('manuscript') // 'manuscript' | 'book'
  const handleSetMode = useCallback((next) => {
    setMode(next)
    // Surface closed in both Write ("Surface closed; AI + Inspector buttons
    // hidden") and Finalised ("Surface hidden") per the mode table — only
    // Edit leaves it as the user had it.
    if (next !== 'edit') { setSurfaceId(null) }
    // Write's rail defaults to the spine ("collapsed to spine (expandable)"
    // per the mode table) — a one-time default on entering the mode, not a
    // standing restriction, so the user can still expand it afterward via
    // the normal toggle.
    if (next === 'write') { setRailCollapsed(true) }
  }, [])
  const [highlightedNoteSeq, setHighlightedNoteSeq] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [formatSettings, setFormatSettings] = useState(loadFormat)
  // Scales with font size like the old single-mode column used to, so a
  // bigger font still gets a sensible measure instead of a fixed character
  // count regardless of size.
  const proseWidth = Math.round(Math.max(PROSE_WIDTH_BASE, PROSE_WIDTH_BASE * (formatSettings.fontSize / 19)))
  const [fullscreen, setFullscreen] = useState(false)
  const [saveState, setSaveState] = useState('saved') // 'saving' | 'saved'
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [conflictReviewOpen, setConflictReviewOpen] = useState(false)
  const [readerDraft, setReaderDraft] = useState({ projectId: null, draftId: null })
  const [finalizedReaderView, setFinalizedReaderView] = useState('scroll')
  const [finalizedPageIndex, setFinalizedPageIndex] = useState(0)
  const [versionHistorySceneId, setVersionHistorySceneId] = useState(null)
  const [pacingOpen, setPacingOpen] = useState(false)
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  const [liveSceneContent, setLiveSceneContent] = useState({})
  const [aiSelectionContext, setAiSelectionContext] = useState({ sceneId: null, text: '' })
  const { toast, toastNode } = useToast()
  // Scenes forced to mount a real SceneEditor regardless of viewport position — see
  // pinScene below. Bridges the gap between a programmatic jump/creation (which needs
  // editorRefs populated *now*, synchronously-ish) and the IntersectionObserver in
  // useSceneWindow.js actually catching up once the scroll lands.
  const [pinnedSceneIds, setPinnedSceneIds] = useState(() => new Set())

  const containerRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const editorRefs = useRef({})
  const { inView: scenesInView, registerElement: registerSceneElement, supported: virtualizationSupported } = useSceneWindow(scrollContainerRef)
  const sceneHeightCacheRef = useRef(new Map())
  const handleHeightMeasured = useCallback((sceneId, height) => {
    sceneHeightCacheRef.current.set(sceneId, height)
  }, [])
  const pinScene = useCallback((sceneId, duration = 1200) => {
    setPinnedSceneIds(prev => (prev.has(sceneId) ? prev : new Set(prev).add(sceneId)))
    window.setTimeout(() => {
      setPinnedSceneIds(prev => {
        if (!prev.has(sceneId)) return prev
        const next = new Set(prev)
        next.delete(sceneId)
        return next
      })
    }, duration)
  }, [])

  // handleOpenReferenceEntry (jump from a reference-panel click to a
  // character/location/lore/idea/timeline entry) is deliberately not carried
  // over here — WritingSidebar's Reference tab (ManuscriptReferencePanel,
  // the browse-everything panel this fed) has no home in the new inspector;
  // the handoff spec defers "reference" to the breadcrumb's ⌘K palette and
  // entity clicks. Entity clicks already work (handleEntityClick, used by
  // both SceneEditor's inline entity links and the inspector's Scene tab
  // chips) — the palette only searches scenes so far, not the full
  // character/location/lore/timeline set ManuscriptReferencePanel browsed.
  // That's a real, disclosed gap versus today, not an oversight: flagged in
  // the redesign's final report rather than rebuilt under time pressure.

  const activeScene = scenes.find(s => s.id === activeSceneId) ?? null
  const activeSceneForAI = activeScene
    ? {
        ...activeScene,
        content: Object.prototype.hasOwnProperty.call(liveSceneContent, activeScene.id)
          ? liveSceneContent[activeScene.id]
          : activeScene.content,
      }
    : null
  const activeAISelectionText = aiSelectionContext.sceneId === activeSceneId ? aiSelectionContext.text : ''
  const activeChapter = activeScene ? chapters.find(chapter => chapter.id === activeScene.chapterId) ?? null : null
  const isScriptProject = SCRIPT_TYPES.has(activeNovel?.type)
  const isNovelProject = (activeNovel?.type || 'novel') === 'novel'
  const isComicProject = activeNovel?.type === 'comic'
  const isCampaignProject = CAMPAIGN_PROJECT_TYPES.has(activeNovel?.type)

  const workspaceLabel = projectTypeConfig.workspaceLabel || 'Manuscript'
  const importTitle = isScriptProject
    ? 'Import a .docx draft into script beta'
    : `Import a .docx ${workspaceLabel.toLowerCase()}`
  const exportTitle = isScriptProject
    ? 'Export readable beta script as .docx'
    : `Export ${workspaceLabel.toLowerCase()} as .docx`
  const exportButtonLabel = isScriptProject ? 'Export Script' : 'Export'
  const finalizedDrafts = useMemo(
    () => Array.isArray(activeNovel?.finalizedDrafts) ? activeNovel.finalizedDrafts : [],
    [activeNovel]
  )
  const manuscriptCopies = useMemo(
    () => Array.isArray(activeNovel?.manuscriptCopies) ? activeNovel.manuscriptCopies : [],
    [activeNovel]
  )
  const readerDraftId = readerDraft.projectId === activeNovel?.id ? readerDraft.draftId : null
  const activeFinalizedDraft = useMemo(
    () => finalizedDrafts.find(draft => draft.id === readerDraftId) || null,
    [finalizedDrafts, readerDraftId]
  )

  // Derived entity lists for autocomplete
  const characterNames = useMemo(() => characters.map(c => c.name).filter(Boolean), [characters])
  const locationNames = useMemo(() => locations.map(l => l.name).filter(Boolean), [locations])

  const entityMap = useMemo(() => {
    const map = {}
    const put = (name, entity) => {
      if (name?.trim().length >= 2) map[name.trim().toLowerCase()] = entity
    }
    ;(characters || []).forEach(c => {
      const entity = { id: c.id, section: 'characters', sectionLabel: 'Character', name: c.name, preview: c.summary || c.description || c.notes || c.role || '' }
      put(c.name, entity)
      ;(c.keywords || []).forEach(kw => put(kw, entity))
    })
    ;(locations || []).forEach(l => {
      put(l.name, { id: l.id, section: 'locations', sectionLabel: 'Location', name: l.name, preview: l.description || l.notes || l.summary || '' })
    })
    ;(loreEntries || []).forEach(entry => {
      put(entry.title, { id: entry.id, section: 'lore', sectionLabel: 'Lore', name: entry.title, preview: entry.content || entry.summary || entry.category || '' })
    })
    ;[...(worldHistory || []), ...(timeline || [])].forEach(entry => {
      put(entry.title, { id: entry.id, section: 'worldhistory', sectionLabel: 'History', name: entry.title, preview: entry.content || entry.summary || entry.dateRange || entry.era || '' })
    })
    return map
  }, [characters, locations, loreEntries, worldHistory, timeline])

  // Autosave state tracking — wraps updateSceneContent with UI feedback. The
  // indicator itself only clears back to "saved" once the store's syncStatus
  // confirms the cloud push actually landed (see the effect below) — it used
  // to clear on a flat 2s timer regardless of whether the debounced cloud
  // save (or the network round-trip) had actually finished, so "wait for
  // Saved, then refresh" could still refresh before the edit reached the
  // cloud, letting another tab's reload load stale cloud data and overwrite
  // the edit (see the 2026-08-02/03 row in docs/ROADMAP.md's Bugs table).
  const handleContentUpdate = useCallback((sceneId, content) => {
    setLiveSceneContent(prev => ({ ...prev, [sceneId]: content }))
    updateSceneContent(sceneId, content)
    setSaveState('saving')
  }, [updateSceneContent])

  const handleLiveContentChange = useCallback((sceneId, content) => {
    setLiveSceneContent(prev => prev[sceneId] === content ? prev : { ...prev, [sceneId]: content })
  }, [])

  // On every debounced store commit's trailing edge, SceneEditor.jsx flushes the
  // localStorage draft (this call) immediately before calling onUpdate — which commits
  // to the store via commitLocal, writing the very same `nf_scenes` key moments later
  // (see the 2026-08-07 conflict-copy row in docs/ROADMAP.md for why the draft flush
  // has to happen there at all). Telling the store's commitLocal "I (this tab) already
  // wrote this" via recordLocalWrite means it recognizes its own sibling write instead
  // of re-reading/re-merging the whole account's scenes as if another tab might have
  // changed something — see the skip-check comment in useStore.js's commitLocal.
  const handlePersistDraft = useCallback((scene, content, options) => {
    const raw = persistSceneDraftToLocalStorage(scene, content, options)
    if (raw !== undefined) recordLocalWrite?.('nf_scenes', raw)
    return raw
  }, [recordLocalWrite])

  const handleRestoreVersion = useCallback((version) => {
    const scene = scenes.find(s => s.id === version.sceneId)
    if (!scene) return
    // Snapshot current state before restoring
    saveSceneVersion(scene)
    updateScene(scene.id, { content: version.content, title: version.title })
    setSaveState('saving')
  }, [scenes, updateScene])

  // Only report "saved" once the store confirms nothing is still syncing to
  // the cloud (see handleContentUpdate above for why this can't be a timer).
  // canSyncCloud-less sessions (offline/local-only) never leave 'idle', so
  // they fall through to "saved" immediately, matching the old timer's
  // behavior there.
  //
  // localStorageWarning also gates this (audit P0-07): it reflects whether
  // the *local* IndexedDB/desktop-vault write actually landed, which cloud
  // syncStatus knows nothing about — a browser tab with no cloud sync at all
  // (Free/local-only) used to always read "Saved" the moment the debounce
  // timer cleared, with zero connection to whether the on-device write
  // itself succeeded. A failed local write always wins over a successful
  // cloud sync here: the point of "Saved" is that this device won't lose the
  // edit, and a stale local write can still be true even while cloud sync
  // reports success from an earlier value.
  useEffect(() => {
    if (localStorageWarning) { setSaveState('error'); return }
    if (!syncStatus) return
    setSaveState(syncStatus.state === 'syncing' ? 'saving' : 'saved')
  }, [syncStatus, localStorageWarning])

  const handleReplaceInScene = useCallback((sceneId, newContent) => {
    handleContentUpdate(sceneId, newContent)
  }, [handleContentUpdate])

  // Fullscreen management
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch { /* Safari/iOS may reject */ }
  }, [])

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Jump to a scene requested from outside the manuscript (e.g. an AI finding's "open scene" link)
  useEffect(() => {
    if (!selectedSceneId) return
    if (scenes.some(s => s.id === selectedSceneId)) setActiveSceneId(selectedSceneId)
    setSelectedSceneId(null)
  }, [selectedSceneId, scenes, setSelectedSceneId, setActiveSceneId])

  // On first mount, scroll to the scene restored from the URL (e.g. after a page refresh
  // while writing) instead of leaving the view at the top of the manuscript.
  const restoredScrollRef = useRef(false)
  useEffect(() => {
    if (restoredScrollRef.current) return
    if (!activeSceneId) return
    if (!scenes.some(s => s.id === activeSceneId)) return
    restoredScrollRef.current = true
    requestAnimationFrame(() => {
      document.getElementById(`ms-scene-${activeSceneId}`)?.scrollIntoView({ behavior: 'auto', block: 'center' })
    })
  }, [activeSceneId, scenes])

  const [pageZoom, setPageZoom] = useState(1)
  const handlePageZoomChange = useCallback((nextZoom) => {
    setPageZoom(Math.min(1.5, Math.max(0.8, Number(nextZoom) || 1)))
  }, [])

  const handleFormatChange = useCallback((next) => {
    setFormatSettings(next)
    localStorage.setItem('nf-format-settings', JSON.stringify(next))
  }, [])

  const handleEntityClick = useCallback(entity => {
    if (!entity?.id || !entity?.section) return
    if (entity.section === 'characters') setSelectedCharacterId(entity.id)
    if (entity.section === 'locations') setSelectedLocationId(entity.id)
    if (entity.section === 'lore') setSelectedLoreEntryId?.(entity.id)
    if (entity.section === 'worldhistory') setSelectedTimelineEventId?.(entity.id)
    setSelectedCatalogueEntity(entity)
    setInspectorTab('catalogue')
    setInspectorOpen(true)
    setSurfaceId(null)
  }, [setSelectedCharacterId, setSelectedLocationId, setSelectedLoreEntryId, setSelectedTimelineEventId])

  const handleOpenEntitySection = useCallback(entity => {
    if (!entity?.id || !entity?.section) return
    if (entity.section === 'characters') setSelectedCharacterId(entity.id)
    if (entity.section === 'locations') setSelectedLocationId(entity.id)
    if (entity.section === 'lore') setSelectedLoreEntryId?.(entity.id)
    if (entity.section === 'worldhistory') setSelectedTimelineEventId?.(entity.id)
    window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: entity.section } }))
  }, [setSelectedCharacterId, setSelectedLocationId, setSelectedLoreEntryId, setSelectedTimelineEventId])

  const chapterGlobalNumbers = useMemo(() => {
    const map = {}
    let count = 1
    acts.forEach(act => {
      chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order).forEach(chap => { map[chap.id] = count++ })
    })
    return map
  }, [acts, chapters])

  const getChapterTitle = useCallback(chap => {
    const num = chapterGlobalNumbers[chap.id]
    const l2lower = labels.level2.toLowerCase()
    const isDefault = !chap.title || chap.title.toLowerCase().startsWith(l2lower)
    return isDefault ? `${labels.level2} ${num}` : `${labels.level2} ${num}: ${chap.title}`
  }, [chapterGlobalNumbers, labels])

  const liveScenes = useMemo(() => scenes.map(scene => (
    Object.prototype.hasOwnProperty.call(liveSceneContent, scene.id)
      ? { ...scene, content: liveSceneContent[scene.id] }
      : scene
  )), [liveSceneContent, scenes])

  // Re-splitting every scene's full text on every keystroke is fine for a short
  // manuscript but becomes the dominant cost once total length reaches tens of
  // thousands of words. `scenes` (the debounced store copy) only changes every
  // ~400ms while typing, so the full-manuscript pass belongs there; per-keystroke
  // work is then just a correction for whichever scene has an uncommitted live
  // edit, which is O(1) rather than O(manuscript length).
  const baseWordCount = useMemo(
    () => scenes.reduce((acc, s) => acc + countWords(s.content), 0),
    [scenes]
  )
  const sceneById = useMemo(() => new Map(scenes.map(s => [s.id, s])), [scenes])
  const totalWordCount = useMemo(() => {
    let total = baseWordCount
    for (const sceneId of Object.keys(liveSceneContent)) {
      const committed = sceneById.get(sceneId)
      const liveContent = liveSceneContent[sceneId]
      if (!committed || committed.content === liveContent) continue
      total += countWords(liveContent) - countWords(committed.content)
    }
    return total
  }, [baseWordCount, liveSceneContent, sceneById])

  const manuscriptCopyStats = useMemo(() => ({
    acts: acts.length,
    chapters: chapters.length,
    scenes: scenes.length,
    words: totalWordCount,
  }), [acts.length, chapters.length, scenes.length, totalWordCount])

  // Finalised MODE (spec §8) is a live, read-only view of the *current*
  // manuscript — distinct from the Surface's Finalise pane / "Open reader",
  // which shows a specific frozen buildFinalizedDraft snapshot saved to
  // activeNovel.finalizedDrafts. This one is never persisted; it's rebuilt
  // whenever the underlying content changes, same as everything else this
  // component already derives live from acts/chapters/scenes.
  const liveFinalizedDraft = useMemo(() => {
    if (mode !== 'final' || !isNovelProject) return null
    return buildFinalizedDraft({
      novel: activeNovel,
      acts, chapters, scenes, labels,
      title: activeNovel?.title || 'Untitled',
    })
  }, [mode, isNovelProject, activeNovel, acts, chapters, scenes, labels])

  const handleRetireManuscript = useCallback((title) => {
    const copy = retireManuscript?.(title)
    if (!copy) return
    setLiveSceneContent({})
    setReaderDraft({ projectId: null, draftId: null })
    setCatalogueOpen(false)
  }, [retireManuscript])

  const handleRestoreManuscriptCopy = useCallback((copyId, options) => {
    const copy = restoreManuscriptCopy?.(copyId, options)
    if (!copy) return
    setLiveSceneContent({})
    setReaderDraft({ projectId: null, draftId: null })
    setCatalogueOpen(false)
  }, [restoreManuscriptCopy])

  const handleDownloadManuscriptCopy = useCallback(async (copy) => {
    if (!copy) return
    const copyChapterNumbers = {}
    let count = 1
    ;(copy.acts || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach(act => {
        ;(copy.chapters || [])
          .filter(chapter => chapter.actId === act.id)
          .sort((a, b) => a.order - b.order)
          .forEach(chapter => { copyChapterNumbers[chapter.id] = count++ })
      })
    const copyTitle = copy.title || 'Retired manuscript'
    await exportToDocx(
      { ...activeNovel, title: `${activeNovel?.title || copy.projectTitle || 'Untitled'} - ${copyTitle}` },
      copy.acts || [],
      copy.chapters || [],
      copy.scenes || [],
      copyChapterNumbers
    )
  }, [activeNovel])

  const handleFinaliseDraft = useCallback(() => {
    if (!activeNovel?.id || !isNovelProject) return
    const now = new Date()
    const defaultTitle = `Final draft ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    const title = window.prompt('Name this finalized draft copy', defaultTitle)
    if (title === null) return

    const draft = buildFinalizedDraft({
      novel: activeNovel,
      acts,
      chapters,
      scenes,
      labels,
      title: title.trim() || defaultTitle,
    })

    const confirmed = window.confirm(
      `Create an uneditable reading copy of the current manuscript?\n\nThis will not lock your working draft.`
    )
    if (!confirmed) return

    updateNovel(activeNovel.id, {
      finalizedDrafts: [draft, ...finalizedDrafts].slice(0, 20),
      lastFinalizedDraftAt: draft.finalizedAt,
    })
    setReaderDraft({ projectId: activeNovel.id, draftId: draft.id })
    setFinalizedReaderView('pages')
    setFinalizedPageIndex(0)
  }, [activeNovel, isNovelProject, acts, chapters, scenes, labels, finalizedDrafts, updateNovel])

  // Built from `scenes` (the debounced store copy), not `liveScenes` — the act/chapter/scene
  // ordering doesn't depend on in-progress keystrokes, so keying this off liveScenes was
  // rebuilding the entire manuscript's flattened render list (and handing every SceneEditor
  // a new `scene` object, defeating memoization) on every keystroke anywhere in the
  // manuscript. This now only recomputes when structure changes or a scene's debounced
  // content lands (~every 400ms while typing, not every keystroke). Live content for the
  // scene actually being edited is merged back in at render time, just for that one scene.
  const orderedContent = useMemo(() => {
    const result = []
    acts.forEach(act => {
      const actChapters = chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order)
      result.push({ type: 'act', act, hasChapters: actChapters.length > 0 })
      actChapters.forEach(chap => {
        const chapScenes = scenes.filter(s => s.chapterId === chap.id).sort((a, b) => a.order - b.order)
        result.push({ type: 'chapter', chap, hasScenes: chapScenes.length > 0 })
        chapScenes.forEach((scene, idx) => {
          result.push({ type: 'scene', scene, sceneIndex: idx, chapterSceneCount: chapScenes.length, chap })
        })
      })
    })
    return result
  }, [acts, chapters, scenes])

  // Under scene virtualization, a scene id that has never appeared before might land
  // outside the current viewport window (e.g. a scene added from the Outline sidebar's
  // own "+ Add Scene", which doesn't go through handleAddScene below) and briefly render
  // as a placeholder — with no mounted SceneEditor to receive the focus() call whoever
  // just created it is about to make. Pin every newly-seen scene id for a couple of
  // seconds so it's always a real, mounted editor when a caller does the followup
  // focus/scrollIntoView. `known === null` on the very first run means "just mounted the
  // manuscript" — those aren't new, so don't pin the entire (possibly 80k-word) document.
  const knownSceneIdsRef = useRef(null)
  useEffect(() => {
    const currentIds = new Set(scenes.map(s => s.id))
    const known = knownSceneIdsRef.current
    if (known === null) {
      knownSceneIdsRef.current = currentIds
      return
    }
    for (const id of currentIds) {
      if (!known.has(id)) pinScene(id, 1500)
    }
    knownSceneIdsRef.current = currentIds
  }, [scenes, pinScene])

  const handleSplitScene = (sceneId, chapterId, before, after) => {
    updateSceneContent(sceneId, before)
    const newScene = addScene(chapterId, labels.level3)
    pinScene(newScene.id, 2000)
    setTimeout(() => {
      updateSceneContent(newScene.id, after)
      editorRefs.current[newScene.id]?.focus({ placeCursor: 'end' })
      editorRefs.current[newScene.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  const handleAddScene = chapterId => {
    const newScene = addScene(chapterId, labels.level3)
    pinScene(newScene.id, 2000)
    setTimeout(() => {
      editorRefs.current[newScene.id]?.focus({ placeCursor: 'end' })
      editorRefs.current[newScene.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  const handleNoteClick = seq => {
    setHighlightedNoteSeq(seq)
    setTimeout(() => setHighlightedNoteSeq(null), 2000)
  }

  const handleAppendToScene = useCallback((sceneId, text) => {
    const ref = editorRefs.current[sceneId]
    if (ref?.appendContent) {
      ref.appendContent(text)
    } else {
      // Fallback: write directly to store (editor syncs on next blur)
      const scene = scenes.find(s => s.id === sceneId)
      if (!scene) return
      const cur = scene.content?.trimEnd() || ''
      handleContentUpdate(sceneId, cur + (cur ? '\n\n' : '') + text)
    }
  }, [scenes, handleContentUpdate])

  const handleReplaceSelection = useCallback((sceneId, text) => {
    const ref = editorRefs.current[sceneId]
    if (ref?.replaceSelection) {
      ref.replaceSelection(text)
      return
    }
    const scene = scenes.find(s => s.id === sceneId)
    if (!scene) return
    handleContentUpdate(sceneId, text)
  }, [scenes, handleContentUpdate])

  // Writing goals — persisted on activeNovel via updateNovel
  const activeNovelId = activeNovel?.id
  const writingGoals = useMemo(() => {
    const goals = activeNovel?.writingGoals ?? {}
    const manuscript = goals.manuscript ?? activeNovel?.wordCountTarget ?? activeNovel?.wordTarget ?? activeNovel?.targetWords ?? projectTypeConfig.defaultWordTarget ?? 0
    return { ...goals, manuscript: Number(manuscript) || 0 }
  }, [activeNovel?.writingGoals, activeNovel?.wordCountTarget, activeNovel?.wordTarget, activeNovel?.targetWords, projectTypeConfig.defaultWordTarget])

  const handleUpdateGoals = useCallback((newGoals) => {
    if (!activeNovelId) return
    let goalsToSave = { ...writingGoals, ...newGoals }
    if (Object.prototype.hasOwnProperty.call(newGoals, 'daily')) {
      const recordedDailyGoal = withDailyGoalHistory(writingGoals, newGoals.daily)
      goalsToSave = {
        ...goalsToSave,
        daily: recordedDailyGoal.daily,
        dailyHistory: recordedDailyGoal.dailyHistory,
      }
    }
    updateNovel(activeNovelId, {
      writingGoals: goalsToSave,
      ...(Object.prototype.hasOwnProperty.call(goalsToSave, 'manuscript')
        ? { wordCountTarget: Number(goalsToSave.manuscript) || null, wordTarget: Number(goalsToSave.manuscript) || null }
        : {}),
    })
  }, [activeNovelId, updateNovel, writingGoals])

  // Template application
  const handleApplyTemplate = useCallback(async (template, { withChapters, withScenes }) => {
    // Create acts sequentially — order matters so we use the template array order
    for (let ai = 0; ai < template.acts.length; ai++) {
      const tAct = template.acts[ai]
      const newAct = addAct(tAct.title)
      if (tAct.guidance) updateAct(newAct.id, { guidance: tAct.guidance })

      if (withChapters) {
        for (let ci = 0; ci < tAct.chapters.length; ci++) {
          const tChap = tAct.chapters[ci]
          const newChap = addChapter(newAct.id, tChap.title)
          if (isCampaignProject && tChap.guidance) {
            updateChapter(newChap.id, {
              guidance: tChap.guidance,
              sessionPlan: { notes: tChap.guidance },
            })
          } else if (tChap.guidance) {
            updateChapter(newChap.id, { guidance: tChap.guidance })
          }

          if (withScenes) {
            addScene(newChap.id, labels.level3)
          }
        }
      }
    }

    // Set manuscript word-count goal from template if no goal yet
    if (template.targetWords && !writingGoals.manuscript) {
      handleUpdateGoals({ ...writingGoals, manuscript: template.targetWords })
    }
  }, [addAct, addChapter, addScene, updateAct, updateChapter, labels.level3, writingGoals, handleUpdateGoals, isCampaignProject])

  const handleDocxImport = useCallback(async (importedActs) => {
    for (const tAct of importedActs) {
      const newAct = addAct(tAct.title)
      for (const tChap of tAct.chapters) {
        const newChap = addChapter(newAct.id, tChap.title)
        for (const tScene of tChap.scenes) {
          const newScene = addScene(newChap.id, tScene.title || labels.level3)
          if (tScene.content?.trim()) {
            updateSceneContent(newScene.id, tScene.content)
          }
        }
        // Ensure at least one empty scene per chapter
        if (tChap.scenes.length === 0) {
          addScene(newChap.id, labels.level3)
        }
      }
    }
  }, [addAct, addChapter, addScene, updateSceneContent, labels.level3])

  // useCallback (this wasn't memoized before the redesign) so
  // handleOverflowAction below — which now needs to call the current
  // handleExport for the overflow menu's Export item — doesn't get a new
  // function identity on every render as a side effect of depending on it.
  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      await exportToDocx(activeNovel, acts, chapters, scenes, chapterGlobalNumbers)
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }, [activeNovel, acts, chapters, scenes, chapterGlobalNumbers])

  // Navigate from sidebar click
  const handleSelectScene = useCallback((sceneId) => {
    setActiveSceneId(sceneId)
    requestAnimationFrame(() => {
      document.getElementById(`ms-scene-${sceneId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    setTimeout(() => editorRefs.current[sceneId]?.focus({ placeCursor: 'end' }), 200)
  }, [setActiveSceneId])

  // Clicking a virtualized-away scene's placeholder (see SceneSlot above) — setting it
  // active forces a real SceneEditor to mount (same as any other click-to-activate
  // path), then focus it once that's happened. Unlike a precise preview click
  // (SceneEditor.jsx's activateAt), there's no rendered text yet to hit-test a click
  // position against, so this lands the caret at the end rather than exactly where the
  // user clicked — an acceptable trade for a case that should be rare in practice
  // (placeholders only show scenes well outside the current scroll position).
  const handleActivatePlaceholder = useCallback((sceneId) => {
    pinScene(sceneId, 1000)
    setActiveSceneId(sceneId)
    setTimeout(() => editorRefs.current[sceneId]?.focus({ placeCursor: 'end' }), 60)
  }, [pinScene, setActiveSceneId])

  const handleSelectChapter = useCallback((chapId) => {
    requestAnimationFrame(() => {
      document.getElementById(`ms-chap-${chapId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  // Breadcrumb: act · chapter · scene for whichever scene last took focus
  // (onFocus on every SceneEditor already keeps activeSceneId current — see
  // handleSelectScene/the SceneEditor render below — so this satisfies "the
  // scene under the caret, including after a rail jump" without a second
  // scroll-position observer; scenesInView from useSceneWindow remains the
  // one and only IntersectionObserver in this file).
  const activeAct = activeChapter ? acts.find(a => a.id === activeChapter.actId) : null
  const breadcrumbPath = activeAct || activeChapter || activeScene
    ? [
        activeAct?.title,
        activeChapter ? getChapterTitle(activeChapter) : null,
        activeScene ? (activeScene.title && activeScene.title !== 'Scene' ? activeScene.title : labels.level3) : null,
      ].filter(Boolean).join(' · ')
    : ''

  // Surfaces: one at a time, opening another replaces it, closing remembers
  // lastSurfaceId (persisted per project, hydrated by the lazy useState
  // initializer above) so ⌘J/re-opening the AI button returns to whatever
  // was last open — spec §5.1.
  const lastSurfaceStorageKey = activeNovel?.id ? `nf-manuscript-last-surface:${activeNovel.id}` : null
  useEffect(() => {
    if (!lastSurfaceStorageKey) return
    try { localStorage.setItem(lastSurfaceStorageKey, lastSurfaceId) } catch { /* ignore */ }
  }, [lastSurfaceStorageKey, lastSurfaceId])

  // A surface (AI/Search/History/Finalise) and the inspector are never open
  // at once — opening one closes the other, in every entry point below.
  const handleToggleSurface = useCallback((id) => {
    setSurfaceId(current => {
      if (current === id) return null
      setLastSurfaceId(id)
      setInspectorOpen(false)
      return id
    })
  }, [])

  const handleOpenLastSurface = useCallback(() => {
    setSurfaceId(current => {
      const next = current ? null : lastSurfaceId
      if (next) setInspectorOpen(false)
      return next
    })
  }, [lastSurfaceId])

  const handleCloseSurface = useCallback(() => setSurfaceId(null), [])

  // Mobile bottom bar (≤900px): one of four surfaces at a time — Outline
  // (rail sheet), Write (bare manuscript), Inspector (bottom sheet), AI.
  // Only one is ever open at a time, matching the desktop rule above that a
  // topbar surface and the inspector are mutually exclusive.
  const mobileTab = railSheetOpen ? 'outline' : surfaceId === 'ai' ? 'ai' : inspectorOpen ? 'inspect' : 'write'
  const handleMobileTab = useCallback((tab) => {
    setRailSheetOpen(tab === 'outline')
    setInspectorOpen(tab === 'inspect')
    setSurfaceId(tab === 'ai' ? 'ai' : null)
  }, [])

  // Details (SceneEditor's new header button) and Ask AI (the selection bar)
  // both need the inspector/surface open AND pointed at the scene the user
  // was just looking at, not necessarily whatever activeSceneId already was.
  const handleOpenSceneDetails = useCallback((sceneId) => {
    setActiveSceneId(sceneId)
    setInspectorTab('scene')
    setInspectorOpen(true)
    setSurfaceId(null)
  }, [setActiveSceneId])

  const handleAskAI = useCallback((sceneId) => {
    setActiveSceneId(sceneId)
    handleToggleSurface('ai')
  }, [setActiveSceneId, handleToggleSurface])

  const handleOpenNotesInspector = useCallback(() => {
    setInspectorTab('notes')
    setInspectorOpen(true)
    setSurfaceId(null)
  }, [])

  const handleOverflowAction = useCallback((actionId) => {
    switch (actionId) {
      case 'search': handleToggleSurface('search'); break
      case 'pacing': setPacingOpen(true); break
      case 'template': setTemplateModalOpen(true); break
      case 'import': setImportModalOpen(true); break
      case 'history':
        setVersionHistorySceneId(activeSceneId)
        handleToggleSurface('history')
        break
      case 'finalise': handleToggleSurface('finalise'); break
      case 'export': handleExport(); break
      case 'catalogue': setCatalogueOpen(true); break
      default: break
    }
  }, [handleToggleSurface, activeSceneId, handleExport])

  // Global shortcuts not already owned by a child (⌘K's go-to-scene palette
  // and ⌘' 's note action are local to ManuscriptTopbar/SceneEditor
  // respectively — see their own keydown handling).
  useEffect(() => {
    const handler = event => {
      const meta = event.metaKey || event.ctrlKey
      // Esc chain: reader before surfaces.
      if (event.key === 'Escape' && mode === 'final') {
        event.preventDefault()
        handleSetMode('edit')
        return
      }
      if (event.key === 'Escape' && surfaceId) {
        event.preventDefault()
        handleCloseSurface()
        return
      }
      if (!meta) return
      if (event.key === '\\') { event.preventDefault(); setRailCollapsed(v => !v); return }
      if (event.key.toLowerCase() === 'f' && !activeFinalizedDraft) { event.preventDefault(); handleToggleSurface('search'); return }
      if (event.key.toLowerCase() === 'j') { event.preventDefault(); handleOpenLastSurface(); return }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceId, activeFinalizedDraft, mode])

  if (isComicProject) return <ComicPlanner store={store} />

  return (
    <div ref={containerRef} className={`manuscript-processor flex flex-col h-full bg-[var(--bg-main)] text-[var(--text-main)] overflow-hidden font-serif${fullscreen ? ' is-fullscreen' : ''}`}>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      {activeFinalizedDraft ? (
        // Transitional reading header for the current activeFinalizedDraft
        // swap — step 8 replaces this whole branch with FinalizedReader as a
        // proper full-screen reader over the editor (Esc exits back to Edit)
        // per the handoff spec's three-modes work; this preserves today's
        // working "view a finalized draft" behavior in the meantime rather
        // than dropping it while that's still unbuilt.
        <div className="ms-topbar font-sans" data-tour="manuscript-toolbar">
          <div className="ms-topbar-zone ms-topbar-zone-left">
            <button type="button" className="ms-topbar-btn" onClick={() => setReaderDraft({ projectId: null, draftId: null })}>
              ← Working draft
            </button>
            <span className="ms-topbar-crumb-title">{decodeHtmlEntities(activeFinalizedDraft.title) || 'Final draft'}</span>
          </div>
          <div className="ms-topbar-zone ms-topbar-zone-mid">
            <div className="ms-modes" role="group" aria-label="Finalized reader view">
              <button type="button" className={finalizedReaderView === 'scroll' ? 'is-on' : ''} onClick={() => setFinalizedReaderView('scroll')}>Scroll</button>
              <button type="button" className={finalizedReaderView === 'pages' ? 'is-on' : ''} onClick={() => { setFinalizedReaderView('pages'); setFinalizedPageIndex(0) }}>Pages</button>
            </div>
          </div>
          <div className="ms-topbar-zone ms-topbar-zone-tools">
            {finalizedDrafts.length > 1 && (
              <select
                className="ms-toolbar-select"
                value={readerDraftId || ''}
                onChange={event => {
                  setReaderDraft({ projectId: activeNovel?.id || null, draftId: event.target.value || null })
                  setFinalizedPageIndex(0)
                }}
                title="View a different finalized draft"
                aria-label="View a different finalized draft"
              >
                {finalizedDrafts.map(draft => (
                  <option key={draft.id} value={draft.id}>{decodeHtmlEntities(draft.title) || 'Final draft'}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      ) : (
        <ManuscriptTopbar
          projectTitle={activeNovel?.title}
          breadcrumbPath={breadcrumbPath}
          acts={acts}
          chapters={chapters}
          scenes={scenes}
          labels={labels}
          onSelectScene={handleSelectScene}
          railCollapsed={railCollapsed}
          onToggleRail={handleToggleRail}
          mode={mode}
          onSetMode={handleSetMode}
          saveState={saveState}
          wordCount={totalWordCount}
          aiOpen={surfaceId === 'ai'}
          onToggleAI={() => handleToggleSurface('ai')}
          inspectorOpen={inspectorOpen}
          onToggleInspector={() => setInspectorOpen(v => {
            const next = !v
            if (next) setSurfaceId(null)
            return next
          })}
          hideAIAndInspector={mode !== 'edit'}
          onOverflowAction={handleOverflowAction}
          conflictCount={sceneConflicts.length}
          onOpenConflicts={() => setConflictReviewOpen(true)}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          zoomControl={<ManuscriptZoomControl pageZoom={pageZoom} onPageZoomChange={handlePageZoomChange} />}
          scriptBetaBadge={isScriptProject && (
            <span className="ms-toolbar-badge" title="Readable script export is available; industry formatting is still in progress.">
              Script beta
            </span>
          )}
          overflowItemTitles={{ import: importTitle, export: exportTitle }}
        />
      )}

      {/* ── Body: writing area + right sidebar ──────────────── */}
      {activeFinalizedDraft ? (
        <div className="flex flex-1 overflow-hidden">
          <FinalizedReader
            draft={activeFinalizedDraft}
            viewMode={finalizedReaderView}
            pageIndex={finalizedPageIndex}
            onPageIndexChange={setFinalizedPageIndex}
          />
        </div>
      ) : mode === 'final' ? (
        // Finalised MODE (not activeFinalizedDraft above, a saved snapshot —
        // this is the live current manuscript, read-only, rail/inspector/
        // surface all hidden per the mode table). Its own Manuscript/Book
        // switch sits next to Export, per spec §8.
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="ms-topbar font-sans">
            <div className="ms-topbar-zone ms-topbar-zone-left">
              <div className="ms-modes" role="group" aria-label="Finalised view">
                <button type="button" className={finalisedSubView === 'manuscript' ? 'is-on' : ''} onClick={() => setFinalisedSubView('manuscript')}>Manuscript</button>
                <button type="button" className={finalisedSubView === 'book' ? 'is-on' : ''} onClick={() => setFinalisedSubView('book')}>Book</button>
              </div>
            </div>
            <div className="ms-topbar-zone ms-topbar-zone-tools">
              <button type="button" className="ms-topbar-btn" onClick={handleExport} disabled={exporting}>
                {exporting ? 'Exporting…' : exportButtonLabel}
              </button>
            </div>
          </div>
          {!isNovelProject ? (
            <div className="ms-insp-empty">Finalised mode's read view is available for novel-type projects.</div>
          ) : finalisedSubView === 'book' ? (
            <ManuscriptBookView draft={liveFinalizedDraft} projectTitle={activeNovel?.title} />
          ) : (
            <FinalizedReader draft={liveFinalizedDraft} viewMode="scroll" pageIndex={0} onPageIndexChange={() => {}} />
          )}
        </div>
      ) : (
      <div className="flex flex-1 overflow-hidden relative">

        {/* Left rail. Write mode's rail defaults to
            the spine on entry (see handleSetMode) but stays user-togglable
            ("expandable" per the mode table); Finalised hides it entirely,
            handled by the branch above rather than a prop here. */}
        {(
          <ManuscriptRail
            acts={acts}
            chapters={chapters}
            scenes={scenes}
            addAct={addAct}
            addChapter={addChapter}
            addScene={addScene}
            updateAct={updateAct}
            updateChapter={updateChapter}
            updateScene={updateScene}
            deleteAct={deleteAct}
            deleteChapter={deleteChapter}
            deleteScene={deleteScene}
            moveAct={moveAct}
            moveChapter={moveChapter}
            moveScene={moveScene}
            activeSceneId={activeSceneId}
            onSelectScene={handleSelectScene}
            onSelectChapter={handleSelectChapter}
            labels={labels}
            totalWordCount={totalWordCount}
            collapsed={railCollapsed && !isMobileBand}
            onToggleCollapsed={handleToggleRail}
            mobileSheetOpen={railSheetOpen}
          />
        )}

        {/* Writing area */}
        <main ref={scrollContainerRef} data-tour="manuscript-editor" className="manuscript-page ms-scroll-container workspace-page flex-1 overflow-y-auto scroll-smooth min-w-0">
          <div
            className="manuscript-document mx-auto py-16 px-6 md:px-12"
            style={{
              zoom: pageZoom,
              // Prose width is shared between Write and Edit via --ms-prose-w
              // (see .ms-scene-body/.ms-scene-body--write in index.css) so the
              // line length never changes between modes -- Edit's document is
              // simply PROSE_GUTTER_RESERVE px wider than Write's, and that
              // extra width belongs to the note gutter, not the prose column.
              // The 1080 base is tuned to read as "nearly the whole page" on a
              // typical wide laptop/desktop screen rather than a traditional
              // narrow reading column, per an explicit request, while still
              // leaving enough room next to it for the gutter (see
              // PROSE_GUTTER_RESERVE) to actually fit on a common ~1920px
              // screen with both the rail and inspector open -- a wider base
              // reads nicer alone but pushes the gutter's container-query
              // drop-out threshold past what most desktop screens can offer.
              // Still scales with font size like before so bigger text keeps
              // a sensible measure instead of a fixed character count
              // regardless of size.
              // min(100%, …) keeps this from fighting the mobile full-width
              // override below 640px, since inline styles otherwise take
              // precedence over that media query.
              '--ms-prose-w': `${proseWidth}px`,
              maxWidth: `min(100%, ${proseWidth + MANUSCRIPT_DOC_PADDING + (mode === 'write' ? 0 : PROSE_GUTTER_RESERVE)}px)`,
            }}
          >

            {acts.length === 0 && (
              <div className="empty-state mt-32 font-sans">
                <p className="text-lg mb-2 font-semibold">Nothing to write yet.</p>
                <p className="text-sm mb-4 opacity-70">Start from a template or add your first {labels.level1} manually.</p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <button
                    onClick={() => setTemplateModalOpen(true)}
                    className="btn btn-primary"
                  >
                    Choose a template
                  </button>
                  <button
                    onClick={() => addAct(`${labels.level1} 1`)}
                    className="btn btn-secondary"
                  >
                    + {labels.level1}
                  </button>
                </div>
              </div>
            )}

            {orderedContent.map(item => {
              if (item.type === 'act') return (
                <div key={`act-${item.act.id}`} className="mt-16 first:mt-0 mb-2">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-[var(--border)]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-[var(--text-muted)]">
                      {item.act.title}
                    </span>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                  </div>
                </div>
              )

              if (item.type === 'chapter') return (
                <div key={`chap-${item.chap.id}`} id={`ms-chap-${item.chap.id}`} className="pt-14 pb-8 text-center font-sans">
                  <h2 className="text-[var(--accent)] text-xs font-black uppercase tracking-[0.5em] mb-1 opacity-80">
                    {getChapterTitle(item.chap)}
                  </h2>
                  {item.chap.title && !item.chap.title.toLowerCase().startsWith(labels.level2.toLowerCase()) && (
                    <p className="text-[var(--text-muted)] text-sm italic mt-1 opacity-70">{item.chap.title}</p>
                  )}
                  <div className="w-8 h-px bg-[var(--border)] mx-auto mt-4 rounded-full" />
                  {!item.hasScenes && (
                    <button onClick={() => handleAddScene(item.chap.id)} className="manuscript-add-scene mt-6 font-sans">
                      + Add {labels.level3}
                    </button>
                  )}
                  {isCampaignProject && (
                    <CampaignSessionWorkflow
                      chapter={item.chap}
                      encounters={liveScenes.filter(scene => scene.chapterId === item.chap.id).sort((a, b) => a.order - b.order)}
                      labels={labels}
                      projectType={activeNovel?.type}
                      onUpdateChapter={updateChapter}
                    />
                  )}
                </div>
              )

              if (item.type === 'scene') {
                const { sceneIndex, chapterSceneCount, chap } = item
                // Merge in-progress content back in only for this one scene, at the point
                // it's actually rendered — see the orderedContent comment above.
                const scene = Object.prototype.hasOwnProperty.call(liveSceneContent, item.scene.id)
                  ? { ...item.scene, content: liveSceneContent[item.scene.id] }
                  : item.scene
                const isLastInChapter = sceneIndex === chapterSceneCount - 1
                // See useSceneWindow.js / SceneSlot above: only mount a real SceneEditor
                // (textarea or ContentPreview) for the currently-active scene, a
                // recently-navigated-to/created one, or one within/near the viewport —
                // everything else renders as a fixed-height placeholder. This is the
                // architectural fix the 2026-08-06/08 typing-lag row in
                // docs/ROADMAP.md landed on: keeping every scene's DOM mounted meant any
                // layout-forcing read anywhere on the page had the *whole* manuscript's
                // DOM to lay out, not just the visible part.
                const mount = !virtualizationSupported || scene.id === activeSceneId || pinnedSceneIds.has(scene.id) || scenesInView.has(scene.id)
                return (
                  <div key={`scene-${scene.id}`}>
                    {sceneIndex > 0 && (
                      <div className="py-10 flex items-center justify-center">
                        <div className="flex gap-3 items-center opacity-25 hover:opacity-60 transition-opacity">
                          <div className="w-10 h-px bg-[var(--border)]" />
                          <div className="flex gap-2">
                            <div className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                            <div className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                          </div>
                          <div className="w-10 h-px bg-[var(--border)]" />
                        </div>
                      </div>
                    )}

                    <SceneSlot
                      sceneId={scene.id}
                      mount={mount}
                      title={scene.title && scene.title !== 'Scene' ? scene.title : `Scene ${sceneIndex + 1}`}
                      estimatedHeight={sceneHeightCacheRef.current.get(scene.id) ?? estimateSceneHeight(scene, formatSettings)}
                      registerElement={registerSceneElement}
                      onHeightMeasured={handleHeightMeasured}
                      onActivatePlaceholder={handleActivatePlaceholder}
                    >
                      <SceneEditor
                        scene={scene}
                        sceneIndex={sceneIndex}
                        onUpdate={handleContentUpdate}
                        onUpdateScene={updateScene}
                        onSplit={handleSplitScene}
                        innerRef={proxy => {
                          if (proxy) editorRefs.current[scene.id] = proxy
                          else delete editorRefs.current[scene.id]
                        }}
                        onFocus={() => setActiveSceneId(scene.id)}
                        entityMap={entityMap}
                        onEntityClick={handleEntityClick}
	                        onOpenNotes={handleOpenNotesInspector}
	                        onNoteClick={handleNoteClick}
	                        highlightedNoteSeq={highlightedNoteSeq}
	                        formatSettings={formatSettings}
                        onPersistDraft={handlePersistDraft}
                        onLiveContentChange={handleLiveContentChange}
                        onSelectionContextChange={text => setAiSelectionContext({ sceneId: scene.id, text })}
                        onOpenVersionHistory={id => { setVersionHistorySceneId(id); handleToggleSurface('history') }}
                        onOpenSceneDetails={handleOpenSceneDetails}
                        onAskAI={handleAskAI}
                        mode={mode === 'write' ? 'write' : 'edit'}
                        projectType={activeNovel?.type || 'novel'}
                        caretFollowEnabled={false}
                        scrollContainerRef={scrollContainerRef}
                        pageZoom={pageZoom}
                        keepEditingOnExternalBlur={surfaceId === 'ai'}
                      />
                    </SceneSlot>

                    {isLastInChapter && (
                      <div className="mt-10 text-center font-sans">
                        <button onClick={() => handleAddScene(chap.id)} className="manuscript-add-scene">
                          + {labels.level3}
                        </button>
                      </div>
                    )}
                  </div>
                )
              }

              return null
            })}

            {/* Bottom padding for comfortable scrolling */}
            <div className="h-[40vh]" />
          </div>
        </main>

        {/* Inspector — Scene/Notes/Catalogue/Format/Progress. */}
        {inspectorOpen && (
          <ManuscriptInspector
            activeTab={inspectorTab}
            onSetTab={setInspectorTab}
            onClose={() => setInspectorOpen(false)}
            scene={activeScene}
            onUpdateScene={updateScene}
            characterNames={characterNames}
            locationNames={locationNames}
            entityMap={entityMap}
            onEntityClick={handleEntityClick}
            characters={characters}
            locations={locations}
            factions={factions}
            currentYear={currentYear}
            loreEntries={loreEntries}
            worldHistory={worldHistory?.length ? worldHistory : timeline}
            selectedCatalogueEntity={selectedCatalogueEntity}
            onOpenEntitySection={handleOpenEntitySection}
            highlightedNoteSeq={highlightedNoteSeq}
            formatSettings={formatSettings}
            onFormatChange={handleFormatChange}
            scenes={scenes}
            chapters={chapters}
            writingGoals={writingGoals}
            onUpdateGoals={handleUpdateGoals}
          />
        )}

        {/* Surface — AI/Search/History/Finalise, one at a time. Sits in normal
            flex flow now (see .ms-surface in index.css) rather than
            absolutely overlaying the inspector — the two are mutually
            exclusive (never both open, see handleToggleSurface etc. above),
            so there's nothing left to overlay, and opening either now makes
            room for itself the same way. */}
        <ManuscriptSurface
          activeSurface={surfaceId}
          onClose={handleCloseSurface}
          contextLabel={activeScene ? (activeScene.title && activeScene.title !== 'Scene' ? activeScene.title : labels.level3) : undefined}
          activeScene={activeSceneForAI}
          activeNovel={activeNovel}
          characters={characters}
          locations={locations}
          selectedText={activeAISelectionText}
          onAppendToScene={handleAppendToScene}
          onReplaceSelection={handleReplaceSelection}
          userId={userId}
          membership={membership}
          scenes={scenes}
          chapters={chapters}
          acts={acts}
          activeNovelId={activeNovel?.id}
          onOpenScene={handleSelectScene}
          onReplaceInScene={handleReplaceInScene}
          historyScene={scenes.find(s => s.id === versionHistorySceneId) ?? null}
          onRestoreVersion={handleRestoreVersion}
          labels={labels}
          finaliseStats={manuscriptCopyStats}
          isNovelProject={isNovelProject}
          finalizedDrafts={finalizedDrafts}
          onFinalise={handleFinaliseDraft}
          onOpenFinalizedDraft={(draftId) => {
            setReaderDraft({ projectId: activeNovel?.id || null, draftId })
            setFinalizedReaderView('pages')
            setFinalizedPageIndex(0)
            handleCloseSurface()
          }}
          onOpenCatalogue={() => setCatalogueOpen(true)}
          onExport={handleExport}
          exporting={exporting}
          exportButtonLabel={exportButtonLabel}
          onToast={toast}
        />
      </div>
      )}

      {/* Mobile-only (≤900px, CSS-hidden above that) bottom bar — hidden
          during focused writing and while viewing a finalized draft, same
          as the desktop chrome those two states already hide. */}
      {!activeFinalizedDraft && (
        <nav className="ms-tabbar font-sans" aria-label="Manuscript navigation">
          <button type="button" className={mobileTab === 'outline' ? 'is-on' : ''} onClick={() => handleMobileTab('outline')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"><path d="M4 6h16M4 12h10M4 18h13" /></svg>
            Outline
          </button>
          <button type="button" className={mobileTab === 'write' ? 'is-on' : ''} onClick={() => handleMobileTab('write')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"><path d="M4 20h4l10-10-4-4L4 16z" /></svg>
            Write
          </button>
          <button type="button" className={mobileTab === 'inspect' ? 'is-on' : ''} onClick={() => handleMobileTab('inspect')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>
            Inspector
          </button>
          <button type="button" className={mobileTab === 'ai' ? 'is-on' : ''} onClick={() => handleMobileTab('ai')}>
            <AIStar size={18} />
            AI
          </button>
        </nav>
      )}
      {toastNode}

      {/* Template modal */}
      {templateModalOpen && (
        <TemplateModal
          hasExistingContent={acts.length > 0}
          onClose={() => setTemplateModalOpen(false)}
          onApply={handleApplyTemplate}
          projectType={activeNovel?.type || 'novel'}
        />
      )}

      {/* Import modal */}
      {importModalOpen && (
        <DocxImportModal
          hasExistingContent={acts.length > 0}
          onClose={() => setImportModalOpen(false)}
          onImport={handleDocxImport}
        />
      )}

      {/* Scene conflict-copy review modal */}
      {conflictReviewOpen && (
        <SceneConflictReview
          conflicts={sceneConflicts}
          onRestore={(conflictId) => restoreSceneConflict(conflictId)}
          onDiscard={(conflictId) => discardSceneConflict(conflictId)}
          onClose={() => setConflictReviewOpen(false)}
        />
      )}

      {/* Version history and Search & replace are no longer separate modals —
          both now render embedded inside ManuscriptSurface above
          (surfaceId === 'history' / 'search'), sharing its chrome. */}

      {/* Pacing chart */}
      {pacingOpen && (
        <PacingChart
          scenes={scenes}
          chapters={chapters}
          acts={acts}
          activeNovelId={activeNovel?.id}
          onOpenScene={handleSelectScene}
          onClose={() => setPacingOpen(false)}
        />
      )}

      {catalogueOpen && (
        <ManuscriptCatalogue
          copies={manuscriptCopies}
          labels={labels}
          currentStats={manuscriptCopyStats}
          onRetire={handleRetireManuscript}
          onRestore={handleRestoreManuscriptCopy}
          onDownload={handleDownloadManuscriptCopy}
          onClose={() => setCatalogueOpen(false)}
        />
      )}
    </div>
  )
}
