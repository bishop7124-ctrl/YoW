import { useMemo, useState } from 'react'
import {
  SCENE_STATUSES,
  FONTS, LINE_SPACINGS, INDENT_SIZES, DEFAULT_FORMAT,
  todayKey, computeStreak, lastNDays, totalWordsOnDate, countWords,
} from './manuscriptUtils.js'
import { NotesPanel } from './ManuscriptToolbar.jsx'

const TABS = [
  { id: 'scene', label: 'Scene' },
  { id: 'notes', label: 'Notes' },
  { id: 'format', label: 'Format' },
  { id: 'progress', label: 'Progress' },
]

// ─── Scene tab ─────────────────────────────────────────────────────────────────

// Keyed by scene.id from the caller so switching scenes remounts this (and
// resets `draft`) instead of needing a ref-during-render comparison to detect
// the prop change.
function InlineTitleField({ scene, onUpdateScene }) {
  const [draft, setDraft] = useState(scene.title && scene.title !== 'Scene' ? scene.title : '')
  return (
    <label className="ms-insp-field">
      <span>Title</span>
      <input
        value={draft}
        placeholder="Untitled scene"
        onChange={e => setDraft(e.target.value)}
        onBlur={() => onUpdateScene(scene.id, { title: draft.trim() || 'Scene' })}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
    </label>
  )
}

// Names of known characters/locations that appear in this scene's prose —
// derived, not stored; same case-insensitive whole-word match ContentPreview
// uses to highlight entities inline, just collecting matches instead of
// positions.
function useSceneEntities(content, entityMap) {
  return useMemo(() => {
    if (!content) return []
    const names = Object.keys(entityMap || {})
    if (!names.length) return []
    const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi')
    const seen = new Map()
    let m
    while ((m = re.exec(content)) !== null) {
      const key = names.find(n => n.toLowerCase() === m[1].toLowerCase())
      if (key && !seen.has(entityMap[key].id)) seen.set(entityMap[key].id, entityMap[key])
    }
    return [...seen.values()]
  }, [content, entityMap])
}

