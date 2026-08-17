import { useCallback, useMemo, useRef, useState } from 'react'
import { SCENE_STATUSES, nextStatus } from './manuscriptUtils.js'

// ─── Word count helpers ───────────────────────────────────────────────────────

const countWords = (content) => {
  if (!content?.trim()) return 0
  return content.trim().split(/\s+/).filter(Boolean).length
}

const fmtWords = (n) => {
  if (!n) return ''
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${n}`
}

// Status square color — mapped onto the redesign's token language rather than the
// hard-coded hex SCENE_STATUSES.color carries (that field still drives the inline
// status chip elsewhere; this mapping is local to the rail's compact square so it
// responds to all seven themes instead of being frozen to one hue everywhere).
const SQUARE_TOKEN = {
  draft: 'var(--border-strong)',
  writing: 'var(--accent)',
  complete: 'var(--accent-2)',
  revision: 'var(--accent-text)',
}
const squareColor = (status) => SQUARE_TOKEN[status] || SQUARE_TOKEN.draft

// ─── Icons ───────────────────────────────────────────────────────────────────

const ChevronDown = () => (
  <svg width="10" height="10" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M2 3 4.5 6 7 3" />
  </svg>
)

const CollapseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"><path d="M14 6l-6 6 6 6" /></svg>
)

const ExpandIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"><path d="M10 6l6 6-6 6" /></svg>
)

const PlusIcon = () => (
  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M4.5 1.5v6M1.5 4.5h6" />
  </svg>
)

const PencilIcon = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.6 2.2 9.8 4.4M1.8 8.2 7.8 2.2a1.4 1.4 0 0 1 2 2l-6 6-2.4.5.4-2.5Z" />
  </svg>
)

const TrashIcon = () => (
  <svg width="9" height="10" viewBox="0 0 10 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M1 3h8M4 3V1.5h2V3M3 3l.5 7.5h3L7 3" />
  </svg>
)

const GripIcon = () => (
  <svg width="7" height="11" viewBox="0 0 7 11" fill="currentColor">
    <circle cx="2" cy="1.5" r="1" /><circle cx="5" cy="1.5" r="1" />
    <circle cx="2" cy="5.5" r="1" /><circle cx="5" cy="5.5" r="1" />
    <circle cx="2" cy="9.5" r="1" /><circle cx="5" cy="9.5" r="1" />
  </svg>
)

const isGeneratedTitle = (title, label) => {
  const clean = (title || '').trim()
  if (!clean) return true
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}(\\s+\\d+)?$`, 'i').test(clean)
}

const displayNumberedTitle = (title, label, num) =>
  isGeneratedTitle(title, label) ? `${label} ${num}` : `${label} ${num}: ${title}`

function InlineRename({ value, fallback, generatedLabel, onSave }) {
  const [draft, setDraft] = useState(isGeneratedTitle(value, generatedLabel || fallback) ? '' : (value || ''))
  const saved = useRef(false)

  const commit = useCallback((nextValue) => {
    if (saved.current) return
    saved.current = true
    const trimmed = (nextValue ?? draft).trim()
    onSave(trimmed || fallback)
  }, [draft, fallback, onSave])

  return (
    <input
      autoFocus
      className="ms-rail-rename-input"
      value={draft}
      placeholder={fallback}
      draggable={false}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') { saved.current = true; onSave(value || fallback) }
      }}
      onBlur={() => commit()}
    />
  )
}

// ─── Scene row ────────────────────────────────────────────────────────────────

