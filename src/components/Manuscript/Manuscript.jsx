import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { getProjectType } from '../../constants/projectTypes'
import WritingSidebar from './WritingSidebar'
import TemplateModal from './TemplateModal'
import DocxImportModal from './DocxImportModal'
import AISuggestionPanel from './AISuggestionPanel'
import AIStar from '../ai/AIStar'
import SceneVersionHistory from './SceneVersionHistory'
import ManuscriptSearch from './ManuscriptSearch'
import PacingChart from './PacingChart'
import { saveSceneVersion } from '../../utils/sceneVersions'
import ComicPlanner from '../comic/ComicPlanner'
import { SceneEditor } from './SceneEditor.jsx'
import FinalizedReader, { exportToDocx } from './FinalizedReader.jsx'
import { FormatContent, NotesPanel, SaveIndicator } from './ManuscriptToolbar.jsx'
import { SCRIPT_TYPES, buildFinalizedDraft, decodeHtmlEntities, loadFormat, persistSceneDraftToLocalStorage } from './manuscriptUtils.js'
import FocusedWritingShell, { ManuscriptZoomControl } from './FocusedWritingShell.jsx'
import { useFocusedWritingMode } from './useFocusedWritingMode.js'
import SceneConflictReview from './SceneConflictReview.jsx'

