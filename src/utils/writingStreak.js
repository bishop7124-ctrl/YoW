const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export function localDateKey(value = Date.now()) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function shiftDateKey(dateKey, offset) {
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + offset)
  return localDateKey(date)
}

const normalizeGoal = value => {
  const goal = Number(value)
  return Number.isFinite(goal) && goal > 0 ? Math.round(goal) : 0
}

const normalizeGoalHistory = history => (Array.isArray(history) ? history : [])
  .map(entry => ({ date: entry?.date, goal: normalizeGoal(entry?.goal) }))
  .filter(entry => DATE_KEY_RE.test(entry.date || ''))
  .sort((a, b) => a.date.localeCompare(b.date))

export function withDailyGoalHistory(goals = {}, nextGoal, today = localDateKey()) {
  const previousGoal = normalizeGoal(goals.daily)
  const daily = normalizeGoal(nextGoal)
  const existing = normalizeGoalHistory(goals.dailyHistory)
  if (previousGoal === daily) return { ...goals, daily }

  const dailyHistory = [...existing]
  // Existing projects predate goal-history tracking. Preserve the goal that
  // already governed their earlier writing rather than retroactively judging
  // every past day against the newly edited target.
  if (!dailyHistory.length && previousGoal > 0) {
    dailyHistory.push({ date: '1970-01-01', goal: previousGoal })
  }

  const todayIndex = dailyHistory.findIndex(entry => entry.date === today)
  const todayEntry = { date: today, goal: daily }
  if (todayIndex >= 0) dailyHistory[todayIndex] = todayEntry
  else dailyHistory.push(todayEntry)

  dailyHistory.sort((a, b) => a.date.localeCompare(b.date))
  return { ...goals, daily, dailyHistory: dailyHistory.slice(-365) }
}

export function buildWritingGoalStreak(
  dailyWords = {},
  dailyGoal = 0,
  goalHistory = [],
  today = localDateKey(),
  recentDayCount = 14,
) {
  const currentGoal = normalizeGoal(dailyGoal)
  const history = normalizeGoalHistory(goalHistory)
  if (history.length && history[history.length - 1].goal !== currentGoal) {
    const todayIndex = history.findIndex(entry => entry.date === today)
    if (todayIndex >= 0) history[todayIndex] = { date: today, goal: currentGoal }
    else history.push({ date: today, goal: currentGoal })
    history.sort((a, b) => a.date.localeCompare(b.date))
  }
  const wordsByDate = Object.fromEntries(
    Object.entries(dailyWords || {})
      .filter(([date]) => DATE_KEY_RE.test(date) && date <= today)
      .map(([date, words]) => [date, Math.max(0, Number(words) || 0)])
  )

  const goalForDate = date => {
    if (!history.length) return currentGoal
    let goal = 0
    for (const entry of history) {
      if (entry.date > date) break
      goal = entry.goal
    }
    return goal
  }
  const metGoalOnDate = date => {
    const goal = goalForDate(date)
    return goal > 0 && (wordsByDate[date] || 0) >= goal
  }

  const metDates = Object.keys(wordsByDate).filter(metGoalOnDate).sort()
  let bestStreak = 0
  let runningBest = 0
  let previousMetDate = null
  metDates.forEach(date => {
    runningBest = previousMetDate && shiftDateKey(previousMetDate, 1) === date
      ? runningBest + 1
      : 1
    bestStreak = Math.max(bestStreak, runningBest)
    previousMetDate = date
  })

  const todayGoal = goalForDate(today)
  const todayWords = wordsByDate[today] || 0
  const todayMet = todayGoal > 0 && todayWords >= todayGoal
  let cursor = todayMet ? today : shiftDateKey(today, -1)
  let currentStreak = 0
  for (let i = 0; i < 5000 && metGoalOnDate(cursor); i++) {
    currentStreak++
    cursor = shiftDateKey(cursor, -1)
  }

  const recentDays = Array.from({ length: Math.max(1, recentDayCount) }, (_, index) => {
    const date = shiftDateKey(today, index - (Math.max(1, recentDayCount) - 1))
    const goal = goalForDate(date)
    const words = wordsByDate[date] || 0
    return { date, words, goal, met: goal > 0 && words >= goal, isToday: date === today }
  })

  return {
    enabled: todayGoal > 0,
    goal: todayGoal,
    todayWords,
    todayMet,
    remaining: todayGoal > 0 ? Math.max(0, todayGoal - todayWords) : 0,
    currentStreak,
    bestStreak,
    totalGoalDays: metDates.length,
    recentDays,
  }
}
