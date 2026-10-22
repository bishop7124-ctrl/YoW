import { loadValue, writeItem, removeItem } from '../storage/projectStorage'

// Deletions the cloud has not confirmed yet, kept per account on this device (audit YOW-07). A delete
// that fails (offline, refused, interrupted) used to be forgotten, so the next login loaded the row back
// and the deleted record reappeared. These entries survive reloads: login hides them from the loaded
// data and the delete is retried until the cloud confirms it.
const key = owner => `nf_pendingDeletes:${owner}`

export function loadPendingDeletes(owner) {
  if (!owner) return []
  const stored = loadValue(key(owner), [])
  return Array.isArray(stored) ? stored.filter(entry => entry?.table && entry?.id != null) : []
}

function save(owner, entries) {
  try {
    if (entries.length) writeItem(key(owner), JSON.stringify(entries))
    else removeItem(key(owner))
  } catch { /* a failed local write is reported by the storage layer */ }
}

export function addPendingDelete(owner, table, id) {
  if (!owner) return
  const entries = loadPendingDeletes(owner)
  if (entries.some(entry => entry.table === table && entry.id === id)) return
  save(owner, [...entries, { table, id, at: Date.now() }])
}

export function removePendingDelete(owner, table, id) {
  if (!owner) return
  const entries = loadPendingDeletes(owner)
  const next = entries.filter(entry => !(entry.table === table && entry.id === id))
  if (next.length !== entries.length) save(owner, next)
}

// Collection key (in loaded account data) for each cloud table that can have pending deletes.
const DATA_KEY_BY_TABLE = {
  novels: 'novels', series_items: 'series', characters: 'characters', factions: 'factions',
  locations: 'locations', timeline_events: 'timeline', world_history: 'worldHistory', acts: 'acts',
  chapters: 'chapters', scenes: 'scenes', lore_entries: 'loreEntries', idea_entries: 'ideaEntries',
  maps_data: 'maps', whiteboards_data: 'whiteboards', story_schedule: 'storySchedule',
  rpg_characters: 'rpgCharacters', comic_pages: 'comicPages', comic_panels: 'comicPanels', eras: 'eras',
}

// Loaded cloud data without the records this device has already deleted.
export function withoutPendingDeletes(data, pending) {
  if (!data || !pending?.length) return data
  const hidden = new Map()
  pending.forEach(({ table, id }) => {
    const dataKey = DATA_KEY_BY_TABLE[table]
    if (!dataKey) return
    if (!hidden.has(dataKey)) hidden.set(dataKey, new Set())
    hidden.get(dataKey).add(id)
  })
  const next = { ...data }
  hidden.forEach((ids, dataKey) => {
    if (Array.isArray(data[dataKey])) next[dataKey] = data[dataKey].filter(item => !ids.has(item?.id))
  })
  return next
}
