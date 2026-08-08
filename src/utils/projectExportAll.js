// Bulk "export all projects" action — used by the Storage settings panel and
// the cloud-hosting pre-expiry warning modal.
//
// This bundles every project's export into ONE zip and triggers a single
// download, rather than one download per project. Earlier this looped and
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
const uniqueEntryName = (name, used) => {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf('.')
  const base = dot === -1 ? name : name.slice(0, dot)
  const ext = dot === -1 ? '' : name.slice(dot)
  let n = 2
  let candidate = `${base} (${n})${ext}`
  while (used.has(candidate)) {
    n += 1
    candidate = `${base} (${n})${ext}`
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
          const folder = uniqueEntryName(sanitizeFilename(projectData.project?.title, 'project'), usedNames)
          entries.push(...await createProjectDocxEntries(projectData, `${folder}/`))
        } else {
          const blob = createProjectZipBlob(projectData)
          const baseName = getProjectExportFilename(projectData.project)
          const bytes = new Uint8Array(await blob.arrayBuffer())
          entries.push({ name: uniqueEntryName(baseName, usedNames), bytes })
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
    await downloadBlob(bundle, sanitizeFilename(`yow-all-projects-${label}-${stamp}`, 'yow-all-projects') + '.zip')
  }

  return results
}
