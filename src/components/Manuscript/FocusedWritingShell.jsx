import { SaveIndicator } from './ManuscriptToolbar.jsx'

const CONTROLS = [
  ['structure', 'Structure'],
  ['notes', 'Notes'],
  ['format', 'Format'],
  ['ai', 'AI'],
  ['status', 'Status'],
]

export function ManuscriptZoomControl({ pageZoom, onPageZoomChange }) {
  return (
    <div className="ms-focus-zoom" role="group" aria-label="Manuscript page zoom">
      <button
        type="button"
        onClick={() => onPageZoomChange(pageZoom - 0.1)}
        disabled={pageZoom <= 0.8}
        aria-label="Zoom manuscript page out"
      >−</button>
      <span aria-live="polite">{Math.round(pageZoom * 100)}%</span>
      <button
        type="button"
        onClick={() => onPageZoomChange(pageZoom + 0.1)}
        disabled={pageZoom >= 1.5}
        aria-label="Zoom manuscript page in"
      >+</button>
    </div>
  )
}

export default function FocusedWritingShell({
  projectTitle,
  saveState,
  wordCount,
  breadcrumb,
  activePanelId,
  onSetPanel,
  onExit,
  pageZoom,
  onPageZoomChange,
	}) {
	  const visiblePanelId = activePanelId === 'goals' || activePanelId === 'progress' ? 'status' : activePanelId
	  return (
    <>
      <header className="ms-focus-topbar font-sans">
        <strong className="ms-focus-project-title">{projectTitle || 'Untitled project'}</strong>
        {breadcrumb && <span className="ms-focus-breadcrumb">{breadcrumb}</span>}
        <div className="ms-focus-status">
          <SaveIndicator state={saveState} />
          <span className="ms-toolbar-wordcount">{wordCount > 0 ? `${wordCount.toLocaleString()} words` : 'No content yet'}</span>
          <ManuscriptZoomControl pageZoom={pageZoom} onPageZoomChange={onPageZoomChange} />
          <button type="button" className="ms-focus-exit" onClick={onExit} aria-label="Exit focused writing mode">
            Exit focus
          </button>
        </div>
      </header>

      <nav className="ms-focus-controls font-sans" aria-label="Focused writing tools">
        {CONTROLS.map(([id, label]) => (
          <button
            type="button"
            key={id}
	            className={visiblePanelId === id ? 'is-active' : ''}
	            onClick={() => onSetPanel(visiblePanelId === id ? null : id)}
	            aria-pressed={visiblePanelId === id}
          >
            {label}
          </button>
        ))}
      </nav>
    </>
  )
}
