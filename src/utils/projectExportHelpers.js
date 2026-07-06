import { getProjectType } from '../constants/projectTypes.js'
import { isDesktopAppRuntime } from './runtime.js'

export const sanitizeFilename = (value, fallback = 'project') => {
  const name = String(value || fallback)
    .trim()
    .replace(/[^a-z0-9._ -]/gi, '_')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
  return name || fallback
}

const getDesktopInvoke = () => {
  if (typeof window === 'undefined') return null
  return window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || null
}

// Desktop webviews ignore anchor-click blob downloads, so exports hand their
// bytes to the native save dialog instead. Resolves with the saved path, or
// null when the user cancels.
const saveBlobWithDesktopDialog = async (blob, filename) => {
  const invoke = getDesktopInvoke()
  if (!invoke) throw new Error('Native save is unavailable in this window.')
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
  return invoke('export_save_file', { fileName: filename, bytes })
}

export const downloadBlob = (blob, filename) => {
  if (isDesktopAppRuntime() && getDesktopInvoke()) {
    return saveBlobWithDesktopDialog(blob, filename).catch(error => {
      console.error('[export] Could not save the file natively', error)
      window.dispatchEvent(new CustomEvent('yow-export-save-error', {
        detail: { filename, message: String(error?.message || error) },
      }))
      return null
    })
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return Promise.resolve(filename)
}

export const stripHtml = (value = '') =>
  String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n/g, '\n')
    .trim()

export const cleanText = (value) => stripHtml(value || '').replace(/\n{3,}/g, '\n\n')

export const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

export const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export const sortByOrder = (items = []) =>
  [...items].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))

export const sortByTitle = (items = [], key = 'title') =>
  [...items].sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || '')))

export const valueList = (...values) =>
  values.filter(value => value !== null && value !== undefined && String(value).trim() !== '')

export const CAMPAIGN_PROJECT_TYPES = new Set(['dnd_campaign', 'tabletop_rpg'])

export const SESSION_PLAN_EXPORT_FIELDS = [
  ['Hooks', 'hooks'],
  ['Encounter flow', 'encounters'],
  ['NPCs', 'npcs'],
  ['Rewards', 'rewards'],
  ['Consequences', 'consequences'],
  ['Session notes', 'notes'],
]

export const SESSION_RECAP_EXPORT_FIELDS = [
  ['Recap', 'summary'],
  ['Player choices', 'playerChoices'],
  ['Fallout', 'fallout'],
  ['Next hooks', 'nextHooks'],
]

export const isCampaignProject = (project) => CAMPAIGN_PROJECT_TYPES.has(project?.type)
export const isComicProject = (project) => project?.type === 'comic'

export const sessionExportRows = (chapter) => [
  ...SESSION_PLAN_EXPORT_FIELDS.map(([label, key]) => [`Plan: ${label}`, chapter?.sessionPlan?.[key]]),
  ...SESSION_RECAP_EXPORT_FIELDS.map(([label, key]) => [`Recap: ${label}`, chapter?.sessionRecap?.[key]]),
].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')

export const sessionExportSummary = (chapter) =>
  sessionExportRows(chapter).map(([label, value]) => `${label}: ${cleanText(value)}`).join('\n')

export const asArray = (value) => {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value)
  return []
}

export const getRelationshipLinks = (character) =>
  asArray(character?.relationships).filter(rel => rel && typeof rel === 'object')

export const getEnabled = (projectData) => {
  const enabled = projectData.project?.enabledSections
  return new Set(Array.isArray(enabled) ? enabled : [
    'outline', 'characters', 'familytree', 'factions', 'locations', 'lore', 'ideas',
    'schedule', 'timeline', 'worldhistory', 'map',
  ])
}

export const buildOutline = (projectData) => {
  const { acts = [], chapters = [], scenes = [] } = projectData
  return sortByOrder(acts).map(act => ({
    act,
    chapters: sortByOrder(chapters.filter(chapter => chapter.actId === act.id)).map(chapter => ({
      chapter,
      scenes: sortByOrder(scenes.filter(scene => scene.chapterId === chapter.id)),
    })),
  }))
}

export const wordCount = (text = '') => cleanText(text).split(/\s+/).filter(Boolean).length

export const buildSummaryStats = (projectData) => {
  const scenes = projectData.scenes ?? []
  const workspaceLabel = getProjectWorkspaceLabel(projectData.project)
  return [
    ['Characters', projectData.characters?.length ?? 0],
    ['Locations', projectData.locations?.length ?? 0],
    ['Lore entries', projectData.loreEntries?.length ?? 0],
    ['Timeline events', projectData.timeline?.length ?? 0],
    [`${workspaceLabel} words`, scenes.reduce((sum, scene) => sum + wordCount(scene.content), 0).toLocaleString()],
  ]
}

export const getProjectBaseName = (project) => sanitizeFilename(project?.title, 'yow-project')

export const getProjectExportLabel = (project) =>
  getProjectType(project?.type).exportLabel || 'Project Encyclopaedia'

export const getProjectExportSlug = (project, fallback = 'project-export') =>
  sanitizeFilename(getProjectExportLabel(project).toLowerCase(), fallback)

export const getProjectWorkspaceLabel = (project) =>
  getProjectType(project?.type).workspaceLabel || 'Manuscript'

export const getProjectExportFilename = (project) =>
  `${getProjectBaseName(project)}.zip`

export const getProjectDocxFilename = (project) =>
  `${getProjectBaseName(project)}-${getProjectExportSlug(project, 'project-export')}.docx`

export const getProjectPdfFilename = (project) =>
  `${getProjectBaseName(project)}-${getProjectExportSlug(project, 'project-export')}.pdf`
