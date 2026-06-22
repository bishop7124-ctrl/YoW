import { getExportPdfTheme } from './projectExportThemes.js'
import { getProjectType } from '../constants/projectTypes.js'
import {
  cleanText, escapeHtml, sortByOrder, sortByTitle, valueList,
  asArray, isCampaignProject, sessionExportRows, sessionExportSummary,
  getRelationshipLinks, getEnabled, buildOutline, wordCount, buildSummaryStats,
  getProjectExportLabel, getProjectWorkspaceLabel, getProjectPdfFilename, downloadBlob,
} from './projectExportHelpers.js'

const textEncoder = new TextEncoder()

const concatBytes = (chunks, totalLength) => {
  const output = new Uint8Array(totalLength)
  let offset = 0
  chunks.forEach(chunk => { output.set(chunk, offset); offset += chunk.length })
  return output
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

const MAP_OBJECT_TYPE_LABELS = {
  marker: 'Marker',
  stamp: 'Stamp',
  label: 'Label',
  location: 'Linked location',
  region: 'Region',
  river: 'Water / river',
  mountain: 'Legacy mountain line',
  road: 'Road / path',
  border: 'Border / wall',
  shape: 'Land / room',
}

const mapObjectTypeLabel = (object) => {
  const semantic = object?.metadata?.semanticType
  if (semantic === 'room') return 'Room'
  if (semantic === 'corridor') return 'Corridor'
  if (semantic === 'wall') return 'Wall'
  return MAP_OBJECT_TYPE_LABELS[object?.type] || object?.type || 'Object'
}

const getMapObjects = (map = {}) => asArray(map.mapObjects ?? map.objects)
const getMapLayers = (map = {}) => asArray(map.mapLayers ?? map.layers)
const normalizeExportGrid = (map = {}) => {
  const settings = map?.metadata?.gridSettings || {}
  const interior = map?.mapType === 'interior' || map?.metadata?.mapType === 'interior'
  const size = Number.isFinite(Number(settings.size)) ? Number(settings.size) : interior ? 80 : 40
  const opacity = Number.isFinite(Number(settings.opacity)) ? Number(settings.opacity) : interior ? 0.36 : 0.28
  const color = safeMapColor(settings.color, interior ? '#6f7780' : '#5b4630')
  return {
    enabled: settings.enabled !== undefined ? Boolean(settings.enabled) : interior,
    type: settings.type === 'hex' ? 'hex' : 'square',
    size: Math.max(10, Math.min(240, size)),
    opacity: Math.max(0.05, Math.min(0.9, opacity)),
    color,
    snapToGrid: settings.snapToGrid !== undefined ? Boolean(settings.snapToGrid) : interior,
    scale: String(settings.scale || '1 square = 5 ft').trim(),
  }
}

const locationNameById = (projectData) => {
  const lookup = new Map()
  asArray(projectData.locations).forEach(location => {
    if (location?.id) lookup.set(location.id, location.name || 'Untitled Location')
  })
  return lookup
}

const mapObjectName = (object, locationsById) => {
  const meta = object?.metadata || {}
  if (meta.locationId && locationsById.has(meta.locationId)) return locationsById.get(meta.locationId)
  return meta.name || meta.text || object?.name || object?.label || MAP_OBJECT_TYPE_LABELS[object?.type] || 'Map object'
}

const summarizeMap = (map, projectData) => {
  const locationsById = locationNameById(projectData)
  const objects = getMapObjects(map)
  const layers = getMapLayers(map)
  const grid = normalizeExportGrid(map)
  const legacyLabels = [...asArray(map.mapLabels), ...asArray(map.mapPins)]
    .map(item => item.text || item.label || item.name)
    .filter(Boolean)
  const legacyRegions = asArray(map.mapRegions).map(item => item.name || item.label).filter(Boolean)
  const objectLabels = objects
    .filter(object => ['label', 'location', 'marker'].includes(object?.type))
    .map(object => mapObjectName(object, locationsById))
    .filter(Boolean)
  const regions = [
    ...legacyRegions,
    ...objects.filter(object => object?.type === 'region').map(object => mapObjectName(object, locationsById)),
  ].filter(Boolean)
  const routes = objects
    .filter(object => ['road', 'border', 'river'].includes(object?.type))
    .map(object => {
      const kind = mapObjectTypeLabel(object)
      return `${kind}: ${mapObjectName(object, locationsById)}`
    })
  const stamps = objects
    .filter(object => object?.type === 'stamp')
    .map(object => mapObjectName(object, locationsById))
    .filter(Boolean)
  const land = objects
    .filter(object => object?.type === 'shape')
    .map(object => mapObjectName(object, locationsById))
    .filter(Boolean)
  const typeCounts = objects.reduce((counts, object) => {
    const label = mapObjectTypeLabel(object)
    counts[label] = (counts[label] || 0) + 1
    return counts
  }, {})
  const layerLines = layers.map(layer => {
    const layerCount = objects.filter(object => (object?.metadata?.layerId || 'objects') === layer.id).length
    const flags = valueList(layer.visible === false && 'hidden', layer.locked && 'locked').join(', ')
    return `${layer.name || 'Layer'}: ${layerCount} object${layerCount === 1 ? '' : 's'}${flags ? ` (${flags})` : ''}`
  })
  const countLines = Object.entries(typeCounts).map(([label, count]) => `${label}: ${count}`)
  const lines = [
    layers.length ? `Layers: ${layerLines.join('; ')}` : '',
    grid.enabled ? `Movement grid: ${grid.type}, ${grid.size}px, ${grid.scale}${grid.snapToGrid ? ', snap on' : ''}` : '',
    countLines.length ? `Object counts: ${countLines.join('; ')}` : '',
    objectLabels.length || legacyLabels.length ? `Labels and places: ${[...objectLabels, ...legacyLabels].slice(0, 18).join(', ')}` : '',
    regions.length ? `Regions: ${regions.slice(0, 14).join(', ')}` : '',
    routes.length ? `Routes and water: ${routes.slice(0, 12).join(', ')}` : '',
    stamps.length ? `Stamps: ${stamps.slice(0, 14).join(', ')}` : '',
    land.length ? `Land and rooms: ${land.slice(0, 12).join(', ')}` : '',
  ].filter(Boolean)
  return {
    labels: [...objectLabels, ...legacyLabels],
    regions,
    layers,
    objects,
    lines,
  }
}

const mapObjectPoints = (object) =>
  asArray(object?.metadata?.points)
    .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map(point => ({
      x: (Number(object.x) || 0) + point.x * (Number(object.width) || 1),
      y: (Number(object.y) || 0) + point.y * (Number(object.height) || 1),
    }))

const safeMapColor = (value, fallback) =>
  /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : fallback

const mapPreviewElement = (object, locationsById) => {
  if (!object || object.visible === false) return ''
  const meta = object.metadata || {}
  const x = Number(object.x) || 0
  const y = Number(object.y) || 0
  const width = Math.max(1, Number(object.width) || 1)
  const height = Math.max(1, Number(object.height) || 1)
  const left = x - width / 2
  const top = y - height / 2
  const fill = safeMapColor(meta.fill, object.type === 'river' ? '#7fb7c9' : object.type === 'road' ? '#9a7a4d' : '#d8c08a')
  const stroke = safeMapColor(meta.stroke, '#3f3527')
  const opacity = Number.isFinite(meta.opacity) ? Math.max(0.08, Math.min(1, meta.opacity)) : 1
  const name = escapeHtml(mapObjectName(object, locationsById))
  const points = mapObjectPoints(object)

  if (object.type === 'label') {
    const fontSize = Math.max(14, Math.min(144, Number(meta.fontSize) || 42))
    const textColor = meta.textColor || fill
    const outlineColor = meta.outlineColor || 'transparent'
    const backgroundColor = meta.backgroundColor || 'transparent'
    const background = backgroundColor === 'transparent' ? '' : `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="8" fill="${safeMapColor(backgroundColor, '#ffffff')}"/>`
    return `<g>${background}<text x="${x.toFixed(1)}" y="${(y + fontSize * 0.34).toFixed(1)}" text-anchor="middle" font-family="${escapeHtml(meta.fontFamily || 'Georgia, serif')}" font-size="${fontSize}" font-weight="${Number(meta.fontWeight) || 600}" font-style="${meta.fontStyle === 'italic' ? 'italic' : 'normal'}" fill="${textColor === 'transparent' ? 'none' : safeMapColor(textColor, '#2a241b')}" stroke="${outlineColor === 'transparent' ? 'none' : safeMapColor(outlineColor, '#f8edd0')}" stroke-width="${outlineColor === 'transparent' ? 0 : Math.max(1, fontSize * 0.05).toFixed(1)}" paint-order="stroke">${escapeHtml(meta.text || meta.name || 'Label')}</text></g>`
  }
  if (object.type === 'location') {
    const glyphs = { pin: '●', dot: '●', diamond: '◆', star: '★', tower: '▥' }
    const glyph = glyphs[meta.markerIcon] || glyphs.pin
    const radius = Math.max(12, Math.min(width, height) * 0.28)
    return `<g><text x="${x.toFixed(1)}" y="${(y + radius * 0.28).toFixed(1)}" text-anchor="middle" font-family="Georgia, serif" font-size="${(radius * 1.5).toFixed(1)}" font-weight="700" fill="${fill}" stroke="${stroke}" stroke-width="2">${glyph}</text><text x="${x.toFixed(1)}" y="${(y + radius * 1.25).toFixed(1)}" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.max(12, radius * 0.46).toFixed(1)}" font-weight="700" fill="${stroke}" stroke="#f6eedb" stroke-width="3" paint-order="stroke">${name}</text></g>`
  }
  if (['stamp', 'marker'].includes(object.type)) {
    const radius = Math.max(10, Math.min(width, height) / 2)
    return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="3"/><text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.max(12, radius * 0.55).toFixed(1)}" font-weight="800" fill="${stroke}">${firstLetter(name).replace(/&.*;/, '')}</text></g>`
  }
  if (['river', 'road', 'border'].includes(object.type) && points.length >= 2) {
    const dash = meta.dashed ? ' stroke-dasharray="18 12"' : ''
    const closed = meta.closed || meta.waterKind === 'waterMass'
    const pointList = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
    if (closed && points.length >= 3) {
      return `<polygon points="${pointList}" fill="${fill}" fill-opacity="${Math.min(0.55, opacity)}" stroke="${stroke}" stroke-width="${Math.max(2, Number(meta.lineThickness) || 5)}"/>`
    }
    if (meta.semanticType === 'corridor') {
      const thickness = Math.max(18, Number(meta.lineThickness) || 56)
      const floor = safeMapColor(meta.floorFill, '#a1a5a5')
      const edge = safeMapColor(meta.edgeStroke, '#252a2d')
      return `<g><polyline points="${pointList}" fill="none" stroke="${edge}" stroke-width="${thickness + 12}" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pointList}" fill="none" stroke="${floor}" stroke-width="${thickness}" stroke-linecap="round" stroke-linejoin="round"/></g>`
    }
    if (meta.semanticType === 'wall') {
      const thickness = Math.max(6, Number(meta.lineThickness) || 12)
      const highlight = safeMapColor(meta.wallHighlight, '#73797c')
      const wallPoints = meta.closed ? `${pointList} ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}` : pointList
      const texture = meta.wallTexture || 'stone'
      const dash = texture === 'brick'
        ? `${Math.max(8, thickness * 1.25).toFixed(1)} ${Math.max(3, thickness * 0.3).toFixed(1)}`
        : texture === 'stone'
          ? `${Math.max(5, thickness * 0.72).toFixed(1)} ${Math.max(3, thickness * 0.28).toFixed(1)}`
          : ''
      const detail = texture === 'solid' ? '' : `<polyline points="${wallPoints}" fill="none" stroke="${highlight}" stroke-opacity=".7" stroke-width="${Math.max(2, thickness * (texture === 'wood' ? 0.34 : 0.24))}" stroke-linecap="${texture === 'wood' ? 'round' : 'butt'}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
      return `<g><polyline points="${wallPoints}" fill="none" stroke="${stroke}" stroke-width="${thickness + 5}" stroke-linecap="round" stroke-linejoin="round"/>${detail}</g>`
    }
    return `<polyline points="${pointList}" fill="none" stroke="${stroke}" stroke-width="${Math.max(2, Number(meta.lineThickness) || 5)}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`
  }
  if ((object.type === 'region' || meta.shapeKind === 'polygon') && points.length >= 3) {
    return `<polygon points="${points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}" fill="${fill}" fill-opacity="${Math.min(0.55, opacity)}" stroke="${stroke}" stroke-width="3"/>`
  }
  if (meta.shapeKind === 'circle') {
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(width / 2).toFixed(1)}" ry="${(height / 2).toFixed(1)}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="3"/>`
  }
  return `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="10" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="3"><title>${name}</title></rect>`
}

const generatedMapGridElements = (map) => {
  const grid = normalizeExportGrid(map)
  if (!grid.enabled) return ''
  const width = Number(map?.width) || 1200
  const height = Number(map?.height) || 760
  const stroke = grid.color
  const opacity = grid.opacity.toFixed(2)
  const lines = []
  if (grid.type === 'hex') {
    const radius = grid.size / 2
    const hexWidth = Math.sqrt(3) * radius
    const rowHeight = radius * 1.5
    const rows = Math.ceil(height / rowHeight) + 2
    const columns = Math.ceil(width / hexWidth) + 2
    for (let row = -1; row <= rows; row += 1) {
      const y = row * rowHeight
      const offsetX = Math.abs(row % 2) * hexWidth / 2
      for (let column = -1; column <= columns; column += 1) {
        const x = column * hexWidth + offsetX
        const points = Array.from({ length: 6 }, (_, side) => {
          const angle = -Math.PI / 2 + side * Math.PI / 3
          return `${(x + Math.cos(angle) * radius).toFixed(1)},${(y + Math.sin(angle) * radius).toFixed(1)}`
        }).join(' ')
        lines.push(`<polygon points="${points}" fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="1"/>`)
      }
    }
  } else {
    for (let x = 0; x <= width; x += grid.size) {
      lines.push(`<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${height}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="1"/>`)
    }
    for (let y = 0; y <= height; y += grid.size) {
      lines.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${width}" y2="${y.toFixed(1)}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="1"/>`)
    }
  }
  const label = grid.scale ? `<text x="32" y="${height - 32}" font-family="Georgia, serif" font-size="28" font-weight="700" fill="${stroke}" fill-opacity="${Math.min(0.9, grid.opacity + 0.25).toFixed(2)}">${escapeHtml(grid.scale)}</text>` : ''
  return `<g>${lines.join('')}${label}</g>`
}

