import { EXPORT_PDF_THEME_OPTIONS, getExportPdfTheme } from './projectExportThemes.js'
import { getProjectType } from '../constants/projectTypes.js'

export { EXPORT_PDF_THEME_OPTIONS }

const textEncoder = new TextEncoder()

const sanitizeFilename = (value, fallback = 'project') => {
  const name = String(value || fallback)
    .trim()
    .replace(/[^a-z0-9._ -]/gi, '_')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
  return name || fallback
}

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const stripHtml = (value = '') =>
  String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n/g, '\n')
    .trim()

const cleanText = (value) => stripHtml(value || '').replace(/\n{3,}/g, '\n\n')

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const sortByOrder = (items = []) =>
  [...items].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))

const sortByTitle = (items = [], key = 'title') =>
  [...items].sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || '')))

const valueList = (...values) => values.filter(value => value !== null && value !== undefined && String(value).trim() !== '')

const CAMPAIGN_PROJECT_TYPES = new Set(['dnd_campaign', 'tabletop_rpg'])

const SESSION_PLAN_EXPORT_FIELDS = [
  ['Hooks', 'hooks'],
  ['Encounter flow', 'encounters'],
  ['NPCs', 'npcs'],
  ['Rewards', 'rewards'],
  ['Consequences', 'consequences'],
  ['Session notes', 'notes'],
]

const SESSION_RECAP_EXPORT_FIELDS = [
  ['Recap', 'summary'],
  ['Player choices', 'playerChoices'],
  ['Fallout', 'fallout'],
  ['Next hooks', 'nextHooks'],
]

const isCampaignProject = (project) => CAMPAIGN_PROJECT_TYPES.has(project?.type)
const isComicProject = (project) => project?.type === 'comic'

const sessionExportRows = (chapter) => [
  ...SESSION_PLAN_EXPORT_FIELDS.map(([label, key]) => [`Plan: ${label}`, chapter?.sessionPlan?.[key]]),
  ...SESSION_RECAP_EXPORT_FIELDS.map(([label, key]) => [`Recap: ${label}`, chapter?.sessionRecap?.[key]]),
].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')

const sessionExportSummary = (chapter) =>
  sessionExportRows(chapter).map(([label, value]) => `${label}: ${cleanText(value)}`).join('\n')

const asArray = (value) => {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value)
  return []
}

const getRelationshipLinks = (character) =>
  asArray(character?.relationships).filter(rel => rel && typeof rel === 'object')

const getEnabled = (projectData) => {
  const enabled = projectData.project?.enabledSections
  return new Set(Array.isArray(enabled) ? enabled : [
    'outline', 'characters', 'familytree', 'factions', 'locations', 'lore', 'ideas',
    'schedule', 'timeline', 'worldhistory', 'map',
  ])
}

const buildOutline = (projectData) => {
  const { acts = [], chapters = [], scenes = [] } = projectData
  return sortByOrder(acts).map(act => ({
    act,
    chapters: sortByOrder(chapters.filter(chapter => chapter.actId === act.id)).map(chapter => ({
      chapter,
      scenes: sortByOrder(scenes.filter(scene => scene.chapterId === chapter.id)),
    })),
  }))
}

const wordCount = (text = '') => cleanText(text).split(/\s+/).filter(Boolean).length

const buildSummaryStats = (projectData) => {
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

const getProjectBaseName = (project) => sanitizeFilename(project?.title, 'yow-project')

const getProjectExportLabel = (project) =>
  getProjectType(project?.type).exportLabel || 'Project Encyclopaedia'

const getProjectExportSlug = (project, fallback = 'project-export') =>
  sanitizeFilename(getProjectExportLabel(project).toLowerCase(), fallback)

const getProjectWorkspaceLabel = (project) =>
  getProjectType(project?.type).workspaceLabel || 'Manuscript'

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
    jsonFile('data/comic-pages.json', projectData.comicPages ?? []),
    jsonFile('data/comic-panels.json', projectData.comicPanels ?? []),
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

export const getProjectExportFilename = (project) =>
  `${getProjectBaseName(project)}.zip`

export const getProjectDocxFilename = (project) =>
  `${getProjectBaseName(project)}-${getProjectExportSlug(project, 'project-export')}.docx`

export const getProjectPdfFilename = (project) =>
  `${getProjectBaseName(project)}-${getProjectExportSlug(project, 'project-export')}.pdf`

const addDocParagraphs = (children, { Paragraph, TextRun }, text, options = {}) => {
  const blocks = cleanText(text).split(/\n{2,}/).map(block => block.trim()).filter(Boolean)
  blocks.forEach(block => {
    children.push(new Paragraph({
      children: [new TextRun({ text: block.replace(/\n/g, ' '), size: 22 })],
      spacing: { after: 160 },
      ...options,
    }))
  })
}

const addDocHeading = (children, docx, text, level = docx.HeadingLevel.HEADING_1) => {
  children.push(new docx.Paragraph({
    text,
    heading: level,
    spacing: { before: 260, after: 160 },
  }))
}

const addDocFields = (children, docx, fields) => {
  fields.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '').forEach(([label, value]) => {
    children.push(new docx.Paragraph({
      children: [
        new docx.TextRun({ text: `${label}: `, bold: true, size: 20 }),
        new docx.TextRun({ text: String(value), size: 20 }),
      ],
      spacing: { after: 80 },
    }))
  })
}

