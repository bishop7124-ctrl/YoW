import { useEffect, useMemo, useRef, useState } from 'react'
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

const OVERFLOW_SECTIONS = [
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
      { id: 'import', label: 'Import a document' },
      { id: 'history', label: 'Version history' },
    ],
  },
  {
    heading: 'Finish',
    items: [
      { id: 'finalise', label: 'Finalise draft' },
      { id: 'export', label: 'Export…', kbd: '⌘E' },
      { id: 'catalogue', label: 'Retired drafts' },
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

function OverflowMenu({ open, onClose, onAction }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="ms-topbar-menu" ref={ref} role="menu">
      {OVERFLOW_SECTIONS.map(section => (
        <div key={section.heading}>
          <div className="ms-topbar-menu-h">{section.heading}</div>
          {section.items.map(item => (
            <button key={item.id} type="button" className="ms-topbar-menu-i" onClick={() => { onAction(item.id); onClose() }}>
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
  onEnterFocus,
  onOverflowAction,
  conflictCount = 0,
  onOpenConflicts,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [gotoOpen, setGotoOpen] = useState(false)

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
          <button type="button" className={`ms-topbar-btn${aiOpen ? ' is-on' : ''}`} onClick={onToggleAI} aria-pressed={aiOpen}>
            <AIStar size={13} /> AI
          </button>
          <button type="button" className={`ms-topbar-btn${inspectorOpen ? ' is-on' : ''}`} onClick={onToggleInspector} aria-pressed={inspectorOpen}>
            <InspectorIcon /> Inspector
          </button>
          <div className="ms-topbar-sep" />
          {onOpenProject && (
            <button type="button" className="ms-topbar-btn" onClick={onOpenProject} title="Back to the project dashboard">
              <ProjectIcon /> Project
            </button>
          )}
          {onEnterFocus && (
            <button type="button" className="ms-topbar-btn ms-topbar-btn-primary" onClick={onEnterFocus}>
              Focus
            </button>
          )}
          <div className="ms-topbar-menu-wrap">
            <button type="button" className="ms-topbar-iconbtn" onClick={() => setMenuOpen(v => !v)} title="More" aria-haspopup="menu" aria-expanded={menuOpen}>
              <MoreIcon />
            </button>
            <OverflowMenu open={menuOpen} onClose={() => setMenuOpen(false)} onAction={onOverflowAction} />
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
