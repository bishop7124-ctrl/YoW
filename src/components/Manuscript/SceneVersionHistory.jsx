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

export default function SceneVersionHistory({ scene, onRestore, onClose }) {
  const [versions, setVersions] = useState([])
  const [previewId, setPreviewId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)   // restore confirm
  const [confirmClear, setConfirmClear] = useState(false)
  const overlayRef = useRef(null)

  const reload = useCallback(() => {
    if (scene?.id) setVersions(getSceneVersions(scene.id))
  }, [scene?.id])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') {
        if (confirmId) { setConfirmId(null); return }
        if (confirmClear) { setConfirmClear(false); return }
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, confirmId, confirmClear])

  const handleOverlayClick = useCallback(e => {
    if (e.target !== overlayRef.current) return
    if (confirmId) { setConfirmId(null); return }
    if (confirmClear) { setConfirmClear(false); return }
    onClose()
  }, [onClose, confirmId, confirmClear])

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

  const preview = previewId ? versions.find(v => v.id === previewId) : null
  const toConfirm = confirmId ? versions.find(v => v.id === confirmId) : null

  return (
    <div
      ref={overlayRef}
      className="ms-vh-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      onClick={handleOverlayClick}
    >
      <div className="ms-vh-panel" tabIndex={-1}>
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
                        onClick={() => setConfirmId(preview.id)}
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

        {/* Restore confirmation */}
        {toConfirm && (
          <div className="ms-vh-confirm-overlay">
            <div className="ms-vh-confirm-box">
              <div className="ms-vh-confirm-title">Restore this version?</div>
              <p className="ms-vh-confirm-body">
                Your current scene content will be saved as a new version first, so you can undo this restore by returning to version history.
              </p>
              <div className="ms-vh-confirm-meta">
                <strong>{toConfirm.title || 'Scene'}</strong>
                <span>{formatTimestamp(toConfirm.timestamp)}</span>
                <span>{toConfirm.wordCount.toLocaleString()} words</span>
              </div>
              <div className="ms-vh-confirm-actions">
                <button className="btn btn-secondary" onClick={() => setConfirmId(null)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={() => { onRestore(toConfirm); setConfirmId(null); onClose() }}
                >
                  Yes, restore
                </button>
              </div>
            </div>
          </div>
        )}

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
    </div>
  )
}
