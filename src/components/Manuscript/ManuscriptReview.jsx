import { useEffect, useMemo, useRef, useState } from 'react'
import { buildTrackedDiff, hasTrackedChanges } from './trackedChanges.js'

function scenePath(scene, chapters, acts, labels) {
  const chapter = chapters.find(item => item.id === scene.chapterId)
  const act = acts.find(item => item.id === chapter?.actId)
  return [act?.title, chapter?.title || labels.level2].filter(Boolean).join(' · ')
}

function Redline({ segments, sceneId, sceneTitle, activeChangeIndex = null, activeChangeRef, onSelectChange }) {
  const parts = []
  for (let index = 0; index < segments.length;) {
    const segment = segments[index]
    if (segment.type === 'equal') {
      parts.push(<span key={`equal-${index}`}>{segment.text}</span>)
      index++
      continue
    }
    const changeIndex = segment.changeIndex
    const changed = []
    const start = index
    while (index < segments.length && segments[index].type !== 'equal' && segments[index].changeIndex === changeIndex) {
      const item = segments[index]
      if (item.type === 'insert') changed.push(<ins key={`insert-${index}`}>{item.text}</ins>)
      if (item.type === 'delete') changed.push(<del key={`delete-${index}`}>{item.text}</del>)
      index++
    }
    const active = changeIndex === activeChangeIndex
    parts.push(
      <span
        key={`change-${start}`}
        ref={active ? activeChangeRef : null}
        className={`ms-review-inline-change${active ? ' is-active' : ''}`}
        role="button"
        tabIndex={0}
        aria-current={active ? 'step' : undefined}
        aria-label={`Review change ${changeIndex + 1} in ${sceneTitle}`}
        onClick={() => onSelectChange(sceneId, changeIndex)}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onSelectChange(sceneId, changeIndex)
        }}
      >
        {changed}
      </span>,
    )
  }
  return (
    <div className="ms-review-redline" aria-label="Manuscript with tracked changes">
      {parts}
    </div>
  )
}

export default function ManuscriptReview({ scenes, chapters, acts, labels, onAcceptChange, onRejectChange, onAcceptScene, onRejectScene, onReturnToWriting }) {
  const documentScenes = useMemo(() => scenes.map(scene => {
    const pending = hasTrackedChanges(scene.trackedChanges)
    return {
      ...scene,
      pending,
      diff: pending ? buildTrackedDiff(
        scene.trackedChanges.baseContent,
        scene.trackedChanges.proposedContent,
        scene.trackedChanges.segments,
      ) : {
        segments: [{ type: 'equal', text: String(scene.content || '') }],
        changes: [],
      },
    }
  }), [scenes])
  const pending = useMemo(() => documentScenes.filter(scene => scene.pending), [documentScenes])
  const reviewQueue = useMemo(() => pending.flatMap(scene => scene.diff.changes.map((change, changeIndex) => ({
    sceneId: scene.id,
    sceneTitle: scene.title && scene.title !== 'Scene' ? scene.title : labels.level3,
    changeIndex,
    key: `${scene.id}:${change.baseStart}:${change.proposedStart}:${change.before}:${change.after}`,
  }))), [labels.level3, pending])
  const [activePosition, setActivePosition] = useState(0)
  const activeChangeRef = useRef(null)
  const safePosition = Math.min(activePosition, Math.max(0, reviewQueue.length - 1))
  const activeChange = reviewQueue[safePosition]
  const selectChange = (sceneId, changeIndex) => {
    const position = reviewQueue.findIndex(item => item.sceneId === sceneId && item.changeIndex === changeIndex)
    if (position >= 0) setActivePosition(position)
  }

  useEffect(() => {
    activeChangeRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [activeChange?.key])

  if (!pending.length) {
    return (
      <main className="ms-review ms-review-empty font-sans">
        <div className="ms-review-empty-card">
          <span className="ms-review-check" aria-hidden="true">✓</span>
          <h2>All changes reviewed</h2>
          <p>There are no tracked manuscript edits waiting for approval.</p>
          <button type="button" className="btn btn-primary" onClick={onReturnToWriting}>Return to Writing</button>
        </div>
      </main>
    )
  }

  return (
    <main className="ms-review font-sans">
      <header className="ms-review-intro">
        <div>
          <span className="ms-review-eyebrow">Review tracked changes</span>
          <h1>Review changes in the manuscript</h1>
          <p>Move through each inline edit, then accept or reject it in context. You can also click any marked change in the document.</p>
        </div>
      </header>

      <nav className="ms-review-navigator" aria-label="Tracked change navigation">
        <div className="ms-review-progress" aria-live="polite">
          <strong>Change {safePosition + 1} of {reviewQueue.length}</strong>
          <span>{activeChange?.sceneTitle}</span>
        </div>
        <div className="ms-review-navigator-controls">
          <div className="ms-review-nav-actions">
            <button type="button" onClick={() => setActivePosition(Math.max(0, safePosition - 1))} disabled={safePosition === 0} aria-label="Previous change">← Previous</button>
            <button type="button" onClick={() => setActivePosition(Math.min(reviewQueue.length - 1, safePosition + 1))} disabled={safePosition === reviewQueue.length - 1} aria-label="Next change">Next →</button>
          </div>
          <div className="ms-review-decision-actions">
            <button type="button" onClick={() => onRejectChange(activeChange.sceneId, activeChange.changeIndex)}>Reject change</button>
            <button type="button" className="is-primary" onClick={() => onAcceptChange(activeChange.sceneId, activeChange.changeIndex)}>Accept change</button>
          </div>
        </div>
      </nav>

      <div className="ms-review-document" aria-label="Manuscript review document">
        {documentScenes.map(scene => (
          <article className={`ms-review-scene${scene.pending ? ' has-changes' : ''}`} key={scene.id}>
            <header className="ms-review-card-header">
              <div>
                <span>{scenePath(scene, chapters, acts, labels)}</span>
                <h2>{scene.title && scene.title !== 'Scene' ? scene.title : labels.level3}</h2>
              </div>
              {scene.pending && (
                <div className="ms-review-scene-actions">
                  <button type="button" onClick={() => onRejectScene(scene.id)}>Reject all in scene</button>
                  <button type="button" className="is-primary" onClick={() => onAcceptScene(scene.id)}>Accept all in scene</button>
                </div>
              )}
            </header>

            <Redline
              segments={scene.diff.segments}
              sceneId={scene.id}
              sceneTitle={scene.title && scene.title !== 'Scene' ? scene.title : labels.level3}
              activeChangeIndex={activeChange?.sceneId === scene.id ? activeChange.changeIndex : null}
              activeChangeRef={activeChangeRef}
              onSelectChange={selectChange}
            />
          </article>
        ))}
      </div>
    </main>
  )
}
