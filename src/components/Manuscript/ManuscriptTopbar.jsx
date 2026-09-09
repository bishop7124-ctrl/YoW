import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SaveIndicator } from './ManuscriptToolbar.jsx'
import AIStar from '../ai/AIStar'

// ─── Icons ───────────────────────────────────────────────────────────────────

const RailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"><path d="M4 6h16M4 12h10M4 18h13" /></svg>
)
const InspectorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>
)
const ProjectIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
)
const MoreIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
)

const MODES = [
  { id: 'write', label: 'Write' },
  { id: 'edit', label: 'Edit' },
  { id: 'final', label: 'Finalised' },
]

// A function (not a static array) so the Fullscreen label can reflect current
// state, and Import/Export can carry the same dynamic, project-type-aware
// help text the old toolbar's title attributes had (script projects get
// different wording) — `itemTitles` is an optional {id: string} map merged
// onto each item's `title` field. `fullscreen` isn't in the spec's overflow
// list, but the old toolbar's working fullscreen toggle has to land
// *somewhere*, and burying it in "View" here is lower-cost than inventing a
// new always-visible button the spec's three-zone layout doesn't have room for.
const buildOverflowSections = (fullscreen, itemTitles = {}) => [
  {
    heading: 'Find',
    items: [
      { id: 'search', label: 'Search & replace', kbd: '⌘F' },
      { id: 'goto-scene', label: 'Go to scene', kbd: '⌘K' },
    ],
  },
  {
    heading: 'Manuscript',
    items: [
      { id: 'pacing', label: 'Pacing chart' },
      { id: 'template', label: 'Apply a template' },
      { id: 'import', label: 'Import a document', title: itemTitles.import },
      { id: 'history', label: 'Version history' },
    ],
  },
  {
    heading: 'Finish',
    items: [
      { id: 'finalise', label: 'Finalise draft' },
      { id: 'export', label: 'Export…', kbd: '⌘E', title: itemTitles.export },
      { id: 'catalogue', label: 'Retired drafts' },
    ],
  },
  {
    heading: 'View',
    items: [
      { id: 'fullscreen', label: fullscreen ? 'Exit fullscreen' : 'Fullscreen' },
    ],
  },
]

// ─── Go-to-scene palette ────────────────────────────────────────────────────

