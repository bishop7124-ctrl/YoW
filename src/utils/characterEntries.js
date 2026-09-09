import { getCharacterAge } from './characterAge.js'
import { hasJourneyContent, normalizeJourney } from './characterJourney.js'

export const CHARACTER_TRAIT_FIELDS = [
  ['strengths', 'Strengths'], ['weaknesses', 'Weaknesses'],
  ['internalGoal', 'Internal Goal'], ['externalGoal', 'External Goal'],
  ['disabilities', 'Disabilities'], ['qualifications', 'Qualifications'],
  ['talents', 'Talents'], ['languages', 'Languages'], ['fears', 'Fears'], ['passions', 'Passions'],
]
export const CHARACTER_BACKGROUND_FIELDS = [
  ['hometown', 'Hometown'], ['religion', 'Religion'], ['language', 'Primary Language'],
  ['historicEventsWitnessed', 'Historic Events Witnessed'], ['lifeEvents', 'Life Events'],
]
const text = value => value == null ? '' : String(value)
const array = value => Array.isArray(value) ? value : []
const ids = value => [...new Set(array(value).filter(id => typeof id === 'string' && id))]

export function normalizeCharacterKeywords(value) {
  const unique = new Map()
  array(value).forEach(item => {
    if (typeof item !== 'string' && typeof item !== 'number') return
    const label = String(item).trim()
    if (label && !unique.has(label.toLowerCase())) unique.set(label.toLowerCase(), label)
  })
  return [...unique.values()]
}

export function getCharacterStatus(character) {
  return text(character?.status).trim() || (text(character?.deathDate).trim() ? 'dead' : 'alive')
}

export function normalizeCharacter(character = {}) {
  const normalized = { ...character }
  ;['name', 'familyGroup', 'factionId', 'role', 'pronouns', 'species', 'birthDate', 'deathDate'].forEach(field => { normalized[field] = text(character[field]) })
  normalized.familyGroup = normalized.familyGroup.trim()
  normalized.titleJob = text(character.titleJob ?? character.title)
  normalized.bio = text(character.bio ?? character.description ?? character.notes)
  normalized.status = getCharacterStatus(character)
  normalized.keywords = normalizeCharacterKeywords(character.keywords)
  ;['parentIds', 'childIds', 'spouseIds'].forEach(field => { normalized[field] = ids(character[field]).filter(id => id !== character.id) })
  normalized.familyLinks = array(character.familyLinks).filter(item => item && typeof item === 'object')
  const relationships = character.relationships && typeof character.relationships === 'object' ? Object.values(character.relationships) : []
  normalized.relationships = [...new Map(relationships
    .filter(item => item && typeof item === 'object' && item.targetId !== character.id)
    .map(item => ({ ...item, targetId: text(item.targetId), type: text(item.type) }))
    .map(item => [JSON.stringify([item.targetId, item.type]), item])).values()]
  normalized.traits = { ...character.traits }
  CHARACTER_TRAIT_FIELDS.forEach(([field]) => { normalized.traits[field] = text(character.traits?.[field] ?? character[field]) })
  normalized.background = { ...character.background }
  CHARACTER_BACKGROUND_FIELDS.forEach(([field]) => { normalized.background[field] = text(character.background?.[field]) })
  normalized.extraAbilities = array(character.extraAbilities).filter(item => item && typeof item === 'object')
    .map(item => ({ ...item, name: text(item.name), description: text(item.description) }))
  const zoom = Number(character.imageZoom)
  normalized.imageZoom = Number.isFinite(zoom) && zoom >= 1 ? Math.min(3, zoom) : 1
  normalized.imagePosition = typeof character.imagePosition === 'string' && /^\d+(?:\.\d+)?% \d+(?:\.\d+)?%$/.test(character.imagePosition) ? character.imagePosition : '50% 50%'
  return normalized
}

