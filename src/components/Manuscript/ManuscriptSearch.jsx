import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { saveSceneVersion } from '../../utils/sceneVersions'

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildRegex(term, matchCase, wholeWord) {
  if (!term) return null
  try {
    const escaped = escapeRegex(term)
    const pattern = wholeWord ? `\\b${escaped}\\b` : escaped
    return new RegExp(pattern, matchCase ? 'g' : 'gi')
  } catch { return null }
}

function countMatches(content, regex) {
  if (!content || !regex) return 0
  regex.lastIndex = 0
  return (content.match(regex) || []).length
}

function getPreviewSnippet(content, regex, maxLen = 120) {
  if (!content || !regex) return ''
  regex.lastIndex = 0
  const match = regex.exec(content)
  if (!match) return content.slice(0, maxLen)
  const start = Math.max(0, match.index - 40)
  const end = Math.min(content.length, match.index + match[0].length + 60)
  const snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '')
  return snippet
}

function HighlightedSnippet({ text, regex }) {
  if (!text || !regex) return <span>{text}</span>
  const parts = []
  let last = 0
  regex.lastIndex = 0
  let m
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), highlight: false })
    parts.push({ text: m[0], highlight: true })
    last = m.index + m[0].length
    if (m[0].length === 0) { last++; regex.lastIndex++ }
  }
  if (last < text.length) parts.push({ text: text.slice(last), highlight: false })
  return (
    <span>
      {parts.map((p, i) =>
        p.highlight
          ? <mark key={i} className="ms-search-mark">{p.text}</mark>
          : <span key={i}>{p.text}</span>
      )}
    </span>
  )
}

