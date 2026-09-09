import { useState, useEffect, useRef, useCallback } from 'react'
import { getSceneVersions, clearSceneVersions, deleteSceneVersion } from '../../utils/sceneVersions'

function deleteVersion(id) {
  try { deleteSceneVersion(id) } catch { /* ignore */ }
}

function formatTimestamp(ts) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    }).format(new Date(ts))
  } catch { return 'Unknown date' }
}

// `embedded`: renders just the panel, no fixed backdrop/centering/click-outside
// — for use inside ManuscriptSurface's own chrome. Defaults to false so every
// existing modal call site is unaffected. See ManuscriptSearch.jsx for the
// same pattern.
// `onToast`: toast(message, { undo }) — per spec §5.2, restoring a version
// applies immediately with no confirm dialog and posts an undo toast instead
// (same treatment as ManuscriptSearch's replace-all). "Clear all versions" is
// deliberately NOT included — it's a genuine irreversible bulk delete, not
// named in the spec's undo-toast list, and there is no prior state left to
// undo to once the snapshots themselves are gone.
export default function SceneVersionHistory({ scene, onRestore, onClose, onToast, embedded = false }) {
  const [versions, setVersions] = useState([])
  const [previewId, setPreviewId] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const overlayRef = useRef(null)

  const reload = useCallback(() => {
    if (scene?.id) setVersions(getSceneVersions(scene.id))
  }, [scene?.id])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') {
        if (confirmClear) { setConfirmClear(false); return }
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, confirmClear])

  const handleOverlayClick = useCallback(e => {
    if (e.target !== overlayRef.current) return
    if (confirmClear) { setConfirmClear(false); return }
    onClose()
  }, [onClose, confirmClear])

  const handleDeleteOne = useCallback((id) => {
    deleteVersion(id)
    if (previewId === id) setPreviewId(null)
    reload()
  }, [previewId, reload])

  const handleClearAll = useCallback(() => {
    clearSceneVersions(scene?.id)
    setPreviewId(null)
    setConfirmClear(false)
    reload()
  }, [scene?.id, reload])

  const handleRestore = useCallback((version) => {
    if (!scene) return
    const previous = { sceneId: scene.id, content: scene.content || '', title: scene.title || '' }
    onRestore(version)
    onToast?.('Restored an earlier version.', { undo: () => onRestore(previous) })
    onClose()
  }, [scene, onRestore, onToast, onClose])

  const preview = previewId ? versions.find(v => v.id === previewId) : null

  const panel = (
      <div className={`ms-vh-panel${embedded ? ' ms-vh-panel--embedded' : ''}`} tabIndex={-1}>
        <div className="ms-vh-header">
          <div>
            <div className="ms-vh-title">Version History</div>
            <div className="ms-vh-subtitle">{scene?.title || 'Scene'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {versions.length > 0 && (
              <button
                className="ms-toolbar-btn"
                style={{ color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 40%, transparent)' }}
                onClick={() => setConfirmClear(true)}
                title="Delete all saved versions for this scene"
              >
                Clear all
              </button>
            )}
            <button className="ms-vh-close" onClick={onClose} aria-label="Close version history">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 1l12 12M13 1L1 13" />
              </svg>
            </button>
          </div>
        </div>

        <div className="ms-vh-body">
          {versions.length === 0 ? (
            <div className="ms-vh-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: 8 }}>
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <p>No saved versions yet.</p>
              <p className="ms-vh-empty-hint">Versions are created automatically when you save changes to this scene.</p>
            </div>
          ) : (
            <div className="ms-vh-cols">
              <div className="ms-vh-list">
                {versions.map((v, i) => (
                  <div
                    key={v.id}
                    className={`ms-vh-item-row${previewId === v.id ? ' is-active' : ''}`}
                  >
                    <button
                      className="ms-vh-item-btn"
                      onClick={() => setPreviewId(v.id === previewId ? null : v.id)}
                    >
                      <div className="ms-vh-item-time">{formatTimestamp(v.timestamp)}</div>
                      <div className="ms-vh-item-meta">
                        {i === 0 && <span className="ms-vh-badge">Latest</span>}
                        <span>{v.wordCount.toLocaleString()} words</span>
                        {v.title && <span className="ms-vh-item-title-tag">{v.title}</span>}
                      </div>
                    </button>
                    <button
                      className="ms-vh-delete-btn"
                      onClick={e => { e.stopPropagation(); handleDeleteOne(v.id) }}
                      title="Delete this version"
                      aria-label="Delete this version"
                    >
                      <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M1 1l12 12M13 1L1 13" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              <div className="ms-vh-preview-pane">
                {preview ? (
                  <>
                    <div className="ms-vh-preview-header">
                      <div className="ms-vh-preview-meta">
                        <strong>{formatTimestamp(preview.timestamp)}</strong>
                        <span>{preview.wordCount.toLocaleString()} words</span>
                      </div>
                      <button
                        className="ms-vh-restore-btn"
                        onClick={() => handleRestore(preview)}
                        title="Applies immediately — undo from the toast"
                      >
                        Restore this version
                      </button>
                    </div>
                    <div className="ms-vh-preview-text">
                      {preview.content || <em style={{ opacity: 0.4 }}>Empty scene</em>}
                    </div>
                  </>
                ) : (
                  <div className="ms-vh-preview-hint">
                    Select a version on the left to preview its content.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Clear all confirmation */}
        {confirmClear && (
          <div className="ms-vh-confirm-overlay">
            <div className="ms-vh-confirm-box">
              <div className="ms-vh-confirm-title">Clear all versions?</div>
              <p className="ms-vh-confirm-body">
                This will permanently delete all {versions.length} saved version{versions.length !== 1 ? 's' : ''} for this scene. This cannot be undone.
              </p>
              <div className="ms-vh-confirm-actions">
                <button className="btn btn-secondary" onClick={() => setConfirmClear(false)}>Cancel</button>
                <button
                  className="btn"
                  style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}
                  onClick={handleClearAll}
                >
                  Delete all versions
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  )

  if (embedded) return panel

  return (
    <div
      ref={overlayRef}
      className="ms-vh-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      onClick={handleOverlayClick}
    >
      {panel}
    </div>
  )
}
