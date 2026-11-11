// Name and alias resolution for manuscript references (Release C, step C1).
//
// One place that turns the project's records into "text a writer might type" -> record, so the editor's passive
// highlighting, the Inspector's "In this scene" chips, hover previews and (later) search and suggestions all agree.
// It reproduces the editor's existing map exactly: the same keys, the same entity shape, and the same rule that the
// LATER record wins a shared key. What it adds is (a) `aliases` on every record type (characters keep their existing
// `keywords` too) and (b) a list of collisions, so a name shared by two different records stops being invisible.

export const MIN_REFERENCE_LENGTH = 2
export const MAX_ALIASES_PER_RECORD = 20
export const MAX_ALIAS_LENGTH = 80

const clean = value => (typeof value === 'string' ? value.trim() : '')
const keyOf = value => clean(value).toLowerCase()

// Every distinct, usable alternative name for a record, in the order written. The record's own name is not included.
export function recordAliases(record, extraFields = []) {
  const out = []
  const seen = new Set()
  const own = keyOf(record?.name ?? record?.title)
  for (const field of ['aliases', ...extraFields]) {
    const list = Array.isArray(record?.[field]) ? record[field] : []
    for (const raw of list) {
      const text = clean(raw)
      const key = text.toLowerCase()
      if (text.length < MIN_REFERENCE_LENGTH || text.length > MAX_ALIAS_LENGTH || key === own || seen.has(key)) continue
      seen.add(key)
      out.push(text)
      if (out.length >= MAX_ALIASES_PER_RECORD) return out
    }
  }
  return out
}

// A cleaned alias list ready to store, from free text ("Maren, the Wolf; Lady M"). Splits on commas, semicolons and
// new lines, trims, drops too-short or duplicate entries.
export function parseAliasText(text, ownName = '') {
  return recordAliases({ name: ownName, aliases: String(text ?? '').split(/[,;\n]/) })
}

const SOURCES = [
  { list: 'characters', section: 'characters', label: 'Character', nameField: 'name', extra: ['keywords'],
    preview: r => r.summary || r.description || r.notes || r.role || '' },
  { list: 'locations', section: 'locations', label: 'Location', nameField: 'name', extra: [],
    preview: r => r.description || r.notes || r.summary || '' },
  { list: 'loreEntries', section: 'lore', label: 'Lore', nameField: 'title', extra: [],
    preview: r => r.content || r.summary || r.category || '' },
  { list: 'worldHistory', section: 'worldhistory', label: 'History', nameField: 'title', extra: [],
    preview: r => r.content || r.summary || r.dateRange || r.era || '' },
  { list: 'timeline', section: 'worldhistory', label: 'History', nameField: 'title', extra: [],
    preview: r => r.content || r.summary || r.dateRange || r.era || '' },
]

// Builds the lookup the editor uses.
//   map:        lowercase text -> { id, section, sectionLabel, name, preview }   (later record wins a shared key)
//   collisions: [{ key, text, entities: [entity, ...] }]  one entry per text shared by two or more DIFFERENT records
// Records are expected to be the active project's already.
export function buildEntityIndex(data = {}) {
  const map = {}
  const owners = new Map() // key -> Map(entityId -> entity), in first-seen order
  const put = (text, entity) => {
    const trimmed = clean(text)
    if (trimmed.length < MIN_REFERENCE_LENGTH) return
    const key = trimmed.toLowerCase()
    map[key] = entity
    if (!owners.has(key)) owners.set(key, { text: trimmed, entities: new Map() })
    owners.get(key).entities.set(`${entity.section}:${entity.id}`, entity)
  }
  for (const source of SOURCES) {
    for (const record of data[source.list] || []) {
      const name = record?.[source.nameField]
      const entity = { id: record.id, section: source.section, sectionLabel: source.label, name, preview: source.preview(record) }
      put(name, entity)
      recordAliases(record, source.extra).forEach(alias => put(alias, entity))
    }
  }
  const collisions = []
  for (const [key, info] of owners) {
    if (info.entities.size > 1) collisions.push({ key, text: info.text, entities: [...info.entities.values()] })
  }
  return { map, collisions }
}

// The collisions that involve one record, each with the OTHER records sharing the text.
export function collisionsForRecord(index, section, id) {
  return (index?.collisions || [])
    .filter(collision => collision.entities.some(entity => entity.section === section && entity.id === id))
    .map(collision => ({
      text: collision.text,
      others: collision.entities.filter(entity => !(entity.section === section && entity.id === id)),
    }))
}
