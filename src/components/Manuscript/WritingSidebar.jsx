import { useState, useMemo, useCallback } from 'react'
import StructureSidebar from './StructureSidebar'

// ─── Word / date helpers ──────────────────────────────────────────────────────

function countWords(content) {
  if (!content?.trim()) return 0
  return content.trim().split(/\s+/).filter(Boolean).length
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function subtractDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Net words added per date for a scene (wordHistory is a cumulative daily log)
function sceneNetByDate(scene) {
  const history = scene.wordHistory ?? []
  if (!history.length) return {}
  const byDate = {}
  history.forEach(h => {
    if (!byDate[h.date] || h.timestamp > byDate[h.date].timestamp) {
      byDate[h.date] = h
    }
  })
  const sorted = Object.keys(byDate).sort()
  const net = {}
  sorted.forEach((date, i) => {
    const cur = byDate[date].words
    const prev = i > 0 ? byDate[sorted[i - 1]].words : 0
    net[date] = Math.max(0, cur - prev)
  })
  return net
}

function totalWordsOnDate(scenes, date) {
  return scenes.reduce((sum, s) => sum + (sceneNetByDate(s)[date] ?? 0), 0)
}

function computeStreak(scenes) {
  const today = todayKey()
  let streak = 0
  let date = today
  for (let i = 0; i < 365; i++) {
    if (totalWordsOnDate(scenes, date) > 0) {
      streak++
      date = subtractDays(date, 1)
    } else {
      break
    }
  }
  return streak
}

function lastNDays(scenes, n) {
  const today = todayKey()
  return Array.from({ length: n }, (_, i) => {
    const date = subtractDays(today, n - 1 - i)
    return { date, words: totalWordsOnDate(scenes, date) }
  })
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const StructureIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1.5" width="13" height="3" rx="1" />
    <rect x="2.5" y="6.5" width="10" height="2.5" rx="1" />
    <rect x="4.5" y="11" width="6" height="2.5" rx="1" />
  </svg>
)

const GoalsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <circle cx="7.5" cy="7.5" r="6" />
    <circle cx="7.5" cy="7.5" r="3" />
    <circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const ProgressIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1.5,12.5 4.5,8 7.5,10 11,4.5 13.5,6.5" />
    <path d="M11 2.5h2.5V5" />
  </svg>
)

const NotesIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 13V3a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v7l-3 3H3a1 1 0 0 1-1-1z" />
    <path d="M10 2v5h3" />
    <path d="M4.5 6.5h6M4.5 9h4" />
  </svg>
)

const AIIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2M3.05 3.05l1.42 1.42M10.53 10.53l1.42 1.42M10.53 4.47 9.11 5.89M4.47 10.53 3.05 11.95" />
    <circle cx="7.5" cy="7.5" r="2.2" />
  </svg>
)

const FormatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
  </svg>
)

const TABS = [
  { id: 'structure', label: 'Structure', Icon: StructureIcon },
  { id: 'goals',     label: 'Goals',     Icon: GoalsIcon },
  { id: 'progress',  label: 'Progress',  Icon: ProgressIcon },
  { id: 'notes',     label: 'Notes',     Icon: NotesIcon },
  { id: 'ai',        label: 'AI',        Icon: AIIcon },
  { id: 'format',    label: 'Format',    Icon: FormatIcon },
]

// ─── Goal row ─────────────────────────────────────────────────────────────────

