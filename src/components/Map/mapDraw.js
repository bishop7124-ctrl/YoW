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
  ctx.globalAlpha = (object.locked ? 0.6 : 1) * (Number.isFinite(object.properties?.opacity) ? object.properties.opacity : 1)
  switch (object.type) {
    case 'shape': drawLandShape(ctx, object, isSelected, opts); break
    case 'region': drawRegion(ctx, object, isSelected, opts); break   // terrain region
    case 'territory': drawTerritory(ctx, object, isSelected, opts); break  // political region
    case 'mountain': drawMountainRidge(ctx, object, isSelected, opts); break  // legacy
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
    ? colorWithAlpha('#26486a', 0.92)
    : isAtlas ? colorWithAlpha('#3d6635', 0.96)
    : colorWithAlpha(fill, 0.94)
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
    : isBlueprint ? colorWithAlpha('#70b8e0', 0.9)
    : isAtlas ? colorWithAlpha(stroke, 0.88)
    : colorWithAlpha(stroke, 0.68)
  ctx.lineWidth = isSelected ? 3 : 2
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([])
  drawSmoothPath(ctx, jitter, true); ctx.stroke()

  if (isSelected) drawPolygonHandles(ctx, pts)
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

  // Background fill — slightly stronger so terrain is visible
  ctx.fillStyle = colorWithAlpha(fill, (object.properties?.opacity ?? 0.44))
  drawSmoothPath(ctx, jitter, true); ctx.fill()

  // Clip and draw terrain symbols inside the region
  ctx.save()
  drawSmoothPath(ctx, jitter, true); ctx.clip()
  const b = getBoundsFromPoints(pts)
  // Ink color: dark for parchment/atlas, blue for blueprint
  const inkColor = isBlueprint ? '#3060a8' : isParchment ? '#1a1206' : '#1a2010'
  drawTerrainSymbols(ctx, terrainType, pts, b, seed, inkColor, opts)
  ctx.restore()

  // Dashed boundary
  ctx.strokeStyle = isSelected ? '#1677ff' : colorWithAlpha(fill, 0.6)
  ctx.lineWidth = isSelected ? 2.5 : 1.5
  ctx.setLineDash(isSelected ? [] : [7, 5])
  ctx.lineJoin = 'round'
  drawSmoothPath(ctx, jitter, true); ctx.stroke()
  ctx.setLineDash([])

  if (isSelected) drawPolygonHandles(ctx, pts)
  ctx.restore()
}

// ─── Territory / political region ────────────────────────────────────────────

