import { plainText } from './globalSearch'

// "Connections" for a record (roadmap A3): everything in the project that links to it or that it links to,
// plus scenes that mention it by name, and links that point at records that no longer exist.
// Pure and local; reads only the structured data already in the store.

const asArray = value => (Array.isArray(value) ? value : [])
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const GROUP_ORDER = ['Family', 'Relationships', 'Characters', 'Faction', 'Locations', 'Lore', 'Timeline', 'History', 'Schedule', 'Chapters', 'Scenes that mention it']

// Names a record can be found by in prose.
export function namesFor(type, record) {
  const names = [record.name || record.title].filter(Boolean)
  if (type === 'character') asArray(record.keywords).forEach(word => typeof word === 'string' && names.push(word))
  // Other names (Release C, C1b) apply to every record type; nobody has any unless they typed some.
  asArray(record.aliases).forEach(word => typeof word === 'string' && names.push(word))
  return [...new Set(names.map(name => String(name).trim()).filter(name => name.length >= 3))]
}

export function mentionPattern(names) {
  if (!names.length) return null
  // Letters/digits on either side mean "part of another word", so "Ash" does not match "Ashford".
  // (No lookbehind: older iOS Safari cannot parse it, which would break the whole Connections view.)
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${names.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'iu')
}

export function getConnections(store, target) {
  if (!store || !target?.id) return { groups: [], missing: 0, total: 0 }
  const characters = asArray(store.characters), locations = asArray(store.locations), loreEntries = asArray(store.loreEntries)
  const timeline = asArray(store.timeline), worldHistory = asArray(store.worldHistory), factions = asArray(store.factions)
  const schedule = asArray(store.storySchedule), chapters = asArray(store.chapters), scenes = asArray(store.scenes)
  const lookup = {
    character: new Map(characters.map(item => [item.id, item])),
    location: new Map(locations.map(item => [item.id, item])),
    lore: new Map(loreEntries.map(item => [item.id, item])),
    timeline: new Map(timeline.map(item => [item.id, item])),
    faction: new Map(factions.map(item => [item.id, item])),
  }
  const record = lookup[target.type]?.get(target.id)
  if (!record) return { groups: [], missing: 0, total: 0 }

  const groups = new Map()
  let missing = 0
  const seen = new Set()
  const push = (group, type, item, note) => {
    if (!item || (type === target.type && item.id === target.id)) return
    const key = `${group}:${type}:${item.id}`
    if (seen.has(key)) return
    seen.add(key)
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push({ type, id: item.id, title: item.name || item.title || 'Untitled', note: note || '' })
  }
  // Follows a link by id; a link to a deleted record is counted and shown as a placeholder.
  const follow = (group, type, id, note) => {
    if (!id) return
    const item = lookup[type]?.get(id)
    if (item) push(group, type, item, note)
    else {
      missing += 1
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group).push({ type, id: null, title: `Deleted ${type}`, note: note || '', missing: true })
    }
  }
  const reverse = (group, type, list, test, note) => list.forEach(item => { if (test(item)) push(group, type, item, note) })

  if (target.type === 'character') {
    asArray(record.parentIds).forEach(id => follow('Family', 'character', id, 'Parent'))
    asArray(record.childIds).forEach(id => follow('Family', 'character', id, 'Child'))
    asArray(record.spouseIds).forEach(id => follow('Family', 'character', id, 'Partner'))
    asArray(record.relationships).forEach(rel => rel?.targetId && follow('Relationships', 'character', rel.targetId, rel.type || rel.label || ''))
    reverse('Relationships', 'character', characters, other => asArray(other.relationships).some(rel => rel?.targetId === record.id), 'Has a relationship with this character')
    follow('Faction', 'faction', record.factionId)
    asArray(record.locationIds).forEach(id => follow('Locations', 'location', id))
    asArray(record.loreIds).forEach(id => follow('Lore', 'lore', id))
    reverse('Timeline', 'timeline', timeline, event => asArray(event.linkedCharacters).includes(record.id))
    reverse('Schedule', 'schedule', schedule, event => asArray(event.linkedCharacters).includes(record.id))
    reverse('Chapters', 'chapter', chapters, chapter => chapter.povCharacterId === record.id, 'Point of view')
  } else if (target.type === 'location') {
    asArray(record.characterIds).forEach(id => follow('Characters', 'character', id))
    reverse('Characters', 'character', characters, c => asArray(c.locationIds).includes(record.id))
    asArray(record.loreIds).forEach(id => follow('Lore', 'lore', id))
    asArray(record.timelineEventIds).forEach(id => follow('Timeline', 'timeline', id))
    reverse('Timeline', 'timeline', timeline, event => asArray(event.linkedLocations).includes(record.id))
    reverse('Schedule', 'schedule', schedule, event => asArray(event.linkedLocations).includes(record.id))
  } else if (target.type === 'lore') {
    asArray(record.characterIds).forEach(id => follow('Characters', 'character', id))
    reverse('Characters', 'character', characters, c => asArray(c.loreIds).includes(record.id))
    asArray(record.locationIds).forEach(id => follow('Locations', 'location', id))
    reverse('Locations', 'location', locations, l => asArray(l.loreIds).includes(record.id))
    asArray(record.loreIds).forEach(id => follow('Lore', 'lore', id))
    reverse('Lore', 'lore', loreEntries, other => asArray(other.loreIds).includes(record.id))
  } else if (target.type === 'timeline') {
    asArray(record.linkedCharacters).forEach(id => follow('Characters', 'character', id))
    asArray(record.linkedLocations).forEach(id => follow('Locations', 'location', id))
    reverse('History', 'history', worldHistory, entry => entry.timelineId === record.id)
    reverse('Locations', 'location', locations, l => asArray(l.timelineEventIds).includes(record.id))
  } else if (target.type === 'faction') {
    reverse('Characters', 'character', characters, c => c.factionId === record.id, 'Member')
    follow('Characters', 'character', record.leaderId, 'Leader')
    asArray(record.enemyFactionIds).forEach(id => follow('Faction', 'faction', id, 'Enemy'))
    reverse('Faction', 'faction', factions, other => asArray(other.enemyFactionIds).includes(record.id), 'Lists this faction as an enemy')
  }

  // Scenes that mention the record by name (prose, synopsis or notes). Whole words only.
  const pattern = mentionPattern(namesFor(target.type, record))
  if (pattern) {
    scenes.forEach(scene => {
      const text = [scene.title, scene.synopsis, plainText(scene.content), plainText(scene.notes)].join(' \n ')
      if (pattern.test(text)) push('Scenes that mention it', 'scene', scene)
    })
  }

  const ordered = GROUP_ORDER.filter(name => groups.has(name)).map(name => ({ name, items: groups.get(name) }))
  const total = ordered.reduce((sum, group) => sum + group.items.length, 0)
  return { groups: ordered, missing, total }
}

export const CONNECTION_TYPES = new Set(['character', 'location', 'lore', 'timeline', 'faction'])
