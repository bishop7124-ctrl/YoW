const FAMILY_LINK_KINDS = new Set(['parent_child', 'sibling', 'partner', 'guardian'])
const FAMILY_LINK_TYPES = new Set(['biological', 'adoptive', 'step', 'chosen', 'legal', 'magical', 'unknown'])
const FAMILY_LINK_STATUSES = new Set(['active', 'former', 'secret', 'disputed', 'hidden'])
const FAMILY_SCOPES = new Set(['direct', 'immediate', 'extended', 'full'])

const toArray = value => Array.isArray(value) ? value : []

const fallbackId = (parts) => `family-${parts.filter(Boolean).join('-')}`

export const FAMILY_FILTER_DEFAULTS = {
  scope: 'extended',
  bloodOnly: false,
  includePartners: true,
  includeAdoption: true,
  includeStep: true,
  includeGuardians: true,
  includeDeceased: true,
  showHidden: false,
}

export const makeFamilyLink = ({
  id,
  sourceCharacterId,
  targetCharacterId,
  kind,
  type = 'biological',
  status = 'active',
  direction,
  startDate = '',
  endDate = '',
  knownPublicly = true,
  notes = '',
}) => ({
  id: id || fallbackId([sourceCharacterId, targetCharacterId, kind, direction, Date.now()]),
  sourceCharacterId,
  targetCharacterId,
  kind: FAMILY_LINK_KINDS.has(kind) ? kind : 'parent_child',
  type: FAMILY_LINK_TYPES.has(type) ? type : 'biological',
  status: FAMILY_LINK_STATUSES.has(status) ? status : 'active',
  ...(direction ? { direction } : {}),
  ...(startDate ? { startDate } : {}),
  ...(endDate ? { endDate } : {}),
  knownPublicly,
  ...(notes ? { notes } : {}),
})

const normalizeExplicitLink = (link) => {
  if (!link?.sourceCharacterId || !link?.targetCharacterId || link.sourceCharacterId === link.targetCharacterId || !FAMILY_LINK_KINDS.has(link.kind)) return null
  return makeFamilyLink({
    ...link,
    id: link.id || fallbackId([
      'explicit', link.sourceCharacterId, link.targetCharacterId, link.kind,
      link.direction, link.type, link.status,
    ]),
  })
}

const getOrientedLinkIds = (link) => {
  if (link.kind === 'parent_child') {
    return link.direction === 'target_is_parent'
      ? [link.targetCharacterId, link.sourceCharacterId]
      : [link.sourceCharacterId, link.targetCharacterId]
  }
  if (link.kind === 'guardian') {
    return link.direction === 'target_is_parent'
      ? [link.targetCharacterId, link.sourceCharacterId]
      : [link.sourceCharacterId, link.targetCharacterId]
  }
  return [link.sourceCharacterId, link.targetCharacterId].sort()
}

const familyLinkFactKey = (link) => {
  const [firstId, secondId] = getOrientedLinkIds(link)
  return [link.kind, firstId, secondId, link.type, link.status].join('|')
}

