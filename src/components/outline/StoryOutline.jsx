import { useEffect, useMemo, useState } from 'react'
import { getProjectType, getStoryEventIndicators } from '../../constants/projectTypes.js'
import {
  buildOutlineModel,
  formatOutlineChapterTitle,
  outlineSynopsis,
  outlineText,
  outlineWordCount,
} from '../../utils/outlineDisplay.js'
import ParentMoveSelect from '../shared/ParentMoveSelect.jsx'
import OutlineItemEditor from './OutlineItemEditor.jsx'

const ChevronIcon = ({ open }) => (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

const DragHandle = ({ item, label, disabled, onDragStart }) => (
  <button
    type="button"
    draggable={!disabled}
    disabled={disabled}
    onDragStart={event => {
      event.stopPropagation()
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('application/x-yow-outline-item', JSON.stringify(item))
      onDragStart(item)
    }}
    onDragEnd={() => onDragStart(null)}
    className="outline-drag-handle"
    title={disabled ? undefined : `Drag to reorder ${label}`}
    aria-label={`Drag to reorder ${label}`}
  >
    {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
  </button>
)

const DropZone = ({ active, onDrop, label, level = 0 }) => (
  <div
    aria-hidden={!active}
    aria-label={label}
    onDragOver={event => {
      if (!active) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    }}
    onDrop={event => {
      if (!active) return
      event.preventDefault()
      event.stopPropagation()
      onDrop()
    }}
    className={`outline-drop-zone ${active ? 'is-active' : ''}`}
    style={{ '--drop-indent': `${level * 22}px` }}
  />
)

const MoveButtons = ({ label, isFirst, isLast, disabled, onMove }) => (
  <div className="flex flex-col items-center gap-0.5 pt-0.5 flex-shrink-0">
    <button type="button" className="p-0.5 text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-20" disabled={disabled || isFirst} title={`Move ${label} up`} aria-label={`Move ${label} up`} onClick={() => onMove('up')}>▲</button>
    <button type="button" className="p-0.5 text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-20" disabled={disabled || isLast} title={`Move ${label} down`} aria-label={`Move ${label} down`} onClick={() => onMove('down')}>▼</button>
  </div>
)

const ParentSelect = ({ value, options, label, disabled, onChange }) => (
  <ParentMoveSelect
    value={value}
    options={options}
    label={label}
    disabled={disabled}
    onChange={onChange}
    className="max-w-40 rounded border border-[var(--border)] bg-[var(--bg-main)] px-1.5 py-1 text-xs text-[var(--text-muted)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
  />
)

const WordCountBadge = ({ words }) => <span className="outline-word-count">{Number(words || 0).toLocaleString()} words</span>

const StoryEventBadge = ({ value, indicators }) => {
  if (!value) return null
  const indicator = indicators.find(item => item.id === value)
  const color = indicator?.color || '#94a3b8'
  return <span className="rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ borderColor: color, color, backgroundColor: `${color}1f` }}>{indicator?.label || outlineText(value)}</span>
}

const Synopsis = ({ item }) => {
  const value = outlineSynopsis(item).trim()
  return value ? <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-muted)]">{value}</p> : null
}

const EditButton = ({ label, readOnly, onClick }) => <button type="button" className="btn btn-secondary px-2 py-1 text-xs" onClick={onClick}>{readOnly ? 'View' : 'Edit'} {label}</button>