// Only ever mounted while open (see the call site below), so it always starts
// with fresh state — no reset-on-open effect needed.
function GoToScenePalette({ onClose, acts, chapters, scenes, labels, onSelectScene }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const flat = useMemo(() => {
    const out = []
    acts.forEach(act => {
      chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order).forEach(chap => {
        scenes.filter(s => s.chapterId === chap.id).sort((a, b) => a.order - b.order).forEach((scene, i) => {
          out.push({
            scene,
            path: `${act.title} · ${chap.title || labels.level2} · ${labels.level3} ${i + 1}`,
            title: scene.title && scene.title !== 'Scene' ? scene.title : `${labels.level3} ${i + 1}`,
          })
        })
      })
    })
    return out
  }, [acts, chapters, scenes, labels])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return flat
    return flat.filter(entry => entry.title.toLowerCase().includes(q) || entry.path.toLowerCase().includes(q))
  }, [flat, query])

  const choose = (sceneId) => { onSelectScene(sceneId); onClose() }

  return (
    <div className="ms-goto-overlay" onClick={onClose}>
      <div className="ms-goto-box" onClick={e => e.stopPropagation()} role="dialog" aria-label="Go to scene">
        <input
          ref={inputRef}
          className="ms-goto-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Jump to a ${labels.level3.toLowerCase()}…`}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); onClose() }
            if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); choose(filtered[0].scene.id) }
          }}
        />
        <div className="ms-goto-list">
          {filtered.length === 0 && <div className="ms-insp-empty">No matches.</div>}
          {filtered.slice(0, 60).map(entry => (
            <button key={entry.scene.id} type="button" className="ms-goto-item" onClick={() => choose(entry.scene.id)}>
              <span className="ms-goto-item-title">{entry.title}</span>
              <span className="ms-goto-item-path">{entry.path}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Overflow menu ──────────────────────────────────────────────────────────

function OverflowMenu({ open, onClose, onAction, fullscreen, itemTitles }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  if (!open) return null
  const sections = buildOverflowSections(fullscreen, itemTitles)
  return (
    <div className="ms-topbar-menu" ref={ref} role="menu">
      {sections.map(section => (
        <div key={section.heading}>
          <div className="ms-topbar-menu-h">{section.heading}</div>
          {section.items.map(item => (
            <button key={item.id} type="button" className="ms-topbar-menu-i" title={item.title} onClick={() => { onAction(item.id); onClose() }}>
              {item.label}
              {item.kbd && <kbd>{item.kbd}</kbd>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function ManuscriptTopbar({
  projectTitle, breadcrumbPath,
  acts, chapters, scenes, labels, onSelectScene,
  railCollapsed, onToggleRail,
  mode, onSetMode,
  saveState, wordCount, wordsToday,
  aiOpen, onToggleAI,
  inspectorOpen, onToggleInspector,
  onOpenProject,
  onOverflowAction,
  conflictCount = 0,
  onOpenConflicts,
  fullscreen, onToggleFullscreen,
  zoomControl,
  scriptBetaBadge,
  overflowItemTitles,
  // Write/Finalised modes hide the AI and Inspector buttons entirely per
  // spec §8's mode table — Edit is the only mode where either surface makes
  // sense to open from here.
  hideAIAndInspector = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [gotoOpen, setGotoOpen] = useState(false)

  // 'goto-scene' opens this component's own local palette state and 'fullscreen'
  // calls the dedicated toggle prop — neither bubbles to onOverflowAction like
  // every other item, since Manuscript.jsx owns that state directly (this
  // component only renders the current label/availability) and never sees
  // the palette's open state at all.
  const handleOverflowAction = useCallback((actionId) => {
    if (actionId === 'goto-scene') { setGotoOpen(true); return }
    if (actionId === 'fullscreen') { onToggleFullscreen?.(); return }
    onOverflowAction?.(actionId)
  }, [onOverflowAction, onToggleFullscreen])

  return (
    <>
      <header className="ms-topbar font-sans" data-tour="manuscript-toolbar">
        <div className="ms-topbar-zone ms-topbar-zone-left">
          <button
            type="button"
            className="ms-topbar-iconbtn"
            onClick={onToggleRail}
            title="Manuscript structure (⌘\\)"
            aria-pressed={!railCollapsed}
          >
            <RailIcon />
          </button>
          <button type="button" className="ms-topbar-crumb" onClick={() => setGotoOpen(true)} title="Jump to another scene (⌘K)">
            <span className="ms-topbar-crumb-title">{projectTitle || 'Untitled project'}</span>
            {breadcrumbPath && <span className="ms-topbar-crumb-path">{breadcrumbPath}</span>}
          </button>
          {mode && onSetMode && (
            <div className="ms-modes" role="group" aria-label="Editor mode">
              {MODES.map(m => (
                <button key={m.id} type="button" className={mode === m.id ? 'is-on' : ''} onClick={() => onSetMode(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ms-topbar-zone ms-topbar-zone-mid">
          {scriptBetaBadge}
          <span className="ms-topbar-status">
            <span className="ms-topbar-dot" />
            <SaveIndicator state={saveState} />
            <span className="ms-topbar-status-sep">·</span>
            <span>{wordCount > 0 ? `${wordCount.toLocaleString()} words` : 'No content yet'}</span>
            {wordsToday > 0 && <span className="ms-topbar-status-long">· {wordsToday.toLocaleString()} today</span>}
          </span>
          {conflictCount > 0 && (
            <button type="button" className="ms-topbar-conflict-btn" onClick={onOpenConflicts} title="A scene was edited in two browser tabs at once — both versions were kept">
              ⚠ {conflictCount} conflict {conflictCount === 1 ? 'copy' : 'copies'}
            </button>
          )}
        </div>

        <div className="ms-topbar-zone ms-topbar-zone-tools">
          {zoomControl}
          {!hideAIAndInspector && (
            <>
              <button type="button" className={`ms-topbar-btn${aiOpen ? ' is-on' : ''}`} onClick={onToggleAI} aria-pressed={aiOpen}>
                <AIStar size={13} /> AI
              </button>
              <button type="button" className={`ms-topbar-btn${inspectorOpen ? ' is-on' : ''}`} onClick={onToggleInspector} aria-pressed={inspectorOpen}>
                <InspectorIcon /> Inspector
              </button>
            </>
          )}
          <div className="ms-topbar-sep" />
          {onOpenProject && (
            <button type="button" className="ms-topbar-btn" onClick={onOpenProject} title="Back to the project dashboard">
              <ProjectIcon /> Project
            </button>
          )}
          <div className="ms-topbar-menu-wrap">
            <button type="button" className="ms-topbar-iconbtn" onClick={() => setMenuOpen(v => !v)} title="More" aria-haspopup="menu" aria-expanded={menuOpen}>
              <MoreIcon />
            </button>
            <OverflowMenu
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              onAction={handleOverflowAction}
              fullscreen={fullscreen}
              itemTitles={overflowItemTitles}
            />
          </div>
        </div>
      </header>

      {gotoOpen && (
        <GoToScenePalette
          onClose={() => setGotoOpen(false)}
          acts={acts}
          chapters={chapters}
          scenes={scenes}
          labels={labels}
          onSelectScene={onSelectScene}
        />
      )}
    </>
  )
}