export function getFamilyLinks(characters = []) {
  const byId = new Set(characters.map(character => character.id))
  const links = []
  const indexByFact = new Map()
  const seenIds = new Set()
  const add = (link) => {
    const normalized = normalizeExplicitLink(link)
    if (!normalized || !byId.has(normalized.sourceCharacterId) || !byId.has(normalized.targetCharacterId)) return
    if (seenIds.has(normalized.id)) return
    const factKey = familyLinkFactKey(normalized)
    const existingIndex = indexByFact.get(factKey)
    if (existingIndex !== undefined) {
      // Reciprocal legacy fields and imported structured records often describe
      // the same fact with different IDs. Keep one edge and preserve the most
      // restrictive visibility so a duplicate cannot accidentally expose it.
      const existing = links[existingIndex]
      links[existingIndex] = {
        ...existing,
        knownPublicly: existing.knownPublicly !== false && normalized.knownPublicly !== false,
        ...(!existing.startDate && normalized.startDate ? { startDate: normalized.startDate } : {}),
        ...(!existing.endDate && normalized.endDate ? { endDate: normalized.endDate } : {}),
        ...(!existing.notes && normalized.notes ? { notes: normalized.notes } : {}),
      }
      seenIds.add(normalized.id)
      return
    }
    indexByFact.set(factKey, links.length)
    seenIds.add(normalized.id)
    links.push(normalized)
  }

  // Prefer structured facts when the same relationship is also represented by
  // reciprocal legacy parent/child/spouse arrays.
  characters.forEach(character => {
    toArray(character.familyLinks).forEach(add)
  })

  characters.forEach(character => {
    toArray(character.parentIds).forEach(parentId => add({
      id: fallbackId(['legacy-parent', parentId, character.id]),
      sourceCharacterId: parentId,
      targetCharacterId: character.id,
      kind: 'parent_child',
      type: 'biological',
      status: 'active',
      direction: 'source_is_parent',
      knownPublicly: true,
    }))

    toArray(character.childIds).forEach(childId => add({
      id: fallbackId(['legacy-child', character.id, childId]),
      sourceCharacterId: character.id,
      targetCharacterId: childId,
      kind: 'parent_child',
      type: 'biological',
      status: 'active',
      direction: 'source_is_parent',
      knownPublicly: true,
    }))

    toArray(character.spouseIds).forEach(spouseId => {
      const ordered = [character.id, spouseId].sort()
      add({
        id: fallbackId(['legacy-partner', ...ordered]),
        sourceCharacterId: ordered[0],
        targetCharacterId: ordered[1],
        kind: 'partner',
        type: 'legal',
        status: 'active',
        knownPublicly: true,
      })
    })
  })

  return links
}

const shouldIncludeLink = (link, filters = FAMILY_FILTER_DEFAULTS) => {
  if (!filters.showHidden && (link.status === 'secret' || link.status === 'hidden' || link.knownPublicly === false)) return false
  if (filters.bloodOnly && link.type !== 'biological') return false
  if (!filters.includeAdoption && link.type === 'adoptive') return false
  if (!filters.includeStep && link.type === 'step') return false
  if (!filters.includeGuardians && link.kind === 'guardian') return false
  if (!filters.includePartners && link.kind === 'partner') return false
  return true
}

