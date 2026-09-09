const text = value => value == null ? '' : String(value)
const values = input => Array.isArray(input) ? input.filter(value => typeof value === 'string' || typeof value === 'number') : []

export const loreTagLabel = value => text(value).trim().replace(/^#+/, '').trim()
export const loreTagKey = value => loreTagLabel(value).toLowerCase()

export function normalizeLoreTags(input) {
  const tags = new Map()
  values(input).forEach(value => {
    const label = loreTagLabel(value)
    const key = loreTagKey(label)
    if (key && !tags.has(key)) tags.set(key, label)
  })
  return [...tags.values()]
}

export const uniqueLoreIds = input => [...new Set(values(input).map(String).filter(value => value.trim()))]
export const loreCategory = entry => text(entry.category).trim() || 'Uncategorized'

export function normalizeLoreEntry(entry) {
  return {
    ...entry,
    title: text(entry.title), category: text(entry.category).trim(), content: text(entry.content),
    tags: normalizeLoreTags(entry.tags),
    characterIds: uniqueLoreIds(entry.characterIds),
    locationIds: uniqueLoreIds(entry.locationIds),
    loreIds: uniqueLoreIds(entry.loreIds).filter(id => id !== entry.id),
  }
}

export function buildLoreIndex(items = []) {
  const entries = items.filter(Boolean).map(normalizeLoreEntry)
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const incoming = new Map()
  entries.forEach(entry => entry.loreIds.forEach(id => {
    if (!incoming.has(id)) incoming.set(id, [])
    incoming.get(id).push(entry)
  }))
  return { entries, byId, incoming }
}

export function relatedLoreFor(entry, index) {
  const outgoingIds = new Set(entry.loreIds)
  return {
    outgoing: entry.loreIds.map(id => index.byId.get(id)).filter(Boolean),
    incoming: (index.incoming.get(entry.id) || []).filter(source => !outgoingIds.has(source.id)),
  }
}

// Receives normalized entries so search/filter changes don't renormalize the
// project. Map keys safely accept user category names such as "__proto__".
export function groupLoreEntries(entries, { search = '', category = '', tag = '', sortBy = 'title-asc' } = {}) {
  const query = search.trim().toLowerCase()
  const tagKey = loreTagKey(tag)
  const groups = new Map()
  entries.forEach(entry => {
    const group = loreCategory(entry)
    if (category && group !== category) return
    if (tagKey && !entry.tags.some(value => loreTagKey(value) === tagKey)) return
    if (query && ![entry.title, entry.category, entry.content, ...entry.tags].some(value => value.toLowerCase().includes(query))) return
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(entry)
  })
  const direction = sortBy === 'title-desc' ? -1 : 1
  groups.forEach(items => items.sort((a, b) => direction * a.title.localeCompare(b.title)))
  const categoryDirection = sortBy === 'category-desc' ? -1 : 1
  return [...groups].sort(([a], [b]) => categoryDirection * a.localeCompare(b))
}

const TAG_SOURCES = [
  ['loreEntries', 'tags', 'lore', 'Lore', 'title'],
  ['ideaEntries', 'tags', 'ideas', 'Idea', 'title'],
  ['locations', 'tags', 'locations', 'Location', 'name'],
  ['characters', 'keywords', 'characters', 'Character', 'name'],
  ['worldHistory', 'tags', 'worldhistory', 'History', 'title'],
  ['timeline', 'tags', 'timeline', 'Timeline', 'title'],
]

export function buildLoreTagIndex(sources) {
  const index = new Map()
  TAG_SOURCES.forEach(([field, tagField, section, type, titleField]) => {
    ;(sources[field] || []).filter(Boolean).forEach(entry => {
      normalizeLoreTags(entry[tagField]).forEach(tag => {
        const key = loreTagKey(tag)
        if (!index.has(key)) index.set(key, { label: tag, matches: new Map() })
        index.get(key).matches.set(`${section}:${entry.id}`, { section, type, id: entry.id, title: text(entry[titleField]) || 'Untitled' })
      })
    })
  })
  return new Map([...index].sort(([a], [b]) => a.localeCompare(b)))
}

export function createLoreReferenceIndex(projectData) {
  return {
    ...buildLoreIndex(projectData.loreEntries),
    characters: new Map((projectData.characters || []).map(entry => [entry.id, entry])),
    locations: new Map((projectData.locations || []).map(entry => [entry.id, entry])),
  }
}

export function loreReferenceRows(entry, index) {
  const rows = []
  const add = (type, id, target, field) => {
    if (target) rows.push({ type, id, title: text(target[field]) || 'Untitled' })
  }
  entry.characterIds.forEach(id => add('Character', id, index.characters.get(id), 'name'))
  entry.locationIds.forEach(id => add('Location', id, index.locations.get(id), 'name'))
  const related = relatedLoreFor(entry, index)
  related.outgoing.forEach(target => add('Related lore', target.id, target, 'title'))
  related.incoming.forEach(target => add('Referenced by lore', target.id, target, 'title'))
  return rows
}
