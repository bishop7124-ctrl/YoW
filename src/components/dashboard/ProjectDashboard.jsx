import { useMemo, useState } from 'react'
import { StudioBoard, StudioButton, StudioEmpty } from '../presentation/Studio'
import { getEnabledSections, getProjectTypeStage } from '../../constants/projectTypes'

const formatNumber = (value) => new Intl.NumberFormat().format(value || 0)
const READ_WPM = 220
const COVER_GRADIENTS = [
  'linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  'linear-gradient(160deg, #1c0c2a 0%, #2d1b4e 60%, #1a0d33 100%)',
  'linear-gradient(160deg, #0d1f2d 0%, #1a3a4a 55%, #0a2030 100%)',
  'linear-gradient(160deg, #1a0c0c 0%, #2d1212 50%, #3a1a1a 100%)',
  'linear-gradient(160deg, #0d2013 0%, #1a3a20 50%, #0a1a0d 100%)',
  'linear-gradient(160deg, #0c1a24 0%, #1a2e3a 50%, #0a1520 100%)',
  'linear-gradient(160deg, #1a1208 0%, #2e2010 50%, #3a2a18 100%)',
  'linear-gradient(160deg, #0c0c1a 0%, #1a1a30 50%, #0a0a18 100%)',
]
const PROJECT_STATUS_LABELS = {
  not_started: 'Not started',
  draft: 'Draft',
  in_progress: 'In progress',
  editing: 'Editing',
  complete: 'Complete',
  paused: 'Paused',
  writing: 'In progress',
  revision: 'Editing',
}

const countWords = value => value?.trim().match(/\S+/g)?.length || 0
const formatProjectStatus = status => PROJECT_STATUS_LABELS[status] || status || 'Drafting'
const formatCompletion = value => `${Math.round(value || 0)}%`
const pluralize = (count, singular, plural = `${singular}s`) => `${formatNumber(count)} ${count === 1 ? singular : plural}`
const getCoverGradient = (title) => {
  const n = (title || '?').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return COVER_GRADIENTS[n % COVER_GRADIENTS.length]
}
const toDateKey = value => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const startOfDay = value => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}
const shiftDate = (base, offset) => {
  const date = new Date(base)
  date.setDate(date.getDate() + offset)
  return date
}
const formatShortDate = key => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${key}T00:00:00`))
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function InfoTip({ title, children }) {
  return (
    <details className="insight-info-tip">
      <summary aria-label={`About ${title}`}>
        <span aria-hidden="true">i</span>
      </summary>
      <div role="note">
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </details>
  )
}

const getSceneTimestamp = scene => {
  const raw = scene.lastModified || scene.updatedAt || scene.createdAt || scene.created
  const timestamp = typeof raw === 'number' ? raw : Date.parse(raw)
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

const syncCurrentSceneHistory = (scene, history) => {
  const currentWords = countWords(scene.content || '')
  const timestamp = getSceneTimestamp(scene)
  const latest = history[history.length - 1]
  if (latest && (latest.words === currentWords || timestamp < latest.timestamp)) return history

  const entry = {
    date: toDateKey(timestamp),
    words: currentWords,
    timestamp,
  }

  if (latest?.date === entry.date) {
    return history.map((item, index) => index === history.length - 1 ? entry : item)
  }
  return [...history, entry].slice(-120)
}

const getSceneHistory = scene => {
  if (Array.isArray(scene.wordHistory) && scene.wordHistory.length) {
    const history = scene.wordHistory
      .map(entry => ({
        date: entry.date || toDateKey(entry.timestamp || Date.now()),
        words: Number(entry.words) || 0,
        timestamp: entry.timestamp || Date.parse(entry.date || '') || Date.now(),
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
    return syncCurrentSceneHistory(scene, history)
  }
  return [{
    date: toDateKey(getSceneTimestamp(scene)),
    words: countWords(scene.content || ''),
    timestamp: getSceneTimestamp(scene),
  }]
}

const buildWritingAnalytics = (stats, dailyGoal) => {
  const today = startOfDay(Date.now())
  const dateKeys = Array.from({ length: 35 }, (_, index) => toDateKey(shiftDate(today, index - 34)))
  const dailyWords = Object.fromEntries(dateKeys.map(key => [key, 0]))

  stats.scenes.forEach(scene => {
    const history = getSceneHistory(scene)
    history.forEach((entry, index) => {
      const previous = index > 0 ? history[index - 1].words : 0
      const delta = Math.max(0, entry.words - previous)
      if (dailyWords[entry.date] !== undefined) dailyWords[entry.date] += delta
    })
  })

  const progression = dateKeys.slice(-14).map(key => {
    const end = Date.parse(`${key}T23:59:59`)
    const words = stats.scenes.reduce((sum, scene) => {
      const history = getSceneHistory(scene).filter(entry => entry.timestamp <= end)
      if (history.length) return sum + history[history.length - 1].words
      return sum
    }, 0)
    return { date: key, words }
  })

  const todayKey = toDateKey(today)
  const todayWords = dailyWords[todayKey] || 0
  const goal = Math.max(1, Number(dailyGoal) || 1)
  const heatmapMax = Math.max(1, ...Object.values(dailyWords))

  return {
    dailyWords,
    progression,
    todayWords,
    goalProgress: Math.min(100, Math.round((todayWords / goal) * 100)),
    heatmapMax,
    activeDays: Object.values(dailyWords).filter(Boolean).length,
  }
}

const countSyllables = word => {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!cleaned) return 0
  const groups = cleaned.replace(/e$/, '').match(/[aeiouy]+/g)
  return Math.max(1, groups?.length || 1)
}

const buildReadability = scenes => {
  const text = scenes.map(scene => scene.content || '').join(' ').trim()
  const words = text.match(/\S+/g) || []
  const sentences = text.split(/[.!?]+/).filter(part => part.trim().length > 0)
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0)
  const wordCount = Math.max(1, words.length)
  const sentenceCount = Math.max(1, sentences.length)
  const flesch = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllables / wordCount)
  const grade = 0.39 * (wordCount / sentenceCount) + 11.8 * (syllables / wordCount) - 15.59
  const label = flesch >= 70 ? 'Easy' : flesch >= 50 ? 'Moderate' : 'Dense'
  return {
    flesch: Math.round(Math.max(0, Math.min(100, flesch))),
    grade: Math.max(0, grade).toFixed(1),
    label,
    avgSentence: Math.round(wordCount / sentenceCount),
  }
}

const buildCharacterFocus = stats => {
  // Character Focus analyses manuscript scene text only. It searches each
  // scene for saved character names and keywords, counts matching mentions,
  // counts the scenes containing those terms, then attributes the full word
  // count of each matching scene to that character for the bar chart. It does
  // not currently use POV fields, relationship links, direct appearance tags,
  // timeline entries, lore links, or inferred aliases. With too little drafted
  // text, the UI shows a low-data/empty state instead of implying coverage.
  const characters = stats.characters.map(character => {
    const terms = [character.name, ...(character.keywords || [])]
      .filter(Boolean)
      .map(escapeRegExp)
    if (!terms.length) return null
    const pattern = new RegExp(`\\b(${terms.join('|')})\\b`, 'gi')
    let mentions = 0
    let scenes = 0
    let allocatedWords = 0

    stats.scenes.forEach(scene => {
      const content = scene.content || ''
      const sceneMentions = content.match(pattern)?.length || 0
      if (!sceneMentions) return
      mentions += sceneMentions
      scenes += 1
      allocatedWords += countWords(content)
    })

    return {
      id: character.id,
      name: character.name,
      role: character.role,
      mentions,
      scenes,
      words: allocatedWords,
      minutes: Math.round(allocatedWords / READ_WPM),
    }
  }).filter(Boolean)

  return characters
    .filter(item => item.mentions > 0)
    .sort((a, b) => b.words - a.words || b.mentions - a.mentions)
    .slice(0, 8)
}

const getSceneWords = scene => countWords(scene.content || '')

const compareByOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0)

const buildStructureInsights = stats => {
  const chaptersByAct = new Map()
  stats.chapters.forEach(chapter => {
    const key = chapter.actId || chapter.parentId || 'unassigned'
    if (!chaptersByAct.has(key)) chaptersByAct.set(key, [])
    chaptersByAct.get(key).push(chapter)
  })

  const scenesByChapter = new Map()
  stats.scenes.forEach(scene => {
    const key = scene.chapterId || scene.parentId || 'unassigned'
    if (!scenesByChapter.has(key)) scenesByChapter.set(key, [])
    scenesByChapter.get(key).push(scene)
  })

  const rows = [...stats.acts].sort(compareByOrder).map((act, index) => {
    const chapters = (chaptersByAct.get(act.id) || []).sort(compareByOrder)
    const scenes = chapters.flatMap(chapter => scenesByChapter.get(chapter.id) || [])
    const words = scenes.reduce((sum, scene) => sum + getSceneWords(scene), 0)
    return {
      id: act.id,
      label: act.title || `${stats.projectType.structure?.level1 || 'Act'} ${index + 1}`,
      detail: `${formatNumber(scenes.length)} ${stats.projectType.structure?.level3?.toLowerCase() || 'scenes'}`,
      value: words,
    }
  })

  const unassignedScenes = stats.scenes.filter(scene => {
    if (!scene.chapterId && !scene.parentId) return true
    return !stats.chapters.some(chapter => chapter.id === (scene.chapterId || scene.parentId))
  })
  if (unassignedScenes.length) {
    rows.push({
      id: 'unassigned',
      label: 'Unassigned scenes',
      detail: `${formatNumber(unassignedScenes.length)} ${stats.projectType.structure?.level3?.toLowerCase() || 'scenes'}`,
      value: unassignedScenes.reduce((sum, scene) => sum + getSceneWords(scene), 0),
    })
  }

  return rows.sort((a, b) => b.value - a.value).slice(0, 6)
}

const buildSceneInsights = stats => {
  const scenes = stats.scenes.map(scene => ({
    id: scene.id,
    title: scene.title || 'Untitled scene',
    words: getSceneWords(scene),
  }))
  const nonEmpty = scenes.filter(scene => scene.words > 0)
  const average = nonEmpty.length
    ? Math.round(nonEmpty.reduce((sum, scene) => sum + scene.words, 0) / nonEmpty.length)
    : 0

  return {
    average,
    empty: scenes.filter(scene => scene.words === 0).length,
    short: scenes.filter(scene => scene.words > 0 && scene.words < 250).length,
    long: scenes.filter(scene => scene.words >= 2500).length,
    longest: [...nonEmpty].sort((a, b) => b.words - a.words).slice(0, 5),
  }
}

const getRecentSceneContext = (scene, stats) => {
  const chapterId = scene.chapterId || scene.parentId
  const chapter = stats.chapters.find(item => item.id === chapterId)
  const actId = chapter?.actId || chapter?.parentId || scene.actId
  const act = stats.acts.find(item => item.id === actId)
  const chapterLabel = stats.projectType.structure?.level2 || 'Chapter'
  const actLabel = stats.projectType.structure?.level1 || 'Act'
  const parts = []

  if (chapter) parts.push(chapter.title || `${chapterLabel} ${(chapter.order ?? stats.chapters.indexOf(chapter)) + 1}`)
  if (act) parts.push(act.title || `${actLabel} ${(act.order ?? stats.acts.indexOf(act)) + 1}`)
  return parts.join(' · ')
}

const buildCoverageInsights = stats => {
  const manuscript = stats.scenes.map(scene => scene.content || '').join(' ')
  const countMentioned = items => items.filter(item => {
    const terms = [item.name, item.title, ...(item.keywords || [])]
      .filter(Boolean)
      .map(escapeRegExp)
    if (!terms.length) return false
    return new RegExp(`\\b(${terms.join('|')})\\b`, 'i').test(manuscript)
  }).length

  const characterMentions = countMentioned(stats.characters)
  const locationMentions = countMentioned(stats.locations)
  const loreWithLinks = stats.loreEntries.filter(entry =>
    (entry.characterIds && entry.characterIds.length) ||
    (entry.locationIds && entry.locationIds.length)
  ).length
  const referenceTotal = stats.characters.length + stats.locations.length + stats.loreEntries.length

  return [
    {
      label: 'Characters in draft',
      value: characterMentions,
      total: stats.characters.length,
      detail: `${formatNumber(characterMentions)} of ${formatNumber(stats.characters.length)} referenced`,
    },
    {
      label: 'Locations in draft',
      value: locationMentions,
      total: stats.locations.length,
      detail: `${formatNumber(locationMentions)} of ${formatNumber(stats.locations.length)} referenced`,
    },
    {
      label: 'Linked lore',
      value: loreWithLinks,
      total: stats.loreEntries.length,
      detail: `${formatNumber(loreWithLinks)} of ${formatNumber(stats.loreEntries.length)} connected`,
    },
    {
      label: 'Reference library',
      value: referenceTotal,
      total: Math.max(1, stats.planningItems),
      detail: `${formatNumber(referenceTotal)} reusable project records`,
    },
  ]
}

const buildMomentumInsights = (analytics, dailyGoal) => {
  const entries = Object.entries(analytics.dailyWords)
  const last7 = entries.slice(-7)
  const last14 = entries.slice(-14, -7)
  const last7Words = last7.reduce((sum, [, words]) => sum + words, 0)
  const last14Words = last14.reduce((sum, [, words]) => sum + words, 0)
  const activeDays = last7.filter(([, words]) => words > 0).length
  const activeAverage = activeDays ? Math.round(last7Words / activeDays) : 0
  const change = last14Words ? Math.round(((last7Words - last14Words) / last14Words) * 100) : null
  const goal = Math.max(0, Number(dailyGoal) || 0)

  return {
    last7Words,
    activeDays,
    activeAverage,
    goalDays: goal ? last7.filter(([, words]) => words >= goal).length : 0,
    change,
  }
}

const NAV_ROOMS = [
  {
    id: 'outline',
    label: 'Outline',
    cta: 'Open outline',
    description: 'Shape your story structure and narrative flow.',
    accent: 'coral',
    primarySection: 'outline',
    requires: ['outline'],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" />
        <circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" />
      </svg>
    ),
    getSummary: (stats) => {
      const parts = []
      if (stats.acts.length) parts.push(`${stats.acts.length} ${stats.projectType.structure?.level1?.toLowerCase() ?? 'act'}s`)
      if (stats.chapters.length) parts.push(`${stats.chapters.length} ${stats.projectType.structure?.level2?.toLowerCase() ?? 'chapter'}s`)
      if (stats.scenes.length) parts.push(`${stats.scenes.length} ${stats.projectType.structure?.level3?.toLowerCase() ?? 'scene'}s`)
      return parts.join(' · ') || 'No structure yet'
    },
  },
  {
    id: 'characters',
    label: 'Characters',
    cta: 'View characters',
    description: 'Build people your readers will remember.',
    accent: 'gold',
    primarySection: 'characters',
    requires: ['characters'],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        <circle cx="17" cy="10" r="2.5" /><path d="M14.5 20a4.5 4.5 0 0 1 6 0" />
      </svg>
    ),
    getSummary: (stats) => {
      const parts = [`${stats.characters.length} characters`]
      if (stats.factions.length) parts.push(`${stats.factions.length} factions`)
      return parts.join(' · ')
    },
  },
  {
    id: 'atlas',
    label: 'Atlas',
    cta: 'Explore atlas',
    description: 'Explore the places that bring your world to life.',
    accent: 'teal',
    primarySection: 'locations',
    requires: ['locations'],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3z" /><path d="M9 3v15" /><path d="M15 6v15" />
      </svg>
    ),
    getSummary: (stats) => {
      const parts = [`${stats.locations.length} locations`]
      if (stats.maps.length) parts.push(`${stats.maps.length} maps`)
      return parts.join(' · ')
    },
  },
  {
    id: 'lore',
    label: 'Lore',
    cta: 'Open lore',
    description: 'Document the history, legends, and secrets.',
    accent: 'sage',
    primarySection: 'lore',
    requires: ['lore'],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4z" /><path d="M5 4v16" />
        <path d="M9 8h6" /><path d="M9 12h5" />
      </svg>
    ),
    getSummary: (stats) => `${stats.loreEntries.length} entries`,
  },
  {
    id: 'history',
    label: 'History',
    cta: 'View timeline',
    description: 'Track important events that shape your world.',
    accent: 'amber',
    primarySection: 'timeline',
    requires: ['timeline', 'worldhistory'],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /><path d="M4 4l3 3" />
      </svg>
    ),
    getSummary: (stats) => {
      const parts = []
      if (stats.timeline.length) parts.push(`${stats.timeline.length} events`)
      if (stats.worldHistory.length) parts.push(`${stats.worldHistory.length} events`)
      return parts.join(' · ') || '0 events'
    },
  },
  {
    id: 'ideas',
    label: 'Ideas',
    cta: 'New idea',
    description: 'Capture and grow your best story ideas.',
    accent: 'rose',
    primarySection: 'ideas',
    requires: ['ideas'],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 18h6" /><path d="M10 22h4" />
        <path d="M8.5 14.5a6 6 0 1 1 7 0c-.8.7-1.5 1.5-1.5 2.5h-4c0-1-.7-1.8-1.5-2.5z" />
      </svg>
    ),
    getSummary: (stats) => `${stats.ideaEntries.length} ideas`,
  },
]

const teleport = (section) =>
  window.dispatchEvent(new CustomEvent('switch-section', { detail: { section } }))

const openWriting = () =>
  window.dispatchEvent(new CustomEvent('switch-writing'))

const openProjectSettings = () =>
  window.dispatchEvent(new CustomEvent('open-project-settings'))

const NavCard = ({ room, stats }) => (
  <button
    className={`overview-nav-card overview-nav-card-${room.accent}`}
    onClick={() => teleport(room.primarySection)}
    aria-label={`Open ${room.label}`}
  >
    <span className="overview-nav-card-icon">{room.icon}</span>
    <span className="overview-nav-card-label">
      <span>{room.label}</span>
      <small>{room.getSummary(stats)}</small>
    </span>
    <span className="overview-nav-card-summary">{room.description}</span>
    <span className="overview-nav-card-cta">{room.cta}</span>
  </button>
)

const LedgerRow = ({ label, value, longValue = false }) => (
  <div className={`overview-row${longValue ? ' overview-row-long' : ''}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
)

