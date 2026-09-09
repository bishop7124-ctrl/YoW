export function parseTimelineYear(value) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const date = value.toString().replace(/[−–—]/g, '-')
  const yearMatch = date.match(/\byears?\s*(-?\d+)/i)
  const firstNumber = yearMatch || date.match(/-?\d+/)
  if (!firstNumber) return null
  let year = parseInt(firstNumber[1] ?? firstNumber[0], 10)
  if (!Number.isFinite(year)) return null
  if (/\b(?:bc|bce)\b/i.test(date) && year > 0) year = -year
  return year
}

const hasValue = value => value != null && String(value).trim() !== ''

export function getTimelineYear(entry = {}) {
  return [entry.startYear, entry.date, entry.dateRange, entry.year]
    .map(parseTimelineYear).find(year => year !== null) ?? null
}

export function formatTimelineDate(entry = {}, fallback = 'Undated') {
  // A derived startYear is a sort key, not a replacement for the writer's
  // full date. Explicit ranges still need both endpoints in every view.
  if (hasValue(entry.startYear) && hasValue(entry.endYear)) return `${entry.startYear} – ${entry.endYear}`
  return [entry.date, entry.dateRange, entry.startYear, entry.year].find(hasValue)?.toString() || fallback
}

export function sortTimelineEntries(entries = []) {
  // Parse once per entry rather than repeatedly within the sort comparator.
  return entries.filter(Boolean).map(entry => ({ entry, year: getTimelineYear(entry) ?? Infinity }))
    .sort((a, b) => a.year - b.year || String(a.entry.title || '').localeCompare(String(b.entry.title || '')))
    .map(({ entry }) => entry)
}

export function sortTimelineEras(eras = []) {
  return eras.filter(Boolean).map(era => ({ era, year: parseTimelineYear(era.startYear) ?? Infinity }))
    .sort((a, b) => a.year - b.year || String(a.era.name || '').localeCompare(String(b.era.name || '')))
    .map(({ era }) => era)
}

export function findEraForYear(year, eras = []) {
  if (!Number.isFinite(year)) return null
  const matches = eras.filter(era => {
    const start = parseTimelineYear(era.startYear) ?? -Infinity
    const end = parseTimelineYear(era.endYear) ?? Infinity
    return year >= start && year <= end
  })
  // Overlapping eras require a deliberate choice instead of silently picking
  // whichever record happened to be saved first.
  return matches.length === 1 ? matches[0] : null
}

export function parseYearInput(value) {
  if (!hasValue(value)) return null
  const year = Number(value)
  return Number.isSafeInteger(year) ? year : null
}