function SceneRow({
  scene, index, isActive,
  onSelect, onUpdateScene, onDeleteScene, onAddSceneBefore,
  dragRef, dragOver, setDragOver, onDropScene,
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const words = useMemo(() => countWords(scene.content), [scene.content])
  const isDragging = dragRef.current?.id === scene.id
  const isDropTarget = dragOver?.id === scene.id && dragOver?.type === 'scene'
  const status = scene.status || 'draft'
  const statusLabel = SCENE_STATUSES.find(s => s.value === status)?.label ?? 'Draft'

  const handleDragStart = (e) => {
    dragRef.current = { type: 'scene', id: scene.id, chapterId: scene.chapterId }
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e) => {
    if (!dragRef.current || dragRef.current.type !== 'scene') return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDragOver({ id: scene.id, position: pos, type: 'scene' })
  }
  const handleDrop = (e) => {
    e.preventDefault()
    const pos = dragOver?.position ?? 'before'
    onDropScene(dragRef.current, scene.chapterId, scene.id, pos)
    dragRef.current = null
    setDragOver(null)
  }

  const displayTitle = scene.title && scene.title !== 'Scene' ? scene.title : `Scene ${index + 1}`

  return (
    <>
      <div className="ms-rail-addrow">
        <button type="button" onClick={() => onAddSceneBefore(index)}>+ scene</button>
      </div>
      <div
        className={`ms-rail-scene${isActive ? ' is-active' : ''}${isDragging ? ' is-dragging' : ''}`}
        style={{
          borderTop: isDropTarget && dragOver.position === 'before' ? '2px solid var(--accent)' : undefined,
          borderBottom: isDropTarget && dragOver.position === 'after' ? '2px solid var(--accent)' : undefined,
        }}
        draggable={!editingTitle}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(null)}
        onDrop={handleDrop}
        onDragEnd={() => { dragRef.current = null; setDragOver(null) }}
      >
        <span className="ms-rail-grip" aria-hidden="true"><GripIcon /></span>

        {editingTitle ? (
          <InlineRename
            value={scene.title}
            fallback={`Scene ${index + 1}`}
            generatedLabel="Scene"
            onSave={title => { onUpdateScene(scene.id, { title }); setEditingTitle(false) }}
          />
        ) : (
          <button type="button" className="ms-rail-scene-btn" onClick={() => onSelect(scene.id)} title={displayTitle}>
            <span
              className="ms-rail-sq"
              style={{ background: squareColor(status) }}
              title={`Status: ${statusLabel} (click to change)`}
              onClick={e => { e.stopPropagation(); onUpdateScene(scene.id, { status: nextStatus(status) }) }}
            />
            <span className="ms-rail-scene-title">{displayTitle}</span>
            {words > 0 && <span className="ms-rail-scene-words">{fmtWords(words)}</span>}
          </button>
        )}

        <span className="ms-rail-row-actions">
          <button type="button" className="ms-rail-icon-btn" onClick={() => setEditingTitle(true)} title="Rename scene" aria-label="Rename scene">
            <PencilIcon />
          </button>
          <button
            type="button"
            className="ms-rail-icon-btn ms-rail-delete-btn"
            onClick={() => { if (window.confirm(`Delete "${displayTitle}"? This cannot be undone.`)) onDeleteScene(scene.id) }}
            title="Delete scene"
            aria-label="Delete scene"
          >
            <TrashIcon />
          </button>
        </span>
      </div>
    </>
  )
}

// ─── Chapter row ──────────────────────────────────────────────────────────────

