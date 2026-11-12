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
  // Factions are only indexed when the caller passes them (the editor does so once alias support is switched on),
  // so adding them here changes nothing for a caller that does not.
  { list: 'factions', section: 'factions', label: 'Faction', nameField: 'name', extra: [],
    preview: r => r.description || r.summary || r.notes || '' },
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
  const owners = new Map() // key -> Map(group -> entity), in first-seen order
  const put = (text, entity, group) => {
    const trimmed = clean(text)
    if (trimmed.length < MIN_REFERENCE_LENGTH) return
    const key = trimmed.toLowerCase()
    map[key] = entity
    if (!owners.has(key)) owners.set(key, { text: trimmed, entities: new Map() })
    if (!owners.get(key).entities.has(group)) owners.get(key).entities.set(group, entity)
  }
  // A history entry and the timeline event linked to it are one chronicle record shown in two places, so they
  // share a group and never count as a clash with each other.
  const eventGroup = new Map((data.worldHistory || []).filter(entry => entry?.timelineEventId).map(entry => [entry.timelineEventId, `chronicle:${entry.id}`]))
  const groupOf = (source, record) => {
    if (source.list === 'worldHistory') return `chronicle:${record.id}`
    if (source.list === 'timeline') return eventGroup.get(record.id) || (record.worldHistoryEntryId ? `chronicle:${record.worldHistoryEntryId}` : `${source.section}:${record.id}`)
    return `${source.list}:${record.id}`
  }
  for (const source of SOURCES) {
    for (const record of data[source.list] || []) {
      const name = record?.[source.nameField]
      const entity = { id: record.id, section: source.section, sectionLabel: source.label, name, preview: source.preview(record) }
      const group = groupOf(source, record)
      put(name, entity, group)
      recordAliases(record, source.extra).forEach(alias => put(alias, entity, group))
    }
  }
  const collisions = []
  const byText = new Map() // lowercase text -> every record that answers to it
  for (const [key, info] of owners) {
    const entities = [...info.entities.values()]
    byText.set(key, entities)
    if (entities.length > 1) collisions.push({ key, text: info.text, entities })
  }
  return { map, collisions, byText }
}

const LIST_BY_SECTION = ['characters', 'locations', 'factions', 'loreEntries', 'worldHistory', 'timeline']

// For a record being edited: which of the given texts (its name, its draft aliases) are already used by ANOTHER record?
// `self` is { list, id } naming the record being edited (omit id for a new record). Returns
// [{ text, others: [entity, ...] }], one per clashing text, in the order given.
export function buildClashIndex(data = {}, self = {}) {
  const others = {}
  const alsoIds = new Set(self.alsoIds || []) // the record's own counterpart, e.g. the timeline event linked to a history entry
  for (const list of LIST_BY_SECTION) {
    others[list] = (data[list] || []).filter(record => !(self.id && self.list === list && record.id === self.id)
      && !((list === 'worldHistory' || list === 'timeline') && alsoIds.has(record.id)))
  }
  return buildEntityIndex(others).byText
}

// The lookup half, cheap enough to run on every keystroke once the index above has been built for the form.
export function clashesFromIndex(byText, texts = []) {
  const out = []
  const seen = new Set()
  for (const raw of texts) {
    const text = clean(raw)
    const key = text.toLowerCase()
    if (text.length < MIN_REFERENCE_LENGTH || seen.has(key)) continue
    seen.add(key)
    const entities = byText?.get(key)
    if (entities?.length) out.push({ text, others: entities })
  }
  return out
}

export const clashesForTexts = (data, self, texts) => clashesFromIndex(buildClashIndex(data, self), texts)

// The collisions that involve one record, each with the OTHER records sharing the text.
export function collisionsForRecord(index, section, id) {
  return (index?.collisions || [])
    .filter(collision => collision.entities.some(entity => entity.section === section && entity.id === id))
    .map(collision => ({
      text: collision.text,
      others: collision.entities.filter(entity => !(entity.section === section && entity.id === id)),
    }))
}

// The project's lists a form needs for clash warnings, picked from the store (missing lists become empty).
export const aliasDataFromStore = store => ({
  characters: store?.characters || [],
  locations: store?.locations || [],
  factions: store?.factions || [],
  loreEntries: store?.loreEntries || [],
  worldHistory: store?.worldHistory || [],
  timeline: store?.timeline || [],
})

// A form's payload without an empty `aliases` list when the record never had one, so saving a record the writer
// gave no other names to does not add an empty field to it (and nothing changes at all while the feature is off).
export function withAliasField(payload, initial) {
  const next = { ...payload }
  if (!Array.isArray(next.aliases) || (!next.aliases.length && !Object.hasOwn(initial || {}, 'aliases'))) delete next.aliases
  return next
}
