const FAMILY_LINK_KINDS = new Set(['parent_child', 'sibling', 'partner', 'guardian'])
const FAMILY_LINK_TYPES = new Set(['biological', 'adoptive', 'step', 'chosen', 'legal', 'magical', 'unknown'])
const FAMILY_LINK_STATUSES = new Set(['active', 'former', 'secret', 'disputed', 'hidden'])

const toArray = value => Array.isArray(value) ? value : []
const uniq = values => [...new Set(values.filter(Boolean))]

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
  if (!link?.sourceCharacterId || !link?.targetCharacterId || link.sourceCharacterId === link.targetCharacterId) return null
  return makeFamilyLink(link)
}

export function getFamilyLinks(characters = []) {
  const byId = new Set(characters.map(character => character.id))
  const links = []
  const seen = new Set()
  const add = (link) => {
    const normalized = normalizeExplicitLink(link)
    if (!normalized || !byId.has(normalized.sourceCharacterId) || !byId.has(normalized.targetCharacterId)) return
    const key = normalized.id || [
      normalized.sourceCharacterId,
      normalized.targetCharacterId,
      normalized.kind,
      normalized.type,
      normalized.status,
      normalized.direction,
    ].join('|')
    if (seen.has(key)) return
    seen.add(key)
    links.push(normalized)
  }

  characters.forEach(character => {
    toArray(character.familyLinks).forEach(add)

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
  const merged = { ...FAMILY_FILTER_DEFAULTS, ...filters }
  if (!merged.showHidden && (link.status === 'secret' || link.status === 'hidden' || link.knownPublicly === false)) return false
  if (merged.bloodOnly && link.type !== 'biological') return false
  if (!merged.includeAdoption && link.type === 'adoptive') return false
  if (!merged.includeStep && link.type === 'step') return false
  if (!merged.includeGuardians && link.kind === 'guardian') return false
  if (!merged.includePartners && link.kind === 'partner') return false
  return true
}

export function buildFamilyLookups(characters = [], filters = FAMILY_FILTER_DEFAULTS) {
  const links = getFamilyLinks(characters).filter(link => shouldIncludeLink(link, filters))
  const parentsByChild = new Map()
  const childrenByParent = new Map()
  const siblingsByCharacter = new Map()
  const partnersByCharacter = new Map()
  const guardiansByWard = new Map()
  const linkByPair = new Map()
  const addPair = (map, from, to, link) => {
    if (!map.has(from)) map.set(from, [])
    if (!map.get(from).some(item => item.id === to && item.link.id === link.id)) map.get(from).push({ id: to, link })
  }

  links.forEach(link => {
    linkByPair.set(`${link.sourceCharacterId}:${link.targetCharacterId}:${link.kind}`, link)
    linkByPair.set(`${link.targetCharacterId}:${link.sourceCharacterId}:${link.kind}`, link)
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

  const allChildIds = uniq([...parentsByChild.keys(), ...childrenByParent.values()].flat().map(item => item?.id || item))
  allChildIds.forEach(a => {
    const aParents = parentsByChild.get(a) || []
    allChildIds.forEach(b => {
      if (a >= b) return
      const bParents = parentsByChild.get(b) || []
      const shared = aParents.filter(parent => bParents.some(other => other.id === parent.id))
      if (shared.length === 0) return
      const biological = shared.filter(parent => parent.link.type === 'biological')
      const type = biological.length ? 'biological' : shared[0].link.type
      const link = shared[0].link
      addPair(siblingsByCharacter, a, b, { ...link, id: fallbackId(['derived-sibling', a, b]), kind: 'sibling', type })
      addPair(siblingsByCharacter, b, a, { ...link, id: fallbackId(['derived-sibling', b, a]), kind: 'sibling', type })
    })
  })

  return { links, parentsByChild, childrenByParent, siblingsByCharacter, partnersByCharacter, guardiansByWard, linkByPair }
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
  return direction === 'up' ? `${prefix}Great-grandparent` : `${prefix}Great-grandchild`
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
  while (queue.length) {
    const item = queue.shift()
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
  while (queue.length) {
    const item = queue.shift()
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

export function deriveFamilyRelationships(characters = [], focusId, filters = FAMILY_FILTER_DEFAULTS) {
  if (!focusId) return []
  const byId = new Map(characters.map(character => [character.id, character]))
  const lookups = buildFamilyLookups(characters, filters)
  const relationships = new Map()

  walkAncestors(focusId, lookups).forEach(item => addRelationship(relationships, {
    fromCharacterId: focusId,
    toCharacterId: item.id,
    label: ancestorLabel(item.distance, 'up', item.type),
    category: 'ancestor',
    distance: item.distance,
    viaCharacterIds: item.via,
    sourceLinkIds: item.links.map(link => link.id),
    confidence: item.distance === 1 ? 'direct' : 'derived',
  }))

  walkDescendants(focusId, lookups).forEach(item => addRelationship(relationships, {
    fromCharacterId: focusId,
    toCharacterId: item.id,
    label: ancestorLabel(item.distance, 'down', item.type),
    category: 'descendant',
    distance: item.distance,
    viaCharacterIds: item.via,
    sourceLinkIds: item.links.map(link => link.id),
    confidence: item.distance === 1 ? 'direct' : 'derived',
  }))

  ;(lookups.siblingsByCharacter.get(focusId) || []).forEach(sibling => {
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
      sourceLinkIds: [sibling.link.id],
      confidence: sibling.link.id.startsWith('derived') ? 'derived' : 'direct',
    })
  })

  ;(lookups.partnersByCharacter.get(focusId) || []).forEach(partner => addRelationship(relationships, {
    fromCharacterId: focusId,
    toCharacterId: partner.id,
    label: directLabel('Partner', partner.link),
    category: 'partner',
    distance: 1,
    viaCharacterIds: [],
    sourceLinkIds: [partner.link.id],
    confidence: 'direct',
  }))

  ;(lookups.guardiansByWard.get(focusId) || []).forEach(guardian => addRelationship(relationships, {
    fromCharacterId: focusId,
    toCharacterId: guardian.id,
    label: directLabel('Guardian', guardian.link),
    category: 'guardian',
    distance: 1,
    viaCharacterIds: [],
    sourceLinkIds: [guardian.link.id],
    confidence: 'direct',
  }))

  lookups.guardiansByWard.forEach((guardians, wardId) => {
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
  focusParents.forEach(parent => {
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

  ;(lookups.siblingsByCharacter.get(focusId) || []).forEach(sibling => {
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

  focusParents.forEach(parent => {
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

  const partnerParents = (lookups.parentsByChild.get(focusId) || [])
    .flatMap(parent => lookups.partnersByCharacter.get(parent.id) || [])
    .filter(partner => !focusParents.some(parent => parent.id === partner.id))
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
    .filter(relationship => byId.has(relationship.toCharacterId))
    .sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label) || (byId.get(a.toCharacterId)?.name || '').localeCompare(byId.get(b.toCharacterId)?.name || ''))
}

export function groupFamilyRelationships(characters = [], focusId, filters = FAMILY_FILTER_DEFAULTS) {
  const derived = deriveFamilyRelationships(characters, focusId, filters)
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
      if (key === 'extended') return relationship.distance > 1 || categories.includes(relationship.category)
      return categories.includes(relationship.category)
    }),
  ]))
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

export function validateFamilyLink(characters = [], newLink) {
  const warnings = []
  const links = getFamilyLinks(characters)
  const normalized = normalizeExplicitLink(newLink)
  if (!normalized) return ['Choose two different characters for this family fact.']

  const lookups = buildFamilyLookups(characters, { ...FAMILY_FILTER_DEFAULTS, showHidden: true })
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
    const parent = characters.find(character => character.id === parentId)
    const child = characters.find(character => character.id === childId)
    const parentBirth = Number.parseInt(parent?.birthDate, 10)
    const childBirth = Number.parseInt(child?.birthDate, 10)
    if (Number.isFinite(parentBirth) && Number.isFinite(childBirth) && childBirth < parentBirth) {
      warnings.push('The child appears older than the parent based on birth dates.')
    }
  }

  if (normalized.kind === 'sibling') {
    if ((lookups.parentsByChild.get(sourceId) || []).some(parent => parent.id === targetId)
      || (lookups.parentsByChild.get(targetId) || []).some(parent => parent.id === sourceId)) {
      warnings.push('One character is already marked as the other character’s parent.')
    }
  }

  if (links.some(link => link.sourceCharacterId === sourceId && link.targetCharacterId === targetId && link.kind === normalized.kind && link.type !== normalized.type && link.status !== 'disputed' && normalized.status !== 'disputed')) {
    warnings.push('A different relationship type already exists for this pair; mark it disputed or allow an unusual structure.')
  }

  return warnings
}
