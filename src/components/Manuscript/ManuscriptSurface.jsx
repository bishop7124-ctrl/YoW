import AISuggestionPanel from './AISuggestionPanel.jsx'
import ManuscriptSearch from './ManuscriptSearch.jsx'
import SceneVersionHistory from './SceneVersionHistory.jsx'
import AIStar from '../ai/AIStar'
import { decodeHtmlEntities } from './manuscriptUtils.js'

const TITLES = {
  ai: 'AI workspace',
  search: 'Search & replace',
  history: 'Version history',
  finalise: 'Finalise & export',
}

// ─── Finalise pane ──────────────────────────────────────────────────────────

function FinalisePane({
  labels, stats, isNovelProject,
  finalizedDrafts, onFinalise, onOpenDraft, onOpenCatalogue,
  onExport, exporting, exportButtonLabel,
}) {
  if (!isNovelProject) {
    return (
      <div className="ms-surface-scroll">
        <div className="ms-insp-empty">Finalising is available for novel-type projects. Use Export to get a copy of this project's draft.</div>
        <div className="ms-surface-group">
          <div className="ms-insp-label">Export</div>
          <button type="button" className="ms-opt" onClick={onExport} disabled={exporting}>
            {exporting ? 'Exporting…' : exportButtonLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ms-surface-scroll">
      <div className="ms-surface-card">
        <h4>Ready to finalise</h4>
        <p>
          {stats.acts} {labels.level1.toLowerCase()}{stats.acts === 1 ? '' : 's'} · {stats.chapters} {labels.level2.toLowerCase()}{stats.chapters === 1 ? '' : 's'} · {stats.scenes} {labels.level3.toLowerCase()}{stats.scenes === 1 ? '' : 's'} · {stats.words.toLocaleString()} words.
          Finalising freezes a copy you can read and export without touching the working draft.
        </p>
        <div className="ms-surface-card-actions">
          <button type="button" className="ms-topbar-btn is-on" onClick={onFinalise}>Finalise draft</button>
        </div>
      </div>

      <div className="ms-surface-group">
        <div className="ms-insp-label">Export</div>
        <button type="button" className="ms-opt" onClick={onExport} disabled={exporting}>
          {exporting ? 'Exporting…' : exportButtonLabel}
        </button>
      </div>

      {finalizedDrafts.length > 0 && (
        <div className="ms-surface-group">
          <div className="ms-insp-label">Finalised drafts</div>
          {finalizedDrafts.map(draft => (
            <div key={draft.id} className="ms-insp-tgt">
              <b>{decodeHtmlEntities(draft.title) || 'Final draft'}</b>
              <button type="button" className="ms-insp-tgt-n" onClick={() => onOpenDraft(draft.id)}>Open reader</button>
            </div>
          ))}
        </div>
      )}

      <div className="ms-surface-group">
        <button type="button" className="ms-insp-reset" onClick={onOpenCatalogue}>Retired manuscript copies…</button>
      </div>
    </div>
  )
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function ManuscriptSurface({
  activeSurface, onClose,
  contextLabel,
  // AI pane
  activeScene, activeNovel, characters, locations, selectedText, onAppendToScene, onReplaceSelection, userId, membership,
  // Search pane
  scenes, chapters, acts, activeNovelId, onOpenScene, onReplaceInScene,
  // History pane
  historyScene, onRestoreVersion,
  // Finalise pane
  labels, finaliseStats, isNovelProject, finalizedDrafts, onFinalise, onOpenFinalizedDraft, onOpenCatalogue,
  onExport, exporting, exportButtonLabel,
  // Shared
  onToast,
}) {
  if (!activeSurface) return null

  return (
    <section className="ms-surface" aria-label="Manuscript surface">
      <div className="ms-surface-header">
        <b>{activeSurface === 'ai' && <AIStar size={15} />} {TITLES[activeSurface]}</b>
        {contextLabel && <span className="ms-chip ms-surface-context">{contextLabel}</span>}
        <button type="button" className="ms-insp-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="ms-surface-body">
        {activeSurface === 'ai' && (
          <AISuggestionPanel
            activeScene={activeScene}
            activeNovel={activeNovel}
            characters={characters}
            locations={locations}
            selectedText={selectedText}
            onAppendToScene={onAppendToScene}
            onReplaceSelection={onReplaceSelection}
            userId={userId}
            membership={membership}
          />
        )}
        {activeSurface === 'search' && (
          <ManuscriptSearch
            embedded
            scenes={scenes}
            chapters={chapters}
            acts={acts}
            activeNovelId={activeNovelId}
            onOpenScene={onOpenScene}
            onReplaceInScene={onReplaceInScene}
            onClose={onClose}
            onToast={onToast}
          />
        )}
        {activeSurface === 'history' && (
          <SceneVersionHistory
            embedded
            scene={historyScene}
            onRestore={onRestoreVersion}
            onClose={onClose}
            onToast={onToast}
          />
        )}
        {activeSurface === 'finalise' && (
          <FinalisePane
            labels={labels}
            stats={finaliseStats}
            isNovelProject={isNovelProject}
            finalizedDrafts={finalizedDrafts}
            onFinalise={onFinalise}
            onOpenDraft={onOpenFinalizedDraft}
            onOpenCatalogue={onOpenCatalogue}
            onExport={onExport}
            exporting={exporting}
            exportButtonLabel={exportButtonLabel}
          />
        )}
      </div>
    </section>
  )
}

// Kept for callers that want the surface id → label mapping without mounting
// the component (e.g. an aria-label elsewhere).
export { TITLES as SURFACE_TITLES }
