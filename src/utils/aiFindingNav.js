// Matches the free-text names/references AI tool findings mention (characters, locations,
// lore, timeline events, chapters, scenes) against real project entities, so a finding
// can offer a clickable "open" link instead of being inert text.

const norm = (s) => (s || '').toLowerCase().trim()

export function buildFindingNavIndex(store, novelId) {
  const characters = (store.characters  || []).filter(c => c.novelId === novelId)
  const locations   = (store.locations   || []).filter(l => l.novelId === novelId)
  const loreEntries = (store.loreEntries || []).filter(e => e.novelId === novelId)
  const timeline    = (store.timeline    || []).filter(e => e.novelId === novelId)
  const chapters    = (store.chapters    || []).filter(c => c.novelId === novelId)
  const scenes      = (store.scenes      || []).filter(s => s.novelId === novelId)

  const entries = []
  characters.forEach(c => c.name  && entries.push({ type: 'character', id: c.id, name: c.name }))
  locations.forEach(l  => l.name  && entries.push({ type: 'location',  id: l.id, name: l.name }))
  loreEntries.forEach(e => e.title && entries.push({ type: 'lore',      id: e.id, name: e.title }))
  timeline.forEach(e   => e.title && entries.push({ type: 'timeline',  id: e.id, name: e.title }))
  scenes.forEach(s     => s.title && entries.push({ type: 'scene',     id: s.id, name: s.title }))
  chapters.forEach(c   => c.title && entries.push({ type: 'chapter',   id: c.id, name: c.title }))

  // Longest names first so a substring match prefers the more specific entity
  entries.sort((a, b) => b.name.length - a.name.length)
  return entries
}

// Resolve a free-text finding reference (a bare name, or a longer phrase containing one)
// against the index. Exact match first, then "text contains entry name" as a fallback.
// Names under 3 characters are skipped for the substring pass to avoid noisy false matches.
export function resolveFindingRef(index, text) {
  if (!text) return null
  const needle = norm(text)
  if (!needle) return null
  const exact = index.find(e => norm(e.name) === needle)
  if (exact) return exact
  return index.find(e => e.name.length >= 3 && needle.includes(norm(e.name))) || null
}

export function navigateToFindingRef(store, ref) {
  if (!ref) return
  if (ref.type === 'character') {
    store.setSelectedCharacterId(ref.id)
    window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: 'characters' } }))
  } else if (ref.type === 'location') {
    store.setSelectedLocationId(ref.id)
    window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: 'locations' } }))
  } else if (ref.type === 'lore') {
    store.setSelectedLoreEntryId(ref.id)
    window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: 'lore' } }))
  } else if (ref.type === 'timeline') {
    store.setSelectedTimelineEventId(ref.id)
    window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: 'timeline' } }))
  } else if (ref.type === 'scene') {
    store.setSelectedSceneId(ref.id)
    window.dispatchEvent(new CustomEvent('switch-writing'))
  } else if (ref.type === 'chapter') {
    const firstScene = (store.scenes || []).find(s => s.chapterId === ref.id)
    if (firstScene) store.setSelectedSceneId(firstScene.id)
    window.dispatchEvent(new CustomEvent('switch-writing'))
  }
}