function drawTerritory(ctx, object, isSelected, opts) {
  const pts = object.geometry?.points
  if (!pts || pts.length < 3) return
  const seed = hashString(object.id)
  const fill = object.properties?.fill || '#7050a8'
  const name = object.properties?.name || ''
  const isBlueprint = opts.style === 'blueprint'
  const organic = !isBlueprint
  const jitter = organic ? organicPoints(pts, seed, { closed: true, amplitude: 6, spacing: 28 }) : pts
  const b = getBoundsFromPoints(pts)

  ctx.save()

  // Translucent fill
  ctx.fillStyle = colorWithAlpha(fill, 0.12)
  drawSmoothPath(ctx, jitter, true)
  ctx.fill()

  // Prominent dashed border
  ctx.strokeStyle = isSelected ? '#1677ff' : colorWithAlpha(fill, isBlueprint ? 0.8 : 0.7)
  ctx.lineWidth = isSelected ? 3 : 2.5
  ctx.setLineDash([10, 6])
  ctx.lineJoin = 'round'
  drawSmoothPath(ctx, jitter, true)
  ctx.stroke()
  ctx.setLineDash([])

  // Territory name label centred inside polygon
  if (name) {
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    const fontSize = Math.max(18, Math.min(52, Math.sqrt(b.w * b.h) * 0.12))
    ctx.font = `italic 600 ${fontSize}px "Palatino Linotype", Georgia, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = Math.max(3, fontSize * 0.09)
    ctx.strokeStyle = isBlueprint ? colorWithAlpha('#1a2b4a', 0.9) : colorWithAlpha('#f4e8c4', 0.88)
    ctx.fillStyle = isBlueprint ? '#8cc8f0' : colorWithAlpha(fill, 0.9)
    ctx.strokeText(name, cx, cy)
    ctx.fillText(name, cx, cy)
  }

  if (isSelected) drawPolygonHandles(ctx, pts)
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

function polyContains(polygon, px, py) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function drawTerrainSymbols(ctx, terrainType, pts, b, seed, inkColor, _opts) {
  ctx.strokeStyle = inkColor
  ctx.fillStyle = inkColor
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 0.72

  if (terrainType === 'forest') {
    // Staggered grid of pine trees
    terrainGrid(pts, b, seed, 52, (x, y, i) => {
      const h = 26 + seededNoise(seed, i + 200) * 12
      const w = h * 0.46
      const isPine = seededNoise(seed, i + 300) > 0.38
      ctx.lineWidth = Math.max(1, h * 0.045)
      if (isPine) {
        // 3-layer pine
        ;[[0.54, 0.62], [0.28, 0.76], [0, 0.9]].forEach(([yOff, widthScale]) => {
          const lw = w * widthScale
          ctx.beginPath()
          ctx.moveTo(x, y - h * (0.5 - yOff * 0.5))
          ctx.lineTo(x - lw, y - h * (0.12 - yOff * 0.5))
          ctx.lineTo(x + lw, y - h * (0.12 - yOff * 0.5))
          ctx.closePath(); ctx.fill(); ctx.stroke()
        })
        ctx.lineWidth = Math.max(1, h * 0.06)
        ctx.beginPath(); ctx.moveTo(x, y + h * 0.06); ctx.lineTo(x, y + h * 0.38); ctx.stroke()
      } else {
        // Deciduous: circle blob + trunk
        ctx.beginPath(); ctx.arc(x, y - h * 0.18, w * 0.88, 0, Math.PI * 2)
        ctx.fill(); ctx.stroke()
        ctx.lineWidth = Math.max(1, h * 0.06)
        ctx.beginPath(); ctx.moveTo(x, y - h * 0.18 + w * 0.82); ctx.lineTo(x, y + h * 0.32); ctx.stroke()
      }
    })

  } else if (terrainType === 'mountains') {
    // Mountain peak clusters
    terrainGrid(pts, b, seed, 96, (x, y, i) => {
      const clusterSize = 2 + Math.floor(seededNoise(seed, i + 100) * 2)
      for (let p = 0; p < clusterSize; p++) {
        const px = x + (seededNoise(seed, i * 5 + p * 3 + 10) - 0.5) * 60
        const py = y + (seededNoise(seed, i * 5 + p * 3 + 11) - 0.5) * 28
        const h = 40 + seededNoise(seed, i * 5 + p + 12) * 22
        const hw = h * (0.44 + seededNoise(seed, i * 5 + p + 13) * 0.24)
        ctx.lineWidth = Math.max(1.2, h * 0.05)
        // Mountain body
        ctx.beginPath()
        ctx.moveTo(px, py - h * 0.52)
        ctx.lineTo(px - hw, py + h * 0.42)
        ctx.lineTo(px + hw, py + h * 0.42)
        ctx.closePath(); ctx.fill(); ctx.stroke()
        // Snow cap
        ctx.save()
        ctx.globalAlpha = 0.55
        ctx.fillStyle = '#f0ece4'
        ctx.beginPath()
        ctx.moveTo(px, py - h * 0.52)
        ctx.lineTo(px - hw * 0.3, py - h * 0.2)
        ctx.lineTo(px + hw * 0.3, py - h * 0.2)
        ctx.closePath(); ctx.fill()
        ctx.restore()
        ctx.strokeStyle = inkColor; ctx.fillStyle = inkColor
      }
    })

  } else if (terrainType === 'hills') {
    // Rounded hill humps
    terrainGrid(pts, b, seed, 72, (x, y, i) => {
      const w = 30 + seededNoise(seed, i + 200) * 18
      const h = w * 0.46
      ctx.lineWidth = Math.max(1.2, w * 0.05)
      ctx.beginPath()
      ctx.moveTo(x - w * 0.62, y + h * 0.1)
      ctx.quadraticCurveTo(x - w * 0.2, y - h * 0.82, x, y - h * 0.88)
      ctx.quadraticCurveTo(x + w * 0.2, y - h * 0.82, x + w * 0.62, y + h * 0.1)
      ctx.stroke()
      // Light right-side shadow
      ctx.save(); ctx.globalAlpha = 0.28
      ctx.beginPath()
      ctx.moveTo(x + w * 0.1, y - h * 0.7)
      ctx.quadraticCurveTo(x + w * 0.35, y - h * 0.38, x + w * 0.6, y + h * 0.1)
      ctx.lineWidth = Math.max(2, w * 0.08); ctx.stroke()
      ctx.restore()
    })

  } else if (terrainType === 'desert') {
    // Crescent dune arcs in rows
    terrainGrid(pts, b, seed, 38, (x, y, i) => {
      const w = 28 + seededNoise(seed, i + 100) * 18
      const tilt = (seededNoise(seed, i + 200) - 0.5) * 0.4
      ctx.lineWidth = Math.max(1, w * 0.055)
      ctx.save(); ctx.translate(x, y); ctx.rotate(tilt)
      ctx.beginPath()
      ctx.moveTo(-w * 0.5, 0)
      ctx.quadraticCurveTo(0, -w * 0.22, w * 0.5, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-w * 0.32, w * 0.08)
      ctx.quadraticCurveTo(0, -w * 0.08, w * 0.32, w * 0.08)
      ctx.stroke()
      ctx.restore()
    })

  } else if (terrainType === 'swamp') {
    // Reed clusters with water ripple
    terrainGrid(pts, b, seed, 44, (x, y, i) => {
      const h = 22 + seededNoise(seed, i + 100) * 14
      ctx.lineWidth = Math.max(1, h * 0.06)
      // 3 reed stems
      ;[-6, 0, 7].forEach((xOff, k) => {
        const rh = h * (0.76 + seededNoise(seed, i * 5 + k) * 0.28)
        const lean = (seededNoise(seed, i * 5 + k + 30) - 0.5) * 6
        ctx.beginPath()
        ctx.moveTo(x + xOff, y + rh * 0.3)
        ctx.lineTo(x + xOff + lean, y - rh * 0.48)
        ctx.stroke()
        // Cattail head
        ctx.beginPath()
        ctx.ellipse(x + xOff + lean, y - rh * 0.48, h * 0.055, h * 0.14, lean * 0.04, 0, Math.PI * 2)
        ctx.fill()
      })
      // Water ripple
      if (seededNoise(seed, i + 300) > 0.5) {
        ctx.save(); ctx.globalAlpha = 0.38
        ctx.beginPath(); ctx.ellipse(x + 10, y + h * 0.42, 9, 4, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }
    })

  } else if (terrainType === 'farmland') {
    // Field blocks: rectangles divided by lines
    terrainGrid(pts, b, seed, 58, (x, y, i) => {
      const fw = 38 + seededNoise(seed, i + 100) * 18
      const fh = 24 + seededNoise(seed, i + 200) * 14
      const rot = (seededNoise(seed, i + 300) - 0.5) * 0.3
      ctx.lineWidth = 1
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot)
      ctx.strokeRect(-fw / 2, -fh / 2, fw, fh)
      // Interior field rows
      const rowCount = 2 + Math.floor(seededNoise(seed, i + 400) * 2)
      for (let r = 1; r < rowCount; r++) {
        const ry = -fh / 2 + (fh / rowCount) * r
        ctx.beginPath(); ctx.moveTo(-fw / 2, ry); ctx.lineTo(fw / 2, ry); ctx.stroke()
      }
      ctx.restore()
    })

  } else if (terrainType === 'tundra') {
    // Dot clusters
    terrainGrid(pts, b, seed, 36, (x, y, _i) => {
      ctx.lineWidth = 1
      ;[[0, 0, 2.8], [-6, -2, 1.8], [5, 3, 1.6], [-3, 5, 1.4]].forEach(([dx, dy, r]) => {
        ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill()
      })
    })

  } else if (terrainType === 'snow') {
    // Snowflake crosses
    terrainGrid(pts, b, seed, 38, (x, y, i) => {
      const r = 6 + seededNoise(seed, i + 100) * 5
      ctx.lineWidth = Math.max(1, r * 0.14)
      for (let a = 0; a < 6; a++) {
        const ang = (a * Math.PI) / 3
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r)
        ctx.stroke()
      }
      // Center dot
      ctx.beginPath(); ctx.arc(x, y, r * 0.18, 0, Math.PI * 2); ctx.fill()
    })

  } else if (terrainType === 'volcanic') {
    // Flame/peak marks
    terrainGrid(pts, b, seed, 62, (x, y, i) => {
      const h = 28 + seededNoise(seed, i + 100) * 18
      ctx.lineWidth = Math.max(1.2, h * 0.05)
      ctx.beginPath()
      ctx.moveTo(x, y - h * 0.52)
      ctx.bezierCurveTo(x + h * 0.24, y - h * 0.28, x + h * 0.32, y + h * 0.12, x + h * 0.16, y + h * 0.38)
      ctx.lineTo(x - h * 0.16, y + h * 0.38)
      ctx.bezierCurveTo(x - h * 0.32, y + h * 0.12, x - h * 0.24, y - h * 0.28, x, y - h * 0.52)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      // Hot glow dot
      ctx.save(); ctx.fillStyle = '#e05020'; ctx.globalAlpha = 0.55
      ctx.beginPath(); ctx.arc(x, y + h * 0.14, h * 0.11, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    })

  } else if (terrainType === 'wasteland') {
    // Cracks and X marks
    terrainGrid(pts, b, seed, 50, (x, y, i) => {
      const sz = 16 + seededNoise(seed, i + 100) * 12
      ctx.lineWidth = Math.max(1, sz * 0.06)
      if (seededNoise(seed, i + 200) > 0.5) {
        // X mark
        ctx.beginPath(); ctx.moveTo(x - sz * 0.4, y - sz * 0.4); ctx.lineTo(x + sz * 0.4, y + sz * 0.4); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(x + sz * 0.4, y - sz * 0.4); ctx.lineTo(x - sz * 0.4, y + sz * 0.4); ctx.stroke()
      } else {
        // Jagged crack
        const steps = 3 + Math.floor(seededNoise(seed, i + 300) * 3)
        ctx.beginPath(); ctx.moveTo(x - sz * 0.3, y)
        for (let s = 1; s <= steps; s++) {
          const tx = x - sz * 0.3 + (s / steps) * sz * 0.7
          const ty = y + (seededNoise(seed, i * 10 + s) - 0.5) * sz * 0.6
          ctx.lineTo(tx, ty)
        }
        ctx.stroke()
      }
    })

  } else {
    // Grassland / plains — subtle grass blades
    terrainGrid(pts, b, seed, 30, (x, y, i) => {
      const h = 7 + seededNoise(seed, i + 100) * 5
      ctx.lineWidth = 0.9; ctx.globalAlpha = 0.45
      ;[-4, 0, 4].forEach((xOff, k) => {
        const lean = (seededNoise(seed, i * 5 + k) - 0.5) * 4
        ctx.beginPath(); ctx.moveTo(x + xOff, y); ctx.lineTo(x + xOff + lean, y - h); ctx.stroke()
      })
      ctx.globalAlpha = 0.72
    })
  }
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
  ctx.strokeStyle = colorWithAlpha(fill, 0.42)
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
      ctx.fillStyle = colorWithAlpha(fill, isSelected ? 0.55 : 0.45)
      ctx.strokeStyle = isSelected ? '#1677ff' : colorWithAlpha(stroke, 0.7)
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
  ctx.restore()
}

// ─── River ────────────────────────────────────────────────────────────────────

function drawRiver(ctx, object, isSelected, opts) {
  const pts = object.geometry?.points
  if (!pts || pts.length < 2) return
  const seed = hashString(object.id)
  const thickness = object.properties?.lineThickness || 6
  const stroke = object.properties?.stroke || '#3a80b0'
  const organic = opts.style !== 'blueprint'
  const riverPts = organic ? organicPoints(pts, seed, { closed: false, amplitude: 12, spacing: 36 }) : pts

  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  // shadow
  ctx.strokeStyle = colorWithAlpha('#1a3d58', 0.22)
  ctx.lineWidth = thickness * 2.4
  drawSmoothPath(ctx, riverPts, false); ctx.stroke()
  // body
  ctx.strokeStyle = isSelected ? '#1677ff' : colorWithAlpha(stroke, 0.8)
  ctx.lineWidth = thickness * 1.3
  drawSmoothPath(ctx, riverPts, false); ctx.stroke()
  // highlight
  ctx.strokeStyle = colorWithAlpha('#c8eeff', 0.32)
  ctx.lineWidth = Math.max(1, thickness * 0.38)
  drawSmoothPath(ctx, riverPts, false); ctx.stroke()
  ctx.restore()
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

  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.strokeStyle = colorWithAlpha('#2c1a0a', 0.22)
  ctx.lineWidth = thickness + 5
  ctx.setLineDash(dashed ? [thickness * 2, thickness * 1.5] : [])
  drawSmoothPath(ctx, roadPts, false); ctx.stroke()
  ctx.strokeStyle = isSelected ? '#1677ff' : colorWithAlpha(stroke, 0.85)
  ctx.lineWidth = thickness
  drawSmoothPath(ctx, roadPts, false); ctx.stroke()
  ctx.strokeStyle = colorWithAlpha('#f0d8a0', 0.3)
  ctx.lineWidth = Math.max(1, thickness * 0.3)
  ctx.setLineDash([])
  drawSmoothPath(ctx, roadPts, false); ctx.stroke()
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
  ctx.strokeStyle = isSelected ? '#1677ff' : colorWithAlpha(stroke, 0.82)
  ctx.lineWidth = thickness
  drawSmoothPath(ctx, borderPts, false); ctx.stroke()
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
    ctx.strokeStyle = '#1677ff'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 3])
    ctx.strokeRect(-size / 2 - 4, -size / 2 - 4, size + 8, size + 8)
    ctx.setLineDash([])
  }

  // Label below stamp
  const label = object.properties?.showLabel !== false ? (object.properties?.name || '') : ''
  if (label) {
    const fontSize = Math.max(13, size * 0.21)
    ctx.font = `600 ${fontSize}px "Palatino Linotype", Georgia, serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    const tw = ctx.measureText(label).width
    // Background pill
    ctx.fillStyle = opts.style === 'blueprint' ? colorWithAlpha('#1a2b4a', 0.78) : colorWithAlpha('#f4e8c4', 0.84)
    ctx.beginPath()
    ctx.roundRect(-tw / 2 - 5, size / 2 + 2, tw + 10, fontSize + 4, 3)
    ctx.fill()
    ctx.fillStyle = opts.style === 'blueprint' ? '#8cc8f0' : '#1a140a'
    ctx.fillText(label, 0, size / 2 + 4)
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
      // Crown shape
      ctx.beginPath()
      ctx.moveTo(-R * 0.7, R * 0.38)
      ctx.lineTo(-R * 0.7, -R * 0.15)
      ctx.lineTo(-R * 0.36, -R * 0.52)
      ctx.lineTo(-R * 0.12, R * 0.05)
      ctx.lineTo(0, -R * 0.64)
      ctx.lineTo(R * 0.12, R * 0.05)
      ctx.lineTo(R * 0.36, -R * 0.52)
      ctx.lineTo(R * 0.7, -R * 0.15)
      ctx.lineTo(R * 0.7, R * 0.38)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      // Crown jewels
      ctx.fillStyle = highlight
      ;[[-R * 0.36, -R * 0.62], [0, -R * 0.72], [R * 0.36, -R * 0.62]].forEach(([cx2, cy2]) => {
        ctx.beginPath(); ctx.arc(cx2, cy2, R * 0.07, 0, Math.PI * 2); ctx.fill()
      })
      ctx.fillStyle = fill
      // Base band
      r(-0.72, 0.28, 1.44, 0.14)
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
      // 3 tent shapes
      ;[[-0.36, 0.86], [0.0, 1.0], [0.36, 0.82]].forEach(([tx, sc]) => {
        const h2 = R * sc
        ctx.beginPath()
        ctx.moveTo(R * tx, R * 0.44 - h2 * 0.56)
        ctx.lineTo(R * (tx - 0.28), R * 0.44)
        ctx.lineTo(R * (tx + 0.28), R * 0.44)
        ctx.closePath(); ctx.fill(); ctx.stroke()
      })
      ctx.beginPath(); ctx.moveTo(-R * 0.68, R * 0.48); ctx.lineTo(R * 0.68, R * 0.48); ctx.stroke()
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
  const size = object.width || 64
  const r = size / 2
  const markerIcon = object.properties?.markerIcon || 'pin'
  const fill = object.properties?.fill || (opts.style === 'blueprint' ? '#5090cc' : '#c8602a')
  const stroke = object.properties?.stroke || (opts.style === 'blueprint' ? '#2050a0' : '#6a2a0a')
  const label = object.properties?.name || ''

  ctx.save()
  ctx.translate(cx, cy)
  ctx.strokeStyle = isSelected ? '#1677ff' : colorWithAlpha(stroke, 0.9)
  ctx.fillStyle = colorWithAlpha(fill, 0.9)
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
    const fontSize = Math.max(13, r * 0.38)
    ctx.font = `600 ${fontSize}px "Palatino Linotype", Georgia, serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.lineWidth = Math.max(3, fontSize * 0.08)
    ctx.strokeStyle = opts.style === 'blueprint' ? colorWithAlpha('#1a2b4a', 0.9) : colorWithAlpha('#f4e8c4', 0.94)
    ctx.fillStyle = opts.style === 'blueprint' ? '#8cc8f0' : '#1a140a'
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
  ctx.strokeStyle = isSelected ? '#1677ff' : colorWithAlpha(stroke, 0.88)
  ctx.fillStyle = colorWithAlpha(fill, 0.94)
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

function drawPolygonHandles(ctx, points) {
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#1677ff'
  ctx.lineWidth = 2
  points.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  })
  ctx.restore()
}

// drawResizeHandles kept for future use
function _drawResizeHandles(ctx, half) {
  const corners = [[-half, -half], [half, -half], [half, half], [-half, half]]
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1677ff'; ctx.lineWidth = 1.5
  corners.forEach(([x, y]) => {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  })
}

// ─── Draft overlay ────────────────────────────────────────────────────────────

export function drawDraft(ctx, draft, zoom) {
  if (!draft) return
  const pts = draft.points || []
  if (!pts.length) return
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.strokeStyle = '#1677ff'
  ctx.lineWidth = 2 / zoom
  ctx.setLineDash([6 / zoom, 4 / zoom])

  if (pts.length >= 2) {
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
    if (draft.preview) ctx.lineTo(draft.preview.x, draft.preview.y)
    ctx.stroke()
  }

  // close line for polygon drafts
  if (draft.closed && pts.length >= 3 && draft.preview) {
    ctx.strokeStyle = colorWithAlpha('#1677ff', 0.38)
    ctx.beginPath(); ctx.moveTo(draft.preview.x, draft.preview.y)
    ctx.lineTo(pts[0].x, pts[0].y); ctx.stroke()
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
