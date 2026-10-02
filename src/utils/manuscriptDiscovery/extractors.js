import { evidenceFor } from './document.js'

const TITLE = '(?:King|Queen|Prince|Princess|Lady|Lord|Captain|Doctor|Dr\\.?|Miss|Mr\\.?|Mrs\\.?|Sir|Dame|Professor)'
const PERSON_TITLES = new Set(['king', 'queen', 'prince', 'princess', 'lady', 'lord', 'captain', 'doctor', 'dr', 'miss', 'mr', 'mrs', 'sir', 'dame', 'professor'])
const NAME = "[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?"
const FULL_NAME = `${NAME}(?:\\s+${NAME}){0,2}`
// Capitalisation alone is not evidence that a word is part of a name. These
// words commonly begin sentences and would otherwise turn "Whenever Harry"
// or "After Ron" into plausible-looking two-word character candidates.
// Deliberately omit ambiguous words that are also common names (May, Will,
// Hope, etc.). The cleaner below removes these only from candidate edges.
const NON_NAME_WORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
  'and', 'but', 'or', 'nor', 'so', 'yet', 'for',
  'about', 'above', 'across', 'against', 'along', 'amid', 'among', 'around', 'at',
  'behind', 'below', 'beneath', 'beside', 'between', 'beyond', 'by', 'despite', 'down',
  'during', 'except', 'from', 'in', 'inside', 'into', 'near', 'of', 'off', 'on', 'onto',
  'opposite', 'out', 'outside', 'over', 'past', 'per', 'through', 'throughout', 'to',
  'toward', 'towards', 'under', 'underneath', 'unlike', 'up', 'upon', 'via', 'with', 'within', 'without',
  'when', 'whenever', 'while', 'where', 'wherever', 'why', 'how', 'if', 'unless', 'until',
  'before', 'after', 'although', 'though', 'because', 'since', 'once', 'as',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had',
  'do', 'does', 'did', 'can', 'could', 'shall', 'should', 'would', 'might', 'must',
  'all', 'any', 'both', 'each', 'either', 'enough', 'every', 'few', 'fewer', 'little',
  'many', 'more', 'most', 'much', 'neither', 'no', 'none', 'several', 'some', 'such',
  'then', 'however', 'therefore', 'meanwhile', 'otherwise', 'instead', 'later', 'earlier',
  'suddenly', 'finally', 'perhaps', 'maybe', 'here', 'there', 'also', 'even', 'just',
  'only', 'still', 'now', 'today', 'tomorrow', 'yesterday',
  'make', 'makes', 'made', 'making', 'next', 'first', 'second', 'third', 'last',
  'another', 'other',
  'chapter', 'act', 'part', 'book', 'scene', 'prologue', 'epilogue', 'interlude',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
])
const LOCATION_WORDS = 'city|village|town|kingdom|forest|castle|palace|school|tavern|river|mountain|island|street|house|room|district|province|country|harbour|harbor|valley|temple|tower|fort|inn'
const TITLED_LOCATION_WORDS = LOCATION_WORDS.split('|').map(word => word[0].toUpperCase() + word.slice(1)).join('|')
const FACTION_WORDS = 'House|Order|Guild|Council|Army|Guard|Clan|Family|Court|Society|Academy|Brotherhood|Sisterhood|Rebels|Alliance|Company'
const REL_WORDS = 'mother|father|parent|daughter|son|child|brother|sister|cousin|aunt|uncle|husband|wife|spouse|friend|enemy|mentor'
const COMMON_LORE = new Set(['chapter', 'scene', 'said', 'asked', 'looked', 'went', 'came', 'house', 'room', 'morning', 'night', 'day', 'man', 'woman'])

