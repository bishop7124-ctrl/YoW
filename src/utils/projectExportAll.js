// Bulk "export all projects" action — used by the Storage settings panel and
// the cloud-hosting pre-expiry warning modal. Downloads each project one at a
// time (sequential, not parallel) so the browser's popup/download blocker
// doesn't swallow anything past the first file, matching the existing
// one-at-a-time pattern already used for the delete-account backup flow.
import { createProjectZipBlob } from './projectExport.js'
import { downloadProjectDocx } from './projectExportDocx.js'
import { downloadBlob, getProjectExportFilename } from './projectExportHelpers.js'

export const EXPORT_ALL_FORMATS = { ZIP: 'zip', DOCX: 'docx' }

/**
 * @param {object} store - the app store (must expose getProjectExportData(id))
 * @param {Array} novels - project summaries with at least an `id`
 * @param {'zip'|'docx'} format
 * @param {{ onProgress?: (done: number, total: number, novel: object) => void }} options
 * @returns {Promise<{ id: string, title: string, ok: boolean, error?: Error }[]>}
 */
export async function exportAllProjects(store, novels, format = EXPORT_ALL_FORMATS.ZIP, { onProgress } = {}) {
  const results = []
  const list = novels ?? []
  for (const novel of list) {
    const projectData = store?.getProjectExportData?.(novel.id)
    let ok = false
    let error = null
    if (!projectData) {
      error = new Error('Project data unavailable')
    } else {
      try {
        if (format === EXPORT_ALL_FORMATS.DOCX) {
          await downloadProjectDocx(projectData)
        } else {
          const blob = createProjectZipBlob(projectData)
          await downloadBlob(blob, getProjectExportFilename(projectData.project))
        }
        ok = true
      } catch (err) {
        error = err
        console.error('[export-all] failed for project', novel.id, err)
      }
    }
    results.push({ id: novel.id, title: novel.title || 'Untitled project', ok, error })
    onProgress?.(results.length, list.length, novel)
  }
  return results
}