function SceneTab({ scene, onUpdateScene, characterNames, locationNames, entityMap, onEntityClick }) {
  // Called unconditionally (rules-of-hooks) even when there's no active scene yet —
  // useSceneEntities itself is a no-op on empty content.
  const entities = useSceneEntities(scene?.content, entityMap)

  if (!scene) {
    return <div className="ms-insp-empty">Select a scene to see its details.</div>
  }
  const status = scene.status || 'draft'

  return (
    <div className="ms-insp-scroll">
      <div className="ms-insp-group">
        <InlineTitleField key={scene.id} scene={scene} onUpdateScene={onUpdateScene} />
        <div className="ms-insp-label">Status</div>
        <div className="ms-insp-row">
          {SCENE_STATUSES.map(s => (
            <button
              key={s.value}
              type="button"
              className={`ms-opt${status === s.value ? ' is-on' : ''}`}
              onClick={() => onUpdateScene(scene.id, { status: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ms-insp-group">
        <label className="ms-insp-field">
          <span>Point of view</span>
          <input
            value={scene.pov || ''}
            onChange={e => onUpdateScene(scene.id, { pov: e.target.value })}
            placeholder="Whose eyes?"
            list={`ms-insp-pov-${scene.id}`}
          />
          {characterNames?.length > 0 && (
            <datalist id={`ms-insp-pov-${scene.id}`}>
              {characterNames.map(n => <option key={n} value={n} />)}
            </datalist>
          )}
        </label>
        <label className="ms-insp-field">
          <span>Location</span>
          <input
            value={scene.locationTag || ''}
            onChange={e => onUpdateScene(scene.id, { locationTag: e.target.value })}
            placeholder="Where?"
            list={`ms-insp-loc-${scene.id}`}
          />
          {locationNames?.length > 0 && (
            <datalist id={`ms-insp-loc-${scene.id}`}>
              {locationNames.map(n => <option key={n} value={n} />)}
            </datalist>
          )}
        </label>
        <label className="ms-insp-field">
          <span>Summary</span>
          <textarea
            value={scene.summary || ''}
            onChange={e => onUpdateScene(scene.id, { summary: e.target.value })}
            placeholder="One line you'd tell a friend."
            rows={3}
          />
        </label>
      </div>

      {entities.length > 0 && (
        <div className="ms-insp-group">
          <div className="ms-insp-label">In this scene</div>
          <div className="ms-insp-row">
            {entities.map(entity => (
              <button key={entity.id} type="button" className="ms-chip" onClick={() => onEntityClick(entity)} title={entity.section}>
                {entity.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Format tab ────────────────────────────────────────────────────────────────
// Same settings/onChange contract the old ManuscriptToolbar.jsx FormatContent
// uses (and the same shared FONTS/LINE_SPACINGS/INDENT_SIZES/DEFAULT_FORMAT),
// rendered as the spec's `.ms-opt` pill rows instead of that component's
// slider. Deliberately a separate renderer rather than restyling the shared
// FormatContent export in place — WritingSidebar.jsx (still the live UI until
// this redesign's integration/step 9) renders that exact component today, and
// changing its markup out from under it would bleed a half-finished visual
// change into the current interface before the rest of the redesign lands.
function FormatTab({ settings, onChange }) {
  const set = (key, value) => onChange({ ...settings, [key]: value })

  return (
    <div className="ms-insp-scroll">
      <div className="ms-insp-group">
        <div className="ms-insp-label">Typeface</div>
        <div className="ms-insp-row">
          {FONTS.map(f => (
            <button key={f.label} type="button" className={`ms-opt${settings.fontFamily === f.value ? ' is-on' : ''}`} style={{ fontFamily: f.value }} onClick={() => set('fontFamily', f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ms-insp-group">
        <div className="ms-insp-label">Size</div>
        <div className="ms-insp-row">
          {[15, 17, 19, 21, 24].map(size => (
            <button key={size} type="button" className={`ms-opt${settings.fontSize === size ? ' is-on' : ''}`} onClick={() => set('fontSize', size)}>
              {size}
            </button>
          ))}
        </div>
        <div className="ms-insp-row" style={{ marginTop: 6 }}>
          {LINE_SPACINGS.map(s => (
            <button key={s.label} type="button" className={`ms-opt${settings.lineHeight === s.value ? ' is-on' : ''}`} onClick={() => set('lineHeight', s.value)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ms-insp-group">
        <div className="ms-insp-label">Alignment</div>
        <div className="ms-insp-row">
          {[{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Justify', value: 'justify' }].map(a => (
            <button key={a.value} type="button" className={`ms-opt${settings.textAlign === a.value ? ' is-on' : ''}`} onClick={() => set('textAlign', a.value)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ms-insp-group">
        <div className="ms-insp-label">Paragraphs</div>
        <div className="ms-insp-row">
          <button type="button" className={`ms-opt${settings.autoIndent ? ' is-on' : ''}`} onClick={() => set('autoIndent', true)}>Indent first line</button>
          <button type="button" className={`ms-opt${!settings.autoIndent ? ' is-on' : ''}`} onClick={() => set('autoIndent', false)}>Space between</button>
        </div>
        {settings.autoIndent && (
          <div className="ms-insp-row" style={{ marginTop: 6 }}>
            {INDENT_SIZES.map(n => (
              <button key={n} type="button" className={`ms-opt${settings.indentSize === n ? ' is-on' : ''}`} onClick={() => set('indentSize', n)}>{n} spaces</button>
            ))}
          </div>
        )}
      </div>

      <div className="ms-insp-group">
        <div className="ms-insp-label">While writing</div>
        <div className="ms-insp-row">
          <button type="button" className={`ms-opt${settings.showSceneMetadata !== false ? ' is-on' : ''}`} onClick={() => set('showSceneMetadata', settings.showSceneMetadata === false)}>
            Scene details
          </button>
        </div>
      </div>

      <button type="button" className="ms-insp-reset" onClick={() => onChange(DEFAULT_FORMAT)}>Reset to defaults</button>
    </div>
  )
}

// ─── Progress tab ──────────────────────────────────────────────────────────────

function ProgressTab({ scenes, chapters, writingGoals, onUpdateGoals }) {
  const today = todayKey()
  const streak = useMemo(() => computeStreak(scenes), [scenes])
  const wordsToday = useMemo(() => totalWordsOnDate(scenes, today), [scenes, today])
  const last7 = useMemo(() => lastNDays(scenes, 7), [scenes])
  const totalWords = useMemo(() => scenes.reduce((acc, s) => acc + countWords(s.content), 0), [scenes])
  const avgWordsPerDay = useMemo(() => {
    const days = lastNDays(scenes, 14).filter(d => d.words > 0)
    if (!days.length) return 0
    return Math.round(days.reduce((acc, d) => acc + d.words, 0) / days.length)
  }, [scenes])

  const goals = writingGoals ?? {}
  const dailyGoal = goals.daily ?? 0
  const manuscriptGoal = goals.manuscript ?? 0
  const dailyPct = dailyGoal > 0 ? Math.min(100, (wordsToday / dailyGoal) * 100) : 0
  const peakDay = Math.max(...last7.map(d => d.words), 1)

  const [editingGoal, setEditingGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const commitGoal = () => {
    const val = parseInt(goalDraft.replace(/,/g, ''), 10)
    onUpdateGoals({ ...goals, daily: Number.isFinite(val) && val >= 0 ? val : 0 })
    setEditingGoal(false)
  }

  return (
    <div className="ms-insp-scroll">
      <div className="ms-insp-goal">
        <div className="ms-insp-goal-top">
          <b>{wordsToday.toLocaleString()}</b>
          <small>of {dailyGoal > 0 ? dailyGoal.toLocaleString() : '—'} today</small>
          {editingGoal ? (
            <input
              autoFocus
              className="ms-insp-goal-input"
              type="number"
              value={goalDraft}
              onChange={e => setGoalDraft(e.target.value)}
              onBlur={commitGoal}
              onKeyDown={e => { if (e.key === 'Enter') commitGoal(); if (e.key === 'Escape') setEditingGoal(false) }}
            />
          ) : (
            <button type="button" onClick={() => { setGoalDraft(dailyGoal > 0 ? String(dailyGoal) : ''); setEditingGoal(true) }}>
              Edit goal
            </button>
          )}
        </div>
        <div className="ms-insp-bar"><div style={{ width: `${dailyPct}%` }} /></div>
        <div className="ms-insp-goal-meta">
          <span>{streak > 0 ? `${streak}-day streak` : 'No streak yet'}</span>
          <span>{avgWordsPerDay > 0 ? `${avgWordsPerDay.toLocaleString()} avg / day` : ''}</span>
        </div>
      </div>

      <div className="ms-insp-group">
        <div className="ms-insp-label">Last 7 days</div>
        <div className="ms-insp-spark">
          {last7.map((day, i) => {
            const isToday = day.date === today
            const pct = peakDay > 0 ? Math.max((day.words / peakDay) * 100, day.words > 0 ? 6 : 0) : 0
            return <div key={i} className={`ms-insp-spark-bar${isToday ? ' is-now' : ''}`} style={{ height: `${pct}%` }} title={`${day.words.toLocaleString()} words`} />
          })}
        </div>
        <div className="ms-insp-spark-x">
          {last7.map((day, i) => (
            <span key={i}>{day.date === today ? 'Today' : new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}</span>
          ))}
        </div>
      </div>

      <div className="ms-insp-group">
        <div className="ms-insp-label">Targets</div>
        <TargetRow
          label="Manuscript"
          current={totalWords}
          target={manuscriptGoal}
          onSetTarget={n => onUpdateGoals({ ...goals, manuscript: n })}
        />
        {chapters.slice(0, 2).map((chap, i) => {
          const chapWords = scenes.filter(s => s.chapterId === chap.id).reduce((acc, s) => acc + countWords(s.content), 0)
          const chapGoals = goals.chapters ?? {}
          return (
            <TargetRow
              key={chap.id}
              label={chap.title || `Chapter ${i + 1}`}
              current={chapWords}
              target={chapGoals[chap.id] ?? 0}
              onSetTarget={n => onUpdateGoals({ ...goals, chapters: { ...chapGoals, [chap.id]: n } })}
            />
          )
        })}
      </div>
    </div>
  )
}

function TargetRow({ label, current, target, onSetTarget }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const commit = () => {
    const val = parseInt(draft.replace(/,/g, ''), 10)
    onSetTarget(Number.isFinite(val) && val >= 0 ? val : 0)
    setEditing(false)
  }
  return (
    <div className="ms-insp-tgt">
      <b>{label}</b>
      {editing ? (
        <input
          autoFocus
          className="ms-insp-goal-input"
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        />
      ) : (
        <button type="button" className="ms-insp-tgt-n" onClick={() => { setDraft(target > 0 ? String(target) : ''); setEditing(true) }}>
          {current.toLocaleString()} / {target > 0 ? target.toLocaleString() : 'set'}
        </button>
      )}
    </div>
  )
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function ManuscriptInspector({
  activeTab, onSetTab, onClose,
  scene, onUpdateScene, characterNames, locationNames, entityMap, onEntityClick,
  highlightedNoteSeq,
  formatSettings, onFormatChange,
  scenes, chapters, writingGoals, onUpdateGoals,
}) {
  const noteCount = scene?.notes?.length || 0

  return (
    <aside className="ms-insp font-sans" aria-label="Scene inspector">
      <div className="ms-insp-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'is-on' : ''}
            onClick={() => onSetTab(tab.id)}
          >
            {tab.label}{tab.id === 'notes' && noteCount > 0 ? ` (${noteCount})` : ''}
          </button>
        ))}
        {onClose && (
          <button type="button" className="ms-insp-close" onClick={onClose} aria-label="Close inspector">✕</button>
        )}
      </div>

      <div className="ms-insp-body">
        {activeTab === 'scene' && (
          <SceneTab
            scene={scene}
            onUpdateScene={onUpdateScene}
            characterNames={characterNames}
            locationNames={locationNames}
            entityMap={entityMap}
            onEntityClick={onEntityClick}
          />
        )}
        {activeTab === 'notes' && (
          scene
            ? <NotesPanel scene={scene} onUpdateScene={onUpdateScene} highlightedSeq={highlightedNoteSeq} />
            : <div className="ms-insp-empty">Select a scene to see its notes.</div>
        )}
        {activeTab === 'format' && (
          <FormatTab settings={formatSettings} onChange={onFormatChange} />
        )}
        {activeTab === 'progress' && (
          <ProgressTab scenes={scenes} chapters={chapters} writingGoals={writingGoals} onUpdateGoals={onUpdateGoals} />
        )}
      </div>
    </aside>
  )
}