export const CONFIDENCE_THRESHOLDS = Object.freeze({ high: 8, medium: 4 })
export const confidenceForScore = score => score >= CONFIDENCE_THRESHOLDS.high ? 'high' : score >= CONFIDENCE_THRESHOLDS.medium ? 'medium' : 'low'
export const normalizeDiscoveryName = value => String(value || '').replace(/[’']s$/i, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase()

function cleanCandidateName(value) {
  const words = String(value || '').trim().replace(/[.,;:!?]+$/, '').split(/\s+/).filter(Boolean)
  while (words.length && NON_NAME_WORDS.has(normalizeDiscoveryName(words[0]))) words.shift()
  while (words.length && NON_NAME_WORDS.has(normalizeDiscoveryName(words.at(-1)))) words.pop()
  if (words.some(word => NON_NAME_WORDS.has(normalizeDiscoveryName(word)))) return ''
  return words.join(' ')
}

function isNameShaped(value) {
  const words = String(value || '').split(/\s+/).filter(Boolean)
  if (words.length === 1 && PERSON_TITLES.has(normalizeDiscoveryName(words[0]).replace(/\.$/, ''))) return false
  return words.length > 0 && words.every(word => {
    const normalized = normalizeDiscoveryName(word)
    return !NON_NAME_WORDS.has(normalized) && /^\p{Lu}[\p{L}\p{M}'’.-]*$/u.test(word)
  })
}

const idFor = (type, name, suffix = '') => `${type}:${normalizeDiscoveryName(name).replace(/[^a-z0-9]+/g, '-')}${suffix}`

function collectMatches(document, regex, reason, nameFromMatch = match => match[1] || match[0]) {
  const found = new Map()
  document.chapters.forEach(chapter => {
    const localRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`)
    for (const match of chapter.text.matchAll(localRegex)) {
      const name = cleanCandidateName(nameFromMatch(match))
      if (!name) continue
      const key = normalizeDiscoveryName(name)
      const item = found.get(key) || { name, mentions: 0, chapters: new Set(), evidence: [], reasons: new Set() }
      item.mentions += 1
      item.chapters.add(chapter.id)
      item.reasons.add(reason)
      if (item.evidence.length < 5) item.evidence.push(evidenceFor(chapter, match, reason))
      if (name.length > item.name.length) item.name = name
      found.set(key, item)
    }
  })
  return found
}

const mergeCollections = (...collections) => {
  const merged = new Map()
  collections.forEach(collection => collection.forEach((item, key) => {
    const target = merged.get(key) || { ...item, chapters: new Set(), evidence: [], reasons: new Set(), mentions: 0 }
    target.mentions += item.mentions
    item.chapters.forEach(value => target.chapters.add(value))
    item.reasons.forEach(value => target.reasons.add(value))
    target.evidence.push(...item.evidence.slice(0, Math.max(0, 5 - target.evidence.length)))
    if (item.name.length > target.name.length) target.name = item.name
    merged.set(key, target)
  }))
  return merged
}

function finalize(type, collection, scoreFn, extra = () => ({})) {
  return [...collection.values()].map(item => {
    const score = scoreFn(item)
    return {
      id: idFor(type, item.name), type, name: item.name, score,
      confidence: confidenceForScore(score), mentions: item.mentions,
      sourceChapterIds: [...item.chapters], evidence: item.evidence,
      reasons: [...item.reasons], selected: score >= 4, ...extra(item),
    }
  }).sort((a, b) => b.score - a.score || b.mentions - a.mentions || a.name.localeCompare(b.name))
}

export function extractCharacters(document) {
  const dialogue = collectMatches(document, new RegExp(`\\b(${TITLE}\\s+${NAME}|${FULL_NAME})\\b(?=\\s+(?:said|asked|replied|whispered|shouted|murmured|answered))`, 'g'), 'dialogue attribution')
  const titled = collectMatches(document, new RegExp(`\\b(${TITLE}\\s+${NAME})\\b`, 'g'), 'person title')
  const full = collectMatches(document, new RegExp(`\\b(${NAME}\\s+${NAME})\\b`, 'g'), 'full name')
  const possessive = collectMatches(document, new RegExp(`\\b(${NAME})[’']s\\b`, 'g'), 'possessive name')
  const kinship = collectMatches(document, new RegExp(`\\b(?:older\\s+|younger\\s+)?(?:${REL_WORDS})\\s+(${NAME})\\b`, 'gi'), 'named relationship')
  const appositive = collectMatches(document, new RegExp(`\\b(${NAME}),\\s+${NAME}[’']s\\s+(?:older\\s+|younger\\s+)?(?:${REL_WORDS})\\b`, 'g'), 'named relationship')
  const all = mergeCollections(dialogue, titled, full, possessive, kinship, appositive)
  const candidates = finalize('character', all, item =>
    Math.min(item.mentions, 5) + Math.min(item.chapters.size, 4) + (item.reasons.has('dialogue attribution') ? 4 : 0) + (item.reasons.has('full name') ? 2 : 0) + (item.reasons.has('person title') ? 2 : 0))

  const hasPersonSignal = candidate => candidate.reasons.some(reason => [
    'dialogue attribution', 'person title', 'named relationship',
  ].includes(reason))
  const signalledTokens = new Set(candidates.filter(hasPersonSignal).flatMap(candidate => candidate.name
    .replace(new RegExp(`^${TITLE}\\s+`, 'i'), '')
    .split(/\s+/)
    .map(normalizeDiscoveryName)))
  // Capitalisation and repetition are never enough to create a person. A
  // multi-word form is retained only when one of its components is already
  // supported by a real person signal (for example, Harry -> Harry Potter).
  const credible = candidates.filter(candidate => {
    if (hasPersonSignal(candidate)) return true
    const words = candidate.name.split(/\s+/).map(normalizeDiscoveryName)
    return words.length >= 2 && signalledTokens.has(words[0])
  })

  credible.forEach(candidate => {
    const words = candidate.name.replace(new RegExp(`^${TITLE}\\s+`, 'i'), '').split(/\s+/)
    const aliases = credible.filter(other => {
      if (other.id === candidate.id) return false
      const otherWords = other.name.replace(new RegExp(`^${TITLE}\\s+`, 'i'), '').split(/\s+/)
      return words.some(word => otherWords.some(otherWord => normalizeDiscoveryName(word) === normalizeDiscoveryName(otherWord)))
        && (words.length > 1 || otherWords.length > 1)
    }).map(other => other.name)
    if (aliases.length) candidate.aliases = [...new Set(aliases)]
  })
  // Final invariant: even a buggy or case-insensitive upstream pattern must
  // never be able to emit lowercase grammar tokens (for example "and") as
  // a character. Context provides person evidence; this validates its shape.
  return credible.filter(candidate => isNameShaped(candidate.name))
}

export function extractLocations(document) {
  const contextual = collectMatches(document, new RegExp(`\\b(?:in|at|to|from|into|through|near|entered|reached|left|arrived at)\\s+(?:the\\s+)?(${FULL_NAME})\\b`, 'g'), 'locational phrase')
  const typed = collectMatches(document, new RegExp(`\\b((?:${NAME}\\s+){0,2}(?:${TITLED_LOCATION_WORDS}))\\b`, 'g'), 'location type')
  return finalize('location', mergeCollections(contextual, typed), item => Math.min(item.mentions, 5) + Math.min(item.chapters.size, 3) + (item.reasons.has('location type') ? 4 : 2))
    .filter(item => item.mentions >= 2 || item.reasons.includes('location type'))
}

export function extractFactions(document) {
  const groups = collectMatches(document, new RegExp(`\\b((?:The\\s+)?(?:${FACTION_WORDS})(?:\\s+(?:of\\s+)?${NAME}){0,3})\\b`, 'g'), 'group designator')
  return finalize('faction', groups, item => 4 + Math.min(item.mentions, 5) + Math.min(item.chapters.size, 3))
}

export function extractRelationships(document, characters) {
  const known = characters.map(candidate => candidate.name).sort((a, b) => b.length - a.length)
  if (!known.length) return []
  const namePattern = known.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const patterns = [
    { regex: new RegExp(`\\b(${namePattern})[’']s\\s+(?:older\\s+|younger\\s+)?(${REL_WORDS})\\s+(${namePattern})\\b`, 'gi'), indexes: [1, 3, 2] },
    { regex: new RegExp(`\\b(${namePattern}),\\s+(${namePattern})[’']s\\s+(?:older\\s+|younger\\s+)?(${REL_WORDS})\\b`, 'gi'), indexes: [2, 1, 3] },
    { regex: new RegExp(`\\b(${namePattern}),\\s+(?:the\\s+)?(?:older\\s+|younger\\s+)?(${REL_WORDS})\\s+of\\s+(${namePattern})\\b`, 'gi'), indexes: [3, 1, 2] },
    { regex: new RegExp(`\\b(${namePattern})\\s+(?:was|is|had been)?\\s*(?:married to|the (?:husband|wife|spouse) of)\\s+(${namePattern})\\b`, 'gi'), indexes: [1, 2], forced: 'spouse' },
  ]
  const output = []
  document.chapters.forEach(chapter => patterns.forEach(pattern => {
    for (const match of chapter.text.matchAll(pattern.regex)) {
      const sourceName = match[pattern.indexes[0]]
      const targetName = match[pattern.indexes[1]]
      const relationshipType = pattern.forced || match[pattern.indexes[2]].toLowerCase()
      if (normalizeDiscoveryName(sourceName) === normalizeDiscoveryName(targetName)) continue
      output.push({
        id: idFor('relationship', `${sourceName}-${relationshipType}-${targetName}`, `:${output.length}`),
        type: 'relationship', name: `${sourceName} — ${relationshipType} of — ${targetName}`,
        sourceName, targetName, relationshipType, score: pattern.forced ? 9 : 8, confidence: 'high',
        mentions: 1, sourceChapterIds: [chapter.id], evidence: [evidenceFor(chapter, match, `explicit ${relationshipType} phrase`)],
        reasons: [`explicit ${relationshipType} phrase`], selected: true,
      })
    }
  }))
  return [...new Map(output.map(item => [`${normalizeDiscoveryName(item.sourceName)}|${item.relationshipType}|${normalizeDiscoveryName(item.targetName)}`, item])).values()]
}

export function extractTimeline(document) {
  const timeSignal = /\b(?:in\s+\d{3,4}|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|\d+)\s+(?:years?|centuries|months?|days?)\s+(?:ago|earlier|before)|before\s+the\s+[^,.!?]+|after\s+the\s+[^,.!?]+|during\s+the\s+[^,.!?]+|since\s+the\s+[^,.!?]+|June\s+\d{1,2}|was\s+(?:founded|destroyed|bound)|the\s+(?:war|rebellion)\s+began|the\s+city\s+fell)\b/i
  const results = new Map()
  document.chapters.forEach(chapter => chapter.sentences.forEach(sentence => {
    const match = sentence.text.match(timeSignal)
    if (!match) return
    const dateLabel = match[0].replace(/^in\s+/i, '').trim()
    const key = normalizeDiscoveryName(sentence.text)
    const existing = results.get(key)
    const evidence = { manuscriptId: chapter.manuscriptId, chapterId: chapter.id, chapterTitle: chapter.title, excerpt: sentence.text, start: sentence.start, end: sentence.end, reason: 'chronology or historical wording' }
    if (existing) {
      existing.mentions += 1
      if (!existing.sourceChapterIds.includes(chapter.id)) existing.sourceChapterIds.push(chapter.id)
      if (existing.evidence.length < 5) existing.evidence.push(evidence)
    } else results.set(key, {
      id: idFor('timeline', sentence.text), type: 'timeline', name: sentence.text,
      dateLabel, score: 7, confidence: 'medium', mentions: 1, sourceChapterIds: [chapter.id], evidence: [evidence],
      reasons: ['chronology or historical wording'], selected: true,
    })
  }))
  return [...results.values()]
}

export function extractLore(document, excludedNames = []) {
  const excluded = new Set(excludedNames.flatMap(name => [normalizeDiscoveryName(name), ...String(name).split(/\s+/).map(normalizeDiscoveryName)]))
  const phrases = collectMatches(document, new RegExp(`\\b(${NAME}(?:\\s+${NAME}){0,2})\\b`, 'g'), 'recurring capitalised term')
  const singles = collectMatches(document, new RegExp(`\\b(${NAME})\\b`, 'g'), 'recurring capitalised term')
  const terms = mergeCollections(phrases, singles)
  terms.forEach((item, key) => {
    if (COMMON_LORE.has(key) || excluded.has(key)) terms.delete(key)
  })
  return finalize('lore', terms, item => Math.min(item.mentions, 6) + Math.min(item.chapters.size, 4), _item => ({ category: 'Other' }))
    .filter(item => item.mentions >= 3 && item.sourceChapterIds.length >= 2)
}

export function buildOutlineCandidates(document, characters, locations, timeline) {
  const firstCharacterChapter = new Map()
  const firstLocationChapter = new Map()
  characters.forEach(item => item.sourceChapterIds.forEach(chapterId => { if (!firstCharacterChapter.has(item.id)) firstCharacterChapter.set(item.id, chapterId) }))
  locations.forEach(item => item.sourceChapterIds.forEach(chapterId => { if (!firstLocationChapter.has(item.id)) firstLocationChapter.set(item.id, chapterId) }))
  return document.chapters.map(chapter => {
    const chapterCharacters = characters.filter(item => item.sourceChapterIds.includes(chapter.id))
    const chapterLocations = locations.filter(item => item.sourceChapterIds.includes(chapter.id))
    const pronouns = (chapter.text.match(/\b(I|me|my)\b/gi) || []).length
    const ranked = chapterCharacters.map(item => ({ item, count: (chapter.text.match(new RegExp(`\\b${item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')) || []).length })).sort((a, b) => b.count - a.count)
    const possiblePov = pronouns < 12 && ranked[0]?.count >= Math.max(3, (ranked[1]?.count || 0) * 1.5) ? ranked[0].item.name : ''
    return {
      id: `outline:${chapter.id}`, type: 'outline', name: chapter.title, score: possiblePov ? 6 : 4,
      confidence: possiblePov ? 'medium' : 'low', selected: true, mentions: 1, sourceChapterIds: [chapter.id], reasons: ['manuscript heading'],
      chapterId: chapter.id, wordCount: chapter.wordCount, possiblePov,
      evidence: [{ manuscriptId: chapter.manuscriptId, chapterId: chapter.id, chapterTitle: chapter.title, excerpt: chapter.text.slice(0, 180).replace(/\s+/g, ' ').trim() || chapter.title, start: 0, end: Math.min(180, chapter.text.length), reason: 'manuscript heading and chapter structure' }],
      characters: chapterCharacters.map(item => item.name), locations: chapterLocations.map(item => item.name),
      newCharacters: chapterCharacters.filter(item => firstCharacterChapter.get(item.id) === chapter.id).map(item => item.name),
      newLocations: chapterLocations.filter(item => firstLocationChapter.get(item.id) === chapter.id).map(item => item.name),
      timelineReferences: timeline.filter(item => item.sourceChapterIds.includes(chapter.id)).map(item => item.name),
    }
  })
}
