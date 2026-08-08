export { EXPORT_PDF_THEME_OPTIONS } from './projectExportThemes.js'

export {
  downloadBlob,
  getProjectExportFilename,
  getProjectDocxFilename,
  getProjectDocxZipFilename,
  getProjectPdfFilename,
} from './projectExportHelpers.js'

import { isComicProject } from './projectExportHelpers.js'
import { buildZipBlob, encodeTextFile } from './zipUtils.js'

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

export const createProjectZipBlob = (projectData) => {
  const now = new Date()
  const files = [
    jsonFile('manifest.json', {
      app: 'YOW',
      format: 'yow-project-export',
      exportedAt: now.toISOString(),
      projectId: projectData.project?.id ?? null,
      projectTitle: projectData.project?.title ?? 'Untitled Project',
    }),
    jsonFile('project-data.json', projectData),
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