export const createProjectDocxBlob = async (projectData) => {
  const docx = await import('docx')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak } = docx
  const enabled = getEnabled(projectData)
  const children = []
  const project = projectData.project ?? {}

  children.push(new Paragraph({
    children: [new TextRun({ text: project.title || 'Untitled Project', bold: true, size: 54 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
  }))
  children.push(new Paragraph({
    children: [new TextRun({ text: getProjectExportLabel(project), italics: true, size: 26 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 420 },
  }))
  addDocFields(children, docx, [
    ['Description', project.description],
    ['Exported', formatDate(new Date().toISOString())],
    ...buildSummaryStats(projectData),
  ])

  if (enabled.has('outline') && isComicProject(project)) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Comic Script')
    const { acts = [], chapters = [], comicPages = [], comicPanels = [] } = projectData
    sortByOrder(acts).forEach(volume => {
      addDocHeading(children, docx, volume.title || 'Untitled Volume', HeadingLevel.HEADING_2)
      addDocParagraphs(children, docx, volume.synopsis)
      sortByOrder(chapters.filter(c => c.actId === volume.id)).forEach((issue, issueIndex) => {
        addDocHeading(children, docx, issue.title || `Issue ${issueIndex + 1}`, HeadingLevel.HEADING_3)
        addDocParagraphs(children, docx, issue.synopsis)
        const issuePages = sortByOrder(comicPages.filter(p => p.issueId === issue.id))
        issuePages.forEach((page, pageIndex) => {
          const pageNum = pageIndex + 1
          const pageLabel = page.title ? `Page ${pageNum} — ${page.title}` : `Page ${pageNum}`
          const pageMeta = [page.pageType, page.status, page.pageTurn !== 'none' && page.pageTurn ? `page turn: ${page.pageTurn}` : null].filter(Boolean).join(' · ')
          children.push(new Paragraph({
            children: [
              new TextRun({ text: pageLabel, bold: true, size: 22 }),
              ...(pageMeta ? [new TextRun({ text: `  ${pageMeta}`, italics: true, size: 18 })] : []),
            ],
            spacing: { before: 160, after: 60 },
          }))
          if (page.summary) addDocParagraphs(children, docx, page.summary, { indent: { left: 180 } })
          if (page.visualDirection) addDocFields(children, docx, [['Visual direction', page.visualDirection]])
          if (page.productionNotes) addDocFields(children, docx, [['Production notes', page.productionNotes]])

          const panels = sortByOrder(comicPanels.filter(p => p.pageId === page.id))
          if (!panels.length) {
            children.push(new Paragraph({ children: [new TextRun({ text: '(no panels)', italics: true, size: 18, color: '888888' })], indent: { left: 360 }, spacing: { after: 60 } }))
          }
          panels.forEach((panel, panelIndex) => {
            const panelLabel = `Panel ${panelIndex + 1}`
            const panelMeta = [panel.shotType, panel.layoutHint].filter(Boolean).join(', ')
            children.push(new Paragraph({
              children: [
                new TextRun({ text: panelLabel, bold: true, size: 20 }),
                ...(panelMeta ? [new TextRun({ text: `  ${panelMeta}`, italics: true, size: 18 })] : []),
              ],
              indent: { left: 360 },
              spacing: { before: 100, after: 40 },
            }))
            if (panel.description) addDocParagraphs(children, docx, panel.description, { indent: { left: 540 } })
            if (panel.artNotes) addDocFields(children, docx, [['Art notes', panel.artNotes]])
            ;(panel.captions ?? []).forEach(cap => {
              const capLabel = cap.type ? `Caption (${cap.type})` : 'Caption'
              addDocFields(children, docx, [[capLabel, cap.text]])
            })
            ;(panel.dialogue ?? []).forEach(line => {
              const speaker = line.speaker ? `${line.speaker}:` : 'Balloon:'
              addDocFields(children, docx, [[speaker, line.text]])
            })
            ;(panel.sfx ?? []).forEach(fx => {
              addDocFields(children, docx, [['SFX', fx.text]])
            })
            if (panel.continuityNotes) addDocFields(children, docx, [['Continuity', panel.continuityNotes]])
          })
        })
        if (!issuePages.length) {
          children.push(new Paragraph({ children: [new TextRun({ text: '(no pages)', italics: true, size: 18, color: '888888' })], indent: { left: 360 }, spacing: { after: 60 } }))
        }
      })
    })
  } else if (enabled.has('outline')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, isCampaignProject(project) ? 'Campaign Sessions' : 'Story Outline')
    buildOutline(projectData).forEach(({ act, chapters }) => {
      addDocHeading(children, docx, act.title || 'Untitled Act', HeadingLevel.HEADING_2)
      addDocParagraphs(children, docx, act.synopsis)
      chapters.forEach(({ chapter, scenes }, chapterIndex) => {
        addDocHeading(children, docx, chapter.title || `Chapter ${chapterIndex + 1}`, HeadingLevel.HEADING_3)
        addDocParagraphs(children, docx, chapter.synopsis)
        if (isCampaignProject(project)) {
          addDocFields(children, docx, sessionExportRows(chapter))
        }
        scenes.forEach(scene => {
          const title = scene.title && scene.title !== 'Scene' ? scene.title : 'Scene'
          children.push(new Paragraph({
            children: [
              new TextRun({ text: title, bold: true, size: 20 }),
              new TextRun({ text: ` (${wordCount(scene.content)} words)`, italics: true, size: 18 }),
            ],
            spacing: { before: 80, after: 80 },
          }))
          addDocParagraphs(children, docx, scene.synopsis || scene.summary || scene.content, { indent: { left: 360 } })
        })
      })
    })
  }

  if (enabled.has('characters')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Characters')
    sortByTitle(projectData.characters, 'name').forEach(character => {
      addDocHeading(children, docx, character.name || 'Unnamed Character', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [
        ['Role', character.role],
        ['Alias', character.keywords?.join(', ')],
        ['Age', character.age],
        ['Birth', character.birthDate],
        ['Death', character.deathDate],
        ['Family', character.familyGroup],
        ['External goal', character.externalGoal],
        ['Internal goal', character.internalGoal],
      ])
      addDocParagraphs(children, docx, character.bio || character.description || character.notes)
    })
  }

  if (enabled.has('locations')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Locations')
    sortByTitle(projectData.locations, 'name').forEach(location => {
      addDocHeading(children, docx, location.name || 'Unnamed Location', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [
        ['Type', location.type],
        ['Region', location.region],
        ['Tags', location.tags?.join(', ')],
      ])
      addDocParagraphs(children, docx, location.description || location.notes || location.content)
    })
  }

  if (enabled.has('factions')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Factions')
    sortByTitle(projectData.factions, 'name').forEach(faction => {
      addDocHeading(children, docx, faction.name || 'Unnamed Faction', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [
        ['Type', faction.type],
        ['Leader', faction.leader],
        ['Status', faction.status],
      ])
      addDocParagraphs(children, docx, faction.description || faction.notes)
    })
  }

  if (enabled.has('lore')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Lore')
    sortByTitle(projectData.loreEntries).forEach(entry => {
      addDocHeading(children, docx, entry.title || 'Untitled Lore Entry', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [
        ['Category', entry.category || 'Uncategorized'],
        ['Tags', entry.tags?.join(', ')],
      ])
      addDocParagraphs(children, docx, entry.content)
    })
  }

  if (enabled.has('ideas')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Notes')
    sortByTitle(projectData.ideaEntries).forEach(entry => {
      addDocHeading(children, docx, entry.title || 'Untitled Note', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [['Tags', entry.tags?.join(', ')]])
      addDocParagraphs(children, docx, entry.content || entry.text || entry.body)
    })
  }

  if (enabled.has('timeline')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Timeline')
    sortByOrder(projectData.timeline).forEach(event => {
      addDocHeading(children, docx, event.title || 'Untitled Event', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [
        ['Date', valueList(event.date, event.year).join(' ')],
        ['Tags', event.tags?.join(', ')],
      ])
      addDocParagraphs(children, docx, event.description || event.content || event.notes)
    })
  }

  if (enabled.has('worldhistory')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'World History')
    sortByOrder(projectData.worldHistory).forEach(entry => {
      addDocHeading(children, docx, entry.title || 'Untitled History Entry', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [
        ['Era', entry.era],
        ['Date', valueList(entry.date, entry.year).join(' ')],
        ['Tags', entry.tags?.join(', ')],
      ])
      addDocParagraphs(children, docx, entry.content || entry.description || entry.notes)
    })
  }

  const doc = new Document({ sections: [{ properties: {}, children }] })
  return Packer.toBlob(doc)
}

export const downloadProjectDocx = async (projectData) => {
  const blob = await createProjectDocxBlob(projectData)
  downloadBlob(blob, getProjectDocxFilename(projectData.project))
}

const htmlMeta = (items, className = 'meta') => {
  const values = items.filter(value => value !== null && value !== undefined && String(value).trim() !== '')
  return values.length
    ? `<div class="${className}">${values.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
    : ''
}

const prose = (text) => {
  const blocks = cleanText(text).split(/\n{2,}/).map(block => block.trim()).filter(Boolean)
  if (!blocks.length) return ''
  return blocks.map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('')
}

const firstLetter = (value) => escapeHtml(String(value || '?').trim()[0]?.toUpperCase() || '?')

const joinNames = (items = [], key = 'name', limit = 4) =>
  items.slice(0, limit).map(item => item?.[key]).filter(Boolean).join(', ')

const getTags = (item, keys = ['tags', 'keywords']) =>
  keys.flatMap(key => Array.isArray(item?.[key]) ? item[key] : []).filter(Boolean)

const shareAny = (a = [], b = []) => {
  const lookup = new Set(a.map(value => String(value).trim().toLowerCase()).filter(Boolean))
  return b.some(value => lookup.has(String(value).trim().toLowerCase()))
}

const getImage = (item) => item?.image || item?.coverPhoto || item?.photo || item?.avatar || ''

const parseDataUrl = (value = '') => {
  const match = String(value).match(/^data:([^;,]+)(;base64)?,(.*)$/)
  if (!match) return null
  return {
    mimeType: match[1].toLowerCase(),
    isBase64: Boolean(match[2]),
    payload: match[3],
  }
}

const bytesFromBase64 = (value) => {
  if (typeof atob === 'function') {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  }
  return Uint8Array.from(globalThis.Buffer.from(value, 'base64'))
}

const parseJpegSize = (bytes) => {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3]
    if (length < 2) return null
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      }
    }
    offset += 2 + length
  }
  return null
}

const jpegResourceFromDataUrl = (value) => {
  const parsed = parseDataUrl(value)
  if (!parsed?.isBase64 || !['image/jpeg', 'image/jpg'].includes(parsed.mimeType)) return null
  const bytes = bytesFromBase64(parsed.payload)
  const size = parseJpegSize(bytes)
  return size ? { bytes, ...size } : null
}

const convertImageToJpegResource = (src, options = {}) => new Promise(resolve => {
  if (!src || typeof Image === 'undefined' || typeof document === 'undefined') {
    resolve(jpegResourceFromDataUrl(src))
    return
  }
  const image = new Image()
  image.onload = () => {
    try {
      const maxSize = options.maxSize || 900
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height))
      const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
      const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = width
      canvas.height = height
      ctx.fillStyle = '#111814'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(image, 0, 0, width, height)
      resolve(jpegResourceFromDataUrl(canvas.toDataURL('image/jpeg', options.quality || 0.82)))
    } catch {
      resolve(jpegResourceFromDataUrl(src))
    }
  }
  image.onerror = () => resolve(jpegResourceFromDataUrl(src))
  image.src = src
})

const prepareProjectPdfData = async (projectData) => {
  const characters = await Promise.all((projectData.characters ?? []).map(async character => {
    const image = getImage(character)
    if (!image) return character
    const pdfImage = await convertImageToJpegResource(image)
    return pdfImage ? { ...character, _pdfImage: pdfImage } : character
  }))
  return { ...projectData, characters }
}

const relatedEntries = (source, projectData, sourceType) => {
  const tags = getTags(source)
  const related = []
  const add = (type, title, section, item) => {
    if (!title || item?.id === source?.id) return
    related.push({ type, title, section })
  }

  ;(projectData.characters ?? []).forEach(item => {
    if (sourceType !== 'character' && shareAny(tags, getTags(item))) add('Character', item.name, 'Characters', item)
  })
  ;(projectData.locations ?? []).forEach(item => {
    if (sourceType !== 'location' && shareAny(tags, getTags(item))) add('Location', item.name, 'Locations', item)
  })
  ;(projectData.factions ?? []).forEach(item => {
    if (sourceType !== 'faction' && shareAny(tags, getTags(item))) add('Faction', item.name, 'Factions', item)
  })
  ;(projectData.loreEntries ?? []).forEach(item => {
    if (sourceType !== 'lore' && shareAny(tags, getTags(item))) add('Lore', item.title, 'Lore', item)
  })
  ;(projectData.timeline ?? []).forEach(item => {
    if (shareAny(tags, getTags(item))) add('Timeline', item.title, 'Timeline', item)
  })
  ;(projectData.worldHistory ?? []).forEach(item => {
    if (shareAny(tags, getTags(item))) add('History', item.title, 'World History', item)
  })

  return related.slice(0, 6)
}

const sectionPage = (id, eyebrow, title, subtitle, body, modifier = '') => `
  <section class="pdf-page ${modifier}" id="${id}">
    <div class="page-shell">
      <header class="page-header">
        <p>${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}
      </header>
      ${body}
    </div>
  </section>
`

const dividerPage = (id, index, title, subtitle) => `
  <section class="pdf-page divider-page" id="${id}">
    <div class="divider-mark">${String(index).padStart(2, '0')}</div>
    <div class="divider-content">
      <p>World Bible Section</p>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}
    </div>
  </section>
`

const emptyState = (label) => `<p class="empty-state">${escapeHtml(label)}</p>`

const articleCard = (title, meta, content, related = [], image = '') => `
  <article class="article-card${image ? '' : ' article-card--text'}">
    ${image ? `<img class="article-image" src="${escapeHtml(image)}" alt="">` : ''}
    <div class="article-main">
      <h2>${escapeHtml(title || 'Untitled')}</h2>
      ${htmlMeta(meta)}
      <div class="copy">${prose(content) || '<p class="muted">No field notes recorded.</p>'}</div>
      ${related.length ? `<div class="related-strip"><strong>Related</strong>${related.map(item => `<span>${escapeHtml(item.type)}: ${escapeHtml(item.title)}</span>`).join('')}</div>` : ''}
    </div>
  </article>
`

const characterDossier = (character, projectData) => {
  const relationships = getRelationshipLinks(character)
    .map(rel => {
      const target = (projectData.characters ?? []).find(item => item.id === rel.targetId)
      return target ? { ...rel, targetName: target.name } : null
    })
    .filter(Boolean)
  const image = getImage(character)
  return `
    <article class="dossier-card">
      <div class="portrait-frame">
        ${image ? `<img src="${escapeHtml(image)}" alt="" style="object-position:${escapeHtml(character.imagePosition || '50% 50%')}">` : `<span>${firstLetter(character.name)}</span>`}
      </div>
      <div class="dossier-body">
        <div class="dossier-topline">
          <span>${escapeHtml(character.role || 'Profile')}</span>
          <strong>${escapeHtml(character.familyGroup || 'Independent')}</strong>
        </div>
        <h2>${escapeHtml(character.name || 'Unnamed Character')}</h2>
        ${htmlMeta(valueList(character.age && `Age ${character.age}`, character.birthDate && `Born ${character.birthDate}`, character.deathDate && `Died ${character.deathDate}`, character.keywords?.join(', ')))}
        <div class="dossier-grid">
          ${[
            ['External Goal', character.externalGoal],
            ['Internal Goal', character.internalGoal],
            ['Arc', character.arc || character.characterArc],
            ['Status', character.status],
          ].filter(([, value]) => value).map(([label, value]) => `<div><span>${escapeHtml(label)}</span><p>${escapeHtml(value)}</p></div>`).join('')}
        </div>
        <div class="copy">${prose(character.bio || character.description || character.notes) || '<p class="muted">No dossier notes recorded.</p>'}</div>
        ${relationships.length ? `<div class="relationship-tags"><strong>Known Links</strong>${relationships.slice(0, 8).map(rel => `<span>${escapeHtml(rel.type)}: ${escapeHtml(rel.targetName)}</span>`).join('')}</div>` : ''}
      </div>
    </article>
  `
}

const relationshipSection = (characters = []) => {
  const groups = new Map()
  characters.forEach(character => {
    const key = character.familyGroup?.trim() || 'Unassigned'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(character)
  })
  const relationshipRows = characters.flatMap(character =>
    getRelationshipLinks(character).map(rel => {
      const target = characters.find(item => item.id === rel.targetId)
      return target ? { source: character.name, target: target.name, type: rel.type } : null
    }).filter(Boolean)
  )

  const familyCards = [...groups.entries()].map(([name, members]) => `
    <article class="family-card">
      <h2>${escapeHtml(name)}</h2>
      <p>${members.length} ${members.length === 1 ? 'member' : 'members'}</p>
      <div>${members.slice(0, 10).map(member => `<span>${escapeHtml(member.name || 'Unnamed')}</span>`).join('')}</div>
    </article>
  `).join('')

  const links = relationshipRows.slice(0, 28).map(row => `
    <div class="link-row">
      <strong>${escapeHtml(row.source || 'Unknown')}</strong>
      <span>${escapeHtml(row.type || 'linked')}</span>
      <strong>${escapeHtml(row.target || 'Unknown')}</strong>
    </div>
  `).join('')

  return `
    <div class="family-grid">${familyCards || emptyState('No family groups recorded.')}</div>
    <div class="relationship-board">
      <h2>Relationship Index</h2>
      ${links || emptyState('No direct relationships recorded.')}
    </div>
  `
}

const timelineSpread = (items, projectData, type = 'timeline') => {
  const events = sortByOrder(items).filter(Boolean)
  if (!events.length) return emptyState('No chronology entries yet.')
  return `<div class="timeline-spread">${events.map((event, index) => {
    const tags = getTags(event)
    const related = relatedEntries(event, projectData, type).slice(0, 3)
    return `
      <article class="timeline-event">
        <div class="timeline-index">${String(index + 1).padStart(2, '0')}</div>
        <div>
          ${htmlMeta(valueList(event.era, event.date, event.year, tags.join(', ')))}
          <h2>${escapeHtml(event.title || 'Untitled Event')}</h2>
          <div class="copy">${prose(event.description || event.content || event.notes) || '<p class="muted">No chronicle text recorded.</p>'}</div>
          ${related.length ? `<p class="timeline-related">${escapeHtml(joinNames(related, 'title'))}</p>` : ''}
        </div>
      </article>
    `
  }).join('')}</div>`
}

const mapSection = (projectData) => {
  const maps = projectData.maps ?? []
  if (!maps.length) return emptyState('No maps attached to this project.')
  return `<div class="map-grid">${maps.map(map => {
    const labels = [...(map.mapLabels ?? []), ...(map.mapPins ?? [])].map(item => item.text || item.label || item.name).filter(Boolean)
    const regions = (map.mapRegions ?? []).map(item => item.name || item.label).filter(Boolean)
    const image = getImage(map) || map.thumbnail || map.preview || map.dataUrl || map.mapImage
    return `
      <article class="map-card">
        <div class="map-preview">${image ? `<img src="${escapeHtml(image)}" alt="">` : `<span>${firstLetter(map.name || 'Map')}</span>`}</div>
        <div>
          <h2>${escapeHtml(map.name || 'Untitled Map')}</h2>
          ${htmlMeta(valueList(map.mapType, labels.length && `${labels.length} labels`, regions.length && `${regions.length} regions`))}
          ${labels.length ? `<p>${escapeHtml(labels.slice(0, 14).join(', '))}</p>` : '<p class="muted">Map metadata available. Rendered pixel art is stored separately in the map builder.</p>'}
        </div>
      </article>
    `
  }).join('')}</div>`
}

const notesSection = (projectData) => {
  const outline = buildOutline(projectData)
  const structure = getProjectType(projectData.project?.type).structure || {}
  const level1 = structure.level1 || 'Act'
  const level2 = structure.level2 || 'Chapter'
  const isCampaign = isCampaignProject(projectData.project)
  return outline.map(({ act, chapters }) => `
    <article class="outline-act">
      <h2>${escapeHtml(act.title || 'Untitled Act')}</h2>
      <div class="copy">${prose(act.synopsis) || '<p class="muted">No act synopsis recorded.</p>'}</div>
      <div class="chapter-grid">
        ${chapters.map(({ chapter, scenes }, index) => `
          <div class="chapter-card">
            <span>${escapeHtml(level2)} ${index + 1}</span>
            <h3>${escapeHtml(chapter.title || `${level2} ${index + 1}`)}</h3>
            <p>${escapeHtml(cleanText(chapter.synopsis || `${scenes.length} scenes`) || `${scenes.length} scenes`)}</p>
            ${isCampaign && sessionExportRows(chapter).length ? `
              <div class="copy">
                ${sessionExportRows(chapter).map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(cleanText(value))}</p>`).join('')}
              </div>
            ` : ''}
            <small>${scenes.reduce((sum, scene) => sum + wordCount(scene.content), 0).toLocaleString()} words</small>
          </div>
        `).join('')}
      </div>
    </article>
  `).join('') || emptyState(`No ${level1.toLowerCase()} sections yet.`)
}

