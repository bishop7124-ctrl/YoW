// Configurable Schedule calendar (launch scope 2026-07-04).
// A project may define its own story-calendar shape on novel.scheduleCalendar:
//   { months: [{ name, days }, …], weekLength, dayNames: [ … ] }
// Absent or invalid config normalizes to the historical default (12 × 30-day
// months, 7-day weeks, "Day N" labels), so existing schedules keep rendering
// exactly as before. This is deliberately a practical story/campaign calendar:
// no leap rules, moons, date conversion, or complex recurrence.

export const MAX_MONTHS = 24
export const MAX_DAYS_PER_MONTH = 99
export const MAX_WEEK_LENGTH = 14
export const MAX_LABEL_LENGTH = 40
export const MAX_EVENT_DURATION = 36600
export const SCHEDULE_OPEN_MODES = {
  FIXED: 'fixed',
  LAST_VIEWED: 'lastViewed',
}

export const DEFAULT_MONTH_NAMES = [
  'First Month', 'Second Month', 'Third Month', 'Fourth Month',
  'Fifth Month', 'Sixth Month', 'Seventh Month', 'Eighth Month',
  'Ninth Month', 'Tenth Month', 'Eleventh Month', 'Twelfth Month',
]

const clampInt = (value, min, max, fallback) => {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

const cleanLabel = (value, fallback) => {
  const s = String(value ?? '').trim().slice(0, MAX_LABEL_LENGTH)
  return s || fallback
}

export function defaultScheduleCalendar() {
  return {
    months: DEFAULT_MONTH_NAMES.map(name => ({ name, days: 30 })),
    weekLength: 7,
    dayNames: [],
  }
}

// Returns a fully normalized calendar with derived fields:
//   months: [{ name, days }]            (1–24 months, 1–99 days each)
//   weekLength: int                     (1–14)
//   dayNames: [string × weekLength]     (padded with "Day N")
//   monthStarts: [absolute day offset of each month within the year]
//   daysInYear: total days
export function getScheduleCalendar(novel) {
  const raw = novel?.scheduleCalendar
  const rawMonths = Array.isArray(raw?.months) ? raw.months.slice(0, MAX_MONTHS) : null

  const months = (rawMonths && rawMonths.length ? rawMonths : defaultScheduleCalendar().months)
    .map((m, i) => ({
      name: cleanLabel(m?.name, DEFAULT_MONTH_NAMES[i] || `Month ${i + 1}`),
      days: clampInt(m?.days, 1, MAX_DAYS_PER_MONTH, 30),
    }))

  const weekLength = clampInt(raw?.weekLength, 1, MAX_WEEK_LENGTH, 7)

  const rawDayNames = Array.isArray(raw?.dayNames) ? raw.dayNames : []
  const dayNames = Array.from({ length: weekLength }, (_, i) =>
    cleanLabel(rawDayNames[i], `Day ${i + 1}`))

  const monthStarts = []
  let offset = 0
  for (const m of months) { monthStarts.push(offset); offset += m.days }

  return { months, weekLength, dayNames, monthStarts, daysInYear: offset }
}

const cleanYear = (value, fallback = 1) => {
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

const text = value => value == null ? '' : String(value)
const list = value => Array.isArray(value) ? value : []
const eventInt = (value, fallback) => {
  if (value === null || value === undefined || String(value).trim() === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

export const normalizeScheduleCategoryId = value => text(value || 'other').trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'other'

const DEFAULT_CATEGORIES = [
  ['scene', 'Scene', '#8b8fff'], ['battle', 'Battle', '#ef4444'],
  ['travel', 'Travel', '#f59e0b'], ['meeting', 'Meeting', '#22c55e'],
  ['festival', 'Festival', '#f97316'], ['other', 'Other', '#94a3b8'],
]
const CATEGORY_COLORS = ['#8b8fff', '#ef4444', '#f59e0b', '#22c55e', '#f97316', '#94a3b8', '#14b8a6', '#ec4899']

export function getScheduleCategories(project) {
  const configured = project?.categoryOptions?.schedule
  const labels = Array.isArray(configured) && configured.length ? configured : DEFAULT_CATEGORIES.map(([, label]) => label)
  const normalized = [...new Map(labels.map((value, index) => {
    const label = text(value).trim().slice(0, MAX_LABEL_LENGTH)
    if (!label) return null
    const id = normalizeScheduleCategoryId(label)
    const builtIn = DEFAULT_CATEGORIES.find(([builtInId]) => builtInId === id)
    return [id, { id, label: builtIn?.[1] || label, color: builtIn?.[2] || CATEGORY_COLORS[index % CATEGORY_COLORS.length] }]
  }).filter(Boolean)).values()]
  return normalized.length ? normalized : DEFAULT_CATEGORIES.map(([id, label, color]) => ({ id, label, color }))
}

export const normalizeScheduleTags = value => [...new Set(list(value)
  .filter(tag => typeof tag === 'string' || typeof tag === 'number')
  .map(tag => text(tag).trim().toLowerCase().replace(/^#+/, '').trim()).filter(Boolean))]

export const normalizeScheduleIds = value => [...new Set(list(value).filter(id => typeof id === 'string' && id))]

export function normalizeScheduleEvent(entry = {}) {
  return {
    ...entry,
    title: text(entry.title),
    description: text(entry.description ?? entry.notes ?? entry.content),
    year: eventInt(entry.year, 1), month: eventInt(entry.month, 1), day: eventInt(entry.day, 1),
    duration: Math.max(1, eventInt(entry.duration, 1)),
    category: normalizeScheduleCategoryId(entry.category),
    tags: normalizeScheduleTags(entry.tags),
    linkedCharacters: normalizeScheduleIds(entry.linkedCharacters),
    linkedLocations: normalizeScheduleIds(entry.linkedLocations),
  }
}

export function prepareScheduleEvent(entry, calendar) {
  const event = normalizeScheduleEvent(entry)
  if (!event.title.trim()) return { event, error: 'Title is required.' }
  if (event.month < 1 || event.month > calendar.months.length) return { event, error: `Month must be between 1 and ${calendar.months.length}.` }
  if (event.day < 1 || event.day > daysInMonth(calendar, event.month)) return { event, error: `Day must be between 1 and ${daysInMonth(calendar, event.month)} for ${monthName(calendar, event.month)}.` }
  if (event.duration > MAX_EVENT_DURATION) return { event, error: `Duration must be between 1 and ${MAX_EVENT_DURATION.toLocaleString()} days.` }
  return { event: { ...event, title: event.title.trim() }, error: '' }
}

const cleanMonth = (calendar, value, fallback = 1) =>
  clampInt(value, 1, calendar.months.length, fallback)

export function getScheduleViewSettings(novel, calendar = getScheduleCalendar(novel)) {
  const raw = novel?.scheduleViewSettings
  const openMode = raw?.openMode === SCHEDULE_OPEN_MODES.LAST_VIEWED
    ? SCHEDULE_OPEN_MODES.LAST_VIEWED
    : SCHEDULE_OPEN_MODES.FIXED
  const defaultYear = cleanYear(raw?.defaultYear, 1)
  const defaultMonth = cleanMonth(calendar, raw?.defaultMonth, 1)
  const lastViewedYear = cleanYear(raw?.lastViewedYear, defaultYear)
  const lastViewedMonth = cleanMonth(calendar, raw?.lastViewedMonth, defaultMonth)
  const openYear = openMode === SCHEDULE_OPEN_MODES.LAST_VIEWED ? lastViewedYear : defaultYear
  const openMonth = openMode === SCHEDULE_OPEN_MODES.LAST_VIEWED ? lastViewedMonth : defaultMonth

  return {
    openMode,
    defaultYear,
    defaultMonth,
    lastViewedYear,
    lastViewedMonth,
    openYear,
    openMonth,
  }
}

export const monthName = (calendar, month) =>
  calendar.months[month - 1]?.name || `Month ${month}`

export const daysInMonth = (calendar, month) =>
  calendar.months[month - 1]?.days || 30

// Absolute day-of-year index (0-based) for a month/day pair. Months beyond the
// configured year are projected past the end so out-of-range events still sort
// and span deterministically instead of collapsing onto real dates.
export function absoluteDay(calendar, month, day) {
  const m = Math.max(1, parseInt(month, 10) || 1)
  const start = m <= calendar.months.length
    ? calendar.monthStarts[m - 1]
    : calendar.daysInYear + (m - calendar.months.length - 1) * 30
  return start + (Math.max(1, parseInt(day, 10) || 1) - 1)
}

export const isScheduleDateInCalendar = (calendar, event) => {
  const normalized = normalizeScheduleEvent(event)
  return normalized.month >= 1 && normalized.month <= calendar.months.length
    && normalized.day >= 1 && normalized.day <= daysInMonth(calendar, normalized.month)
}

export const scheduleDateOrdinal = (calendar, event) => {
  const normalized = normalizeScheduleEvent(event)
  return (normalized.year - 1) * calendar.daysInYear + absoluteDay(calendar, normalized.month, normalized.day)
}

export function scheduleDateFromOrdinal(calendar, ordinal) {
  const yearIndex = Math.floor(ordinal / calendar.daysInYear)
  const dayOfYear = ordinal - yearIndex * calendar.daysInYear
  let monthIndex = calendar.months.findIndex((month, index) => dayOfYear < calendar.monthStarts[index] + month.days)
  if (monthIndex < 0) monthIndex = calendar.months.length - 1
  return { year: yearIndex + 1, month: monthIndex + 1, day: dayOfYear - calendar.monthStarts[monthIndex] + 1 }
}

export const scheduleDateLabel = (calendar, entry) => {
  const event = normalizeScheduleEvent(entry)
  const structuredDateMissing = entry?.year == null && entry?.month == null && entry?.day == null
  if (structuredDateMissing && text(entry?.date).trim()) return text(entry.date).trim()
  return `${monthName(calendar, event.month)}, Day ${event.day} · Year ${event.year}`
}

export const scheduleRangeLabel = (calendar, entry) => {
  const event = normalizeScheduleEvent(entry)
  const start = scheduleDateLabel(calendar, entry)
  if (event.duration <= 1 || !isScheduleDateInCalendar(calendar, event)) return start
  const end = scheduleDateFromOrdinal(calendar, scheduleDateOrdinal(calendar, event) + event.duration - 1)
  return `${start} — ${scheduleDateLabel(calendar, end)} · ${event.duration} days`
}

export const sortScheduleEvents = (items, calendar) => list(items).map(normalizeScheduleEvent).sort((a, b) =>
  scheduleDateOrdinal(calendar, a) - scheduleDateOrdinal(calendar, b)
  || a.title.localeCompare(b.title) || text(a.id).localeCompare(text(b.id)))

export function scheduleExportFields(projectData, entry) {
  const event = normalizeScheduleEvent(entry)
  const calendar = getScheduleCalendar(projectData?.project)
  const category = getScheduleCategories(projectData?.project).find(item => item.id === event.category)?.label || event.category.replace(/[_-]+/g, ' ')
  const linkedNames = (ids, items, kind) => ids.map(id => items?.find(item => item.id === id)?.name || `${kind} ${id} (unavailable)`)
  return [
    ['Date', scheduleRangeLabel(calendar, entry)],
    ['Category', category],
    ['Tags', event.tags.join(', ')],
    ['Characters', linkedNames(event.linkedCharacters, projectData?.characters, 'Character').join(', ')],
    ['Locations', linkedNames(event.linkedLocations, projectData?.locations, 'Location').join(', ')],
  ].filter(([, value]) => value !== null && value !== undefined && String(value).trim())
}

export function scheduleEventSegments(items, calendar, year, month) {
  const monthStart = (year - 1) * calendar.daysInYear + calendar.monthStarts[month - 1]
  const monthDays = daysInMonth(calendar, month)
  const monthEnd = monthStart + monthDays - 1
  const leadingDays = calendar.monthStarts[month - 1] % calendar.weekLength
  const lanesByWeek = Array.from({ length: Math.ceil((leadingDays + monthDays) / calendar.weekLength) }, () => [])
  const segments = []
  sortScheduleEvents(items, calendar).filter(event => isScheduleDateInCalendar(calendar, event)).forEach(event => {
    const eventStart = scheduleDateOrdinal(calendar, event)
    const eventEnd = eventStart + event.duration - 1
    if (eventStart > monthEnd || eventEnd < monthStart) return
    let cursor = Math.max(eventStart, monthStart)
    const overlapEnd = Math.min(eventEnd, monthEnd)
    while (cursor <= overlapEnd) {
      const cellIndex = leadingDays + cursor - monthStart
      const week = Math.floor(cellIndex / calendar.weekLength)
      const col = cellIndex % calendar.weekLength
      const weekEnd = Math.min(overlapEnd, cursor + calendar.weekLength - col - 1)
      const span = weekEnd - cursor + 1
      const endCol = col + span - 1
      const weekLanes = lanesByWeek[week]
      let lane = weekLanes.findIndex(ranges => ranges.every(range => endCol < range.col || col > range.endCol))
      if (lane < 0) { lane = weekLanes.length; weekLanes.push([]) }
      weekLanes[lane].push({ col, endCol })
      segments.push({ event, week, col, span, lane, startsBefore: cursor > eventStart, endsAfter: weekEnd < eventEnd })
      cursor = weekEnd + 1
    }
  })
  return { leadingDays, weeks: lanesByWeek.length, segments }
}
