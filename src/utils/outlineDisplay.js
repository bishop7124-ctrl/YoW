const text = value => value == null ? '' : String(value)
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)
const orderValue = item => Number.isFinite(Number(item?.order)) ? Number(item.order) : Number.MAX_SAFE_INTEGER

export const outlineText = text

export const SESSION_PLAN_FIELDS = [
  { key: 'hooks', label: 'Hooks', placeholder: 'Opening hooks, rumours, clues, or pressure that pulls the party in.' },
  { key: 'encounters', label: 'Encounter flow', placeholder: 'Expected encounter order, alternate paths, and pacing notes.' },
  { key: 'npcs', label: 'NPCs', placeholder: 'NPCs in play, what they want, what they know, and how they react.' },
  { key: 'rewards', label: 'Rewards', placeholder: 'Treasure, boons, clues, levels, favours, or information the party can earn.' },
  { key: 'consequences', label: 'Consequences', placeholder: 'What changes if the party succeeds, fails, delays, or surprises you.' },
  { key: 'notes', label: 'Session notes', placeholder: 'Prep reminders, table logistics, rules calls, safety notes, or improvisation anchors.' },
]

export const SESSION_RECAP_FIELDS = [
  { key: 'summary', label: 'Recap', placeholder: 'What actually happened at the table.' },
  { key: 'playerChoices', label: 'Player choices', placeholder: 'Major decisions, alliances, routes, and unresolved questions.' },
  { key: 'fallout', label: 'Fallout', placeholder: 'World, faction, NPC, location, and campaign-state consequences.' },
  { key: 'nextHooks', label: 'Next hooks', placeholder: 'Threads to bring forward into the next session.' },
]

export const sortOutlineItems = (items = []) => (
  [...(Array.isArray(items) ? items : [])].sort((a, b) => (
    orderValue(a) - orderValue(b)
    || text(a?.title).localeCompare(text(b?.title), undefined, { numeric: true, sensitivity: 'base' })
    || text(a?.id).localeCompare(text(b?.id))
  ))
)

export const outlineSynopsis = item => (
  own(item, 'synopsis') ? text(item.synopsis) : text(item?.summary ?? item?.description)
)

export const outlineWordCount = value => text(value)
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .length

const stringRecord = value => Object.fromEntries(
  Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
    .map(([key, field]) => [key, text(field)])
)

export const normalizeOutlineItem = (item, type) => {
  const value = item && typeof item === 'object' ? item : {}
  const normalized = {
    title: text(value.title),
    synopsis: outlineSynopsis(value),
    storyEvent: text(value.storyEvent),
  }
  if (type === 'chapter') {
    normalized.actId = text(value.actId)
    normalized.sessionPlan = stringRecord(value.sessionPlan)
    normalized.sessionRecap = stringRecord(value.sessionRecap)
  }
  if (type === 'scene') normalized.chapterId = text(value.chapterId)
  return normalized
}

export const outlinePatch = (data, type) => {
  const source = data && typeof data === 'object' ? data : {}
  const patch = { ...source }
  ;['title', 'synopsis', 'storyEvent'].forEach(field => {
    if (own(source, field)) patch[field] = text(source[field])
  })
  if (type === 'chapter') {
    if (own(source, 'actId')) patch.actId = text(source.actId)
    if (own(source, 'sessionPlan')) patch.sessionPlan = stringRecord(source.sessionPlan)
    if (own(source, 'sessionRecap')) patch.sessionRecap = stringRecord(source.sessionRecap)
  }
  if (type === 'scene' && own(source, 'chapterId')) patch.chapterId = text(source.chapterId)
  return patch
}

export const buildOutlineModel = ({ acts = [], chapters = [], scenes = [] } = {}) => {
  const sortedActs = sortOutlineItems(acts)
  const sortedChapters = sortOutlineItems(chapters)
  const sortedScenes = sortOutlineItems(scenes)
  const actIds = new Set(sortedActs.map(item => item?.id))
  const chapterIds = new Set(sortedChapters.map(item => item?.id))
  const chaptersByAct = new Map(sortedActs.map(item => [item.id, []]))
  const scenesByChapter = new Map(sortedChapters.map(item => [item.id, []]))
  const unplacedChapters = []
  const unplacedScenes = []

  sortedChapters.forEach(chapter => {
    if (actIds.has(chapter?.actId)) chaptersByAct.get(chapter.actId).push(chapter)
    else unplacedChapters.push(chapter)
  })
  sortedScenes.forEach(scene => {
    if (chapterIds.has(scene?.chapterId)) scenesByChapter.get(scene.chapterId).push(scene)
    else unplacedScenes.push(scene)
  })

  const chapterEntry = chapter => {
    const childScenes = scenesByChapter.get(chapter.id) || []
    return {
      chapter,
      scenes: childScenes,
      words: childScenes.reduce((sum, scene) => sum + outlineWordCount(scene?.content), 0),
    }
  }
  const entries = sortedActs.map(act => {
    const childChapters = (chaptersByAct.get(act.id) || []).map(chapterEntry)
    return {
      act,
      chapters: childChapters,
      sceneCount: childChapters.reduce((sum, entry) => sum + entry.scenes.length, 0),
      words: childChapters.reduce((sum, entry) => sum + entry.words, 0),
    }
  })

  return {
    acts: entries,
    unplacedChapters: unplacedChapters.map(chapterEntry),
    unplacedScenes,
    totals: {
      acts: sortedActs.length,
      chapters: sortedChapters.length,
      scenes: sortedScenes.length,
      words: sortedScenes.reduce((sum, scene) => sum + outlineWordCount(scene?.content), 0),
    },
  }
}

export const formatOutlineChapterTitle = (chapter, label, number) => {
  const title = text(chapter?.title).trim()
  const escapedLabel = text(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const isDefaultTitle = !title || new RegExp(`^${escapedLabel}(?:\\s+\\d+)?$`, 'i').test(title)
  return isDefaultTitle ? `${label} ${number}` : `${label} ${number}: ${title}`
}

export const getOutlineSceneTitle = (scene, label, number) => {
  const title = text(scene?.title).trim()
  return {
    number: `${label} ${number}`,
    title: title && title.toLocaleLowerCase() !== text(label).toLocaleLowerCase() ? title : '',
  }
}
