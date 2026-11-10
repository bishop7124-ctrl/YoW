import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getSceneVersions, clearSceneVersions, deleteSceneVersion } from '../../utils/sceneVersions'
import {
  useCloudSceneHistoryActive, useCloudSceneHistoryPaused, retryCloudSceneHistoryNow, loadCloudSceneVersions,
  pushCloudSceneVersion, fetchCloudVersionContent, deleteCloudSceneVersion,
  clearCloudSceneVersions, listRecentlyDeletedScenes, sceneVersionHash, lastCloudHistoryError, useCloudHistoryEpoch,
} from '../../utils/cloudSceneVersions'

function deleteVersion(id, sceneId) {
  try { deleteSceneVersion(id, sceneId) } catch { /* ignore */ }
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
export default function SceneVersionHistory({ scene, onRestore, onClose, onToast, embedded = false, activeNovelId = null, onRecoverScene = null }) {
  const [localVersions, setLocalVersions] = useState([])
  const [cloudVersions, setCloudVersions] = useState([])
  const [localHashes, setLocalHashes] = useState({})
  const [cloudContent, setCloudContent] = useState({})
  const [previewId, setPreviewId] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [deletedScenes, setDeletedScenes] = useState(null)
  const [recovering, setRecovering] = useState(null)
  const overlayRef = useRef(null)
  const cloudActive = useCloudSceneHistoryActive()
  const cloudPaused = useCloudSceneHistoryPaused()
  const [cloudLoadedFor, setCloudLoadedFor] = useState(null) // scene id whose account list loaded successfully
  const backfilledRef = useRef(null)

  const reload = useCallback(() => {
    if (scene?.id) setLocalVersions(getSceneVersions(scene.id))
  }, [scene?.id])

  useEffect(() => { reload() }, [reload])

  // Account copies (only when cloud history is active for this signed-in account).
  const sceneId = scene?.id
  const reloadCloud = useCallback(async () => {
    if (!sceneId || !cloudActive) { setCloudVersions([]); return }
    const loaded = await loadCloudSceneVersions(sceneId)
    if (loaded.ok) { setCloudVersions(loaded.versions); setCloudLoadedFor(sceneId) }
  }, [sceneId, cloudActive])

  // A failed load (for example the account finished signing in mid-request) is retried a few times, then reported.
  const [cloudAttempt, setCloudAttempt] = useState({ sceneId: null, failed: false, tries: 0, reason: '' })
  const epoch = useCloudHistoryEpoch()
  useEffect(() => {
    let cancelled = false
    let timer = null
    if (!sceneId || !cloudActive) return undefined
    const attempt = tries => {
      loadCloudSceneVersions(sceneId).then(loaded => {
        if (cancelled) return
        if (loaded.ok) {
          setCloudVersions(loaded.versions)
          setCloudLoadedFor(sceneId)
          setCloudAttempt({ sceneId, failed: false, tries: 0, reason: '' })
        } else if (tries < 3) {
          setCloudAttempt({ sceneId, failed: false, tries: tries + 1, reason: lastCloudHistoryError() })
          timer = setTimeout(() => attempt(tries + 1), 1500 * (tries + 1))
        } else {
          setCloudAttempt({ sceneId, failed: true, tries: 4, reason: lastCloudHistoryError() })
        }
      })
    }
    attempt(0)
    // Safety net independent of the request: if nothing at all has come back, say so instead of "loading" forever.
    const watchdog = setTimeout(() => {
      if (!cancelled) setCloudAttempt(prev => (prev.sceneId === sceneId && prev.failed ? prev
        : prev.sceneId === sceneId && prev.tries > 0 ? prev
          : { sceneId, failed: true, tries: 4, reason: 'no-response' }))
    }, 30000)
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(watchdog) }
  }, [sceneId, cloudActive, cloudPaused, epoch])

  // Match device snapshots to account copies by the same content hash the server stores.
  useEffect(() => {
    let cancelled = false
    if (!cloudActive || localVersions.length === 0) return undefined
    Promise.all(localVersions.map(async v => [v.id, await sceneVersionHash(v.title, v.content)]))
      .then(pairs => { if (!cancelled) setLocalHashes(Object.fromEntries(pairs)) })
    return () => { cancelled = true }
  }, [cloudActive, localVersions])

  // Opening a scene's history makes sure the account has what this device has: any device-only snapshots, and the
  // text as it is right now. A snapshot taken in the first seconds after the app loaded, or while the connection
  // was down, would otherwise never reach the account. Runs once per scene per open; failures are quiet.
  useEffect(() => {
    if (!cloudActive || !scene?.id || cloudLoadedFor !== scene.id || backfilledRef.current === scene.id) return undefined
    if (localVersions.length > 0 && Object.keys(localHashes).length < localVersions.length) return undefined // hashes still computing
    backfilledRef.current = scene.id
    let cancelled = false
    ;(async () => {
      const inCloud = new Set(cloudVersions.map(v => v.hash))
      const candidates = localVersions.filter(v => !inCloud.has(localHashes[v.id])).slice(0, 20)
      const currentHash = await sceneVersionHash(scene.title || '', scene.content || '')
      const known = new Set([...inCloud, ...Object.values(localHashes)])
      if (currentHash && !known.has(currentHash) && typeof scene.content === 'string') {
        candidates.unshift({ sceneId: scene.id, novelId: scene.novelId || null, title: scene.title || '', content: scene.content, timestamp: Date.now() })
      }
      let pushed = 0
      for (const version of candidates.reverse()) { // oldest first, so the newest ends up newest
        if (cancelled) break
        if (await pushCloudSceneVersion(version, 'auto', { force: true })) pushed += 1
      }
      if (pushed && !cancelled) reloadCloud()
    })()
    return () => { cancelled = true; if (backfilledRef.current === scene.id) backfilledRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudActive, scene?.id, cloudLoadedFor, localHashes, localVersions, cloudVersions])

  const versions = useMemo(() => {
    if (!cloudActive) return localVersions.map(v => ({ ...v, where: 'device' }))
    const cloudByHash = new Map(cloudVersions.map(v => [v.hash, v]))
    const localHashSet = new Set(localVersions.map(v => localHashes[v.id]).filter(Boolean))
    const merged = localVersions.map(v => {
      const twin = cloudByHash.get(localHashes[v.id])
      return twin ? { ...v, where: 'both', cloudId: twin.cloudId } : { ...v, where: 'device' }
    })
    cloudVersions.forEach(v => { if (!localHashSet.has(v.hash)) merged.push({ ...v, where: 'account' }) })
    return merged.sort((a, b) => b.timestamp - a.timestamp)
  }, [cloudActive, localVersions, cloudVersions, localHashes])

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

  const handleDeleteOne = useCallback(async (version) => {
    if (version.where !== 'account') deleteVersion(version.id, scene?.id)
    if (version.cloudId) await deleteCloudSceneVersion(version.cloudId)
    if (previewId === version.id) setPreviewId(null)
    reload()
    reloadCloud()
  }, [previewId, reload, reloadCloud, scene?.id])

  const handleClearAll = useCallback(async () => {
    clearSceneVersions(scene?.id)
    if (cloudActive) await clearCloudSceneVersions(scene?.id)
    setPreviewId(null)
    setConfirmClear(false)
    reload()
    reloadCloud()
  }, [scene?.id, cloudActive, reload, reloadCloud])

  const handleRestore = useCallback((version) => {
    if (!scene || typeof version.content !== 'string') return
    const previous = { sceneId: scene.id, content: scene.content || '', title: scene.title || '' }
    onRestore({ ...version, sceneId: scene.id })
    onToast?.('Restored an earlier version.', { undo: () => onRestore(previous) })
    onClose()
  }, [scene, onRestore, onToast, onClose])

  const previewBase = previewId ? versions.find(v => v.id === previewId) : null
  useEffect(() => {
    if (!previewBase || previewBase.where !== 'account' || cloudContent[previewBase.cloudId]) return undefined
    let cancelled = false
    fetchCloudVersionContent(previewBase.cloudId).then(got => {
      if (!cancelled) setCloudContent(prev => ({ ...prev, [previewBase.cloudId]: got || { failed: true } }))
    })
    return () => { cancelled = true }
  }, [previewBase, cloudContent])
  const preview = previewBase && previewBase.where === 'account'
    ? { ...previewBase, failed: Boolean(cloudContent[previewBase.cloudId]?.failed), content: cloudContent[previewBase.cloudId]?.content, title: cloudContent[previewBase.cloudId]?.title ?? previewBase.title }
    : previewBase

  // Recently deleted scenes (account copies kept 30 days).
  const canRecover = cloudActive && typeof onRecoverScene === 'function' && Boolean(activeNovelId)
  useEffect(() => {
    let cancelled = false
    if (!showDeleted || !canRecover) return undefined
    listRecentlyDeletedScenes(activeNovelId).then(list => { if (!cancelled) setDeletedScenes(list) })
    return () => { cancelled = true }
  }, [showDeleted, canRecover, activeNovelId])

  const handleRecover = useCallback(async (item) => {
    setRecovering(item.sceneId)
    const got = await fetchCloudVersionContent(item.cloudId)
    const recovered = got ? await onRecoverScene({ title: got.title || item.title, content: got.content }) : false
    if (recovered) {
      // The old copy is deliberately left in place (it expires on its own after 30 days).
      setDeletedScenes(list => (list || []).filter(entry => entry.sceneId !== item.sceneId))
      onToast?.('Recovered the scene as a new scene.')
    } else {
      onToast?.('Could not recover that scene.')
    }
    setRecovering(null)
  }, [onRecoverScene, onToast])

  const panel = (
      <div className={`ms-vh-panel${embedded ? ' ms-vh-panel--embedded' : ''}`} tabIndex={-1}>
        <div className="ms-vh-header">
          <div>
            <div className="ms-vh-title">Version History</div>
            <div className="ms-vh-subtitle">{scene?.title || 'Scene'}</div>
            <div className="ms-vh-subtitle ms-vh-device-note">
              {cloudActive
                ? 'Recent versions are kept on this device and in your account: the latest 20, plus one a day for 30 days.'
                : 'Saved on this device only — not synced to your account or other devices.'}
            </div>
            {cloudActive && scene?.id && (
              <div className="ms-vh-subtitle ms-vh-status" data-testid="vh-cloud-status">
                {cloudLoadedFor === scene?.id
                  ? `Account: ${cloudVersions.length} saved for this scene.`
                  : cloudAttempt.failed && cloudAttempt.sceneId === scene?.id
                    ? `Account: could not load${lastCloudHistoryError() ? ` (${lastCloudHistoryError()})` : ''}.`
                    : `Account: loading…${cloudAttempt.tries ? ` (try ${cloudAttempt.tries + 1} of 4, last problem: ${cloudAttempt.reason || 'none'})` : ''}`}
              </div>
            )}
            {cloudActive && cloudPaused && (
              <div className="ms-vh-subtitle ms-vh-paused" role="status">
                Account history is paused after a connection problem, so only this device's versions are shown.{' '}
                <button type="button" className="ms-vh-deleted-toggle" onClick={() => { retryCloudSceneHistoryNow(); reloadCloud() }}>Try again</button>
              </div>
            )}
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
          {!scene?.id ? (
            <div className="ms-vh-empty">
              <p>No scene selected.</p>
              <p className="ms-vh-empty-hint">Click into a scene in the manuscript, then open Version history again to see its saved versions.</p>
            </div>
          ) : versions.length === 0 ? (
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
                        {cloudActive && (
                          <span className="ms-vh-item-title-tag">{v.where === 'device' ? 'This device only' : 'In your account'}</span>
                        )}
                        {v.title && v.title !== scene?.title && <span className="ms-vh-item-title-tag">{v.title}</span>}
                      </div>
                    </button>
                    <button
                      className="ms-vh-delete-btn"
                      onClick={e => { e.stopPropagation(); handleDeleteOne(v) }}
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
                        disabled={preview.content === undefined}
                        title="Applies immediately — undo from the toast"
                      >
                        Restore this version
                      </button>
                    </div>
                    <div className="ms-vh-preview-text">
                      {preview.failed
                        ? (
                          <em style={{ opacity: 0.7 }}>
                            Could not load this version right now.{' '}
                            <button type="button" className="ms-vh-deleted-toggle" onClick={() => setCloudContent(prev => { const next = { ...prev }; delete next[preview.cloudId]; return next })}>Try again</button>
                          </em>
                        )
                        : preview.content === undefined
                        ? <em style={{ opacity: 0.5 }}>Loading…</em>
                        : preview.content || <em style={{ opacity: 0.4 }}>Empty scene</em>}
                    </div>
                  </>
                ) : (
                  <div className="ms-vh-preview-hint">
                    Select a version above to preview it.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {canRecover && (
          <div className="ms-vh-deleted">
            <button type="button" className="ms-vh-deleted-toggle" aria-expanded={showDeleted} onClick={() => setShowDeleted(open => !open)}>
              Recently deleted scenes
            </button>
            {showDeleted && (
              deletedScenes === null ? <p className="ms-vh-deleted-note">Loading…</p>
                : deletedScenes.length === 0 ? <p className="ms-vh-deleted-note">No deleted scenes in the last 30 days.</p>
                  : (
                    <ul className="ms-vh-deleted-list">
                      {deletedScenes.map(item => (
                        <li key={item.sceneId}>
                          <span className="ms-vh-deleted-name">{item.title || 'Untitled scene'}</span>
                          <span className="ms-vh-deleted-meta">{item.wordCount.toLocaleString()} words · deleted {formatTimestamp(item.deletedAt)}</span>
                          <button type="button" className="ms-vh-restore-btn" disabled={recovering === item.sceneId} onClick={() => handleRecover(item)}>
                            {recovering === item.sceneId ? 'Recovering…' : 'Recover as new scene'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
            )}
          </div>
        )}

        {/* Clear all confirmation */}
        {confirmClear && (
          <div className="ms-vh-confirm-overlay">
            <div className="ms-vh-confirm-box">
              <div className="ms-vh-confirm-title">Clear all versions?</div>
              <p className="ms-vh-confirm-body">
                This will permanently delete all {versions.length} saved version{versions.length !== 1 ? 's' : ''} for this scene{cloudActive ? ', on this device and in your account' : ''}. This cannot be undone.
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
