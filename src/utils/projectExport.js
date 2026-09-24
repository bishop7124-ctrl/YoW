export { EXPORT_PDF_THEME_OPTIONS } from './projectExportThemes.js'

export {
  downloadBlob,
  getProjectExportFilename,
  getProjectDocxFilename,
  getProjectDocxZipFilename,
  getProjectPdfFilename,
} from './projectExportHelpers.js'

import { isComicProject, YOW_EXPORT_SCHEMA_VERSION } from './projectExportHelpers.js'
import { buildZipBlob, encodeTextFile } from './zipUtils.js'
import { getSignedUserMediaUrl, getUserMediaPath } from './uploadUserMedia.js'

export {
  createProjectDocxBlob,
  createProjectDocxEntries,
  createProjectDocxZipBlob,
  downloadProjectDocx,
  downloadProjectDocxZip,
} from './projectExportDocx.js'

export {
  createProjectPdfBlob,
  downloadProjectPdf,
  createProjectVisualPdfHtml,
  openProjectVisualPdf,
} from './projectExportPdf.js'

// ─── ZIP export ───────────────────────────────────────────────────────────────

const jsonFile = (name, value) => ({
  name,
  bytes: encodeTextFile(`${JSON.stringify(value, null, 2)}\n`),
})

export { buildZipBlob }

const bytesToBase64 = bytes => {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

const inferImageType = path => {
  const extension = path.split('.').pop()?.toLowerCase()
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'gif') return 'image/gif'
  return 'application/octet-stream'
}

/**
 * Makes a project backup self-contained by replacing private Storage
 * references with inline image data. The normal cloud-save safety net uploads
 * those data URLs into the restoring account's own Storage namespace, so a
 * restored project never shares object ownership with its source project.
 */
export async function embedProjectMediaForBackup(projectData, options = {}) {
  const resolveMediaUrl = options.resolveMediaUrl || getSignedUserMediaUrl
  const fetchMedia = options.fetchMedia || globalThis.fetch
  const cache = new Map()

  const resolveReference = value => {
    // Rich-text fields may contain an image URL inside a larger HTML string.
    // Only replace standalone persisted media values; rewriting a substring as
    // if the whole field were a URL would destroy the surrounding prose.
    if (!value.startsWith('yow-media:') && !/^https?:\/\//i.test(value)) return Promise.resolve(value)
    const path = getUserMediaPath(value)
    if (!path) return Promise.resolve(value)
    if (!cache.has(path)) {
      cache.set(path, (async () => {
        const url = await resolveMediaUrl(value)
        const response = await fetchMedia(url)
        if (!response?.ok) throw new Error(`Image request failed (${response?.status || 'unknown status'})`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        const responseType = response.headers?.get?.('content-type')?.split(';')[0]
        const mimeType = responseType?.startsWith('image/') ? responseType : inferImageType(path)
        return `data:${mimeType};base64,${bytesToBase64(bytes)}`
      })())
    }
    return cache.get(path)
  }

  const walk = async value => {
    if (typeof value === 'string') return resolveReference(value)
    if (Array.isArray(value)) return Promise.all(value.map(walk))
    if (!value || typeof value !== 'object') return value
    const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await walk(item)]))
    return Object.fromEntries(entries)
  }

  try {
    return await walk(projectData)
  } catch (error) {
    throw new Error('This backup could not include one or more images. Re-upload any broken images and try again.', { cause: error })
  }
}

export const createProjectZipBlob = async (projectData, options = {}) => {
  const portableProjectData = await embedProjectMediaForBackup(projectData, options)
  const now = new Date()
  const files = [
    jsonFile('manifest.json', {
      app: 'YOW',
      format: 'yow-project-export',
      schemaVersion: YOW_EXPORT_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      projectId: portableProjectData.project?.id ?? null,
      projectTitle: portableProjectData.project?.title ?? 'Untitled Project',
    }),
    jsonFile('project-data.json', portableProjectData),
    // project-data.json is the authoritative restore payload and contains
    // the inline media. Keep the convenience per-section JSON files on the
    // compact original references so large base64 images are not duplicated
    // throughout this uncompressed archive.
    jsonFile('data/project.json', projectData.project ?? {}),
    jsonFile('data/series.json', projectData.series ?? null),
    jsonFile('data/characters.json', projectData.characters ?? []),
    jsonFile('data/factions.json', projectData.factions ?? []),
    jsonFile('data/locations.json', projectData.locations ?? []),
    jsonFile('data/timeline.json', projectData.timeline ?? []),
    jsonFile('data/world-history.json', projectData.worldHistory ?? []),
    jsonFile('data/eras.json', projectData.eras ?? []),
    jsonFile('data/acts.json', projectData.acts ?? []),
    jsonFile('data/chapters.json', projectData.chapters ?? []),
    jsonFile('data/scenes.json', projectData.scenes ?? []),
    jsonFile('data/lore.json', projectData.loreEntries ?? []),
    jsonFile('data/ideas.json', projectData.ideaEntries ?? []),
    jsonFile('data/maps.json', projectData.maps ?? []),
    jsonFile('data/whiteboards.json', projectData.whiteboards ?? []),
    jsonFile('data/schedule.json', projectData.storySchedule ?? []),
    ...(isComicProject(projectData.project) ? [
      jsonFile('data/comic-pages.json', projectData.comicPages ?? []),
      jsonFile('data/comic-panels.json', projectData.comicPanels ?? []),
    ] : []),
  ]

  return buildZipBlob(files)
}
