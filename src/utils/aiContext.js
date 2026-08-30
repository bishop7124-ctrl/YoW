import { getProjectType } from '../constants/projectTypes'
import { estimateInputCost, estimateTokens, getContextUsageLevel, getModelCapabilities, getSafeInputBudget } from './aiModelCapabilities'

export const AI_CHAT_CONTEXT_MODE_KEY = 'nf_ai_context_mode'

export const AI_CHAT_CONTEXT_MODES = [
  {
    id: 'smart',
    icon: '⚡',
    label: 'Smart Context',
    badge: 'Recommended',
    helper: 'Finds the most relevant project data for this request.',
  },
  {
    id: 'current_chapter',
    icon: '📖',
    label: 'Current Chapter',
    helper: 'Focuses on the active chapter or scene and connected records.',
  },
  {
    id: 'current_character',
    icon: '👤',
    label: 'Current Character',
    helper: 'Focuses on the open character and their connections.',
  },
  {
    id: 'entire_project',
    icon: '🌎',
    label: 'Entire Project',
    helper: 'Includes as much of the project as the selected model can safely accept.',
  },
]

const SECTION_LIMITS = {
  smart: { characters: 10, relationships: 14, locations: 8, lore: 8, timeline: 8, ideas: 5, chapters: 8, scenes: 8, sceneChars: 900 },
  current_chapter: { characters: 12, relationships: 18, locations: 8, lore: 8, timeline: 8, ideas: 5, chapters: 2, scenes: 16, sceneChars: 2600 },
  current_character: { characters: 8, relationships: 18, locations: 8, lore: 8, timeline: 10, ideas: 6, chapters: 8, scenes: 12, sceneChars: 1200 },
  entire_project: { characters: 200, relationships: 400, locations: 160, lore: 160, timeline: 180, ideas: 100, chapters: 160, scenes: 260, sceneChars: 2200 },
}

export function normalizeAiContextMode(mode) {
  return AI_CHAT_CONTEXT_MODES.some(item => item.id === mode) ? mode : 'smart'
}

export function loadAiContextMode() {
  try { return normalizeAiContextMode(localStorage.getItem(AI_CHAT_CONTEXT_MODE_KEY)) } catch { return 'smart' }
}

export function saveAiContextMode(mode) {
  try { localStorage.setItem(AI_CHAT_CONTEXT_MODE_KEY, normalizeAiContextMode(mode)) } catch { /* ignore */ }
}

const truncate = (value = '', max = 600) => {
  const text = String(value || '').trim()
  return text.length > max ? `${text.slice(0, max).trim()}...` : text
}