const A4_LANDSCAPE = { width: 841.89, height: 595.28 }
const PDF_MARGIN = 30

const hexToRgb = (hex) => {
  const value = String(hex || '#000000').replace('#', '')
  const normalized = value.length === 3
    ? value.split('').map(char => `${char}${char}`).join('')
    : value.padEnd(6, '0').slice(0, 6)
  return [
    parseInt(normalized.slice(0, 2), 16) / 255,
    parseInt(normalized.slice(2, 4), 16) / 255,
    parseInt(normalized.slice(4, 6), 16) / 255,
  ]
}

const pdfColor = (hex, mode = 'rg') => `${hexToRgb(hex).map(value => value.toFixed(3)).join(' ')} ${mode}`

const pdfText = (value = '') =>
  String(value)
    .normalize('NFKD')
    .replace(/[^\x20-\x7E\n]/g, char => {
      if (char === '—' || char === '–') return '-'
      if (char === '’' || char === '‘') return "'"
      if (char === '“' || char === '”') return '"'
      return ''
    })
    .replace(/[\\()]/g, '\\$&')

const measureText = (text, size, tracking = 0) => {
  const value = String(text || '')
  return value.length * size * 0.6 + Math.max(0, value.length - 1) * tracking
}

const fitPdfText = (text, maxWidth, size, tracking = 0) => {
  const value = String(text || '')
  if (!maxWidth || measureText(value, size, tracking) <= maxWidth) return value
  const ellipsis = '...'
  let output = value
  while (output.length > 0 && measureText(`${output}${ellipsis}`, size, tracking) > maxWidth) {
    output = output.slice(0, -1)
  }
  return `${output.trimEnd()}${ellipsis}`
}

const wrapPdfText = (text, maxWidth, size, maxLines = 99) => {
  const paragraphs = cleanText(text).split(/\n{2,}/).map(block => block.replace(/\n/g, ' ').trim()).filter(Boolean)
  const lines = []
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let line = ''
    words.forEach(word => {
      const safeWord = measureText(word, size) > maxWidth ? fitPdfText(word, maxWidth, size) : word
      const safeNext = line ? `${line} ${safeWord}` : safeWord
      if (measureText(safeNext, size) <= maxWidth || !line) {
        line = safeNext
      } else {
        lines.push(line)
        line = safeWord
      }
    })
    if (line) lines.push(line)
    if (paragraphIndex < paragraphs.length - 1) lines.push('')
  })
  if (lines.length > maxLines) {
    return [...lines.slice(0, Math.max(0, maxLines - 1)), `${lines[Math.max(0, maxLines - 1)] || ''}...`]
  }
  return lines
}

