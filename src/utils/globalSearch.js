// Project-wide search (roadmap A3). Pure, local, no network, no AI. Indexes the active project's
// structured records plus scene prose and notes, ranks matches, and builds highlighted snippets.

export const SEARCH_TYPES = {
  character: { label: 'Characters', singular: 'Character', section: 'characters' },
  faction: { label: 'Factions', singular: 'Faction', section: 'factions' },
  location: { label: 'Locations', singular: 'Location', section: 'locations' },
  lore: { label: 'Lore', singular: 'Lore', section: 'lore' },
  timeline: { label: 'Timeline', singular: 'Timeline event', section: 'timeline' },
  history: { label: 'History', singular: 'History', section: 'worldhistory' },
  schedule: { label: 'Schedule', singular: 'Schedule event', section: 'schedule' },
  idea: { label: 'Ideas', singular: 'Idea', section: 'ideas' },
  scene: { label: 'Scenes', singular: 'Scene', section: null },
  chapter: { label: 'Chapters', singular: 'Chapter', section: null },
  act: { label: 'Acts', singular: 'Act', section: null },
  map: { label: 'Maps', singular: 'Map', section: 'map' },
}
export const SEARCH_TYPE_ORDER = ['character', 'faction', 'location', 'lore', 'timeline', 'history', 'schedule', 'idea', 'scene', 'chapter', 'act', 'map']

const MAX_FIELD_CHARS = 200_000
const SNIPPET_RADIUS = 60

// Flatten a field value (string, number, array of strings, array of {title, body, text}) to plain text.
export function flattenText(value, depth = 0) {
  if (value == null || depth > 2) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(item => flattenText(item, depth + 1)).filter(Boolean).join(' · ')
  if (typeof value === 'object') {
    return ['title', 'name', 'label', 'body', 'text', 'content', 'description']
      .map(key => flattenText(value[key], depth + 1)).filter(Boolean).join(' — ')
  }
  return ''
}

