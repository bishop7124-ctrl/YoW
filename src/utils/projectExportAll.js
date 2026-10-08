// Bulk "export all projects" action — used by the Storage settings panel and
// the cloud-hosting pre-expiry warning modal.
//
// This bundles every project into its own top-level folder in ONE zip, with
// the normal restorable project ZIP plus readable Word documents inside each
// folder. It triggers a single download, rather than one download per project. Earlier this looped and
// called downloadBlob() once per project; browsers silently block automatic
// downloads past the first in a fast sequence (no error, no rejected
// promise — the file just never lands), which is why "export all" would
// report success but only ever deliver one file, or occasionally none. A
// single bundled download has no such multi-download limit to hit.
import { createProjectZipBlob, buildZipBlob } from './projectExport.js'
import { createProjectDocxEntries } from './projectExportDocx.js'
import { downloadBlob, getProjectExportFilename, sanitizeFilename } from './projectExportHelpers.js'

export const EXPORT_ALL_FORMATS = { ZIP: 'zip', DOCX: 'docx' }

// Keeps entry names collision-free inside the bundle (two projects can
// legitimately share a title/sanitized filename).
const uniqueFolderName = (name, used) => {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  let n = 2
  let candidate = `${name} (${n})`
  while (used.has(candidate)) {
    n += 1
    candidate = `${name} (${n})`
  }
  used.add(candidate)
  return candidate
}

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
  const usedNames = new Set()
  const entries = []

  for (const novel of list) {
    const projectData = store?.getProjectExportData?.(novel.id)
    let ok = false
    let error = null
    if (!projectData) {
      error = new Error('Project data unavailable')
    } else {
      try {
        if (format === EXPORT_ALL_FORMATS.DOCX) {
          const folder = uniqueFolderName(sanitizeFilename(projectData.project?.title, 'project'), usedNames)
          entries.push(...await createProjectDocxEntries(projectData, `${folder}/`))
        } else {
          const folder = uniqueFolderName(sanitizeFilename(projectData.project?.title, 'project'), usedNames)
          const baseName = getProjectExportFilename(projectData.project)
          const blob = await createProjectZipBlob(projectData)
          const bytes = new Uint8Array(await blob.arrayBuffer())
          const wordEntries = await createProjectDocxEntries(projectData, `${folder}/Word documents/`)
          entries.push(
            { name: `${folder}/${baseName}`, bytes },
            ...wordEntries,
          )
        }
        ok = true
      } catch (err) {
        error = err
        console.error('[export-all] failed to build export for project', novel.id, err)
      }
    }
    results.push({ id: novel.id, title: novel.title || 'Untitled project', ok, error })
    onProgress?.(results.length, list.length, novel)
  }

  if (entries.length) {
    const bundle = buildZipBlob(entries)
    const stamp = new Date().toISOString().slice(0, 10)
    const label = format === EXPORT_ALL_FORMATS.DOCX ? 'word-docs' : 'backups'
    const saved = await downloadBlob(bundle, sanitizeFilename(`yow-all-projects-${label}-${stamp}`, 'yow-all-projects') + '.zip')
    // The desktop save dialog resolves null when it was cancelled or the write
    // failed. Nothing reached the disk, so callers that gate "safe to delete"
    // messaging on these results must not see success.
    if (saved === null || saved === undefined) {
      const error = new Error('The backup file was not saved (save cancelled or failed).')
      for (const result of results) {
        if (result.ok) Object.assign(result, { ok: false, error })
      }
    }
  }

  return results
}
