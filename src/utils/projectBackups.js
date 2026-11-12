// Project backup snapshots (audit AUD-08). Pure helpers shared by the Project Settings screen and the automatic
// scheduler, so a due backup is made from the app itself and not only while a settings dialog happens to be open.
//
// Snapshots are kept ON THIS DEVICE (in this browser's or the desktop app's storage under nf_project_backups_<id>).
// They are not a ZIP file anywhere until the writer downloads one from Project Settings.

import { getUserMediaPath } from './uploadUserMedia.js'

export const BACKUP_DEFAULTS = { frequency: 'manual', retention: 5, includeMedia: true }
export const backupKey = projectId => `nf_project_backups_${projectId}`
export const MIN_RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

export const normalizeRetention = value => Math.max(1, Math.min(20, Number(value) || BACKUP_DEFAULTS.retention))

export function shouldCreateAutoBackup(config, lastBackupAt, now = Date.now()) {
  if (!config || (config.frequency !== 'daily' && config.frequency !== 'weekly')) return false
  const last = lastBackupAt ? Date.parse(lastBackupAt) : NaN
  if (!Number.isFinite(last)) return true
  return now - last >= (config.frequency === 'weekly' ? 7 * DAY_MS : DAY_MS)
}

// Leaves out every uploaded image, wherever it sits in the project (covers, portraits, faction logos, map
// backdrops, comic art and so on), by clearing each stored value that IS an image reference or an embedded image.
// It walks the whole snapshot instead of naming fields, so images added by later features are covered too
// (audit AUD-18). Text, including rich text that merely contains an image tag, is never touched.
// Only a value that is wholly an image reference counts. A longer string that merely contains an address (a scene's
// text with an image tag in it) is prose and is left alone.
const isImageValue = value => typeof value === 'string'
  && (/^data:image\//i.test(value)
    || (/^(yow-media:|https?:\/\/)/i.test(value) && !/\s/.test(value) && Boolean(getUserMediaPath(value))))
export function stripMediaFromBackup(value) {
  if (isImageValue(value)) return null
  if (Array.isArray(value)) return value.map(stripMediaFromBackup)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripMediaFromBackup(item)]))
  return value
}

export function readBackups(readItem, projectId) {
  try {
    const list = JSON.parse(readItem(backupKey(projectId)) || '[]')
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

// The snapshot entry for a project's export data, with the writer's media and metadata choices applied.
export function buildBackupEntry(exportData, config, kind = 'manual', source = 'project-settings', now = Date.now()) {
  if (!exportData) return null
  const prepared = config.includeMedia ? exportData : stripMediaFromBackup(exportData)
  const createdAt = new Date(now).toISOString()
  return {
    id: `${kind}-${now}`,
    kind,
    createdAt,
    title: exportData.project?.title || 'Untitled project',
    data: { ...prepared, backup: { createdAt, source, config } },
  }
}

// Makes the automatic snapshot when one is due. Never throws: a failed write leaves the project untouched and is
// not retried for an hour, so a full disk cannot turn into a loop. Returns { created, reason }.
const lastFailureByProject = new Map()
export function runAutoBackupIfDue({ novel, getProjectExportData, readItem, writeItem, updateNovel, now = Date.now() }) {
  const projectId = novel?.id
  if (!projectId) return { created: false, reason: 'no-project' }
  const config = { ...BACKUP_DEFAULTS, ...(novel.backupConfig || {}) }
  if (!shouldCreateAutoBackup(config, novel.backupConfig?.lastBackupAt, now)) return { created: false, reason: 'not-due' }
  const failedAt = lastFailureByProject.get(projectId)
  if (failedAt && now - failedAt < MIN_RETRY_AFTER_FAILURE_MS) return { created: false, reason: 'cooling-down' }
  try {
    const entry = buildBackupEntry(getProjectExportData?.(projectId), config, 'auto', 'automatic', now)
    if (!entry) return { created: false, reason: 'no-data' }
    const next = [entry, ...readBackups(readItem, projectId)].slice(0, normalizeRetention(config.retention))
    writeItem(backupKey(projectId), JSON.stringify(next))
    lastFailureByProject.delete(projectId)
    updateNovel(projectId, { backupConfig: { ...(novel.backupConfig || {}), ...config, lastBackupAt: entry.createdAt } })
    return { created: true, reason: 'created' }
  } catch (error) {
    lastFailureByProject.set(projectId, now)
    console.warn('Automatic project backup failed:', error)
    return { created: false, reason: 'failed' }
  }
}

export const resetBackupFailuresForTests = () => lastFailureByProject.clear()
