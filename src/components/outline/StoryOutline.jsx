import { useState, useRef, useEffect, useMemo } from 'react'
import { getProjectType, getStoryEventIndicators } from '../../constants/projectTypes'

const ChevronIcon = ({ open }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12" height="12"
    viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

const MoveBtn = ({ onClick, title, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="opacity-0 group-hover:opacity-100 disabled:opacity-0 p-0.5 text-[var(--text-muted)] hover:text-[var(--accent)] disabled:cursor-not-allowed transition-all"
  >
    {children}
  </button>
)

const ParentSelect = ({ value, options, label, onChange }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    title={label}
    aria-label={label}
    className="max-w-36 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] opacity-0 outline-none transition-all hover:border-[var(--border)] hover:bg-[var(--bg-main)] hover:text-[var(--accent)] focus:border-[var(--accent)] focus:bg-[var(--bg-main)] focus:opacity-100 group-hover:opacity-100"
  >
    {options.map(option => (
      <option key={option.id} value={option.id}>{option.label}</option>
    ))}
  </select>
)

const DeleteBtn = ({ onClick, title = 'Delete' }) => (
  <button
    onClick={onClick}
    className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--text-muted)] hover:text-red-400 transition-all"
    title={title}
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  </button>
)

const StoryEventSelect = ({ value, indicators, onChange }) => {
  const selected = indicators.find(indicator => indicator.id === value)
  const hasUnknownValue = value && !selected
  const color = selected?.color || '#94a3b8'

  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
      title={selected ? `Story event: ${selected.label}` : 'Add story event indicator'}
      style={value ? {
        borderColor: color,
        color,
        backgroundColor: `${color}1f`,
      } : undefined}
      className={`h-6 max-w-40 rounded border px-2 text-[10px] font-bold uppercase tracking-wider outline-none transition-colors ${
        value
          ? ''
          : 'border-transparent bg-transparent text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:border-[var(--border)] hover:bg-[var(--bg-main)] focus:opacity-100 focus:border-[var(--accent)]'
      }`}
    >
      <option value="">Story event</option>
      {hasUnknownValue && <option value={value}>{value}</option>}
      {indicators.map(indicator => (
        <option key={indicator.id} value={indicator.id}>{indicator.label}</option>
      ))}
    </select>
  )
}

const AutoTextarea = ({ value, onChange, placeholder, className }) => {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={`w-full bg-transparent resize-none outline-none text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] placeholder-opacity-50 leading-relaxed overflow-hidden ${className || ''}`}
    />
  )
}

const CAMPAIGN_TYPES = new Set(['dnd_campaign', 'tabletop_rpg'])

const SESSION_PLAN_FIELDS = [
  { key: 'hooks', label: 'Hooks', placeholder: 'Opening hooks, rumors, clues, or pressure that pulls the party in.' },
  { key: 'encounters', label: 'Encounter flow', placeholder: 'Expected encounter order, alternate paths, and pacing notes.' },
  { key: 'npcs', label: 'NPCs', placeholder: 'NPCs in play, what they want, what they know, and how they react.' },
  { key: 'rewards', label: 'Rewards', placeholder: 'Treasure, boons, clues, levels, favors, or information the party can earn.' },
  { key: 'consequences', label: 'Consequences', placeholder: 'What changes if the party succeeds, fails, delays, or surprises you.' },
  { key: 'notes', label: 'Session notes', placeholder: 'Prep reminders, table logistics, rules calls, safety notes, or improvisation anchors.' },
]

const SESSION_RECAP_FIELDS = [
  { key: 'summary', label: 'Recap', placeholder: 'What actually happened at the table.' },
  { key: 'playerChoices', label: 'Player choices', placeholder: 'Major decisions, alliances, routes, and unresolved questions.' },
  { key: 'fallout', label: 'Fallout', placeholder: 'World, faction, NPC, location, and campaign-state consequences.' },
  { key: 'nextHooks', label: 'Next hooks', placeholder: 'Threads to bring forward into the next session.' },
]

