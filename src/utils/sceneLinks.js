// Structured scene links (roadmap A4). A scene can say, explicitly, who is in it, where it happens, which
// timeline events it shows, and when in the story it takes place. Nothing is inferred silently: the helpers
// here only *suggest* links from names in the text, and the writer confirms them.
//
// Additive scene fields (the legacy `pov` / `locationTag` strings are never touched):
//   characterIds: string[]          who appears (confirmed)
//   povCharacterId: string | null   point-of-view character
//   locationIds: string[]           where it happens
//   timelineEventIds: string[]      events it depicts
//   storyYear: number | null        in-story year (optional)
//   timeShift: null | 'flashback' | 'flashforward'
//   dismissedLinks: string[]        "type:id" suggestions the writer rejected, so they stop reappearing

import { mentionPattern, namesFor } from './connections'
import { getTimelineYear, parseTimelineYear } from './timelineYear'
import { plainText } from './globalSearch'

export const TIME_SHIFTS = [
  { value: '', label: 'In story order' },
  { value: 'flashback', label: 'Flashback' },
  { value: 'flashforward', label: 'Flash-forward' },
]

const asIds = value => (Array.isArray(value) ? value.filter(id => typeof id === 'string' && id) : [])

export function getSceneLinks(scene) {
  const storyYear = Number.isFinite(scene?.storyYear) ? scene.storyYear : null
  return {
    characterIds: asIds(scene?.characterIds),
    povCharacterId: typeof scene?.povCharacterId === 'string' && scene.povCharacterId ? scene.povCharacterId : null,
    locationIds: asIds(scene?.locationIds),
    timelineEventIds: asIds(scene?.timelineEventIds),
    storyYear,
    timeShift: scene?.timeShift === 'flashback' || scene?.timeShift === 'flashforward' ? scene.timeShift : null,
    dismissed: new Set(asIds(scene?.dismissedLinks)),
  }
}

export const linkKey = (type, id) => `${type}:${id}`
const FIELD_FOR = { character: 'characterIds', location: 'locationIds', timeline: 'timelineEventIds' }

// Patches for updateScene. Each returns a plain object of the fields to change.
export function addLinkPatch(scene, type, id) {
  const field = FIELD_FOR[type]
  if (!field || !id) return {}
  const current = asIds(scene?.[field])
  const patch = current.includes(id) ? {} : { [field]: [...current, id] }
  const dismissed = asIds(scene?.dismissedLinks)
  if (dismissed.includes(linkKey(type, id))) patch.dismissedLinks = dismissed.filter(key => key !== linkKey(type, id))
  return patch
}

export function removeLinkPatch(scene, type, id) {
  const field = FIELD_FOR[type]
  if (!field) return {}
  const patch = { [field]: asIds(scene?.[field]).filter(item => item !== id) }
  // Removing the POV character's link to the scene also clears POV, so POV never points at someone not in it.
  if (type === 'character' && scene?.povCharacterId === id) patch.povCharacterId = null
  return patch
}

export function dismissSuggestionPatch(scene, type, id) {
  const dismissed = asIds(scene?.dismissedLinks)
  const key = linkKey(type, id)
  return dismissed.includes(key) ? {} : { dismissedLinks: [...dismissed, key] }
}

export function setPovPatch(scene, characterId) {
  const patch = { povCharacterId: characterId || null }
  if (characterId) Object.assign(patch, addLinkPatch(scene, 'character', characterId))
  return patch
}