const sortByOrder = items => [...(items || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
const words = value => String(value || '').toLowerCase().match(/[a-z0-9']+/g) || []
const unique = arr => [...new Set(arr.filter(Boolean))]
const hasId = (item, id) => id && item?.id === id
const linkedIds = item => [
  ...(item?.characterIds || []),
  ...(item?.linkedCharacters || []),
  ...(item?.locationIds || []),
  ...(item?.linkedLocations || []),
  ...(item?.loreIds || []),
]

function projectStore(store, projectId) {
  return store?.getProjectContextData?.(projectId) ?? store ?? {}
}

export function fingerprintText(value = '') {
  let hash = 2166136261
  const text = String(value || '')
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function getActiveChapterId(store, explicitId) {
  if (explicitId) return explicitId
  const sceneId = store.writingSceneId || store.selectedSceneId
  const scene = (store.scenes || []).find(item => item.id === sceneId)
  return scene?.chapterId || null
}

function searchableText(item) {
  return [
    item?.name, item?.title, item?.role, item?.category, item?.type, item?.description,
    item?.bio, item?.content, item?.synopsis, item?.body, item?.group, item?.locationTag,
    ...(item?.keywords || []), ...(item?.tags || []),
  ].filter(Boolean).join(' ')
}

function relevanceScore(item, queryTerms, activeIds = []) {
  let score = activeIds.some(id => hasId(item, id)) ? 100 : 0
  const text = searchableText(item).toLowerCase()
  queryTerms.forEach(term => {
    if (term.length < 3) return
    if (text.includes(term)) score += 4
  })
  return score
}

function rank(items, queryTerms, activeIds = []) {
  return [...(items || [])]
    .map((item, index) => ({ item, score: relevanceScore(item, queryTerms, activeIds), index }))
    .filter(row => row.score > 0 || activeIds.some(id => hasId(row.item, id)))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(row => row.item)
}

function relationshipRows(characters, focusedIds = []) {
  const byId = new Map((characters || []).map(c => [c.id, c]))
  const rows = []
  ;(characters || []).forEach(character => {
    ;(character.relationships || []).forEach(rel => {
      const target = byId.get(rel.targetId)
      if (!target) return
      if (focusedIds.length && !focusedIds.includes(character.id) && !focusedIds.includes(target.id)) return
      rows.push(`${character.name} -> ${target.name}: ${rel.type || 'related'}`)
    })
  })
  return rows
}

function collectChapterScenes(store, chapterIds) {
  const ids = new Set(chapterIds)
  return sortByOrder(store.scenes || []).filter(scene => ids.has(scene.chapterId))
}

function collectRelatedIds(store, seedCharacters = [], seedChapters = [], seedScenes = []) {
  const characterIds = new Set(seedCharacters.map(c => c.id))
  const locationIds = new Set()
  const loreIds = new Set()
  const timelineIds = new Set()
  const chapterIds = new Set(seedChapters.map(c => c.id))
  const sceneIds = new Set(seedScenes.map(s => s.id))

  seedScenes.forEach(scene => {
    ;(store.characters || []).forEach(character => {
      const aliases = unique([character.name, ...(character.keywords || [])]).map(value => String(value).toLowerCase()).filter(Boolean)
      if (aliases.some(alias => alias && String(scene.content || scene.synopsis || '').toLowerCase().includes(alias))) characterIds.add(character.id)
    })
    ;(store.locations || []).forEach(location => {
      if (scene.locationTag === location.name || String(scene.content || scene.synopsis || '').toLowerCase().includes(String(location.name || '').toLowerCase())) locationIds.add(location.id)
    })
  })

  ;(store.characters || []).forEach(character => {
    if (!characterIds.has(character.id)) return
    ;(character.relationships || []).forEach(rel => { if (rel.targetId) characterIds.add(rel.targetId) })
  })

  ;(store.locations || []).forEach(location => {
    if ((location.characterIds || []).some(id => characterIds.has(id))) locationIds.add(location.id)
  })
  ;(store.loreEntries || []).forEach(entry => {
    if (linkedIds(entry).some(id => characterIds.has(id) || locationIds.has(id))) loreIds.add(entry.id)
  })
  ;[...(store.timeline || []), ...(store.worldHistory || [])].forEach(entry => {
    if (linkedIds(entry).some(id => characterIds.has(id) || locationIds.has(id))) timelineIds.add(entry.id)
  })
  ;(store.scenes || []).forEach(scene => {
    if (!sceneIds.has(scene.id) && [...characterIds].some(id => {
      const character = (store.characters || []).find(c => c.id === id)
      return character?.name && String(scene.content || scene.synopsis || '').toLowerCase().includes(character.name.toLowerCase())
    })) {
      sceneIds.add(scene.id)
      if (scene.chapterId) chapterIds.add(scene.chapterId)
    }
  })

  return { characterIds, locationIds, loreIds, timelineIds, chapterIds, sceneIds }
}

function selectRecords(store, mode, userPrompt, activeCharacterId, activeChapterId) {
  const queryTerms = unique(words(userPrompt).filter(term => term.length > 2))
  const limits = SECTION_LIMITS[mode] || SECTION_LIMITS.smart
  const selected = { effectiveMode: mode, fallbackReason: '', characters: [], locations: [], lore: [], timeline: [], ideas: [], chapters: [], scenes: [] }

  if (mode === 'entire_project') {
    selected.characters = sortByOrder(store.characters).slice(0, limits.characters)
    selected.locations = sortByOrder(store.locations).slice(0, limits.locations)
    selected.lore = sortByOrder(store.loreEntries).slice(0, limits.lore)
    selected.timeline = [...sortByOrder(store.timeline), ...sortByOrder(store.worldHistory)].slice(0, limits.timeline)
    selected.ideas = sortByOrder(store.ideaEntries).slice(0, limits.ideas)
    selected.chapters = sortByOrder(store.chapters).slice(0, limits.chapters)
    selected.scenes = sortByOrder(store.scenes).slice(0, limits.scenes)
    return selected
  }

  if (mode === 'current_chapter') {
    const chapter = (store.chapters || []).find(item => item.id === activeChapterId)
    if (!chapter) return { ...selectRecords(store, 'smart', userPrompt, activeCharacterId, activeChapterId), effectiveMode: 'smart', fallbackReason: 'No current chapter is selected, so Smart Context will be used.' }
    const scenes = collectChapterScenes(store, [chapter.id])
    const related = collectRelatedIds(store, [], [chapter], scenes)
    selected.chapters = [chapter]
    selected.scenes = scenes.slice(0, limits.scenes)
    selected.characters = (store.characters || []).filter(c => related.characterIds.has(c.id)).slice(0, limits.characters)
    selected.locations = (store.locations || []).filter(l => related.locationIds.has(l.id)).slice(0, limits.locations)
    selected.lore = (store.loreEntries || []).filter(e => related.loreIds.has(e.id)).slice(0, limits.lore)
    selected.timeline = [...(store.timeline || []), ...(store.worldHistory || [])].filter(e => related.timelineIds.has(e.id)).slice(0, limits.timeline)
    selected.ideas = rank(store.ideaEntries, queryTerms).slice(0, limits.ideas)
    return selected
  }

  if (mode === 'current_character') {
    const character = (store.characters || []).find(item => item.id === activeCharacterId)
    if (!character) return { ...selectRecords(store, 'smart', userPrompt, activeCharacterId, activeChapterId), effectiveMode: 'smart', fallbackReason: 'No current character is selected, so Smart Context will be used.' }
    const related = collectRelatedIds(store, [character], [], [])
    selected.characters = unique([character.id, ...related.characterIds].map(id => (store.characters || []).find(c => c.id === id))).slice(0, limits.characters)
    selected.locations = (store.locations || []).filter(l => related.locationIds.has(l.id) || (l.characterIds || []).includes(character.id)).slice(0, limits.locations)
    selected.lore = (store.loreEntries || []).filter(e => linkedIds(e).includes(character.id)).slice(0, limits.lore)
    selected.timeline = [...(store.timeline || []), ...(store.worldHistory || [])].filter(e => linkedIds(e).includes(character.id)).slice(0, limits.timeline)
    selected.scenes = (store.scenes || []).filter(scene => String(scene.content || scene.synopsis || '').toLowerCase().includes(String(character.name || '').toLowerCase())).slice(0, limits.scenes)
    selected.chapters = unique(selected.scenes.map(scene => (store.chapters || []).find(ch => ch.id === scene.chapterId))).slice(0, limits.chapters)
    selected.ideas = rank(store.ideaEntries, queryTerms, [character.id]).slice(0, limits.ideas)
    return selected
  }

  const activeIds = [activeCharacterId, activeChapterId].filter(Boolean)
  selected.characters = rank(store.characters, queryTerms, [activeCharacterId]).slice(0, limits.characters)
  selected.locations = rank(store.locations, queryTerms).slice(0, limits.locations)
  selected.lore = rank(store.loreEntries, queryTerms).slice(0, limits.lore)
  selected.timeline = rank([...(store.timeline || []), ...(store.worldHistory || [])], queryTerms).slice(0, limits.timeline)
  selected.ideas = rank(store.ideaEntries, queryTerms).slice(0, limits.ideas)
  selected.chapters = rank(store.chapters, queryTerms, [activeChapterId]).slice(0, limits.chapters)
  selected.scenes = rank(store.scenes, queryTerms, activeIds).slice(0, limits.scenes)
  return selected
}

function formatProjectSummary(store) {
  const novel = store.activeNovel || {}
  const typeCfg = getProjectType(novel.type)
  const lines = [
    'PROJECT SUMMARY',
    `Title: ${novel.title || 'Untitled'}`,
    `Type: ${typeCfg.label}`,
  ]
  if (novel.description) lines.push(`Premise: ${truncate(novel.description, 900)}`)
  if (novel.tags?.length) lines.push(`Tags: ${novel.tags.join(', ')}`)
  return lines.join('\n')
}

function formatRecords(store, selected, mode) {
  const limits = SECTION_LIMITS[mode] || SECTION_LIMITS.smart
  const lines = []

  if (selected.chapters.length) {
    lines.push('', 'OUTLINE DATA')
    selected.chapters.forEach(chapter => lines.push(`- ${chapter.title || 'Untitled'}${chapter.summary ? `: ${truncate(chapter.summary, 300)}` : ''}`))
  }
  if (selected.characters.length) {
    lines.push('', 'RELEVANT CHARACTERS')
    selected.characters.forEach(c => {
      lines.push(`- ${c.name || 'Unnamed'}${c.role ? ` (${c.role})` : ''}${c.bio ? `: ${truncate(c.bio, 500)}` : ''}`)
      if (c.pronouns || c.familyGroup || c.keywords?.length) lines.push(`  Details: ${[c.pronouns, c.familyGroup && `Family ${c.familyGroup}`, c.keywords?.length && `Aliases ${c.keywords.join(', ')}`].filter(Boolean).join(' | ')}`)
      if (c.internalGoal || c.externalGoal) lines.push(`  Goals: ${[c.internalGoal, c.externalGoal].filter(Boolean).join(' | ')}`)
    })
  }
  const relationships = relationshipRows(store.characters, selected.characters.map(c => c.id)).slice(0, limits.relationships)
  if (relationships.length) lines.push('', 'RELATIONSHIPS', ...relationships.map(row => `- ${row}`))
  if (selected.locations.length) {
    lines.push('', 'RELEVANT LOCATIONS')
    selected.locations.forEach(l => lines.push(`- ${l.name || 'Unnamed'}${l.category ? ` (${l.category})` : ''}: ${truncate(l.description, 450)}`))
  }
  if (selected.lore.length) {
    lines.push('', 'RELEVANT LORE')
    selected.lore.forEach(e => lines.push(`- ${e.title || 'Untitled'}${e.category ? ` (${e.category})` : ''}: ${truncate(e.content, 600)}`))
  }
  if (selected.timeline.length) {
    lines.push('', 'TIMELINE / HISTORY')
    selected.timeline.forEach(e => lines.push(`- ${[e.date, e.era, e.dateRange].filter(Boolean).join(' / ') || 'Undated'}: ${e.title || 'Untitled'} - ${truncate(e.description || e.content, 400)}`))
  }
  if (selected.ideas.length) {
    lines.push('', 'RELEVANT NOTES / IDEAS')
    selected.ideas.forEach(e => lines.push(`- ${e.title || 'Untitled'}${e.group ? ` (${e.group})` : ''}: ${truncate(e.body || e.description, 400)}`))
  }
  if (selected.scenes.length) {
    lines.push('', 'RELEVANT MANUSCRIPT EXCERPTS')
    const chaptersById = new Map((store.chapters || []).map(ch => [ch.id, ch]))
    selected.scenes.forEach(scene => {
      const chapter = chaptersById.get(scene.chapterId)
      lines.push(`- ${chapter?.title ? `${chapter.title} / ` : ''}${scene.title || 'Untitled scene'}`)
      if (scene.synopsis) lines.push(`  Summary: ${truncate(scene.synopsis, 350)}`)
      if (scene.pov || scene.locationTag) lines.push(`  Metadata: ${[scene.pov && `POV ${scene.pov}`, scene.locationTag && `Location ${scene.locationTag}`].filter(Boolean).join(' | ')}`)
      if (scene.content) lines.push(`  Excerpt: ${truncate(scene.content, limits.sceneChars)}`)
    })
  }
  return lines.join('\n')
}

function capContext(text, safeInputBudget, warnings) {
  const tokens = estimateTokens(text)
  if (tokens <= safeInputBudget) return { text, estimatedTokens: tokens, truncated: false }
  const approxChars = Math.max(1000, Math.floor(safeInputBudget * 3.7))
  warnings.push('Your project exceeds this model\'s context window. YOW will include as much relevant context as possible.')
  const capped = `${text.slice(0, approxChars).trim()}\n\n[Context truncated to fit the selected model.]`
  return { text: capped, estimatedTokens: estimateTokens(capped), truncated: true }
}

export function buildAIContext({
  projectId,
  mode = 'smart',
  userPrompt = '',
  activeCharacterId = null,
  activeChapterId = null,
  provider = 'openrouter',
  model = '',
  store,
  customInstruction = '',
} = {}) {
  const scopedStore = projectStore(store, projectId)
  const requestedMode = normalizeAiContextMode(mode)
  const chapterId = getActiveChapterId(scopedStore, activeChapterId)
  const budget = getSafeInputBudget(provider, model)
  const capabilities = getModelCapabilities(provider, model)
  const warnings = []
  const selected = selectRecords(scopedStore, requestedMode, userPrompt, activeCharacterId ?? scopedStore.selectedCharacterId, chapterId)
  if (selected.fallbackReason) warnings.push(selected.fallbackReason)
  const projectSummary = formatProjectSummary(scopedStore)
  const selectedContext = formatRecords(scopedStore, selected, selected.effectiveMode)
  const stableContext = selected.effectiveMode === 'smart'
    ? projectSummary
    : [projectSummary, selectedContext].filter(Boolean).join('\n\n')
  const requestContext = selected.effectiveMode === 'smart' ? selectedContext : ''
  const sections = [stableContext, requestContext]
  if (customInstruction?.trim()) sections.push(`ADDITIONAL USER CONTEXT\n${customInstruction.trim()}`)
  const capped = capContext(sections.filter(Boolean).join('\n\n'), budget.safeInputBudget, warnings)
  const contextLevel = getContextUsageLevel(capped.estimatedTokens, budget.contextWindow)
  const estimatedInputCost = estimateInputCost({
    provider,
    model,
    inputTokens: capped.estimatedTokens,
    cachedInputTokens: 0,
  })
  if (budget.limitsKnown && capped.estimatedTokens > budget.safeInputBudget * 0.65) {
    warnings.push('Large context - this request may use a significant portion of your provider\'s rate limit.')
  }
  if (selected.effectiveMode === 'entire_project' && budget.limitsKnown && capped.estimatedTokens > budget.safeInputBudget * 0.82) {
    warnings.push('Your project is close to this model\'s context limit. YOW will reserve space for the AI response.')
  }
  const sourceLabels = [
    ...selected.characters.map(item => item.name && `Character: ${item.name}`),
    ...relationshipRows(scopedStore.characters, selected.characters.map(c => c.id)).slice(0, 6).map(row => `Relationship: ${row}`),
    ...selected.locations.map(item => item.name && `Location: ${item.name}`),
    ...selected.lore.map(item => item.title && `Lore: ${item.title}`),
    ...selected.timeline.map(item => item.title && `Timeline: ${item.title}`),
    ...selected.ideas.map(item => item.title && `Idea: ${item.title}`),
    ...selected.chapters.map(item => item.title && `Chapter: ${item.title}`),
    ...selected.scenes.map(item => item.title && `Excerpt: ${item.title}`),
  ].filter(Boolean)
  const stableFingerprint = fingerprintText(`${provider}:${model}:${selected.effectiveMode}:${stableContext}`)
  const contextFingerprint = fingerprintText(`${stableFingerprint}:${requestContext}:${customInstruction || ''}`)
  return {
    context: capped.text,
    stableContext,
    requestContext,
    stableFirst: true,
    stableFingerprint,
    contextFingerprint,
    cache: {
      eligible: capabilities.supportsPromptCaching && estimateTokens(stableContext) >= capabilities.cacheMinTokens,
      behavior: capabilities.cacheBehavior,
      minTokens: capabilities.cacheMinTokens,
    },
    estimatedTokens: capped.estimatedTokens,
    contextLevel,
    estimatedInputCost,
    includedSources: {
      mode: selected.effectiveMode,
      characters: selected.characters.map(item => item.id),
      locations: selected.locations.map(item => item.id),
      lore: selected.lore.map(item => item.id),
      timeline: selected.timeline.map(item => item.id),
      ideas: selected.ideas.map(item => item.id),
      chapters: selected.chapters.map(item => item.id),
      scenes: selected.scenes.map(item => item.id),
      labels: sourceLabels,
    },
    truncated: capped.truncated,
    warnings: unique(warnings),
    safeInputBudget: budget.safeInputBudget,
    contextWindow: budget.contextWindow,
    limitsKnown: budget.limitsKnown,
  }
}