const CampaignSessionFields = ({ chapter, scenes, updateChapter, labels }) => {
  const [open, setOpen] = useState(false)
  const plan = chapter.sessionPlan || {}
  const recap = chapter.sessionRecap || {}

  const updatePlan = (key, value) => updateChapter(chapter.id, {
    sessionPlan: { ...plan, [key]: value },
  })
  const updateRecap = (key, value) => updateChapter(chapter.id, {
    sessionRecap: { ...recap, [key]: value },
  })

  const filledPlan = SESSION_PLAN_FIELDS.filter(field => plan[field.key]?.trim()).length
  const filledRecap = SESSION_RECAP_FIELDS.filter(field => recap[field.key]?.trim()).length
  const detailCount = filledPlan + filledRecap

  return (
    <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg-main)]">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)]"
      >
        <span>{labels.level2} prep & recap</span>
        <span className="flex items-center gap-2 text-[10px] font-semibold normal-case tracking-normal opacity-70">
          {scenes.length} {labels.level3.toLowerCase()}{scenes.length !== 1 ? 's' : ''}
          {detailCount > 0 && <span>{detailCount} fields</span>}
          <ChevronIcon open={open} />
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-[var(--border)] px-3 py-3">
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Plan</p>
            <div className="grid gap-3 md:grid-cols-2">
              {SESSION_PLAN_FIELDS.map(field => (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{field.label}</span>
                  <AutoTextarea
                    value={plan[field.key]}
                    onChange={value => updatePlan(field.key, value)}
                    placeholder={field.placeholder}
                    className="min-h-12 rounded border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-xs opacity-90"
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Recap</p>
            <div className="grid gap-3 md:grid-cols-2">
              {SESSION_RECAP_FIELDS.map(field => (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{field.label}</span>
                  <AutoTextarea
                    value={recap[field.key]}
                    onChange={value => updateRecap(field.key, value)}
                    placeholder={field.placeholder}
                    className="min-h-12 rounded border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-xs opacity-90"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const InlineTitle = ({ value, onSave, className }) => {
  const [editing, setEditing] = useState(false)
  const [temp, setTemp] = useState(value)
  const saving = useRef(false)

  const commit = () => {
    if (saving.current) return
    saving.current = true
    onSave(temp.trim() || value)
    setEditing(false)
    saving.current = false
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={temp}
        onChange={e => setTemp(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setTemp(value); setEditing(false) } }}
        onBlur={commit}
        className={`bg-transparent outline-none border-b border-[var(--accent)] text-[var(--text-main)] ${className}`}
      />
    )
  }

  return (
    <span
      onDoubleClick={() => { setTemp(value); setEditing(true) }}
      title="Double-click to rename"
      className={`cursor-default select-none ${className}`}
    >
      {value}
    </span>
  )
}

const SceneRow = ({ scene, sceneIdx, chapterOptions, isFirst, isLast, updateScene, reorderScene, moveScene, deleteScene, labels, indicators }) => {
  const wordCount = useMemo(() => {
    return scene.content?.trim().split(/\s+/).filter(Boolean).length || 0
  }, [scene.content])

  const moveToChapter = (chapterId) => {
    if (!chapterId || chapterId === scene.chapterId) return
    const destCount = chapterOptions.find(option => option.id === chapterId)?.sceneCount ?? 0
    moveScene(scene.id, chapterId, destCount)
  }

  return (
    <div className="group flex gap-2 px-3 py-2 rounded hover:bg-[var(--bg-hover)] transition-colors">
      <div className="flex flex-col items-center gap-0.5 pt-1 flex-shrink-0">
        <MoveBtn onClick={() => reorderScene(scene.id, 'up')} disabled={isFirst} title="Move up">▲</MoveBtn>
        <MoveBtn onClick={() => reorderScene(scene.id, 'down')} disabled={isLast} title="Move down">▼</MoveBtn>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex-shrink-0">
            {labels.level3} {sceneIdx + 1}
          </span>
          <InlineTitle
            value={scene.title === 'Scene' ? '' : scene.title}
            onSave={t => updateScene(scene.id, { title: t || labels.level3 })}
            className="text-sm text-[var(--text-muted)] italic flex-1"
          />
          <StoryEventSelect
            value={scene.storyEvent}
            indicators={indicators}
            onChange={storyEvent => updateScene(scene.id, { storyEvent })}
          />
          <ParentSelect
            value={scene.chapterId}
            options={chapterOptions}
            label={`Move ${labels.level3.toLowerCase()} to ${labels.level2.toLowerCase()}`}
            onChange={moveToChapter}
          />
          {wordCount > 0 && (
            <span className="text-[10px] font-mono text-[var(--accent)] opacity-60 flex-shrink-0">{wordCount.toLocaleString()}w</span>
          )}
        </div>
        <AutoTextarea
          value={scene.synopsis}
          onChange={v => updateScene(scene.id, { synopsis: v })}
          placeholder={`${labels.level3} synopsis — what happens, who's involved, what changes…`}
          className="text-xs opacity-80 pl-0"
        />
      </div>

      <DeleteBtn
        title={`Delete ${labels.level3.toLowerCase()}`}
        onClick={() => {
          if (!confirm(`Delete this ${labels.level3.toLowerCase()} from both the outline and manuscript?`)) return
          deleteScene(scene.id)
        }}
      />
    </div>
  )
}

const ChapterCard = ({ chapter, chapterNum, actOptions, chapterOptions, scenes, isFirst, isLast, updateChapter, reorderChapter, moveChapter, deleteChapter, addScene, updateScene, reorderScene, moveScene, deleteScene, labels, indicators, isCampaign }) => {
  const [open, setOpen] = useState(true)
  const chapterScenes = useMemo(() => scenes.filter(s => s.chapterId === chapter.id).sort((a, b) => a.order - b.order), [scenes, chapter.id])
  const wordCount = useMemo(() => chapterScenes.reduce((n, s) => n + (s.content?.trim().split(/\s+/).filter(Boolean).length || 0), 0), [chapterScenes])

  const l2lower = labels.level2.toLowerCase()
  const title = !chapter.title || chapter.title.toLowerCase().startsWith(l2lower)
    ? `${labels.level2} ${chapterNum}`
    : `${labels.level2} ${chapterNum}: ${chapter.title}`

  const moveToAct = (actId) => {
    if (!actId || actId === chapter.actId) return
    const destCount = actOptions.find(option => option.id === actId)?.chapterCount ?? 0
    moveChapter(chapter.id, actId, destCount)
  }

  return (
    <div className="ml-6 border-l border-[var(--border)] pl-4">
      <div className="group flex gap-2 items-start py-2">
        <div className="flex flex-col items-center gap-0.5 pt-0.5 flex-shrink-0">
          <MoveBtn onClick={() => reorderChapter(chapter.id, 'up')} disabled={isFirst} title="Move chapter up">▲</MoveBtn>
          <MoveBtn onClick={() => reorderChapter(chapter.id, 'down')} disabled={isLast} title="Move chapter down">▼</MoveBtn>
        </div>

        <button onClick={() => setOpen(v => !v)} className="mt-1 text-[var(--text-muted)] hover:text-[var(--accent)] flex-shrink-0 transition-colors">
          <ChevronIcon open={open} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <InlineTitle
              value={title}
              onSave={t => updateChapter(chapter.id, { title: t })}
              className="text-sm font-semibold text-[var(--text-main)]"
            />
            <span className="text-[10px] text-[var(--text-muted)] opacity-60">{chapterScenes.length} {labels.level3.toLowerCase()}{chapterScenes.length !== 1 ? 's' : ''}</span>
            <StoryEventSelect
              value={chapter.storyEvent}
              indicators={indicators}
              onChange={storyEvent => updateChapter(chapter.id, { storyEvent })}
            />
            <ParentSelect
              value={chapter.actId}
              options={actOptions}
              label={`Move ${labels.level2.toLowerCase()} to ${labels.level1.toLowerCase()}`}
              onChange={moveToAct}
            />
            {wordCount > 0 && <span className="text-[10px] font-mono text-[var(--accent)] opacity-60">{wordCount.toLocaleString()}w</span>}
          </div>
          <AutoTextarea
            value={chapter.synopsis}
            onChange={v => updateChapter(chapter.id, { synopsis: v })}
            placeholder={`${labels.level2} synopsis…`}
            className="text-xs opacity-70 mt-1"
          />
          {isCampaign && (
            <CampaignSessionFields
              chapter={chapter}
              scenes={chapterScenes}
              updateChapter={updateChapter}
              labels={labels}
            />
          )}
        </div>

        <DeleteBtn
          title={`Delete ${labels.level2.toLowerCase()}`}
          onClick={() => {
            const count = chapterScenes.length
            const detail = count ? ` This will also delete ${count} ${labels.level3.toLowerCase()}${count === 1 ? '' : 's'}.` : ''
            if (!confirm(`Delete this ${labels.level2.toLowerCase()} from both the outline and manuscript?${detail}`)) return
            deleteChapter(chapter.id)
          }}
        />
      </div>

      {open && (
        <div className="space-y-1 pb-2">
          {chapterScenes.map((scene, idx) => (
            <SceneRow
              key={scene.id}
              scene={scene}
              sceneIdx={idx}
              chapterOptions={chapterOptions}
              isFirst={idx === 0}
              isLast={idx === chapterScenes.length - 1}
              updateScene={updateScene}
              reorderScene={reorderScene}
              moveScene={moveScene}
              deleteScene={deleteScene}
              labels={labels}
              indicators={indicators}
            />
          ))}
          <button
            onClick={() => addScene(chapter.id, labels.level3)}
            className="ml-3 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] uppercase tracking-wider transition-colors py-1"
          >
            + {labels.level3}
          </button>
        </div>
      )}
    </div>
  )
}

const ActCard = ({ act, actOptions, chapterOptions, chapterGlobalNums, chapters, scenes, isFirst, isLast, updateAct, reorderAct, deleteAct, addChapter, updateChapter, reorderChapter, moveChapter, deleteChapter, addScene, updateScene, reorderScene, moveScene, deleteScene, labels, indicators, isCampaign }) => {
  const [open, setOpen] = useState(true)
  const actChapters = useMemo(() => chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order), [chapters, act.id])
  const wordCount = useMemo(() => {
    const sceneIds = actChapters.flatMap(c => scenes.filter(s => s.chapterId === c.id))
    return sceneIds.reduce((n, s) => n + (s.content?.trim().split(/\s+/).filter(Boolean).length || 0), 0)
  }, [actChapters, scenes])

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-nav)] overflow-hidden">
      <div className="group flex gap-2 items-start px-4 py-3" style={{ backgroundColor: 'var(--bg-hover)' }}>
        <div className="flex flex-col items-center gap-0.5 pt-0.5 flex-shrink-0">
          <MoveBtn onClick={() => reorderAct(act.id, 'up')} disabled={isFirst} title="Move act up">▲</MoveBtn>
          <MoveBtn onClick={() => reorderAct(act.id, 'down')} disabled={isLast} title="Move act down">▼</MoveBtn>
        </div>

        <button onClick={() => setOpen(v => !v)} className="mt-1 text-[var(--text-muted)] hover:text-[var(--accent)] flex-shrink-0 transition-colors">
          <ChevronIcon open={open} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <InlineTitle
              value={act.title}
              onSave={t => updateAct(act.id, { title: t })}
              className="text-xs font-black text-[var(--text-main)] uppercase tracking-widest"
            />
            <span className="text-[10px] text-[var(--text-muted)] opacity-60">{actChapters.length} {labels.level2.toLowerCase().slice(0,3)}</span>
            <StoryEventSelect
              value={act.storyEvent}
              indicators={indicators}
              onChange={storyEvent => updateAct(act.id, { storyEvent })}
            />
            {wordCount > 0 && <span className="text-[10px] font-mono text-[var(--accent)] opacity-60">{wordCount.toLocaleString()}w</span>}
          </div>
          <AutoTextarea
            value={act.synopsis}
            onChange={v => updateAct(act.id, { synopsis: v })}
            placeholder={`${labels.level1} synopsis — the arc, the stakes, how it ends…`}
            className="text-xs opacity-70 mt-1"
          />
        </div>

        <DeleteBtn
          title={`Delete ${labels.level1.toLowerCase()}`}
          onClick={() => {
            const sceneCount = actChapters.reduce((n, chap) => n + scenes.filter(s => s.chapterId === chap.id).length, 0)
            const detail = actChapters.length || sceneCount
              ? ` This will also delete ${actChapters.length} ${labels.level2.toLowerCase()}${actChapters.length === 1 ? '' : 's'} and ${sceneCount} ${labels.level3.toLowerCase()}${sceneCount === 1 ? '' : 's'}.`
              : ''
            if (!confirm(`Delete this ${labels.level1.toLowerCase()} from both the outline and manuscript?${detail}`)) return
            deleteAct(act.id)
          }}
        />
      </div>

      {open && (
        <div className="p-3 space-y-2">
          {actChapters.map((chap, idx) => (
            <ChapterCard
              key={chap.id}
              chapter={chap}
              chapterNum={chapterGlobalNums[chap.id]}
              actOptions={actOptions}
              chapterOptions={chapterOptions}
              scenes={scenes}
              isFirst={idx === 0}
              isLast={idx === actChapters.length - 1}
              updateChapter={updateChapter}
              reorderChapter={reorderChapter}
              moveChapter={moveChapter}
              deleteChapter={deleteChapter}
              addScene={addScene}
              updateScene={updateScene}
              reorderScene={reorderScene}
              moveScene={moveScene}
              deleteScene={deleteScene}
              labels={labels}
              indicators={indicators}
              isCampaign={isCampaign}
            />
          ))}
          <button
            onClick={() => addChapter(act.id, '')}
            className="ml-10 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] uppercase tracking-wider transition-colors py-1"
          >
            + {labels.level2}
          </button>
        </div>
      )}
    </div>
  )
}

