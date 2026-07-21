import { getProjectType } from '../constants/projectTypes'
import { wordCount } from './projectExportHelpers'

const scoped = (items, projectId) => (items || []).filter(item => item.novelId === projectId)
const CAMPAIGN_PROJECT_TYPES = new Set(['dnd_campaign', 'tabletop_rpg'])
const SESSION_PLAN_KEYS = ['hooks', 'encounters', 'npcs', 'rewards', 'consequences', 'notes']
const SESSION_RECAP_KEYS = ['summary', 'playerChoices', 'fallout', 'nextHooks']

const getLatestTimestamp = (items) => {
  const timestamps = items
    .flatMap(item => [item.updatedAt, item.lastModified, item.createdAt, item.created])
    .map(value => {
      if (!value) return 0
      const timestamp = typeof value === 'number' ? value : Date.parse(value)
      return Number.isFinite(timestamp) ? timestamp : 0
    })
  return Math.max(0, ...timestamps)
}

const formatDate = (value) => {
  if (!value) return 'Not started'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not started'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export const isCampaignProjectType = (type) => CAMPAIGN_PROJECT_TYPES.has(type)

export const buildCampaignStats = (project, chapters, scenes) => {
  if (!isCampaignProjectType(project?.type)) return null

  const filledCount = (source, keys) => keys.filter(key => String(source?.[key] || '').trim()).length
  const plannedSessions = chapters.length
  const encounterCount = scenes.length
  const planFieldsFilled = chapters.reduce((sum, chapter) => sum + filledCount(chapter.sessionPlan, SESSION_PLAN_KEYS), 0)
  const recapFieldsFilled = chapters.reduce((sum, chapter) => sum + filledCount(chapter.sessionRecap, SESSION_RECAP_KEYS), 0)
  const totalPlanFields = plannedSessions * SESSION_PLAN_KEYS.length
  const totalRecapFields = plannedSessions * SESSION_RECAP_KEYS.length
  const sessionTarget = Number(project?.sessionTarget || project?.sessionCountTarget || project?.targetSessions || 0)
  const sessionProgress = sessionTarget > 0 ? Math.round((plannedSessions / sessionTarget) * 100) : null
  const prepCoverage = totalPlanFields > 0 ? Math.round((planFieldsFilled / totalPlanFields) * 100) : 0
  const recapCoverage = totalRecapFields > 0 ? Math.round((recapFieldsFilled / totalRecapFields) * 100) : 0

  return {
    plannedSessions,
    encounterCount,
    planFieldsFilled,
    recapFieldsFilled,
    totalPlanFields,
    totalRecapFields,
    sessionTarget,
    sessionProgress,
    prepCoverage,
    recapCoverage,
    sessionsWithPrep: chapters.filter(chapter => filledCount(chapter.sessionPlan, SESSION_PLAN_KEYS) > 0).length,
    sessionsWithRecap: chapters.filter(chapter => filledCount(chapter.sessionRecap, SESSION_RECAP_KEYS) > 0).length,
  }
}

export const buildProjectStats = (project, data) => {
  const projectId = project?.id
  const projectType = getProjectType(project?.type)
  const characters = scoped(data.characters, projectId)
  const factions = scoped(data.factions, projectId)
  const locations = scoped(data.locations, projectId)
  const timeline = scoped(data.timeline, projectId)
  const worldHistory = scoped(data.worldHistory, projectId)
  const acts = scoped(data.acts, projectId)
  const chapters = scoped(data.chapters, projectId)
  // Exclude conflict copies (see mergeSceneUpdateWithPersistedCopy in useStore.js) —
  // they're a two-tab safety net, not real manuscript content, and would otherwise
  // double-count words.
  const scenes = scoped(data.scenes, projectId).filter(scene => !scene.conflictOf)
  const loreEntries = scoped(data.loreEntries, projectId)
  const ideaEntries = scoped(data.ideaEntries, projectId)
  const maps = scoped(data.maps, projectId)
  const whiteboard = scoped(data.whiteboards, projectId)[0]?.whiteboard || { notes: [], groups: [] }
  const activeMapId = data.activeMapByNovel?.[projectId] ?? maps[0]?.id ?? null
  const activeMap = maps.find(map => map.id === activeMapId) ?? maps[0] ?? null
  const manuscriptWords = scenes.reduce((sum, scene) => sum + wordCount(scene.content), 0)
  const planningItems =
    characters.length +
    factions.length +
    locations.length +
    timeline.length +
    worldHistory.length +
    loreEntries.length +
    ideaEntries.length
  const latestTimestamp = getLatestTimestamp([
    project,
    ...characters,
    ...factions,
    ...locations,
    ...timeline,
    ...worldHistory,
    ...acts,
    ...chapters,
    ...scenes,
    ...loreEntries,
    ...ideaEntries,
    ...maps,
  ])

  return {
    project,
    projectType,
    characters,
    factions,
    locations,
    timeline,
    worldHistory,
    acts,
    chapters,
    scenes,
    loreEntries,
    ideaEntries,
    maps,
    whiteboard,
    activeMap,
    activeMapId,
    manuscriptWords,
    campaignStats: buildCampaignStats(project, chapters, scenes),
    planningItems,
    latestTimestamp,
    updatedLabel: formatDate(latestTimestamp || project?.createdAt),
    createdLabel: formatDate(project?.createdAt),
  }
}

export const buildAllProjectStats = (projects, data) =>
  (projects || []).map(project => buildProjectStats(project, data))
