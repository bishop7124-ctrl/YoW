import { wordCount } from './projectExportHelpers'

const RECORD_KEYS = [
  'series',
  'characters',
  'factions',
  'locations',
  'timeline',
  'worldHistory',
  'acts',
  'chapters',
  'scenes',
  'loreEntries',
  'ideaEntries',
  'maps',
  'whiteboards',
  'storySchedule',
  'rpgCharacters',
  'comicPages',
  'comicPanels',
  'eras',
]

const PROJECT_SCOPED_KEYS = [
  'characters',
  'factions',
  'locations',
  'timeline',
  'worldHistory',
  'acts',
  'chapters',
  'scenes',
  'loreEntries',
  'ideaEntries',
  'maps',
  'whiteboards',
  'storySchedule',
  'rpgCharacters',
  'comicPages',
  'comicPanels',
  'eras',
]

function plural(count, singular, pluralLabel = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralLabel}`
}

export function countWordsFromScenes(scenes = []) {
  return scenes.reduce((total, scene) => total + wordCount(scene?.content || ''), 0)
}

export function pruneSaveDataToProjects(data = {}) {
  const novels = Array.isArray(data.novels) ? data.novels.filter(novel => novel?.id) : []
  const projectIds = new Set(novels.map(novel => novel.id))
  const filterProjectRows = rows => (
    Array.isArray(rows) ? rows.filter(row => projectIds.has(row?.novelId)) : []
  )

  const next = { ...data, novels }
  PROJECT_SCOPED_KEYS.forEach(key => {
    next[key] = filterProjectRows(data[key])
  })

  next.series = Array.isArray(data.series)
    ? data.series
        .map(item => ({
          ...item,
          projectOrder: Array.isArray(item.projectOrder)
            ? item.projectOrder.filter(id => projectIds.has(id))
            : [],
        }))
        .filter(item => item.projectOrder.length > 0 || novels.some(novel => novel.seriesId === item.id))
    : []

  next.activeNovelId = projectIds.has(data.activeNovelId) ? data.activeNovelId : novels[0]?.id ?? null
  next.activeMapByNovel = Object.fromEntries(
    Object.entries(data.activeMapByNovel || {}).filter(([projectId]) => projectIds.has(projectId))
  )

  return next
}

export function buildSaveSummary(data = {}) {
  const pruned = pruneSaveDataToProjects(data)
  const projects = pruned.novels.length
  const words = countWordsFromScenes(pruned.scenes || [])
  const entries = RECORD_KEYS.reduce((total, key) => (
    total + (Array.isArray(pruned[key]) ? pruned[key].length : 0)
  ), 0)

  return { projects, words, entries }
}

export function formatSaveSummary(summary = {}) {
  return [
    plural(summary.projects || 0, 'project'),
    plural(summary.words || 0, 'written word'),
    plural(summary.entries || 0, 'saved entry', 'saved entries'),
  ].join(', ')
}