export default function StoryOutline({ store }) {
  const {
    acts, addAct, updateAct, deleteAct, reorderAct,
    chapters, addChapter, updateChapter, deleteChapter, reorderChapter, moveChapter,
    scenes, addScene, updateScene, deleteScene, reorderScene, moveScene,
    activeNovel,
  } = store

  const labels = getProjectType(activeNovel?.type).structure
  const indicators = getStoryEventIndicators(activeNovel?.type)
  const isCampaign = CAMPAIGN_TYPES.has(activeNovel?.type)

  const totalWords = useMemo(() => scenes.reduce((n, s) => n + (s.content?.trim().split(/\s+/).filter(Boolean).length || 0), 0), [scenes])
  const totalScenes = scenes.length
  const totalChapters = chapters.length

  const chapterGlobalNums = useMemo(() => {
    const map = {}
    let count = 1
    acts.slice().sort((a, b) => a.order - b.order).forEach(act => {
      chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order).forEach(chap => { map[chap.id] = count++ })
    })
    return map
  }, [acts, chapters])

  const actOptions = useMemo(() => (
    acts
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((act, idx) => ({
        id: act.id,
        label: act.title || `${labels.level1} ${idx + 1}`,
        chapterCount: chapters.filter(chap => chap.actId === act.id).length,
      }))
  ), [acts, chapters, labels.level1])

  const chapterOptions = useMemo(() => (
    acts
      .slice()
      .sort((a, b) => a.order - b.order)
      .flatMap(act => chapters
        .filter(chap => chap.actId === act.id)
        .sort((a, b) => a.order - b.order)
        .map(chap => ({
          id: chap.id,
          label: chapterGlobalNums[chap.id]
            ? `${labels.level2} ${chapterGlobalNums[chap.id]}${chap.title && !chap.title.toLowerCase().startsWith(labels.level2.toLowerCase()) ? `: ${chap.title}` : ''}`
            : chap.title || labels.level2,
          sceneCount: scenes.filter(scene => scene.chapterId === chap.id).length,
        })))
  ), [acts, chapters, scenes, labels.level2, chapterGlobalNums])

  return (
    <div className="h-full flex flex-col bg-[var(--bg-main)] text-[var(--text-main)] overflow-hidden">
      {/* Header */}
      <div className="studio-topbar flex-shrink-0 px-8 py-5 flex items-center justify-between" data-tour="outline-header">
        <div>
          <p className="eyebrow">Structure</p>
          <h1 className="font-serif text-2xl font-bold text-[var(--text-main)]">Story Outline</h1>
          <div className="flex gap-4 mt-1 text-[11px] text-[var(--text-muted)]">
            <span>{acts.length} {labels.level1.toLowerCase()}{acts.length !== 1 ? 's' : ''}</span>
            <span>{totalChapters} {labels.level2.toLowerCase()}{totalChapters !== 1 ? 's' : ''}</span>
            <span>{totalScenes} {labels.level3.toLowerCase()}{totalScenes !== 1 ? 's' : ''}</span>
            {totalWords > 0 && <span className="text-[var(--accent)] font-mono font-bold">{totalWords.toLocaleString()} words</span>}
          </div>
        </div>
        <button
          data-tour="outline-add"
          onClick={() => addAct(`${labels.level1} ${acts.length + 1}`)}
          className="btn btn-primary"
        >
          + {labels.level1}
        </button>
      </div>

      {/* Outline tree */}
      <div className="flex-1 overflow-y-auto p-8">
        {acts.length === 0 ? (
          <div className="empty-state mx-auto mt-12 max-w-lg">
            <p className="text-[var(--text-muted)] text-sm">No {labels.level1.toLowerCase()}s yet.</p>
            <p className="text-[var(--text-muted)] text-xs opacity-60 max-w-xs">
              Add your first {labels.level1.toLowerCase()} to start building the outline. {labels.level1}s, {labels.level2.toLowerCase()}s, and {labels.level3.toLowerCase()}s created here are reflected instantly in the writing view, and vice versa.
            </p>
            <button
              onClick={() => addAct(`${labels.level1} 1`)}
              className="btn btn-primary mt-4"
            >
              + Add First {labels.level1}
            </button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {acts.slice().sort((a, b) => a.order - b.order).map((act, idx) => (
              <ActCard
                key={act.id}
                act={act}
                actOptions={actOptions}
                chapterOptions={chapterOptions}
                chapterGlobalNums={chapterGlobalNums}
                chapters={chapters}
                scenes={scenes}
                isFirst={idx === 0}
                isLast={idx === acts.length - 1}
                updateAct={updateAct}
                reorderAct={reorderAct}
                deleteAct={deleteAct}
                addChapter={addChapter}
                updateChapter={updateChapter}
                reorderChapter={reorderChapter}
                moveChapter={moveChapter}
                deleteChapter={deleteChapter}
                addScene={addScene}
                updateScene={updateScene}
                reorderScene={reorderScene}
                moveScene={moveScene}
                deleteScene={deleteScene}
                labels={labels}
                indicators={indicators}
                isCampaign={isCampaign}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
