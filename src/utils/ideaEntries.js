export const IDEA_STATUSES = [
  { id: 'raw', label: 'Raw Capture', desc: 'Fast, messy idea dumping', color: 'var(--accent)' },
  { id: 'developing', label: 'Developing', desc: 'Refining & expanding', color: '#7aa8d8' },
  { id: 'inStory', label: 'In Story', desc: 'Active in your story', color: '#7ac4a0' },
  { id: 'archived', label: 'Archived', desc: 'Saved but inactive', color: 'var(--muted)' },
]
export const IDEA_STATUS_IDS = new Set(IDEA_STATUSES.map(status => status.id))
export const IDEA_ENTITY_TYPES = [
  { id: 'character', label: 'Character', collection: 'characters', section: 'characters' },
  { id: 'location', label: 'Location', collection: 'locations', section: 'locations' },
  { id: 'faction', label: 'Faction', collection: 'factions', section: 'factions' },
  { id: 'lore', label: 'Lore Entry', collection: 'loreEntries', section: 'lore' },
  { id: 'event', label: 'Timeline Event', collection: 'timeline', section: 'timeline' },
  { id: 'chapter', label: 'Chapter', collection: 'chapters', section: 'outline' },
]
const text = value => value == null ? '' : String(value)
const array = value => Array.isArray(value) ? value : []
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0
export const ideaEntityKey = entity => JSON.stringify([entity.type, entity.id])
export const normalizeIdeaTags = value => [...new Set(array(value)
  .filter(tag => typeof tag === 'string' || typeof tag === 'number')
  .map(tag => String(tag).trim().toLowerCase().replace(/^#+/, '').trim().replace(/\s+/g, '-')).filter(Boolean))]
export const normalizeIdeaLinks = value => [...new Map(array(value)
  .filter(link => link && typeof link.id === 'string' && link.id && typeof link.type === 'string' && link.type)
  .map(link => ({ ...link, name: text(link.name) })).map(link => [ideaEntityKey(link), link])).values()]

export function normalizeIdea(entry = {}) {
  return {
    ...entry,
    title: text(entry.title), description: text(entry.description ?? entry.body ?? entry.content ?? entry.text),
    group: text(entry.group), tags: normalizeIdeaTags(entry.tags),
    status: IDEA_STATUS_IDS.has(entry.status) ? entry.status : 'raw',
    order: number(entry.order), createdAt: number(entry.createdAt), updatedAt: number(entry.updatedAt ?? entry.createdAt),
    isFavourite: Boolean(entry.isFavourite), aiExpanded: Boolean(entry.aiExpanded),
    linkedEntities: normalizeIdeaLinks(entry.linkedEntities),
    linkedIdeas: [...new Set(array(entry.linkedIdeas).filter(id => typeof id === 'string' && id && id !== entry.id))],
    convertedTo: normalizeIdeaLinks([entry.convertedTo])[0] || null,
  }
}

export function ideaContentPatch(data) {
  const field = ['description', 'body', 'content', 'text'].find(key => Object.hasOwn(data, key))
  return field ? { ...data, description: text(data[field]), body: text(data[field]) } : data
}

export function buildIdeaEntityIndex(store = {}) {
  return new Map(IDEA_ENTITY_TYPES.flatMap(type => array(store[type.collection]).filter(entry => entry?.id).map(entry => {
    const entity = { type: type.id, id: entry.id, name: text(entry.name ?? entry.title) || 'Untitled' }
    return [ideaEntityKey(entity), entity]
  })))
}

export function buildIdeaIndex(entries = [], entities = new Map()) {
  const ideas = array(entries).filter(entry => entry?.id).map(normalizeIdea)
  return {
    ideas, byId: new Map(ideas.map(idea => [idea.id, idea])), entities,
    tags: [...new Set(ideas.flatMap(idea => idea.tags))].sort((a, b) => a.localeCompare(b)),
  }
}

export function filterIdeaEntries(index, { tag = '', favourite = false, linked = false, aiExpanded = false, archived = false, sort = 'manual' } = {}) {
  const activeTag = index.tags.includes(tag) ? tag : ''
  return index.ideas.filter(idea => (!activeTag || idea.tags.includes(activeTag))
    && (!favourite || idea.isFavourite) && (!linked || idea.linkedEntities.some(link => index.entities.has(ideaEntityKey(link))))
    && (!aiExpanded || idea.aiExpanded) && (archived || idea.status !== 'archived'))
    .sort((a, b) => (sort === 'newest' ? b.createdAt - a.createdAt
      : sort === 'oldest' ? a.createdAt - b.createdAt
        : sort === 'active' ? b.updatedAt - a.updatedAt : a.order - b.order)
      || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export function nextIdeaOrder(entries, status) {
  return entries.reduce((max, idea) => (IDEA_STATUS_IDS.has(idea.status) ? idea.status : 'raw') === status ? Math.max(max, number(idea.order)) : max, -1) + 1
}

// Rebalance only when duplicate/exhausted fractional ranks cannot represent
// the requested slot. The store applies this plan in one collection write.
export function planIdeaMove(entries, id, status, beforeId = null) {
  const index = buildIdeaIndex(entries)
  const source = index.byId.get(id)
  if (!source || !IDEA_STATUS_IDS.has(status) || beforeId === id) return []
  const column = filterIdeaEntries(index, { archived: true }).filter(idea => idea.status === status && idea.id !== id)
  const slot = beforeId === null ? column.length : column.findIndex(idea => idea.id === beforeId)
  if (slot < 0) return []
  const before = column[slot - 1]?.order
  const after = column[slot]?.order
  const order = before === undefined ? (after === undefined ? 0 : after - 1)
    : after === undefined ? before + 1 : before + (after - before) / 2
  if (Number.isFinite(order) && (before === undefined || order > before) && (after === undefined || order < after)) {
    return source.status === status && source.order === order ? [] : [{ id, data: { status, order } }]
  }
  column.splice(slot, 0, source)
  return column.flatMap((idea, position) => idea.status !== status || idea.order !== position * 1024
    ? [{ id: idea.id, data: { status, order: position * 1024 } }] : [])
}

export function ideaExportFields(entry, entities = new Map()) {
  const idea = normalizeIdea(entry)
  return [
    ['Status', IDEA_STATUSES.find(status => status.id === idea.status).label],
    ['Tags', idea.tags.join(', ')], ['Group', idea.group], ['Favourite', idea.isFavourite ? 'Yes' : ''],
    ['Linked to', idea.linkedEntities.map(link => `${link.type}: ${entities.get(ideaEntityKey(link))?.name || `${link.name || link.id} (unavailable)`}`).join('\n')],
    ['Converted to', idea.convertedTo ? `${idea.convertedTo.type}: ${entities.get(ideaEntityKey(idea.convertedTo))?.name || `${idea.convertedTo.name || idea.convertedTo.id} (unavailable)`}` : ''],
  ].filter(([, value]) => value)
}
