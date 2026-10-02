import { buildManuscriptDocument } from './document.js'
import { buildOutlineCandidates, extractCharacters, extractFactions, extractLocations, extractLore, extractRelationships, extractTimeline } from './extractors.js'

const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0))

/**
 * Deterministic, local-only pipeline. This module imports no AI or network client.
 * @returns {Promise<{document: import('./types.js').ManuscriptDocument, candidates: Record<string, import('./types.js').DiscoveryCandidate[]>}>}
 */
export async function discoverManuscript(acts, { manuscriptId, onStage = () => {} } = {}) {
  onStage('Parsing manuscript…')
  const document = buildManuscriptDocument(acts, manuscriptId)
  await yieldToBrowser()
  onStage('Finding characters…')
  const rawCharacters = extractCharacters(document)
  await yieldToBrowser()
  onStage('Finding locations and factions…')
  const locations = extractLocations(document)
  const factions = extractFactions(document)
  const classifiedNames = new Set([...locations, ...factions].map(item => item.name.toLocaleLowerCase()))
  const characters = rawCharacters.filter(item => !classifiedNames.has(item.name.toLocaleLowerCase()))
  await yieldToBrowser()
  onStage('Analysing relationships…')
  const relationships = extractRelationships(document, characters)
  await yieldToBrowser()
  onStage('Finding timeline references…')
  const timeline = extractTimeline(document)
  await yieldToBrowser()
  onStage('Finding recurring lore…')
  const lore = extractLore(document, [...characters, ...locations, ...factions].map(item => item.name))
  const outline = buildOutlineCandidates(document, characters, locations, timeline)
  return { document, candidates: { characters, locations, factions, relationships, timeline, lore, outline } }
}

export { normalizeDiscoveryName } from './extractors.js'
export { buildManuscriptDocument } from './document.js'