// Remove markup that would show up in snippets or give false matches (HTML tags, markdown emphasis).
export function plainText(value) {
  return flattenText(value)
    .slice(0, MAX_FIELD_CHARS)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[*_`#>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const field = (label, value) => ({ label, text: plainText(value) })
const clean = fields => fields.filter(item => item.text)

const byId = list => new Map((list || []).map(item => [item.id, item]))

// Builds the searchable entries for the active project. `enabledSections` (a Set of section ids, or
// null for "all") hides record types the project has switched off.
export function buildSearchIndex(store, { enabledSections = null } = {}) {
  const projectId = store?.activeNovelId ?? store?.activeNovel?.id ?? null
  const inProject = list => (Array.isArray(list) ? list : []).filter(item => item && (!projectId || !item.novelId || item.novelId === projectId))
  const allowed = type => {
    const section = SEARCH_TYPES[type].section
    return !section || !enabledSections || enabledSections.has(section)
  }
  const entries = []
  const add = (type, record, title, subtitle, fields, extra = {}) => {
    if (!record?.id || !allowed(type)) return
    const entry = {
      key: `${type}:${record.id}`, type, id: record.id, title: plainText(title) || `Untitled ${SEARCH_TYPES[type].singular.toLowerCase()}`,
      subtitle: plainText(subtitle), fields: clean(fields), ...extra,
    }
    // Lower-cased once here so a keystroke does not re-lowercase every scene's full text.
    entry.haystack = [entry.title, entry.subtitle, ...entry.fields.map(item => item.text)].join(' \n ').toLowerCase()
    entries.push(entry)
  }

  inProject(store.characters).forEach(c => add('character', c, c.name, c.titleJob || c.role || c.occupation, [
    field('Role', c.role), field('Occupation', c.occupation), field('Species', c.species), field('Bio', c.bio),
    field('Background', c.background), field('Notes', c.notes), field('Traits', c.traits), field('Tags', c.tags),
    field('Keywords', c.keywords), field('Goals', [c.internalGoal, c.externalGoal]),
  ]))
  inProject(store.factions).forEach(f => add('faction', f, f.name, '', [field('Description', f.description), field('Tags', f.tags)]))
  inProject(store.locations).forEach(l => add('location', l, l.name, l.category, [
    field('Description', l.description), field('Tags', l.tags),
  ]))
  inProject(store.loreEntries).forEach(e => add('lore', e, e.title, e.category, [field('Entry', e.content), field('Tags', e.tags)]))
  inProject(store.timeline).forEach(e => add('timeline', e, e.title, e.date, [field('Description', e.description), field('Tags', e.tags)]))
  inProject(store.worldHistory).forEach(e => add('history', e, e.title, e.dateRange, [field('Entry', e.content), field('Tags', e.tags)]))
  inProject(store.storySchedule).forEach(e => add('schedule', e, e.title, '', [field('Description', e.description), field('Tags', e.tags)]))
  inProject(store.ideaEntries).forEach(e => add('idea', e, e.title, e.group || e.status, [
    field('Description', e.description), field('Body', e.body), field('Tags', e.tags),
  ]))
  inProject(store.maps).forEach(m => add('map', m, m.name, '', [field('Notes', m.notes)]))

  const chapters = inProject(store.chapters)
  const chapterById = byId(chapters)
  inProject(store.acts).forEach(a => add('act', a, a.title, '', [field('Synopsis', a.synopsis)]))
  chapters.forEach(c => add('chapter', c, c.title, '', [field('Synopsis', c.synopsis)]))
  inProject(store.scenes).forEach(s => add('scene', s, s.title, chapterById.get(s.chapterId)?.title, [
    field('Synopsis', s.synopsis), field('Notes', s.notes), field('Text', s.content),
  ], { chapterId: s.chapterId }))
  return entries
}

const norm = text => text.toLowerCase()
const NAME_RECORD_BONUS = { character: 20, faction: 15, location: 15, lore: 10 }

// How well the title matches: exact > starts with > a word starts with > contains. 0 = no match.
function titleScore(title, q) {
  const t = norm(title)
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  if (t.split(/[\s\-–—_,.:;()]+/).some(word => word.startsWith(q))) return 65
  if (t.includes(q)) return 50
  return 0
}

// Builds {text, ranges:[[start,end]]} around the first match of any term in `text`.
export function makeSnippet(text, terms) {
  const lower = norm(text)
  let first = -1
  for (const term of terms) {
    const at = lower.indexOf(term)
    if (at !== -1 && (first === -1 || at < first)) first = at
  }
  if (first === -1) return null
  const start = Math.max(0, first - SNIPPET_RADIUS)
  const end = Math.min(text.length, first + SNIPPET_RADIUS * 2)
  const slice = text.slice(start, end)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  const display = prefix + slice + suffix
  const lowerDisplay = norm(display)
  const ranges = []
  terms.forEach(term => {
    let from = 0
    while (from < lowerDisplay.length) {
      const at = lowerDisplay.indexOf(term, from)
      if (at === -1) break
      ranges.push([at, at + term.length])
      from = at + term.length
    }
  })
  ranges.sort((a, b) => a[0] - b[0])
  const merged = []
  ranges.forEach(range => {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
  })
  return { text: display, ranges: merged }
}

export function highlightParts(text, terms) {
  if (!text) return []
  const snippet = makeSnippet(text, terms)
  if (!snippet) return [{ text, match: false }]
  const parts = []
  let at = 0
  snippet.ranges.forEach(([from, to]) => {
    if (from > at) parts.push({ text: snippet.text.slice(at, from), match: false })
    parts.push({ text: snippet.text.slice(from, to), match: true })
    at = to
  })
  if (at < snippet.text.length) parts.push({ text: snippet.text.slice(at), match: false })
  return parts
}

export function parseQuery(query) {
  const phrase = String(query || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const terms = phrase.split(' ').filter(Boolean)
  return { phrase, terms }
}

// Returns ranked results: [{ ...entry, score, matchField, snippet }]. Every term must appear somewhere in
// the entry (title, subtitle or any field), so "red tower" finds "Tower of the Red Pines" but not unrelated items.
export function searchIndex(entries, query, { types = null, limit = 80 } = {}) {
  const { phrase, terms } = parseQuery(query)
  if (!phrase) return []
  const results = []
  for (const entry of entries) {
    if (types && !types.includes(entry.type)) continue
    const haystack = entry.haystack ?? norm([entry.title, entry.subtitle, ...entry.fields.map(item => item.text)].join(' \n '))
    if (!terms.every(term => haystack.includes(term))) continue

    let score = titleScore(entry.title, phrase)
    if (!score) {
      const perTerm = terms.map(term => titleScore(entry.title, term))
      score = perTerm.every(Boolean) ? Math.min(...perTerm) - 10 : 0
    }
    // Records people look up by name (characters, places, factions, lore) outrank events and notes that
    // merely start with the same word, so "garrick" lists the character before "Garrick ambushes...".
    if (score >= 50 && score < 100) score = Math.min(99, score + (NAME_RECORD_BONUS[entry.type] || 0))
    let matchField = null
    if (!score) {
      for (const item of entry.fields) {
        if (terms.some(term => norm(item.text).includes(term))) { matchField = item; break }
      }
      score = matchField ? (matchField.label === 'Text' ? 10 : 25) : 5
    }
    const hit = matchField || (score < 50 ? entry.fields.find(item => terms.some(term => norm(item.text).includes(term))) : null)
    results.push({
      ...entry,
      score,
      matchField: hit?.label || null,
      snippet: hit ? highlightParts(hit.text, terms) : null,
    })
  }
  results.sort((a, b) => b.score - a.score || SEARCH_TYPE_ORDER.indexOf(a.type) - SEARCH_TYPE_ORDER.indexOf(b.type) || a.title.localeCompare(b.title))
  return results.slice(0, limit)
}

export function countByType(results) {
  const counts = {}
  results.forEach(result => { counts[result.type] = (counts[result.type] || 0) + 1 })
  return counts
}
