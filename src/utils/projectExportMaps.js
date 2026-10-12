// Map files for the readable Word-documents ZIP: each map built in the Atlas builder is added as the same
// three files its Export menu offers (PNG image, SVG vector, JSON that can be imported back into YOW).
// The restorable project ZIP already carries every map's data in data/maps.json.
import { createElement } from 'react'
import { sanitizeFilename } from './projectExportHelpers.js'
import { ATLAS_VERSION } from '../components/Map/atlasModel.js'

const PNG_WIDTH = 2400
const PNG_HEIGHT = 1600
const encoder = new TextEncoder()

const isAtlasMap = map => map?.metadata?.builder === ATLAS_VERSION

const blobToDataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = reject
  reader.readAsDataURL(blob)
})

// A private backdrop image is a signed-URL reference that cannot be drawn outside the app, so it is
// inlined as a data URL. If it cannot be fetched the map is still exported, without its backdrop.
async function withInlineBackdrop(metadata = {}) {
  const src = metadata.backdrop?.src
  if (!src) return metadata
  const { isUserMediaReference, getSignedUserMediaUrl } = await import('./uploadUserMedia')
  if (!isUserMediaReference(src)) return metadata
  try {
    const response = await fetch(await getSignedUserMediaUrl(src))
    if (!response.ok) throw new Error(`Backdrop request failed (${response.status})`)
    return { ...metadata, backdrop: { ...metadata.backdrop, src: await blobToDataUrl(await response.blob()) } }
  } catch (error) {
    console.warn('[export] map backdrop could not be included:', error)
    const { backdrop: _backdrop, ...rest } = metadata
    return rest
  }
}

async function renderAtlasSvg(map, metadata) {
  const [{ renderToStaticMarkup }, { default: AtlasCanvas }] = await Promise.all([
    import('react-dom/server'),
    import('../components/Map/AtlasCanvas.jsx'),
  ])
  const markup = renderToStaticMarkup(createElement(AtlasCanvas, {
    objects: map.mapObjects || [], metadata, mapType: map.mapType, name: map.name,
  }))
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup.replace('<svg ', `<svg width="${PNG_WIDTH}" height="${PNG_HEIGHT}" `)}`
}

// Browser/webview only; returns null where there is no canvas (tests, jsdom) or the image will not load.
async function rasterizeSvg(svg) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return null
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = PNG_WIDTH
    canvas.height = PNG_HEIGHT
    canvas.getContext('2d').drawImage(image, 0, 0)
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    return png ? new Uint8Array(await png.arrayBuffer()) : null
  } catch (error) {
    console.warn('[export] map image could not be rendered:', error)
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const mapJsonBytes = map => encoder.encode(JSON.stringify({
  format: ATLAS_VERSION,
  name: map.name,
  mapType: map.mapType,
  mapObjects: map.mapObjects || [],
  metadata: map.metadata || {},
}, null, 2))

/**
 * @param {object} projectData - project export data (uses projectData.maps)
 * @param {string} prefix - folder prefix for the entries, for example "Maps/"
 * @param {(name: string) => string} uniqueName - makes an entry name collision-free in the ZIP
 */
export async function createMapExportEntries(projectData, prefix = 'Maps/', uniqueName = name => name) {
  const maps = Array.isArray(projectData?.maps) ? projectData.maps : []
  const entries = []
  const notes = []
  for (const map of maps) {
    const title = map?.name || 'Untitled map'
    if (!isAtlasMap(map)) {
      notes.push(`"${title}" is an original-style map. It is saved in the restorable project ZIP (data/maps.json) and can be opened in YOW, but it has no image file here.`)
      continue
    }
    try {
      const base = sanitizeFilename(title, 'map')
      const svg = await renderAtlasSvg(map, await withInlineBackdrop(map.metadata))
      entries.push({ name: uniqueName(`${prefix}${base}.svg`), bytes: encoder.encode(svg) })
      const png = await rasterizeSvg(svg)
      if (png) entries.push({ name: uniqueName(`${prefix}${base}.png`), bytes: png })
      entries.push({ name: uniqueName(`${prefix}${base}.json`), bytes: mapJsonBytes(map) })
    } catch (error) {
      console.error('[export] could not export map', map?.id, error)
      notes.push(`"${title}" could not be exported as image files (${error?.message || 'unknown error'}). Its data is still in the restorable project ZIP.`)
    }
  }
  if (notes.length) {
    entries.push({ name: uniqueName(`${prefix}About these maps.txt`), bytes: encoder.encode(`${notes.join('\n\n')}\n`) })
  }
  return entries
}
