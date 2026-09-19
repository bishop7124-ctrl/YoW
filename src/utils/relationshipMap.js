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

// Build one whole-cast graph for the overview canvas. Social facts retain
// their stored direction and type; immediate public family facts collapse to
// one read-only edge per pair so reciprocal Parent/Child labels do not draw
// duplicate lines on top of one another.
export function buildRelationshipGraph(index) {
  const edges = new Map()
  const edgeFor = (a, b) => {
    const [sourceId, targetId] = [a, b].sort()
    const key = JSON.stringify([sourceId, targetId])
    if (!edges.has(key)) edges.set(key, { key, sourceId, targetId, facts: [], family: false })
    return edges.get(key)
  }

  index.socialLinks.forEach(fact => edgeFor(fact.sourceId, fact.targetId).facts.push(fact))
  index.entries.forEach(character => index.connectionsFor(character.id).forEach(connection => {
    if (connection.facts.some(fact => fact.family)) edgeFor(character.id, connection.character.id).family = true
  }))

  return {
    nodes: index.entries,
    edges: [...edges.values()].map(edge => ({
      ...edge,
      labels: [...new Set([
        ...edge.facts.map(fact => fact.label),
        ...(edge.family ? ['Family'] : []),
      ])].sort((a, b) => a.localeCompare(b)),
    })),
  }
}

export const RELATIONSHIP_NETWORK_NODE_SIZE = { width: 112, height: 78 }

// A deterministic degree-first orbital layout keeps dense graphs stable when
// users refocus a character. The spacing guarantees cards do not overlap,
// while the viewport is responsible for fitting, panning and zooming.
export function relationshipNetworkLayout(nodes, edges) {
  const degree = new Map(nodes.map(node => [node.id, 0]))
  edges.forEach(edge => {
    degree.set(edge.sourceId, (degree.get(edge.sourceId) || 0) + 1)
    degree.set(edge.targetId, (degree.get(edge.targetId) || 0) + 1)
  })
  const ordered = [...nodes].sort((a, b) =>
    (degree.get(b.id) || 0) - (degree.get(a.id) || 0)
    || String(a.name || '').localeCompare(String(b.name || ''))
    || a.id.localeCompare(b.id))
  if (!ordered.length) return { nodes: [], edges, size: { width: 760, height: 500, centerX: 380, centerY: 250 } }

  const positions = [{ node: ordered[0], x: 0, y: 0 }]
  let cursor = 1
  let ring = 1
  let outerRadiusX = 0
  let outerRadiusY = 0
  while (cursor < ordered.length) {
    const radiusX = 280 + (ring - 1) * 220
    const radiusY = 220 + (ring - 1) * 210
    const capacity = ring * 12
    const count = Math.min(capacity, ordered.length - cursor)
    const rotation = ring % 2 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / count
    for (let i = 0; i < count; i += 1) {
      const angle = rotation + Math.PI * 2 * i / count
      positions.push({ node: ordered[cursor + i], x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY })
    }
    cursor += count
    outerRadiusX = radiusX
    outerRadiusY = radiusY
    ring += 1
  }

  const marginX = RELATIONSHIP_NETWORK_NODE_SIZE.width / 2 + 56
  const marginY = RELATIONSHIP_NETWORK_NODE_SIZE.height / 2 + 56
  const width = Math.max(760, Math.ceil((outerRadiusX + marginX) * 2))
  const height = Math.max(500, Math.ceil((outerRadiusY + marginY) * 2))
  const centerX = width / 2
  const centerY = height / 2
  return {
    edges,
    size: { width, height, centerX, centerY },
    nodes: positions.map(position => ({
      ...position.node,
      degree: degree.get(position.node.id) || 0,
      x: centerX + position.x,
      y: centerY + position.y,
    })),
  }
}

export const RELATIONSHIP_MAP_SIZE = { width: 900, height: 400, centerX: 450, centerY: 200 }
export const RELATIONSHIP_MAP_NODE_SIZE = { width: 104, height: 96 }
export const RELATIONSHIP_MAP_DENSE_NODE_SIZE = { width: 74, height: 68 }
export const RELATIONSHIP_MAP_FOCUS_SIZE = { width: 120, height: 112 }

// Each density uses a true circle, rather than selecting points from a fixed
// eight-slot layout. That keeps every connector the same length while the
// count-specific radius/rotation prevents compact cards from overlapping.
const RELATIONSHIP_MAP_RADII = [0, 145, 165, 165, 165, 150, 165, 154, 152, 140, 145, 160, 166]
const RELATIONSHIP_MAP_ROTATIONS = [0, -Math.PI / 2, 0, 0, Math.PI / 4, 0, 0, 0, 0, 0, Math.PI / 10, 24.5 * Math.PI / 180, 14.5 * Math.PI / 180]

export function relationshipMapLayout(connections) {
  const dense = connections.length > 8
  const nodeSize = dense ? RELATIONSHIP_MAP_DENSE_NODE_SIZE : RELATIONSHIP_MAP_NODE_SIZE
  const fallbackRadius = connections.length > 12
    ? Math.ceil((Math.hypot(nodeSize.width, nodeSize.height) + 6) / (2 * Math.sin(Math.PI / connections.length)))
    : 0
  const radius = RELATIONSHIP_MAP_RADII[connections.length] || fallbackRadius
  const rotation = RELATIONSHIP_MAP_ROTATIONS[connections.length] || 0
  const margin = Math.max(nodeSize.width, nodeSize.height) / 2 + 10
  const diameter = Math.ceil((radius + margin) * 2)
  const size = connections.length > 12
    ? { width: Math.max(RELATIONSHIP_MAP_SIZE.width, diameter), height: Math.max(RELATIONSHIP_MAP_SIZE.height, diameter) }
    : RELATIONSHIP_MAP_SIZE
  const centerX = size.width / 2
  const centerY = size.height / 2
  return {
    dense,
    size: { ...size, centerX, centerY },
    nodes: connections.map((connection, i) => {
      const angle = rotation + Math.PI * 2 * i / connections.length
      return {
        ...connection,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      }
    }),
  }
}