export function buildFamilyLookups(characters = [], filters = FAMILY_FILTER_DEFAULTS) {
  const mergedFilters = { ...FAMILY_FILTER_DEFAULTS, ...filters }
  const allLinks = getFamilyLinks(characters)
  const links = allLinks.filter(link => shouldIncludeLink(link, mergedFilters))
  const allLinkedCharacterIds = new Set(allLinks.flatMap(link => [link.sourceCharacterId, link.targetCharacterId]))
  const parentsByChild = new Map()
  const childrenByParent = new Map()
  const siblingsByCharacter = new Map()
  const partnersByCharacter = new Map()
  const guardiansByWard = new Map()
  const familyByCharacter = new Map()
  const linksById = new Map()
  const addPair = (map, from, to, link) => {
    if (!map.has(from)) map.set(from, [])
    if (!map.get(from).some(item => item.id === to && item.link.id === link.id)) map.get(from).push({ id: to, link })
  }

  links.forEach(link => {
    linksById.set(link.id, link)
    addPair(familyByCharacter, link.sourceCharacterId, link.targetCharacterId, link)
    addPair(familyByCharacter, link.targetCharacterId, link.sourceCharacterId, link)
    if (link.kind === 'parent_child') {
      const sourceIsParent = link.direction !== 'target_is_parent'
      const parentId = sourceIsParent ? link.sourceCharacterId : link.targetCharacterId
      const childId = sourceIsParent ? link.targetCharacterId : link.sourceCharacterId
      addPair(parentsByChild, childId, parentId, link)
      addPair(childrenByParent, parentId, childId, link)
    } else if (link.kind === 'sibling') {
      addPair(siblingsByCharacter, link.sourceCharacterId, link.targetCharacterId, link)
      addPair(siblingsByCharacter, link.targetCharacterId, link.sourceCharacterId, link)
    } else if (link.kind === 'partner') {
      addPair(partnersByCharacter, link.sourceCharacterId, link.targetCharacterId, link)
      addPair(partnersByCharacter, link.targetCharacterId, link.sourceCharacterId, link)
    } else if (link.kind === 'guardian') {
      const guardianId = link.direction === 'target_is_parent' ? link.targetCharacterId : link.sourceCharacterId
      const wardId = link.direction === 'target_is_parent' ? link.sourceCharacterId : link.targetCharacterId
      addPair(guardiansByWard, wardId, guardianId, link)
    }
  })

  // Derive sibling pairs per parent instead of comparing every child against
  // every other child in the project. Work now scales with actual family size.
  const sharedParentsBySiblingPair = new Map()
  childrenByParent.forEach((children, parentId) => {
    const uniqueChildren = [...new Map(children.map(child => [child.id, child])).values()]
    for (let leftIndex = 0; leftIndex < uniqueChildren.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < uniqueChildren.length; rightIndex += 1) {
        const [left, right] = [uniqueChildren[leftIndex], uniqueChildren[rightIndex]].sort((a, b) => a.id.localeCompare(b.id))
        const key = `${left.id}|${right.id}`
        if (!sharedParentsBySiblingPair.has(key)) sharedParentsBySiblingPair.set(key, { leftId: left.id, rightId: right.id, parents: [] })
        sharedParentsBySiblingPair.get(key).parents.push({ parentId, leftLink: left.link, rightLink: right.link })
      }
    }
  })
  sharedParentsBySiblingPair.forEach(({ leftId, rightId, parents }) => {
    const biological = parents.filter(parent => parent.leftLink.type === 'biological' && parent.rightLink.type === 'biological')
    const sourceLinks = parents.flatMap(parent => [parent.leftLink, parent.rightLink])
    const type = biological.length ? 'biological' : parents[0].leftLink.type
    const status = sourceLinks.some(link => link.status === 'disputed')
      ? 'disputed'
      : sourceLinks.some(link => link.status === 'secret' || link.status === 'hidden') ? 'secret' : 'active'
    const link = {
      id: fallbackId(['derived-sibling', leftId, rightId]),
      sourceCharacterId: leftId,
      targetCharacterId: rightId,
      kind: 'sibling',
      type,
      status,
      knownPublicly: sourceLinks.every(sourceLink => sourceLink.knownPublicly !== false),
      sourceLinkIds: [...new Set(sourceLinks.map(sourceLink => sourceLink.id))],
    }
    addPair(siblingsByCharacter, leftId, rightId, link)
    addPair(siblingsByCharacter, rightId, leftId, link)
  })

  return {
    links,
    linksById,
    allLinkedCharacterIds,
    parentsByChild,
    childrenByParent,
    siblingsByCharacter,
    partnersByCharacter,
    guardiansByWard,
    familyByCharacter,
  }
}

const typePrefix = (type, { forSibling = false } = {}) => {
  if (type === 'adoptive') return forSibling ? 'Adoptive ' : 'Adoptive '
  if (type === 'step') return 'Step-'
  if (type === 'chosen') return 'Chosen '
  if (type === 'magical') return 'Magical '
  if (type === 'unknown') return 'Possible '
  return ''
}

const directLabel = (label, link) => {
  if (link.status === 'former' && label.toLowerCase().includes('partner')) return 'Former partner'
  if (link.status === 'disputed') return `Disputed ${label.toLowerCase()}`
  return `${typePrefix(link.type)}${label}`
}

const addRelationship = (map, relationship) => {
  const key = `${relationship.fromCharacterId}:${relationship.toCharacterId}:${relationship.label}`
  if (!map.has(key)) map.set(key, relationship)
}

const ancestorLabel = (distance, direction, linkType) => {
  const prefix = typePrefix(linkType)
  if (distance === 1) return direction === 'up' ? `${prefix}Parent` : `${prefix}Child`
  if (distance === 2) return direction === 'up' ? `${prefix}Grandparent` : `${prefix}Grandchild`
  const greats = `${'Great-'.repeat(Math.max(1, distance - 2))}`
  return direction === 'up' ? `${prefix}${greats}grandparent` : `${prefix}${greats}grandchild`
}

