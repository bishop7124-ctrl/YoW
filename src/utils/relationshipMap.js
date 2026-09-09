import { getRelType, isCharacterLinkRelType } from '../constants/relationshipTypes.js'
import { buildCharacterIndex } from './characterEntries.js'
import { buildFamilyLookups, deriveFamilyRelationshipsFromLookups } from './familyRelationships.js'

export const relationshipValues = value => value && typeof value === 'object' ? Object.values(value) : []

// Resolve only explicit continuity identities, never names. Missing/hidden
// characters must not be resurrected by following an old relationship ID.
export function buildCharacterAliases(characters, knownCharacters = characters) {
  const aliases = new Map()
  const byRoot = new Map()
  characters.forEach(character => {
    const root = character.syncRootId || character.syncSourceId || character.id
    if (!byRoot.has(root)) byRoot.set(root, new Set())
    byRoot.get(root).add(character.id)
  })
  const register = (alias, id) => {
    if (!alias) return
    if (!aliases.has(alias)) aliases.set(alias, id)
    else if (aliases.get(alias) !== id) aliases.set(alias, null)
  }
  ;[...knownCharacters, ...characters].filter(Boolean).forEach(character => {
    const root = character.syncRootId || character.syncSourceId || character.id
    const candidates = byRoot.get(root)
    if (candidates?.size !== 1) return
    const [id] = candidates
    ;[character.id, root, character.syncSourceId].forEach(alias => register(alias, id))
  })
  characters.forEach(character => aliases.set(character.id, character.id))
  return aliases
}

export function buildRelationshipIndex(characters = [], factions = [], knownCharacters = characters) {
  const base = buildCharacterIndex(characters.filter(character => character?.id), factions)
  const aliases = buildCharacterAliases(base.entries, knownCharacters)
  const resolve = id => aliases.get(id) || null
  const entries = base.entries.map(character => ({
    ...character,
    ...Object.fromEntries(['parentIds', 'childIds', 'spouseIds'].map(field => [field, [...new Set(character[field].map(resolve).filter(id => id && id !== character.id))]])),
    familyLinks: character.familyLinks.map(link => ({
      ...link,
      sourceCharacterId: resolve(link.sourceCharacterId),
      targetCharacterId: resolve(link.targetCharacterId),
    })),
    relationships: character.relationships.map(link => ({ ...link, targetId: resolve(link.targetId) })),
  }))
  const byId = new Map(entries.map(character => [character.id, character]))
  const socialLinks = new Map()
  const adjacency = new Map(entries.map(character => [character.id, []]))
  entries.forEach(character => character.relationships.forEach(link => {
    if (!link.targetId || link.targetId === character.id || !isCharacterLinkRelType(link.type)) return
    const key = JSON.stringify([character.id, link.targetId, link.type])
    if (socialLinks.has(key)) return
    const fact = { ...link, key, sourceId: character.id, targetId: link.targetId, label: getRelType(link.type).label, family: false }
    socialLinks.set(key, fact)
    adjacency.get(character.id).push(fact)
    adjacency.get(link.targetId).push(fact)
  }))
  let familyLookups
  const cache = new Map()
  const connectionsFor = focalId => {
    if (!byId.has(focalId)) return []
    if (cache.has(focalId)) return cache.get(focalId)
    const connected = new Map()
    const add = (otherId, fact) => {
      if (!byId.has(otherId) || otherId === focalId) return
      if (!connected.has(otherId)) connected.set(otherId, { character: byId.get(otherId), facts: [] })
      const facts = connected.get(otherId).facts
      if (!facts.some(existing => existing.key === fact.key)) facts.push(fact)
    }
    adjacency.get(focalId).forEach(fact => add(fact.sourceId === focalId ? fact.targetId : fact.sourceId, {
      ...fact, direction: fact.sourceId === focalId ? 'outgoing' : 'incoming',
    }))
    familyLookups ||= buildFamilyLookups(entries)
    deriveFamilyRelationshipsFromLookups(entries, focalId, { scope: 'immediate' }, familyLookups)
      .filter(fact => fact.confidence === 'direct' || fact.distance === 1)
      .forEach(fact => add(fact.toCharacterId, {
        key: JSON.stringify(['family', focalId, fact.toCharacterId, fact.label]),
        type: 'relative', label: fact.label, family: true, direction: 'family',
      }))
    const connections = [...connected.values()].map(connection => ({
      ...connection,
      facts: connection.facts.sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key)),
      labels: [...new Set(connection.facts.map(fact => fact.label))],
    })).sort((a, b) => a.character.name.localeCompare(b.character.name) || a.character.id.localeCompare(b.character.id))
    cache.set(focalId, connections)
    return connections
  }
  return { ...base, entries, byId, aliases, socialLinks: [...socialLinks.values()], connectionsFor }
}

export function getSocialRelationshipRows(characters = []) {
  const index = buildRelationshipIndex(characters)
  return index.socialLinks.map(fact => ({
    sourceId: fact.sourceId, targetId: fact.targetId, type: fact.type,
    source: index.byId.get(fact.sourceId).name || 'Unnamed character',
    relationship: fact.label,
    target: index.byId.get(fact.targetId).name || 'Unnamed character',
  }))
}

export const RELATIONSHIP_PAGE_SIZE = 8
export const RELATIONSHIP_MAP_SIZE = { width: 1000, height: 720, centerX: 500, centerY: 360 }
export function relationshipMapPage(connections, requestedPage = 0) {
  const pageCount = Math.max(1, Math.ceil(connections.length / RELATIONSHIP_PAGE_SIZE))
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1)
  const visible = connections.slice(page * RELATIONSHIP_PAGE_SIZE, (page + 1) * RELATIONSHIP_PAGE_SIZE)
  return {
    page, pageCount,
    nodes: visible.map((connection, i) => {
      const angle = Math.PI * 2 * i / visible.length - Math.PI / 2
      return { ...connection, x: RELATIONSHIP_MAP_SIZE.centerX + Math.cos(angle) * 350, y: RELATIONSHIP_MAP_SIZE.centerY + Math.sin(angle) * 250 }
    }),
  }
}
