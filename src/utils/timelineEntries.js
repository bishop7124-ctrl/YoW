import { findEraForYear, getTimelineYear, sortTimelineEntries } from './timelineYear'

export const uniqueTimelineValues = values => [...new Set((Array.isArray(values) ? values : []).filter(value => value != null && value !== '').map(String))]

export function createEraLookup(eras = []) {
  const byId = new Map(eras.map(era => [era.id, era]))
  const byName = new Map()
  eras.forEach(era => {
    const key = String(era.name || '').trim().toLowerCase()
    if (key) byName.set(key, byName.has(key) ? null : era)
  })
  return { byId, byName }
}

export function resolveTimelineEra(entry, lookup) {
  if (lookup.byId.has(entry.eraId)) return lookup.byId.get(entry.eraId)
  return lookup.byName.get(String(entry.era || '').trim().toLowerCase()) || null
}

export function normalizeTimelineEntry(entry) {
  return {
    ...entry,
    title: String(entry.title || ''),
    description: String(entry.description ?? entry.content ?? ''),
    tags: uniqueTimelineValues(entry.tags),
    linkedCharacters: uniqueTimelineValues(entry.linkedCharacters),
    linkedLocations: uniqueTimelineValues(entry.linkedLocations),
  }
}

export function buildTimelineEntries(timeline = [], characters = [], eras = []) {
  const lookup = createEraLookup(eras)
  const manual = timeline.filter(Boolean).map(entry => ({
    ...normalizeTimelineEntry(entry),
    eraId: resolveTimelineEra(entry, lookup)?.id || null,
    sourceType: 'timeline',
    renderKey: `timeline:${entry.id}`,
  }))
  const births = characters.filter(character => character.birthDate != null && String(character.birthDate).trim()).map(character => ({
    id: `birth-${character.id}`,
    renderKey: `birthday:${character.id}`,
    title: String(character.name || 'Unnamed character'),
    date: character.birthDate,
    eraId: findEraForYear(getTimelineYear({ date: character.birthDate }), eras)?.id || null,
    tags: [], linkedCharacters: [character.id], linkedLocations: [],
    sourceType: 'birthday', readOnly: true,
  }))
  return sortTimelineEntries([...manual, ...births])
}

export function matchesTimelineSearch(entry, query) {
  if (!query) return true
  return [entry.title, entry.description, entry.content, entry.date, entry.dateRange, entry.startYear, entry.endYear, entry.year, entry.era, entry.type, entry.category, ...uniqueTimelineValues(entry.tags)]
    .some(value => value != null && String(value).toLowerCase().includes(query))
}

export function groupTimelineEntries(entries, eras, { includeEmpty = false } = {}) {
  const lookup = createEraLookup(eras)
  const groups = new Map(eras.map(era => [era.id, { era, events: [] }]))
  const unassigned = []
  entries.forEach(entry => {
    const era = resolveTimelineEra(entry, lookup)
    if (era) groups.get(era.id).events.push(entry)
    else unassigned.push(entry)
  })
  const sections = [...groups.values()].filter(group => includeEmpty || group.events.length)
  if (unassigned.length) sections.push({ era: null, events: unassigned })
  return sections
}