export function buildCharacterIndex(characters = [], factions = []) {
  const entries = characters.filter(Boolean).map(normalizeCharacter)
  return {
    entries,
    byId: new Map(entries.map(character => [character.id, character])),
    factions: new Map(factions.filter(Boolean).map(faction => [faction.id, { ...faction, name: text(faction.name) }])),
    familyGroups: [...new Set(entries.map(character => character.familyGroup).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  }
}

export function filterCharacters(index, { search = '', family = '', faction = 'all', sortBy = 'name-asc' } = {}) {
  const query = search.trim().toLowerCase()
  const factionName = character => index.factions.get(character.factionId)?.name || ''
  return index.entries.filter(character => {
    if (family && character.familyGroup !== family) return false
    if (faction === 'none' && index.factions.has(character.factionId)) return false
    if (faction.startsWith('id:') && character.factionId !== faction.slice(3)) return false
    return !query || [character.name, character.role, character.familyGroup, character.species, ...character.keywords, factionName(character)]
      .some(value => value.toLowerCase().includes(query))
  }).sort((a, b) => {
    const names = a.name.localeCompare(b.name)
    if (sortBy === 'name-desc') return -names
    if (sortBy === 'role') return a.role.localeCompare(b.role) || names
    if (sortBy === 'faction') return factionName(a).localeCompare(factionName(b)) || names
    return names
  })
}

// Reference type matters: a location ID must never become a character link.
export function characterReferences(id, { loreEntries = [], timeline = [], worldHistory = [] }) {
  const referencing = (items, field) => [...new Map(items.filter(item => array(item?.[field]).includes(id)).map(item => [item.id, item])).values()]
  return { lore: referencing(loreEntries, 'characterIds'), timeline: referencing(timeline, 'linkedCharacters'), history: referencing(worldHistory, 'linkedCharacters') }
}

export function characterDetailFields(character, currentYear) {
  const c = normalizeCharacter(character)
  return [
    ['Role', c.role], ['Pronouns', c.pronouns], ['Alias', c.keywords.join(', ')],
    ['Age', getCharacterAge(c, currentYear) ?? character.age], ['Birth', c.birthDate], ['Death', c.deathDate],
    ['Status', c.status], ['Family', c.familyGroup], ['Species', c.species], ['Title / Job', c.titleJob], ['Arc', character.arc ?? character.characterArc],
    ...CHARACTER_TRAIT_FIELDS.map(([field, label]) => [label, c.traits[field]]),
    ...CHARACTER_BACKGROUND_FIELDS.map(([field, label]) => [label, c.background[field]]),
    ...c.extraAbilities.map((ability, i) => [`Ability: ${ability.name || i + 1}`, ability.description || ability.name]),
  ].filter(([, value]) => value != null && String(value).trim() !== '')
}

export function characterJourneyFields(input) {
  if (!hasJourneyContent(input)) return []
  const journey = normalizeJourney(input)
  const fields = [
    ['Arc type', journey.arcType], ['Scope', journey.scope === 'series' ? 'Across the series' : 'This project'],
    ...[
      ['startingState', 'Starting state'], ['endingState', 'Ending state'], ['coreWound', 'Core wound'], ['fear', 'Core fear'],
      ['lieBelieved', 'Lie believed'], ['truthLearned', 'Truth to learn'], ['want', 'Want'], ['need', 'Need'],
      ['fatalFlaw', 'Fatal flaw'], ['strength', 'Strength'], ['internalConflict', 'Internal conflict'], ['externalConflict', 'External conflict'],
      ['beginningBelief', 'Beginning belief'], ['endingBelief', 'Ending belief'], ['beginningGoal', 'Beginning goal'], ['endingGoal', 'Ending goal'],
      ['beginningFear', 'Beginning fear'], ['endingFear', 'Ending fear'], ['beginningRelationships', 'Beginning relationships'], ['endingRelationships', 'Ending relationships'], ['notes', 'Journey notes'],
    ].map(([key, label]) => [label, journey[key]]),
    ...journey.beats.map((beat, index) => [`${index + 1}. ${beat.title || 'Untitled beat'}`, [
      ['Story phase', beat.storyPhase === 'Custom' ? beat.customPhase : beat.storyPhase],
      ['Major turning point', beat.isMajorTurningPoint ? 'Yes' : ''],
      ['What happens', beat.description], ['Emotional state', beat.emotionalState], ['Belief', beat.belief], ['Goal', beat.goal],
      ['Conflict', beat.conflict], ['Choice made', beat.choiceMade], ['Consequence', beat.consequence],
    ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join('\n')]),
  ]
  return fields.filter(([, value]) => value !== '')
}