const generatedMapPreview = (map, projectData) => {
  const locationsById = locationNameById(projectData)
  const objects = getMapObjects(map).filter(object => object?.visible !== false)
  if (!objects.length) return ''
  const width = Number(map?.width) || 1200
  const height = Number(map?.height) || 760
  const elements = objects
    .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0))
    .slice(0, 160)
    .map(object => mapPreviewElement(object, locationsById))
    .filter(Boolean)
    .join('')
  const gridElements = generatedMapGridElements(map)
  const stoneStyle = map?.metadata?.stylePreset === 'dungeon'
  const background = stoneStyle
    ? `<rect width="100%" height="100%" fill="#565c60"/>`
    : `<rect width="100%" height="100%" fill="#f2ead8"/><g opacity=".22"><path d="M0 ${height * 0.22} C ${width * 0.22} ${height * 0.08}, ${width * 0.42} ${height * 0.35}, ${width} ${height * 0.16}" fill="none" stroke="#b9a982" stroke-width="5"/><path d="M0 ${height * 0.78} C ${width * 0.28} ${height * 0.62}, ${width * 0.58} ${height * 0.92}, ${width} ${height * 0.72}" fill="none" stroke="#b9a982" stroke-width="5"/></g>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${background}${gridElements}${elements}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const getMapPreviewImage = (map, projectData) =>
  getImage(map) || map.thumbnail || map.preview || map.dataUrl || map.mapImage || generatedMapPreview(map, projectData)

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
  const mapProjectData = { ...projectData, characters }
  const maps = await Promise.all((projectData.maps ?? []).map(async map => {
    const image = getMapPreviewImage(map, mapProjectData)
    if (!image) return map
    const pdfImage = await convertImageToJpegResource(image, { maxSize: 1000, quality: 0.86 })
    return pdfImage ? { ...map, _pdfImage: pdfImage } : map
  }))
  return { ...mapProjectData, maps }
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
  const journey = character.journey
  const journeyBeats = [...(journey?.beats || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
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
        ${journey ? `<div class="copy"><h3>Character Journey · ${escapeHtml(journey.arcType || 'Custom arc')}</h3>
          ${[
            ['Starting state', journey.startingState], ['Ending state', journey.endingState], ['Core wound', journey.coreWound],
            ['Lie believed', journey.lieBelieved], ['Truth to learn', journey.truthLearned], ['Want', journey.want],
            ['Need', journey.need], ['Internal conflict', journey.internalConflict], ['External conflict', journey.externalConflict],
          ].filter(([, value]) => value).map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join('')}
          ${journeyBeats.length ? `<h3>Journey Beats</h3>${journeyBeats.map(beat => `<p><strong>${escapeHtml(beat.title || 'Untitled beat')}</strong> · ${escapeHtml(beat.storyPhase === 'Custom' ? beat.customPhase || 'Custom phase' : beat.storyPhase || 'Story beat')}${beat.isMajorTurningPoint ? ' · Major turning point' : ''}<br>${escapeHtml(beat.description || beat.emotionalState || '')}</p>`).join('')}` : ''}
        </div>` : ''}
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
    const summary = summarizeMap(map, projectData)
    const image = getMapPreviewImage(map, projectData)
    const summaryList = summary.lines.length
      ? `<ul>${summary.lines.slice(0, 7).map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
      : '<p class="muted">Map object data is preserved in the project backup. No visible map objects are recorded yet.</p>'
    return `
      <article class="map-card">
        <div class="map-preview">${image ? `<img src="${escapeHtml(image)}" alt="">` : `<span>${firstLetter(map.name || 'Map')}</span>`}</div>
        <div>
          <h2>${escapeHtml(map.name || 'Untitled Map')}</h2>
          ${htmlMeta(valueList(map.mapType, summary.objects.length && `${summary.objects.length} objects`, summary.layers.length && `${summary.layers.length} layers`, summary.regions.length && `${summary.regions.length} regions`))}
          ${summaryList}
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

const createMapPages = (map, projectData, theme) => {
  const summary = summarizeMap(map, projectData)
  const title = map.name || 'Untitled Map'
  const subtitle = valueList(
    map.mapType,
    summary.objects.length && `${summary.objects.length} objects`,
    summary.layers.length && `${summary.layers.length} layers`,
    summary.regions.length && `${summary.regions.length} regions`,
  ).join(' - ')
  const body = summary.lines.join('\n') || 'Map object data is preserved in the project backup. No visible map objects are recorded yet.'
  const items = makeArticleLineItems(body, [], 310)
  const pages = []
  const pdf = makePdfCanvas(theme)
  const contentStartY = pdf.pageBase('Cartography', title, subtitle)
  const panelBottom = 58
  const panelTop = Math.min(424, contentStartY - 18)
  pdf.rect(50, panelBottom, 742, panelTop - panelBottom, theme.palette.panel, theme.palette.accent, 1)
  drawImageFrame(
    pdf,
    'Map Plate',
    map._pdfImage,
    76,
    panelTop - 26,
    330,
    Math.min(245, panelTop - panelBottom - 52),
    theme,
    firstLetter(title).replace(/&.*;/, ''),
  )
  let nextIndex = renderLineItems(pdf, items, 0, 436, panelTop - 34, 310, panelBottom + 22, theme)
  pages.push(pdfPage('Maps', title, pdfContent(pdf)))

  let continuation = 2
  while (nextIndex < items.length) {
    const nextPdf = makePdfCanvas(theme)
    const nextStart = nextPdf.pageBase('Cartography', `${title} continued`, `Continuation ${continuation}`)
    const nextPanelTop = Math.min(488, nextStart - 18)
    nextPdf.rect(56, panelBottom, 730, nextPanelTop - panelBottom, theme.palette.panel, theme.palette.accent, 1)
    nextIndex = renderLineItems(nextPdf, items, nextIndex, 82, nextPanelTop - 34, 670, panelBottom + 22, theme)
    pages.push(pdfPage('Maps', `${title} continued ${continuation}`, pdfContent(nextPdf)))
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
        maps: (projectData.maps ?? []).map(map => {
          const copy = { ...map }
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
      records.push(...createMapPages(map, projectData, theme))
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
