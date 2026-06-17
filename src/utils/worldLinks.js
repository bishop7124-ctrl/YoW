/**
 * Cross-reference utilities for worldbuilding entities.
 * All functions are pure — pass in store slices, get back arrays of refs.
 * No mutation, no side effects.
 */

/**
 * Returns all lore entries that reference the given entity id.
 * Checks characterIds, locationIds, and loreIds.
 */
export function loreRefsFor(id, loreEntries = []) {
  return loreEntries.filter(e =>
    e.characterIds?.includes(id) ||
    e.locationIds?.includes(id) ||
    e.loreIds?.includes(id)
  )
}

/**
 * Returns all timeline events that reference the given entity id.
 * Checks linkedCharacters and linkedLocations.
 */
export function timelineRefsFor(id, timeline = []) {
  return timeline.filter(e =>
    e.linkedCharacters?.includes(id) ||
    e.linkedLocations?.includes(id)
  )
}

/**
 * Returns all characters that reference the given entity id.
 * Checks relationships, parentIds, childIds, spouseIds.
 */
export function characterRefsFor(id, characters = []) {
  return characters.filter(c =>
    c.id !== id && (
      c.relationships?.some(r => r.targetId === id) ||
      c.parentIds?.includes(id) ||
      c.childIds?.includes(id) ||
      c.spouseIds?.includes(id)
    )
  )
}

/**
 * Collects all incoming references to a given entity id from across
 * every worldbuilding collection. Returns an object with named sections.
 */
export function allRefsFor(id, { loreEntries = [], timeline = [], characters = [], _loreMap = {} } = {}) {
  return {
    lore: loreRefsFor(id, loreEntries),
    timeline: timelineRefsFor(id, timeline),
    characters: characterRefsFor(id, characters),
  }
}
