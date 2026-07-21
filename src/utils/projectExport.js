export { EXPORT_PDF_THEME_OPTIONS } from './projectExportThemes.js'

export {
  downloadBlob,
  getProjectExportFilename,
  getProjectDocxFilename,
  getProjectPdfFilename,
} from './projectExportHelpers.js'

import { isComicProject } from './projectExportHelpers.js'

export { createProjectDocxBlob, downloadProjectDocx } from './projectExportDocx.js'

export {
  createProjectPdfBlob,
  downloadProjectPdf,
  createProjectVisualPdfHtml,
  openProjectVisualPdf,
} from './projectExportPdf.js'

// ─── ZIP export ───────────────────────────────────────────────────────────────

const textEncoder = new TextEncoder()

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let j = 0; j < 8; j += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
    }
    table[i] = value >>> 0
  }
  return table
})()

const crc32 = (bytes) => {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const dosTimestamp = (date = new Date()) => {
  const year = Math.max(1980, date.getFullYear())
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2)
  const day =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate()
  return { time, day }
}

const uint16 = (value) => [value & 0xff, (value >>> 8) & 0xff]
const uint32 = (value) => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
]

const concatBytes = (chunks, totalLength) => {
  const output = new Uint8Array(totalLength)
  let offset = 0
  chunks.forEach(chunk => {
    output.set(chunk, offset)
    offset += chunk.length
  })
  return output
}

const jsonFile = (name, value) => ({
  name,
  bytes: textEncoder.encode(`${JSON.stringify(value, null, 2)}\n`),
})

export const createProjectZipBlob = (projectData) => {
  const now = new Date()
  const { time, day } = dosTimestamp(now)
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

  const localChunks = []
  const centralChunks = []
  let offset = 0

  files.forEach(file => {
    const nameBytes = textEncoder.encode(file.name)
    const size = file.bytes.length
    const checksum = crc32(file.bytes)

    const localHeader = new Uint8Array([
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0x0800),
      ...uint16(0),
      ...uint16(time),
      ...uint16(day),
      ...uint32(checksum),
      ...uint32(size),
      ...uint32(size),
      ...uint16(nameBytes.length),
      ...uint16(0),
    ])

    localChunks.push(localHeader, nameBytes, file.bytes)

    const centralHeader = new Uint8Array([
      ...uint32(0x02014b50),
      ...uint16(20),
      ...uint16(20),
      ...uint16(0x0800),
      ...uint16(0),
      ...uint16(time),
      ...uint16(day),
      ...uint32(checksum),
      ...uint32(size),
      ...uint32(size),
      ...uint16(nameBytes.length),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset),
    ])
    centralChunks.push(centralHeader, nameBytes)
    offset += localHeader.length + nameBytes.length + file.bytes.length
  })

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const centralOffset = offset
  const endRecord = new Uint8Array([
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(files.length),
    ...uint16(files.length),
    ...uint32(centralSize),
    ...uint32(centralOffset),
    ...uint16(0),
  ])
  const totalSize = centralOffset + centralSize + endRecord.length
  const bytes = concatBytes([...localChunks, ...centralChunks, endRecord], totalSize)

  return new Blob([bytes], { type: 'application/zip' })
}
