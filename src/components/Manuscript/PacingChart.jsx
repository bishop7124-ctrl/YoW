import { useState, useMemo, useRef, useEffect, useCallback } from 'react'

const countWords = str => str?.trim().match(/\S+/g)?.length || 0

export default function PacingChart({ scenes, chapters, acts, activeNovelId, onOpenScene, onClose }) {
  const [mode, setMode] = useState('scene')
  const [tooltip, setTooltip] = useState(null) // { bar, x, y }
  const overlayRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleOverlayClick = useCallback(e => {
    if (e.target === overlayRef.current) onClose()
  }, [onClose])

  const novelScenes = useMemo(
    () => scenes.filter(s => s.novelId === activeNovelId),
    [scenes, activeNovelId]
  )

  // Build ordered scene bars
  const sceneBars = useMemo(() => {
    const ordered = []
    acts
      .filter(a => a.novelId === activeNovelId)
      .sort((a, b) => a.order - b.order)
      .forEach(act => {
        chapters
          .filter(c => c.actId === act.id)
          .sort((a, b) => a.order - b.order)
          .forEach(chapter => {
            novelScenes
              .filter(s => s.chapterId === chapter.id)
              .sort((a, b) => a.order - b.order)
              .forEach(scene => {
                ordered.push({
                  id: scene.id,
                  label: scene.title || 'Scene',
                  chapterTitle: chapter.title || 'Chapter',
                  wordCount: countWords(scene.content || ''),
                  sceneId: scene.id,
                })
              })
          })
      })
    return ordered
  }, [acts, chapters, novelScenes, activeNovelId])

  // Build ordered chapter bars
  const chapterBars = useMemo(() => {
    const ordered = []
    acts
      .filter(a => a.novelId === activeNovelId)
      .sort((a, b) => a.order - b.order)
      .forEach(() => {
        chapters
          .filter(c => acts.find(a => a.novelId === activeNovelId && a.id === c.actId))
          .sort((a, b) => a.order - b.order)
          .forEach(chapter => {
            const chScenes = novelScenes.filter(s => s.chapterId === chapter.id)
            const wordCount = chScenes.reduce((sum, s) => sum + countWords(s.content || ''), 0)
            ordered.push({
              id: chapter.id,
              label: chapter.title || 'Chapter',
              sceneCount: chScenes.length,
              wordCount,
            })
          })
      })
    // deduplicate (chapters appear once even if act filter above could repeat)
    const seen = new Set()
    return ordered.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true })
  }, [acts, chapters, novelScenes, activeNovelId])

  const bars = mode === 'scene' ? sceneBars : chapterBars
  const maxWords = Math.max(...bars.map(b => b.wordCount), 1)
  const avgWords = bars.length ? Math.round(bars.reduce((s, b) => s + b.wordCount, 0) / bars.length) : 0
  const shortBar = bars.length ? bars.reduce((a, b) => b.wordCount < a.wordCount ? b : a) : null
  const longBar = bars.length ? bars.reduce((a, b) => b.wordCount > a.wordCount ? b : a) : null
  const THRESHOLD = 0.4 // flag if ±40% from average
  const flagged = bars.filter(b => avgWords > 0 && Math.abs(b.wordCount - avgWords) / avgWords > THRESHOLD)

  return (
    <div
      ref={overlayRef}
      className="ms-search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Pacing chart"
      onClick={handleOverlayClick}
    >
      <div className="ms-pacing-panel">
        <div className="ms-search-header">
          <span className="ms-search-title">Pacing Chart</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="ms-toolbar-segment" role="group" aria-label="Chart mode">
              <button
                type="button"
                className={mode === 'scene' ? 'is-active' : ''}
                onClick={() => setMode('scene')}
              >Scenes</button>
              <button
                type="button"
                className={mode === 'chapter' ? 'is-active' : ''}
                onClick={() => setMode('chapter')}
              >Chapters</button>
            </div>
            <button className="ms-vh-close" onClick={onClose} aria-label="Close pacing chart">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 1l12 12M13 1L1 13" />
              </svg>
            </button>
          </div>
        </div>

        <div className="ms-pacing-body">
          {bars.length === 0 ? (
            <div className="ms-vh-empty" style={{ paddingTop: 60 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: 8 }}>
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 17V13M12 17v-6M16 17V9" />
              </svg>
              <p>No {mode === 'scene' ? 'scenes' : 'chapters'} with content yet.</p>
            </div>
          ) : (
            <>
              <div className="ms-pacing-stats">
                <div className="ms-pacing-stat">
                  <span className="ms-pacing-stat-label">Average</span>
                  <span className="ms-pacing-stat-value">{avgWords.toLocaleString()}</span>
                </div>
                {shortBar && (
                  <div className="ms-pacing-stat">
                    <span className="ms-pacing-stat-label">Shortest</span>
                    <span className="ms-pacing-stat-value">{shortBar.wordCount.toLocaleString()}</span>
                    <span className="ms-pacing-stat-name">{shortBar.label}</span>
                  </div>
                )}
                {longBar && (
                  <div className="ms-pacing-stat">
                    <span className="ms-pacing-stat-label">Longest</span>
                    <span className="ms-pacing-stat-value">{longBar.wordCount.toLocaleString()}</span>
                    <span className="ms-pacing-stat-name">{longBar.label}</span>
                  </div>
                )}
                {flagged.length > 0 && (
                  <div className="ms-pacing-stat ms-pacing-stat--flag">
                    <span className="ms-pacing-stat-label">Outliers</span>
                    <span className="ms-pacing-stat-value">{flagged.length}</span>
                    <span className="ms-pacing-stat-name">{mode === 'scene' ? 'scene' : 'chapter'}{flagged.length !== 1 ? 's' : ''} ±40% from avg</span>
                  </div>
                )}
              </div>

              <div className="ms-pacing-chart-wrap" onMouseLeave={() => setTooltip(null)}>
                <div ref={chartRef} className="ms-pacing-chart" role="img" aria-label="Word count bar chart">
                  {/* Average line */}
                  <div
                    className="ms-pacing-avg-line"
                    style={{ bottom: `${(avgWords / maxWords) * 100}%` }}
                  />
                  {bars.map(bar => {
                    const pct = maxWords > 0 ? (bar.wordCount / maxWords) * 100 : 0
                    const isFlagged = avgWords > 0 && Math.abs(bar.wordCount - avgWords) / avgWords > THRESHOLD
                    return (
                      <div key={bar.id} className="ms-pacing-bar-wrap">
                        <div
                          className={`ms-pacing-bar${isFlagged ? ' is-flagged' : ''}`}
                          style={{ height: `${Math.max(pct, 1)}%` }}
                          role="button"
                          tabIndex={bar.sceneId ? 0 : -1}
                          aria-label={`${bar.label}: ${bar.wordCount.toLocaleString()} words`}
                          onMouseEnter={e => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const wrap = chartRef.current?.closest('.ms-pacing-chart-wrap')
                            const wrapRect = wrap?.getBoundingClientRect() ?? rect
                            setTooltip({
                              bar,
                              x: rect.left - wrapRect.left + rect.width / 2,
                              y: rect.top - wrapRect.top - 8,
                            })
                          }}
                          onMouseLeave={() => setTooltip(null)}
                          onClick={() => { if (bar.sceneId && onOpenScene) { onOpenScene(bar.sceneId); onClose() } }}
                          onKeyDown={e => { if (e.key === 'Enter' && bar.sceneId && onOpenScene) { onOpenScene(bar.sceneId); onClose() } }}
                        />
                        <div className="ms-pacing-bar-label" title={bar.label}>{bar.label}</div>
                      </div>
                    )
                  })}

                  {tooltip && (
                    <div
                      className="ms-pacing-tooltip"
                      style={{ left: tooltip.x, top: tooltip.y }}
                      aria-hidden="true"
                    >
                      <div className="ms-pacing-tooltip-title">{tooltip.bar.label}</div>
                      {tooltip.bar.chapterTitle && (
                        <div className="ms-pacing-tooltip-sub">{tooltip.bar.chapterTitle}</div>
                      )}
                      {tooltip.bar.sceneCount != null && (
                        <div className="ms-pacing-tooltip-sub">{tooltip.bar.sceneCount} scene{tooltip.bar.sceneCount !== 1 ? 's' : ''}</div>
                      )}
                      <div className="ms-pacing-tooltip-count">{tooltip.bar.wordCount.toLocaleString()} words</div>
                    </div>
                  )}
                </div>
              </div>

              {flagged.length > 0 && (
                <div className="ms-pacing-flagged-list">
                  <div className="ms-pacing-flagged-heading">Pacing outliers</div>
                  {flagged.map(b => (
                    <div key={b.id} className="ms-pacing-flagged-item">
                      <span className={b.wordCount > avgWords ? 'ms-pacing-flag-over' : 'ms-pacing-flag-under'}>
                        {b.wordCount > avgWords ? '↑ Long' : '↓ Short'}
                      </span>
                      <span>{b.label}</span>
                      <span className="ms-pacing-flagged-count">{b.wordCount.toLocaleString()} words</span>
                      {b.sceneId && onOpenScene && (
                        <button
                          className="ms-toolbar-btn"
                          style={{ marginLeft: 'auto' }}
                          onClick={() => { onOpenScene(b.sceneId); onClose() }}
                        >
                          Go to scene
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