function SceneRow({ scene, sceneIndex, chapterOptions, isFirst, isLast, store, labels, indicators, disabled, onEdit, onDragStart, onActionError }) {
  const title = outlineText(scene.title).trim()
  const moveParent = chapterId => {
    if (!chapterId || chapterId === scene.chapterId) return
    const destination = chapterOptions.find(option => option.id === chapterId)
    if (!store.moveScene(scene.id, chapterId, destination?.childCount ?? 0)) onActionError(`This ${labels.level3.toLowerCase()} could not be moved.`)
  }
  return (
    <div className="group outline-scene-row">
      <DragHandle item={{ type: 'scene', id: scene.id }} label={labels.level3.toLowerCase()} disabled={disabled} onDragStart={onDragStart} />
      <MoveButtons label={labels.level3.toLowerCase()} isFirst={isFirst} isLast={isLast} disabled={disabled} onMove={direction => {
        if (!store.reorderScene(scene.id, direction)) onActionError(`This ${labels.level3.toLowerCase()} could not be reordered.`)
      }} />
      <div className="min-w-0 flex-1">
        <div className="outline-row-header">
          <div className="outline-row-title">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{labels.level3} {sceneIndex + 1}</span>
            <strong className="text-sm font-medium text-[var(--text-main)]">{title && title.toLocaleLowerCase() !== labels.level3.toLocaleLowerCase() ? title : 'Untitled'}</strong>
          </div>
          <div className="outline-row-meta">
            <StoryEventBadge value={outlineText(scene.storyEvent)} indicators={indicators} />
            <ParentSelect value={outlineText(scene.chapterId)} options={chapterOptions} label={`Move ${labels.level3.toLowerCase()} to ${labels.level2.toLowerCase()}`} disabled={disabled || !chapterOptions.length} onChange={moveParent} />
            <WordCountBadge words={outlineWordCount(scene.content)} />
            <EditButton label={labels.level3.toLowerCase()} readOnly={disabled} onClick={() => onEdit('scene', scene)} />
          </div>
        </div>
        <Synopsis item={scene} />
      </div>
    </div>
  )
}