function walkAncestors(focusId, lookups, maxDistance = 3) {
  const found = []
  const queue = (lookups.parentsByChild.get(focusId) || []).map(parent => ({
    id: parent.id,
    distance: 1,
    via: [],
    links: [parent.link],
    type: parent.link.type,
  }))
  const seen = new Set([focusId])
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const item = queue[cursor]
    if (seen.has(item.id) || item.distance > maxDistance) continue
    seen.add(item.id)
    found.push(item)
    ;(lookups.parentsByChild.get(item.id) || []).forEach(parent => queue.push({
      id: parent.id,
      distance: item.distance + 1,
      via: [...item.via, item.id],
      links: [...item.links, parent.link],
      type: item.type === 'biological' ? parent.link.type : item.type,
    }))
  }
  return found
}

function walkDescendants(focusId, lookups, maxDistance = 3) {
  const found = []
  const queue = (lookups.childrenByParent.get(focusId) || []).map(child => ({
    id: child.id,
    distance: 1,
    via: [],
    links: [child.link],
    type: child.link.type,
  }))
  const seen = new Set([focusId])
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const item = queue[cursor]
    if (seen.has(item.id) || item.distance > maxDistance) continue
    seen.add(item.id)
    found.push(item)
    ;(lookups.childrenByParent.get(item.id) || []).forEach(child => queue.push({
      id: child.id,
      distance: item.distance + 1,
      via: [...item.via, item.id],
      links: [...item.links, child.link],
      type: item.type === 'biological' ? child.link.type : item.type,
    }))
  }
  return found
}

export function getFamilyScopeCharacterIds(lookups, focusId, scope = FAMILY_FILTER_DEFAULTS.scope) {
  const normalizedScope = FAMILY_SCOPES.has(scope) ? scope : FAMILY_FILTER_DEFAULTS.scope
  const included = new Set(focusId ? [focusId] : [])
  if (!focusId) return included

  if (normalizedScope === 'direct') {
    const queue = [focusId]
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const id = queue[cursor]
      const relatives = [
        ...(lookups.parentsByChild.get(id) || []),
        ...(lookups.childrenByParent.get(id) || []),
      ]
      relatives.forEach(relative => {
        if (included.has(relative.id)) return
        included.add(relative.id)
        queue.push(relative.id)
      })
    }
    return included
  }

  const maxDistance = normalizedScope === 'immediate' ? 1 : normalizedScope === 'extended' ? 3 : Infinity
  const queue = [{ id: focusId, distance: 0 }]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const item = queue[cursor]
    if (item.distance >= maxDistance) continue
    const relatives = [
      ...(lookups.familyByCharacter.get(item.id) || []),
      ...(lookups.siblingsByCharacter.get(item.id) || []),
    ]
    relatives.forEach(relative => {
      if (included.has(relative.id)) return
      included.add(relative.id)
      queue.push({ id: relative.id, distance: item.distance + 1 })
    })
  }
  return included
}

