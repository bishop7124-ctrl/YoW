import { STAMP_LIBRARY, loadStampAsset, TERRAIN_TYPES } from './mapConstants.js'
import { colorWithAlpha, drawSmoothPath, hashString, organicPoints, seededNoise, clamp } from './mapUtils.js'

// ─── Background / paper ──────────────────────────────────────────────────────

export function drawBackground(ctx, width, height, style = 'parchment') {
  ctx.save()
  const paper = ctx.createLinearGradient(0, 0, width, height)

  if (style === 'blueprint') {
    paper.addColorStop(0, '#1e2f50')
    paper.addColorStop(0.5, '#182444')
    paper.addColorStop(1, '#111d38')
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, width, height)
    // fine grid
    ctx.strokeStyle = colorWithAlpha('#4a80cc', 0.14)
    ctx.lineWidth = 0.5
    const gs = 60
    for (let x = 0; x <= width; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke() }
    for (let y = 0; y <= height; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke() }
    // major grid
    ctx.strokeStyle = colorWithAlpha('#5090dd', 0.22)
    ctx.lineWidth = 1
    for (let x = 0; x <= width; x += gs * 5) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke() }
    for (let y = 0; y <= height; y += gs * 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke() }

  } else if (style === 'atlas') {
    paper.addColorStop(0, '#cce0ea')
    paper.addColorStop(0.5, '#b4cfd8')
    paper.addColorStop(1, '#9cb8c4')
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, width, height)

  } else if (style === 'campaign') {
    paper.addColorStop(0, '#f0e9dc')
    paper.addColorStop(0.5, '#e4d9c4')
    paper.addColorStop(1, '#d6c8ac')
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, width, height)
    // faint ruled lines
    ctx.strokeStyle = colorWithAlpha('#7a6240', 0.06)
    ctx.lineWidth = 0.8
    const ls = 38
    for (let y = ls; y < height; y += ls) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
    }

  } else {
    // parchment (default)
    paper.addColorStop(0, '#f5eacc')
    paper.addColorStop(0.4, '#e8d6a8')
    paper.addColorStop(1, '#d4bc7c')
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, width, height)
    // aged texture dots
    ctx.globalAlpha = 0.18
    for (let i = 0; i < 500; i++) {
      const sx = seededNoise(i, 1) * width
      const sy = seededNoise(i, 2) * height
      const r = 1 + seededNoise(i, 3) * 4.5
      ctx.fillStyle = seededNoise(i, 4) > 0.5 ? '#8b6a36' : '#fff7df'
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // vignette
  const vig = ctx.createRadialGradient(width / 2, height / 2, width * 0.12, width / 2, height / 2, width * 0.72)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, style === 'blueprint'
    ? 'rgba(5,10,22,0.36)'
    : style === 'atlas' ? 'rgba(20,56,68,0.18)'
    : style === 'campaign' ? 'rgba(56,38,18,0.14)'
    : 'rgba(80,50,16,0.24)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

// ─── Grid overlay ─────────────────────────────────────────────────────────────

export function drawMovementGrid(ctx, width, height, settings = {}) {
  if (!settings.enabled) return
  const size = Math.max(10, Number(settings.size) || 40)
  const color = /^#[0-9a-f]{3,8}$/i.test(String(settings.color || '')) ? settings.color : '#5b4630'
  const alpha = clamp(Number(settings.opacity) || 0.28, 0.05, 0.9)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.setLineDash([])
  if (settings.type === 'hex') {
    const radius = size / 2
    const hexW = Math.sqrt(3) * radius
    const rowH = radius * 1.5
    const rows = Math.ceil(height / rowH) + 2
    const cols = Math.ceil(width / hexW) + 2
    for (let row = -1; row <= rows; row++) {
      const off = Math.abs(row % 2) * hexW / 2
      for (let col = -1; col <= cols; col++) {
        const cx = col * hexW + off, cy = row * rowH
        ctx.beginPath()
        for (let s = 0; s < 6; s++) {
          const angle = -Math.PI / 2 + s * Math.PI / 3
          const px = cx + Math.cos(angle) * radius, py = cy + Math.sin(angle) * radius
          if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
        }
        ctx.closePath(); ctx.stroke()
      }
    }
  } else {
    for (let x = 0; x <= width; x += size) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke() }
    for (let y = 0; y <= height; y += size) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke() }
  }
  if (settings.scale) {
    ctx.globalAlpha = Math.min(0.9, alpha + 0.3)
    ctx.fillStyle = color
    ctx.font = '700 26px Georgia, serif'
    ctx.fillText(settings.scale, 32, height - 34)
  }
  ctx.restore()
}

// ─── Object dispatch ──────────────────────────────────────────────────────────

export function drawObject(ctx, object, isSelected, opts = {}) {
  if (object.visible === false) return
  ctx.save()
  const solidObjectTypes = new Set(['shape', 'region', 'territory', 'water', 'river', 'road', 'border', 'mountain', 'location', 'note'])
  const objectOpacity = solidObjectTypes.has(object.type)
    ? 1
    : (Number.isFinite(object.properties?.opacity) ? object.properties.opacity : 1)
  ctx.globalAlpha = objectOpacity
  switch (object.type) {
    case 'shape': drawLandShape(ctx, object, isSelected, opts); break
    case 'region': drawRegion(ctx, object, isSelected, opts); break   // terrain region
    case 'territory': drawTerritory(ctx, object, isSelected, opts); break  // political region
    case 'mountain': drawMountainRidge(ctx, object, isSelected, opts); break  // legacy
    case 'water': drawWater(ctx, object, isSelected, opts); break
    case 'river': drawRiver(ctx, object, isSelected, opts); break
    case 'road': drawRoad(ctx, object, isSelected, opts); break
    case 'border': drawBorderLine(ctx, object, isSelected, opts); break
    case 'stamp': drawStamp(ctx, object, isSelected, opts); break
    case 'location': drawLocation(ctx, object, isSelected, opts); break
    case 'label': drawLabel(ctx, object, isSelected, opts); break
    case 'note': drawNote(ctx, object, isSelected, opts); break
    default: break
  }
  ctx.restore()
}

export function drawRiverGroup(ctx, riverObjects, selectedIds = [], opts = {}) {
  const rivers = riverObjects.filter(object => object.visible !== false && object.geometry?.points?.length >= 2)
  if (!rivers.length) return
  const selected = new Set(selectedIds)

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  drawRiverLayer(ctx, rivers, opts, 'outer')
  drawRiverLayer(ctx, rivers, opts, 'body')
  drawRiverLayer(ctx, rivers, opts, 'inner')

  rivers.forEach(object => {
    if (selected.has(object.id)) {
      drawGeometryHandles(ctx, object.geometry.points || [], opts.zoom, opts.geometryEditMode)
    }
  })

  ctx.restore()
}

// ─── Land / shape ─────────────────────────────────────────────────────────────