function GoalRow({ label, sublabel, current, target, onSetTarget, compact }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0
  const reached = target > 0 && current >= target

  const commit = useCallback(() => {
    const val = parseInt(draft.replace(/,/g, ''), 10)
    if (!isNaN(val) && val >= 0) onSetTarget(val)
    else if (draft.trim() === '' || val === 0) onSetTarget(0)
    setEditing(false)
  }, [draft, onSetTarget])

  const startEdit = useCallback(() => {
    setDraft(target > 0 ? String(target) : '')
    setEditing(true)
  }, [target])

  if (compact) {
    return (
      <div className="ms-goal-compact">
        <div className="ms-goal-compact-top">
          <span className="ms-goal-compact-label">{label}</span>
          <span className="ms-goal-compact-nums">
            <span style={{ color: reached ? '#4ade80' : 'var(--text-main)' }}>
              {current.toLocaleString()}
            </span>
            {' / '}
            {editing ? (
              <input
                className="ms-goal-inline-input"
                type="number"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
                autoFocus
              />
            ) : (
              <button className="ms-goal-target-btn" onClick={startEdit}>
                {target > 0 ? target.toLocaleString() : 'Set'}
              </button>
            )}
          </span>
        </div>
        {target > 0 && (
          <div className="ms-goal-bar-track">
            <div className="ms-goal-bar-fill" style={{ width: `${pct}%`, background: reached ? '#4ade80' : 'var(--accent)' }} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="ms-goal-row">
      <div className="ms-goal-row-top">
        <div>
          <div className="ms-goal-label">{label}</div>
          {sublabel && <div className="ms-goal-sublabel">{sublabel}</div>}
        </div>
        <div className="ms-goal-nums">
          <span className="ms-goal-current" style={{ color: reached ? '#4ade80' : 'var(--text-main)' }}>
            {current.toLocaleString()}
          </span>
          <span className="ms-goal-sep"> / </span>
          {editing ? (
            <input
              className="ms-goal-inline-input"
              type="number"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
              autoFocus
            />
          ) : (
            <button className="ms-goal-target-btn" onClick={startEdit} title="Click to set target">
              {target > 0 ? target.toLocaleString() : 'Set goal'}
            </button>
          )}
        </div>
      </div>

      {target > 0 && (
        <>
          <div className="ms-goal-bar-track">
            <div
              className="ms-goal-bar-fill"
              style={{ width: `${pct}%`, background: reached ? '#4ade80' : 'var(--accent)' }}
            />
          </div>
          <div className="ms-goal-footer">
            <span>{Math.round(pct)}%</span>
            {reached
              ? <span style={{ color: '#4ade80' }}>Reached</span>
              : <span>{(target - current).toLocaleString()} to go</span>
            }
          </div>
        </>
      )}
    </div>
  )
}

// ─── Goals panel ──────────────────────────────────────────────────────────────

function GoalsPanel({ writingGoals, onUpdateGoals, scenes, acts, chapters }) {
  const [actsExpanded, setActsExpanded] = useState(false)
  const [chaptersExpanded, setChaptersExpanded] = useState(false)

  const totalWords = useMemo(() => scenes.reduce((acc, s) => acc + countWords(s.content), 0), [scenes])
  const today = todayKey()
  const wordsToday = useMemo(() => totalWordsOnDate(scenes, today), [scenes, today])

  const goals = useMemo(() => writingGoals ?? {}, [writingGoals])
  const manuscriptGoal = goals.manuscript ?? 0
  const dailyGoal = goals.daily ?? 0
  const actGoals = useMemo(() => goals.acts ?? {}, [goals.acts])
  const chapterGoals = useMemo(() => goals.chapters ?? {}, [goals.chapters])

  const setManuscriptGoal = useCallback(n => onUpdateGoals({ ...goals, manuscript: n }), [goals, onUpdateGoals])
  const setDailyGoal = useCallback(n => onUpdateGoals({ ...goals, daily: n }), [goals, onUpdateGoals])

  const setActGoal = useCallback((actId, n) => {
    onUpdateGoals({ ...goals, acts: { ...actGoals, [actId]: n } })
  }, [goals, actGoals, onUpdateGoals])

  const setChapterGoal = useCallback((chapId, n) => {
    onUpdateGoals({ ...goals, chapters: { ...chapterGoals, [chapId]: n } })
  }, [goals, chapterGoals, onUpdateGoals])

  const actWordCounts = useMemo(() => {
    return acts.reduce((map, act) => {
      const actChapIds = new Set(chapters.filter(c => c.actId === act.id).map(c => c.id))
      map[act.id] = scenes.filter(s => actChapIds.has(s.chapterId)).reduce((acc, s) => acc + countWords(s.content), 0)
      return map
    }, {})
  }, [acts, chapters, scenes])

  const chapWordCounts = useMemo(() => {
    return chapters.reduce((map, chap) => {
      map[chap.id] = scenes.filter(s => s.chapterId === chap.id).reduce((acc, s) => acc + countWords(s.content), 0)
      return map
    }, {})
  }, [chapters, scenes])

  return (
    <div className="ms-panel-scroll">
      <div className="ms-panel-section-header">Word count goals</div>

      <GoalRow
        label="Manuscript"
        sublabel="Total target"
        current={totalWords}
        target={manuscriptGoal}
        onSetTarget={setManuscriptGoal}
      />

      <GoalRow
        label="Daily"
        sublabel="Words written today"
        current={wordsToday}
        target={dailyGoal}
        onSetTarget={setDailyGoal}
      />

      {/* Per-act targets */}
      {acts.length > 0 && (
        <div className="ms-panel-accordion">
          <button
            className="ms-panel-accordion-toggle"
            onClick={() => setActsExpanded(v => !v)}
          >
            <span>Act targets</span>
            <span className="ms-accordion-chevron">{actsExpanded ? '▴' : '▾'}</span>
          </button>

          {actsExpanded && (
            <div className="ms-panel-accordion-body">
              {acts.map(act => (
                <GoalRow
                  key={act.id}
                  label={act.title}
                  current={actWordCounts[act.id] ?? 0}
                  target={actGoals[act.id] ?? 0}
                  onSetTarget={n => setActGoal(act.id, n)}
                  compact
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Per-chapter targets */}
      {chapters.length > 0 && (
        <div className="ms-panel-accordion">
          <button
            className="ms-panel-accordion-toggle"
            onClick={() => setChaptersExpanded(v => !v)}
          >
            <span>Chapter targets</span>
            <span className="ms-accordion-chevron">{chaptersExpanded ? '▴' : '▾'}</span>
          </button>

          {chaptersExpanded && (
            <div className="ms-panel-accordion-body">
              {chapters.map((chap, i) => (
                <GoalRow
                  key={chap.id}
                  label={chap.title || `Chapter ${i + 1}`}
                  current={chapWordCounts[chap.id] ?? 0}
                  target={chapterGoals[chap.id] ?? 0}
                  onSetTarget={n => setChapterGoal(chap.id, n)}
                  compact
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Progress panel ───────────────────────────────────────────────────────────

function ProgressPanel({ scenes, chapters, writingGoals }) {
  const today = todayKey()

  const streak = useMemo(() => computeStreak(scenes), [scenes])
  const wordsToday = useMemo(() => totalWordsOnDate(scenes, today), [scenes, today])
  const last7 = useMemo(() => lastNDays(scenes, 7), [scenes])

  const totalWords = useMemo(() => scenes.reduce((acc, s) => acc + countWords(s.content), 0), [scenes])
  const dailyGoal = writingGoals?.daily ?? 0
  const manuscriptGoal = writingGoals?.manuscript ?? 0

  const avgWordsPerDay = useMemo(() => {
    const days = lastNDays(scenes, 14).filter(d => d.words > 0)
    if (!days.length) return 0
    return Math.round(days.reduce((acc, d) => acc + d.words, 0) / days.length)
  }, [scenes])

  const avgChapterWords = useMemo(() => {
    const chapCounts = chapters.map(chap =>
      scenes.filter(s => s.chapterId === chap.id).reduce((acc, s) => acc + countWords(s.content), 0)
    ).filter(n => n > 0)
    if (!chapCounts.length) return 0
    return Math.round(chapCounts.reduce((a, b) => a + b, 0) / chapCounts.length)
  }, [chapters, scenes])

  const daysToFinish = useMemo(() => {
    if (!manuscriptGoal || !avgWordsPerDay) return null
    const remaining = Math.max(0, manuscriptGoal - totalWords)
    return remaining === 0 ? 0 : Math.ceil(remaining / avgWordsPerDay)
  }, [manuscriptGoal, totalWords, avgWordsPerDay])

  const peakDay = useMemo(() => {
    const maxWords = Math.max(...last7.map(d => d.words), 1)
    return maxWords
  }, [last7])

  const dailyPct = dailyGoal > 0 ? Math.min(100, (wordsToday / dailyGoal) * 100) : 0

  return (
    <div className="ms-panel-scroll">
      {/* Today */}
      <div className="ms-panel-section-header">Today</div>
      <div className="ms-progress-today">
        <div className="ms-progress-big-num">{wordsToday.toLocaleString()}</div>
        <div className="ms-progress-big-label">words written</div>
        {dailyGoal > 0 && (
          <>
            <div className="ms-goal-bar-track" style={{ margin: '10px 0 4px' }}>
              <div
                className="ms-goal-bar-fill"
                style={{ width: `${dailyPct}%`, background: dailyPct >= 100 ? '#4ade80' : 'var(--accent)' }}
              />
            </div>
            <div className="ms-progress-daily-label">
              {dailyPct >= 100
                ? <span style={{ color: '#4ade80' }}>Daily goal complete</span>
                : <span>{(dailyGoal - wordsToday).toLocaleString()} left to reach {dailyGoal.toLocaleString()}</span>
              }
            </div>
          </>
        )}
      </div>

      {/* Stats row */}
      <div className="ms-progress-stats-row">
        <div className="ms-progress-stat-block">
          <div className="ms-progress-stat-value">{streak}</div>
          <div className="ms-progress-stat-label">{streak === 1 ? 'day' : 'days'} streak</div>
        </div>
        <div className="ms-progress-stat-block">
          <div className="ms-progress-stat-value">
            {avgWordsPerDay > 0 ? avgWordsPerDay.toLocaleString() : '—'}
          </div>
          <div className="ms-progress-stat-label">avg/day</div>
        </div>
        {avgChapterWords > 0 && (
          <div className="ms-progress-stat-block">
            <div className="ms-progress-stat-value">{avgChapterWords.toLocaleString()}</div>
            <div className="ms-progress-stat-label">avg/chapter</div>
          </div>
        )}
      </div>

      {/* 7-day sparkline */}
      <div className="ms-panel-section-header" style={{ marginTop: 16 }}>Last 7 days</div>
      <div className="ms-sparkline-wrap">
        <div className="ms-sparkline-bars">
          {last7.map((day, i) => {
            const barPct = peakDay > 0 ? (day.words / peakDay) * 100 : 0
            const isToday = day.date === today
            return (
              <div key={i} className="ms-sparkline-col" title={`${formatDate(day.date)}: ${day.words.toLocaleString()} words`}>
                <div className="ms-sparkline-bar-wrap">
                  <div
                    className="ms-sparkline-bar"
                    style={{
                      height: `${Math.max(barPct, day.words > 0 ? 4 : 0)}%`,
                      background: isToday
                        ? (day.words > 0 ? 'var(--accent)' : 'var(--border)')
                        : (day.words > 0 ? 'var(--accent-fade)' : 'var(--border)'),
                      border: isToday ? '1px solid var(--accent)' : 'none',
                    }}
                  />
                </div>
                <div className={`ms-sparkline-date ${isToday ? 'is-today' : ''}`}>
                  {isToday ? 'today' : new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pacing estimate */}
      {daysToFinish !== null && (
        <>
          <div className="ms-panel-section-header" style={{ marginTop: 16 }}>Pacing</div>
          <div className="ms-progress-pacing">
            {daysToFinish === 0 ? (
              <span style={{ color: '#4ade80' }}>Manuscript goal reached</span>
            ) : (
              <>
                <span>At this pace, </span>
                <span className="ms-pacing-days">{daysToFinish.toLocaleString()} {daysToFinish === 1 ? 'day' : 'days'}</span>
                <span> to finish</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function WritingSidebar({
  // Tab control
  activePanelId,
  onSetPanel,

  // Structure tab
  acts, chapters, scenes,
  addAct, addChapter, addScene,
  updateAct, updateChapter, updateScene,
  deleteAct, deleteChapter, deleteScene,
  moveAct, moveChapter, moveScene,
  activeSceneId, onSelectScene, onSelectChapter,
  labels, totalWordCount,

  // Goals tab
  writingGoals,
  onUpdateGoals,

  // Pre-rendered slots
  formatSlot,
  notesSlot,
  aiSlot,
}) {
  const isOpen = activePanelId !== null

  const toggleTab = useCallback((id) => {
    onSetPanel(activePanelId === id ? null : id)
  }, [activePanelId, onSetPanel])

  return (
    <aside className={`ms-writing-sidebar${isOpen ? ' is-open' : ''} font-sans`}>

      {/* Tab strip — always visible */}
      <div className="ms-writing-tab-strip">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`ms-writing-tab-btn${activePanelId === id ? ' is-active' : ''}`}
            onClick={() => toggleTab(id)}
            title={label}
            aria-label={label}
            aria-pressed={activePanelId === id}
          >
            <Icon />
          </button>
        ))}
      </div>

      {/* Panel content */}
      {isOpen && (
        <div className="ms-writing-panel">
          {/* Panel header */}
          <div className="ms-panel-topbar">
            <span className="ms-panel-title">
              {TABS.find(t => t.id === activePanelId)?.label}
            </span>
            <button
              className="ms-panel-close-btn"
              onClick={() => onSetPanel(null)}
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>

          {/* Structure */}
          {activePanelId === 'structure' && (
            <div className="ms-writing-structure-wrap">
              <StructureSidebar
                acts={acts}
                chapters={chapters}
                scenes={scenes}
                addAct={addAct}
                addChapter={addChapter}
                addScene={addScene}
                updateAct={updateAct}
                updateChapter={updateChapter}
                updateScene={updateScene}
                deleteAct={deleteAct}
                deleteChapter={deleteChapter}
                deleteScene={deleteScene}
                moveAct={moveAct}
                moveChapter={moveChapter}
                moveScene={moveScene}
                activeSceneId={activeSceneId}
                onSelectScene={onSelectScene}
                onSelectChapter={onSelectChapter}
                labels={labels}
                totalWordCount={totalWordCount}
              />
            </div>
          )}

          {/* Goals */}
          {activePanelId === 'goals' && (
            <GoalsPanel
              writingGoals={writingGoals}
              onUpdateGoals={onUpdateGoals}
              scenes={scenes}
              acts={acts}
              chapters={chapters}
            />
          )}

          {/* Progress */}
          {activePanelId === 'progress' && (
            <ProgressPanel
              scenes={scenes}
              chapters={chapters}
              writingGoals={writingGoals}
            />
          )}

          {/* Notes */}
          {activePanelId === 'notes' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {notesSlot}
            </div>
          )}

          {/* AI */}
          {activePanelId === 'ai' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {aiSlot}
            </div>
          )}

          {/* Format */}
          {activePanelId === 'format' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {formatSlot}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