function ChapterCard({ entry, chapterNumber, actOptions, chapterOptions, isFirst, isLast, store, labels, indicators, disabled, dragItem, onEdit, onDragStart, onDropScene, onActionError, unplaced = false }) {
  const [open, setOpen] = useState(true)
  const { chapter, scenes, words } = entry
  const title = formatOutlineChapterTitle(chapter, labels.level2, chapterNumber)
  const moveParent = actId => {
    if (!actId || actId === chapter.actId) return
    const destination = actOptions.find(option => option.id === actId)
    if (!store.moveChapter(chapter.id, actId, destination?.childCount ?? 0)) onActionError(`This ${labels.level2.toLowerCase()} could not be moved.`)
  }
  const sessionCount = [...Object.values(chapter.sessionPlan && typeof chapter.sessionPlan === 'object' ? chapter.sessionPlan : {}), ...Object.values(chapter.sessionRecap && typeof chapter.sessionRecap === 'object' ? chapter.sessionRecap : {})]
    .filter(value => outlineText(value).trim()).length
  return (
    <div className={`outline-chapter-card${unplaced ? ' border-dashed' : ''}`}>
      <div className="group flex items-start gap-2 py-2">
        <DragHandle item={{ type: 'chapter', id: chapter.id }} label={labels.level2.toLowerCase()} disabled={disabled || unplaced} onDragStart={onDragStart} />
        <MoveButtons label={labels.level2.toLowerCase()} isFirst={isFirst} isLast={isLast} disabled={disabled || unplaced} onMove={direction => {
          if (!store.reorderChapter(chapter.id, direction)) onActionError(`This ${labels.level2.toLowerCase()} could not be reordered.`)
        }} />
        <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`} className="mt-1 flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--accent)]"><ChevronIcon open={open} /></button>
        <div className="min-w-0 flex-1">
          <div className="outline-row-header">
            <div className="outline-row-title">
              <strong className="text-sm text-[var(--text-main)]">{title}</strong>
              <span className="text-[10px] text-[var(--text-muted)] opacity-60">{scenes.length} {labels.level3.toLowerCase()}{scenes.length === 1 ? '' : 's'}{sessionCount ? ` · ${sessionCount} prep/recap fields` : ''}</span>
            </div>
            <div className="outline-row-meta">
              <StoryEventBadge value={outlineText(chapter.storyEvent)} indicators={indicators} />
              <ParentSelect value={outlineText(chapter.actId)} options={actOptions} label={`Move ${labels.level2.toLowerCase()} to ${labels.level1.toLowerCase()}`} disabled={disabled || !actOptions.length} onChange={moveParent} />
              <WordCountBadge words={words} />
              <EditButton label={labels.level2.toLowerCase()} readOnly={disabled} onClick={() => onEdit('chapter', chapter)} />
            </div>
          </div>
          <Synopsis item={chapter} />
        </div>
      </div>
      {open && <div className="space-y-1 pb-2">
        {!unplaced && <DropZone active={dragItem?.type === 'scene'} label={`Drop ${labels.level3.toLowerCase()} at start of ${title}`} level={2} onDrop={() => onDropScene(chapter.id, 0)} />}
        {scenes.map((scene, index) => <div key={scene.id}>
          <SceneRow scene={scene} sceneIndex={index} chapterOptions={chapterOptions} isFirst={index === 0} isLast={index === scenes.length - 1} store={store} labels={labels} indicators={indicators} disabled={disabled} onEdit={onEdit} onDragStart={onDragStart} onActionError={onActionError} />
          {!unplaced && <DropZone active={dragItem?.type === 'scene'} label={`Drop ${labels.level3.toLowerCase()} after ${outlineText(scene.title) || labels.level3}`} level={2} onDrop={() => onDropScene(chapter.id, index + 1)} />}
        </div>)}
        {!disabled && <button type="button" onClick={() => {
          if (!store.addScene(chapter.id, labels.level3)) onActionError(`A new ${labels.level3.toLowerCase()} could not be added.`)
        }} className="outline-add-inline ml-8">+ {labels.level3}</button>}
      </div>}
    </div>
  )
}

function ActCard({ entry, index, actOptions, chapterOptions, chapterNumbers, store, labels, indicators, disabled, dragItem, onEdit, onDragStart, onDropChapter, onDropScene, onActionError }) {
  const [open, setOpen] = useState(true)
  const { act, chapters, sceneCount, words } = entry
  const title = outlineText(act.title).trim() || `${labels.level1} ${index + 1}`
  return (
    <div className="outline-act-card">
      <div className="group outline-act-header">
        <DragHandle item={{ type: 'act', id: act.id }} label={labels.level1.toLowerCase()} disabled={disabled} onDragStart={onDragStart} />
        <MoveButtons label={labels.level1.toLowerCase()} isFirst={index === 0} isLast={index === actOptions.length - 1} disabled={disabled} onMove={direction => {
          if (!store.reorderAct(act.id, direction)) onActionError(`This ${labels.level1.toLowerCase()} could not be reordered.`)
        }} />
        <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`} className="mt-1 flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--accent)]"><ChevronIcon open={open} /></button>
        <div className="min-w-0 flex-1">
          <div className="outline-row-header">
            <div className="outline-row-title">
              <strong className="outline-act-title">{title}</strong>
              <span className="text-[10px] text-[var(--text-muted)] opacity-60">{chapters.length} {labels.level2.toLowerCase()}{chapters.length === 1 ? '' : 's'} · {sceneCount} {labels.level3.toLowerCase()}{sceneCount === 1 ? '' : 's'}</span>
            </div>
            <div className="outline-row-meta">
              <StoryEventBadge value={outlineText(act.storyEvent)} indicators={indicators} />
              <WordCountBadge words={words} />
              <EditButton label={labels.level1.toLowerCase()} readOnly={disabled} onClick={() => onEdit('act', act)} />
            </div>
          </div>
          <Synopsis item={act} />
        </div>
      </div>
      {open && <div className="space-y-2 p-3">
        <DropZone active={dragItem?.type === 'chapter'} label={`Drop ${labels.level2.toLowerCase()} at start of ${title}`} level={1} onDrop={() => onDropChapter(act.id, 0)} />
        {chapters.map((chapterEntry, chapterIndex) => <div key={chapterEntry.chapter.id}>
          <ChapterCard entry={chapterEntry} chapterNumber={chapterNumbers.get(chapterEntry.chapter.id)} actOptions={actOptions} chapterOptions={chapterOptions} isFirst={chapterIndex === 0} isLast={chapterIndex === chapters.length - 1} store={store} labels={labels} indicators={indicators} disabled={disabled} dragItem={dragItem} onEdit={onEdit} onDragStart={onDragStart} onDropScene={onDropScene} onActionError={onActionError} />
          <DropZone active={dragItem?.type === 'chapter'} label={`Drop ${labels.level2.toLowerCase()} after ${outlineText(chapterEntry.chapter.title) || labels.level2}`} level={1} onDrop={() => onDropChapter(act.id, chapterIndex + 1)} />
        </div>)}
        {!disabled && <button type="button" onClick={() => {
          if (!store.addChapter(act.id, labels.level2)) onActionError(`A new ${labels.level2.toLowerCase()} could not be added.`)
        }} className="outline-add-inline ml-10">+ {labels.level2}</button>}
      </div>}
    </div>
  )
}