export function deriveFamilyRelationshipsFromLookups(characters = [], focusId, filters = FAMILY_FILTER_DEFAULTS, lookups = buildFamilyLookups(characters, filters)) {
  if (!focusId) return []
  const mergedFilters = { ...FAMILY_FILTER_DEFAULTS, ...filters }
  const scope = FAMILY_SCOPES.has(mergedFilters.scope) ? mergedFilters.scope : FAMILY_FILTER_DEFAULTS.scope
  const byId = new Map(characters.map(character => [character.id, character]))
  const relationships = new Map()
  const lineageDistance = scope === 'immediate' ? 1 : scope === 'extended' ? 3 : characters.length + 1

  walkAncestors(focusId, lookups, lineageDistance).forEach(item => addRelationship(relationships, {
    fromCharacterId: focusId,
    toCharacterId: item.id,
    label: ancestorLabel(item.distance, 'up', item.type),
    category: 'ancestor',
    distance: item.distance,
    viaCharacterIds: item.via,
    sourceLinkIds: item.links.map(link => link.id),
    confidence: item.distance === 1 ? 'direct' : 'derived',
  }))

  walkDescendants(focusId, lookups, lineageDistance).forEach(item => addRelationship(relationships, {
    fromCharacterId: focusId,
    toCharacterId: item.id,
    label: ancestorLabel(item.distance, 'down', item.type),
    category: 'descendant',
    distance: item.distance,
    viaCharacterIds: item.via,
    sourceLinkIds: item.links.map(link => link.id),
    confidence: item.distance === 1 ? 'direct' : 'derived',
  }))

  if (scope !== 'direct') (lookups.siblingsByCharacter.get(focusId) || []).forEach(sibling => {
    const focusParents = lookups.parentsByChild.get(focusId) || []
    const siblingParents = lookups.parentsByChild.get(sibling.id) || []
    const sharedBio = focusParents.filter(parent => parent.link.type === 'biological' && siblingParents.some(other => other.id === parent.id && other.link.type === 'biological'))
    const label = sharedBio.length === 1 ? 'Half-sibling' : directLabel('Sibling', sibling.link)
    addRelationship(relationships, {
      fromCharacterId: focusId,
      toCharacterId: sibling.id,
      label,
      category: sibling.link.type === 'step' ? 'step' : sibling.link.type === 'adoptive' ? 'adoptive' : 'sibling',
      distance: 1,
      viaCharacterIds: sharedBio.map(parent => parent.id),
      sourceLinkIds: sibling.link.sourceLinkIds || [sibling.link.id],
      confidence: sibling.link.id.startsWith('derived') ? 'derived' : 'direct',
    })
  })

  if (scope !== 'direct') (lookups.partnersByCharacter.get(focusId) || []).forEach(partner => addRelationship(relationships, {
    fromCharacterId: focusId,
    toCharacterId: partner.id,
    label: directLabel('Partner', partner.link),
    category: 'partner',
    distance: 1,
    viaCharacterIds: [],
    sourceLinkIds: [partner.link.id],
    confidence: 'direct',
  }))

  if (scope !== 'direct') (lookups.guardiansByWard.get(focusId) || []).forEach(guardian => addRelationship(relationships, {
    fromCharacterId: focusId,
    toCharacterId: guardian.id,
    label: directLabel('Guardian', guardian.link),
    category: 'guardian',
    distance: 1,
    viaCharacterIds: [],
    sourceLinkIds: [guardian.link.id],
    confidence: 'direct',
  }))

  if (scope !== 'direct') lookups.guardiansByWard.forEach((guardians, wardId) => {
    guardians.filter(guardian => guardian.id === focusId).forEach(guardian => addRelationship(relationships, {
      fromCharacterId: focusId,
      toCharacterId: wardId,
      label: directLabel('Ward', guardian.link),
      category: 'guardian',
      distance: 1,
      viaCharacterIds: [],
      sourceLinkIds: [guardian.link.id],
      confidence: 'direct',
    }))
  })

  const focusParents = lookups.parentsByChild.get(focusId) || []
  if (scope === 'extended' || scope === 'full') focusParents.forEach(parent => {
    ;(lookups.siblingsByCharacter.get(parent.id) || []).forEach(parentSibling => {
      if (parentSibling.id === focusId || !byId.has(parentSibling.id)) return
      addRelationship(relationships, {
        fromCharacterId: focusId,
        toCharacterId: parentSibling.id,
        label: `${typePrefix(parentSibling.link.type)}Parent's sibling`,
        category: parentSibling.link.type === 'step' ? 'step' : 'aunt_uncle',
        distance: 2,
        viaCharacterIds: [parent.id],
        sourceLinkIds: [parent.link.id, parentSibling.link.id],
        confidence: 'derived',
      })
    })
  })

  if (scope === 'extended' || scope === 'full') (lookups.siblingsByCharacter.get(focusId) || []).forEach(sibling => {
    ;(lookups.childrenByParent.get(sibling.id) || []).forEach(child => {
      if (child.id === focusId) return
      addRelationship(relationships, {
        fromCharacterId: focusId,
        toCharacterId: child.id,
        label: `${typePrefix(sibling.link.type)}Sibling's child`,
        category: sibling.link.type === 'step' ? 'step' : 'niece_nephew',
        distance: 2,
        viaCharacterIds: [sibling.id],
        sourceLinkIds: [sibling.link.id, child.link.id],
        confidence: 'derived',
      })
    })
  })

  if (scope === 'extended' || scope === 'full') focusParents.forEach(parent => {
    ;(lookups.siblingsByCharacter.get(parent.id) || []).forEach(parentSibling => {
      ;(lookups.childrenByParent.get(parentSibling.id) || []).forEach(cousin => {
        if (cousin.id === focusId) return
        addRelationship(relationships, {
          fromCharacterId: focusId,
          toCharacterId: cousin.id,
          label: 'First cousin',
          category: 'cousin',
          distance: 3,
          viaCharacterIds: [parent.id, parentSibling.id],
          sourceLinkIds: [parent.link.id, parentSibling.link.id, cousin.link.id],
          confidence: 'derived',
        })
      })
    })
  })

  const partnerParents = (scope === 'extended' || scope === 'full') ? (lookups.parentsByChild.get(focusId) || [])
    .flatMap(parent => lookups.partnersByCharacter.get(parent.id) || [])
    .filter(partner => !focusParents.some(parent => parent.id === partner.id))
    : []
  partnerParents.forEach(stepParent => {
    ;(lookups.childrenByParent.get(stepParent.id) || []).forEach(stepSibling => {
      if (stepSibling.id === focusId) return
      const sharesParent = focusParents.some(parent => (lookups.parentsByChild.get(stepSibling.id) || []).some(other => other.id === parent.id))
      if (sharesParent) return
      addRelationship(relationships, {
        fromCharacterId: focusId,
        toCharacterId: stepSibling.id,
        label: 'Step-sibling',
        category: 'step',
        distance: 2,
        viaCharacterIds: [stepParent.id],
        sourceLinkIds: [stepParent.link.id, stepSibling.link.id],
        confidence: 'derived',
      })
    })
  })

  return [...relationships.values()]
    .filter(relationship => {
      const character = byId.get(relationship.toCharacterId)
      return character && (mergedFilters.includeDeceased || !character.deathDate)
    })
    .sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label) || (byId.get(a.toCharacterId)?.name || '').localeCompare(byId.get(b.toCharacterId)?.name || ''))
}

