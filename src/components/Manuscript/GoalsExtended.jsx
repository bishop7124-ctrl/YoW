import { useEffect, useMemo, useRef, useState } from 'react'
import { useFeatureFlag } from '../../utils/useFeatureFlag'
import { buildGoalProgress, sprintWords, formatClock, isDateKey } from '../../utils/goalProgress'
import { localDateKey } from '../../utils/writingStreak'

// Weekly and monthly goals, a deadline with a pace projection, and a writing-sprint timer (roadmap A5). Lives
// in the Inspector's Progress tab. Hidden unless the `goals_extended` flag is on for the signed-in user.
// Everything is computed on the device from the same daily-words data the rest of the app uses.

const SPRINT_PRESETS = [10, 15, 25, 45]
const nowMs = () => Date.now() // module-level so the purity lint sees it is only called from events/timers

function GoalRow({ label, progress, onSetGoal, unit = 'words' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const commit = () => {
    const value = parseInt(draft.replace(/,/g, ''), 10)
    onSetGoal(Number.isFinite(value) && value > 0 ? value : 0)
    setEditing(false)
  }
  return (
    <div className="ms-goal-row">
      <div className="ms-goal-row-top">
        <b>{label}</b>
        {editing ? (
          <input
            autoFocus
            type="number"
            min="0"
            className="ms-insp-goal-input"
            aria-label={`${label} goal in ${unit}`}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={event => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') setEditing(false) }}
          />
        ) : (
          <button type="button" className="ms-goal-edit" onClick={() => { setDraft(progress.goal > 0 ? String(progress.goal) : ''); setEditing(true) }}>
            {progress.goal > 0 ? 'Edit' : 'Set goal'}
          </button>
        )}
      </div>
      {progress.goal > 0 ? (
        <>
          <div className="ms-insp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct} aria-label={`${label} progress`}>
            <div style={{ width: `${progress.pct}%` }} />
          </div>
          <p className="ms-goal-note">
            {progress.words.toLocaleString()} of {progress.goal.toLocaleString()} words
            {progress.met ? ' — goal met.' : ` — about ${progress.perDayToFinish.toLocaleString()} a day for ${progress.daysLeft} more ${progress.daysLeft === 1 ? 'day' : 'days'}.`}
          </p>
        </>
      ) : (
        <p className="ms-goal-note">No {label.toLowerCase()} goal set.</p>
      )}
    </div>
  )
}

function Sprint({ totalWords }) {
  const [sprint, setSprint] = useState(null) // { endsAt, startedAt, startWords, minutes }
  const [now, setNow] = useState(0)
  const [result, setResult] = useState(null)
  const [announce, setAnnounce] = useState('')
  const [custom, setCustom] = useState('')
  const wordsRef = useRef(totalWords)
  useEffect(() => { wordsRef.current = totalWords }, [totalWords])

  useEffect(() => {
    if (!sprint) return undefined
    const tick = () => {
      const time = nowMs()
      setNow(time)
      if (time >= sprint.endsAt) {
        const words = sprintWords(sprint.startWords, wordsRef.current)
        setResult({ words, minutes: sprint.minutes })
        setAnnounce(`Sprint finished: ${words.toLocaleString()} words in ${sprint.minutes} minutes.`)
        setSprint(null)
      }
    }
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [sprint])

  const start = minutes => {
    const m = Math.round(Number(minutes))
    if (!Number.isFinite(m) || m < 1 || m > 240) return
    const time = nowMs()
    setResult(null)
    setNow(time)
    setSprint({ startedAt: time, endsAt: time + m * 60_000, startWords: wordsRef.current, minutes: m })
    setAnnounce(`Sprint started: ${m} minutes.`)
  }
  const stop = () => {
    if (!sprint) return
    const words = sprintWords(sprint.startWords, wordsRef.current)
    const minutes = Math.max(1, Math.round((nowMs() - sprint.startedAt) / 60_000))
    setResult({ words, minutes, early: true })
    setAnnounce(`Sprint stopped: ${words.toLocaleString()} words.`)
    setSprint(null)
  }

  return (
    <div className="ms-goal-row ms-sprint">
      <div className="ms-goal-row-top"><b>Writing sprint</b></div>
      {sprint ? (
        <>
          <div className="ms-sprint-clock" aria-hidden="true">{formatClock(sprint.endsAt - now)}</div>
          <p className="ms-goal-note">{sprintWords(sprint.startWords, totalWords).toLocaleString()} words this sprint</p>
          <button type="button" className="ms-goal-edit" onClick={stop}>Stop sprint</button>
        </>
      ) : (
        <>
          <div className="ms-insp-row" role="group" aria-label="Start a sprint">
            {SPRINT_PRESETS.map(minutes => (
              <button key={minutes} type="button" className="ms-opt" onClick={() => start(minutes)}>{minutes} min</button>
            ))}
          </div>
          <form className="ms-sprint-custom" onSubmit={event => { event.preventDefault(); start(custom) }}>
            <label>
              <span>Custom minutes</span>
              <input type="number" min="1" max="240" inputMode="numeric" value={custom} onChange={event => setCustom(event.target.value)} />
            </label>
            <button type="submit" className="ms-goal-edit" disabled={!custom}>Start</button>
          </form>
          {result && (
            <p className="ms-goal-note">
              Last sprint: <b>{result.words.toLocaleString()} words</b> in {result.minutes} {result.minutes === 1 ? 'minute' : 'minutes'}{result.early ? ' (stopped early)' : ''}.
            </p>
          )}
        </>
      )}
      <span className="ms-visually-hidden" role="status" aria-live="polite">{announce}</span>
    </div>
  )
}

export default function GoalsExtended({ goals = {}, onUpdateGoals, dailyWords = {}, totalWords = 0 }) {
  const enabled = useFeatureFlag('goals_extended')
  const today = localDateKey()
  const progress = useMemo(
    () => buildGoalProgress({ dailyWords, goals, totalWords, today }),
    [dailyWords, goals, totalWords, today],
  )
  const [deadlineError, setDeadlineError] = useState('')
  if (!enabled) return null

  const setGoal = (field, value) => onUpdateGoals({ ...goals, [field]: value })
  const setDeadline = value => {
    if (value && !isDateKey(value)) { setDeadlineError('Choose a date.'); return }
    setDeadlineError('')
    onUpdateGoals({ ...goals, deadline: value || null })
  }
  const deadline = progress.deadline

  return (
    <div className="ms-insp-group ms-goals-ext" data-testid="goals-extended">
      <div className="ms-insp-label">Goals <em className="ms-links-beta">Beta</em></div>
      <GoalRow label="This week" progress={progress.week} onSetGoal={value => setGoal('weekly', value)} />
      <GoalRow label="This month" progress={progress.month} onSetGoal={value => setGoal('monthly', value)} />

      <div className="ms-goal-row">
        <div className="ms-goal-row-top"><b>Deadline</b></div>
        <div className="ms-sprint-custom">
          <label>
            <span>Finish by</span>
            <input type="date" value={isDateKey(goals.deadline) ? goals.deadline : ''} onChange={event => setDeadline(event.target.value)} />
          </label>
          {isDateKey(goals.deadline) && <button type="button" className="ms-goal-edit" onClick={() => setDeadline('')}>Clear</button>}
        </div>
        {deadlineError && <p className="ms-links-error" role="alert">{deadlineError}</p>}
        {deadline ? (
          <p className={`ms-goal-note ms-goal-${deadline.status}`} role="status">
            {deadline.daysLeft >= 0 ? `${deadline.daysLeft} ${deadline.daysLeft === 1 ? 'day' : 'days'} left. ` : ''}{deadline.message}
          </p>
        ) : (
          <p className="ms-goal-note">Pick a date to see how your pace compares with your manuscript word target.</p>
        )}
      </div>

      <Sprint totalWords={totalWords} />
    </div>
  )
}