function drawLandShape(ctx, object, isSelected, opts) {
  const pts = object.geometry?.points
  if (!pts || pts.length < 3) return
  const seed = hashString(object.id)
  const isBlueprint = opts.style === 'blueprint'
  const isAtlas = opts.style === 'atlas'
  const organic = object.properties?.organicEdges !== false && !isBlueprint

  // Single moderate jitter pass — visible but not chaotic
  const jitter = organic
    ? organicPoints(pts, seed, { closed: true, amplitude: 16, spacing: 36 })
    : pts

  const fill = object.properties?.fill || '#1e3d20'
  const stroke = object.properties?.stroke || '#142a16'
  ctx.save()

  // Coast shadow — two layered strokes
  if (!isBlueprint) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.strokeStyle = colorWithAlpha('#041008', 0.14)
    ctx.lineWidth = 30
    drawSmoothPath(ctx, jitter, true); ctx.stroke()
    ctx.strokeStyle = colorWithAlpha('#041008', 0.10)
    ctx.lineWidth = 14
    drawSmoothPath(ctx, jitter, true); ctx.stroke()
  }

  // Main land fill
  ctx.fillStyle = isBlueprint
    ? '#26486a'
    : isAtlas ? '#3d6635'
    : fill
  drawSmoothPath(ctx, jitter, true); ctx.fill()

  // Interior effects clipped to land
  ctx.save()
  drawSmoothPath(ctx, jitter, true); ctx.clip()
  const b = getBoundsFromPoints(pts)
  const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2

  if (!isBlueprint) {
    // Edge vignette
    const gr = Math.max(b.w, b.h) * 0.55
    const grad = ctx.createRadialGradient(bcx, bcy, gr * 0.05, bcx, bcy, gr)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(0.65, 'rgba(0,0,0,0.04)')
    grad.addColorStop(1, 'rgba(0,0,0,0.22)')
    ctx.fillStyle = grad; ctx.fill()
  }

  // Parchment/campaign: fine stipple texture
  if (!isBlueprint && !isAtlas) {
    const count = Math.min(120, Math.round((b.w * b.h) / 9000))
    ctx.globalAlpha = 0.05
    for (let i = 0; i < count; i++) {
      const tx = b.x + seededNoise(seed, i * 3 + 50) * b.w
      const ty = b.y + seededNoise(seed, i * 3 + 51) * b.h
      const len = 12 + seededNoise(seed, i * 3 + 52) * 30
      const angle = seededNoise(seed, i * 3 + 53) * Math.PI
      ctx.strokeStyle = seededNoise(seed, i + 300) > 0.5 ? '#0a3010' : '#a0b870'
      ctx.lineWidth = 0.6 + seededNoise(seed, i + 400) * 1.0
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(tx + Math.cos(angle) * len, ty + Math.sin(angle) * len)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  ctx.restore()

  // Outline
  if (!isBlueprint && !isAtlas) {
    ctx.strokeStyle = colorWithAlpha(stroke, 0.22)
    ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([])
    drawSmoothPath(ctx, jitter, true); ctx.stroke()
  }
  ctx.strokeStyle = isSelected ? '#1677ff'
    : isBlueprint ? '#70b8e0'
    : isAtlas ? stroke
    : stroke
  ctx.lineWidth = isSelected ? 3 : 2
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([])
  drawSmoothPath(ctx, jitter, true); ctx.stroke()

  if (isSelected) drawGeometryHandles(ctx, pts, opts.zoom, opts.geometryEditMode)
  ctx.restore()
}

// ─── Terrain region ───────────────────────────────────────────────────────────

function drawRegion(ctx, object, isSelected, opts) {
  const pts = object.geometry?.points
  if (!pts || pts.length < 3) return
  const seed = hashString(object.id)
  const terrainType = object.properties?.terrainType || 'grassland'
  const terrainDef = TERRAIN_TYPES.find(t => t.value === terrainType) || { color: '#6b9e44' }
  const fill = object.properties?.fill || terrainDef.color
  const isBlueprint = opts.style === 'blueprint'
  const isParchment = !opts.style || opts.style === 'parchment' || opts.style === 'campaign'
  const organic = !isBlueprint
  const jitter = organic
    ? organicPoints(pts, seed, { closed: true, amplitude: 10, spacing: 34 })
    : pts

  ctx.save()

  // Background fill is independent from terrain symbols, so it can be transparent.
  const savedBackgroundOpacity = Number.isFinite(object.properties?.terrainFillOpacity)
    ? object.properties.terrainFillOpacity
    : (Number.isFinite(object.properties?.opacity) ? object.properties.opacity : 1)
  const rawBackgroundOpacity = savedBackgroundOpacity === 0.44 ? 1 : savedBackgroundOpacity
  const backgroundOpacity = object.properties?.terrainBackgroundTransparent ? 0 : rawBackgroundOpacity
  if (backgroundOpacity > 0) {
    ctx.fillStyle = backgroundOpacity >= 1 ? fill : colorWithAlpha(fill, backgroundOpacity)
    drawSmoothPath(ctx, jitter, true); ctx.fill()
  }

  // Clip and draw terrain symbols inside the region
  ctx.save()
  drawSmoothPath(ctx, jitter, true); ctx.clip()
  const b = getBoundsFromPoints(pts)
  // Ink color: dark for parchment/atlas, blue for blueprint
  const inkColor = isBlueprint ? '#3060a8' : isParchment ? '#1a1206' : '#1a2010'
  drawTerrainSymbols(ctx, terrainType, pts, b, seed, inkColor, { ...(object.properties || {}), terrainFillOpacity: backgroundOpacity }, opts)
  ctx.restore()

  if (isSelected) {
    ctx.strokeStyle = '#1677ff'
    ctx.lineWidth = 2.5
    ctx.setLineDash([])
    ctx.lineJoin = 'round'
    drawSmoothPath(ctx, jitter, true); ctx.stroke()
  }

  if (isSelected) drawGeometryHandles(ctx, pts, opts.zoom, opts.geometryEditMode)
  ctx.restore()
}

// ─── Territory / political region ────────────────────────────────────────────

function drawTerritory(ctx, object, isSelected, opts) {
  const pts = object.geometry?.points
  if (!pts || pts.length < 3) return
  const seed = hashString(object.id)
  const fill = object.properties?.fill || '#7050a8'
  const stroke = object.properties?.stroke || fill
  const fillOpacity = clamp(
    Number.isFinite(object.properties?.fillOpacity)
      ? object.properties.fillOpacity
      : (Number.isFinite(object.properties?.opacity) ? object.properties.opacity : 1),
    0,
    1,
  )
  const name = object.properties?.name || ''
  const isBlueprint = opts.style === 'blueprint'
  const organic = !isBlueprint
  const jitter = organic ? organicPoints(pts, seed, { closed: true, amplitude: 6, spacing: 28 }) : pts
  const b = getBoundsFromPoints(pts)

  ctx.save()

  if (fillOpacity > 0) {
    ctx.fillStyle = fillOpacity >= 1 ? fill : colorWithAlpha(fill, fillOpacity)
    drawSmoothPath(ctx, jitter, true)
    ctx.fill()
  }

  // Prominent dashed border
  ctx.strokeStyle = isSelected ? '#1677ff' : stroke
  ctx.lineWidth = isSelected ? 3 : 2.5
  ctx.setLineDash([10, 6])
  ctx.lineJoin = 'round'
  drawSmoothPath(ctx, jitter, true)
  ctx.stroke()
  ctx.setLineDash([])

  // Territory name label — position/size/colour overrideable via properties
  if (name && !object.properties?.labelHidden) {
    const autoCx = b.x + b.w / 2
    const autoCy = b.y + b.h / 2
    const cx = autoCx + (object.properties?.labelOffsetX || 0)
    const cy = autoCy + (object.properties?.labelOffsetY || 0)
    const autoFontSize = Math.max(18, Math.min(52, Math.sqrt(b.w * b.h) * 0.12))
    const fontSize = object.properties?.labelFontSize || autoFontSize
    const labelColor = object.properties?.labelColor || null
    const labelOutlineColor = object.properties?.labelOutlineColor || null
    ctx.font = `italic 600 ${fontSize}px "Palatino Linotype", Georgia, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = Math.max(3, fontSize * 0.09)
    const outlineStyle = isBlueprint ? colorWithAlpha('#1a2b4a', 0.9) : (labelOutlineColor || colorWithAlpha('#f4e8c4', 0.88))
    ctx.fillStyle = isBlueprint ? '#8cc8f0' : (labelColor || colorWithAlpha(fill, 0.9))
    if (outlineStyle !== 'transparent') {
      ctx.strokeStyle = outlineStyle
      ctx.strokeText(name, cx, cy)
    }
    ctx.fillText(name, cx, cy)

    // Show label position handle when selected
    if (isSelected) {
      ctx.save()
      ctx.strokeStyle = '#1677ff'
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 1.5
      const hr = 6
      ctx.beginPath(); ctx.arc(cx, cy, hr, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.restore()
    }
  }

  if (isSelected) drawGeometryHandles(ctx, pts, opts.zoom, opts.geometryEditMode)
  ctx.restore()
}

// ─── Terrain symbol fill ──────────────────────────────────────────────────────

// Walk a grid over the polygon bounding box, jitter each cell, draw symbol if inside.
function terrainGrid(pts, b, seed, spacing, callback) {
  const cols = Math.ceil(b.w / spacing) + 2
  const rows = Math.ceil(b.h / spacing) + 2
  let idx = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const bx = b.x + c * spacing
      const by = b.y + r * spacing
      // Stable per-cell jitter
      const jx = bx + (seededNoise(seed, idx * 2 + 10) - 0.5) * spacing * 0.38
      const jy = by + (seededNoise(seed, idx * 2 + 11) - 0.5) * spacing * 0.38
      if (polyContains(pts, jx, jy)) callback(jx, jy, idx)
      idx++
    }
  }
}

function terrainClusterGrid(pts, b, seed, spacingX, spacingY, callback, options = {}) {
  const cols = Math.ceil(b.w / spacingX) + 2
  const rows = Math.ceil(b.h / spacingY) + 2
  const minCount = options.minCount ?? 2
  const extraCount = options.extraCount ?? 2
  const jitterX = options.jitterX ?? spacingX * 0.7
  const jitterY = options.jitterY ?? spacingY * 0.62
  let idx = 0

  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : spacingX * 0.5
    for (let col = 0; col < cols; col++) {
      const x = b.x + col * spacingX + offset
      const y = b.y + row * spacingY
      const count = minCount + Math.floor(seededNoise(seed, idx * 17 + 1) * (extraCount + 1))

      for (let mark = 0; mark < count; mark++) {
        const px = x + (seededNoise(seed, idx * 31 + mark * 7 + 2) - 0.5) * jitterX
        const py = y + (seededNoise(seed, idx * 31 + mark * 7 + 3) - 0.5) * jitterY
        if (polyContains(pts, px, py)) callback(px, py, idx, mark, row, col)
      }

      idx++
    }
  }
}

function polyContains(polygon, px, py) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function boundsFitPolygon(pts, bounds) {
  const samples = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.maxX, bounds.maxY],
    [bounds.minX, bounds.maxY],
    [(bounds.minX + bounds.maxX) / 2, bounds.minY],
    [bounds.maxX, (bounds.minY + bounds.maxY) / 2],
    [(bounds.minX + bounds.maxX) / 2, bounds.maxY],
    [bounds.minX, (bounds.minY + bounds.maxY) / 2],
    [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2],
  ]
  return samples.every(([x, y]) => polyContains(pts, x, y))
}

function centeredBoundsFitPolygon(pts, x, y, radiusX, radiusY = radiusX) {
  return boundsFitPolygon(pts, {
    minX: x - radiusX,
    minY: y - radiusY,
    maxX: x + radiusX,
    maxY: y + radiusY,
  })
}

function lineMarkFitsPolygon(pts, x1, y1, x2, y2, pad = 0) {
  return boundsFitPolygon(pts, {
    minX: Math.min(x1, x2) - pad,
    minY: Math.min(y1, y2) - pad,
    maxX: Math.max(x1, x2) + pad,
    maxY: Math.max(y1, y2) + pad,
  })
}

function drawTerrainSymbols(ctx, terrainType, pts, b, seed, inkColor, terrainProps = {}, _opts) {
  ctx.strokeStyle = inkColor
  ctx.fillStyle = inkColor
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 0.72
  const symbolScale = clamp(Number(terrainProps.terrainSymbolScale) || 1, 0.55, 1.8)
  const hasTerrainBackground = !terrainProps.terrainBackgroundTransparent && Number(terrainProps.terrainFillOpacity) > 0

  if (terrainType === 'forest') {
    // A continuous muted canopy texture underneath clustered individual trees.
    drawForestCanopyTexture(ctx, pts, b, seed, inkColor)
    terrainClusterGrid(pts, b, seed, 28 * symbolScale, 22 * symbolScale, (x, y, i, mark) => {
      const h = (12 + seededNoise(seed, i * 17 + mark * 5 + 3) * 13) * symbolScale
      const kind = seededNoise(seed, i * 17 + mark * 5 + 4)
      const lean = (seededNoise(seed, i * 17 + mark * 5 + 5) - 0.5) * 0.22
      if (!forestTreeFitsPolygon(pts, x, y, h, kind)) return
      drawForestTree(ctx, x, y, h, kind, lean, inkColor)
      if (mark === 0 && seededNoise(seed, i + 900) > 0.28 && forestUndergrowthFitsPolygon(pts, x, y + h * 0.24)) {
        drawUndergrowth(ctx, x, y + h * 0.24, seed, i, inkColor)
      }
    }, { minCount: 3, extraCount: 3, jitterX: 24, jitterY: 18 })

  } else if (terrainType === 'mountains') {
    // Organic ridgeline rows. Peaks are widened and overlapped so ranges read as
    // connected terrain instead of repeated stamps with visible pockets between.
    ctx.save()
    ctx.globalAlpha = 1
    const spacingY = 22 * symbolScale
    const rows = Math.ceil(b.h / spacingY) + 4
    const clusters = []
    let idx = 0
    for (let row = 0; row < rows; row++) {
      const rowY = b.y - spacingY * 0.65 + row * spacingY + (seededNoise(seed, row * 41 + 17) - 0.5) * 5 * symbolScale
      let x = b.x - 70 * symbolScale + (row % 2 === 0 ? 0 : 20 * symbolScale) + (seededNoise(seed, row * 41 + 18) - 0.5) * 14 * symbolScale
      while (x < b.x + b.w + 74 * symbolScale) {
        const px = x + (seededNoise(seed, idx * 11 + 1) - 0.5) * 9 * symbolScale
        const py = rowY + (seededNoise(seed, idx * 11 + 2) - 0.5) * 5 * symbolScale
        const h = (38 + seededNoise(seed, idx * 11 + 3) * 30) * symbolScale
        const cluster = seededNoise(seed, idx * 11 + 4) > 0.2 ? 2 : 1
        const widthScale = 1.45 + seededNoise(seed, idx * 11 + 20) * 0.55
        const config = { x: px, y: py, h, cluster, seed, index: idx, row, widthScale }
        if (mountainClusterFitsPolygon(pts, config)) clusters.push(config)
        x += h * (0.78 + seededNoise(seed, idx * 11 + 21) * 0.22)
        idx++
      }
    }
    const frontRow = clusters.reduce((max, cluster) => Math.max(max, cluster.row), -Infinity)
    clusters.forEach(cluster => { cluster.showBase = cluster.row === frontRow })
    clusters
      .sort((a, b) => a.row - b.row || a.y - b.y || a.x - b.x)
      .forEach(cluster => drawMountainCluster(ctx, cluster, inkColor))
    ctx.restore()

  } else if (terrainType === 'hills') {
    // Sparser rounded hill humps with reserved footprints so they never overlap.
    const spacingX = 82 * symbolScale
    const spacingY = 54 * symbolScale
    const cols = Math.ceil(b.w / spacingX) + 2
    const rows = Math.ceil(b.h / spacingY) + 2
    const hills = []
    let idx = 0
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 === 0 ? 0 : spacingX * 0.45
      for (let col = 0; col < cols; col++) {
        if (seededNoise(seed, idx * 13 + 90) < 0.32) { idx++; continue }
        const x = b.x + col * spacingX + offset + (seededNoise(seed, idx * 13 + 91) - 0.5) * 18
        const y = b.y + row * spacingY + (seededNoise(seed, idx * 13 + 92) - 0.5) * 14
        const w = (34 + seededNoise(seed, idx * 13 + 93) * 18) * symbolScale
        const hill = { x, y, w, h: w * 0.46 }
        const bounds = getHillBounds(hill, 10)
        if (!hillFitsPolygon(pts, bounds)) { idx++; continue }
        if (hills.some(other => boundsOverlap(bounds, getHillBounds(other, 10)))) { idx++; continue }
        hills.push(hill)
        idx++
      }
    }
    hills
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach(hill => drawHillSymbol(ctx, hill))

  } else if (terrainType === 'desert') {
    // Quiet wind-dune arcs: sparse and light so the desert texture does not shout.
    terrainClusterGrid(pts, b, seed, 62 * symbolScale, 44 * symbolScale, (x, y, i, mark) => {
      if (seededNoise(seed, i * 19 + mark + 80) < 0.2) return
      const w = (16 + seededNoise(seed, i * 19 + mark + 100) * 20) * symbolScale
      const tilt = (seededNoise(seed, i * 19 + mark + 200) - 0.5) * 0.24
      if (!centeredBoundsFitPolygon(pts, x, y, w * 0.62, w * 0.34)) return
      ctx.save()
      ctx.globalAlpha = 0.38
      ctx.lineWidth = Math.max(0.65, w * 0.032)
      ctx.save(); ctx.translate(x, y); ctx.rotate(tilt)
      ctx.beginPath()
      ctx.moveTo(-w * 0.5, 0)
      ctx.quadraticCurveTo(0, -w * 0.18, w * 0.5, 0)
      ctx.stroke()
      if (seededNoise(seed, i * 19 + mark + 240) > 0.48) {
        ctx.globalAlpha = 0.24
        ctx.beginPath()
        ctx.moveTo(-w * 0.28, w * 0.1)
        ctx.quadraticCurveTo(0, -w * 0.03, w * 0.28, w * 0.1)
        ctx.stroke()
      }
      ctx.restore()
      ctx.restore()
    }, { minCount: 1, extraCount: 1, jitterX: 34 * symbolScale, jitterY: 24 * symbolScale })

  } else if (terrainType === 'swamp') {
    drawSwampTerrain(ctx, pts, b, seed, inkColor, symbolScale, hasTerrainBackground)

  } else if (terrainType === 'farmland') {
    drawFarmlandTerrain(ctx, pts, b, seed, inkColor, symbolScale)

  } else if (terrainType === 'tundra' || terrainType === 'snow') {
    // Snowy tundra: one cold terrain treatment for tundra and legacy snow objects.
    drawSnowyTundraTerrain(ctx, pts, b, seed, inkColor, symbolScale, hasTerrainBackground)

  } else if (terrainType === 'volcanic') {
    // Dark jagged vents with small hot centers.
    terrainClusterGrid(pts, b, seed, 54 * symbolScale, 38 * symbolScale, (x, y, i, mark) => {
      const h = (22 + seededNoise(seed, i * 41 + mark + 100) * 18) * symbolScale
      if (!centeredBoundsFitPolygon(pts, x, y - h * 0.07, h * 0.36, h * 0.58)) return
      ctx.lineWidth = Math.max(1.2, h * 0.05)
      ctx.beginPath()
      ctx.moveTo(x, y - h * 0.52)
      ctx.bezierCurveTo(x + h * 0.24, y - h * 0.28, x + h * 0.32, y + h * 0.12, x + h * 0.16, y + h * 0.38)
      ctx.lineTo(x - h * 0.16, y + h * 0.38)
      ctx.bezierCurveTo(x - h * 0.32, y + h * 0.12, x - h * 0.24, y - h * 0.28, x, y - h * 0.52)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.save(); ctx.fillStyle = '#e05020'; ctx.globalAlpha = 0.55
      ctx.beginPath(); ctx.arc(x, y + h * 0.14, h * 0.11, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }, { minCount: 1, extraCount: 1, jitterX: 32, jitterY: 24 })

  } else {
    // Grassland / plains — clustered grass blades.
    terrainClusterGrid(pts, b, seed, 30 * symbolScale, 26 * symbolScale, (x, y, i, mark) => {
      const h = (6 + seededNoise(seed, i * 47 + mark + 100) * 7) * symbolScale
      if (!boundsFitPolygon(pts, { minX: x - 9 * symbolScale, minY: y - h - 2, maxX: x + 9 * symbolScale, maxY: y + 2 })) return
      ctx.lineWidth = 0.9; ctx.globalAlpha = 0.45
      ;[-4, 0, 4].forEach((xOff, k) => {
        const lean = (seededNoise(seed, i * 5 + mark * 3 + k) - 0.5) * 4
        ctx.beginPath(); ctx.moveTo(x + xOff, y); ctx.lineTo(x + xOff + lean, y - h); ctx.stroke()
      })
      ctx.globalAlpha = 0.72
    }, { minCount: 1, extraCount: 2, jitterX: 24, jitterY: 18 })
  }
}

function drawForestCanopyTexture(ctx, pts, b, seed, inkColor) {
  const leaf = inkColor === '#3060a8' ? '#8eb4d0' : '#7f876e'
  const leafDark = inkColor === '#3060a8' ? '#6f9cc3' : '#626d58'
  const leafLight = inkColor === '#3060a8' ? '#c9e2f2' : '#a6a585'

  ctx.save()
  terrainClusterGrid(pts, b, seed + 71, 18, 16, (x, y, i, mark) => {
    const r = 2.4 + seededNoise(seed, i * 13 + mark + 1) * 3.8
    const rot = seededNoise(seed, i * 13 + mark + 2) * Math.PI
    if (!centeredBoundsFitPolygon(pts, x, y, r * 1.45, r * 1.45)) return
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.globalAlpha = 0.32
    ctx.fillStyle = seededNoise(seed, i * 13 + mark + 3) > 0.45 ? leaf : leafDark
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 1.35, r * 0.72, 0, 0, Math.PI * 2)
    ctx.fill()
    if (seededNoise(seed, i * 13 + mark + 4) > 0.58) {
      ctx.globalAlpha = 0.3
      ctx.strokeStyle = leafLight
      ctx.lineWidth = 0.7
      ctx.beginPath()
      ctx.moveTo(-r, 0)
      ctx.quadraticCurveTo(0, -r * 0.5, r, 0)
      ctx.stroke()
    }
    ctx.restore()
  }, { minCount: 2, extraCount: 3, jitterX: 18, jitterY: 15 })
  ctx.restore()
}

function drawForestTree(ctx, x, y, h, kind, lean, inkColor) {
  const w = h * (0.38 + kind * 0.22)
  const outline = inkColor === '#3060a8' ? '#214b80' : '#33412f'
  const canopy = inkColor === '#3060a8' ? '#98bdd8' : (kind > 0.5 ? '#78856b' : '#879070')
  const canopyShade = inkColor === '#3060a8' ? '#6f9cc3' : '#5c684f'
  const trunk = inkColor === '#3060a8' ? '#6f88a8' : '#79654d'
  const highlight = inkColor === '#3060a8' ? '#d9ecf7' : '#c9c2a0'
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(lean)
  ctx.globalAlpha = 1
  ctx.strokeStyle = outline
  ctx.fillStyle = canopy
  ctx.lineWidth = Math.max(0.9, h * 0.055)

  if (kind > 0.5) {
    ;[
      [-h * 0.42, w * 0.4, h * 0.22],
      [-h * 0.24, w * 0.68, h * 0.26],
      [-h * 0.04, w * 0.86, h * 0.3],
      [h * 0.14, w * 0.66, h * 0.24],
    ].forEach(([cy, half, height], layer) => {
      ctx.beginPath()
      ctx.moveTo(0, cy - height * 0.72)
      ctx.bezierCurveTo(-half * 0.42, cy - height * 0.86, -half, cy - height * 0.32, -half * 0.86, cy + height * 0.16)
      ctx.bezierCurveTo(-half * 0.64, cy + height * 0.68, -half * 0.16, cy + height * 0.54, 0, cy + height * 0.42)
      ctx.bezierCurveTo(half * 0.2, cy + height * 0.58, half * 0.7, cy + height * 0.58, half * 0.9, cy + height * 0.12)
      ctx.bezierCurveTo(half * 1.04, cy - height * 0.34, half * 0.42, cy - height * 0.86, 0, cy - height * 0.72)
      ctx.closePath()
      ctx.fillStyle = layer >= 2 ? canopyShade : canopy
      ctx.fill()
      ctx.stroke()
    })
  } else {
    const crown = [
      [0, -h * 0.58],
      [-w * 0.42, -h * 0.5],
      [-w * 0.62, -h * 0.3],
      [-w * 0.74, -h * 0.08],
      [-w * 0.48, h * 0.08],
      [-w * 0.18, h * 0.0],
      [0, h * 0.12],
      [w * 0.24, h * 0.04],
      [w * 0.62, h * 0.1],
      [w * 0.78, -h * 0.12],
      [w * 0.58, -h * 0.36],
      [w * 0.32, -h * 0.5],
    ]
    ctx.beginPath()
    ctx.moveTo(crown[0][0], crown[0][1])
    for (let i = 1; i < crown.length; i++) {
      const [px, py] = crown[i]
      const [prevX, prevY] = crown[i - 1]
      ctx.quadraticCurveTo((prevX + px) / 2, Math.min(prevY, py) - h * 0.04, px, py)
    }
    ctx.quadraticCurveTo(w * 0.12, -h * 0.62, crown[0][0], crown[0][1])
    ctx.closePath()
    ctx.fillStyle = canopy
    ctx.fill()
    ctx.stroke()

    ctx.save()
    ctx.fillStyle = canopyShade
    ctx.beginPath()
    ctx.moveTo(w * 0.04, -h * 0.48)
    ctx.lineTo(w * 0.5, -h * 0.36)
    ctx.lineTo(w * 0.32, -h * 0.18)
    ctx.lineTo(w * 0.58, -h * 0.08)
    ctx.lineTo(w * 0.18, h * 0.02)
    ctx.lineTo(0, -h * 0.08)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  ctx.globalAlpha = 0.62
  ctx.strokeStyle = highlight
  ctx.lineWidth = Math.max(0.7, h * 0.03)
  ctx.beginPath()
  ctx.moveTo(-w * 0.16, -h * 0.46)
  ctx.lineTo(-w * 0.36, -h * 0.14)
  ctx.stroke()
  ctx.restore()

  ctx.strokeStyle = outline
  ctx.fillStyle = trunk
  ctx.lineWidth = Math.max(0.9, h * 0.06)
  ctx.beginPath()
  ctx.moveTo(-h * 0.045, -h * 0.02)
  ctx.lineTo(-h * 0.03, h * 0.34)
  ctx.lineTo(h * 0.045, h * 0.34)
  ctx.lineTo(h * 0.03, -h * 0.02)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function forestTreeFitsPolygon(pts, x, y, h, kind) {
  const w = h * (0.38 + kind * 0.22)
  const padX = w * 0.92
  const top = y - h * 0.66
  const bottom = y + h * 0.42
  return [
    [x - padX, top],
    [x + padX, top],
    [x + padX, bottom],
    [x - padX, bottom],
    [x, top],
    [x, bottom],
    [x - padX, y],
    [x + padX, y],
  ].every(([px, py]) => polyContains(pts, px, py))
}

function forestUndergrowthFitsPolygon(pts, x, y) {
  return [
    [x - 16, y - 12],
    [x + 16, y - 12],
    [x + 16, y + 8],
    [x - 16, y + 8],
    [x, y],
  ].every(([px, py]) => polyContains(pts, px, py))
}

function drawUndergrowth(ctx, x, y, seed, i, inkColor) {
  ctx.save()
  ctx.strokeStyle = inkColor
  ctx.globalAlpha = 0.38
  ctx.lineWidth = 0.9
  for (let k = 0; k < 3; k++) {
    const ox = (seededNoise(seed, i * 11 + k + 1) - 0.5) * 18
    const oy = (seededNoise(seed, i * 11 + k + 2) - 0.5) * 8
    const h = 5 + seededNoise(seed, i * 11 + k + 3) * 7
    ctx.beginPath()
    ctx.moveTo(x + ox - 4, y + oy)
    ctx.quadraticCurveTo(x + ox, y + oy - h, x + ox + 4, y + oy)
    ctx.stroke()
  }
  ctx.restore()
}

function drawHillSymbol(ctx, hill) {
  const { x, y, w, h } = hill
  ctx.lineWidth = Math.max(1.1, w * 0.045)
  ctx.beginPath()
  ctx.moveTo(x - w * 0.62, y + h * 0.1)
  ctx.quadraticCurveTo(x - w * 0.2, y - h * 0.82, x, y - h * 0.88)
  ctx.quadraticCurveTo(x + w * 0.2, y - h * 0.82, x + w * 0.62, y + h * 0.1)
  ctx.stroke()
  ctx.save()
  ctx.globalAlpha = 0.28
  ctx.beginPath()
  ctx.moveTo(x + w * 0.1, y - h * 0.7)
  ctx.quadraticCurveTo(x + w * 0.35, y - h * 0.38, x + w * 0.6, y + h * 0.1)
  ctx.lineWidth = Math.max(2, w * 0.08)
  ctx.stroke()
  ctx.restore()
}

function getHillBounds(hill, pad = 0) {
  return {
    minX: hill.x - hill.w * 0.72 - pad,
    minY: hill.y - hill.h * 0.98 - pad,
    maxX: hill.x + hill.w * 0.72 + pad,
    maxY: hill.y + hill.h * 0.2 + pad,
  }
}

function hillFitsPolygon(pts, bounds) {
  const samples = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.maxX, bounds.maxY],
    [bounds.minX, bounds.maxY],
    [(bounds.minX + bounds.maxX) / 2, bounds.minY],
    [(bounds.minX + bounds.maxX) / 2, bounds.maxY],
    [bounds.minX, (bounds.minY + bounds.maxY) / 2],
    [bounds.maxX, (bounds.minY + bounds.maxY) / 2],
    [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2],
  ]
  return samples.every(([x, y]) => polyContains(pts, x, y))
}

function boundsOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
}

function drawSwampTerrain(ctx, pts, b, seed, inkColor, symbolScale = 1, hasTerrainBackground = true) {
  const isBlueprint = inkColor === '#3060a8'
  const outline = isBlueprint ? '#244f8f' : '#293226'
  const water = isBlueprint ? '#6aa2c8' : '#667359'
  const mud = isBlueprint ? '#5f7fa0' : '#6b5d3f'
  const reed = isBlueprint ? '#315f96' : '#2f3d24'
  const cattail = isBlueprint ? '#244f8f' : '#3f321f'
  const pad = isBlueprint ? '#7ea5c6' : '#4f6a3b'
  const grass = isBlueprint ? '#7ea5c6' : '#746b49'

  ctx.save()
  if (hasTerrainBackground) {
    drawSwampMuddyWaterWash(ctx, pts, b, seed, water, mud, outline, symbolScale)
  }

  terrainClusterGrid(pts, b, seed, 48 * symbolScale, 36 * symbolScale, (x, y, i, mark) => {
    const roll = seededNoise(seed, i * 23 + mark * 7 + 1)
    if (roll > 0.58) {
      const size = (16 + seededNoise(seed, i * 23 + mark * 7 + 2) * 16) * symbolScale
      if (!centeredBoundsFitPolygon(pts, x, y - size * 0.42, size * 1.02, size * 1.1)) return
      drawSwampCattailCluster(ctx, x, y + size * 0.2, size, seed, i * 3 + mark, reed, cattail, grass, outline)
    } else if (roll > 0.18) {
      const size = (12 + seededNoise(seed, i * 23 + mark * 7 + 3) * 12) * symbolScale
      if (!centeredBoundsFitPolygon(pts, x, y, size * 1.16, size * 0.68)) return
      drawSwampLilyPads(ctx, x, y, size, seed, i * 3 + mark, pad, outline)
    } else {
      const size = (14 + seededNoise(seed, i * 23 + mark * 7 + 4) * 12) * symbolScale
      if (!centeredBoundsFitPolygon(pts, x, y, size * 0.72, size * 0.34)) return
      drawSwampRippleMark(ctx, x, y, size, seed, i * 3 + mark, outline)
    }
  }, { minCount: 2, extraCount: 2, jitterX: 30 * symbolScale, jitterY: 24 * symbolScale })

  drawSwampFineSpeckles(ctx, pts, b, seed, mud, outline, symbolScale)

  ctx.restore()
}

function drawSwampMuddyWaterWash(ctx, pts, b, seed, water, mud, outline, symbolScale) {
  ctx.save()
  ctx.fillStyle = colorWithAlpha(water, 0.2)
  ctx.fillRect(b.x, b.y, b.w, b.h)

  const pools = Math.max(3, Math.floor((b.w * b.h) / 42000))
  for (let i = 0; i < pools; i++) {
    const x = b.x + seededNoise(seed, i * 31 + 1) * b.w
    const y = b.y + seededNoise(seed, i * 31 + 2) * b.h
    if (!polyContains(pts, x, y)) continue
    const rx = (32 + seededNoise(seed, i * 31 + 3) * 70) * symbolScale
    const ry = (18 + seededNoise(seed, i * 31 + 4) * 34) * symbolScale
    if (!centeredBoundsFitPolygon(pts, x, y, rx * 1.16, ry * 1.16)) continue
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((seededNoise(seed, i * 31 + 5) - 0.5) * 0.8)
    drawOrganicSwampPatch(ctx, rx, ry, seed, i)
    ctx.fillStyle = colorWithAlpha(i % 2 ? mud : water, i % 2 ? 0.16 : 0.22)
    ctx.fill()
    ctx.strokeStyle = colorWithAlpha(outline, 0.12)
    ctx.lineWidth = Math.max(0.6, symbolScale)
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

function drawOrganicSwampPatch(ctx, rx, ry, seed, index) {
  const count = 11
  ctx.beginPath()
  for (let i = 0; i <= count; i++) {
    const angle = (Math.PI * 2 * i) / count
    const wobble = 0.78 + seededNoise(seed, index * 97 + i) * 0.42
    const x = Math.cos(angle) * rx * wobble
    const y = Math.sin(angle) * ry * (0.82 + seededNoise(seed, index * 101 + i) * 0.3)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function drawSwampCattailCluster(ctx, x, y, size, seed, index, reed, cattail, grass, outline) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.strokeStyle = colorWithAlpha(outline, 0.18)
  ctx.lineWidth = Math.max(1, size * 0.04)
  ctx.beginPath()
  ctx.moveTo(x - size * 0.64, y + size * 0.08)
  ctx.quadraticCurveTo(x, y - size * 0.08, x + size * 0.7, y + size * 0.08)
  ctx.stroke()

  const stems = 5 + Math.floor(seededNoise(seed, index * 17 + 1) * 4)
  for (let i = 0; i < stems; i++) {
    const t = stems === 1 ? 0.5 : i / (stems - 1)
    const baseX = x + (t - 0.5) * size * 1.08 + (seededNoise(seed, index * 17 + i + 2) - 0.5) * size * 0.16
    const baseY = y + (seededNoise(seed, index * 17 + i + 12) - 0.5) * size * 0.1
    const h = size * (0.72 + seededNoise(seed, index * 17 + i + 22) * 0.72)
    const lean = (seededNoise(seed, index * 17 + i + 32) - 0.5) * size * 0.3
    ctx.strokeStyle = reed
    ctx.lineWidth = Math.max(0.9, size * 0.045)
    ctx.beginPath()
    ctx.moveTo(baseX, baseY)
    ctx.quadraticCurveTo(baseX + lean * 0.2, baseY - h * 0.54, baseX + lean, baseY - h)
    ctx.stroke()
    if (i % 2 === 0) {
      ctx.strokeStyle = cattail
      ctx.lineWidth = Math.max(1.7, size * 0.08)
      ctx.beginPath()
      ctx.moveTo(baseX + lean, baseY - h - size * 0.12)
      ctx.lineTo(baseX + lean * 1.02, baseY - h + size * 0.08)
      ctx.stroke()
    }
  }

  ctx.strokeStyle = grass
  ctx.lineWidth = Math.max(0.8, size * 0.035)
  ;[-0.38, -0.14, 0.12, 0.38].forEach((off, blade) => {
    const bladeH = size * (0.42 + seededNoise(seed, index * 19 + blade) * 0.36)
    ctx.beginPath()
    ctx.moveTo(x + off * size, y + size * 0.08)
    ctx.quadraticCurveTo(x + off * size * 0.75, y - bladeH * 0.48, x + off * size * 1.25, y - bladeH)
    ctx.stroke()
  })
  ctx.restore()
}

function drawSwampLilyPads(ctx, x, y, size, seed, index, pad, outline) {
  const count = 2 + Math.floor(seededNoise(seed, index * 29 + 1) * 3)
  ctx.save()
  for (let i = 0; i < count; i++) {
    const px = x + (seededNoise(seed, index * 29 + i + 2) - 0.5) * size * 1.2
    const py = y + (seededNoise(seed, index * 29 + i + 8) - 0.5) * size * 0.72
    const r = size * (0.24 + seededNoise(seed, index * 29 + i + 14) * 0.22)
    const rot = seededNoise(seed, index * 29 + i + 20) * Math.PI * 2
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(rot)
    ctx.scale(1.25, 0.72)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, r, 0.42, Math.PI * 2 - 0.42)
    ctx.closePath()
    ctx.fillStyle = colorWithAlpha(pad, 0.72)
    ctx.fill()
    ctx.strokeStyle = colorWithAlpha(outline, 0.55)
    ctx.lineWidth = Math.max(0.65, size * 0.025)
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

function drawSwampRippleMark(ctx, x, y, size, seed, index, outline) {
  ctx.save()
  ctx.strokeStyle = colorWithAlpha(outline, 0.28)
  ctx.lineWidth = Math.max(0.6, size * 0.03)
  const arcs = 1 + Math.floor(seededNoise(seed, index * 31 + 1) * 3)
  for (let i = 0; i < arcs; i++) {
    const w = size * (0.42 + i * 0.24)
    ctx.beginPath()
    ctx.moveTo(x - w, y + i * size * 0.12)
    ctx.quadraticCurveTo(x, y - size * (0.12 + i * 0.04), x + w, y + i * size * 0.1)
    ctx.stroke()
  }
  ctx.restore()
}

function drawSwampFineSpeckles(ctx, pts, b, seed, mud, outline, symbolScale) {
  ctx.save()
  const count = Math.min(170, Math.max(30, Math.floor((b.w * b.h) / (2300 * symbolScale * symbolScale))))
  for (let i = 0; i < count; i++) {
    const x = b.x + seededNoise(seed, i * 43 + 1) * b.w
    const y = b.y + seededNoise(seed, i * 43 + 2) * b.h
    const r = (0.7 + seededNoise(seed, i * 43 + 3) * 1.2) * symbolScale
    if (!centeredBoundsFitPolygon(pts, x, y, r, r)) continue
    ctx.fillStyle = colorWithAlpha(i % 4 === 0 ? outline : mud, i % 4 === 0 ? 0.24 : 0.32)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function buildSwampChannelPaths(b, seed) {
  const pathCount = b.w > 280 ? 3 : 2
  const paths = []
  for (let p = 0; p < pathCount; p++) {
    const points = []
    const steps = 8
    const baseX = b.x + b.w * ((p + 0.52) / (pathCount + 0.1))
    const amp = b.w * (0.12 + seededNoise(seed, p * 17 + 1) * 0.12)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const wave = Math.sin((t * Math.PI * 2.2) + p * 1.4 + seededNoise(seed, p * 17 + 2) * 1.2)
      const cross = Math.sin((t * Math.PI * 5.1) + p * 0.9) * amp * 0.34
      points.push({
        x: baseX + wave * amp + cross + (seededNoise(seed, p * 101 + i * 7 + 3) - 0.5) * b.w * 0.08,
        y: b.y - b.h * 0.08 + t * b.h * 1.16,
      })
    }
    paths.push(points)
  }

  if (b.w > 220 && b.h > 160) {
    const sidePath = []
    const steps = 7
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      sidePath.push({
        x: b.x - b.w * 0.04 + t * b.w * 1.08,
        y: b.y + b.h * (0.28 + Math.sin(t * Math.PI * 2.5 + seededNoise(seed, 501) * 1.8) * 0.16) + (seededNoise(seed, i * 19 + 502) - 0.5) * b.h * 0.12,
      })
    }
    paths.push(sidePath)
  }

  return paths
}

function drawSwampChannel(ctx, points, width, seed, index, water, bank, outline) {
  const leftBank = jitterPath(offsetPath(points, width * -0.64), seed, index * 37 + 1, width * 0.12)
  const rightBank = jitterPath(offsetPath(points, width * 0.64), seed, index * 37 + 2, width * 0.12)
  const leftWater = jitterPath(offsetPath(points, width * -0.38), seed, index * 37 + 3, width * 0.07)
  const rightWater = jitterPath(offsetPath(points, width * 0.38), seed, index * 37 + 4, width * 0.07)

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  drawRibbon(ctx, leftBank, rightBank)
  ctx.fillStyle = colorWithAlpha(bank, 0.34)
  ctx.fill()

  drawRibbon(ctx, leftWater, rightWater)
  ctx.fillStyle = colorWithAlpha(water, 0.76)
  ctx.fill()

  ctx.strokeStyle = colorWithAlpha(water, 0.28)
  ctx.lineWidth = Math.max(1, width * 0.18)
  drawSmoothPath(ctx, jitterPath(points, seed, index * 31 + 12, width * 0.05), false)
  ctx.stroke()

  ctx.strokeStyle = colorWithAlpha(outline, 0.52)
  ctx.lineWidth = Math.max(0.75, width * 0.035)
  drawBrokenPath(ctx, leftBank, seed, index * 43 + 1, 0.64)
  drawBrokenPath(ctx, rightBank, seed, index * 43 + 2, 0.64)

  ctx.strokeStyle = colorWithAlpha(outline, 0.28)
  ctx.lineWidth = Math.max(0.6, width * 0.025)
  drawBrokenPath(ctx, leftWater, seed, index * 43 + 3, 0.38)
  drawBrokenPath(ctx, rightWater, seed, index * 43 + 4, 0.38)
  ctx.restore()
}

function drawRibbon(ctx, left, right) {
  if (!left.length || !right.length) return
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  left.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
  ;[...right].reverse().forEach(p => ctx.lineTo(p.x, p.y))
  ctx.closePath()
}

function drawBrokenPath(ctx, points, seed, offset, keepChance = 0.5) {
  for (let i = 1; i < points.length; i++) {
    if (seededNoise(seed, offset + i) > keepChance) continue
    const a = points[i - 1]
    const b = points[i]
    const mid = {
      x: a.x + (b.x - a.x) * (0.42 + (seededNoise(seed, offset + i + 40) - 0.5) * 0.18),
      y: a.y + (b.y - a.y) * (0.42 + (seededNoise(seed, offset + i + 80) - 0.5) * 0.18),
    }
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.quadraticCurveTo(mid.x, mid.y, b.x, b.y)
    ctx.stroke()
  }
}

function offsetPath(points, amount) {
  return points.map((point, i) => {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    return {
      x: point.x + (-dy / len) * amount,
      y: point.y + (dx / len) * amount,
    }
  })
}

function jitterPath(points, seed, offset, amount) {
  return points.map((point, i) => ({
    x: point.x + (seededNoise(seed, offset + i * 2) - 0.5) * amount,
    y: point.y + (seededNoise(seed, offset + i * 2 + 1) - 0.5) * amount,
  }))
}

function drawSwampGroundTexture(ctx, pts, b, seed, mud, grass, symbolScale) {
  drawSwampStipple(ctx, pts, b, seed, mud)
  ctx.save()
  ctx.strokeStyle = colorWithAlpha(grass, 0.48)
  ctx.lineWidth = Math.max(0.55, 0.8 * symbolScale)
  const count = Math.min(160, Math.max(22, Math.floor((b.w * b.h) / (3100 * symbolScale * symbolScale))))
  for (let i = 0; i < count; i++) {
    const x = b.x + seededNoise(seed, i * 53 + 1) * b.w
    const y = b.y + seededNoise(seed, i * 53 + 2) * b.h
    if (!polyContains(pts, x, y)) continue
    const len = (5 + seededNoise(seed, i * 53 + 3) * 9) * symbolScale
    const rot = (seededNoise(seed, i * 53 + 4) - 0.5) * 0.9
    ctx.beginPath()
    ctx.moveTo(x - Math.cos(rot) * len * 0.5, y - Math.sin(rot) * len * 0.5)
    ctx.quadraticCurveTo(x, y - len * 0.24, x + Math.cos(rot) * len * 0.5, y + Math.sin(rot) * len * 0.5)
    ctx.stroke()
  }
  ctx.restore()
}

function drawSwampBankReeds(ctx, points, width, seed, index, reed, grass, symbolScale) {
  ctx.save()
  const banks = [offsetPath(points, -width * 0.72), offsetPath(points, width * 0.72)]
  banks.forEach((bank, bankIndex) => {
    for (let i = 1; i < bank.length - 1; i++) {
      if (seededNoise(seed, index * 101 + bankIndex * 31 + i) < 0.24) continue
      const p = bank[i]
      const size = (8 + seededNoise(seed, index * 101 + bankIndex * 31 + i + 50) * 12) * symbolScale
      drawSwampLowReedClump(ctx, p.x, p.y, size, seed, index * 100 + bankIndex * 20 + i, reed, grass)
    }
  })
  ctx.restore()
}

function drawSwampLowReedClump(ctx, x, y, size, seed, index, reed, grass) {
  ctx.save()
  ctx.strokeStyle = reed
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(0.8, size * 0.055)
  const count = 4 + Math.floor(seededNoise(seed, index * 19 + 1) * 5)
  for (let i = 0; i < count; i++) {
    const spread = (i / Math.max(1, count - 1) - 0.5) * size * 0.9
    const baseX = x + spread + (seededNoise(seed, index * 19 + i + 2) - 0.5) * size * 0.18
    const h = size * (0.45 + seededNoise(seed, index * 19 + i + 9) * 0.65)
    const lean = (seededNoise(seed, index * 19 + i + 16) - 0.5) * size * 0.34
    ctx.beginPath()
    ctx.moveTo(baseX, y)
    ctx.quadraticCurveTo(baseX + lean * 0.22, y - h * 0.58, baseX + lean, y - h)
    ctx.stroke()
  }
  ctx.strokeStyle = colorWithAlpha(grass, 0.72)
  ctx.lineWidth = Math.max(0.55, size * 0.03)
  ctx.beginPath()
  ctx.moveTo(x - size * 0.55, y + size * 0.05)
  ctx.quadraticCurveTo(x, y - size * 0.12, x + size * 0.56, y + size * 0.04)
  ctx.stroke()
  ctx.restore()
}

function drawSwampStipple(ctx, pts, b, seed, mud) {
  ctx.save()
  ctx.fillStyle = colorWithAlpha(mud, 0.42)
  const count = Math.min(220, Math.max(36, Math.floor((b.w * b.h) / 1800)))
  for (let i = 0; i < count; i++) {
    const x = b.x + seededNoise(seed, i * 29 + 1) * b.w
    const y = b.y + seededNoise(seed, i * 29 + 2) * b.h
    if (!polyContains(pts, x, y)) continue
    const r = 0.9 + seededNoise(seed, i * 29 + 3) * 1.5
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawSwampSymbol(ctx, symbol, inkColor) {
  const { x, y, size, kind, seed, index } = symbol
  const outline = inkColor === '#3060a8' ? '#244f8f' : '#293226'
  const water = inkColor === '#3060a8' ? '#5f95bd' : '#5f745f'
  const reed = inkColor === '#3060a8' ? '#315f96' : '#3f5136'
  const dryGrass = inkColor === '#3060a8' ? '#7ea5c6' : '#777054'
  const bubble = inkColor === '#3060a8' ? '#c8e6f6' : '#a8ad8a'
  const w = size * (1.05 + seededNoise(seed, index * 7 + 1) * 0.45)
  const h = size * (0.72 + seededNoise(seed, index * 7 + 2) * 0.2)
  const rot = (seededNoise(seed, index * 7 + 3) - 0.5) * 0.28

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.globalAlpha = 1
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (kind === 'channel') {
    drawMarshWaterCut(ctx, -w * 0.46, -h * 0.06, w * 0.92, h * 0.26, seed, index, water, outline)
    drawMarshBubbleCluster(ctx, w * 0.02, -h * 0.03, size * 1.18, seed, index, bubble, outline)
    drawMarshBubbleCluster(ctx, w * 0.28, h * 0.02, size * 0.82, seed, index + 4, bubble, outline)
    drawMarshReedTuft(ctx, -w * 0.34, h * 0.18, size * 0.98, seed, index + 7, reed, dryGrass, true)
    drawMarshReedTuft(ctx, w * 0.3, h * 0.14, size * 0.86, seed, index + 13, reed, dryGrass)
  } else if (kind === 'reedBank') {
    drawMarshWaterCut(ctx, -w * 0.44, h * 0.18, w * 0.82, h * 0.18, seed, index, water, outline)
    drawMarshBubbleCluster(ctx, -w * 0.04, h * 0.16, size * 0.9, seed, index + 2, bubble, outline)
    drawMarshReedTuft(ctx, -w * 0.22, h * 0.12, size * 1.16, seed, index + 3, reed, dryGrass, true)
    drawMarshReedTuft(ctx, w * 0.22, h * 0.1, size * 0.98, seed, index + 11, reed, dryGrass, true)
  } else {
    drawMarshGroundHachures(ctx, w, h, size, seed, index, dryGrass)
    drawMarshBubbleCluster(ctx, w * 0.08, h * 0.12, size * 0.64, seed, index + 9, bubble, outline)
    drawMarshReedTuft(ctx, -w * 0.18, h * 0.2, size * 0.88, seed, index + 5, reed, dryGrass, true)
    drawMarshReedTuft(ctx, w * 0.2, h * 0.2, size * 0.76, seed, index + 17, reed, dryGrass)
  }

  ctx.restore()
}

function drawMarshWaterCut(ctx, x, y, w, h, seed, index, water, outline) {
  ctx.save()
  ctx.strokeStyle = water
  ctx.lineWidth = Math.max(1.2, h * 0.2)
  ctx.beginPath()
  const midA = y - h * (0.28 + seededNoise(seed, index * 29 + 1) * 0.18)
  const midB = y + h * (0.2 + seededNoise(seed, index * 29 + 2) * 0.16)
  ctx.moveTo(x, y)
  ctx.bezierCurveTo(x + w * 0.24, midA, x + w * 0.5, midB, x + w, y - h * 0.06)
  ctx.stroke()
  ctx.strokeStyle = outline
  ctx.globalAlpha = 0.64
  ctx.lineWidth = Math.max(0.75, h * 0.08)
  ctx.beginPath()
  ctx.moveTo(x + w * 0.08, y - h * 0.13)
  ctx.bezierCurveTo(x + w * 0.28, y - h * 0.34, x + w * 0.46, y - h * 0.16, x + w * 0.62, y - h * 0.22)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + w * 0.48, y + h * 0.18)
  ctx.bezierCurveTo(x + w * 0.66, y + h * 0.32, x + w * 0.82, y + h * 0.16, x + w * 0.94, y + h * 0.08)
  ctx.stroke()
  ctx.restore()
}

function drawMarshReedTuft(ctx, x, y, size, seed, index, reed, dryGrass, hasCattails = false) {
  const count = 6 + Math.floor(seededNoise(seed, index * 31 + 1) * 5)
  ctx.save()
  ctx.strokeStyle = reed
  ctx.lineWidth = Math.max(1.25, size * 0.052)
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1)
    const baseX = x + (t - 0.5) * size * (0.72 + seededNoise(seed, index * 31 + i + 2) * 0.22)
    const baseY = y + (seededNoise(seed, index * 31 + i + 12) - 0.5) * size * 0.12
    const height = size * (0.48 + seededNoise(seed, index * 31 + i + 22) * 0.42)
    const lean = (seededNoise(seed, index * 31 + i + 32) - 0.5) * size * 0.26
    ctx.beginPath()
    ctx.moveTo(baseX, baseY)
    ctx.quadraticCurveTo(baseX + lean * 0.24, baseY - height * 0.52, baseX + lean, baseY - height)
    ctx.stroke()
    if (hasCattails && i % 3 !== 0) {
      const tipX = baseX + lean
      const tipY = baseY - height
      ctx.save()
      ctx.strokeStyle = reed
      ctx.lineWidth = Math.max(1.8, size * 0.075)
      ctx.beginPath()
      ctx.moveTo(tipX, tipY - size * 0.12)
      ctx.lineTo(tipX + lean * 0.06, tipY + size * 0.12)
      ctx.stroke()
      ctx.strokeStyle = dryGrass
      ctx.lineWidth = Math.max(0.8, size * 0.03)
      ctx.beginPath()
      ctx.moveTo(tipX + size * 0.08, tipY - size * 0.02)
      ctx.lineTo(tipX + size * 0.16, tipY - size * 0.16)
      ctx.stroke()
      ctx.restore()
    }
  }
  ctx.strokeStyle = dryGrass
  ctx.lineWidth = Math.max(0.7, size * 0.025)
  ctx.beginPath()
  ctx.moveTo(x - size * 0.5, y + size * 0.08)
  ctx.quadraticCurveTo(x - size * 0.16, y - size * 0.02, x + size * 0.2, y + size * 0.04)
  ctx.stroke()
  ctx.restore()
}

function drawMarshBubbleCluster(ctx, x, y, size, seed, index, bubble, outline) {
  ctx.save()
  ctx.strokeStyle = bubble
  ctx.lineWidth = Math.max(1.1, size * 0.035)
  ctx.globalAlpha = 0.95
  const count = 3 + Math.floor(seededNoise(seed, index * 43 + 1) * 3)
  for (let i = 0; i < count; i++) {
    const r = size * (0.05 + seededNoise(seed, index * 43 + i + 2) * 0.045)
    const ox = (seededNoise(seed, index * 43 + i + 8) - 0.5) * size * 0.48
    const oy = (seededNoise(seed, index * 43 + i + 14) - 0.5) * size * 0.24
    const gap = seededNoise(seed, index * 43 + i + 20) * Math.PI * 0.5
    ctx.beginPath()
    ctx.arc(x + ox, y + oy, r, gap, Math.PI * 1.75 + gap)
    ctx.stroke()
    ctx.save()
    ctx.strokeStyle = outline
    ctx.globalAlpha = 0.28
    ctx.lineWidth = Math.max(0.45, size * 0.014)
    ctx.beginPath()
    ctx.arc(x + ox, y + oy, r * 1.28, gap + Math.PI * 0.18, gap + Math.PI * 1.1)
    ctx.stroke()
    ctx.restore()
  }
  ctx.strokeStyle = outline
  ctx.globalAlpha = 0.42
  ctx.lineWidth = Math.max(0.45, size * 0.014)
  ctx.beginPath()
  ctx.moveTo(x - size * 0.18, y + size * 0.12)
  ctx.quadraticCurveTo(x, y + size * 0.06, x + size * 0.2, y + size * 0.12)
  ctx.stroke()
  ctx.restore()
}

function drawMarshGroundHachures(ctx, w, h, size, seed, index, dryGrass) {
  ctx.save()
  ctx.strokeStyle = dryGrass
  ctx.lineWidth = Math.max(0.75, size * 0.026)
  for (let i = 0; i < 3; i++) {
    const x = -w * 0.38 + i * w * 0.32 + (seededNoise(seed, index * 23 + i + 1) - 0.5) * size * 0.18
    const y = h * (0.18 + seededNoise(seed, index * 23 + i + 5) * 0.18)
    ctx.beginPath()
    ctx.moveTo(x - size * 0.14, y)
    ctx.quadraticCurveTo(x, y - size * 0.09, x + size * 0.16, y + size * 0.02)
    ctx.stroke()
  }
  ctx.restore()
}

function getSwampSymbolBounds(symbol, pad = 0) {
  const width = symbol.size * 0.9
  return {
    minX: symbol.x - width - pad,
    minY: symbol.y - symbol.size * 0.62 - pad,
    maxX: symbol.x + width + pad,
    maxY: symbol.y + symbol.size * 0.5 + pad,
  }
}

function drawFarmlandTerrain(ctx, pts, b, seed, inkColor, symbolScale) {
  const crop = inkColor === '#3060a8' ? '#2f6fa8' : '#2f3f14'
  const divider = inkColor === '#3060a8' ? '#1d557f' : '#3a2f10'
  const rowGap = Math.max(9, 15 * symbolScale)
  const bandGap = rowGap * 4.4
  const angle = -0.16 + (seededNoise(seed, 811) - 0.5) * 0.16
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const span = Math.hypot(b.w, b.h) * 1.25

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.lineCap = 'round'

  let bandIndex = 0
  for (let y = -span / 2; y <= span / 2; y += bandGap) {
    const rows = 3 + Math.floor(seededNoise(seed, bandIndex * 19 + 1) * 2)
    const bandJitter = (seededNoise(seed, bandIndex * 19 + 2) - 0.5) * rowGap * 0.8
    for (let r = 0; r < rows; r++) {
      const yy = y + bandJitter + r * rowGap
      const start = -span * (0.42 + seededNoise(seed, bandIndex * 29 + r + 4) * 0.08)
      const end = span * (0.42 + seededNoise(seed, bandIndex * 29 + r + 8) * 0.08)
      ctx.strokeStyle = colorWithAlpha(crop, r % 2 === 0 ? 0.78 : 0.58)
      ctx.lineWidth = Math.max(1.15, symbolScale * 1.35)
      drawFarmlandRow(ctx, start, end, yy, seed, bandIndex * 37 + r, rowGap)
    }

    if (bandIndex % 2 === 0) {
      const y1 = y - rowGap * 0.72
      const y2 = y1 + (seededNoise(seed, bandIndex * 17 + 9) - 0.5) * rowGap
      ctx.strokeStyle = colorWithAlpha(divider, 0.6)
      ctx.lineWidth = Math.max(1.35, symbolScale * 1.45)
      ctx.beginPath()
      ctx.moveTo(-span * 0.44, y1)
      ctx.lineTo(span * 0.44, y2)
      ctx.stroke()
    }
    bandIndex++
  }
  ctx.restore()
}

function drawFarmlandRow(ctx, start, end, y, seed, index, rowGap) {
  const segments = 5
  ctx.beginPath()
  for (let s = 0; s <= segments; s++) {
    const t = s / segments
    const x = start + (end - start) * t
    const yy = y + (seededNoise(seed, index * 13 + s) - 0.5) * rowGap * 0.28
    if (s === 0) ctx.moveTo(x, yy)
    else ctx.lineTo(x, yy)
  }
  ctx.stroke()
}

function drawSnowyTundraTerrain(ctx, pts, b, seed, inkColor, symbolScale, hasTerrainBackground = true) {
  const isBlueprint = inkColor === '#3060a8'
  const snow = isBlueprint ? '#d5f1ff' : '#f2f3e9'
  const ice = isBlueprint ? '#8cc8f0' : '#a9c3c2'
  const crack = isBlueprint ? '#2f6fa8' : '#5e6f70'
  const shadow = isBlueprint ? '#4d92c8' : '#89938b'

  ctx.save()
  if (hasTerrainBackground) {
    ctx.fillStyle = colorWithAlpha(snow, 0.34)
    ctx.fillRect(b.x, b.y, b.w, b.h)
  }

  const driftCount = Math.max(14, Math.floor((b.w * b.h) / (6500 * symbolScale * symbolScale)))
  for (let i = 0; i < driftCount; i++) {
    const x = b.x + seededNoise(seed, i * 41 + 1) * b.w
    const y = b.y + seededNoise(seed, i * 41 + 2) * b.h
    const len = (22 + seededNoise(seed, i * 41 + 3) * 38) * symbolScale
    const tilt = -0.18 + (seededNoise(seed, i * 41 + 4) - 0.5) * 0.14
    const driftA = { x: x - Math.cos(tilt) * len * 0.5, y: y - Math.sin(tilt) * len * 0.5 }
    const driftB = { x: x + Math.cos(tilt) * len * 0.5, y: y + Math.sin(tilt) * len * 0.5 + 4 * symbolScale }
    if (!lineMarkFitsPolygon(pts, driftA.x, driftA.y, driftB.x, driftB.y, 4 * symbolScale)) continue
    ctx.lineCap = 'butt'
    ctx.strokeStyle = colorWithAlpha(snow, 0.82)
    ctx.lineWidth = Math.max(0.9, 1.25 * symbolScale)
    ctx.beginPath()
    ctx.moveTo(x - Math.cos(tilt) * len * 0.5, y - Math.sin(tilt) * len * 0.5)
    ctx.lineTo(x + Math.cos(tilt) * len * 0.5, y + Math.sin(tilt) * len * 0.5)
    ctx.stroke()

    if (i % 2 === 0) {
      ctx.strokeStyle = colorWithAlpha(ice, 0.54)
      ctx.lineWidth = Math.max(0.7, 0.9 * symbolScale)
      ctx.beginPath()
      ctx.moveTo(x - Math.cos(tilt) * len * 0.28, y - Math.sin(tilt) * len * 0.28 + 4 * symbolScale)
      ctx.lineTo(x + Math.cos(tilt) * len * 0.32, y + Math.sin(tilt) * len * 0.32 + 4 * symbolScale)
      ctx.stroke()
    }
  }

  const shardCount = Math.max(8, Math.floor((b.w * b.h) / (14500 * symbolScale * symbolScale)))
  for (let i = 0; i < shardCount; i++) {
    const x = b.x + seededNoise(seed, i * 53 + 1) * b.w
    const y = b.y + seededNoise(seed, i * 53 + 2) * b.h
    const size = (13 + seededNoise(seed, i * 53 + 3) * 14) * symbolScale
    if (!centeredBoundsFitPolygon(pts, x, y, size * 0.72, size * 0.48)) continue
    drawSnowyTundraShard(ctx, x, y, size, seed, i, ice, crack, shadow)
  }

  const crackCount = Math.max(5, Math.floor((b.w * b.h) / (24000 * symbolScale * symbolScale)))
  for (let i = 0; i < crackCount; i++) {
    const x = b.x + seededNoise(seed, i * 67 + 1) * b.w
    const y = b.y + seededNoise(seed, i * 67 + 2) * b.h
    const size = (22 + seededNoise(seed, i * 67 + 3) * 28) * symbolScale
    if (!centeredBoundsFitPolygon(pts, x, y, size * 0.64, size * 0.5)) continue
    drawSnowyTundraCrack(ctx, x, y, size, seed, i, crack)
  }

  ctx.restore()
}

function drawSnowyTundraShard(ctx, x, y, size, seed, index, ice, crack, shadow) {
  const angle = -0.16 + (seededNoise(seed, index * 17 + 1) - 0.5) * 0.36
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  ctx.fillStyle = colorWithAlpha(ice, 0.32)
  ctx.strokeStyle = colorWithAlpha(crack, 0.58)
  ctx.lineWidth = Math.max(0.8, size * 0.045)
  ctx.beginPath()
  ctx.moveTo(-size * 0.52, size * 0.08)
  ctx.lineTo(-size * 0.08, -size * 0.28)
  ctx.lineTo(size * 0.5, -size * 0.08)
  ctx.lineTo(size * 0.12, size * 0.28)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = colorWithAlpha(shadow, 0.42)
  ctx.lineWidth = Math.max(0.55, size * 0.026)
  ctx.beginPath()
  ctx.moveTo(-size * 0.22, -size * 0.08)
  ctx.lineTo(size * 0.28, -size * 0.02)
  ctx.stroke()
  ctx.restore()
}

function drawSnowyTundraCrack(ctx, x, y, size, seed, index, crack) {
  const angle = -0.22 + (seededNoise(seed, index * 23 + 1) - 0.5) * 0.28
  ctx.save()
  ctx.strokeStyle = colorWithAlpha(crack, 0.68)
  ctx.lineWidth = Math.max(0.9, size * 0.05)
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  ctx.beginPath()
  ctx.moveTo(x - Math.cos(angle) * size * 0.48, y - Math.sin(angle) * size * 0.48)
  ctx.lineTo(x - Math.cos(angle) * size * 0.08, y - Math.sin(angle) * size * 0.08)
  ctx.lineTo(x + Math.cos(angle + 0.24) * size * 0.42, y + Math.sin(angle + 0.24) * size * 0.42)
  ctx.stroke()
  if (seededNoise(seed, index * 23 + 2) > 0.36) {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(angle - 0.95) * size * 0.24, y + Math.sin(angle - 0.95) * size * 0.24)
    ctx.stroke()
  }
  ctx.restore()
}

function drawTundraIcyOverlay(ctx, pts, b, seed, inkColor, symbolScale) {
  const isBlueprint = inkColor === '#3060a8'
  const frost = isBlueprint ? '#b9e2ff' : '#d8e4dc'
  const blueShade = isBlueprint ? '#6faad8' : '#9fb8b5'
  const shadow = isBlueprint ? '#3f78a8' : '#707d76'

  ctx.save()
  ctx.fillStyle = colorWithAlpha(frost, 0.26)
  ctx.fillRect(b.x, b.y, b.w, b.h)

  const streakCount = Math.max(20, Math.floor((b.w * b.h) / (5200 * symbolScale * symbolScale)))
  for (let i = 0; i < streakCount; i++) {
    const x = b.x + seededNoise(seed, i * 41 + 1) * b.w
    const y = b.y + seededNoise(seed, i * 41 + 2) * b.h
    if (!polyContains(pts, x, y)) continue
    const len = (16 + seededNoise(seed, i * 41 + 3) * 34) * symbolScale
    const tilt = -0.18 + (seededNoise(seed, i * 41 + 4) - 0.5) * 0.16
    const isDark = i % 4 === 0
    ctx.strokeStyle = colorWithAlpha(isDark ? shadow : frost, isDark ? 0.42 : 0.68)
    ctx.lineWidth = Math.max(0.75, (isDark ? 1.25 : 1) * symbolScale)
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.moveTo(x - Math.cos(tilt) * len * 0.5, y - Math.sin(tilt) * len * 0.5)
    ctx.lineTo(x + Math.cos(tilt) * len * 0.5, y + Math.sin(tilt) * len * 0.5)
    ctx.stroke()
    if (i % 3 === 0) {
      const branchLen = len * 0.28
      const bx = x + (seededNoise(seed, i * 41 + 5) - 0.5) * len * 0.35
      const by = y + (seededNoise(seed, i * 41 + 6) - 0.5) * len * 0.12
      ctx.strokeStyle = colorWithAlpha(blueShade, 0.44)
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(bx + Math.cos(tilt + 0.9) * branchLen, by + Math.sin(tilt + 0.9) * branchLen)
      ctx.stroke()
    }
  }

  const crackCount = Math.max(4, Math.floor((b.w * b.h) / (26000 * symbolScale * symbolScale)))
  for (let i = 0; i < crackCount; i++) {
    const x = b.x + seededNoise(seed, i * 67 + 1) * b.w
    const y = b.y + seededNoise(seed, i * 67 + 2) * b.h
    if (!polyContains(pts, x, y)) continue
    const len = (24 + seededNoise(seed, i * 67 + 3) * 28) * symbolScale
    const angle = -0.2 + (seededNoise(seed, i * 67 + 4) - 0.5) * 0.22
    ctx.strokeStyle = colorWithAlpha(shadow, 0.48)
    ctx.lineWidth = Math.max(0.9, 1.35 * symbolScale)
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    ctx.beginPath()
    ctx.moveTo(x - Math.cos(angle) * len * 0.45, y - Math.sin(angle) * len * 0.45)
    ctx.lineTo(x - Math.cos(angle) * len * 0.05, y - Math.sin(angle) * len * 0.05)
    ctx.lineTo(x + Math.cos(angle + 0.22) * len * 0.34, y + Math.sin(angle + 0.22) * len * 0.34)
    ctx.stroke()
    if (seededNoise(seed, i * 67 + 5) > 0.42) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(angle - 0.95) * len * 0.22, y + Math.sin(angle - 0.95) * len * 0.22)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawTundraScrub(ctx, x, y, size, seed, index, inkColor) {
  const muted = inkColor === '#3060a8' ? '#6f9bc4' : '#58664d'
  ctx.save()
  ctx.strokeStyle = muted
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(0.7, size * 0.045)
  const blades = 4 + Math.floor(seededNoise(seed, index * 17 + 1) * 4)
  for (let i = 0; i < blades; i++) {
    const t = blades === 1 ? 0 : i / (blades - 1)
    const bx = x + (t - 0.5) * size * 0.9
    const h = size * (0.2 + seededNoise(seed, index * 17 + i + 2) * 0.3)
    const lean = (seededNoise(seed, index * 17 + i + 10) - 0.5) * size * 0.24
    ctx.beginPath()
    ctx.moveTo(bx, y)
    ctx.quadraticCurveTo(bx + lean * 0.4, y - h * 0.55, bx + lean, y - h)
    ctx.stroke()
  }
  ctx.strokeStyle = colorWithAlpha(muted, 0.54)
  ctx.lineWidth = Math.max(0.6, size * 0.025)
  ctx.beginPath()
  ctx.moveTo(x - size * 0.58, y + size * 0.08)
  ctx.quadraticCurveTo(x, y - size * 0.05, x + size * 0.58, y + size * 0.06)
  ctx.stroke()
  ctx.restore()
}

function drawTundraFrostCrack(ctx, x, y, size, seed, index, inkColor) {
  const crack = inkColor === '#3060a8' ? '#8bbce0' : '#5d675f'
  ctx.save()
  ctx.strokeStyle = colorWithAlpha(crack, 0.58)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(0.65, size * 0.026)
  ctx.beginPath()
  ctx.moveTo(x - size * 0.48, y)
  const midX = x + (seededNoise(seed, index * 23 + 1) - 0.5) * size * 0.18
  const midY = y + (seededNoise(seed, index * 23 + 2) - 0.5) * size * 0.22
  ctx.lineTo(midX, midY)
  ctx.lineTo(x + size * 0.5, y + (seededNoise(seed, index * 23 + 3) - 0.5) * size * 0.24)
  ctx.stroke()
  if (seededNoise(seed, index * 23 + 4) > 0.45) {
    ctx.beginPath()
    ctx.moveTo(midX, midY)
    ctx.lineTo(midX + (seededNoise(seed, index * 23 + 5) - 0.5) * size * 0.38, midY - size * 0.28)
    ctx.stroke()
  }
  ctx.restore()
}

function drawTundraStoneCluster(ctx, x, y, size, seed, index, inkColor) {
  const stone = inkColor === '#3060a8' ? '#78a8cf' : '#69706a'
  ctx.save()
  ctx.fillStyle = colorWithAlpha(stone, 0.62)
  ctx.strokeStyle = colorWithAlpha(inkColor, 0.42)
  ctx.lineWidth = Math.max(0.45, size * 0.02)
  const stones = 2 + Math.floor(seededNoise(seed, index * 29 + 1) * 3)
  for (let i = 0; i < stones; i++) {
    const sx = x + (seededNoise(seed, index * 29 + i + 2) - 0.5) * size * 0.85
    const sy = y + (seededNoise(seed, index * 29 + i + 8) - 0.5) * size * 0.4
    const rx = size * (0.08 + seededNoise(seed, index * 29 + i + 14) * 0.08)
    const ry = size * (0.05 + seededNoise(seed, index * 29 + i + 20) * 0.06)
    ctx.beginPath()
    ctx.ellipse(sx, sy, rx, ry, (seededNoise(seed, index * 29 + i + 26) - 0.5) * 0.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

function drawMountainCluster(ctx, config, inkColor) {
  getMountainClusterParts(config)
    .sort((a, b) => a.y - b.y)
    .forEach(mountain => drawMountainPeak(ctx, mountain, inkColor))
}

function getMountainClusterParts(config) {
  const { x, y, h, cluster, seed, index } = config
  const largeFirst = seededNoise(seed, index * 11 + 5) > 0.5
  const widthScale = Number.isFinite(config.widthScale) ? config.widthScale : 1
  const main = {
    x,
    y,
    h,
    hw: h * (0.62 + seededNoise(seed, index * 11 + 6) * 0.3) * widthScale,
    lean: (seededNoise(seed, index * 11 + 7) - 0.5) * 0.16,
    snow: seededNoise(seed, index * 11 + 8) > 0.38,
    seed,
    index: index * 2,
    showBase: config.showBase,
  }

  if (cluster === 1) {
    return [main]
  }

  const side = seededNoise(seed, index * 11 + 9) > 0.5 ? 1 : -1
  const smallH = h * (0.58 + seededNoise(seed, index * 11 + 12) * 0.28)
  const secondary = {
    x: x + side * h * (0.38 + seededNoise(seed, index * 11 + 13) * 0.18) * widthScale,
    y: y + h * (0.14 + seededNoise(seed, index * 11 + 14) * 0.12),
    h: smallH,
    hw: smallH * (0.62 + seededNoise(seed, index * 11 + 15) * 0.28) * widthScale,
    lean: (seededNoise(seed, index * 11 + 16) - 0.5) * 0.16,
    snow: seededNoise(seed, index * 11 + 17) > 0.5,
    seed,
    index: index * 2 + 1,
    showBase: config.showBase,
  }

  return largeFirst ? [main, secondary] : [secondary, main]
}

function mountainClusterFitsPolygon(pts, config) {
  const bounds = getMountainClusterBounds(config)
  const samples = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.maxX, bounds.maxY],
    [bounds.minX, bounds.maxY],
    [(bounds.minX + bounds.maxX) / 2, bounds.minY],
    [bounds.maxX, (bounds.minY + bounds.maxY) / 2],
    [(bounds.minX + bounds.maxX) / 2, bounds.maxY],
    [bounds.minX, (bounds.minY + bounds.maxY) / 2],
    [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2],
  ]
  return samples.every(([x, y]) => polyContains(pts, x, y))
}

function getMountainClusterBounds(config) {
  const mountains = getMountainClusterParts(config)
  return mountains.reduce((bounds, mountain) => {
    const peakBounds = getMountainPeakBounds(mountain)
    return {
      minX: Math.min(bounds.minX, peakBounds.minX),
      minY: Math.min(bounds.minY, peakBounds.minY),
      maxX: Math.max(bounds.maxX, peakBounds.maxX),
      maxY: Math.max(bounds.maxY, peakBounds.maxY),
    }
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
}

function getMountainPeakBounds(mountain) {
  const width = mountain.hw * 1.42
  return {
    minX: mountain.x - width,
    minY: mountain.y - mountain.h * 1.08,
    maxX: mountain.x + width,
    maxY: mountain.y + mountain.h * 0.5,
  }
}

function drawMountainPeak(ctx, peak, inkColor) {
  const { x, y, h, hw, lean, snow, showBase = true, seed = 1, index = 0 } = peak
  const peakH = h * (0.95 + seededNoise(seed, index * 23 + 1) * 0.18)
  const baseY = h * (0.32 + seededNoise(seed, index * 23 + 2) * 0.08)
  const summitX = (seededNoise(seed, index * 23 + 3) - 0.5) * hw * 0.22
  const summitY = -peakH * (0.62 + seededNoise(seed, index * 23 + 4) * 0.08)
  const leftFoot = -hw * (1.08 + seededNoise(seed, index * 23 + 5) * 0.22)
  const rightFoot = hw * (1.08 + seededNoise(seed, index * 23 + 6) * 0.24)
  const spineBaseX = hw * (-0.08 + seededNoise(seed, index * 23 + 7) * 0.18)
  const spineBaseY = baseY - h * (0.02 + seededNoise(seed, index * 23 + 8) * 0.08)
  const leftRidge = [
    [summitX, summitY],
    [-hw * (0.12 + seededNoise(seed, index * 23 + 9) * 0.1), -peakH * 0.48],
    [-hw * (0.3 + seededNoise(seed, index * 23 + 10) * 0.12), -peakH * 0.34],
    [-hw * (0.46 + seededNoise(seed, index * 23 + 11) * 0.16), -peakH * 0.18],
    [-hw * (0.72 + seededNoise(seed, index * 23 + 16) * 0.12), h * 0.0],
    [-hw * (0.9 + seededNoise(seed, index * 23 + 17) * 0.12), baseY - h * 0.05],
    [leftFoot, baseY],
  ]
  const rightRidge = [
    [summitX, summitY],
    [hw * (0.1 + seededNoise(seed, index * 23 + 12) * 0.12), -peakH * 0.46],
    [hw * (0.28 + seededNoise(seed, index * 23 + 13) * 0.14), -peakH * 0.3],
    [hw * (0.5 + seededNoise(seed, index * 23 + 14) * 0.16), -peakH * 0.1],
    [hw * (0.78 + seededNoise(seed, index * 23 + 18) * 0.12), h * 0.02],
    [hw * (0.94 + seededNoise(seed, index * 23 + 19) * 0.12), baseY - h * 0.03],
    [rightFoot, baseY + (seededNoise(seed, index * 23 + 15) - 0.5) * h * 0.08],
  ]
  const outline = inkColor === '#3060a8' ? '#244f8f' : '#35281f'
  const bodyWash = inkColor === '#3060a8' ? '#b9d4ee' : '#c4b39b'
  const snowWash = inkColor === '#3060a8' ? '#d6edff' : '#f7f0df'
  const shadeWash = inkColor === '#3060a8' ? '#5c8dcc' : '#9b866d'
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(lean)
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = outline
  ctx.lineWidth = Math.max(1.1, h * 0.045)

  // Solid mountain body first so no face is transparent when rows overlap.
  ctx.beginPath()
  leftRidge.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py) })
  ;[...rightRidge].reverse().slice(0, -1).forEach(([px, py]) => ctx.lineTo(px, py))
  ctx.closePath()
  ctx.fillStyle = bodyWash
  ctx.fill()

  // Shaded face.
  ctx.beginPath()
  ctx.moveTo(summitX, summitY)
  rightRidge.slice(1).forEach(([px, py]) => ctx.lineTo(px, py))
  ctx.lineTo(spineBaseX, spineBaseY)
  ctx.closePath()
  ctx.fillStyle = shadeWash
  ctx.fill()

  if (snow) {
    ctx.beginPath()
    ctx.moveTo(summitX, summitY)
    ctx.lineTo(-hw * 0.16, summitY + peakH * 0.24)
    ctx.lineTo(-hw * 0.46, summitY + peakH * 0.48)
    ctx.lineTo(-hw * 0.24, summitY + peakH * 0.45)
    ctx.lineTo(-hw * 0.38, summitY + peakH * 0.7)
    ctx.lineTo(spineBaseX, spineBaseY)
    ctx.lineTo(hw * 0.2, summitY + peakH * 0.48)
    ctx.lineTo(hw * 0.12, summitY + peakH * 0.24)
    ctx.closePath()
    ctx.fillStyle = snowWash
    ctx.fill()
  }

  // Outer inked ridges and central snow break.
  ctx.strokeStyle = outline
  ctx.lineWidth = Math.max(1.1, h * 0.048)
  ;[leftRidge, rightRidge].forEach(ridge => {
    const visibleRidge = showBase ? ridge : ridge.slice(0, -2)
    ctx.beginPath()
    visibleRidge.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py) })
    ctx.stroke()
  })
  ctx.beginPath()
  ctx.moveTo(summitX, summitY)
  ctx.lineTo(-hw * 0.08, summitY + peakH * 0.3)
  ctx.lineTo(-hw * 0.02, summitY + peakH * 0.48)
  ctx.lineTo(spineBaseX, spineBaseY)
  ctx.stroke()

  // Two disciplined shade strokes; enough texture without fuzzy noise.
  ctx.save()
  ctx.globalAlpha = 1
  ctx.strokeStyle = outline
  ctx.lineWidth = Math.max(0.55, h * 0.018)
  ctx.beginPath()
  ctx.moveTo(hw * 0.22, summitY + peakH * 0.34)
  ctx.lineTo(hw * 0.34, baseY - h * 0.08)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(hw * 0.42, summitY + peakH * 0.48)
  ctx.lineTo(hw * 0.52, baseY - h * 0.02)
  ctx.stroke()
  ctx.restore()

  if (showBase) {
    // A single calm foothill curve only on front-most clusters.
    ctx.save()
    ctx.globalAlpha = 1
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.75, h * 0.024)
    ctx.beginPath()
    ctx.moveTo(leftFoot - hw * 0.18, baseY + h * 0.04)
    ctx.quadraticCurveTo((leftFoot + rightFoot) / 2, baseY - h * 0.1, rightFoot + hw * 0.18, baseY + h * 0.03)
    ctx.stroke()
    ctx.restore()
  }

  ctx.restore()
}

// ─── Mountain ridge ───────────────────────────────────────────────────────────

function drawMountainRidge(ctx, object, isSelected, opts) {
  const pts = object.geometry?.points
  if (!pts || pts.length < 2) return
  const seed = hashString(object.id)
  const thickness = object.properties?.lineThickness || 24
  const fill = object.properties?.fill || '#7a7060'
  const stroke = object.properties?.stroke || '#3a3228'
  const cleanEdges = opts.style === 'blueprint' || opts.style === 'atlas'
  const ridgePts = cleanEdges ? pts : organicPoints(pts, seed, { closed: false, amplitude: 8, spacing: 36 })

  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  // shadow base
  ctx.strokeStyle = colorWithAlpha('#1a1510', 0.18)
  ctx.lineWidth = thickness * 2.8
  drawSmoothPath(ctx, ridgePts, false); ctx.stroke()
  // fill base
  ctx.strokeStyle = fill
  ctx.lineWidth = thickness * 2.1
  drawSmoothPath(ctx, ridgePts, false); ctx.stroke()

  // peak triangles
  for (let i = 1; i < ridgePts.length; i++) {
    const prev = ridgePts[i - 1], cur = ridgePts[i]
    const dx = cur.x - prev.x, dy = cur.y - prev.y
    const dist = Math.hypot(dx, dy)
    if (dist < 6) continue
    const steps = Math.max(1, Math.floor(dist / Math.max(28, thickness * 1.4)))
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps
      const px = prev.x + dx * t, py = prev.y + dy * t
      const norm = { x: -dy / dist, y: dx / dist }
      const salt = i * 97 + s * 31
      const side = seededNoise(seed, salt) > 0.5 ? 1 : -1
      const off = (seededNoise(seed, salt + 1) - 0.5) * thickness * 1.6
      const h = thickness * (1.1 + seededNoise(seed, salt + 2) * 1.0)
      const hw = thickness * (0.48 + seededNoise(seed, salt + 3) * 0.48)
      const tang = { x: dx / dist, y: dy / dist }
      const base = { x: px + norm.x * (off + side * thickness * 0.3), y: py + norm.y * (off + side * thickness * 0.3) }
      const peak = { x: base.x + norm.x * side * h, y: base.y + norm.y * side * h }
      const left = { x: base.x - tang.x * hw, y: base.y - tang.y * hw }
      const right = { x: base.x + tang.x * hw, y: base.y + tang.y * hw }
      ctx.fillStyle = fill
      ctx.strokeStyle = isSelected ? '#1677ff' : stroke
      ctx.lineWidth = Math.max(1.2, thickness * 0.09)
      ctx.beginPath(); ctx.moveTo(peak.x, peak.y); ctx.lineTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.closePath()
      ctx.fill(); ctx.stroke()
      // snow highlight
      ctx.strokeStyle = colorWithAlpha('#f0e8d0', 0.38)
      ctx.lineWidth = Math.max(0.8, thickness * 0.06)
      ctx.beginPath(); ctx.moveTo(peak.x, peak.y)
      ctx.lineTo(base.x - tang.x * hw * 0.18, base.y - tang.y * hw * 0.18); ctx.stroke()
    }
  }
  if (isSelected) drawGeometryHandles(ctx, pts, opts.zoom, opts.geometryEditMode)
  ctx.restore()
}

// ─── Water / River ────────────────────────────────────────────────────────────

function drawWater(ctx, object, isSelected, opts) {
  if (object.geometry?.type === 'path') {
    drawRiver(ctx, object, isSelected, opts)
    return
  }
  drawWaterMass(ctx, object, isSelected, opts)
}

function drawWaterMass(ctx, object, isSelected, opts) {
  const pts = object.geometry?.points
  if (!pts || pts.length < 3) return
  const seed = hashString(object.id)
  const stroke = object.properties?.stroke || '#2f769f'
  const fill = object.properties?.fill || '#73b8cf'
  const organic = object.properties?.organicEdges !== false && opts.style !== 'blueprint'
  const waterPts = organic ? organicPoints(pts, seed, { closed: true, amplitude: 9, spacing: 32 }) : pts
  const b = getBoundsFromPoints(pts)
  const isBlueprint = opts.style === 'blueprint'

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h)
  if (isBlueprint) {
    grad.addColorStop(0, '#5ca8d6')
    grad.addColorStop(1, '#2f6fa0')
  } else {
    grad.addColorStop(0, '#d7f3f8')
    grad.addColorStop(0.45, fill)
    grad.addColorStop(1, '#2f7fa6')
  }
  ctx.fillStyle = grad
  drawSmoothPath(ctx, waterPts, true)
  ctx.fill()

  if (object.properties?.waveTexture !== false && Math.max(b.w, b.h) > 44) {
    ctx.save()
    drawSmoothPath(ctx, waterPts, true)
    ctx.clip()
    ctx.strokeStyle = isBlueprint ? colorWithAlpha('#b8e4ff', 0.32) : colorWithAlpha('#f4ffff', 0.34)
    ctx.lineWidth = Math.max(1.2, Math.min(3, Math.sqrt(b.w * b.h) / 220))
    const spacing = Math.max(42, Math.min(92, Math.sqrt(b.w * b.h) / 5))
    let waveIndex = 0
    for (let y = b.y + spacing * 0.55; y < b.y + b.h; y += spacing) {
      const offset = seededNoise(seed, waveIndex + 710) * spacing * 0.55
      for (let x = b.x + offset; x < b.x + b.w; x += spacing * 1.25) {
        const w = spacing * (0.42 + seededNoise(seed, waveIndex + 720) * 0.28)
        const h = w * 0.18
        ctx.beginPath()
        ctx.moveTo(x - w * 0.5, y)
        ctx.quadraticCurveTo(x - w * 0.22, y - h, x, y)
        ctx.quadraticCurveTo(x + w * 0.22, y + h, x + w * 0.5, y)
        ctx.stroke()
        waveIndex++
      }
      waveIndex++
    }
    ctx.restore()
  }

  ctx.strokeStyle = isSelected ? '#1677ff' : stroke
  ctx.lineWidth = isSelected ? 3 : Math.max(2, Number(object.properties?.lineThickness) || 3)
  drawSmoothPath(ctx, waterPts, true)
  ctx.stroke()

  if (isSelected) drawGeometryHandles(ctx, pts, opts.zoom, opts.geometryEditMode)
  ctx.restore()
}

function drawRiver(ctx, object, isSelected, opts) {
  const pts = object.geometry?.points
  if (!pts || pts.length < 2) return
  const seed = hashString(object.id)
  const thickness = object.properties?.lineThickness || 6
  const stroke = object.properties?.stroke === '#3a80b0' ? '#2f5f78' : (object.properties?.stroke || '#2f5f78')
  const fill = ['#c8eeff', '#73b8cf'].includes(object.properties?.fill) ? '#7faec0' : (object.properties?.fill || '#7faec0')
  const organic = opts.style !== 'blueprint'
  const riverPts = organic ? organicPoints(pts, seed, { closed: false, amplitude: 10, spacing: 34 }) : pts
  const outerWidth = thickness * 1.45
  const midWidth = Math.max(1, thickness * 1.12)
  const innerWidth = Math.max(1, thickness * 0.82)

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.strokeStyle = stroke
  ctx.lineWidth = outerWidth
  drawSmoothPath(ctx, riverPts, false); ctx.stroke()

  ctx.strokeStyle = isSelected ? '#1677ff' : stroke
  ctx.lineWidth = midWidth
  drawSmoothPath(ctx, riverPts, false); ctx.stroke()

  ctx.strokeStyle = fill
  ctx.lineWidth = innerWidth
  drawSmoothPath(ctx, riverPts, false); ctx.stroke()

  if (isSelected) drawGeometryHandles(ctx, pts, opts.zoom, opts.geometryEditMode)
  ctx.restore()
}

function drawRiverLayer(ctx, rivers, opts, layer) {
  rivers.forEach(object => {
    const pts = object.geometry?.points || []
    const seed = hashString(object.id)
    const thickness = object.properties?.lineThickness || 6
    const stroke = object.properties?.stroke === '#3a80b0' ? '#2f5f78' : (object.properties?.stroke || '#2f5f78')
    const fill = ['#c8eeff', '#73b8cf'].includes(object.properties?.fill) ? '#7faec0' : (object.properties?.fill || '#7faec0')
    const organic = opts.style !== 'blueprint'
    const riverPts = organic ? organicPoints(pts, seed, { closed: false, amplitude: 10, spacing: 34 }) : pts
    const outerWidth = thickness * 1.45
    const bodyWidth = Math.max(1, thickness * 1.12)
    const innerWidth = Math.max(1, thickness * 0.82)

    if (layer === 'outer') {
      ctx.strokeStyle = stroke
      ctx.lineWidth = outerWidth
    } else if (layer === 'body') {
      ctx.strokeStyle = stroke
      ctx.lineWidth = bodyWidth
    } else {
      ctx.strokeStyle = fill
      ctx.lineWidth = innerWidth
    }
    drawSmoothPath(ctx, riverPts, false)
    ctx.stroke()
  })
}

// ─── Road ─────────────────────────────────────────────────────────────────────

function drawRoad(ctx, object, isSelected, opts) {
  const pts = object.geometry?.points
  if (!pts || pts.length < 2) return
  const seed = hashString(object.id)
  const thickness = object.properties?.lineThickness || 5
  const stroke = object.properties?.stroke || '#8b6030'
  const dashed = Boolean(object.properties?.dashed)
  const organic = opts.style !== 'blueprint'
  const roadPts = organic ? organicPoints(pts, seed, { closed: false, amplitude: 6, spacing: 32 }) : pts

  const borderStroke = object.properties?.borderStroke || '#2c1a0a'
  const highlight = object.properties?.highlight || '#f0d8a0'
  const outerWidth = thickness * 1.4
  const borderPx = Math.max(2, thickness * 0.15)
  const strokeRingPx = Math.max(2, thickness * 0.18)
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  // outer dark border — thin ring
  ctx.strokeStyle = isSelected ? '#1677ff' : borderStroke
  ctx.lineWidth = outerWidth
  ctx.setLineDash(dashed ? [thickness * 2, thickness * 1.5] : [])
  drawSmoothPath(ctx, roadPts, false); ctx.stroke()
  // stroke colour — thin ring inside border
  ctx.strokeStyle = isSelected ? '#1677ff' : stroke
  ctx.lineWidth = outerWidth - borderPx * 2
  drawSmoothPath(ctx, roadPts, false); ctx.stroke()
  // highlight — widest inner fill (the dominant bulk)
  ctx.strokeStyle = highlight
  ctx.lineWidth = outerWidth - borderPx * 2 - strokeRingPx * 2
  ctx.setLineDash([])
  drawSmoothPath(ctx, roadPts, false); ctx.stroke()
  if (isSelected) drawGeometryHandles(ctx, pts, opts.zoom, opts.geometryEditMode)
  ctx.restore()
}

// ─── Border ───────────────────────────────────────────────────────────────────

function drawBorderLine(ctx, object, isSelected, opts) {
  const pts = object.geometry?.points
  if (!pts || pts.length < 2) return
  const seed = hashString(object.id)
  const thickness = object.properties?.lineThickness || 4
  const stroke = object.properties?.stroke || '#9050a0'
  const organic = opts.style !== 'blueprint'
  const borderPts = organic ? organicPoints(pts, seed, { closed: false, amplitude: 4, spacing: 28 }) : pts

  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.strokeStyle = colorWithAlpha('#1a0a22', 0.22)
  ctx.lineWidth = thickness + 4
  ctx.setLineDash([thickness * 2.8, thickness * 1.6])
  drawSmoothPath(ctx, borderPts, false); ctx.stroke()
  ctx.strokeStyle = isSelected ? '#1677ff' : stroke
  ctx.lineWidth = thickness
  drawSmoothPath(ctx, borderPts, false); ctx.stroke()
  if (isSelected) drawGeometryHandles(ctx, pts, opts.zoom, opts.geometryEditMode)
  ctx.restore()
}

// ─── Stamp ────────────────────────────────────────────────────────────────────

function drawStamp(ctx, object, isSelected, opts) {
  const cx = object.x, cy = object.y
  const size = object.width || 80
  const stampId = object.properties?.stampId || ''
  const stampDef = STAMP_LIBRARY.find(s => s.id === stampId)
  const asset = stampDef?.assetSrc ? loadStampAsset(stampDef.assetSrc) : null

  ctx.save()
  ctx.translate(cx, cy)
  if (object.rotation) ctx.rotate(object.rotation * Math.PI / 180)

  if (asset?.loaded) {
    ctx.globalAlpha = (opts.preview ? 0.68 : 1)
    ctx.drawImage(asset.image, -size / 2, -size / 2, size, size)
  } else {
    drawStampGlyph(ctx, stampId, size / 2, opts)
  }

  if (isSelected) {
    const pad = Math.max(4, 7 / Math.max(opts.zoom || 1, 0.1))
    const handleSize = Math.max(7, 8 / Math.max(opts.zoom || 1, 0.1))
    ctx.strokeStyle = '#1677ff'
    ctx.fillStyle = '#fff'
    ctx.lineWidth = Math.max(1.5, 2 / Math.max(opts.zoom || 1, 0.1))
    ctx.setLineDash([5 / Math.max(opts.zoom || 1, 0.1), 3 / Math.max(opts.zoom || 1, 0.1)])
    ctx.strokeRect(-size / 2 - pad, -size / 2 - pad, size + pad * 2, size + pad * 2)
    ctx.setLineDash([])
    ;[
      [-size / 2 - pad, -size / 2 - pad],
      [size / 2 + pad, -size / 2 - pad],
      [size / 2 + pad, size / 2 + pad],
      [-size / 2 - pad, size / 2 + pad],
    ].forEach(([x, y]) => {
      ctx.beginPath()
      ctx.rect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize)
      ctx.fill()
      ctx.stroke()
    })
  }

  ctx.restore()
}

function drawStampGlyph(ctx, stampId, R, opts) {
  const isBlue = opts?.style === 'blueprint'
  const ink = isBlue ? '#4888cc' : '#1a140a'
  const fill = isBlue ? colorWithAlpha('#4888cc', 0.85) : colorWithAlpha('#1a140a', 0.82)
  const highlight = isBlue ? colorWithAlpha('#c0e0f8', 0.55) : colorWithAlpha('#f4ecd4', 0.62)
  const lw = Math.max(1.4, R * 0.07)
  ctx.strokeStyle = ink; ctx.fillStyle = fill
  ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'

  function r(x, y, w, h) {
    ctx.fillRect(R * x, R * y, R * w, R * h)
    ctx.strokeRect(R * x, R * y, R * w, R * h)
  }
  function cren(x, y, w, count, h = 0.14) {
    const gap = w / count
    for (let i = 0; i < count; i++) if (i % 2 === 0) r(x + i * gap, y, gap * 0.76, h)
  }

  switch (stampId) {
    case 'capital': {
      // Capitol building: dome, pediment, columns, and steps.
      r(-0.68, 0.44, 1.36, 0.14)
      r(-0.58, 0.28, 1.16, 0.16)
      r(-0.42, -0.08, 0.84, 0.42)
      ctx.beginPath()
      ctx.moveTo(-R * 0.5, -R * 0.08)
      ctx.lineTo(0, -R * 0.36)
      ctx.lineTo(R * 0.5, -R * 0.08)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, -R * 0.34, R * 0.24, Math.PI, Math.PI * 2)
      ctx.lineTo(R * 0.24, -R * 0.28)
      ctx.lineTo(-R * 0.24, -R * 0.28)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      r(-0.07, -0.68, 0.14, 0.16)
      ctx.beginPath(); ctx.arc(0, -R * 0.74, R * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ;[-0.5, 0.5].forEach(side => {
        r(side * 0.52 - 0.08, -0.02, 0.16, 0.46)
        ctx.beginPath()
        ctx.moveTo(R * (side * 0.61), -R * 0.02)
        ctx.lineTo(R * (side * 0.52), -R * 0.18)
        ctx.lineTo(R * (side * 0.43), -R * 0.02)
        ctx.closePath(); ctx.fill(); ctx.stroke()
      })
      ctx.fillStyle = highlight
      ;[-0.27, -0.09, 0.09, 0.27].forEach(x => r(x - 0.025, 0.02, 0.05, 0.34))
      ctx.fillStyle = fill
      break
    }
    case 'city': {
      // 5 towers of varying heights
      const towers = [
        { x: -0.46, h: 0.52, w: 0.18, roof: 'spire' },
        { x: -0.24, h: 0.78, w: 0.2, roof: 'dome' },
        { x: 0.0, h: 0.96, w: 0.22, roof: 'spire' },
        { x: 0.26, h: 0.68, w: 0.2, roof: 'dome' },
        { x: 0.48, h: 0.48, w: 0.18, roof: 'spire' },
      ]
      towers.forEach(t => {
        r(t.x - t.w / 2, -t.h + 0.48, t.w, t.h)
        if (t.roof === 'spire') {
          ctx.beginPath()
          ctx.moveTo(R * (t.x - t.w / 2), R * (-t.h + 0.48))
          ctx.lineTo(R * t.x, R * (-t.h + 0.48 - 0.24))
          ctx.lineTo(R * (t.x + t.w / 2), R * (-t.h + 0.48))
          ctx.closePath(); ctx.fill(); ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.arc(R * t.x, R * (-t.h + 0.48), R * t.w * 0.52, Math.PI, Math.PI * 2)
          ctx.fill(); ctx.stroke()
        }
        // window
        ctx.fillStyle = highlight
        r(t.x - 0.035, -t.h * 0.34 + 0.15, 0.07, 0.1)
        ctx.fillStyle = fill
      })
      // ground line
      ctx.beginPath(); ctx.moveTo(-R * 0.72, R * 0.5); ctx.lineTo(R * 0.72, R * 0.5); ctx.stroke()
      break
    }
    case 'village': {
      // 3 simple houses
      ;[{ x: -0.44, w: 0.3, h: 0.44 }, { x: -0.04, w: 0.34, h: 0.56 }, { x: 0.38, w: 0.28, h: 0.4 }].forEach(t => {
        r(t.x - t.w / 2, -t.h + 0.38, t.w, t.h)
        ctx.beginPath()
        ctx.moveTo(R * (t.x - t.w / 2 - 0.02), R * (-t.h + 0.38))
        ctx.lineTo(R * t.x, R * (-t.h + 0.38 - 0.24))
        ctx.lineTo(R * (t.x + t.w / 2 + 0.02), R * (-t.h + 0.38))
        ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.fillStyle = highlight; r(t.x - 0.04, -t.h * 0.28 + 0.1, 0.08, 0.1); ctx.fillStyle = fill
      })
      ctx.beginPath(); ctx.moveTo(-R * 0.68, R * 0.42); ctx.lineTo(R * 0.68, R * 0.42); ctx.stroke()
      break
    }
    case 'castle': {
      r(-0.58, -0.06, 1.16, 0.52)
      r(-0.72, -0.42, 0.28, 0.88); cren(-0.72, -0.54, 0.28, 3)
      r(0.44, -0.42, 0.28, 0.88); cren(0.44, -0.54, 0.28, 3)
      r(-0.18, -0.56, 0.36, 1.02); cren(-0.18, -0.68, 0.36, 3)
      cren(-0.58, -0.18, 1.16, 7)
      ctx.fillStyle = highlight; r(-0.09, 0.2, 0.18, 0.28)
      ctx.fillStyle = fill
      ctx.beginPath(); ctx.moveTo(-R * 0.7, R * 0.48); ctx.lineTo(R * 0.7, R * 0.48); ctx.stroke()
      break
    }
    case 'fortress': {
      r(-0.62, -0.26, 0.26, 0.74); r(0.36, -0.26, 0.26, 0.74)
      r(-0.3, 0.02, 0.6, 0.5)
      r(-0.18, -0.52, 0.36, 1.0)
      cren(-0.62, -0.4, 0.26, 3); cren(0.36, -0.4, 0.26, 3)
      cren(-0.3, -0.1, 0.6, 5); cren(-0.18, -0.64, 0.36, 3)
      ctx.beginPath()
      ctx.moveTo(0, -R * 0.64); ctx.lineTo(0, -R * 0.92); ctx.lineTo(R * 0.22, -R * 0.84); ctx.lineTo(0, -R * 0.76)
      ctx.fill(); ctx.stroke()
      break
    }
    case 'tower': {
      r(-0.22, -0.68, 0.44, 1.14)
      cren(-0.22, -0.8, 0.44, 3)
      ctx.fillStyle = highlight; r(-0.08, -0.24, 0.16, 0.2); ctx.fillStyle = fill
      ctx.fillStyle = highlight; r(-0.08, 0.12, 0.16, 0.2); ctx.fillStyle = fill
      break
    }
    case 'harbor': {
      // Anchor shape
      ctx.lineWidth = Math.max(2.5, R * 0.1)
      ctx.beginPath(); ctx.arc(0, -R * 0.58, R * 0.16, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, -R * 0.42); ctx.lineTo(0, R * 0.38); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-R * 0.28, -R * 0.22); ctx.lineTo(R * 0.28, -R * 0.22); ctx.stroke()
      ctx.lineWidth = lw
      ctx.beginPath()
      ctx.moveTo(-R * 0.5, 0)
      ctx.quadraticCurveTo(-R * 0.38, R * 0.52, 0, R * 0.52)
      ctx.quadraticCurveTo(R * 0.38, R * 0.52, R * 0.5, 0)
      ctx.stroke()
      // Flukes
      ;[-1, 1].forEach(side => {
        ctx.beginPath()
        ctx.moveTo(side * R * 0.5, 0)
        ctx.lineTo(side * R * 0.32, R * 0.12); ctx.lineTo(side * R * 0.34, -R * 0.1)
        ctx.closePath(); ctx.fill()
      })
      break
    }
    case 'mountains': {
      const peaks = [{ x: -0.3, h: 1.18, w: 0.76 }, { x: 0.22, h: 0.98, w: 0.64 }, { x: 0.02, h: 0.72, w: 0.48 }]
      peaks.forEach(p => {
        ctx.beginPath()
        ctx.moveTo(R * p.x, -R * p.h * 0.5)
        ctx.lineTo(R * (p.x - p.w * 0.5), R * p.h * 0.42)
        ctx.lineTo(R * (p.x + p.w * 0.5), R * p.h * 0.42)
        ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.fillStyle = highlight
        ctx.beginPath()
        ctx.moveTo(R * p.x, -R * p.h * 0.5)
        ctx.lineTo(R * (p.x - p.w * 0.14), -R * p.h * 0.2)
        ctx.lineTo(R * (p.x + p.w * 0.14), -R * p.h * 0.22)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = fill
      })
      break
    }
    case 'forest':
    case 'trees': {
      // 5 trees
      const treePositions = [[0, 0, 1.0], [-0.38, 0.1, 0.78], [0.36, 0.06, 0.82], [-0.18, -0.06, 0.68], [0.14, -0.08, 0.72]]
      treePositions.forEach(([tx, ty, sc]) => {
        const h = R * sc
        const w = h * 0.44
        ;[[0.54, 0.64], [0.28, 0.78], [0.0, 0.92]].forEach(([yo, ws]) => {
          const lw2 = w * ws
          ctx.beginPath()
          ctx.moveTo(R * tx, R * ty - h * (0.5 - yo * 0.5))
          ctx.lineTo(R * tx - lw2, R * ty - h * (0.1 - yo * 0.5))
          ctx.lineTo(R * tx + lw2, R * ty - h * (0.1 - yo * 0.5))
          ctx.closePath(); ctx.fill(); ctx.stroke()
        })
        ctx.beginPath()
        ctx.moveTo(R * tx, R * ty + h * 0.08)
        ctx.lineTo(R * tx, R * ty + h * 0.36); ctx.stroke()
      })
      break
    }
    case 'ruins': {
      ;[[-0.56, 0.9], [-0.38, 0.78], [0.28, 0.72], [0.46, 0.82]].forEach(([x, h]) => {
        r(x, -h + 0.46, 0.14, h)
      })
      ctx.lineWidth = Math.max(3, R * 0.1)
      ctx.beginPath()
      ctx.moveTo(-R * 0.4, R * 0.46)
      ctx.lineTo(-R * 0.2, -R * 0.08)
      ctx.quadraticCurveTo(0, -R * 0.28, R * 0.22, -R * 0.04)
      ctx.lineTo(R * 0.44, R * 0.46); ctx.stroke()
      ctx.lineWidth = lw
      ctx.beginPath(); ctx.moveTo(-R * 0.66, R * 0.52); ctx.lineTo(R * 0.66, R * 0.52); ctx.stroke()
      break
    }
    case 'landmark': {
      // Obelisk
      ctx.beginPath()
      ctx.moveTo(0, -R * 0.76)
      ctx.lineTo(R * 0.2, -R * 0.56)
      ctx.lineTo(R * 0.14, R * 0.46)
      ctx.lineTo(-R * 0.14, R * 0.46)
      ctx.lineTo(-R * 0.2, -R * 0.56)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.fillStyle = highlight; r(-0.04, -0.52, 0.06, 0.38); ctx.fillStyle = fill
      r(-0.28, 0.42, 0.56, 0.1)
      break
    }
    case 'cave': {
      ctx.beginPath()
      ctx.moveTo(-R * 0.72, R * 0.5)
      ctx.lineTo(-R * 0.52, 0)
      ctx.lineTo(-R * 0.3, -R * 0.38)
      ctx.lineTo(0, -R * 0.56)
      ctx.lineTo(R * 0.3, -R * 0.42)
      ctx.lineTo(R * 0.56, R * 0)
      ctx.lineTo(R * 0.74, R * 0.5)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.fillStyle = highlight
      ctx.beginPath()
      ctx.moveTo(-R * 0.32, R * 0.5)
      ctx.quadraticCurveTo(0, -R * 0.2, R * 0.32, R * 0.5)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = fill
      break
    }
    case 'mine': {
      ctx.lineWidth = Math.max(3, R * 0.1)
      ctx.beginPath(); ctx.moveTo(-R * 0.44, R * 0.5); ctx.lineTo(R * 0.44, -R * 0.46); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-R * 0.48, -R * 0.48)
      ctx.quadraticCurveTo(R * 0.1, -R * 0.76, R * 0.56, -R * 0.54); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-R * 0.48, -R * 0.48); ctx.lineTo(-R * 0.36, -R * 0.22)
      ctx.moveTo(R * 0.56, -R * 0.54); ctx.lineTo(R * 0.34, -R * 0.38); ctx.stroke()
      ctx.lineWidth = lw
      ctx.beginPath()
      ctx.moveTo(-R * 0.64, R * 0.52); ctx.lineTo(-R * 0.36, R * 0.28)
      ctx.lineTo(-R * 0.06, R * 0.52); ctx.closePath(); ctx.fill(); ctx.stroke()
      break
    }
    case 'temple': {
      // Pediment + columns
      ctx.beginPath()
      ctx.moveTo(-R * 0.64, -R * 0.34)
      ctx.lineTo(0, -R * 0.68)
      ctx.lineTo(R * 0.64, -R * 0.34)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      r(-0.72, 0.4, 1.44, 0.1); r(-0.6, 0.26, 1.2, 0.12)
      ;[-0.44, -0.16, 0.16, 0.44].forEach(x => r(x - 0.06, -0.34, 0.12, 0.6))
      break
    }
    case 'shrine': {
      r(-0.18, -0.52, 0.36, 0.94)
      ctx.beginPath()
      ctx.moveTo(-R * 0.22, -R * 0.52); ctx.lineTo(0, -R * 0.76); ctx.lineTo(R * 0.22, -R * 0.52)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.fillStyle = highlight; r(-0.07, -0.08, 0.14, 0.22); ctx.fillStyle = fill
      r(-0.38, 0.36, 0.76, 0.08)
      break
    }
    case 'battlefield': {
      ctx.lineWidth = Math.max(4, R * 0.12)
      ctx.beginPath(); ctx.moveTo(-R * 0.52, R * 0.5); ctx.lineTo(R * 0.44, -R * 0.6); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(R * 0.52, R * 0.5); ctx.lineTo(-R * 0.44, -R * 0.6); ctx.stroke()
      ctx.lineWidth = Math.max(2.5, R * 0.08)
      ;[[-0.44, -0.6], [0.44, -0.6]].forEach(([bx, by]) => {
        const sign = bx < 0 ? 1 : -1
        ctx.beginPath()
        ctx.moveTo(R * bx, R * by)
        ctx.lineTo(R * (bx + sign * 0.24), R * (by + 0.1))
        ctx.lineTo(R * (bx + sign * 0.16), R * (by + 0.22))
        ctx.closePath(); ctx.fill(); ctx.stroke()
      })
      break
    }
    case 'portal': {
      ctx.lineWidth = Math.max(4, R * 0.12)
      ctx.beginPath()
      ctx.arc(0, R * 0.44, R * 0.5, Math.PI, Math.PI * 2)
      ctx.lineTo(R * 0.5, R * 0.56); ctx.moveTo(-R * 0.5, R * 0.44); ctx.lineTo(-R * 0.5, R * 0.56)
      ctx.stroke()
      ctx.lineWidth = Math.max(1.5, R * 0.06)
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.arc(0, R * 0.1, R * (0.1 + i * 0.13), i * 0.5, Math.PI * 1.5 + i * 0.7)
        ctx.stroke()
      }
      break
    }
    case 'magic-source': {
      // Crystal shape
      ctx.beginPath()
      ctx.moveTo(0, -R * 0.72); ctx.lineTo(R * 0.26, -R * 0.24)
      ctx.lineTo(R * 0.18, R * 0.48); ctx.lineTo(0, R * 0.66)
      ctx.lineTo(-R * 0.18, R * 0.48); ctx.lineTo(-R * 0.26, -R * 0.24)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.fillStyle = highlight
      ctx.beginPath()
      ctx.moveTo(0, -R * 0.6); ctx.lineTo(R * 0.1, -R * 0.28); ctx.lineTo(0, -R * 0.1)
      ctx.lineTo(-R * 0.1, -R * 0.28); ctx.closePath(); ctx.fill()
      ctx.fillStyle = fill
      // Star sparks
      ;[[-0.56, -0.28], [0.54, -0.26], [-0.5, 0.28], [0.48, 0.3]].forEach(([sx, sy]) => {
        ctx.lineWidth = Math.max(1, R * 0.05)
        ;[0, Math.PI / 2, Math.PI / 4, -Math.PI / 4].forEach(a => {
          const len = R * 0.12
          ctx.beginPath()
          ctx.moveTo(R * sx - Math.cos(a) * len, R * sy - Math.sin(a) * len)
          ctx.lineTo(R * sx + Math.cos(a) * len, R * sy + Math.sin(a) * len)
          ctx.stroke()
        })
      })
      break
    }
    case 'camp': {
      // Canvas tent with open flap, guy ropes, and stakes.
      ctx.beginPath()
      ctx.moveTo(0, -R * 0.72)
      ctx.lineTo(-R * 0.7, R * 0.5)
      ctx.lineTo(R * 0.7, R * 0.5)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.fillStyle = highlight
      ctx.beginPath()
      ctx.moveTo(0, -R * 0.48)
      ctx.lineTo(-R * 0.22, R * 0.5)
      ctx.lineTo(R * 0.22, R * 0.5)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.moveTo(0, -R * 0.48)
      ctx.lineTo(-R * 0.22, R * 0.5)
      ctx.lineTo(0, R * 0.28)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.lineWidth = Math.max(1.4, R * 0.055)
      ctx.beginPath(); ctx.moveTo(-R * 0.42, -R * 0.06); ctx.lineTo(-R * 0.86, R * 0.58); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(R * 0.42, -R * 0.06); ctx.lineTo(R * 0.86, R * 0.58); ctx.stroke()
      r(-0.9, 0.56, 0.14, 0.06); r(0.76, 0.56, 0.14, 0.06)
      r(-0.72, 0.5, 1.44, 0.1)
      break
    }
    case 'bridge': {
      // Arch bridge
      r(-0.72, 0.1, 1.44, 0.12)
      ctx.lineWidth = Math.max(2.5, R * 0.09)
      ctx.beginPath(); ctx.arc(0, R * 0.44, R * 0.4, Math.PI, Math.PI * 2); ctx.stroke()
      ;[-0.56, 0.56].forEach(x => {
        ctx.beginPath(); ctx.moveTo(R * x, R * 0.22); ctx.lineTo(R * x, R * 0.44); ctx.stroke()
      })
      ctx.lineWidth = lw
      break
    }
    default: {
      // Generic: circle with initial letter
      ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2)
      ctx.fillStyle = colorWithAlpha(ink, 0.18); ctx.fill()
      ctx.strokeStyle = ink; ctx.fillStyle = fill; ctx.stroke()
      ctx.fillStyle = ink
      ctx.font = `700 ${Math.max(18, R * 0.62)}px Georgia, serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText((stampId || '?').slice(0, 1).toUpperCase(), 0, 1)
    }
  }
}


