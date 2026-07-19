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