const Sparkline = ({ points }) => {
  const max = Math.max(1, ...points.map(point => point.words))
  return (
    <div className="analytics-sparkline" aria-label="Word count progression">
      {points.map(point => (
        <span
          key={point.date}
          title={`${formatShortDate(point.date)}: ${formatNumber(point.words)} words`}
          style={{ height: `${Math.max(8, (point.words / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

const ActivityHeatmap = ({ dailyWords, heatmapMax }) => (
  <div className="analytics-heatmap" aria-label="Writing activity heatmap">
    {Object.entries(dailyWords).map(([date, words]) => (
      <span
        key={date}
        title={`${formatShortDate(date)}: ${formatNumber(words)} words`}
        data-level={words === 0 ? 0 : Math.max(1, Math.ceil((words / heatmapMax) * 4))}
      />
    ))}
  </div>
)

const InsightMetric = ({ label, value, detail }) => (
  <div className="analytics-metric">
    <span>{label}</span>
    <strong>{value}</strong>
    {detail && <small>{detail}</small>}
  </div>
)

const MiniBarList = ({ items, max, emptyText }) => (
  <div className="analytics-bar-list">
    {items.length ? items.map(item => (
      <div key={item.id || item.label} className="analytics-bar-row">
        <div>
          <strong>{item.label || item.title}</strong>
          <small>{item.detail || `${formatNumber(item.value ?? item.words)} words`}</small>
        </div>
        <span>{formatNumber(item.value ?? item.words)}</span>
        <i style={{ width: `${Math.max(5, ((item.value ?? item.words) / Math.max(1, max)) * 100)}%` }} />
      </div>
    )) : (
      <p className="analytics-empty">{emptyText}</p>
    )}
  </div>
)

const WritingProgressCard = ({ words, target, progress, statusLabel }) => {
  const hasTarget = target > 0
  const remaining = hasTarget ? Math.max(0, target - words) : null
  const progressValue = hasTarget ? Math.max(0, progress || 0) : 0
  const meterValue = Math.min(100, progressValue)
  const progressLabel = hasTarget ? formatCompletion(progressValue) : 'No target yet'
  const context = hasTarget
    ? `You're ${formatNumber(words)} words into a ${formatNumber(target)} word novel.`
    : `You're ${formatNumber(words)} words into this manuscript. Add a target when you want a finish line.`
  const remainingText = hasTarget
    ? remaining > 0
      ? `${formatNumber(remaining)} words to go.`
      : 'Target reached. Beautiful work.'
    : 'No word target set yet.'

  return (
    <section className="writing-progress-card" aria-label="Writing progress">
      <div className="writing-progress-card-head">
        <div className="writing-progress-main">
          <span className="writing-progress-icon" aria-hidden="true">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </span>
          <div>
            <span className="writing-progress-eyebrow">Writing progress</span>
            <strong>{formatNumber(words)}</strong>
            <small>words written</small>
          </div>
        </div>
        <div className="writing-progress-details">
          <div>
            <strong>{hasTarget ? formatNumber(target) : 'Set a target'}</strong>
            <span>Word target</span>
          </div>
          <div>
            <strong>{progressLabel}</strong>
            <span>Complete</span>
          </div>
        </div>
      </div>
      <div className="writing-progress-meter-row">
        <div className="writing-progress-meter" aria-hidden="true">
          <span style={{ width: `${hasTarget ? meterValue : 8}%` }} />
        </div>
        <span>{progressLabel}</span>
      </div>
      <div className="writing-progress-footer">
        <p>{context}</p>
        <small>{remainingText}</small>
        <span>{statusLabel || 'Drafting'}</span>
      </div>
    </section>
  )
}

const CampaignProgressCard = ({ stats }) => {
  const campaign = stats.campaignStats
  const sessionLabel = stats.projectType.structure?.level2 || 'Session'
  const encounterLabel = stats.projectType.structure?.level3 || 'Encounter'
  const arcLabel = stats.projectType.structure?.level1 || 'Story Arc'
  const hasSessionTarget = campaign.sessionTarget > 0
  const progressLabel = hasSessionTarget ? formatCompletion(campaign.sessionProgress) : `${campaign.prepCoverage}%`
  const meterLabel = hasSessionTarget
    ? `${formatCompletion(campaign.sessionProgress)} of ${formatNumber(campaign.sessionTarget)}-${sessionLabel.toLowerCase()} target`
    : 'Add a session target in settings'
  const meterValue = hasSessionTarget ? Math.min(100, Math.max(0, campaign.sessionProgress || 0)) : 0
  const projectNoun = stats.project.type === 'dnd_campaign' ? 'DM campaign plan' : 'GM campaign plan'
  const context = hasSessionTarget
    ? `${formatNumber(campaign.plannedSessions)} ${sessionLabel.toLowerCase()}${campaign.plannedSessions === 1 ? '' : 's'} planned against a ${formatNumber(campaign.sessionTarget)} session target.`
    : `${formatNumber(campaign.plannedSessions)} ${sessionLabel.toLowerCase()}${campaign.plannedSessions === 1 ? '' : 's'} and ${formatNumber(campaign.encounterCount)} ${encounterLabel.toLowerCase()}${campaign.encounterCount === 1 ? '' : 's'} planned.`
  const structureLabel = `${arcLabel} -> ${sessionLabel} -> ${encounterLabel}`

  return (
    <section className="writing-progress-card writing-progress-card-campaign" aria-label="Campaign planning progress">
      <div className="writing-progress-card-head">
        <div className="writing-progress-main">
          <span className="writing-progress-icon" aria-hidden="true">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
              <path d="M9 7h7" />
              <path d="M9 11h5" />
            </svg>
          </span>
          <div>
            <span className="writing-progress-eyebrow">Campaign progress</span>
            <strong>{formatNumber(campaign.plannedSessions)}</strong>
            <small>{sessionLabel.toLowerCase()}s planned</small>
          </div>
        </div>
        <div className="writing-progress-details">
          <div>
            <strong>{formatNumber(campaign.encounterCount)}</strong>
            <span>{encounterLabel}s</span>
          </div>
          <div>
            <strong>{progressLabel}</strong>
            <span>{hasSessionTarget ? 'Target' : 'Prep'}</span>
          </div>
        </div>
      </div>
      <div className="writing-progress-meter-row">
        <div className="writing-progress-meter" aria-hidden="true">
          <span style={{ width: `${meterValue}%` }} />
        </div>
        <span>{meterLabel}</span>
      </div>
      <div className="writing-progress-footer">
        <p>{context}</p>
        <small>{formatNumber(campaign.sessionsWithPrep)} with prep · {formatNumber(campaign.sessionsWithRecap)} with recap</small>
        <span>{projectNoun} · {structureLabel}</span>
      </div>
    </section>
  )
}

export default function ProjectDashboard({ store }) {
  const stats = store.activeProjectStats
  const [dailyGoal, setDailyGoal] = useState(() => localStorage.getItem('nf-daily-word-goal') || '500')
  const [viewMode, setViewMode] = useState('overview')
  const [insightsCtaSeen, setInsightsCtaSeen] = useState(() => localStorage.getItem('nf-insights-cta-seen') === 'true')
  const openInsights = () => {
    localStorage.setItem('nf-insights-cta-seen', 'true')
    setInsightsCtaSeen(true)
    setViewMode('insights')
  }
  const analytics = useMemo(() => stats ? buildWritingAnalytics(stats, dailyGoal) : null, [stats, dailyGoal])
  const readability = useMemo(() => stats ? buildReadability(stats.scenes) : null, [stats])
  const characterFocus = useMemo(() => stats ? buildCharacterFocus(stats) : [], [stats])
  const structureInsights = useMemo(() => stats ? buildStructureInsights(stats) : [], [stats])
  const sceneInsights = useMemo(() => stats ? buildSceneInsights(stats) : null, [stats])
  const coverageInsights = useMemo(() => stats ? buildCoverageInsights(stats) : [], [stats])
  const momentumInsights = useMemo(() => analytics ? buildMomentumInsights(analytics, dailyGoal) : null, [analytics, dailyGoal])
  if (!stats) {
    return (
      <StudioBoard className="overview-board">
        <div className="overview-layout overview-no-project">
          <StudioEmpty
            title="No active project"
            body="Choose a project from the library to see its dashboard, writing progress, and worldbuilding shortcuts."
            action={(
              <StudioButton tone="primary" onClick={() => store.setActiveNovelId?.(null)}>
                Back to projects
              </StudioButton>
            )}
          />
        </div>
      </StudioBoard>
    )
  }

  const project = stats.project
  const isCampaign = Boolean(stats.campaignStats)
  const availableSections = new Set(getEnabledSections(project))
  const visibleRooms = NAV_ROOMS.filter(room => room.requires.some(id => availableSections.has(id)))

  const recentScenes = [...stats.scenes]
    .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
    .slice(0, 5)
  const hasPlanning = stats.planningItems > 0 || stats.acts.length > 0 || stats.scenes.length > 0
  const maxCharacterWords = Math.max(1, ...characterFocus.map(item => item.words))
  const maxStructureWords = Math.max(1, ...structureInsights.map(item => item.value))
  const maxLongestSceneWords = Math.max(1, ...(sceneInsights?.longest || []).map(item => item.words))
  const projectWordTarget = Number(project.wordCountTarget || project.wordTarget || project.targetWords || stats.projectType.defaultWordTarget || 0)
  const projectWordProgress = projectWordTarget
    ? Math.round((stats.manuscriptWords / projectWordTarget) * 100)
    : null
  const projectStage = getProjectTypeStage(project.type)
  const isBetaType = projectStage.stage === 'beta'
  const workspaceLabel = stats.projectType.workspaceLabel || 'Manuscript'
  const analyticsLabel = stats.projectType.analyticsLabel || 'Writing Analytics'
  const unitLabel = stats.projectType.structure?.level3 || 'Scene'
  const unitLabelLower = unitLabel.toLowerCase()
  const projectStatusLabel = formatProjectStatus(project.status)
  const heroBgImage = project.bannerImage || project.coverPhoto
  const overviewHeroStyle = {
    '--overview-cover-fallback': getCoverGradient(project.title),
    ...(heroBgImage ? { '--overview-cover-art': `url("${heroBgImage}")` } : {}),
  }

  const updateDailyGoal = value => {
    const next = value.replace(/[^\d]/g, '')
    setDailyGoal(next)
    localStorage.setItem('nf-daily-word-goal', next)
  }

  return (
    <StudioBoard className="overview-board">
      <div className="overview-layout">
        <header data-tour="dashboard-header" className={`overview-hero${heroBgImage ? ' overview-hero-has-cover' : ''}`} style={overviewHeroStyle}>
          <div className="overview-hero-copy">
            <p className="studio-kicker">{stats.projectType.label} project</p>
            <div className="overview-hero-badges">
              <span>{stats.projectType.label}</span>
              <span>{projectStatusLabel}</span>
            </div>
            <h1>{project.title}</h1>
            <p>{project.description || (isCampaign ? 'Your campaign plan is taking shape.' : 'Your manuscript is taking shape.')}</p>
            {isBetaType && (
              <p style={{ marginTop: 8, color: 'var(--accent)', fontSize: 12, fontWeight: 700 }}>
                {projectStage.label}: {projectStage.note}
              </p>
            )}
            <div className="overview-hero-actions">
              <button type="button" onClick={openWriting}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Open {isCampaign ? 'sessions' : 'manuscript'}
              </button>
              <button type="button" onClick={openProjectSettings}>Project settings</button>
            </div>
          </div>
          <div data-tour="dashboard-word-target">
            {isCampaign ? (
              <CampaignProgressCard stats={stats} />
            ) : (
              <WritingProgressCard
                words={stats.manuscriptWords}
                target={projectWordTarget}
                progress={projectWordProgress}
                statusLabel={projectStatusLabel}
              />
            )}
          </div>
          <div className="overview-hero-side">
            <div className="overview-status">
              <span>{`Updated ${stats.updatedLabel}`}</span>
            </div>
            <div className="overview-view-switch" aria-label="Dashboard view">
              <button
                type="button"
                className={viewMode === 'overview' ? 'is-active' : ''}
                onClick={() => setViewMode('overview')}
              >
                Overview
              </button>
              <button
                type="button"
                className={viewMode === 'insights' ? 'is-active' : ''}
                onClick={openInsights}
              >
                Insights
              </button>
            </div>
          </div>
        </header>

        {viewMode === 'overview' ? (
          <>
            {!insightsCtaSeen && (
              <section className="overview-insights-cta panel-soft">
                <div>
                  <p className="studio-kicker">Project Insights</p>
                  <h2>See patterns, gaps and opportunities across your world.</h2>
                  <p>Review writing rhythm, draft balance, worldbuilding coverage, and which characters are most visible in the manuscript.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={openInsights}>
                  Open Insights
                </button>
              </section>
            )}

            {visibleRooms.length > 0 && (
              <nav className="overview-nav" data-tour="dashboard-quick-links" aria-label="Project areas">
                {visibleRooms.map(room => (
                  <NavCard key={room.id} room={room} stats={stats} />
                ))}
              </nav>
            )}

            <div className="overview-columns">
              <section className="overview-section panel-soft">
                <div className="overview-section-head">
                  <div>
                    <p className="studio-kicker">Project</p>
                    <h2>Story Snapshot</h2>
                  </div>
                </div>
                <div className="overview-list">
                  <LedgerRow label="Created" value={stats.createdLabel} />
                  <LedgerRow label="Project type" value={stats.projectType.label} />
                  {stats.projectType.workflowSummary && (
                    <LedgerRow label="Shape" value={stats.projectType.workflowSummary} longValue />
                  )}
                  {isCampaign && (
                    <LedgerRow label="Planning structure" value={`${stats.projectType.structure?.level1 || 'Arc'} -> ${stats.projectType.structure?.level2 || 'Session'} -> ${stats.projectType.structure?.level3 || 'Encounter'}`} longValue />
                  )}
                  <LedgerRow label="Status" value={projectStatusLabel} />
                  {isCampaign ? (
                    <>
                      <LedgerRow label="Planned sessions" value={formatNumber(stats.campaignStats.plannedSessions)} />
                      <LedgerRow label="Encounters" value={formatNumber(stats.campaignStats.encounterCount)} />
                      <LedgerRow label="Prep coverage" value={`${stats.campaignStats.prepCoverage}%`} />
                      <LedgerRow label="Recap coverage" value={`${stats.campaignStats.recapCoverage}%`} />
                    </>
                  ) : (
                    <LedgerRow label="Word count" value={formatNumber(stats.manuscriptWords)} />
                  )}
                  {!isCampaign && projectWordTarget > 0 && (
                    <LedgerRow label="Word target" value={`${formatNumber(projectWordTarget)} (${projectWordProgress}%)`} />
                  )}
                </div>
              </section>

              <section className="overview-section panel-soft">
                <div className="overview-section-head">
                  <div>
                    <p className="studio-kicker">{workspaceLabel}</p>
                    <h2>{isCampaign ? 'Campaign Shape' : 'Manuscript Shape'}</h2>
                  </div>
                </div>
                <div className="overview-list">
                  <LedgerRow label={stats.projectType.structure?.level1 || 'Acts'} value={formatNumber(stats.acts.length)} />
                  <LedgerRow label={`${stats.projectType.structure?.level2 || 'Chapter'}s`} value={formatNumber(stats.chapters.length)} />
                  <LedgerRow label={`${stats.projectType.structure?.level3 || 'Scene'}s`} value={formatNumber(stats.scenes.length)} />
                  <LedgerRow label={`Average ${unitLabelLower} length`} value={`${formatNumber(sceneInsights?.average || 0)} words`} />
                </div>
              </section>

              <section className="overview-section panel-soft">
                <div className="overview-section-head">
                  <div>
                    <p className="studio-kicker">Story world</p>
                    <h2>Worldbuilding</h2>
                  </div>
                </div>
                <div className="overview-list">
                  <LedgerRow label="Characters" value={formatNumber(stats.characters.length)} />
                  <LedgerRow label="Locations" value={formatNumber(stats.locations.length)} />
                  <LedgerRow label="Lore entries" value={formatNumber(stats.loreEntries.length)} />
                  <LedgerRow label="History events" value={formatNumber(stats.worldHistory.length)} />
                  <LedgerRow label="Ideas" value={formatNumber(stats.ideaEntries.length)} />
                </div>
              </section>

              <section className="overview-section overview-section-wide panel-soft">
                <div className="overview-section-head">
                  <div>
                    <p className="studio-kicker">{workspaceLabel}</p>
                    <h2>{isCampaign ? 'Recent Session Notes' : 'Recent Writing'}</h2>
                  </div>
                </div>
                <div className="overview-scene-list">
                  {recentScenes.length > 0 ? recentScenes.map(scene => (
                    <div key={scene.id} className="overview-scene">
                      <span>
                        <strong>{scene.title || 'Untitled scene'}</strong>
                        {getRecentSceneContext(scene, stats) && <small>{getRecentSceneContext(scene, stats)}</small>}
                      </span>
                      <small>{pluralize(countWords(scene.content || ''), 'word')}</small>
                    </div>
                  )) : (
                    <StudioEmpty title={`No ${unitLabelLower}s yet`} body={isCampaign ? `Add a ${unitLabelLower} when you are ready to plan the table action.` : `Start a ${unitLabelLower} when you are ready to put words on the page.`} />
                  )}
                </div>
              </section>
            </div>
          </>
        ) : (
          <section className="overview-section overview-insights panel-soft analytics-dashboard">
            <div className="overview-section-head">
              <div>
                <p className="studio-kicker">{analyticsLabel}</p>
                <h2>Writing Rhythm</h2>
              </div>
              <label className="analytics-goal">
                <span>Daily goal</span>
                <input
                  value={dailyGoal}
                  onChange={event => updateDailyGoal(event.target.value)}
                  inputMode="numeric"
                  aria-label="Daily writing goal"
                />
              </label>
            </div>

            <div className="analytics-grid">
              <div className="analytics-card analytics-card-wide">
                <div className="analytics-card-head">
                  <span>{workspaceLabel} progression <InfoTip title={`${workspaceLabel} progression`}>Shows total manuscript words over recent scene-history checkpoints. It depends on saved scene text and edit history, so newly imported or sparse drafts may show a flatter line.</InfoTip></span>
                  <strong>{formatNumber(stats.manuscriptWords)}</strong>
                </div>
                <Sparkline points={analytics.progression} />
                <small>Estimated from scene word history and edit dates.</small>
              </div>

              <div className="analytics-card">
                <div className="analytics-card-head">
                  <span>Today <InfoTip title="Today">Counts words added today from scene word history and compares them with your daily goal. If no scene edits were recorded today, this can be zero even when older manuscript text exists.</InfoTip></span>
                  <strong>{formatNumber(analytics.todayWords)}</strong>
                </div>
                <div className="analytics-goal-meter">
                  <span style={{ width: `${analytics.goalProgress}%` }} />
                </div>
                <small>{analytics.goalProgress}% of {formatNumber(Number(dailyGoal) || 0)} words</small>
              </div>

              <div className="analytics-card">
                <div className="analytics-card-head">
                  <span>Activity <InfoTip title="Activity">Shows which of the last 35 days have recorded positive word additions. It reflects writing history, not time spent planning or editing worldbuilding records.</InfoTip></span>
                  <strong>{analytics.activeDays} days</strong>
                </div>
                <ActivityHeatmap dailyWords={analytics.dailyWords} heatmapMax={analytics.heatmapMax} />
                <small>Last 35 days</small>
              </div>

              <div className="analytics-card">
                <div className="analytics-card-head">
                  <span>Readability <InfoTip title="Readability">Estimates readability from manuscript sentence length and syllable counts. Treat it as a rough signal, especially for dialogue, invented names, poetry, or script-style projects.</InfoTip></span>
                  <strong>{readability.flesch}</strong>
                </div>
                <div className="analytics-readability">
                  <span>{readability.label}</span>
                  <small>Grade {readability.grade} · {readability.avgSentence} words/sentence</small>
                </div>
              </div>

              <div className="analytics-card analytics-card-wide">
                <div className="analytics-card-head">
                  <span>Momentum <InfoTip title="Momentum">Summarises words added in the last seven days, active writing days, goal hits, and change from the prior week. Low data usually means the project has not built much word-history yet.</InfoTip></span>
                  <strong>{formatNumber(momentumInsights.last7Words)}</strong>
                </div>
                <div className="analytics-metric-grid">
                  <InsightMetric label="Last 7 days" value={`${formatNumber(momentumInsights.last7Words)} words`} detail={`${momentumInsights.activeDays} active days`} />
                  <InsightMetric label="Active-day avg" value={formatNumber(momentumInsights.activeAverage)} detail="Words per writing day" />
                  <InsightMetric label="Goal days" value={`${momentumInsights.goalDays}/7`} detail="Days at or above goal" />
                  <InsightMetric
                    label="Vs prior week"
                    value={momentumInsights.change === null ? 'New' : `${momentumInsights.change > 0 ? '+' : ''}${momentumInsights.change}%`}
                    detail="Based on recorded scene history"
                  />
                </div>
              </div>

              <div className="analytics-card">
                <div className="analytics-card-head">
                  <span>Scene health <InfoTip title="Scene health">Groups manuscript scenes by word count so you can spot empty placeholders, very short beats, and unusually long scenes. It does not judge quality or completeness.</InfoTip></span>
                  <strong>{formatNumber(sceneInsights.average)}</strong>
                </div>
                <div className="analytics-metric-stack">
                  <InsightMetric label="Average scene" value={`${formatNumber(sceneInsights.average)} words`} />
                  <InsightMetric label="Empty scenes" value={formatNumber(sceneInsights.empty)} />
                  <InsightMetric label="Short scenes" value={formatNumber(sceneInsights.short)} detail="Under 250 words" />
                  <InsightMetric label="Long scenes" value={formatNumber(sceneInsights.long)} detail="2,500+ words" />
                </div>
              </div>

              <div className="analytics-card analytics-card-wide">
                <div className="analytics-card-head">
                  <span>Draft balance <InfoTip title="Draft balance">Compares word counts across your top-level structure, such as acts or campaign arcs. Empty structure or unassigned scenes can make the chart sparse.</InfoTip></span>
                  <strong>{structureInsights.length}</strong>
                </div>
                <MiniBarList
                  items={structureInsights}
                  max={maxStructureWords}
                  emptyText="Create structure sections to see draft balance."
                />
              </div>

              <div className="analytics-card analytics-card-wide">
                <div className="analytics-card-head">
                  <span>Longest scenes <InfoTip title="Longest scenes">Lists the scenes with the highest word counts. Use it to find possible pacing outliers, not as proof a scene is too long.</InfoTip></span>
                  <strong>{sceneInsights.longest.length}</strong>
                </div>
                <MiniBarList
                  items={sceneInsights.longest}
                  max={maxLongestSceneWords}
                  emptyText="Write scene content to see length outliers."
                />
              </div>

              <div className="analytics-card analytics-card-wide">
                <div className="analytics-card-head">
                  <span>Worldbuilding coverage <InfoTip title="Worldbuilding coverage">Checks whether saved characters and locations are mentioned in manuscript text, and whether lore entries have explicit character or location links. It cannot detect unnamed references or implied connections.</InfoTip></span>
                  <strong>{formatNumber(stats.planningItems)}</strong>
                </div>
                <div className="analytics-coverage-grid">
                  {coverageInsights.map(item => (
                    <div key={item.label} className="analytics-coverage-item">
                      <div>
                        <span>{item.label}</span>
                        <strong>{item.detail}</strong>
                      </div>
                      <div className="analytics-goal-meter">
                        <span style={{ width: `${item.total ? Math.min(100, (item.value / item.total) * 100) : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="analytics-card analytics-card-wide character-focus-card">
                <div className="analytics-card-head">
                  <span>Character focus <InfoTip title="Character focus">Searches manuscript scene text for each character’s saved name and keywords. The bar uses the total words in scenes where that character is mentioned; it excludes POV assignments, relationships, timeline entries, lore links, and unstored aliases.</InfoTip></span>
                  <strong>{characterFocus.length || 0}</strong>
                </div>
                <div className="character-focus-list">
                  {characterFocus.length ? characterFocus.map(item => (
                    <div key={item.id} className="character-focus-row">
                      <div>
                        <strong>{item.name}</strong>
                        <small>{formatNumber(item.words)} words · {item.scenes} scenes · {item.minutes} min read</small>
                      </div>
                      <span>{item.mentions}</span>
                      <div className="character-focus-bar">
                        <i style={{ width: `${Math.max(5, (item.words / maxCharacterWords) * 100)}%` }} />
                      </div>
                    </div>
                  )) : (
                    <p className="analytics-empty">No character names or keywords appear in the manuscript yet.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {viewMode === 'overview' && !hasPlanning && (
          <StudioEmpty title="Nothing here yet" body={`Add the first characters, locations, ${String(stats.projectType.structure?.level3 || 'scenes').toLowerCase()}, or ideas when you are ready.`} />
        )}
      </div>
    </StudioBoard>
  )
}