// ─── Location marker ──────────────────────────────────────────────────────────

function drawLocation(ctx, object, isSelected, opts) {
  const cx = object.x, cy = object.y
  const size = Number(object.properties?.iconSize) || object.width || 64
  const r = size / 2
  const markerIcon = object.properties?.markerIcon || 'pin'
  const fill = object.properties?.fill || (opts.style === 'blueprint' ? '#5090cc' : '#c8602a')
  const stroke = object.properties?.stroke || (opts.style === 'blueprint' ? '#2050a0' : '#6a2a0a')
  const label = object.properties?.name || ''
  const labelFontSize = clamp(Number(object.properties?.labelFontSize) || Math.max(13, r * 0.38), 8, 96)
  const labelColor = object.properties?.labelColor || (opts.style === 'blueprint' ? '#8cc8f0' : '#1a140a')
  const labelOutlineColor = object.properties?.labelOutlineColor || (opts.style === 'blueprint' ? '#1a2b4a' : '#f4e8c4')

  ctx.save()
  ctx.translate(cx, cy)
  ctx.strokeStyle = isSelected ? '#1677ff' : stroke
  ctx.fillStyle = fill
  ctx.lineWidth = Math.max(2, r * 0.1)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'

  if (markerIcon === 'dot') {
    ctx.beginPath(); ctx.arc(0, 0, r * 0.54, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  } else if (markerIcon === 'diamond') {
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.72); ctx.lineTo(r * 0.52, 0)
    ctx.lineTo(0, r * 0.6); ctx.lineTo(-r * 0.52, 0); ctx.closePath()
    ctx.fill(); ctx.stroke()
  } else if (markerIcon === 'star') {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 5
      const pr = i % 2 ? r * 0.3 : r * 0.68
      if (i === 0) ctx.moveTo(Math.cos(angle) * pr, Math.sin(angle) * pr - r * 0.12)
      else ctx.lineTo(Math.cos(angle) * pr, Math.sin(angle) * pr - r * 0.12)
    }
    ctx.closePath(); ctx.fill(); ctx.stroke()
  } else if (markerIcon === 'tower') {
    ctx.fillRect(-r * 0.42, -r * 0.52, r * 0.84, r * 0.96)
    ctx.strokeRect(-r * 0.42, -r * 0.52, r * 0.84, r * 0.96)
    ;[-0.38, 0, 0.38].forEach(off => { ctx.fillRect(off * r - r * 0.12, -r * 0.7, r * 0.24, r * 0.22); ctx.strokeRect(off * r - r * 0.12, -r * 0.7, r * 0.24, r * 0.22) })
  } else {
    // pin (default)
    ctx.beginPath()
    ctx.moveTo(0, r * 0.58)
    ctx.bezierCurveTo(r * 0.7, 0, r * 0.52, -r * 0.72, 0, -r * 0.72)
    ctx.bezierCurveTo(-r * 0.52, -r * 0.72, -r * 0.7, 0, 0, r * 0.58)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = colorWithAlpha('#fff8e8', 0.9)
    ctx.beginPath(); ctx.arc(0, -r * 0.22, r * 0.22, 0, Math.PI * 2); ctx.fill()
  }

  if (isSelected) {
    ctx.strokeStyle = '#1677ff'; ctx.lineWidth = 2; ctx.setLineDash([4, 3])
    ctx.strokeRect(-r - 4, -r - 4, (r + 4) * 2, (r + 4) * 2)
    ctx.setLineDash([])
  }

  if (label) {
    const fontSize = labelFontSize
    ctx.font = `600 ${fontSize}px "Palatino Linotype", Georgia, serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.lineWidth = Math.max(3, fontSize * 0.08)
    ctx.strokeStyle = colorWithAlpha(labelOutlineColor, 0.94)
    ctx.fillStyle = labelColor
    ctx.strokeText(label, 0, r + 5); ctx.fillText(label, 0, r + 5)
  }
  ctx.restore()
}

// ─── Label ────────────────────────────────────────────────────────────────────

function drawLabel(ctx, object, isSelected, opts) {
  const text = object.properties?.text || object.properties?.name || ''
  if (!text) return
  const cx = object.x, cy = object.y
  const fontSize = object.properties?.fontSize || 42
  const fontFamily = object.properties?.fontFamily || '"Palatino Linotype", Georgia, serif'
  const fontWeight = object.properties?.fontWeight || 600
  const fontStyle = object.properties?.fontStyle || 'normal'
  const textColor = object.properties?.textColor || (opts.style === 'blueprint' ? '#8cc8f0' : '#1a140a')
  const outlineColor = object.properties?.outlineColor || (opts.style === 'blueprint' ? '#1a2b4a' : '#f4e8c4')
  const bgColor = object.properties?.backgroundColor || 'transparent'

  ctx.save()
  ctx.translate(cx, cy)
  if (object.rotation) ctx.rotate(object.rotation * Math.PI / 180)
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (bgColor !== 'transparent') {
    const w = object.width || 200, h = object.height || 60
    ctx.fillStyle = bgColor
    ctx.fillRect(-w / 2 - 6, -h / 2 - 4, w + 12, h + 8)
  }

  if (outlineColor !== 'transparent') {
    ctx.strokeStyle = outlineColor
    ctx.lineWidth = Math.max(3, fontSize * 0.08)
    ctx.strokeText(text, 0, 0)
  }

  ctx.fillStyle = textColor !== 'transparent' ? textColor : 'rgba(0,0,0,0)'
  ctx.fillText(text, 0, 0)

  if (isSelected) {
    const w = object.width || ctx.measureText(text).width + 20
    const h = object.height || fontSize * 1.6
    ctx.strokeStyle = '#1677ff'; ctx.lineWidth = 2; ctx.setLineDash([4, 3])
    ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8)
    ctx.setLineDash([])
  }
  ctx.restore()
}

// ─── Note ─────────────────────────────────────────────────────────────────────

function drawNote(ctx, object, isSelected, opts) {
  const cx = object.x, cy = object.y
  const size = object.width || 80
  const isGmOnly = Boolean(object.properties?.gmOnly)
  const fill = isGmOnly ? '#e07828' : '#f7e260'
  const stroke = isGmOnly ? '#7a3c0a' : '#6a5410'
  const title = object.properties?.title || object.properties?.name || ''

  ctx.save()
  ctx.translate(cx, cy)
  if (object.rotation) ctx.rotate(object.rotation * Math.PI / 180)

  const w = size * 0.92, h = size * 1.0, fold = size * 0.22
  ctx.strokeStyle = isSelected ? '#1677ff' : stroke
  ctx.fillStyle = fill
  ctx.lineWidth = Math.max(2, size * 0.04)
  ctx.lineJoin = 'round'

  // note body
  ctx.beginPath()
  ctx.moveTo(-w / 2, -h / 2 + fold)
  ctx.lineTo(-w / 2 + fold, -h / 2)
  ctx.lineTo(w / 2, -h / 2)
  ctx.lineTo(w / 2, h / 2)
  ctx.lineTo(-w / 2, h / 2)
  ctx.closePath()
  ctx.fill(); ctx.stroke()

  // fold corner
  ctx.fillStyle = colorWithAlpha(stroke, 0.22)
  ctx.beginPath()
  ctx.moveTo(-w / 2, -h / 2 + fold)
  ctx.lineTo(-w / 2 + fold, -h / 2 + fold)
  ctx.lineTo(-w / 2 + fold, -h / 2)
  ctx.closePath()
  ctx.fill(); ctx.stroke()

  // lines
  ctx.strokeStyle = colorWithAlpha(stroke, 0.3)
  ctx.lineWidth = Math.max(0.8, size * 0.022)
  ;[-0.28, 0.02, 0.32].forEach(yOff => {
    ctx.beginPath()
    ctx.moveTo(-w / 2 + fold + size * 0.06, yOff * h)
    ctx.lineTo(w / 2 - size * 0.1, yOff * h)
    ctx.stroke()
  })

  if (isGmOnly) {
    ctx.fillStyle = colorWithAlpha('#fff', 0.78)
    ctx.font = `700 ${Math.max(10, size * 0.22)}px Georgia, serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('GM', 0, h / 2 - size * 0.06)
  }

  if (title) {
    ctx.fillStyle = colorWithAlpha(stroke, 0.9)
    ctx.font = `600 ${Math.max(11, size * 0.18)}px "Palatino Linotype", Georgia, serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    const outsideLabel = opts.style === 'blueprint' ? '#8cc8f0' : '#1a140a'
    ctx.strokeStyle = opts.style === 'blueprint' ? colorWithAlpha('#1a2b4a', 0.9) : colorWithAlpha('#f4e8c4', 0.92)
    ctx.lineWidth = 2.5
    ctx.strokeText(title, 0, h / 2 + size * 0.08)
    ctx.fillStyle = outsideLabel
    ctx.fillText(title, 0, h / 2 + size * 0.08)
  }

  if (isSelected) {
    ctx.strokeStyle = '#1677ff'; ctx.lineWidth = 2; ctx.setLineDash([4, 3])
    ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8)
    ctx.setLineDash([])
  }
  ctx.restore()
}

// ─── Selection / handle helpers ───────────────────────────────────────────────

function drawGeometryHandles(ctx, points, zoom = 1, mode = 'points') {
  if (mode === 'resize') {
    drawGeometryResizeHandles(ctx, points, zoom)
    return
  }
  drawPolygonHandles(ctx, points, zoom)
}

function drawPolygonHandles(ctx, points, zoom = 1) {
  const radius = Math.max(5, 6 / Math.max(zoom, 0.1))
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#1677ff'
  ctx.lineWidth = Math.max(1.5, 2 / Math.max(zoom, 0.1))
  points.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  })
  ctx.restore()
}

function drawGeometryResizeHandles(ctx, points, zoom = 1) {
  if (!points?.length) return
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = Math.max(6, 8 / Math.max(zoom, 0.1))
  const size = Math.max(7, 8 / Math.max(zoom, 0.1))
  const handles = [
    [minX - pad, minY - pad],
    [maxX + pad, minY - pad],
    [maxX + pad, maxY + pad],
    [minX - pad, maxY + pad],
  ]
  ctx.save()
  ctx.strokeStyle = '#1677ff'
  ctx.fillStyle = '#fff'
  ctx.lineWidth = Math.max(1.5, 2 / Math.max(zoom, 0.1))
  ctx.setLineDash([6 / Math.max(zoom, 0.1), 4 / Math.max(zoom, 0.1)])
  ctx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2)
  ctx.setLineDash([])
  handles.forEach(([x, y]) => {
    ctx.beginPath()
    ctx.rect(x - size / 2, y - size / 2, size, size)
    ctx.fill()
    ctx.stroke()
  })
  ctx.restore()
}

// ─── Draft overlay ────────────────────────────────────────────────────────────

export function drawDraft(ctx, draft, zoom) {
  if (!draft) return
  const pts = draft.points || []
  if (!pts.length) return
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'

  const allPts = draft.preview ? [...pts, draft.preview] : pts

  if (pts.length >= 2 || (pts.length >= 1 && draft.preview)) {
    const drawLine = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke() }
    if (draft.kind === 'water' && draft.closed && allPts.length >= 3) {
      const fill = draft.properties?.fill || '#73b8cf'
      const stroke = draft.properties?.stroke || '#2f769f'
      ctx.fillStyle = fill
      ctx.strokeStyle = stroke
      ctx.lineWidth = Math.max(2, (draft.properties?.lineThickness || 3) / zoom)
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(allPts[0].x, allPts[0].y)
      allPts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    } else if (draft.kind === 'river' && allPts.length >= 2) {
      const stroke = draft.properties?.stroke === '#3a80b0' ? '#2f5f78' : (draft.properties?.stroke || '#2f5f78')
      const fill = ['#c8eeff', '#73b8cf'].includes(draft.properties?.fill) ? '#7faec0' : (draft.properties?.fill || '#7faec0')
      const thickness = draft.properties?.lineThickness || 7
      const outerWidth = thickness * 1.4
      const borderPx = Math.max(2, thickness * 0.15)
      const strokeRingPx = Math.max(2, thickness * 0.18)
      ctx.setLineDash([])
      ctx.strokeStyle = '#203f52'; ctx.lineWidth = outerWidth; drawLine(allPts)
      ctx.strokeStyle = stroke; ctx.lineWidth = outerWidth - borderPx * 2; drawLine(allPts)
      ctx.strokeStyle = fill; ctx.lineWidth = outerWidth - borderPx * 2 - strokeRingPx * 2; drawLine(allPts)
    } else if (draft.kind === 'road' && allPts.length >= 2) {
      const stroke = draft.properties?.stroke || '#8b6030'
      const borderStroke = draft.properties?.borderStroke || '#2c1a0a'
      const highlight = draft.properties?.highlight || '#f0d8a0'
      const thickness = draft.properties?.lineThickness || 5
      const outerWidth = thickness * 1.4
      const borderPx = Math.max(2, thickness * 0.15)
      const strokeRingPx = Math.max(2, thickness * 0.18)
      const dashed = Boolean(draft.properties?.dashed)
      ctx.setLineDash(dashed ? [thickness * 2, thickness * 1.5] : [])
      ctx.strokeStyle = borderStroke; ctx.lineWidth = outerWidth; drawLine(allPts)
      ctx.strokeStyle = stroke; ctx.lineWidth = outerWidth - borderPx * 2; drawLine(allPts)
      ctx.setLineDash([])
      ctx.strokeStyle = highlight; ctx.lineWidth = outerWidth - borderPx * 2 - strokeRingPx * 2; drawLine(allPts)
    } else {
      ctx.strokeStyle = '#1677ff'
      ctx.lineWidth = 2 / zoom
      ctx.setLineDash([6 / zoom, 4 / zoom])
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      if (draft.preview) ctx.lineTo(draft.preview.x, draft.preview.y)
      ctx.stroke()
      // close line for polygon drafts
      if (draft.closed && pts.length >= 3 && draft.preview) {
        ctx.strokeStyle = colorWithAlpha('#1677ff', 0.38)
        ctx.beginPath(); ctx.moveTo(draft.preview.x, draft.preview.y)
        ctx.lineTo(pts[0].x, pts[0].y); ctx.stroke()
      }
    }
  }

  ctx.setLineDash([])
  // vertex dots
  pts.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? '#1677ff' : '#fff'
    ctx.strokeStyle = '#1677ff'
    ctx.lineWidth = 1.5 / zoom
    ctx.beginPath(); ctx.arc(p.x, p.y, 5 / zoom, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  })
  // preview cursor dot
  if (draft.preview) {
    ctx.fillStyle = colorWithAlpha('#1677ff', 0.5)
    ctx.beginPath(); ctx.arc(draft.preview.x, draft.preview.y, 4 / zoom, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

// ─── Hover highlight ──────────────────────────────────────────────────────────

export function drawHoverHighlight(ctx, object, zoom) {
  if (!object) return
  ctx.save()
  ctx.strokeStyle = colorWithAlpha('#d8942f', 0.72)
  ctx.lineWidth = 2.5 / zoom
  ctx.setLineDash([])
  if (object.geometry?.type === 'polygon' || object.geometry?.type === 'path') {
    const pts = object.geometry.points || []
    if (pts.length < 2) { ctx.restore(); return }
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
    if (object.geometry.type === 'polygon') ctx.closePath()
    ctx.stroke()
  } else {
    const w = (object.width || 80) + 10, h = (object.height || 80) + 10
    ctx.strokeRect(object.x - w / 2, object.y - h / 2, w, h)
  }
  ctx.restore()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBoundsFromPoints(pts) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
