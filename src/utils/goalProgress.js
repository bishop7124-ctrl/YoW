// Weekly / monthly goals, deadline and projection (roadmap A5). Pure, local, no network. Works from the same
// net-words-per-day map the rest of YOW uses (src/utils/dailyWords.js), so every screen agrees.

import { localDateKey, shiftDateKey } from './writingStreak'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000
const PACE_WINDOW_DAYS = 14

const positive = value => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}
export const isDateKey = value => typeof value === 'string' && DATE_KEY_RE.test(value)

// Whole days from `from` to `to` (date keys), at local noon so daylight-saving changes never skip a day.
export function daysBetween(from, to) {
  return Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / DAY_MS)
}

// Weeks run Monday to Sunday.
export function weekStartKey(dateKey) {
  const day = new Date(`${dateKey}T12:00:00`).getDay() // 0 = Sunday
  return shiftDateKey(dateKey, -((day + 6) % 7))
}
export const monthStartKey = dateKey => `${dateKey.slice(0, 8)}01`
function monthEndKey(dateKey) {
  const [year, month] = dateKey.split('-').map(Number)
  const last = new Date(year, month, 0).getDate()
  return `${dateKey.slice(0, 8)}${String(last).padStart(2, '0')}`
}

export function wordsInRange(dailyWords, from, to) {
  return Object.entries(dailyWords || {}).reduce((sum, [date, words]) => (
    isDateKey(date) && date >= from && date <= to ? sum + Math.max(0, Number(words) || 0) : sum
  ), 0)
}

function periodProgress(words, goalValue, daysLeft) {
  const goal = positive(goalValue)
  const remaining = Math.max(0, goal - words)
  return {
    words, goal, remaining, daysLeft,
    pct: goal > 0 ? Math.min(100, Math.round((words / goal) * 100)) : 0,
    met: goal > 0 && words >= goal,
    perDayToFinish: goal > 0 && remaining > 0 ? Math.ceil(remaining / Math.max(daysLeft, 1)) : 0,
  }
}

// Average net words per day over the last 14 days including today (days with no writing count as zero, so
// a long break lowers the projection instead of being ignored).
export function recentPace(dailyWords, today = localDateKey()) {
  const from = shiftDateKey(today, -(PACE_WINDOW_DAYS - 1))
  return wordsInRange(dailyWords, from, today) / PACE_WINDOW_DAYS
}

// How many of the last 14 days had any writing. Fewer than this and a projection is guesswork.
export function activeDaysInWindow(dailyWords, today = localDateKey()) {
  let n = 0
  for (let i = 0; i < PACE_WINDOW_DAYS; i++) {
    if ((Number(dailyWords?.[shiftDateKey(today, -i)]) || 0) > 0) n++
  }
  return n
}
const MIN_ACTIVE_DAYS_FOR_PROJECTION = 3

export function buildGoalProgress({ dailyWords = {}, goals = {}, totalWords = 0, today = localDateKey() } = {}) {
  const weekStart = weekStartKey(today)
  const weekEnd = shiftDateKey(weekStart, 6)
  const monthStart = monthStartKey(today)
  const monthEnd = monthEndKey(today)

  const week = periodProgress(wordsInRange(dailyWords, weekStart, today), goals.weekly, daysBetween(today, weekEnd) + 1)
  const month = periodProgress(wordsInRange(dailyWords, monthStart, today), goals.monthly, daysBetween(today, monthEnd) + 1)

  const target = positive(goals.manuscript)
  const deadlineDate = isDateKey(goals.deadline) ? goals.deadline : null
  const pace = recentPace(dailyWords, today)
  const remainingWords = Math.max(0, target - Math.max(0, Number(totalWords) || 0))

  let deadline = null
  if (deadlineDate) {
    const daysLeft = daysBetween(today, deadlineDate) // 0 = due today, negative = passed
    const base = { date: deadlineDate, daysLeft, targetWords: target, remainingWords, avgPerDay: Math.round(pace) }
    if (!target) {
      deadline = { ...base, status: 'no-target', message: 'Set a manuscript word target to see whether you are on track for this deadline.' }
    } else if (remainingWords === 0) {
      deadline = { ...base, status: 'done', message: 'You have reached your word target.' }
    } else if (daysLeft < 0) {
      deadline = { ...base, status: 'passed', message: `The deadline passed ${-daysLeft} ${-daysLeft === 1 ? 'day' : 'days'} ago with ${remainingWords.toLocaleString()} words to go.` }
    } else {
      const requiredPerDay = Math.ceil(remainingWords / (daysLeft + 1)) // today counts as a writing day
      // A pace of a few words a day would project decades away; past ten years we say so instead of showing a date.
      const daysNeeded = pace > 0 ? Math.ceil(remainingWords / pace) : null
      const projected = daysNeeded !== null && daysNeeded <= 3650 ? shiftDateKey(today, daysNeeded) : null
      const finishText = projected ? `around ${projected}` : 'in more than ten years'
      let status = 'no-pace'
      let message = `${remainingWords.toLocaleString()} words to go, about ${requiredPerDay.toLocaleString()} a day. Write a little to see a projection.`
      if (pace > 0 && activeDaysInWindow(dailyWords, today) < MIN_ACTIVE_DAYS_FOR_PROJECTION) {
        status = 'no-pace'
        message = `${remainingWords.toLocaleString()} words to go, about ${requiredPerDay.toLocaleString()} a day to finish by then. Once you have written on a few different days, this will show whether your pace gets you there.`
      } else if (pace > 0) {
        status = pace >= requiredPerDay ? 'on-track' : 'behind'
        message = status === 'on-track'
          ? `On track: at your 14-day average of ${Math.round(pace).toLocaleString()} words a day (days off count as zero) you would finish ${finishText}.`
          : `Behind: you need about ${requiredPerDay.toLocaleString()} words a day, and over the last 14 days you averaged ${Math.round(pace).toLocaleString()} (days off count as zero). At that pace you would finish ${finishText}.`
      }
      deadline = { ...base, requiredPerDay, projectedFinish: projected, status, message }
    }
  }
  return { week, month, deadline, pace: Math.round(pace) }
}

// Words written during a timed sprint. `startWords` is the manuscript total when it began; deleting text
// during a sprint never shows a negative number.
export function sprintWords(startWords, nowWords) {
  return Math.max(0, (Number(nowWords) || 0) - (Number(startWords) || 0))
}

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