export default function ManuscriptSearch({
  scenes, chapters,
  activeNovelId,
  onOpenScene,
  onReplaceInScene,
  onClose,
}) {
  const [term, setTerm] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(null) // { mode, sceneId? }
  const overlayRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { if (confirmReplace) setConfirmReplace(null); else onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, confirmReplace])

  const handleOverlayClick = useCallback(e => {
    if (e.target === overlayRef.current) { if (confirmReplace) setConfirmReplace(null); else onClose() }
  }, [onClose, confirmReplace])

  const novelScenes = useMemo(
    () => scenes.filter(s => s.novelId === activeNovelId),
    [scenes, activeNovelId]
  )

  const chapterMap = useMemo(() => {
    const m = {}
    chapters.forEach(c => { m[c.id] = c })
    return m
  }, [chapters])

  const regex = useMemo(() => buildRegex(term, matchCase, wholeWord), [term, matchCase, wholeWord])

  const results = useMemo(() => {
    if (!regex || !term) return []
    return novelScenes
      .map(scene => {
        const count = countMatches(scene.content || '', regex)
        if (count === 0) return null
        const chapter = chapterMap[scene.chapterId]
        const snippet = getPreviewSnippet(scene.content || '', regex)
        return { scene, chapter, count, snippet }
      })
      .filter(Boolean)
  }, [novelScenes, regex, term, chapterMap])

  const totalCount = results.reduce((sum, r) => sum + r.count, 0)

  const doReplaceInScene = useCallback((sceneId) => {
    const scene = novelScenes.find(s => s.id === sceneId)
    if (!scene || !regex) return
    saveSceneVersion(scene)
    const r = buildRegex(term, matchCase, wholeWord)
    const newContent = (scene.content || '').replace(r, replacement)
    onReplaceInScene(sceneId, newContent)
  }, [novelScenes, regex, term, replacement, matchCase, wholeWord, onReplaceInScene])

  const doReplaceAll = useCallback(() => {
    results.forEach(r => doReplaceInScene(r.scene.id))
  }, [results, doReplaceInScene])

  const executeConfirm = useCallback(() => {
    if (!confirmReplace) return
    if (confirmReplace.mode === 'scene') {
      doReplaceInScene(confirmReplace.sceneId)
    } else {
      doReplaceAll()
    }
    setConfirmReplace(null)
  }, [confirmReplace, doReplaceInScene, doReplaceAll])

  return (
    <div
      ref={overlayRef}
      className="ms-search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
      onClick={handleOverlayClick}
    >
      <div className="ms-search-panel">
        <div className="ms-search-header">
          <span className="ms-search-title">Search Manuscript</span>
          <button className="ms-vh-close" onClick={onClose} aria-label="Close search">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        <div className="ms-search-inputs">
          <div className="ms-search-row">
            <input
              ref={inputRef}
              className="ms-search-input"
              type="text"
              placeholder="Search…"
              value={term}
              onChange={e => setTerm(e.target.value)}
              aria-label="Search term"
            />
            <label className="ms-search-opt" title="Match case">
              <input type="checkbox" checked={matchCase} onChange={e => setMatchCase(e.target.checked)} />
              Aa
            </label>
            <label className="ms-search-opt" title="Whole word">
              <input type="checkbox" checked={wholeWord} onChange={e => setWholeWord(e.target.checked)} />
              <span style={{ textDecoration: 'underline' }}>W</span>
            </label>
            <button
              className={`ms-toolbar-btn${showReplace ? ' is-active' : ''}`}
              onClick={() => setShowReplace(v => !v)}
              title="Toggle replace"
              aria-expanded={showReplace}
            >
              Replace
            </button>
          </div>

          {showReplace && (
            <div className="ms-search-row">
              <input
                className="ms-search-input"
                type="text"
                placeholder="Replace with…"
                value={replacement}
                onChange={e => setReplacement(e.target.value)}
                aria-label="Replacement text"
              />
              <button
                className="ms-toolbar-btn"
                disabled={!term || results.length === 0}
                onClick={() => setConfirmReplace({ mode: 'all' })}
                title="Replace all matches across the project"
              >
                Replace all
              </button>
            </div>
          )}
        </div>

        {term && (
          <div className="ms-search-summary">
            {results.length === 0
              ? 'No matches found.'
              : `${totalCount.toLocaleString()} match${totalCount !== 1 ? 'es' : ''} in ${results.length} scene${results.length !== 1 ? 's' : ''}`
            }
          </div>
        )}

        <div className="ms-search-results">
          {results.map(({ scene, chapter, count, snippet }) => (
            <div key={scene.id} className="ms-search-result-group">
              <div className="ms-search-result-heading">
                <div className="ms-search-result-scene">
                  <span className="ms-search-result-scene-title">{scene.title || 'Untitled scene'}</span>
                  {chapter && <span className="ms-search-result-chapter">{chapter.title || 'Untitled chapter'}</span>}
                </div>
                <div className="ms-search-result-actions">
                  <span className="ms-search-count">{count} match{count !== 1 ? 'es' : ''}</span>
                  {showReplace && (
                    <button
                      className="ms-toolbar-btn"
                      onClick={() => setConfirmReplace({ mode: 'scene', sceneId: scene.id })}
                      title={`Replace all in "${scene.title || 'this scene'}"`}
                    >
                      Replace in scene
                    </button>
                  )}
                  <button
                    className="ms-toolbar-btn"
                    onClick={() => { onOpenScene(scene.id); onClose() }}
                    title="Go to scene"
                  >
                    Go to scene
                  </button>
                </div>
              </div>
              <div className="ms-search-snippet">
                <HighlightedSnippet text={snippet} regex={buildRegex(term, matchCase, wholeWord)} />
              </div>
            </div>
          ))}

          {!term && (
            <div className="ms-vh-empty" style={{ paddingTop: 40 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: 8 }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <p>Type to search across all scenes in this project.</p>
            </div>
          )}
        </div>

        {confirmReplace && (
          <div className="ms-vh-confirm-overlay">
            <div className="ms-vh-confirm-box">
              <div className="ms-vh-confirm-title">
                {confirmReplace.mode === 'all' ? 'Replace all matches?' : 'Replace all in scene?'}
              </div>
              <p className="ms-vh-confirm-body">
                {confirmReplace.mode === 'all'
                  ? `Replace every occurrence of "${term}" with "${replacement}" across ${results.length} scene${results.length !== 1 ? 's' : ''} (${totalCount} match${totalCount !== 1 ? 'es' : ''} total). A version snapshot will be saved for each affected scene first.`
                  : `Replace all ${results.find(r => r.scene.id === confirmReplace.sceneId)?.count ?? 0} occurrence${(results.find(r => r.scene.id === confirmReplace.sceneId)?.count ?? 0) !== 1 ? 's' : ''} of "${term}" with "${replacement}" in this scene. A version snapshot will be saved first.`
                }
              </p>
              <div className="ms-search-confirm-row">
                <span className="ms-search-confirm-term">"{term}"</span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M2 7h10M8 3l4 4-4 4" />
                </svg>
                <span className="ms-search-confirm-term">"{replacement}"</span>
              </div>
              <div className="ms-vh-confirm-actions">
                <button className="btn btn-secondary" onClick={() => setConfirmReplace(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={executeConfirm}>Confirm replace</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
