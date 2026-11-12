// References (Release C, step C2): real-world sources a writer keeps beside the book (a link, a citation, notes).
//
// A reference is stored as a Lore entry with `kind: 'reference'`, so it shares the lore editor's storage, sync,
// backup and restore. It is deliberately NOT part of the world: the store hands the app only in-world lore
// (`inWorldEntries`), so a reference never shows in the Lore room, the manuscript's name highlighting, scene
// links, AI context, the dashboard counts or the readable exports. Backups keep every entry, references included.

export const REFERENCE_KIND = 'reference'
export const MAX_REFERENCE_TITLE = 200
export const MAX_REFERENCE_CITATION = 1000
export const MAX_REFERENCE_URL = 2000

export const isReference = entry => entry?.kind === REFERENCE_KIND
export const inWorldEntries = entries => (Array.isArray(entries) ? entries.filter(entry => !isReference(entry)) : [])
export const referenceEntries = entries => (Array.isArray(entries) ? entries.filter(isReference) : [])

// Only web addresses are kept. Anything else (javascript:, data:, file:, a bare word) becomes an empty string, so a
// stored link can never run code when clicked. A bare "example.com/page" is accepted and made https.
export function safeSourceUrl(value) {
  const raw = typeof value === 'string' ? value.trim().slice(0, MAX_REFERENCE_URL) : ''
  if (!raw || /\s/.test(raw)) return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    if (!url.hostname.includes('.')) return ''
    return url.href
  } catch { return '' }
}

export const sourceHost = value => {
  try { return new URL(safeSourceUrl(value)).hostname.replace(/^www\./, '') } catch { return '' }
}

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// The fields a reference form may set, cleaned. `content` holds the writer's notes (same field lore uses).
export function referenceFields(data = {}) {
  return {
    title: text(data.title, MAX_REFERENCE_TITLE),
    sourceUrl: safeSourceUrl(data.sourceUrl),
    citation: text(data.citation, MAX_REFERENCE_CITATION),
    content: typeof data.content === 'string' ? data.content : '',
    category: text(data.category, 80),
    tags: Array.isArray(data.tags) ? data.tags.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim()).slice(0, 30) : [],
  }
}

export const sortReferences = entries =>
  [...entries].sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }))

// Filters a list by a search string (title, citation, source address, notes, tags).
export function searchReferences(entries, query) {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return entries
  return entries.filter(entry => [entry.title, entry.citation, entry.sourceUrl, entry.content, ...(entry.tags || [])]
    .some(value => String(value || '').toLowerCase().includes(needle)))
}