const CAMPAIGN_PROJECT_TYPES = new Set(['dnd_campaign', 'tabletop_rpg'])

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
    characters, locations,
    setSelectedCharacterId, setSelectedLocationId,
    selectedSceneId, setSelectedSceneId,
    writingSceneId, setWritingSceneId,
    activeNovel, updateNovel,
    sceneConflicts = [], restoreSceneConflict, discardSceneConflict,
  } = store

  const projectTypeConfig = getProjectType(activeNovel?.type)
  const labels = projectTypeConfig.structure

  // Persisted in the URL (writingSceneId lives in the store) so a refresh in writing
  // mode returns to this scene instead of the top of the manuscript.
  const activeSceneId = writingSceneId
  const setActiveSceneId = setWritingSceneId
  const [activeSidebarTab, setActiveSidebarTab] = useState('structure') // null | 'structure' | 'goals' | 'progress' | 'notes'
  const [highlightedNoteSeq, setHighlightedNoteSeq] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [formatSettings, setFormatSettings] = useState(loadFormat)
  const [fullscreen, setFullscreen] = useState(false)
  const [saveState, setSaveState] = useState('saved') // 'saving' | 'saved'
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [conflictReviewOpen, setConflictReviewOpen] = useState(false)
  const [readerDraft, setReaderDraft] = useState({ projectId: null, draftId: null })
  const [finalizedReaderView, setFinalizedReaderView] = useState('scroll')
  const [finalizedPageIndex, setFinalizedPageIndex] = useState(0)
  const [versionHistorySceneId, setVersionHistorySceneId] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pacingOpen, setPacingOpen] = useState(false)
  const [liveSceneContent, setLiveSceneContent] = useState({})
  const [aiSelectionContext, setAiSelectionContext] = useState({ sceneId: null, text: '' })

  const containerRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const saveTimer = useRef(null)
  const editorRefs = useRef({})
  const focusedWriting = useFocusedWritingMode(userId)

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
    ;(characters || []).forEach(c => {
      if (c.name?.length >= 2) map[c.name.toLowerCase()] = { id: c.id, section: 'characters', name: c.name }
      ;(c.keywords || []).forEach(kw => { if (kw?.length >= 2) map[kw.toLowerCase()] = { id: c.id, section: 'characters', name: c.name } })
    })
    ;(locations || []).forEach(l => {
      if (l.name?.length >= 2) map[l.name.toLowerCase()] = { id: l.id, section: 'locations', name: l.name }
    })
    return map
  }, [characters, locations])

  // Autosave state tracking — wraps updateSceneContent with UI feedback
  const handleContentUpdate = useCallback((sceneId, content) => {
    setLiveSceneContent(prev => ({ ...prev, [sceneId]: content }))
    updateSceneContent(sceneId, content)
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaveState('saved'), 2000)
  }, [updateSceneContent])

  const handleLiveContentChange = useCallback((sceneId, content) => {
    setLiveSceneContent(prev => prev[sceneId] === content ? prev : { ...prev, [sceneId]: content })
  }, [])

  const handleRestoreVersion = useCallback((version) => {
    const scene = scenes.find(s => s.id === version.sceneId)
    if (!scene) return
    // Snapshot current state before restoring
    saveSceneVersion(scene)
    updateScene(scene.id, { content: version.content, title: version.title })
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaveState('saved'), 2000)
  }, [scenes, updateScene])

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

  useEffect(() => {
    if (!focusedWriting.enabled) return undefined
    const handleEscape = event => {
      if (event.key !== 'Escape') return
      if (activeSidebarTab) {
        event.preventDefault()
        setActiveSidebarTab(null)
        return
      }
      event.preventDefault()
      focusedWriting.setEnabled(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [activeSidebarTab, focusedWriting])

  const handleFormatChange = useCallback((next) => {
    setFormatSettings(next)
    localStorage.setItem('nf-format-settings', JSON.stringify(next))
  }, [])

  const handleEntityClick = useCallback(entity => {
    if (entity.section === 'characters') setSelectedCharacterId(entity.id)
    if (entity.section === 'locations') setSelectedLocationId(entity.id)
    window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: entity.section } }))
  }, [setSelectedCharacterId, setSelectedLocationId])

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

  const totalWordCount = useMemo(() =>
    liveScenes.reduce((acc, s) => acc + (s.content?.trim().split(/\s+/).filter(Boolean).length || 0), 0)
  , [liveScenes])

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

  const orderedContent = useMemo(() => {
    const result = []
    acts.forEach(act => {
      const actChapters = chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order)
      result.push({ type: 'act', act, hasChapters: actChapters.length > 0 })
      actChapters.forEach(chap => {
        const chapScenes = liveScenes.filter(s => s.chapterId === chap.id).sort((a, b) => a.order - b.order)
        result.push({ type: 'chapter', chap, hasScenes: chapScenes.length > 0 })
        chapScenes.forEach((scene, idx) => {
          result.push({ type: 'scene', scene, sceneIndex: idx, chapterSceneCount: chapScenes.length, chap })
        })
      })
    })
    return result
  }, [acts, chapters, liveScenes])

  const handleSplitScene = (sceneId, chapterId, before, after) => {
    updateSceneContent(sceneId, before)
    const newScene = addScene(chapterId, labels.level3)
    setTimeout(() => {
      updateSceneContent(newScene.id, after)
      editorRefs.current[newScene.id]?.focus({ placeCursor: 'end' })
      editorRefs.current[newScene.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  const handleAddScene = chapterId => {
    const newScene = addScene(chapterId, labels.level3)
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

  // Writing goals — persisted on activeNovel via updateNovel
  const activeNovelId = activeNovel?.id
  const writingGoals = useMemo(() => activeNovel?.writingGoals ?? {}, [activeNovel?.writingGoals])

  const handleUpdateGoals = useCallback((newGoals) => {
    if (!activeNovelId) return
    updateNovel(activeNovelId, { writingGoals: newGoals })
  }, [activeNovelId, updateNovel])

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

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportToDocx(activeNovel, acts, chapters, scenes, chapterGlobalNumbers)
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  // Navigate from sidebar click
  const handleSelectScene = useCallback((sceneId) => {
    setActiveSceneId(sceneId)
    requestAnimationFrame(() => {
      document.getElementById(`ms-scene-${sceneId}`)
        ?.scrollIntoView({ behavior: focusedWriting.enabled ? 'auto' : 'smooth', block: 'center' })
    })
    setTimeout(() => editorRefs.current[sceneId]?.focus({ placeCursor: 'end' }), 200)
  }, [focusedWriting.enabled, setActiveSceneId])

  const handleSelectChapter = useCallback((chapId) => {
    requestAnimationFrame(() => {
      document.getElementById(`ms-chap-${chapId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  if (isComicProject) return <ComicPlanner store={store} />

  return (
    <div ref={containerRef} className={`manuscript-processor flex flex-col h-full bg-[var(--bg-main)] text-[var(--text-main)] overflow-hidden font-serif${fullscreen ? ' is-fullscreen' : ''}${focusedWriting.enabled ? ' is-focused-writing' : ''}`}>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      {focusedWriting.enabled ? (
        <FocusedWritingShell
          projectTitle={activeNovel?.title}
          saveState={saveState}
          wordCount={totalWordCount}
          breadcrumb={activeChapter || activeScene
            ? [activeChapter ? getChapterTitle(activeChapter) : null, activeScene?.title || labels.level3].filter(Boolean).join(' / ')
            : ''}
          activePanelId={activeSidebarTab}
          onSetPanel={setActiveSidebarTab}
          onExit={() => focusedWriting.setEnabled(false)}
          pageZoom={focusedWriting.pageZoom}
          onPageZoomChange={focusedWriting.setPageZoom}
        />
      ) : (
      <div data-tour="manuscript-toolbar" className="ms-toolbar font-sans flex items-center gap-2 flex-shrink-0 px-3">

        {!activeFinalizedDraft && (
          <>
            {/* Template picker */}
            <button
              onClick={() => setTemplateModalOpen(true)}
              className="ms-toolbar-btn"
              title="Choose a structural template"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="0.9" y="0.9" width="3.5" height="3.5" rx="0.8" />
                <rect x="6.6" y="0.9" width="3.5" height="3.5" rx="0.8" />
                <rect x="0.9" y="6.6" width="3.5" height="3.5" rx="0.8" />
                <rect x="6.6" y="6.6" width="3.5" height="3.5" rx="0.8" />
              </svg>
              Template
            </button>

            {/* Import */}
            <button
              onClick={() => setImportModalOpen(true)}
              className="ms-toolbar-btn"
              title={importTitle}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Import
            </button>

            <div className="w-px h-4 bg-[var(--border)] mx-1" />
          </>
        )}

        {/* Save state */}
        <SaveIndicator state={saveState} />

        {/* Word count */}
        <span data-tour="manuscript-word-count" className="ms-toolbar-wordcount">
          {totalWordCount > 0 ? `${totalWordCount.toLocaleString()} words` : 'No content yet'}
        </span>

        {isScriptProject && !activeFinalizedDraft && (
          <span
            className="ms-toolbar-badge"
            title="Readable script export is available; industry formatting is still in progress."
          >
            Script beta
          </span>
        )}

        {sceneConflicts.length > 0 && (
          <button
            type="button"
            className="ms-toolbar-conflict-btn"
            onClick={() => setConflictReviewOpen(true)}
            title="A scene was edited in two browser tabs at once — both versions were kept"
          >
            ⚠ {sceneConflicts.length} conflict {sceneConflicts.length === 1 ? 'copy' : 'copies'}
          </button>
        )}

        <div className="flex-1" />

        {isNovelProject && finalizedDrafts.length > 0 && (
          <select
            className="ms-toolbar-select"
            value={readerDraftId || ''}
            onChange={event => {
              setReaderDraft({ projectId: activeNovel?.id || null, draftId: event.target.value || null })
              setFinalizedPageIndex(0)
            }}
            title="View a finalized draft"
            aria-label="View a finalized draft"
          >
            <option value="">Working draft</option>
            {finalizedDrafts.map(draft => (
              <option key={draft.id} value={draft.id}>
                {decodeHtmlEntities(draft.title) || 'Final draft'}
              </option>
            ))}
          </select>
        )}

        {isNovelProject && !activeFinalizedDraft && (
          <button
            onClick={handleFinaliseDraft}
            className="ms-toolbar-btn"
            title="Copy this manuscript into an uneditable reader view"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
              <path d="M8 7h8" /><path d="M8 11h6" />
            </svg>
            Finalise
          </button>
        )}

        {activeFinalizedDraft && (
          <div className="ms-toolbar-segment" role="group" aria-label="Finalized reader view">
            <button
              type="button"
              className={finalizedReaderView === 'scroll' ? 'is-active' : ''}
              onClick={() => setFinalizedReaderView('scroll')}
            >
              Scroll
            </button>
            <button
              type="button"
              className={finalizedReaderView === 'pages' ? 'is-active' : ''}
              onClick={() => {
                setFinalizedReaderView('pages')
                setFinalizedPageIndex(0)
              }}
            >
              Pages
            </button>
          </div>
        )}

        {/* Search */}
        {!activeFinalizedDraft && (
          <button
            onClick={() => setSearchOpen(v => !v)}
            className={`ms-toolbar-btn${searchOpen ? ' is-active' : ''}`}
            title="Search and replace across all scenes"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            Search
          </button>
        )}

        {/* Pacing */}
        {!activeFinalizedDraft && (
          <button
            onClick={() => setPacingOpen(v => !v)}
            className={`ms-toolbar-btn${pacingOpen ? ' is-active' : ''}`}
            title="Pacing chart — word count by scene or chapter"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 17V13M12 17v-6M16 17V9" />
            </svg>
            Pacing
          </button>
        )}

        {/* Notes toggle */}
        {!activeFinalizedDraft && (
          <button
            onClick={() => setActiveSidebarTab(v => v === 'notes' ? null : 'notes')}
            className={`ms-toolbar-btn${activeSidebarTab === 'notes' ? ' is-active' : ''}`}
            title="Scene notes"
          >
            Notes{activeScene?.notes?.length ? ` (${activeScene.notes.length})` : ''}
          </button>
        )}

        {/* AI assistant */}
        {!activeFinalizedDraft && (
          <button
            onClick={() => setActiveSidebarTab(v => v === 'ai' ? null : 'ai')}
            className={`ms-toolbar-btn${activeSidebarTab === 'ai' ? ' is-active' : ''}`}
            title="AI writing assistant"
          >
            <AIStar size={11} />
            AI
          </button>
        )}

        {/* Export */}
        {!activeFinalizedDraft && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="ms-toolbar-btn disabled:opacity-50"
            title={exportTitle}
          >
            {exporting ? 'Exporting…' : (
              <span className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {exportButtonLabel}
              </span>
            )}
          </button>
        )}

        {/* Fullscreen toggle */}
        {!activeFinalizedDraft && (
          <ManuscriptZoomControl
            pageZoom={focusedWriting.pageZoom}
            onPageZoomChange={focusedWriting.setPageZoom}
          />
        )}

        {!activeFinalizedDraft && (
          <button
            onClick={() => { setActiveSidebarTab(null); focusedWriting.setEnabled(true) }}
            className="ms-toolbar-btn"
            title="Focused writing mode"
            aria-label="Enter focused writing mode"
          >
            Focus
          </button>
        )}

        <button
          onClick={toggleFullscreen}
          className="ms-toolbar-btn"
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {fullscreen ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4.5 1.5H1.5v3M7.5 1.5h3v3M4.5 10.5H1.5v-3M7.5 10.5h3v-3" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M1.5 4.5V1.5h3M10.5 4.5V1.5h-3M1.5 7.5v3h3M10.5 7.5v3h-3" />
            </svg>
          )}
        </button>
      </div>
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
      ) : (
      <div className="flex flex-1 overflow-hidden">

        {/* Writing area */}
        <main ref={scrollContainerRef} data-tour="manuscript-editor" className="manuscript-page ms-scroll-container workspace-page flex-1 overflow-y-auto scroll-smooth min-w-0">
          <div
            className="manuscript-document mx-auto py-16 px-6 md:px-12"
            style={{
              zoom: focusedWriting.pageZoom,
              // The base 960px column is tuned for the default 19px font. Scale it up with
              // larger text sizes so a bigger font still gets a sensible line length instead
              // of the column staying capped and wasting the extra width the page has to give.
              // min(100%, …) keeps this from fighting the mobile full-width override below 640px,
              // since inline styles otherwise take precedence over that media query.
              maxWidth: `min(100%, ${Math.round(Math.max(960, 960 * (formatSettings.fontSize / 19)))}px)`,
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
                const { scene, sceneIndex, chapterSceneCount, chap } = item
                const isLastInChapter = sceneIndex === chapterSceneCount - 1
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

                    <SceneEditor
                      scene={scene}
                      sceneIndex={sceneIndex}
                      onUpdate={handleContentUpdate}
                      onUpdateScene={updateScene}
                      onSplit={handleSplitScene}
                      innerRef={proxy => { editorRefs.current[scene.id] = proxy }}
                      onFocus={() => setActiveSceneId(scene.id)}
                      entityMap={entityMap}
                      onEntityClick={handleEntityClick}
	                      onOpenNotes={() => setActiveSidebarTab('notes')}
	                      onNoteClick={handleNoteClick}
	                      highlightedNoteSeq={highlightedNoteSeq}
	                      formatSettings={formatSettings}
                      characterNames={characterNames}
                      locationNames={locationNames}
                      onPersistDraft={persistSceneDraftToLocalStorage}
                      onLiveContentChange={handleLiveContentChange}
                      onSelectionContextChange={text => setAiSelectionContext({ sceneId: scene.id, text })}
                      onOpenVersionHistory={setVersionHistorySceneId}
                      projectType={activeNovel?.type || 'novel'}
                      focusedWriting={focusedWriting.enabled && focusedWriting.caretFollow}
                      scrollContainerRef={scrollContainerRef}
                      pageZoom={focusedWriting.pageZoom}
                      keepEditingOnExternalBlur={activeSidebarTab === 'ai'}
                    />

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

        {/* Right writing sidebar */}
        <WritingSidebar
          focusedMode={focusedWriting.enabled}
          activePanelId={activeSidebarTab}
          onSetPanel={setActiveSidebarTab}
          acts={acts}
          chapters={chapters}
          scenes={liveScenes}
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
          writingGoals={writingGoals}
          onUpdateGoals={handleUpdateGoals}
          formatSlot={<FormatContent settings={formatSettings} onChange={handleFormatChange} />}
          notesSlot={
            <NotesPanel
	              scene={activeScene}
	              onUpdateScene={updateScene}
	              highlightedSeq={highlightedNoteSeq}
	            />
          }
	          aiSlot={
	            <AISuggestionPanel
	              activeScene={activeSceneForAI}
	              activeNovel={activeNovel}
	              characters={characters}
	              locations={locations}
	              selectedText={activeAISelectionText}
	              onAppendToScene={handleAppendToScene}
	              userId={userId}
	              membership={membership}
            />
          }
        />
      </div>
      )}

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

      {/* Version history modal */}
      {versionHistorySceneId && (
        <SceneVersionHistory
          scene={scenes.find(s => s.id === versionHistorySceneId) ?? null}
          onRestore={handleRestoreVersion}
          onClose={() => setVersionHistorySceneId(null)}
        />
      )}

      {/* Global search & replace */}
      {searchOpen && (
        <ManuscriptSearch
          scenes={scenes}
          chapters={chapters}
          acts={acts}
          activeNovelId={activeNovel?.id}
          onOpenScene={handleSelectScene}
          onReplaceInScene={handleReplaceInScene}
          onClose={() => setSearchOpen(false)}
        />
      )}

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
    </div>
  )
}