export function deriveFamilyRelationships(characters = [], focusId, filters = FAMILY_FILTER_DEFAULTS) {
  const lookups = buildFamilyLookups(characters, filters)
  return deriveFamilyRelationshipsFromLookups(characters, focusId, filters, lookups)
}

export function groupDerivedFamilyRelationships(derived = []) {
  const groupMap = {
    parents: ['ancestor'],
    partners: ['partner'],
    children: ['descendant'],
    siblings: ['sibling'],
    extended: ['aunt_uncle', 'niece_nephew', 'cousin', 'step', 'adoptive'],
    guardians: ['guardian'],
  }
  return Object.fromEntries(Object.entries(groupMap).map(([key, categories]) => [
    key,
    derived.filter(relationship => {
      if (key === 'parents') return relationship.category === 'ancestor' && relationship.distance === 1
      if (key === 'children') return relationship.category === 'descendant' && relationship.distance === 1
      if (key === 'siblings') return relationship.distance === 1 && relationship.label.toLowerCase().includes('sibling')
      if (key === 'extended') return !relationship.label.toLowerCase().includes('sibling') && (relationship.distance > 1 || categories.includes(relationship.category))
      return categories.includes(relationship.category)
    }),
  ]))
}

export function groupFamilyRelationships(characters = [], focusId, filters = FAMILY_FILTER_DEFAULTS) {
  return groupDerivedFamilyRelationships(deriveFamilyRelationships(characters, focusId, filters))
}

export function familyRelationshipMapEdges(characters = [], focusId, filters = FAMILY_FILTER_DEFAULTS) {
  return deriveFamilyRelationships(characters, focusId, { ...filters, scope: 'immediate' })
    .filter(relationship => relationship.confidence === 'direct' || relationship.distance === 1)
    .map(relationship => ({
      targetId: relationship.toCharacterId,
      type: 'relative',
      label: relationship.label,
      family: true,
      category: relationship.category,
    }))
}