function ChapterRow({
  chap, chapNum, scenes,
  onAddScene, onSelectChapter,
  onUpdateChapter, onDeleteChapter,
  activeSceneId, onSelectScene, onUpdateScene, onDeleteScene,
  labels, onMoveScene,
  dragRef, dragOver, setDragOver, onDropChapter, onDropScene,
}) {
  const [open, setOpen] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const chapScenes = useMemo(
    () => scenes.filter(s => s.chapterId === chap.id).sort((a, b) => a.order - b.order),
    [scenes, chap.id]
  )
  const totalWords = useMemo(() => chapScenes.reduce((acc, s) => acc + countWords(s.content), 0), [chapScenes])
  const isDragging = dragRef.current?.id === chap.id
  const isDropTarget = dragOver?.id === chap.id && dragOver?.type === 'chapter'
  const displayTitle = displayNumberedTitle(chap.title, labels.level2, chapNum)

  const handleDragStart = (e) => {
    dragRef.current = { type: 'chapter', id: chap.id, actId: chap.actId }
    e.dataTransfer.effectAllowed = 'move'
    e.stopPropagation()
  }
  const handleDragOver = (e) => {
    if (!dragRef.current || dragRef.current.type !== 'chapter') return
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDragOver({ id: chap.id, position: pos, type: 'chapter' })
  }
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const pos = dragOver?.position ?? 'before'
    onDropChapter(dragRef.current, chap.actId, chap.id, pos)
    dragRef.current = null
    setDragOver(null)
  }

  return (
    <div className="ms-rail-chapter">
      <div
        className={`ms-rail-chapter-h${isDragging ? ' is-dragging' : ''}`}
        style={{
          borderTop: isDropTarget && dragOver.position === 'before' ? '2px solid var(--accent)' : undefined,
          borderBottom: isDropTarget && dragOver.position === 'after' ? '2px solid var(--accent)' : undefined,
        }}
        draggable={!editingTitle}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(null)}
        onDrop={handleDrop}
        onDragEnd={() => { dragRef.current = null; setDragOver(null) }}
      >
        <span className="ms-rail-grip" aria-hidden="true"><GripIcon /></span>
        <button type="button" className="ms-rail-caret" onClick={() => setOpen(v => !v)} aria-label={open ? 'Collapse' : 'Expand'} style={{ transform: open ? 'none' : 'rotate(-90deg)' }}>
          <ChevronDown />
        </button>

        {editingTitle ? (
          <InlineRename
            value={chap.title}
            fallback={`${labels.level2} ${chapNum}`}
            generatedLabel={labels.level2}
            onSave={title => { onUpdateChapter(chap.id, { title }); setEditingTitle(false) }}
          />
        ) : (
          <button type="button" className="ms-rail-chapter-btn" onClick={() => onSelectChapter(chap.id)} title={displayTitle}>
            <span className="ms-rail-chapter-title">{displayTitle}</span>
            <span className="ms-rail-chapter-n">{chapScenes.length}{totalWords > 0 ? ` · ${fmtWords(totalWords)}` : ''}</span>
          </button>
        )}

        <span className="ms-rail-row-actions">
          <button type="button" className="ms-rail-icon-btn" onClick={() => setEditingTitle(true)} title={`Rename ${labels.level2}`} aria-label={`Rename ${labels.level2}`}>
            <PencilIcon />
          </button>
          <button
            type="button"
            className="ms-rail-icon-btn ms-rail-delete-btn"
            onClick={() => { if (window.confirm(`Delete "${displayTitle}" and all its scenes?`)) onDeleteChapter(chap.id) }}
            title={`Delete ${labels.level2}`}
            aria-label={`Delete ${labels.level2}`}
          >
            <TrashIcon />
          </button>
        </span>
      </div>

      {open && (
        <div
          className={`ms-rail-scenes${dragOver?.id === chap.id && dragOver?.type === 'chapter-empty' ? ' is-drop-target' : ''}`}
          onDragOver={e => {
            if (!dragRef.current || dragRef.current.type !== 'scene') return
            e.preventDefault()
            setDragOver({ id: chap.id, position: 'inside', type: 'chapter-empty' })
          }}
          onDrop={e => {
            if (!dragRef.current || dragRef.current.type !== 'scene') return
            e.preventDefault()
            onMoveScene(dragRef.current.id, chap.id)
            dragRef.current = null
            setDragOver(null)
          }}
        >
          {chapScenes.map((scene, i) => (
            <SceneRow
              key={scene.id}
              scene={scene}
              index={i}
              isActive={scene.id === activeSceneId}
              onSelect={onSelectScene}
              onUpdateScene={onUpdateScene}
              onDeleteScene={onDeleteScene}
              onAddSceneBefore={() => onAddScene(chap.id)}
              dragRef={dragRef}
              dragOver={dragOver}
              setDragOver={setDragOver}
              onDropScene={onDropScene}
            />
          ))}
          {chapScenes.length === 0 && (
            <div className="ms-rail-dropzone">Drop {labels.level3.toLowerCase()} here</div>
          )}
          <div className="ms-rail-addrow ms-rail-addrow-end">
            <button type="button" onClick={() => onAddScene(chap.id)}><PlusIcon /> {labels.level3.toLowerCase()}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Collapsed spine ──────────────────────────────────────────────────────────

function RailSpine({ flatScenes, activeSceneId, onSelectScene }) {
  return (
    <div className="ms-rail-spine" role="navigation" aria-label="Manuscript position">
      {flatScenes.map(scene => (
        <button
          key={scene.id}
          type="button"
          className={`ms-rail-spine-tick${scene.id === activeSceneId ? ' is-active' : ''}`}
          onClick={() => onSelectScene(scene.id)}
          title={scene.title && scene.title !== 'Scene' ? scene.title : undefined}
          aria-label={scene.title || 'Scene'}
        />
      ))}
    </div>
  )
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function ManuscriptRail({
  acts, chapters, scenes,
  addAct, addChapter, addScene,
  updateAct, updateChapter, updateScene,
  deleteAct, deleteChapter, deleteScene,
  moveAct, moveChapter, moveScene,
  activeSceneId, onSelectScene, onSelectChapter,
  labels, totalWordCount,
  collapsed, onToggleCollapsed,
}) {
  const [renamingActId, setRenamingActId] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const dragRef = useRef(null)

  const handleAddScene = useCallback((chapId) => {
    const newScene = addScene(chapId, labels.level3)
    requestAnimationFrame(() => {
      document.getElementById(`ms-scene-${newScene.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [addScene, labels.level3])

  const handleAddChapter = useCallback((actId) => {
    addChapter(actId, labels.level2)
  }, [addChapter, labels.level2])

  const handleMoveSceneToChapter = useCallback((sceneId, chapterId) => {
    const destCount = scenes.filter(s => s.chapterId === chapterId && s.id !== sceneId).length
    moveScene(sceneId, chapterId, destCount)
  }, [scenes, moveScene])

  const handleDropChapter = useCallback((dragged, toActId, targetChapId, position) => {
    if (!dragged || dragged.type !== 'chapter') return
    const actChapters = chapters.filter(c => c.actId === toActId).sort((a, b) => a.order - b.order)
    const targetIdx = actChapters.findIndex(c => c.id === targetChapId)
    const toIndex = position === 'after' ? targetIdx + 1 : targetIdx
    moveChapter(dragged.id, toActId, toIndex)
  }, [chapters, moveChapter])

  const handleDropScene = useCallback((dragged, toChapterId, targetSceneId, position) => {
    if (!dragged || dragged.type !== 'scene') return
    const chapScenes = scenes.filter(s => s.chapterId === toChapterId).sort((a, b) => a.order - b.order)
    const targetIdx = chapScenes.findIndex(s => s.id === targetSceneId)
    const toIndex = position === 'after' ? targetIdx + 1 : targetIdx
    moveScene(dragged.id, toChapterId, toIndex)
  }, [scenes, moveScene])

  const chapterNumbers = useMemo(() => {
    const map = {}
    let count = 1
    acts.forEach(act => {
      chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order).forEach(c => { map[c.id] = count++ })
    })
    return map
  }, [acts, chapters])

  const actWords = useCallback((act) => {
    const actChapIds = new Set(chapters.filter(c => c.actId === act.id).map(c => c.id))
    return scenes.filter(s => actChapIds.has(s.chapterId)).reduce((acc, s) => acc + countWords(s.content), 0)
  }, [chapters, scenes])

  // Flat, document-ordered scene list — only needed for the collapsed spine view.
  const flatScenes = useMemo(() => {
    const out = []
    acts.forEach(act => {
      chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order).forEach(chap => {
        scenes.filter(s => s.chapterId === chap.id).sort((a, b) => a.order - b.order).forEach(s => out.push(s))
      })
    })
    return out
  }, [acts, chapters, scenes])

  return (
    <aside data-tour="manuscript-structure" className={`ms-rail font-sans${collapsed ? ' is-collapsed' : ''}`}>
      <div className="ms-rail-h">
        <span className="ms-rail-h-label">Manuscript</span>
        {totalWordCount > 0 && !collapsed && <span className="ms-rail-h-words">{totalWordCount.toLocaleString()}w</span>}
        <button
          type="button"
          className="ms-rail-icon-btn ms-rail-collapse-btn"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand manuscript structure (⌘\\)' : 'Collapse manuscript structure (⌘\\)'}
          aria-pressed={!collapsed}
        >
          {collapsed ? <ExpandIcon /> : <CollapseIcon />}
        </button>
      </div>

      {collapsed ? (
        <RailSpine flatScenes={flatScenes} activeSceneId={activeSceneId} onSelectScene={onSelectScene} />
      ) : (
        <>
          <nav className="ms-rail-tree">
            {acts.map((act, actIndex) => {
              const actChapters = chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order)
              const words = actWords(act)
              const isActDragging = dragRef.current?.id === act.id
              const isActDropTarget = dragOver?.id === act.id && dragOver?.type === 'act'

              const handleActDragStart = (e) => {
                dragRef.current = { type: 'act', id: act.id }
                e.dataTransfer.effectAllowed = 'move'
              }
              const handleActDragOver = (e) => {
                if (!dragRef.current || dragRef.current.type !== 'act') return
                e.preventDefault()
                const rect = e.currentTarget.getBoundingClientRect()
                const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                setDragOver({ id: act.id, position: pos, type: 'act' })
              }
              const handleActDrop = (e) => {
                e.preventDefault()
                if (!dragRef.current || dragRef.current.type !== 'act') return
                const targetIdx = acts.findIndex(a => a.id === act.id)
                const toIndex = dragOver?.position === 'after' ? targetIdx + 1 : targetIdx
                moveAct(dragRef.current.id, toIndex)
                dragRef.current = null
                setDragOver(null)
              }

              return (
                <div key={act.id} className="ms-rail-act">
                  <div
                    className={`ms-rail-act-h${isActDragging ? ' is-dragging' : ''}`}
                    style={{
                      borderTop: isActDropTarget && dragOver.position === 'before' ? '2px solid var(--accent)' : undefined,
                      borderBottom: isActDropTarget && dragOver.position === 'after' ? '2px solid var(--accent)' : undefined,
                    }}
                    draggable={renamingActId !== act.id}
                    onDragStart={handleActDragStart}
                    onDragOver={handleActDragOver}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={handleActDrop}
                    onDragEnd={() => { dragRef.current = null; setDragOver(null) }}
                  >
                    <span className="ms-rail-grip" aria-hidden="true"><GripIcon /></span>
                    {renamingActId === act.id ? (
                      <InlineRename
                        value={act.title}
                        fallback={`${labels.level1} ${actIndex + 1}`}
                        generatedLabel={labels.level1}
                        onSave={title => { updateAct(act.id, { title }); setRenamingActId(null) }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="ms-rail-act-btn"
                        onClick={() => { const firstChap = actChapters[0]; if (firstChap) onSelectChapter(firstChap.id) }}
                        title={act.title}
                      >
                        {act.title}
                      </button>
                    )}
                    <span className="ms-rail-act-n">{words > 0 ? fmtWords(words) : ''}</span>
                    <span className="ms-rail-row-actions">
                      <button type="button" className="ms-rail-icon-btn" onClick={() => setRenamingActId(act.id)} title={`Rename ${labels.level1}`} aria-label={`Rename ${labels.level1}`}>
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="ms-rail-icon-btn ms-rail-delete-btn"
                        onClick={() => { if (window.confirm(`Delete "${act.title}" and all its chapters and scenes?`)) deleteAct(act.id) }}
                        title={`Delete ${labels.level1}`}
                        aria-label={`Delete ${labels.level1}`}
                      >
                        <TrashIcon />
                      </button>
                    </span>
                  </div>

                  <div
                    className={`ms-rail-chapters${dragOver?.id === act.id && dragOver?.type === 'act-empty' ? ' is-drop-target' : ''}`}
                    onDragOver={e => {
                      if (!dragRef.current || dragRef.current.type !== 'chapter') return
                      e.preventDefault()
                      setDragOver({ id: act.id, position: 'inside', type: 'act-empty' })
                    }}
                    onDrop={e => {
                      if (!dragRef.current || dragRef.current.type !== 'chapter') return
                      e.preventDefault()
                      moveChapter(dragRef.current.id, act.id, actChapters.length)
                      dragRef.current = null
                      setDragOver(null)
                    }}
                  >
                    {actChapters.map(chap => (
                      <ChapterRow
                        key={chap.id}
                        chap={chap}
                        chapNum={chapterNumbers[chap.id]}
                        scenes={scenes}
                        onAddScene={handleAddScene}
                        onSelectChapter={onSelectChapter}
                        onUpdateChapter={updateChapter}
                        onDeleteChapter={deleteChapter}
                        activeSceneId={activeSceneId}
                        onSelectScene={onSelectScene}
                        onUpdateScene={updateScene}
                        onDeleteScene={deleteScene}
                        labels={labels}
                        onMoveScene={handleMoveSceneToChapter}
                        dragRef={dragRef}
                        dragOver={dragOver}
                        setDragOver={setDragOver}
                        onDropChapter={handleDropChapter}
                        onDropScene={handleDropScene}
                      />
                    ))}
                    {actChapters.length === 0 && (
                      <div className="ms-rail-dropzone">Drop {labels.level2.toLowerCase()} here</div>
                    )}
                  </div>
                </div>
              )
            })}
          </nav>

          <div className="ms-rail-f">
            <button
              type="button"
              className="ms-rail-f-btn"
              onClick={() => {
                const lastAct = acts[acts.length - 1]
                const lastChap = lastAct
                  ? chapters.filter(c => c.actId === lastAct.id).sort((a, b) => a.order - b.order).slice(-1)[0]
                  : null
                if (lastChap) handleAddScene(lastChap.id)
              }}
              disabled={chapters.length === 0}
              title={chapters.length === 0 ? `Add a ${labels.level2.toLowerCase()} first` : `Add a ${labels.level3.toLowerCase()} to the end of the manuscript`}
            >
              + {labels.level3}
            </button>
            <button
              type="button"
              className="ms-rail-f-btn"
              onClick={() => {
                const act = acts[acts.length - 1]
                if (act) handleAddChapter(act.id)
              }}
              disabled={acts.length === 0}
              title={acts.length === 0 ? `Add a ${labels.level1.toLowerCase()} first` : `Add a ${labels.level2.toLowerCase()} to the end of the manuscript`}
            >
              + {labels.level2}
            </button>
            <button type="button" className="ms-rail-f-btn" onClick={() => addAct(`${labels.level1} ${acts.length + 1}`)}>
              + {labels.level1}
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