const makePdfCanvas = (theme) => {
  const commands = []
  const images = []
  const draw = (cmd) => commands.push(cmd)
  const rect = (x, y, w, h, fill, stroke = null, lineWidth = 1) => {
    draw('q')
    if (fill) draw(pdfColor(fill, 'rg'))
    if (stroke) {
      draw(pdfColor(stroke, 'RG'))
      draw(`${lineWidth} w`)
    }
    draw(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`)
    draw('Q')
  }
  const line = (x1, y1, x2, y2, color = theme.palette.border, width = 1) => {
    draw('q')
    draw(pdfColor(color, 'RG'))
    draw(`${width} w`)
    draw(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`)
    draw('Q')
  }
  const text = (value, x, y, size = 12, options = {}) => {
    const font = options.bold ? 'F2' : options.italic ? 'F3' : 'F1'
    const maxWidth = options.maxWidth ?? Math.max(20, A4_LANDSCAPE.width - x - PDF_MARGIN)
    const displayValue = fitPdfText(value, maxWidth, size, options.tracking || 0)
    draw('BT')
    draw(`/${font} ${size} Tf`)
    draw(pdfColor(options.color || theme.palette.text, 'rg'))
    if (options.tracking) draw(`${options.tracking} Tc`)
    draw(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`)
    draw(`(${pdfText(displayValue)}) Tj`)
    draw('ET')
  }
  const textBox = (value, x, y, width, size = 11, options = {}) => {
    const lineHeight = options.lineHeight || size * 1.35
    const lines = wrapPdfText(value, width, size, options.maxLines)
    lines.forEach((lineText, index) => {
      if (lineText) text(lineText, x, y - (index * lineHeight), size, { ...options, maxWidth: width })
    })
    return y - (lines.length * lineHeight)
  }
  const imageCover = (image, x, topY, w, h, options = {}) => {
    if (!image?.bytes || !image.width || !image.height) return false
    const name = `Im${images.length + 1}`
    images.push({ name, ...image })
    const scale = Math.max(w / image.width, h / image.height)
    const drawW = image.width * scale
    const drawH = image.height * scale
    const [posX = '50%', posY = '50%'] = String(options.position || '50% 50%').split(/\s+/)
    const px = Math.max(0, Math.min(1, parseFloat(posX) / 100 || 0.5))
    const py = Math.max(0, Math.min(1, parseFloat(posY) / 100 || 0.5))
    const bottomY = topY - h
    const drawX = x - Math.max(0, drawW - w) * px
    const drawY = bottomY - Math.max(0, drawH - h) * (1 - py)
    draw('q')
    draw(`${x.toFixed(2)} ${bottomY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re W n`)
    draw(`${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm`)
    draw(`/${name} Do`)
    draw('Q')
    return true
  }
  const pageBase = (eyebrow, title, subtitle) => {
    rect(0, 0, A4_LANDSCAPE.width, A4_LANDSCAPE.height, theme.palette.page)
    rect(0, 0, A4_LANDSCAPE.width, A4_LANDSCAPE.height, null, theme.palette.border, 0.8)
    line(25, A4_LANDSCAPE.height - 25, A4_LANDSCAPE.width - 25, A4_LANDSCAPE.height - 25, theme.palette.accent, 1.6)
    line(25, 25, A4_LANDSCAPE.width - 25, 25, theme.palette.accent, 1.6)
    if (eyebrow) text(String(eyebrow).toUpperCase(), PDF_MARGIN, 544, 10, { bold: true, color: theme.palette.accent, tracking: 1.5 })
    const titleLines = wrapPdfText(title || '', 520, 27, 2)
    titleLines.forEach((lineText, index) => {
      if (lineText) text(lineText, PDF_MARGIN, 520 - index * 30, 27, { bold: true, color: theme.palette.text })
    })
    const subtitleY = Math.min(486, 520 - Math.max(1, titleLines.length) * 30 - 4)
    if (subtitle) textBox(subtitle, PDF_MARGIN, subtitleY, 700, 10, { color: theme.palette.muted, lineHeight: 14, maxLines: 2 })
    return Math.min(452, subtitle ? subtitleY - 34 : 470)
  }
  return { draw, rect, line, text, textBox, imageCover, pageBase, content: () => commands.join('\n'), images: () => images }
}

const pdfContent = (pdf) => ({ content: pdf.content(), images: pdf.images() })

const drawMetricGrid = (pdf, stats, x, y, cols = 2, cellW = 142, cellH = 64, theme = getExportPdfTheme()) => {
  stats.forEach(([label, value], index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const px = x + col * (cellW + 12)
    const py = y - row * (cellH + 12)
    pdf.rect(px, py - cellH, cellW, cellH, theme.palette.panel, null)
    pdf.rect(px, py - cellH, cellW, cellH, null, theme.palette.border, 0.8)
    pdf.text(String(value), px + 14, py - 24, 22, { bold: true, color: theme.palette.accent, maxWidth: cellW - 28 })
    pdf.text(String(label).toUpperCase(), px + 14, py - 43, 7, { bold: true, color: theme.palette.muted, tracking: 0.7, maxWidth: cellW - 28 })
  })
}

const drawArtFrame = (pdf, label, x, y, w, h, theme, initial = '') => {
  const mark = fitPdfText(initial || label, w - 28, 18)
  pdf.rect(x, y - h, w, h, theme.palette.panelSoft, theme.palette.border, 1)
  pdf.text(mark, x + w / 2 - measureText(mark, 18) / 2, y - h / 2, 18, { bold: true, color: theme.palette.accent, maxWidth: w - 28 })
  pdf.text(label.toUpperCase(), x + 16, y - h + 22, 8, { bold: true, color: theme.palette.muted, tracking: 1, maxWidth: w - 32 })
}

const drawImageFrame = (pdf, label, image, x, y, w, h, theme, initial = '', position = '50% 50%') => {
  pdf.rect(x, y - h, w, h, theme.palette.panelSoft, theme.palette.border, 1)
  const hasImage = pdf.imageCover(image, x, y, w, h, { position })
  if (!hasImage) {
    const mark = fitPdfText(initial || label, w - 28, 18)
    pdf.text(mark, x + w / 2 - measureText(mark, 18) / 2, y - h / 2, 18, { bold: true, color: theme.palette.accent, maxWidth: w - 28 })
  }
  pdf.rect(x, y - h, w, h, null, theme.palette.border, 1)
  pdf.text(label.toUpperCase(), x + 12, y - h + 18, 7, { bold: true, color: theme.palette.muted, tracking: 0.7, maxWidth: w - 24 })
}

const characterFieldValue = (character, key) =>
  character?.[key] || character?.traits?.[key] || ''

const characterTextBlocks = (character, relationships) => [
  ['Overview', character.bio || character.description || character.notes || 'No dossier notes recorded.'],
  ['Role', character.role],
  ['Family', character.familyGroup],
  ['Species', character.species],
  ['Title / Job', character.titleJob || character.title],
  ['External Goal', characterFieldValue(character, 'externalGoal')],
  ['Internal Goal', characterFieldValue(character, 'internalGoal')],
  ['Arc', character.arc || character.characterArc],
  ['Strengths', character.traits?.strengths],
  ['Weaknesses', character.traits?.weaknesses],
  ['Fears', character.traits?.fears],
  ['Passions', character.traits?.passions],
  ['Languages', character.traits?.languages || character.background?.language],
  ['Hometown', character.background?.hometown],
  ['Religion', character.background?.religion],
  ['Life Events', character.background?.lifeEvents],
  ['History Witnessed', character.background?.historicEventsWitnessed],
  ['Known Links', relationships.join('\n')],
].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')

const makeCharacterLineItems = (character, relationships, width) =>
  characterTextBlocks(character, relationships).flatMap(([label, value]) => [
    { text: String(label).toUpperCase(), size: 8, lineHeight: 12, bold: true, colorRole: 'accent', tracking: 0.7, gapBefore: 5 },
    ...wrapPdfText(value, width, 9.2).map(line => ({ text: line, size: 9.2, lineHeight: 12.6, colorRole: 'text' })),
    { spacer: 4 },
  ])

const renderLineItems = (pdf, items, startIndex, x, y, width, bottomY, theme) => {
  let cursor = y
  let index = startIndex
  while (index < items.length) {
    const item = items[index]
    if (item.spacer) {
      if (cursor - item.spacer < bottomY) break
      cursor -= item.spacer
      index += 1
      continue
    }
    const lineHeight = item.lineHeight || item.size * 1.35
    const gapBefore = item.gapBefore || 0
    if (cursor - gapBefore - lineHeight < bottomY) break
    cursor -= gapBefore
    pdf.text(item.text, x, cursor, item.size, {
      bold: item.bold,
      color: item.colorRole === 'accent' ? theme.palette.accent : theme.palette.text,
      tracking: item.tracking,
      maxWidth: width,
    })
    cursor -= lineHeight
    index += 1
  }
  return index
}

const makeArticleLineItems = (body, related = [], width) => {
  const items = [
    ...wrapPdfText(body || 'No notes recorded.', width, 9.8).map(line => ({ text: line, size: 9.8, lineHeight: 13.4, colorRole: 'text' })),
  ]
  if (related?.length) {
    items.push({ spacer: 8 }, { text: 'RELATED ENTRIES', size: 8, lineHeight: 12, bold: true, colorRole: 'accent', tracking: 0.7 })
    related.forEach(item => {
      items.push(...wrapPdfText(`- ${item.type}: ${item.title}`, width, 9.2).map(line => ({ text: line, size: 9.2, lineHeight: 12.6, colorRole: 'text' })))
    })
  }
  return items
}

const createCoverPage = (projectData, theme) => {
  const project = projectData.project ?? {}
  const pdf = makePdfCanvas(theme)
  pdf.rect(0, 0, A4_LANDSCAPE.width, A4_LANDSCAPE.height, theme.palette.page)
  pdf.line(25, 570, 817, 570, theme.palette.accent, 2)
  pdf.line(25, 25, 817, 25, theme.palette.accent, 2)
  pdf.text(`${theme.cover.marker} / WORLD BIBLE`, 76, 457, 10, { bold: true, color: theme.palette.accent, tracking: 2, maxWidth: 500 })
  pdf.textBox(project.title || 'Untitled Project', 76, 420, 500, 42, { bold: true, color: theme.palette.text, lineHeight: 45, maxLines: 2 })
  pdf.textBox(project.description || 'A complete project export from Your Own World.', 76, 305, 500, 14, { italic: true, color: theme.palette.muted, lineHeight: 22, maxLines: 4 })
  if (projectData.series?.name) {
    pdf.rect(76, 185, 230, 34, theme.palette.panel, theme.palette.border, 0.8)
    pdf.text(projectData.series.name.toUpperCase(), 92, 197, 9, { bold: true, color: theme.palette.accent, tracking: 1.2, maxWidth: 198 })
  }
  drawMetricGrid(pdf, buildSummaryStats(projectData), 76, 160, 5, 130, 68, theme)
  return pdfContent(pdf)
}

const pdfPage = (section, title, content, extra = {}) => (
  content && typeof content === 'object' && 'content' in content
    ? { section, title, ...content, ...extra }
    : { section, title, content, ...extra }
)

const createTocPages = (records, theme, tocPageCount) => {
  const lines = []
  const sections = new Map()
  records.forEach((record, recordIndex) => {
    if (!sections.has(record.section)) sections.set(record.section, [])
    sections.get(record.section).push({ ...record, recordIndex })
  })

  ;[...sections.entries()].forEach(([section, entries], sectionIndex) => {
    lines.push({
      section,
      title: section,
      kind: 'section',
      pageIndex: 1 + tocPageCount + entries[0].recordIndex,
      number: String(sectionIndex + 1).padStart(2, '0'),
      count: entries.length,
    })
    entries.forEach(entry => {
      lines.push({
        section,
        title: entry.title,
        kind: 'entry',
        pageIndex: 1 + tocPageCount + entry.recordIndex,
      })
    })
  })

  const perPage = 23
  const pages = []
  for (let pageIndex = 0; pageIndex < tocPageCount; pageIndex += 1) {
    const pdf = makePdfCanvas(theme)
    const links = []
    pdf.pageBase('Index', pageIndex === 0 ? 'Table of Contents' : 'Table of Contents Continued', 'Click a section or entry to jump to its page.')
    lines.slice(pageIndex * perPage, (pageIndex + 1) * perPage).forEach((lineItem, lineIndex) => {
      const y = 420 - lineIndex * 16
      const x = lineItem.kind === 'section' ? 58 : 86
      const w = lineItem.kind === 'section' ? 720 : 665
      if (lineItem.kind === 'section') {
        pdf.rect(50, y - 7, 740, 19, lineIndex % 2 ? theme.palette.panelSoft : theme.palette.panel, theme.palette.border, 0.35)
        pdf.text(lineItem.number, 62, y, 9, { bold: true, color: theme.palette.accent, maxWidth: 24 })
        pdf.text(lineItem.title, 98, y, 11, { bold: true, color: theme.palette.text, maxWidth: 560 })
        pdf.text(`${lineItem.count} ${lineItem.count === 1 ? 'entry' : 'entries'}`, 710, y, 8, { bold: true, color: theme.palette.muted, maxWidth: 70 })
      } else {
        pdf.text(lineItem.title, x, y, 9, { color: theme.palette.muted, maxWidth: 630 })
        pdf.line(78, y + 4, 78, y - 7, theme.palette.border, 0.6)
      }
      links.push({ rect: [x - 4, y - 6, x + w, y + 12], pageIndex: lineItem.pageIndex })
    })
    pages.push({ ...pdfContent(pdf), links, section: 'Table of Contents', title: pageIndex === 0 ? 'Table of Contents' : 'Table of Contents Continued' })
  }
  return pages
}

const createCharacterPages = (character, projectData, theme, index) => {
  const title = character.name || `Character ${index + 1}`
  const pdf = makePdfCanvas(theme)
  const relationships = getRelationshipLinks(character).map(rel => {
    const target = (projectData.characters ?? []).find(item => item.id === rel.targetId)
    return target ? `${rel.type || 'linked'}: ${target.name}` : ''
  }).filter(Boolean)
  const lineWidth = 500
  const items = makeCharacterLineItems(character, relationships, lineWidth)
  const pages = []
  const contentStartY = pdf.pageBase('Character Dossier', title, valueList(character.role, character.familyGroup, character.keywords?.join(', ')).join(' - '))
  const panelTop = Math.min(488, contentStartY - 18)
  const panelBottom = 58
  const panelHeight = panelTop - panelBottom
  pdf.rect(56, panelBottom, 730, panelHeight, theme.palette.panel, theme.palette.accent, 1)
  drawImageFrame(
    pdf,
    'Character Photo',
    character._pdfImage,
    612,
    panelTop - 24,
    142,
    Math.min(190, panelHeight - 48),
    theme,
    firstLetter(character.name).replace(/&.*;/, ''),
    character.imagePosition,
  )
  let nextIndex = renderLineItems(pdf, items, 0, 82, panelTop - 34, lineWidth, panelBottom + 22, theme)
  pages.push(pdfPage('Characters', title, pdfContent(pdf)))

  let continuation = 2
  while (nextIndex < items.length) {
    const nextPdf = makePdfCanvas(theme)
    const nextStart = nextPdf.pageBase('Character Dossier', `${title} continued`, `Continuation ${continuation}`)
    const nextPanelTop = Math.min(488, nextStart - 18)
    nextPdf.rect(56, panelBottom, 730, nextPanelTop - panelBottom, theme.palette.panel, theme.palette.accent, 1)
    nextIndex = renderLineItems(nextPdf, items, nextIndex, 82, nextPanelTop - 34, 670, panelBottom + 22, theme)
    pages.push(pdfPage('Characters', `${title} continued ${continuation}`, pdfContent(nextPdf)))
    continuation += 1
  }
  return pages
}

const createArticlePages = ({ section, eyebrow, title, subtitle, body, related, artLabel, initial }, theme) => {
  const lineWidth = 500
  const items = makeArticleLineItems(body, related, lineWidth)
  const pages = []
  const pdf = makePdfCanvas(theme)
  const contentStartY = pdf.pageBase(eyebrow, title, subtitle)
  const panelTop = Math.min(410, contentStartY - 18)
  const panelBottom = 58
  pdf.rect(56, panelBottom, 730, panelTop - panelBottom, theme.palette.panel, theme.palette.accent, 1)
  drawArtFrame(pdf, artLabel, 616, panelTop - 24, 138, Math.min(176, panelTop - panelBottom - 48), theme, initial)
  let nextIndex = renderLineItems(pdf, items, 0, 82, panelTop - 34, lineWidth, panelBottom + 22, theme)
  pages.push(pdfPage(section, title, pdfContent(pdf)))

  let continuation = 2
  while (nextIndex < items.length) {
    const nextPdf = makePdfCanvas(theme)
    const nextStart = nextPdf.pageBase(eyebrow, `${title} continued`, `Continuation ${continuation}`)
    const nextPanelTop = Math.min(488, nextStart - 18)
    nextPdf.rect(56, panelBottom, 730, nextPanelTop - panelBottom, theme.palette.panel, theme.palette.accent, 1)
    nextIndex = renderLineItems(nextPdf, items, nextIndex, 82, nextPanelTop - 34, 670, panelBottom + 22, theme)
    pages.push(pdfPage(section, `${title} continued ${continuation}`, pdfContent(nextPdf)))
    continuation += 1
  }
  return pages
}

const createTimelinePages = (event, projectData, theme, index, eyebrow = 'Timeline & History', section = 'Timeline') => {
  const title = event.title || `Event ${index + 1}`
  const related = relatedEntries(event, projectData, 'timeline')
  const items = makeArticleLineItems(event.description || event.content || event.notes || 'No chronicle text recorded.', related, 600)
  const pages = []
  const pdf = makePdfCanvas(theme)
  pdf.pageBase(eyebrow, title, valueList(event.era, event.date, event.year, event.tags?.join(', ')).join(' - '))
  const panelBottom = 58
  pdf.rect(70, panelBottom, 700, 360, theme.palette.panel, theme.palette.accent, 1)
  pdf.text(String(index + 1).padStart(2, '0'), 100, 372, 34, { bold: true, color: theme.palette.accent, maxWidth: 95 })
  pdf.text(valueList(event.era, event.date, event.year).join(' / ') || 'Undated', 100, 342, 11, { bold: true, color: theme.palette.muted, tracking: 1, maxWidth: 600 })
  let nextIndex = renderLineItems(pdf, items, 0, 100, 305, 600, panelBottom + 22, theme)
  pages.push(pdfPage(section, title, pdfContent(pdf)))

  let continuation = 2
  while (nextIndex < items.length) {
    const nextPdf = makePdfCanvas(theme)
    const nextStart = nextPdf.pageBase(eyebrow, `${title} continued`, `Continuation ${continuation}`)
    const nextPanelTop = Math.min(488, nextStart - 18)
    nextPdf.rect(56, panelBottom, 730, nextPanelTop - panelBottom, theme.palette.panel, theme.palette.accent, 1)
    nextIndex = renderLineItems(nextPdf, items, nextIndex, 82, nextPanelTop - 34, 670, panelBottom + 22, theme)
    pages.push(pdfPage(section, `${title} continued ${continuation}`, pdfContent(nextPdf)))
    continuation += 1
  }
  return pages
}

const createRelationshipsPage = (characters, theme) => {
  const pdf = makePdfCanvas(theme)
  pdf.pageBase('Networks', 'Relationship Atlas', 'Family groups and direct relationship records.')
  const groups = new Map()
  characters.forEach(character => {
    const key = character.familyGroup?.trim() || 'Unassigned'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(character)
  })
  ;[...groups.entries()].slice(0, 6).forEach(([name, members], index) => {
    const col = index % 3
    const row = Math.floor(index / 3)
    const x = 55 + col * 245
    const y = 420 - row * 115
    pdf.rect(x, y - 84, 210, 84, theme.palette.panel, theme.palette.border, 0.8)
    pdf.text(name, x + 14, y - 24, 15, { bold: true, color: theme.palette.text, maxWidth: 180 })
    pdf.text(`${members.length} ${members.length === 1 ? 'member' : 'members'}`.toUpperCase(), x + 14, y - 43, 7, { bold: true, color: theme.palette.accent, tracking: 0.8, maxWidth: 180 })
    pdf.textBox(members.map(member => member.name).filter(Boolean).join(', '), x + 14, y - 59, 180, 9, { color: theme.palette.muted, lineHeight: 12, maxLines: 2 })
  })
  const links = characters.flatMap(character => getRelationshipLinks(character).map(rel => {
    const target = characters.find(item => item.id === rel.targetId)
    return target ? `${character.name} - ${rel.type || 'linked'} - ${target.name}` : ''
  })).filter(Boolean)
  pdf.rect(55, 58, 730, 130, theme.palette.panel, theme.palette.accent, 1)
  pdf.text('RELATIONSHIP INDEX', 72, 164, 11, { bold: true, color: theme.palette.text, maxWidth: 690 })
  links.slice(0, 12).forEach((link, index) => {
    const col = index < 6 ? 0 : 1
    const row = index % 6
    pdf.text(link, 72 + col * 355, 141 - row * 15, 8.5, { color: theme.palette.muted, maxWidth: 320 })
  })
  return pdfContent(pdf)
}

const createOutlinePages = (projectData, theme) => {
  const pages = []
  const workspaceLabel = getProjectWorkspaceLabel(projectData.project)
  const structure = getProjectType(projectData.project?.type).structure || {}
  const sectionLabel = `${workspaceLabel} Structure`
  buildOutline(projectData).forEach(({ act, chapters }, actIndex) => {
    const pdf = makePdfCanvas(theme)
    const contentStartY = pdf.pageBase(sectionLabel, act.title || `${structure.level1 || 'Act'} ${actIndex + 1}`, act.synopsis || 'Outline structure and scene counts.')
    chapters.slice(0, 8).forEach(({ chapter, scenes }, index) => {
      const col = index % 2
      const row = Math.floor(index / 2)
      const x = 60 + col * 365
      const y = Math.min(420, contentStartY - 24) - row * 80
      pdf.rect(x, y - 58, 320, 58, theme.palette.panel, theme.palette.border, 0.8)
      pdf.text(chapter.title || `${structure.level2 || 'Chapter'} ${index + 1}`, x + 14, y - 20, 13, { bold: true, color: theme.palette.text, maxWidth: 220 })
      const sessionSummary = isCampaignProject(projectData.project) ? sessionExportSummary(chapter) : ''
      pdf.textBox(sessionSummary || chapter.synopsis || `${scenes.length} scenes`, x + 14, y - 38, 290, 9, { color: theme.palette.muted, lineHeight: 12, maxLines: 2 })
      pdf.text(`${scenes.reduce((sum, scene) => sum + wordCount(scene.content), 0).toLocaleString()} words`, x + 246, y - 20, 8, { bold: true, color: theme.palette.accent, maxWidth: 60 })
    })
    pages.push(pdfPage(sectionLabel, act.title || `${structure.level1 || 'Act'} ${actIndex + 1}`, pdfContent(pdf)))
  })
  return pages
}

const createPdfBytes = (pageContents, title, projectData) => {
  const pageDescriptors = pageContents.map(page => typeof page === 'string' ? { content: page, links: [] } : { links: [], ...page })
  const chunks = []
  const offsets = [0]
  const write = (value) => {
    const bytes = typeof value === 'string' ? textEncoder.encode(value) : value
    chunks.push(bytes)
  }
  const addObject = (id, body) => {
    offsets[id] = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    write(`${id} 0 obj\n${body}\nendobj\n`)
  }

  write('%PDF-1.4\n')
  addObject(1, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  addObject(2, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
  addObject(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>')
  const pagesId = 4
  const plannedPages = []
  let nextId = 5
  pageDescriptors.forEach(page => {
    const pageImages = page.images ?? []
    plannedPages.push({
      ...page,
      contentId: nextId++,
      pageId: nextId++,
      annotIds: (page.links ?? []).map(() => nextId++),
      images: pageImages.map(image => ({ ...image, objectId: nextId++ })),
    })
  })
  const pageIds = plannedPages.map(page => page.pageId)
  const outlineSections = []
  plannedPages.forEach(page => {
    if (!page.section || page.section === 'Cover' || page.section === 'Table of Contents') return
    let section = outlineSections.find(item => item.title === page.section)
    if (!section) {
      section = { title: page.section, page, children: [] }
      outlineSections.push(section)
    }
    section.children.push({ title: page.title || page.section, page })
  })
  const outlinesId = outlineSections.length ? nextId++ : null
  outlineSections.forEach(section => {
    section.id = nextId++
    section.children.forEach(child => { child.id = nextId++ })
  })

  plannedPages.forEach(page => {
    ;(page.images ?? []).forEach(image => {
      offsets[image.objectId] = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      write(`${image.objectId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`)
      write(image.bytes)
      write('\nendstream\nendobj\n')
    })
  })

  plannedPages.forEach(page => {
    const contentBytes = textEncoder.encode(page.content)
    offsets[page.contentId] = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    write(`${page.contentId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`)
    write(contentBytes)
    write('\nendstream\nendobj\n')
  })

  plannedPages.forEach(page => {
    ;(page.links ?? []).forEach((link, index) => {
      const targetPage = plannedPages[link.pageIndex]
      if (!targetPage) return
      const rect = link.rect.map(value => Number(value).toFixed(2)).join(' ')
      addObject(page.annotIds[index], `<< /Type /Annot /Subtype /Link /Rect [${rect}] /Border [0 0 0] /Dest [${targetPage.pageId} 0 R /XYZ null null null] >>`)
    })
  })

  plannedPages.forEach(page => {
    const validAnnots = page.annotIds.filter(Boolean)
    const annots = validAnnots.length ? ` /Annots [${validAnnots.map(id => `${id} 0 R`).join(' ')}]` : ''
    const xObjects = (page.images ?? []).length
      ? ` /XObject << ${page.images.map(image => `/${image.name} ${image.objectId} 0 R`).join(' ')} >>`
      : ''
    addObject(page.pageId, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4_LANDSCAPE.width} ${A4_LANDSCAPE.height}] /Resources << /Font << /F1 1 0 R /F2 2 0 R /F3 3 0 R >>${xObjects} >> /Contents ${page.contentId} 0 R${annots} >>`)
  })
  addObject(pagesId, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)

  if (outlinesId) {
    outlineSections.forEach((section, sectionIndex) => {
      const prev = outlineSections[sectionIndex - 1]
      const next = outlineSections[sectionIndex + 1]
      const children = section.children
      const childRefs = children.length
        ? ` /First ${children[0].id} 0 R /Last ${children[children.length - 1].id} 0 R /Count ${children.length}`
        : ''
      addObject(section.id, `<< /Title (${pdfText(section.title)}) /Parent ${outlinesId} 0 R${prev ? ` /Prev ${prev.id} 0 R` : ''}${next ? ` /Next ${next.id} 0 R` : ''}${childRefs} /Dest [${section.page.pageId} 0 R /XYZ null null null] >>`)
      children.forEach((child, childIndex) => {
        const prevChild = children[childIndex - 1]
        const nextChild = children[childIndex + 1]
        addObject(child.id, `<< /Title (${pdfText(child.title)}) /Parent ${section.id} 0 R${prevChild ? ` /Prev ${prevChild.id} 0 R` : ''}${nextChild ? ` /Next ${nextChild.id} 0 R` : ''} /Dest [${child.page.pageId} 0 R /XYZ null null null] >>`)
      })
    })
    addObject(outlinesId, `<< /Type /Outlines /First ${outlineSections[0].id} 0 R /Last ${outlineSections[outlineSections.length - 1].id} 0 R /Count ${outlineSections.length} >>`)
  }

  // Embed the full project JSON so a YOW PDF can be re-imported with all connections intact.
  let yowDataId = null
  if (projectData) {
    try {
      // Strip _pdfImage fields added by prepareProjectPdfData — render-only, not needed for re-import
      const cleanData = {
        ...projectData,
        characters: (projectData.characters ?? []).map(character => {
          const copy = { ...character }
          delete copy._pdfImage
          return copy
        }),
      }
      const json = JSON.stringify(cleanData)
      const marker = '%%YOW-DATA-BEGIN%%'
      const endMarker = '%%YOW-DATA-END%%'
      const streamBody = `\n${marker}\n${json}\n${endMarker}\n`
      const streamBytes = textEncoder.encode(streamBody)
      yowDataId = nextId++
      offsets[yowDataId] = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      write(`${yowDataId} 0 obj\n<< /Length ${streamBytes.length} >>\nstream`)
      write(streamBytes)
      write('\nendstream\nendobj\n')
    } catch { yowDataId = null }
  }

  const catalogId = nextId++
  addObject(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R${outlinesId ? ` /Outlines ${outlinesId} 0 R /PageMode /UseOutlines` : ''}${yowDataId ? ` /YOW ${yowDataId} 0 R` : ''} >>`)
  const infoId = nextId++
  addObject(infoId, `<< /Title (${pdfText(title)}) /Producer (Your Own World) >>`)
  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  write(`xref\n0 ${nextId}\n0000000000 65535 f \n`)
  for (let id = 1; id < nextId; id += 1) {
    write(`${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`)
  }
  write(`trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  return concatBytes(chunks, totalLength)
}

const createProjectPdfPages = (projectData, theme) => {
  const enabled = getEnabled(projectData)
  const records = []
  if (enabled.has('characters')) {
    sortByTitle(projectData.characters, 'name').forEach((character, index) => {
      records.push(...createCharacterPages(character, projectData, theme, index))
    })
  }
  if (enabled.has('familytree') && (projectData.characters ?? []).length) {
    records.push(pdfPage('Relationships', 'Relationship Atlas', createRelationshipsPage(projectData.characters ?? [], theme)))
  }
  if (enabled.has('locations')) {
    sortByTitle(projectData.locations, 'name').forEach(location => {
      records.push(...createArticlePages({
        section: 'Locations',
        eyebrow: 'Encyclopedia Article',
        title: location.name || 'Unnamed Location',
        subtitle: valueList(location.type, location.region, location.tags?.join(', ')).join(' - '),
        body: location.description || location.notes || location.content,
        related: relatedEntries(location, projectData, 'location'),
        artLabel: 'Location Art',
        initial: firstLetter(location.name).replace(/&.*;/, ''),
      }, theme))
    })
  }
  if (enabled.has('factions')) {
    sortByTitle(projectData.factions, 'name').forEach(faction => {
      records.push(...createArticlePages({
        section: 'Factions',
        eyebrow: 'Faction Dossier',
        title: faction.name || 'Unnamed Faction',
        subtitle: valueList(faction.type, faction.leader && `Led by ${faction.leader}`, faction.status).join(' - '),
        body: faction.description || faction.notes,
        related: relatedEntries(faction, projectData, 'faction'),
        artLabel: 'Faction Seal',
        initial: firstLetter(faction.name).replace(/&.*;/, ''),
      }, theme))
    })
  }
  if (enabled.has('lore')) {
    sortByTitle(projectData.loreEntries).forEach(entry => {
      records.push(...createArticlePages({
        section: 'Lore',
        eyebrow: 'Lore Encyclopedia',
        title: entry.title || 'Untitled Lore Entry',
        subtitle: valueList(entry.category || 'Uncategorized', entry.tags?.join(', ')).join(' - '),
        body: entry.content,
        related: relatedEntries(entry, projectData, 'lore'),
        artLabel: 'Lore Plate',
        initial: firstLetter(entry.title).replace(/&.*;/, ''),
      }, theme))
    })
  }
  if (enabled.has('timeline')) {
    sortByOrder(projectData.timeline).forEach((event, index) => {
      records.push(...createTimelinePages(event, projectData, theme, index, 'Timeline & History', 'Timeline'))
    })
  }
  if (enabled.has('worldhistory')) {
    sortByOrder(projectData.worldHistory).forEach((event, index) => {
      records.push(...createTimelinePages(event, projectData, theme, index, 'World History', 'World History'))
    })
  }
  if (enabled.has('map')) {
    ;(projectData.maps ?? []).forEach(map => {
      records.push(...createArticlePages({
        section: 'Maps',
        eyebrow: 'Cartography',
        title: map.name || 'Untitled Map',
        subtitle: valueList(map.mapType, map.mapLabels?.length && `${map.mapLabels.length} labels`, map.mapRegions?.length && `${map.mapRegions.length} regions`).join(' - '),
        body: [...(map.mapLabels ?? []), ...(map.mapPins ?? [])].map(item => item.text || item.label || item.name).filter(Boolean).join(', ') || 'Map metadata available. Rendered pixel art is stored separately in the map builder.',
        related: [],
        artLabel: 'Map Plate',
        initial: firstLetter(map.name || 'Map').replace(/&.*;/, ''),
      }, theme))
    })
  }
  if (enabled.has('outline')) records.push(...createOutlinePages(projectData, theme))
  if (enabled.has('ideas')) {
    sortByTitle(projectData.ideaEntries).forEach(entry => {
      records.push(...createArticlePages({
        section: 'Ideas',
        eyebrow: 'Field Notes',
        title: entry.title || 'Untitled Note',
        subtitle: valueList(entry.tags?.join(', ')).join(' - '),
        body: entry.content || entry.text || entry.body,
        related: [],
        artLabel: 'Notes',
        initial: firstLetter(entry.title || 'N').replace(/&.*;/, ''),
      }, theme))
    })
  }
  const tocLineCount = [...new Set(records.map(record => record.section))].length + records.length
  const tocPageCount = Math.max(1, Math.ceil(tocLineCount / 23))
  return [
    pdfPage('Cover', projectData.project?.title || getProjectExportLabel(projectData.project), createCoverPage(projectData, theme)),
    ...createTocPages(records, theme, tocPageCount),
    ...records,
  ]
}

export const createProjectPdfBlob = async (projectData, options = {}) => {
  const theme = getExportPdfTheme(options.themeId)
  const preparedData = await prepareProjectPdfData(projectData)
  const pages = createProjectPdfPages(preparedData, theme)
  const bytes = createPdfBytes(pages, preparedData.project?.title || getProjectExportLabel(preparedData.project), preparedData)
  return new Blob([bytes], { type: 'application/pdf' })
}

export const downloadProjectPdf = async (projectData, options = {}) => {
  const blob = await createProjectPdfBlob(projectData, options)
  downloadBlob(blob, getProjectPdfFilename(projectData.project))
}

const makeProjectPages = (projectData, theme) => {
  const project = projectData.project ?? {}
  const enabled = getEnabled(projectData)
  const pages = []
  const sections = []
  const addSection = (key, title, eyebrow, subtitle, body, options = {}) => {
    if (options.skipWhenEmpty && !cleanText(body)) return
    sections.push({ key, title, eyebrow, subtitle })
    pages.push(dividerPage(`${key}-divider`, sections.length, title, subtitle))
    pages.push(sectionPage(key, eyebrow, title, subtitle, body, options.modifier))
  }
  const coverImage = project.coverPhoto || projectData.series?.coverPhoto || ''

  pages.push(`
    <section class="pdf-page cover-page">
      ${coverImage ? `<img class="cover-art" src="${escapeHtml(coverImage)}" alt="">` : ''}
      <div class="cover-overlay"></div>
      <div class="cover-copy">
        <p>${escapeHtml(theme.cover.marker)} / WORLD BIBLE</p>
        <h1>${escapeHtml(project.title || 'Untitled Project')}</h1>
        <div class="cover-description">${prose(project.description || projectData.series?.description || 'A complete world bible export from Your Own World.')}</div>
        ${projectData.series?.name ? `<span class="series-mark">${escapeHtml(projectData.series.name)}</span>` : ''}
      </div>
      <div class="cover-stats">
      ${buildSummaryStats(projectData).map(([label, value]) => `<div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('')}
      </div>
    </section>
  `)

  const tocBody = `
    <div class="toc-grid">
      ${[
        ['Characters', projectData.characters?.length ?? 0, enabled.has('characters')],
        ['Relationships', projectData.characters?.filter(c => c.familyGroup || getRelationshipLinks(c).length)?.length ?? 0, enabled.has('familytree')],
        ['Factions', projectData.factions?.length ?? 0, enabled.has('factions')],
        ['Locations', projectData.locations?.length ?? 0, enabled.has('locations')],
        ['Lore', projectData.loreEntries?.length ?? 0, enabled.has('lore')],
        ['Timeline', projectData.timeline?.length ?? 0, enabled.has('timeline')],
        ['World History', projectData.worldHistory?.length ?? 0, enabled.has('worldhistory')],
        ['Maps', projectData.maps?.length ?? 0, enabled.has('map')],
        ['Notes', (projectData.acts?.length ?? 0) + (projectData.ideaEntries?.length ?? 0), enabled.has('outline') || enabled.has('ideas')],
      ].filter(([, , isEnabled]) => isEnabled).map(([label, count], index) => `
        <div class="toc-row">
          <span>${String(index + 1).padStart(2, '0')}</span>
          <strong>${escapeHtml(label)}</strong>
          <em>${escapeHtml(count)} records</em>
        </div>
      `).join('')}
    </div>
  `
  pages.push(sectionPage('contents', 'Index', 'Table of Contents', 'Sections generated from live project data', tocBody, 'toc-page'))

  if (enabled.has('characters')) {
    addSection(
      'characters',
      'Character Dossiers',
      'People',
      'Intelligence files, arcs, roles, and known links',
      sortByTitle(projectData.characters, 'name').map(character => characterDossier(character, projectData)).join('') || emptyState('No characters yet.'),
      { modifier: 'dossier-section' },
    )
  }

  if (enabled.has('familytree')) {
    addSection(
      'relationships',
      'Relationship Atlas',
      'Networks',
      'Family groups and direct relationship records',
      relationshipSection(projectData.characters ?? []),
    )
  }


  if (enabled.has('locations')) {
    addSection(
      'locations',
      'Atlas of Places',
      'Locations',
      'Encyclopedia entries for cities, ruins, realms, and landmarks',
      sortByTitle(projectData.locations, 'name').map(location =>
        articleCard(
          location.name || 'Unnamed Location',
          valueList(location.type, location.region, location.tags?.join(', ')),
          location.description || location.notes || location.content,
          relatedEntries(location, projectData, 'location'),
          getImage(location),
        )
      ).join('') || emptyState('No locations yet.'),
    )
  }

  if (enabled.has('factions')) {
    addSection(
      'factions',
      'Factions and Powers',
      'Political Index',
      'Orders, houses, alliances, institutions, and rivals',
      sortByTitle(projectData.factions, 'name').map(faction =>
        articleCard(
          faction.name || 'Unnamed Faction',
          valueList(faction.type, faction.leader && `Led by ${faction.leader}`, faction.status),
          faction.description || faction.notes,
          relatedEntries(faction, projectData, 'faction'),
        )
      ).join('') || emptyState('No factions yet.'),
    )
  }

  if (enabled.has('lore')) {
    addSection(
      'lore',
      'Lore Encyclopedia',
      'Codex Articles',
      'Collector edition world guide entries',
      sortByTitle(projectData.loreEntries).map(entry =>
        articleCard(
          entry.title || 'Untitled Lore Entry',
          valueList(entry.category || 'Uncategorized', entry.tags?.join(', ')),
          entry.content,
          relatedEntries(entry, projectData, 'lore'),
          getImage(entry),
        )
      ).join('') || emptyState('No lore entries yet.'),
    )
  }

  if (enabled.has('timeline')) {
    addSection('timeline', 'Cinematic Timeline', 'Chronology', 'Major beats arranged as an editorial historical spread', timelineSpread(projectData.timeline, projectData, 'timeline'), { modifier: 'timeline-section' })
  }

  if (enabled.has('worldhistory')) {
    addSection('world-history', 'World History', 'Archive', 'Eras, conflicts, founding myths, and turning points', timelineSpread(projectData.worldHistory, projectData, 'history'), { modifier: 'timeline-section' })
  }

  if (enabled.has('map')) {
    addSection('maps', 'Maps and Visual Plates', 'Cartography', 'Project maps and available visual references', mapSection(projectData), { modifier: 'map-section' })
  }

  if (enabled.has('outline') || enabled.has('ideas')) {
    const workspaceLabel = getProjectWorkspaceLabel(projectData.project)
    const ideas = enabled.has('ideas')
      ? sortByTitle(projectData.ideaEntries).map(entry =>
        articleCard(entry.title || 'Untitled Note', valueList(entry.tags?.join(', ')), entry.content || entry.text || entry.body)
      ).join('')
      : ''
    addSection(
      'notes',
      `${workspaceLabel} Structure and Ideas`,
      workspaceLabel,
      'Outline structure, draft counts, project notes, and loose ideas',
      `${enabled.has('outline') ? notesSection(projectData) : ''}${ideas}`,
      { modifier: 'notes-section' },
    )
  }

  return pages
}

const themeVariables = (theme) => Object.entries({
  '--pdf-page': theme.palette.page,
  '--pdf-page-alt': theme.palette.pageAlt,
  '--pdf-panel': theme.palette.panel,
  '--pdf-panel-soft': theme.palette.panelSoft,
  '--pdf-text': theme.palette.text,
  '--pdf-muted': theme.palette.muted,
  '--pdf-faint': theme.palette.faint,
  '--pdf-accent': theme.palette.accent,
  '--pdf-accent-2': theme.palette.accent2,
  '--pdf-border': theme.palette.border,
  '--pdf-shadow': theme.palette.shadow,
  '--pdf-display-font': theme.typography.display,
  '--pdf-body-font': theme.typography.body,
  '--pdf-ui-font': theme.typography.ui,
  '--pdf-cover-overlay': theme.cover.overlay,
  '--pdf-texture': theme.texture,
}).map(([key, value]) => `${key}: ${value};`).join('\n')

export const createProjectVisualPdfHtml = (projectData, options = {}) => {
  const theme = getExportPdfTheme(options.themeId)
  const filename = getProjectPdfFilename(projectData.project)
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(filename)}</title>
  <style>
    :root { ${themeVariables(theme)} }
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: var(--pdf-page); color: var(--pdf-text); }
    body { font-family: var(--pdf-body-font); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pdf-page {
      width: 297mm; min-height: 210mm; page-break-after: always; break-after: page;
      background: var(--pdf-page); background-image: var(--pdf-texture); background-size: 34px 34px, 34px 34px, 34px 34px;
      position: relative; color: var(--pdf-text);
    }
    .pdf-page:last-child { page-break-after: auto; break-after: auto; }
    .page-shell { padding: 13mm 14mm 14mm; }
    .page-header { display: grid; grid-template-columns: 1fr auto; gap: 4mm 10mm; align-items: end; border-bottom: 1px solid var(--pdf-border); padding-bottom: 5mm; margin-bottom: 7mm; }
    .page-header p, .divider-content p, .cover-copy p { margin: 0; font: 900 8pt var(--pdf-ui-font); letter-spacing: .16em; text-transform: uppercase; color: var(--pdf-accent); }
    .page-header h1 { grid-column: 1; margin: 0; font: 700 29pt/1 var(--pdf-display-font); letter-spacing: 0; }
    .page-header span { grid-column: 2; grid-row: 1 / span 2; max-width: 76mm; color: var(--pdf-muted); font: 9.5pt/1.45 var(--pdf-ui-font); text-align: right; }
    h2 { margin: 0 0 2.5mm; font: 700 16pt/1.12 var(--pdf-display-font); letter-spacing: 0; }
    h3 { margin: 0 0 1.5mm; font: 800 9pt/1.2 var(--pdf-ui-font); letter-spacing: .05em; text-transform: uppercase; }
    p { margin: 0 0 3mm; font-size: 9.8pt; line-height: 1.52; overflow-wrap: anywhere; }
    .muted, .empty-state { color: var(--pdf-muted); font-style: italic; }
    .cover-page { height: 210mm; overflow: hidden; display: grid; grid-template-columns: 1.1fr .9fr; padding: 16mm; background: linear-gradient(135deg, var(--pdf-page), var(--pdf-page-alt)); }
    .cover-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .55; }
    .cover-overlay { position: absolute; inset: 0; background: var(--pdf-cover-overlay); }
    .cover-copy { position: relative; align-self: end; max-width: 166mm; z-index: 1; }
    .cover-copy h1 { margin: 4mm 0 5mm; font: 700 48pt/.9 var(--pdf-display-font); letter-spacing: 0; text-wrap: balance; }
    .cover-description { max-width: 128mm; color: var(--pdf-muted); }
    .cover-description p { font-size: 12pt; line-height: 1.48; }
    .series-mark { display: inline-flex; margin-top: 5mm; border: 1px solid var(--pdf-border); padding: 2mm 4mm; color: var(--pdf-accent); font: 800 8pt var(--pdf-ui-font); letter-spacing: .12em; text-transform: uppercase; }
    .cover-stats { position: relative; z-index: 1; align-self: end; justify-self: end; display: grid; grid-template-columns: repeat(2, 38mm); gap: 3mm; }
    .cover-stats div, .toc-row, .article-card, .dossier-card, .family-card, .relationship-board, .timeline-event, .map-card, .outline-act {
      border: 1px solid color-mix(in srgb, var(--pdf-border) 74%, transparent); background: color-mix(in srgb, var(--pdf-panel) 92%, transparent);
      box-shadow: 0 12px 30px var(--pdf-shadow);
    }
    .cover-stats div { padding: 4mm; min-height: 25mm; }
    .cover-stats strong { display: block; font: 900 20pt/1 var(--pdf-ui-font); color: var(--pdf-accent); }
    .cover-stats span, .meta span, .dossier-topline, .chapter-card span, .chapter-card small { font: 800 7.2pt var(--pdf-ui-font); color: var(--pdf-muted); letter-spacing: .1em; text-transform: uppercase; }
    .divider-page { height: 210mm; overflow: hidden; display: grid; place-items: center; background: linear-gradient(125deg, var(--pdf-page), var(--pdf-page-alt)); }
    .divider-mark { position: absolute; right: 12mm; bottom: 0; font: 900 92pt/.8 var(--pdf-ui-font); color: color-mix(in srgb, var(--pdf-accent) 20%, transparent); }
    .divider-content { width: 210mm; border-top: 1px solid var(--pdf-border); border-bottom: 1px solid var(--pdf-border); padding: 10mm 0; }
    .divider-content h1 { margin: 3mm 0; font: 700 45pt/.92 var(--pdf-display-font); letter-spacing: 0; }
    .divider-content span { color: var(--pdf-muted); font: 12pt/1.4 var(--pdf-ui-font); }
    .toc-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4mm; }
    .toc-row { min-height: 28mm; padding: 4mm; display: grid; align-content: space-between; }
    .toc-row span { color: var(--pdf-accent); font: 900 18pt/1 var(--pdf-ui-font); }
    .toc-row strong { font: 700 15pt/1.1 var(--pdf-display-font); }
    .toc-row em { color: var(--pdf-muted); font: 800 7.5pt var(--pdf-ui-font); letter-spacing: .08em; text-transform: uppercase; font-style: normal; }
    .dossier-section .page-shell, .notes-section .page-shell { padding-bottom: 11mm; }
    .dossier-card { break-inside: avoid; display: grid; grid-template-columns: 39mm 1fr; gap: 5mm; padding: 5mm; margin-bottom: 5mm; }
    .portrait-frame { width: 39mm; min-height: 52mm; border: 1px solid var(--pdf-border); background: var(--pdf-panel-soft); display: grid; place-items: center; overflow: hidden; }
    .portrait-frame img, .article-image, .map-preview img { width: 100%; height: 100%; object-fit: cover; }
    .portrait-frame span, .map-preview span { font: 900 32pt/1 var(--pdf-ui-font); color: var(--pdf-accent); opacity: .68; }
    .dossier-topline { display: flex; justify-content: space-between; gap: 6mm; margin-bottom: 1.5mm; }
    .dossier-body h2 { font-size: 20pt; }
    .dossier-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2.5mm; margin: 3mm 0; }
    .dossier-grid div { border-left: 2px solid var(--pdf-accent); padding-left: 2.5mm; }
    .dossier-grid span, .related-strip strong, .relationship-tags strong { display: block; color: var(--pdf-accent); font: 900 7pt var(--pdf-ui-font); letter-spacing: .09em; text-transform: uppercase; }
    .dossier-grid p { font: 8.6pt/1.35 var(--pdf-ui-font); margin: 1mm 0 0; color: var(--pdf-muted); }
    .copy { column-count: 2; column-gap: 7mm; }
    .copy p { break-inside: avoid; }
    .meta { display: flex; flex-wrap: wrap; gap: 1.6mm 3mm; margin-bottom: 3mm; }
    .meta span { border: 1px solid color-mix(in srgb, var(--pdf-border) 70%, transparent); padding: 1.1mm 2mm; background: color-mix(in srgb, var(--pdf-panel-soft) 72%, transparent); }
    .relationship-tags, .related-strip { display: flex; flex-wrap: wrap; gap: 1.5mm; margin-top: 3mm; break-inside: avoid; }
    .relationship-tags span, .related-strip span { border: 1px solid var(--pdf-border); padding: 1mm 2mm; color: var(--pdf-muted); font: 7.8pt var(--pdf-ui-font); }
    .article-card { break-inside: avoid; display: grid; grid-template-columns: 43mm 1fr; gap: 5mm; padding: 5mm; margin-bottom: 5mm; }
    .article-card--text { grid-template-columns: 1fr; }
    .article-image { height: 51mm; border: 1px solid var(--pdf-border); }
    .family-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4mm; margin-bottom: 5mm; }
    .family-card { padding: 4mm; break-inside: avoid; }
    .family-card div { display: flex; flex-wrap: wrap; gap: 1.5mm; }
    .family-card div span { border: 1px solid var(--pdf-border); padding: 1mm 1.8mm; color: var(--pdf-muted); font: 7.8pt var(--pdf-ui-font); }
    .relationship-board { padding: 5mm; }
    .link-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: 3mm; align-items: center; padding: 2mm 0; border-top: 1px solid color-mix(in srgb, var(--pdf-border) 45%, transparent); font: 9pt var(--pdf-ui-font); }
    .link-row span { color: var(--pdf-accent); text-transform: uppercase; letter-spacing: .08em; font-size: 7pt; }
    .timeline-spread { display: grid; gap: 4mm; }
    .timeline-event { break-inside: avoid; display: grid; grid-template-columns: 21mm 1fr; gap: 4mm; padding: 4.5mm; position: relative; }
    .timeline-event:before { content:""; position:absolute; left: 14mm; top: 0; bottom: 0; width: 1px; background: var(--pdf-border); }
    .timeline-index { position: relative; z-index: 1; width: 17mm; height: 17mm; border: 1px solid var(--pdf-accent); display: grid; place-items: center; background: var(--pdf-page); color: var(--pdf-accent); font: 900 10pt var(--pdf-ui-font); }
    .timeline-related { color: var(--pdf-accent); font: 800 7.5pt var(--pdf-ui-font); letter-spacing: .08em; text-transform: uppercase; }
    .map-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5mm; }
    .map-card { break-inside: avoid; display: grid; grid-template-columns: 57mm 1fr; gap: 5mm; padding: 5mm; }
    .map-preview { height: 43mm; border: 1px solid var(--pdf-border); background: var(--pdf-panel-soft); display: grid; place-items: center; overflow: hidden; }
    .outline-act { padding: 5mm; margin-bottom: 5mm; break-inside: avoid; }
    .chapter-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3mm; margin-top: 3mm; }
    .chapter-card { border: 1px solid var(--pdf-border); background: color-mix(in srgb, var(--pdf-panel-soft) 72%, transparent); padding: 3mm; min-height: 30mm; overflow: hidden; }
    .chapter-card p { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; font: 8.5pt/1.35 var(--pdf-ui-font); color: var(--pdf-muted); }
    .empty-state { padding: 8mm; border: 1px dashed var(--pdf-border); background: color-mix(in srgb, var(--pdf-panel) 70%, transparent); }
    @media screen {
      body { padding: 18px; }
      .pdf-page { margin: 0 auto 18px; box-shadow: 0 16px 48px rgba(0,0,0,.32); }
    }
  </style>
</head>
<body>
  ${makeProjectPages(projectData, theme).join('')}
  <script>
    document.title = ${JSON.stringify(filename)};
    window.addEventListener('load', () => setTimeout(() => window.print(), 400));
  </script>
</body>
</html>`
}

export const openProjectVisualPdf = (projectData, options = {}) => {
  const html = createProjectVisualPdfHtml(projectData, options)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  if (!win) {
    const a = document.createElement('a')
    a.href = url
    a.download = getProjectPdfFilename(projectData.project).replace('.pdf', '.html')
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
}
