// Single source of truth for "net words written per day".
//
// `scene.wordHistory` is a cumulative per-scene log ({ date, words, timestamp }).
// Daily words are NET words: the last logged total for a date minus the last
// logged total for the previous logged date, floored at 0. Deleting text never
// produces negative days, and it can lower a day's figure. This is deliberately
// a net count, not a gross typing count (roadmap decision D8, 2026-11-08).
//
// Previously the Overview dashboard and the manuscript Inspector each had their
// own copy and could disagree. Both now use this module.

const MAX_HISTORY_ENTRIES = 120

export const countSceneWords = value => {
  if (!value || typeof value !== 'string') return 0
  return value.trim().match(/\S+/g)?.length || 0
}

// Counting a whole scene on every call is the hot cost here (this runs on each
// save in the editor, and per-day helpers call it repeatedly). Cache by scene id
// + identical content so unchanged scenes are never recounted.
const COUNT_CACHE_LIMIT = 5000
const countCache = new Map()
const cachedSceneWords = scene => {
  const content = scene?.content
  if (!content || typeof content !== 'string') return 0
  const id = scene?.id
  if (id == null) return countSceneWords(content)
  const hit = countCache.get(id)
  if (hit && hit.content === content) return hit.count
  const count = countSceneWords(content)
  if (countCache.size >= COUNT_CACHE_LIMIT) countCache.clear()
  countCache.set(id, { content, count })
  return count
}

export const toDateKey = value => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const getSceneTimestamp = scene => {
  const raw = scene?.lastModified || scene?.updatedAt || scene?.createdAt || scene?.created
  const timestamp = typeof raw === 'number' ? raw : Date.parse(raw)
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

// If the scene's current text no longer matches its last history entry (e.g. a
// save landed without a history write), reflect the current count so "today"
// is never stale.
const syncCurrentSceneHistory = (scene, history) => {
  const currentWords = cachedSceneWords(scene)
  const timestamp = getSceneTimestamp(scene)
  const latest = history[history.length - 1]
  if (latest && (latest.words === currentWords || timestamp < latest.timestamp)) return history

  const entry = { date: toDateKey(timestamp), words: currentWords, timestamp }
  if (latest?.date === entry.date) {
    return history.map((item, index) => (index === history.length - 1 ? entry : item))
  }
  return [...history, entry].slice(-MAX_HISTORY_ENTRIES)
}

// Normalised, time-ordered cumulative history for one scene.
export function getSceneHistory(scene) {
  if (Array.isArray(scene?.wordHistory) && scene.wordHistory.length) {
    const history = scene.wordHistory
      .map(entry => ({
        date: entry.date || toDateKey(entry.timestamp || Date.now()),
        words: Number(entry.words) || 0,
        timestamp: entry.timestamp || Date.parse(entry.date || '') || Date.now(),
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
    return syncCurrentSceneHistory(scene, history)
  }
  const timestamp = getSceneTimestamp(scene)
  return [{ date: toDateKey(timestamp), words: cachedSceneWords(scene), timestamp }]
}

// Net words added per date for one scene: { 'YYYY-MM-DD': n }.
export function sceneNetByDate(scene) {
  const byDate = {}
  getSceneHistory(scene).forEach(entry => {
    if (!byDate[entry.date] || entry.timestamp >= byDate[entry.date].timestamp) {
      byDate[entry.date] = entry
    }
  })
  const dates = Object.keys(byDate).sort()
  const net = {}
  dates.forEach((date, index) => {
    const previous = index > 0 ? byDate[dates[index - 1]].words : 0
    net[date] = Math.max(0, byDate[date].words - previous)
  })
  return net
}

// Net words per date summed across scenes.
export function dailyWordsForScenes(scenes) {
  return (scenes || []).reduce((totals, scene) => {
    Object.entries(sceneNetByDate(scene)).forEach(([date, words]) => {
      if (!words) return // consumers read missing days as 0; avoids synthetic zero keys
      totals[date] = (totals[date] || 0) + words
    })
    return totals
  }, {})
}

export function totalWordsOnDate(scenes, date) {
  return dailyWordsForScenes(scenes)[date] ?? 0
}

// Several dates at once with a single pass over the scenes.
export function wordsOnDates(scenes, dates) {
  const daily = dailyWordsForScenes(scenes)
  return dates.map(date => ({ date, words: daily[date] ?? 0 }))
}