// Everything the writer has not yet confirmed or rejected, found by matching names in the scene text and the
// legacy POV / location strings to project records. Whole words only; names under 3 letters are ignored.
export function suggestSceneLinks(scene, { characters = [], locations = [], timeline = [] } = {}) {
  const links = getSceneLinks(scene)
  const text = [scene?.title, scene?.synopsis, plainText(scene?.content), plainText(scene?.notes)].join(' \n ')
  const out = { characters: [], locations: [], events: [], pov: null }

  const consider = (type, list, confirmed, bucket, minLength = 3) => {
    list.forEach(record => {
      if (!record?.id || confirmed.includes(record.id) || links.dismissed.has(linkKey(type, record.id))) return
      const names = namesFor(type, record).filter(name => name.length >= minLength)
      const pattern = mentionPattern(names)
      if (pattern && pattern.test(text)) bucket.push({ type, id: record.id, name: record.name || record.title || 'Untitled', reason: 'Named in this scene' })
    })
  }
  consider('character', characters, links.characterIds, out.characters)
  consider('location', locations, links.locationIds, out.locations)
  consider('timeline', timeline, links.timelineEventIds, out.events, 6)

  // Legacy "Point of view" text -> a character, if it names exactly one.
  if (!links.povCharacterId && typeof scene?.pov === 'string' && scene.pov.trim()) {
    const wanted = scene.pov.trim().toLowerCase()
    const matches = characters.filter(c => c?.name && c.name.trim().toLowerCase() === wanted)
    if (matches.length === 1 && !links.dismissed.has(linkKey('pov', matches[0].id))) {
      out.pov = { type: 'character', id: matches[0].id, name: matches[0].name, reason: 'Matches the point-of-view text' }
    }
  }
  // Legacy "Location" text -> a location.
  if (typeof scene?.locationTag === 'string' && scene.locationTag.trim()) {
    const wanted = scene.locationTag.trim().toLowerCase()
    const match = locations.find(l => l?.name && l.name.trim().toLowerCase() === wanted)
    if (match && !links.locationIds.includes(match.id) && !links.dismissed.has(linkKey('location', match.id)) && !out.locations.some(item => item.id === match.id)) {
      out.locations.unshift({ type: 'location', id: match.id, name: match.name, reason: 'Matches the location text' })
    }
  }
  return out
}

export const countSuggestions = suggestions =>
  suggestions.characters.length + suggestions.locations.length + suggestions.events.length + (suggestions.pov ? 1 : 0)

// The year a scene takes place: the writer's own storyYear, else the year of the events it depicts when they all
// agree. Returns null when neither is known, or when the linked events span different years (so no rule ever
// guesses which one the scene is "really" set in).
export function sceneStoryYear(scene, timelineById) {
  const links = getSceneLinks(scene)
  if (links.storyYear !== null) return links.storyYear
  const years = links.timelineEventIds
    .map(id => timelineById?.get?.(id))
    .map(event => (event ? getTimelineYear(event) : null))
    .filter(year => Number.isFinite(year))
  return years.length && years.every(year => year === years[0]) ? years[0] : null
}

// Parses what the writer types into the year box. Empty clears it; anything unreadable is rejected.
export function parseStoryYearInput(text) {
  const raw = String(text ?? '').trim()
  if (raw === '') return { ok: true, value: null }
  const year = parseTimelineYear(raw)
  return Number.isFinite(year) ? { ok: true, value: year } : { ok: false, value: null }
}

// Re-points a scene's links at newly created records when a project is imported or restored. `idMap` maps old
// record ids to new ones; a link to a record that was not imported is dropped rather than left dangling at an
// id from another project. Returns only the link fields to set (empty when the scene had none).
export function remapSceneLinks(scene, idMap) {
  const out = {}
  const map = ids => asIds(ids).map(id => idMap?.[id]).filter(Boolean)
  ;['characterIds', 'locationIds', 'timelineEventIds'].forEach(field => { if (Array.isArray(scene?.[field])) out[field] = map(scene[field]) })
  if (typeof scene?.povCharacterId === 'string' && scene.povCharacterId) out.povCharacterId = idMap?.[scene.povCharacterId] || null
  return out
}

// Removes deleted records' ids from every scene's links. Returns only the scenes that changed.
export function scenesWithoutLinks(scenes, { characterIds = [], locationIds = [], timelineEventIds = [] }) {
  const gone = { characterIds: new Set(characterIds), locationIds: new Set(locationIds), timelineEventIds: new Set(timelineEventIds) }
  const changed = []
  ;(scenes || []).forEach(scene => {
    const patch = {}
    Object.keys(gone).forEach(field => {
      if (!gone[field].size) return
      const list = asIds(scene?.[field])
      if (list.some(id => gone[field].has(id))) patch[field] = list.filter(id => !gone[field].has(id))
    })
    if (gone.characterIds.has(scene?.povCharacterId)) patch.povCharacterId = null
    if (Object.keys(patch).length) changed.push({ id: scene.id, patch })
  })
  return changed
}