export default function StoryOutline({ store }) {
  return <OutlineProject key={store.activeNovel?.id || 'no-project'} store={store} />
}

function OutlineProject({ store }) {
  const { acts = [], chapters = [], scenes = [], activeNovel } = store
  const [dragItem, setDragItem] = useState(null)
  const [editing, setEditing] = useState(null)
  const [actionError, setActionError] = useState('')
  const labels = getProjectType(activeNovel?.type).structure
  const indicators = getStoryEventIndicators(activeNovel?.type)
  const model = useMemo(() => buildOutlineModel({ acts, chapters, scenes }), [acts, chapters, scenes])
  const disabled = Boolean(store.readOnly)

  useEffect(() => {
    const clear = event => {
      if (event.type !== 'keydown' || event.key === 'Escape') setDragItem(null)
    }
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    window.addEventListener('blur', clear)
    window.addEventListener('keydown', clear)
    return () => {
      window.removeEventListener('dragend', clear)
      window.removeEventListener('drop', clear)
      window.removeEventListener('blur', clear)
      window.removeEventListener('keydown', clear)
    }
  }, [])

  const chapterNumbers = useMemo(() => {
    const map = new Map()
    let number = 1
    model.acts.forEach(entry => entry.chapters.forEach(({ chapter }) => map.set(chapter.id, number++)))
    model.unplacedChapters.forEach(({ chapter }) => map.set(chapter.id, number++))
    return map
  }, [model])
  const actOptions = useMemo(() => model.acts.map((entry, index) => ({
    id: entry.act.id,
    label: outlineText(entry.act.title).trim() || `${labels.level1} ${index + 1}`,
    childCount: entry.chapters.length,
  })), [model.acts, labels.level1])
  const chapterOptions = useMemo(() => [
    ...model.acts.flatMap(entry => entry.chapters),
    ...model.unplacedChapters,
  ].map(entry => ({
    id: entry.chapter.id,
    label: formatOutlineChapterTitle(entry.chapter, labels.level2, chapterNumbers.get(entry.chapter.id)),
    childCount: entry.scenes.length,
  })), [model.acts, model.unplacedChapters, labels.level2, chapterNumbers])

  const fail = message => { setActionError(message); setDragItem(null) }
  const dropAct = index => {
    if (dragItem?.type !== 'act') return
    if (!store.moveAct(dragItem.id, index)) fail(`This ${labels.level1.toLowerCase()} could not be moved.`)
    else setDragItem(null)
  }
  const dropChapter = (actId, index) => {
    if (dragItem?.type !== 'chapter') return
    if (!store.moveChapter(dragItem.id, actId, index)) fail(`This ${labels.level2.toLowerCase()} could not be moved.`)
    else setDragItem(null)
  }
  const dropScene = (chapterId, index) => {
    if (dragItem?.type !== 'scene') return
    if (!store.moveScene(dragItem.id, chapterId, index)) fail(`This ${labels.level3.toLowerCase()} could not be moved.`)
    else setDragItem(null)
  }
  const addAct = () => {
    if (!store.addAct(`${labels.level1} ${model.totals.acts + 1}`)) fail(`A new ${labels.level1.toLowerCase()} could not be added.`)
  }
  const hasRecovery = model.unplacedChapters.length || model.unplacedScenes.length

  return <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-main)] text-[var(--text-main)]">
    <div className="studio-topbar outline-topbar" data-tour="outline-header">
      <div>
        <p className="eyebrow">Structure</p>
        <h1 className="font-serif text-2xl font-bold text-[var(--text-main)]">Story Outline</h1>
        <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-[var(--text-muted)]">
          <span>{model.totals.acts} {labels.level1.toLowerCase()}{model.totals.acts === 1 ? '' : 's'}</span>
          <span>{model.totals.chapters} {labels.level2.toLowerCase()}{model.totals.chapters === 1 ? '' : 's'}</span>
          <span>{model.totals.scenes} {labels.level3.toLowerCase()}{model.totals.scenes === 1 ? '' : 's'}</span>
          {model.totals.words > 0 && <span className="font-mono font-bold text-[var(--accent)]">{model.totals.words.toLocaleString()} words</span>}
        </div>
      </div>
      {!disabled && <button type="button" data-tour="outline-add" onClick={addAct} className="btn btn-primary">+ {labels.level1}</button>}
    </div>

    <div className="outline-workspace">
      {actionError && <div role="alert" className="mx-auto mb-3 flex max-w-3xl items-center justify-between gap-3 rounded border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm"><span>{actionError}</span><button type="button" aria-label="Dismiss error" onClick={() => setActionError('')}>×</button></div>}
      {!model.totals.acts && !hasRecovery ? <div className="empty-state mx-auto mt-12 max-w-lg">
        <p className="text-sm text-[var(--text-muted)]">No {labels.level1.toLowerCase()}s yet.</p>
        <p className="max-w-xs text-xs text-[var(--text-muted)] opacity-60">Add your first {labels.level1.toLowerCase()} to start building the outline. Structure created here is reflected instantly in the writing view.</p>
        {!disabled && <button type="button" onClick={addAct} className="btn btn-primary mt-4">+ Add First {labels.level1}</button>}
      </div> : <div className="outline-grid">
        <aside className="outline-map-panel">
          <div><p className="eyebrow">Map</p><h2>Outline Flow</h2></div>
          <div className="outline-map-list">{model.acts.map((entry, index) => <div key={entry.act.id} className="outline-map-item"><span className="outline-map-index">{index + 1}</span><div><strong>{outlineText(entry.act.title).trim() || `${labels.level1} ${index + 1}`}</strong><small>{entry.chapters.length} {labels.level2.toLowerCase()}{entry.chapters.length === 1 ? '' : 's'} · {entry.sceneCount} {labels.level3.toLowerCase()}{entry.sceneCount === 1 ? '' : 's'} · {entry.words.toLocaleString()} words</small></div></div>)}</div>
          <div className="outline-drop-help">Drag the dot handle to reorder. Arrow buttons and parent selectors provide the same moves without dragging.</div>
          {!disabled && <button type="button" onClick={addAct} className="btn btn-primary w-full justify-center">+ {labels.level1}</button>}
        </aside>
        <main className="outline-tree-panel">
          <DropZone active={dragItem?.type === 'act'} label={`Drop ${labels.level1.toLowerCase()} at start of outline`} onDrop={() => dropAct(0)} />
          {model.acts.map((entry, index) => <div key={entry.act.id}>
            <ActCard entry={entry} index={index} actOptions={actOptions} chapterOptions={chapterOptions} chapterNumbers={chapterNumbers} store={store} labels={labels} indicators={indicators} disabled={disabled} dragItem={dragItem} onEdit={(type, item) => setEditing({ type, item })} onDragStart={setDragItem} onDropChapter={dropChapter} onDropScene={dropScene} onActionError={fail} />
            <DropZone active={dragItem?.type === 'act'} label={`Drop ${labels.level1.toLowerCase()} after ${outlineText(entry.act.title) || labels.level1}`} onDrop={() => dropAct(index + 1)} />
          </div>)}

          {hasRecovery && <section className="mt-5 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3" aria-labelledby="outline-unplaced-title">
            <h2 id="outline-unplaced-title" className="font-semibold text-amber-300">Unplaced outline items</h2>
            <p className="mb-3 text-xs text-[var(--text-muted)]">These imported or legacy records point to a parent that is unavailable. They remain editable and can be moved into the outline.</p>
            {model.unplacedChapters.map((entry, index) => <ChapterCard key={entry.chapter.id} entry={entry} chapterNumber={chapterNumbers.get(entry.chapter.id)} actOptions={actOptions} chapterOptions={chapterOptions} isFirst={index === 0} isLast={index === model.unplacedChapters.length - 1} store={store} labels={labels} indicators={indicators} disabled={disabled} dragItem={dragItem} onEdit={(type, item) => setEditing({ type, item })} onDragStart={setDragItem} onDropScene={dropScene} onActionError={fail} unplaced />)}
            {model.unplacedScenes.map((scene, index) => <SceneRow key={scene.id} scene={scene} sceneIndex={index} chapterOptions={chapterOptions} isFirst={index === 0} isLast={index === model.unplacedScenes.length - 1} store={store} labels={labels} indicators={indicators} disabled={disabled} onEdit={(type, item) => setEditing({ type, item })} onDragStart={setDragItem} onActionError={fail} />)}
          </section>}
        </main>
      </div>}
    </div>

    {editing && <OutlineItemEditor type={editing.type} item={editing.item} store={store} labels={labels} indicators={indicators} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
  </div>
}