const directLabelsForLink = (link) => {
  if (link.kind === 'parent_child') {
    const sourceIsParent = link.direction !== 'target_is_parent'
    return sourceIsParent
      ? [directLabel('Parent', link), directLabel('Child', link)]
      : [directLabel('Child', link), directLabel('Parent', link)]
  }
  if (link.kind === 'guardian') {
    const sourceIsGuardian = link.direction !== 'target_is_parent'
    return sourceIsGuardian
      ? [directLabel('Guardian', link), directLabel('Ward', link)]
      : [directLabel('Ward', link), directLabel('Guardian', link)]
  }
  const label = directLabel(link.kind === 'partner' ? 'Partner' : 'Sibling', link)
  return [label, label]
}

export function getDirectFamilyRelationshipRows(characters = [], filters = FAMILY_FILTER_DEFAULTS) {
  const byId = new Map(characters.map(character => [character.id, character]))
  return buildFamilyLookups(characters, filters).links.map(link => {
    const [sourceLabel, targetLabel] = directLabelsForLink(link)
    return {
      id: link.id,
      sourceCharacterId: link.sourceCharacterId,
      sourceName: byId.get(link.sourceCharacterId)?.name || 'Unnamed character',
      sourceLabel,
      targetCharacterId: link.targetCharacterId,
      targetName: byId.get(link.targetCharacterId)?.name || 'Unnamed character',
      targetLabel,
      kind: link.kind,
      type: link.type,
      status: link.status,
    }
  })
}

export function isDuplicateFamilyLink(characters = [], newLink) {
  const normalized = normalizeExplicitLink(newLink)
  if (!normalized) return false
  const factKey = familyLinkFactKey(normalized)
  return getFamilyLinks(characters).some(link => familyLinkFactKey(link) === factKey)
}

export function validateFamilyLink(characters = [], newLink) {
  const warnings = []
  const normalized = normalizeExplicitLink(newLink)
  if (!normalized) return ['Choose two different characters for this family fact.']

  const lookups = buildFamilyLookups(characters, { ...FAMILY_FILTER_DEFAULTS, showHidden: true })
  const links = lookups.links
  const byId = new Map(characters.map(character => [character.id, character]))
  const sourceId = normalized.sourceCharacterId
  const targetId = normalized.targetCharacterId
  const sourceIsParent = normalized.direction !== 'target_is_parent'
  const parentId = sourceIsParent ? sourceId : targetId
  const childId = sourceIsParent ? targetId : sourceId

  if (normalized.kind === 'parent_child') {
    if (walkAncestors(parentId, lookups, characters.length + 1).some(ancestor => ancestor.id === childId)) {
      warnings.push('This creates a biological or family-line loop.')
    }
    if ((lookups.siblingsByCharacter.get(parentId) || []).some(sibling => sibling.id === childId)) {
      warnings.push('These characters are already marked as siblings.')
    }
    const parent = byId.get(parentId)
    const child = byId.get(childId)
    const parentBirth = Number.parseInt(parent?.birthDate, 10)
    const childBirth = Number.parseInt(child?.birthDate, 10)
    if (Number.isFinite(parentBirth) && Number.isFinite(childBirth) && childBirth < parentBirth) {
      warnings.push('The child appears older than the parent based on birth dates.')
    }
  }

  if (normalized.kind === 'sibling') {
    if ((lookups.parentsByChild.get(sourceId) || []).some(parent => parent.id === targetId)
      || (lookups.parentsByChild.get(targetId) || []).some(parent => parent.id === sourceId)) {
      warnings.push("One character is already marked as the other character's parent.")
    }
  }

  if (links.some(link => link.sourceCharacterId === sourceId && link.targetCharacterId === targetId && link.kind === normalized.kind && link.type !== normalized.type && link.status !== 'disputed' && normalized.status !== 'disputed')) {
    warnings.push('A different relationship type already exists for this pair; mark it disputed or allow an unusual structure.')
  }

  return warnings
}
