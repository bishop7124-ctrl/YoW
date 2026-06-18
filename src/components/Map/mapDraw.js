import {
  HOVER_STROKE, LAND_FILL, LINE_OBJECT_TYPES, OBJECT_TYPES,
  SELECTION_STROKE, STAMP_LIBRARY, WATER_FILL, WATER_STROKE, loadStampAsset,
} from './mapConstants.js'
import {
  clamp, colorWithAlpha, drawSmoothPath, hashString,
  localToNormalized, objectCorners, objectLocalFaces, objectLocalPoints,
  objectPointToMap, organicPoints, seededNoise, selectionBounds,
} from './mapUtils.js'

export function drawGrid(ctx, width, height, stylePreset = 'parchment') {
  ctx.save()
  const paper = ctx.createLinearGradient(0, 0, width, height)
  if (stylePreset === 'ink') {
    paper.addColorStop(0, '#f7f4eb')
    paper.addColorStop(0.48, '#e6e0d2')
    paper.addColorStop(1, '#c8c0ae')
  } else if (stylePreset === 'atlas') {
    paper.addColorStop(0, '#dbe6de')
    paper.addColorStop(0.46, '#c5d6cf')
    paper.addColorStop(1, '#a7bfb9')
  } else {
    paper.addColorStop(0, '#f3e8cc')
    paper.addColorStop(0.46, '#e8d7af')
    paper.addColorStop(1, '#d7bd86')
  }
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, width, height)

  ctx.globalAlpha = stylePreset === 'ink' ? 0.12 : 0.24
  for (let index = 0; index < 520; index += 1) {
    const seed = index * 97
    const x = seededNoise(seed, 1) * width
    const y = seededNoise(seed, 2) * height
    const r = 1 + seededNoise(seed, 3) * 5
    ctx.fillStyle = stylePreset === 'atlas'
      ? (seededNoise(seed, 4) > 0.5 ? '#5f8078' : '#eff8f1')
      : seededNoise(seed, 4) > 0.5 ? '#8b6a36' : '#fff7df'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.globalAlpha = 1
  ctx.strokeStyle = stylePreset === 'atlas' ? 'rgba(39, 74, 70, 0.12)' : 'rgba(73, 59, 38, 0.08)'
  ctx.lineWidth = 1
  for (let x = 0; x <= width; x += 80) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y += 80) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.15, width / 2, height / 2, width * 0.7)
  vignette.addColorStop(0, 'rgba(255,255,255,0)')
  vignette.addColorStop(1, stylePreset === 'atlas' ? 'rgba(26,67,68,0.18)' : stylePreset === 'ink' ? 'rgba(48,45,40,0.18)' : 'rgba(88,58,24,0.22)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

export function drawObject(ctx, object, selected, options = {}) {
  if (object.visible === false) return
  const meta = object.metadata || {}
  const type = OBJECT_TYPES[object.type] || OBJECT_TYPES.region

  ctx.save()
  ctx.translate(object.x, object.y)
  ctx.rotate((object.rotation || 0) * Math.PI / 180)
  ctx.globalAlpha = (object.locked ? 0.64 : 1) * (Number.isFinite(meta.opacity) ? meta.opacity : 1)
  ctx.lineWidth = selected ? Math.max(4, meta.lineThickness || 2) : meta.lineThickness || 2
  ctx.strokeStyle = selected ? '#1677ff' : meta.stroke || type.stroke
  ctx.fillStyle = meta.fill || type.fill
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (meta.dashed) ctx.setLineDash([Math.max(8, (meta.lineThickness || 4) * 2.2), Math.max(6, (meta.lineThickness || 4) * 1.4)])

  const cleanEdges = options.mapType === 'interior'

  if (object.type === 'marker' || object.type === 'stamp' || object.type === 'location') {
    drawFantasyMarker(ctx, object, selected)
  } else if (object.type === 'label') {
    drawFantasyLabel(ctx, object)
  } else if (object.type === 'river' && meta.closed) {
    cleanEdges ? drawCleanWaterMass(ctx, object, selected) : drawOrganicWaterMass(ctx, object, selected)
  } else if (LINE_OBJECT_TYPES.has(object.type)) {
    drawStyledLineObject(ctx, object, selected, { cleanEdges })
  } else if ((object.type === 'region' || meta.shapeKind === 'polygon') && objectLocalFaces(object).length) {
    cleanEdges ? drawCleanPolygonObject(ctx, object, selected) : drawOrganicPolygonObject(ctx, object, selected)
  } else if (object.type === 'shape' && meta.shapeKind === 'circle') {
    cleanEdges ? drawCleanEllipseObject(ctx, object, selected) : drawOrganicEllipseObject(ctx, object, selected)
  } else {
    cleanEdges ? drawCleanRectObject(ctx, object, selected) : drawOrganicRectObject(ctx, object, selected)
  }
  ctx.restore()
}

export function drawCleanPolygonObject(ctx, object, selected) {
  const meta = object.metadata || {}
  const faces = objectLocalFaces(object)
  if (!faces.length) return
  const fill = meta.fill || OBJECT_TYPES[object.type]?.fill || LAND_FILL
  const stroke = selected ? '#1677ff' : meta.stroke || '#5e4a28'

  ctx.save()
  if (fill !== 'transparent') {
    ctx.fillStyle = colorWithAlpha(fill, object.type === 'region' ? 0.34 : 0.72)
    faces.forEach(points => {
      drawStraightPath(ctx, points, true)
      ctx.fill()
    })
  }
  ctx.strokeStyle = colorWithAlpha(stroke, selected ? 1 : 0.9)
  ctx.lineWidth = selected ? Math.max(4, meta.lineThickness || 2) : Math.max(2, meta.lineThickness || 2)
  ctx.setLineDash(meta.dashed ? [10, 7] : [])
  faces.forEach(points => {
    drawStraightPath(ctx, points, true)
    ctx.stroke()
  })
  ctx.restore()
}

export function drawCleanWaterMass(ctx, object, selected) {
  const meta = object.metadata || {}
  const faces = objectLocalFaces(object)
  if (!faces.length) return
  ctx.save()
  ctx.fillStyle = colorWithAlpha(meta.fill || WATER_FILL, 0.68)
  ctx.strokeStyle = selected ? '#1677ff' : colorWithAlpha(meta.stroke || WATER_STROKE, 0.9)
  ctx.lineWidth = selected ? Math.max(4, meta.lineThickness || 3) : Math.max(2, meta.lineThickness || 3)
  faces.forEach(points => {
    drawStraightPath(ctx, points, true)
    ctx.fill()
    ctx.stroke()
  })
  ctx.restore()
}

export function drawOrganicWaterMass(ctx, object, selected) {
  const meta = object.metadata || {}
  const seed = hashString(object.id)
  const faces = objectLocalFaces(object)
  if (!faces.length) return
  const waterFaces = faces.map((face, faceIndex) => organicPoints(face, seed + faceIndex * 811, {
    closed: true,
    amplitude: Math.min(24, Math.max(8, Math.min(object.width, object.height) * 0.035)),
    spacing: Math.max(24, Math.min(58, Math.min(object.width, object.height) * 0.075)),
  }))
  const fill = meta.fill || WATER_FILL
  const stroke = selected ? '#1677ff' : meta.stroke || WATER_STROKE

  ctx.save()
  const radius = Math.max(object.width, object.height) * 0.58
  const gradient = ctx.createRadialGradient(0, 0, Math.max(4, radius * 0.08), 0, 0, Math.max(8, radius))
  gradient.addColorStop(0, colorWithAlpha('#9fe2ef', 0.76))
  gradient.addColorStop(0.5, colorWithAlpha(fill, 0.72))
  gradient.addColorStop(1, colorWithAlpha('#246b8f', 0.7))
  ctx.fillStyle = gradient
  waterFaces.forEach(points => {
    drawSmoothPath(ctx, points, true)
    ctx.fill()
  })

  ctx.strokeStyle = colorWithAlpha('#d9f7ff', selected ? 0.34 : 0.22)
  ctx.lineWidth = Math.max(1, (meta.lineThickness || 3) * 0.45)
  waterFaces.forEach(points => {
    drawSmoothPath(ctx, points, true)
    ctx.stroke()
  })

  ctx.strokeStyle = colorWithAlpha(stroke, selected ? 1 : 0.86)
  ctx.lineWidth = selected ? Math.max(4, meta.lineThickness || 3) : Math.max(2, meta.lineThickness || 3)
  waterFaces.forEach(points => {
    drawSmoothPath(ctx, points, true)
    ctx.stroke()
  })

  ctx.save()
  waterFaces.forEach(points => drawSmoothPath(ctx, points, true))
  ctx.clip()
  ctx.strokeStyle = colorWithAlpha('#e8fbff', 0.16)
  ctx.lineWidth = 1.2
  for (let index = 0; index < 26; index += 1) {
    const x = (seededNoise(seed, index + 70) - 0.5) * object.width * 0.86
    const y = (seededNoise(seed, index + 90) - 0.5) * object.height * 0.78
    const width = 24 + seededNoise(seed, index + 110) * 58
    ctx.beginPath()
    ctx.moveTo(x - width / 2, y)
    ctx.quadraticCurveTo(x, y - 7, x + width / 2, y)
    ctx.stroke()
  }
  ctx.restore()
  ctx.restore()
}

export function drawCleanEllipseObject(ctx, object, selected) {
  const meta = object.metadata || {}
  const fill = meta.fill || OBJECT_TYPES[object.type]?.fill || LAND_FILL
  const stroke = selected ? '#1677ff' : meta.stroke || '#5e4a28'
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, 0, object.width / 2, object.height / 2, 0, 0, Math.PI * 2)
  if (fill !== 'transparent') {
    ctx.fillStyle = colorWithAlpha(fill, 0.72)
    ctx.fill()
  }
  ctx.strokeStyle = colorWithAlpha(stroke, selected ? 1 : 0.9)
  ctx.lineWidth = selected ? Math.max(4, meta.lineThickness || 2) : Math.max(2, meta.lineThickness || 2)
  ctx.stroke()
  ctx.restore()
}

export function drawCleanRectObject(ctx, object, selected) {
  const points = [
    { x: -object.width / 2, y: -object.height / 2 },
    { x: object.width / 2, y: -object.height / 2 },
    { x: object.width / 2, y: object.height / 2 },
    { x: -object.width / 2, y: object.height / 2 },
  ]
  drawCleanPolygonObject(ctx, { ...object, metadata: { ...object.metadata, points: points.map(point => localToNormalized(point, object)), shapeKind: 'polygon' } }, selected)
}

export function drawStraightPath(ctx, points, closed = false) {
  if (!points.length) return
  ctx.beginPath()
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y)
    else ctx.lineTo(point.x, point.y)
  })
  if (closed) ctx.closePath()
}

export function drawOrganicPolygonObject(ctx, object, selected) {
  const meta = object.metadata || {}
  const seed = hashString(object.id)
  const faces = objectLocalFaces(object)
  if (!faces.length) return
  const organicFaces = faces.map((face, faceIndex) => organicPoints(face, seed + faceIndex * 1009, {
    closed: true,
    amplitude: Math.min(34, Math.max(10, Math.min(object.width, object.height) * 0.045)),
    spacing: Math.max(22, Math.min(62, Math.min(object.width, object.height) * 0.08)),
  }))
  const fill = meta.fill || OBJECT_TYPES[object.type]?.fill || LAND_FILL
  const stroke = selected ? '#1677ff' : meta.stroke || '#5e4a28'

  ctx.save()
  if (fill !== 'transparent') {
    ctx.fillStyle = colorWithAlpha(fill, 0.86)
    organicFaces.forEach(points => {
      drawSmoothPath(ctx, points, true)
      ctx.fill()
    })

    const radius = Math.max(object.width, object.height) * 0.62
    const gradient = ctx.createRadialGradient(0, 0, Math.min(radius * 0.5, Math.max(1, radius * 0.08)), 0, 0, Math.max(2, radius))
    gradient.addColorStop(0, colorWithAlpha(fill, 0.92))
    gradient.addColorStop(0.42, colorWithAlpha(fill, 0.72))
    gradient.addColorStop(0.78, colorWithAlpha('#5d6f3d', 0.36))
    gradient.addColorStop(1, colorWithAlpha('#d5c391', 0.18))
    ctx.fillStyle = gradient
    organicFaces.forEach(points => {
      drawSmoothPath(ctx, points, true)
      ctx.fill()
    })
    ctx.strokeStyle = colorWithAlpha(fill, 0.74)
    ctx.lineWidth = Math.max(8, (meta.lineThickness || 2) * 3)
    organicFaces.forEach(points => {
      drawSmoothPath(ctx, points, true)
      ctx.stroke()
    })
    ctx.save()
    organicFaces.forEach(points => drawSmoothPath(ctx, points, true))
    ctx.clip()
    drawInteriorTexture(ctx, object, seed)
    ctx.restore()
  }

  ctx.strokeStyle = colorWithAlpha(stroke, selected ? 1 : 0.88)
  ctx.lineWidth = selected ? Math.max(4, meta.lineThickness || 2) : Math.max(2, meta.lineThickness || 2)
  ctx.setLineDash([])
  organicFaces.forEach(points => {
    drawSmoothPath(ctx, points, true)
    ctx.stroke()
  })
  ctx.strokeStyle = colorWithAlpha('#3a2b17', selected ? 0.15 : 0.32)
  ctx.lineWidth = Math.max(1, (meta.lineThickness || 2) * 0.65)
  for (let pass = 0; pass < 2; pass += 1) {
    faces.forEach((face, faceIndex) => {
      const sketch = organicPoints(face, seed + faceIndex * 1009 + pass * 77, { closed: true, amplitude: 6 + pass * 3, spacing: 38 })
      drawSmoothPath(ctx, sketch, true)
      ctx.stroke()
    })
  }
  ctx.restore()
}

export function drawOrganicEllipseObject(ctx, object, selected) {
  const seed = hashString(object.id)
  const points = Array.from({ length: 34 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 34
    const jitter = 1 + (seededNoise(seed, index) - 0.5) * 0.11
    return { x: Math.cos(angle) * object.width * 0.5 * jitter, y: Math.sin(angle) * object.height * 0.5 * jitter }
  })
  drawOrganicPolygonObject(ctx, { ...object, metadata: { ...object.metadata, points: points.map(point => localToNormalized(point, object)), shapeKind: 'polygon' } }, selected)
}

export function drawOrganicRectObject(ctx, object, selected) {
  const points = [
    { x: -object.width / 2, y: -object.height / 2 },
    { x: object.width / 2, y: -object.height / 2 },
    { x: object.width / 2, y: object.height / 2 },
    { x: -object.width / 2, y: object.height / 2 },
  ]
  drawOrganicPolygonObject(ctx, { ...object, metadata: { ...object.metadata, points: points.map(point => localToNormalized(point, object)), shapeKind: 'polygon' } }, selected)
}

export function drawInteriorTexture(ctx, object, seed) {
  const count = Math.max(18, Math.min(120, Math.round((object.width * object.height) / 9000)))
  ctx.save()
  for (let index = 0; index < count; index += 1) {
    const x = (seededNoise(seed, index + 11) - 0.5) * object.width
    const y = (seededNoise(seed, index + 31) - 0.5) * object.height
    const len = 12 + seededNoise(seed, index + 51) * 36
    const centerFalloff = clamp(1 - Math.hypot(x / Math.max(1, object.width / 2), y / Math.max(1, object.height / 2)), 0, 1)
    const saturation = 0.04 + centerFalloff * centerFalloff * 0.2
    ctx.strokeStyle = seededNoise(seed, index + 71) > 0.5 ? `rgba(13,55,25,${saturation})` : `rgba(184,196,126,${saturation * 0.65})`
    ctx.lineWidth = 0.8 + centerFalloff * 1.4
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + len, y + (seededNoise(seed, index + 91) - 0.5) * 8)
    ctx.stroke()
  }
  const centerGlow = ctx.createRadialGradient(0, 0, 10, 0, 0, Math.max(object.width, object.height) * 0.56)
  centerGlow.addColorStop(0, 'rgba(20,86,39,0.26)')
  centerGlow.addColorStop(0.55, 'rgba(20,86,39,0.08)')
  centerGlow.addColorStop(1, 'rgba(224,205,154,0.12)')
  ctx.fillStyle = centerGlow
  ctx.fillRect(-object.width, -object.height, object.width * 2, object.height * 2)
  ctx.restore()
}

export function drawStyledLineObject(ctx, object, selected, options = {}) {
  const meta = object.metadata || {}
  const seed = hashString(object.id)
  const basePoints = objectLocalPoints(object)
  if (basePoints.length < 2) return
  const points = options.cleanEdges ? basePoints : organicPoints(basePoints, seed, {
    closed: false,
    amplitude: object.type === 'river' ? 14 : 7,
    spacing: object.type === 'river' ? 42 : 34,
  })
  const stroke = selected ? '#1677ff' : meta.stroke || OBJECT_TYPES[object.type]?.stroke || '#4a2e18'
  const thickness = Math.max(1, meta.lineThickness || 6)

  ctx.save()
  ctx.setLineDash([])
  if (object.type === 'river') {
    drawTaperedPath(ctx, points, thickness, colorWithAlpha('#183d55', 0.22), seed, 2.4)
    drawTaperedPath(ctx, points, thickness, colorWithAlpha(stroke, selected ? 0.95 : 0.72), seed, 1.35)
    drawTaperedPath(ctx, points, thickness * 0.38, colorWithAlpha('#d9f4ff', selected ? 0.5 : 0.32), seed, 0.8)
  } else {
    ctx.strokeStyle = colorWithAlpha('#2c1d11', selected ? 0.42 : 0.22)
    ctx.lineWidth = thickness + 3
    if (meta.dashed || object.type === 'border') ctx.setLineDash([thickness * 2.8, thickness * 1.7])
    options.cleanEdges ? drawStraightPath(ctx, points, false) : drawSmoothPath(ctx, points, false)
    ctx.stroke()
    ctx.strokeStyle = colorWithAlpha(stroke, selected ? 1 : 0.8)
    ctx.lineWidth = thickness
    ctx.setLineDash(meta.dashed || object.type === 'border' ? [thickness * 2.5, thickness * 1.6] : [])
    options.cleanEdges ? drawStraightPath(ctx, points, false) : drawSmoothPath(ctx, points, false)
    ctx.stroke()
    if (object.type === 'road') {
      ctx.strokeStyle = colorWithAlpha('#f3ddb5', 0.35)
      ctx.lineWidth = Math.max(1, thickness * 0.32)
      ctx.setLineDash([])
      options.cleanEdges ? drawStraightPath(ctx, points, false) : drawSmoothPath(ctx, points, false)
      ctx.stroke()
    }
  }
  ctx.restore()
}

export function drawTaperedPath(ctx, points, baseWidth, stroke, seed, scale = 1) {
  ctx.save()
  ctx.strokeStyle = stroke
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let index = 1; index < points.length; index += 1) {
    const t = index / Math.max(1, points.length - 1)
    const taper = 0.54 + Math.sin(t * Math.PI) * 0.64
    const variation = 0.86 + seededNoise(seed, index + 300) * 0.28
    ctx.lineWidth = Math.max(1, baseWidth * taper * variation * scale)
    ctx.beginPath()
    ctx.moveTo(points[index - 1].x, points[index - 1].y)
    const mid = { x: (points[index - 1].x + points[index].x) / 2, y: (points[index - 1].y + points[index].y) / 2 }
    ctx.quadraticCurveTo(mid.x, mid.y, points[index].x, points[index].y)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawFantasyMarker(ctx, object, selected) {
  const meta = object.metadata || {}
  const seed = hashString(object.id)
  const radius = Math.min(object.width, object.height) / 2
  const name = String(meta.stampType || meta.text || meta.name || '').toLowerCase()
  ctx.save()
  ctx.strokeStyle = selected ? '#1677ff' : colorWithAlpha(meta.stroke || '#3a2a16', 0.86)
  ctx.fillStyle = colorWithAlpha(meta.fill || '#8f6a33', 0.72)
  ctx.lineWidth = Math.max(2, radius * 0.08)

  if (object.type === 'stamp') {
    drawStampGlyph(ctx, object)
    ctx.restore()
    return
  }

  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.88, 0, Math.PI * 2)
  ctx.fillStyle = colorWithAlpha(meta.fill || '#8f6a33', 0.28)
  ctx.fill()
  ctx.fillStyle = colorWithAlpha(meta.fill || '#8f6a33', 0.78)

  if (object.type === 'location') {
    ctx.beginPath()
    ctx.moveTo(0, radius * 0.78)
    ctx.bezierCurveTo(radius * 0.72, radius * 0.06, radius * 0.52, -radius * 0.76, 0, -radius * 0.76)
    ctx.bezierCurveTo(-radius * 0.52, -radius * 0.76, -radius * 0.72, radius * 0.06, 0, radius * 0.78)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = colorWithAlpha('#fff8dc', 0.9)
    ctx.beginPath()
    ctx.arc(0, -radius * 0.2, radius * 0.26, 0, Math.PI * 2)
    ctx.fill()
  } else if (name.includes('forest') || name.includes('tree')) {
    const count = 5 + Math.floor(seededNoise(seed, 1) * 5)
    for (let index = 0; index < count; index += 1) {
      const x = (seededNoise(seed, index + 10) - 0.5) * radius * 1.25
      const y = (seededNoise(seed, index + 20) - 0.5) * radius * 1.05
      const h = radius * (0.52 + seededNoise(seed, index + 30) * 0.34)
      ctx.beginPath()
      ctx.moveTo(x, y - h * 0.55)
      ctx.lineTo(x - h * 0.34, y + h * 0.35)
      ctx.lineTo(x + h * 0.34, y + h * 0.35)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  } else if (name.includes('mount') || name.includes('peak')) {
    const count = 3 + Math.floor(seededNoise(seed, 2) * 3)
    for (let index = 0; index < count; index += 1) {
      const x = (index - (count - 1) / 2) * radius * 0.38
      const h = radius * (0.82 + seededNoise(seed, index + 40) * 0.46)
      ctx.beginPath()
      ctx.moveTo(x, -h * 0.62)
      ctx.lineTo(x - h * 0.45, h * 0.48)
      ctx.lineTo(x + h * 0.5, h * 0.48)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = colorWithAlpha('#fff6db', 0.56)
      ctx.beginPath()
      ctx.moveTo(x, -h * 0.52)
      ctx.lineTo(x - h * 0.12, -h * 0.12)
      ctx.lineTo(x + h * 0.11, -h * 0.16)
      ctx.stroke()
      ctx.strokeStyle = selected ? '#1677ff' : colorWithAlpha(meta.stroke || '#3a2a16', 0.86)
    }
  } else if (name.includes('castle')) {
    const w = radius * 1.35
    const h = radius * 1.18
    ctx.fillRect(-w / 2, -h * 0.18, w, h * 0.72)
    ctx.strokeRect(-w / 2, -h * 0.18, w, h * 0.72)
    ;[-0.42, 0, 0.42].forEach(offset => {
      const x = offset * w
      ctx.fillRect(x - radius * 0.16, -h * 0.58, radius * 0.32, h * 0.42)
      ctx.strokeRect(x - radius * 0.16, -h * 0.58, radius * 0.32, h * 0.42)
    })
  } else if (name.includes('ruin')) {
    for (let index = 0; index < 5; index += 1) {
      const x = -radius * 0.6 + index * radius * 0.3
      const h = radius * (0.42 + seededNoise(seed, index + 101) * 0.58)
      ctx.fillRect(x, radius * 0.48 - h, radius * 0.18, h)
      ctx.strokeRect(x, radius * 0.48 - h, radius * 0.18, h)
    }
  } else if (name.includes('city') || name.includes('capital') || name.includes('town') || name.includes('kingdom')) {
    const buildings = name.includes('town') ? 3 : 5
    for (let index = 0; index < buildings; index += 1) {
      const w = radius * (0.22 + seededNoise(seed, index + 201) * 0.12)
      const h = radius * (0.42 + seededNoise(seed, index + 211) * 0.5)
      const x = (index - (buildings - 1) / 2) * radius * 0.28
      ctx.fillRect(x - w / 2, radius * 0.5 - h, w, h)
      ctx.strokeRect(x - w / 2, radius * 0.5 - h, w, h)
    }
    if (name.includes('capital') || name.includes('kingdom')) {
      ctx.beginPath()
      ctx.moveTo(0, -radius * 0.76)
      for (let index = 0; index < 5; index += 1) {
        const angle = -Math.PI / 2 + index * Math.PI * 0.4
        const r = index % 2 ? radius * 0.34 : radius * 0.62
        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r - radius * 0.1)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  } else if (name.includes('wall')) {
    const brickH = radius * 0.28
    for (let row = 0; row < 3; row += 1) {
      const offset = row % 2 ? radius * 0.24 : 0
      for (let col = -2; col <= 1; col += 1) {
        ctx.strokeRect(col * radius * 0.48 + offset, -radius * 0.45 + row * brickH, radius * 0.46, brickH)
      }
    }
  } else if (name.includes('door')) {
    ctx.fillRect(-radius * 0.38, -radius * 0.62, radius * 0.76, radius * 1.24)
    ctx.strokeRect(-radius * 0.38, -radius * 0.62, radius * 0.76, radius * 1.24)
    ctx.beginPath()
    ctx.arc(radius * 0.18, 0, radius * 0.06, 0, Math.PI * 2)
    ctx.fillStyle = '#f7d27c'
    ctx.fill()
  } else if (name.includes('table') || name.includes('bed') || name.includes('container')) {
    ctx.beginPath()
    ctx.roundRect(-radius * 0.68, -radius * 0.42, radius * 1.36, radius * 0.84, radius * 0.12)
    ctx.fill()
    ctx.stroke()
    if (name.includes('container')) {
      ctx.beginPath()
      ctx.moveTo(-radius * 0.68, -radius * 0.08)
      ctx.lineTo(radius * 0.68, -radius * 0.08)
      ctx.stroke()
    }
  } else if (name.includes('chair')) {
    ctx.strokeRect(-radius * 0.35, -radius * 0.1, radius * 0.7, radius * 0.52)
    ctx.beginPath()
    ctx.moveTo(-radius * 0.35, -radius * 0.1)
    ctx.lineTo(-radius * 0.35, -radius * 0.62)
    ctx.lineTo(radius * 0.35, -radius * 0.62)
    ctx.lineTo(radius * 0.35, -radius * 0.1)
    ctx.stroke()
  } else if (name.includes('fire')) {
    ctx.beginPath()
    ctx.moveTo(0, -radius * 0.62)
    ctx.quadraticCurveTo(radius * 0.55, -radius * 0.05, radius * 0.18, radius * 0.5)
    ctx.quadraticCurveTo(0, radius * 0.72, -radius * 0.24, radius * 0.5)
    ctx.quadraticCurveTo(-radius * 0.58, -radius * 0.08, 0, -radius * 0.62)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fff8dc'
    ctx.font = `700 ${Math.max(18, radius * 0.62)}px Georgia, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((meta.text || meta.name || '•').slice(0, 2), 0, 1)
  }
  ctx.restore()
}

export function drawStampGlyph(ctx, object) {
  const meta = object.metadata || {}
  const radius = Math.min(object.width, object.height) / 2
  const libraryStamp = STAMP_LIBRARY.find(stamp => stamp.id === meta.stampId || stamp.name === meta.stampType || stamp.name === meta.name)
  drawStampSymbol(ctx, {
    id: meta.stampId || libraryStamp?.id,
    name: meta.stampType || meta.name || libraryStamp?.name,
    icon: meta.icon || libraryStamp?.icon || OBJECT_TYPES.stamp.icon,
    assetSrc: meta.assetSrc || libraryStamp?.assetSrc,
    renderWidth: object.width,
    renderHeight: object.height,
    fill: meta.fill || libraryStamp?.fill || OBJECT_TYPES.stamp.fill,
    stroke: meta.stroke || libraryStamp?.stroke || OBJECT_TYPES.stamp.stroke,
  }, radius)
}

export function drawStampSymbol(ctx, stamp, radius) {
  const id = String(stamp?.id || stamp?.name || '').toLowerCase()
  if (stamp?.assetSrc) {
    const asset = loadStampAsset(stamp.assetSrc)
    if (asset?.loaded) {
      const width = stamp.renderWidth || radius * 2.05
      const height = stamp.renderHeight || radius * 2.05
      ctx.drawImage(asset.image, -width / 2, -height / 2, width, height)
      return
    }
    if (asset && !asset.failed) return
  }
  const fill = stamp?.fill || OBJECT_TYPES.stamp.fill
  const stroke = stamp?.stroke || OBJECT_TYPES.stamp.stroke
  const seed = hashString(stamp?.id || stamp?.name || 'stamp')
  const silhouette = colorWithAlpha(fill, 0.96)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = colorWithAlpha(stroke, 0.9)
  ctx.fillStyle = silhouette
  ctx.lineWidth = Math.max(2, radius * 0.08)

  function baseline(width = 1.32, y = 0.56) {
    ctx.beginPath()
    ctx.moveTo(-radius * width / 2, radius * y)
    ctx.lineTo(radius * width / 2, radius * y)
    ctx.stroke()
  }

  function rect(x, y, width, height) {
    ctx.fillRect(radius * x, radius * y, radius * width, radius * height)
    ctx.strokeRect(radius * x, radius * y, radius * width, radius * height)
  }

  function crenellations(x, y, width, count, height = 0.12) {
    const gap = width / count
    for (let index = 0; index < count; index += 1) {
      if (index % 2 === 0) rect(x + index * gap, y, gap * 0.78, height)
    }
  }

  function gableHouse(x, y, width, height, roofHeight = 0.24) {
    rect(x, y, width, height)
    ctx.beginPath()
    ctx.moveTo(radius * x, radius * y)
    ctx.lineTo(radius * (x + width / 2), radius * (y - roofHeight))
    ctx.lineTo(radius * (x + width), radius * y)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  function pine(x, scale = 1) {
    const trunkY = 0.56
    rect(x - 0.035 * scale, 0.22 * scale, 0.07 * scale, 0.34 * scale)
    ;[
      { y: -0.58, w: 0.32 },
      { y: -0.28, w: 0.44 },
      { y: 0.02, w: 0.54 },
    ].forEach(layer => {
      ctx.beginPath()
      ctx.moveTo(radius * x, radius * layer.y * scale)
      ctx.lineTo(radius * (x - layer.w * scale), radius * (layer.y + 0.42) * scale)
      ctx.lineTo(radius * (x + layer.w * scale), radius * (layer.y + 0.42) * scale)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
    ctx.beginPath()
    ctx.moveTo(radius * x, radius * trunkY * scale)
    ctx.lineTo(radius * x, radius * (trunkY + 0.02) * scale)
    ctx.stroke()
  }

  if (id === 'capital' || id === 'kingdom') {
    ctx.beginPath()
    ctx.moveTo(-radius * 0.62, -radius * 0.28)
    ctx.lineTo(-radius * 0.34, radius * 0.2)
    ctx.lineTo(-radius * 0.12, -radius * 0.14)
    ctx.lineTo(radius * 0.08, radius * 0.22)
    ctx.lineTo(radius * 0.34, -radius * 0.16)
    ctx.lineTo(radius * 0.6, -radius * 0.28)
    ctx.lineTo(radius * 0.46, radius * 0.48)
    ctx.lineTo(-radius * 0.48, radius * 0.48)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ;[-0.62, -0.28, 0, 0.34, 0.6].forEach((x, index) => {
      ctx.beginPath()
      ctx.arc(radius * x, index === 2 ? -radius * 0.43 : -radius * 0.32, radius * 0.06, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    })
    ctx.fillStyle = colorWithAlpha('#f8efd8', 0.9)
    ctx.beginPath()
    ctx.moveTo(-radius * 0.08, -radius * 0.02)
    ctx.lineTo(radius * 0.04, -radius * 0.22)
    ctx.lineTo(radius * 0.16, -radius * 0.02)
    ctx.lineTo(radius * 0.04, radius * 0.18)
    ctx.closePath()
    ctx.fill()
    baseline(1.02, 0.58)
  } else if (id === 'city') {
    const towers = [
      { x: -0.48, y: -0.06, w: 0.18, h: 0.58, roof: 'spire' },
      { x: -0.26, y: -0.34, w: 0.2, h: 0.86, roof: 'dome' },
      { x: 0, y: -0.52, w: 0.24, h: 1.04, roof: 'flag' },
      { x: 0.28, y: -0.2, w: 0.2, h: 0.72, roof: 'dome' },
      { x: 0.5, y: -0.02, w: 0.17, h: 0.54, roof: 'spire' },
    ]
    towers.forEach(tower => {
      rect(tower.x - tower.w / 2, tower.y, tower.w, tower.h)
      if (tower.roof === 'spire') {
        ctx.beginPath()
        ctx.moveTo(radius * (tower.x - tower.w / 2), radius * tower.y)
        ctx.lineTo(radius * tower.x, radius * (tower.y - 0.24))
        ctx.lineTo(radius * (tower.x + tower.w / 2), radius * tower.y)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      } else if (tower.roof === 'dome') {
        ctx.beginPath()
        ctx.arc(radius * tower.x, radius * tower.y, radius * tower.w * 0.54, Math.PI, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.moveTo(radius * tower.x, radius * tower.y)
        ctx.lineTo(radius * tower.x, -radius * 0.74)
        ctx.lineTo(radius * (tower.x + 0.2), -radius * 0.68)
        ctx.lineTo(radius * tower.x, -radius * 0.61)
        ctx.stroke()
        ctx.fill()
      }
      ctx.fillStyle = colorWithAlpha('#f8efd8', 0.85)
      rect(tower.x - 0.04, tower.y + tower.h * 0.34, 0.08, 0.12)
      ctx.fillStyle = silhouette
    })
    baseline(1.36, 0.56)
  } else if (id === 'village' || id === 'town' || id === 'building') {
    gableHouse(-0.58, -0.02, 0.34, 0.5)
    gableHouse(-0.18, -0.25, 0.4, 0.76, 0.3)
    gableHouse(0.3, 0.08, 0.34, 0.44, 0.22)
    pine(0.72, 0.72)
    ctx.fillStyle = colorWithAlpha('#f8efd8', 0.9)
    rect(-0.47, 0.2, 0.08, 0.14)
    rect(-0.03, -0.02, 0.08, 0.15)
    rect(0.42, 0.24, 0.08, 0.12)
    ctx.fillStyle = silhouette
    baseline(1.5, 0.58)
  } else if (id === 'castle') {
    rect(-0.58, -0.08, 1.16, 0.6)
    rect(-0.72, -0.44, 0.28, 0.96)
    rect(0.44, -0.44, 0.28, 0.96)
    rect(-0.18, -0.58, 0.36, 1.1)
    crenellations(-0.72, -0.56, 0.28, 3)
    crenellations(0.44, -0.56, 0.28, 3)
    crenellations(-0.58, -0.2, 1.16, 7)
    crenellations(-0.18, -0.7, 0.36, 3)
    ctx.fillStyle = colorWithAlpha('#f8efd8', 0.9)
    ctx.beginPath()
    ctx.arc(0, radius * 0.52, radius * 0.16, Math.PI, Math.PI * 2)
    ctx.lineTo(radius * 0.16, radius * 0.52)
    ctx.lineTo(-radius * 0.16, radius * 0.52)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = silhouette
    baseline(1.56, 0.58)
  } else if (id === 'fortress') {
    rect(-0.62, -0.28, 0.28, 0.8)
    rect(0.34, -0.28, 0.28, 0.8)
    rect(-0.32, -0.02, 0.64, 0.54)
    rect(-0.18, -0.5, 0.36, 1.02)
    crenellations(-0.62, -0.42, 0.28, 3)
    crenellations(0.34, -0.42, 0.28, 3)
    crenellations(-0.32, -0.15, 0.64, 5)
    crenellations(-0.18, -0.64, 0.36, 3)
    ctx.beginPath()
    ctx.moveTo(0, -radius * 0.64)
    ctx.lineTo(0, -radius * 0.9)
    ctx.lineTo(radius * 0.22, -radius * 0.84)
    ctx.lineTo(0, -radius * 0.78)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = colorWithAlpha('#f8efd8', 0.88)
    rect(-0.1, 0.24, 0.2, 0.28)
    ctx.fillStyle = silhouette
    baseline(1.48, 0.58)
  } else if (id === 'harbor') {
    ctx.lineWidth = Math.max(3, radius * 0.1)
    ctx.beginPath()
    ctx.moveTo(0, -radius * 0.54)
    ctx.lineTo(0, radius * 0.34)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, -radius * 0.68, radius * 0.16, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-radius * 0.26, -radius * 0.28)
    ctx.lineTo(radius * 0.26, -radius * 0.28)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-radius * 0.48, 0)
    ctx.quadraticCurveTo(-radius * 0.36, radius * 0.5, 0, radius * 0.5)
    ctx.quadraticCurveTo(radius * 0.36, radius * 0.5, radius * 0.48, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-radius * 0.48, 0)
    ctx.lineTo(-radius * 0.32, radius * 0.12)
    ctx.lineTo(-radius * 0.34, -radius * 0.12)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(radius * 0.48, 0)
    ctx.lineTo(radius * 0.32, radius * 0.12)
    ctx.lineTo(radius * 0.34, -radius * 0.12)
    ctx.closePath()
    ctx.fill()
    ctx.lineWidth = Math.max(2, radius * 0.06)
    ;[-0.36, 0, 0.36].forEach(offset => {
      ctx.beginPath()
      ctx.moveTo(radius * (offset - 0.18), radius * 0.64)
      ctx.quadraticCurveTo(radius * offset, radius * 0.52, radius * (offset + 0.18), radius * 0.64)
      ctx.stroke()
    })
  } else if (id === 'forest' || id === 'trees') {
    const count = id === 'forest' ? 7 : 4
    for (let index = 0; index < count; index += 1) {
      const x = (seededNoise(seed, index + 10) - 0.5) * radius * 1.35
      const y = (seededNoise(seed, index + 20) - 0.5) * radius * 1.02
      const h = radius * (0.46 + seededNoise(seed, index + 30) * 0.34)
      ctx.beginPath()
      ctx.moveTo(x, y - h * 0.58)
      ctx.lineTo(x - h * 0.34, y + h * 0.34)
      ctx.lineTo(x + h * 0.34, y + h * 0.34)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x, y + h * 0.34)
      ctx.lineTo(x, y + h * 0.54)
      ctx.stroke()
    }
    baseline(1.36, 0.64)
  } else if (id === 'mountains') {
    const peaks = [
      { x: -0.34, h: 1.26, w: 0.78 },
      { x: 0.22, h: 1.05, w: 0.68 },
      { x: 0.02, h: 0.78, w: 0.48 },
    ]
    peaks.forEach(peak => {
      const x = peak.x * radius
      const h = peak.h * radius
      const w = peak.w * radius
      ctx.beginPath()
      ctx.moveTo(x, -h * 0.52)
      ctx.lineTo(x - w * 0.5, h * 0.42)
      ctx.lineTo(x + w * 0.5, h * 0.42)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = colorWithAlpha('#fff6db', 0.56)
      ctx.beginPath()
      ctx.moveTo(x, -h * 0.43)
      ctx.lineTo(x - w * 0.11, -h * 0.12)
      ctx.lineTo(x + w * 0.12, -h * 0.15)
      ctx.stroke()
      ctx.strokeStyle = colorWithAlpha(stroke, 0.9)
    })
    baseline(1.34, 0.56)
  } else if (id === 'ruins') {
    rect(-0.62, -0.42, 0.14, 0.96)
    rect(-0.44, -0.36, 0.12, 0.9)
    rect(0.24, -0.2, 0.14, 0.74)
    rect(0.44, -0.28, 0.12, 0.82)
    ctx.beginPath()
    ctx.arc(0, radius * 0.54, radius * 0.36, Math.PI, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = Math.max(5, radius * 0.14)
    ctx.beginPath()
    ctx.moveTo(-radius * 0.44, radius * 0.54)
    ctx.lineTo(-radius * 0.22, radius * 0.08)
    ctx.quadraticCurveTo(0, -radius * 0.2, radius * 0.26, radius * 0.04)
    ctx.lineTo(radius * 0.48, radius * 0.54)
    ctx.stroke()
    ctx.lineWidth = Math.max(2, radius * 0.08)
    baseline(1.38, 0.58)
  } else if (id === 'landmark') {
    ctx.beginPath()
    ctx.moveTo(0, -radius * 0.78)
    ctx.lineTo(radius * 0.22, -radius * 0.58)
    ctx.lineTo(radius * 0.14, radius * 0.44)
    ctx.lineTo(-radius * 0.14, radius * 0.44)
    ctx.lineTo(-radius * 0.22, -radius * 0.58)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = colorWithAlpha('#f8efd8', 0.9)
    ctx.beginPath()
    ctx.moveTo(-radius * 0.05, -radius * 0.58)
    ctx.lineTo(radius * 0.08, -radius * 0.68)
    ctx.lineTo(radius * 0.02, -radius * 0.2)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = silhouette
    rect(-0.28, 0.44, 0.56, 0.1)
    baseline(0.86, 0.62)
  } else if (id === 'cave') {
    ctx.beginPath()
    ctx.moveTo(-radius * 0.76, radius * 0.54)
    ctx.lineTo(-radius * 0.54, radius * 0.02)
    ctx.lineTo(-radius * 0.34, -radius * 0.36)
    ctx.lineTo(0, -radius * 0.58)
    ctx.lineTo(radius * 0.34, -radius * 0.42)
    ctx.lineTo(radius * 0.58, -radius * 0.04)
    ctx.lineTo(radius * 0.78, radius * 0.54)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = colorWithAlpha('#f8efd8', 0.9)
    ctx.beginPath()
    ctx.moveTo(-radius * 0.34, radius * 0.54)
    ctx.quadraticCurveTo(0, -radius * 0.24, radius * 0.34, radius * 0.54)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = silhouette
    baseline(1.54, 0.62)
  } else if (id === 'mine') {
    ctx.lineWidth = Math.max(4, radius * 0.12)
    ctx.beginPath()
    ctx.moveTo(-radius * 0.44, radius * 0.52)
    ctx.lineTo(radius * 0.44, -radius * 0.46)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-radius * 0.48, -radius * 0.48)
    ctx.quadraticCurveTo(radius * 0.1, -radius * 0.78, radius * 0.56, -radius * 0.56)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-radius * 0.48, -radius * 0.48)
    ctx.lineTo(-radius * 0.36, -radius * 0.22)
    ctx.moveTo(radius * 0.56, -radius * 0.56)
    ctx.lineTo(radius * 0.34, -radius * 0.38)
    ctx.stroke()
    ctx.lineWidth = Math.max(2, radius * 0.08)
    ctx.beginPath()
    ctx.moveTo(-radius * 0.66, radius * 0.56)
    ctx.lineTo(-radius * 0.36, radius * 0.28)
    ctx.lineTo(-radius * 0.08, radius * 0.56)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    baseline(1.32, 0.62)
  } else if (id === 'temple') {
    ctx.beginPath()
    ctx.moveTo(-radius * 0.62, -radius * 0.36)
    ctx.lineTo(0, -radius * 0.66)
    ctx.lineTo(radius * 0.62, -radius * 0.36)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    rect(-0.72, 0.42, 1.44, 0.12)
    rect(-0.6, 0.28, 1.2, 0.12)
    ;[-0.44, -0.16, 0.16, 0.44].forEach(x => rect(x - 0.06, -0.32, 0.12, 0.6))
    baseline(1.52, 0.62)
  } else if (id === 'battlefield') {
    ctx.lineWidth = Math.max(5, radius * 0.13)
    ctx.beginPath()
    ctx.moveTo(-radius * 0.54, radius * 0.5)
    ctx.lineTo(radius * 0.44, -radius * 0.62)
    ctx.moveTo(radius * 0.54, radius * 0.5)
    ctx.lineTo(-radius * 0.44, -radius * 0.62)
    ctx.stroke()
    ctx.lineWidth = Math.max(3, radius * 0.08)
    ctx.beginPath()
    ctx.moveTo(radius * 0.44, -radius * 0.62)
    ctx.lineTo(radius * 0.18, -radius * 0.52)
    ctx.lineTo(radius * 0.36, -radius * 0.36)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-radius * 0.44, -radius * 0.62)
    ctx.lineTo(-radius * 0.18, -radius * 0.52)
    ctx.lineTo(-radius * 0.36, -radius * 0.36)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    baseline(1.18, 0.62)
  } else if (id === 'portal') {
    ctx.lineWidth = Math.max(5, radius * 0.13)
    ctx.beginPath()
    ctx.arc(0, radius * 0.48, radius * 0.5, Math.PI, Math.PI * 2)
    ctx.lineTo(radius * 0.5, radius * 0.48)
    ctx.moveTo(-radius * 0.5, radius * 0.48)
    ctx.lineTo(-radius * 0.5, radius * 0.58)
    ctx.moveTo(radius * 0.5, radius * 0.48)
    ctx.lineTo(radius * 0.5, radius * 0.58)
    ctx.stroke()
    ctx.lineWidth = Math.max(2, radius * 0.07)
    for (let index = 0; index < 3; index += 1) {
      ctx.beginPath()
      ctx.arc(0, radius * 0.14, radius * (0.1 + index * 0.12), index * 0.6, Math.PI * 1.5 + index * 0.8)
      ctx.stroke()
    }
    baseline(1.12, 0.66)
  } else if (id === 'magic-source' || id === 'magic source') {
    ctx.beginPath()
    ctx.moveTo(0, -radius * 0.72)
    ctx.lineTo(radius * 0.26, -radius * 0.28)
    ctx.lineTo(radius * 0.18, radius * 0.48)
    ctx.lineTo(0, radius * 0.68)
    ctx.lineTo(-radius * 0.18, radius * 0.48)
    ctx.lineTo(-radius * 0.26, -radius * 0.28)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = colorWithAlpha('#f8efd8', 0.86)
    ctx.beginPath()
    ctx.moveTo(0, -radius * 0.6)
    ctx.lineTo(radius * 0.12, -radius * 0.28)
    ctx.lineTo(0, -radius * 0.06)
    ctx.lineTo(-radius * 0.1, -radius * 0.26)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = silhouette
    ;[
      [-0.58, -0.3], [0.56, -0.28], [-0.52, 0.24], [0.48, 0.26],
    ].forEach(([x, y]) => {
      ctx.beginPath()
      ctx.moveTo(radius * x, radius * (y - 0.12))
      ctx.lineTo(radius * (x + 0.05), radius * (y - 0.02))
      ctx.lineTo(radius * (x + 0.16), radius * y)
      ctx.lineTo(radius * (x + 0.05), radius * (y + 0.04))
      ctx.lineTo(radius * x, radius * (y + 0.14))
      ctx.lineTo(radius * (x - 0.05), radius * (y + 0.04))
      ctx.lineTo(radius * (x - 0.16), radius * y)
      ctx.lineTo(radius * (x - 0.05), radius * (y - 0.02))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
  } else {
    const icon = stamp?.icon || OBJECT_TYPES.stamp.icon
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${Math.max(18, radius * 1.28)}px Georgia, serif`
    ctx.strokeText(icon, 0, 1)
    ctx.fillText(icon, 0, 1)
  }
  ctx.restore()
}

export function drawFantasyLabel(ctx, object) {
  const meta = object.metadata || {}
  const text = meta.text || meta.name || 'Label'
  const size = Math.max(10, Math.min(144, meta.fontSize || object.height * 0.45))
  const curve = meta.curvedLabel ? Math.min(24, object.width * 0.055) : 0
  ctx.save()
  ctx.font = `700 ${size}px Georgia, serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const measuredWidth = Math.max(1, ctx.measureText(text).width)
  const scale = Math.min(1, Math.max(0.34, (object.width - 12) / measuredWidth))
  ctx.save()
  ctx.fillStyle = colorWithAlpha(meta.stroke || '#f8edd0', 0.58)
  ctx.strokeStyle = colorWithAlpha(meta.fill || '#2a241b', 0.2)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(-object.width / 2, -object.height / 2, object.width, object.height, 8)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  ctx.scale(scale, 1)
  const totalWidth = measuredWidth
  let cursor = -totalWidth / 2
  ;[...text].forEach((char, index, chars) => {
    const charWidth = ctx.measureText(char).width
    const x = cursor + charWidth / 2
    const t = chars.length <= 1 ? 0.5 : index / (chars.length - 1)
    const y = Math.sin((t - 0.5) * Math.PI) * curve
    const angle = meta.curvedLabel ? Math.cos((t - 0.5) * Math.PI) * 0.08 : 0
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.strokeStyle = colorWithAlpha(meta.stroke || '#f8edd0', 0.78)
    ctx.lineWidth = Math.max(4, size * 0.14)
    ctx.strokeText(char, 0, 0)
    ctx.fillStyle = colorWithAlpha(meta.fill || '#2a241b', 0.92)
    ctx.fillText(char, 0, 0)
    ctx.restore()
    cursor += charWidth
  })
  ctx.restore()
}

export function drawHoverHighlight(ctx, object, zoom) {
  if (!object) return
  const corners = objectCorners(object)
  ctx.save()
  ctx.strokeStyle = HOVER_STROKE
  ctx.lineWidth = Math.max(2 / zoom, 1.25)
  ctx.setLineDash([7 / zoom, 6 / zoom])
  ctx.beginPath()
  corners.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
  ctx.closePath()
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = colorWithAlpha(HOVER_STROKE, 0.1)
  ctx.beginPath()
  corners.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export function drawSelection(ctx, objects, zoom) {
  if (!objects.length) return
  const bounds = selectionBounds(objects)
  if (!bounds) return
  const handleSize = Math.max(16 / zoom, 12)
  const corners = objectCorners(bounds)

  ctx.save()
  ctx.strokeStyle = SELECTION_STROKE
  ctx.fillStyle = colorWithAlpha(SELECTION_STROKE, 0.08)
  ctx.lineWidth = Math.max(2 / zoom, 1.25)
  ctx.setLineDash([8 / zoom, 5 / zoom])
  ctx.beginPath()
  corners.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.setLineDash([])
  corners.forEach(point => {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.28)'
    ctx.shadowBlur = 5 / zoom
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = SELECTION_STROKE
    ctx.lineWidth = Math.max(2 / zoom, 1.25)
    ctx.beginPath()
    ctx.roundRect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize, Math.max(3 / zoom, 2))
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  })
  if (objects.length === 1) {
    drawPointHandles(ctx, objects[0], zoom)
    const top = corners[0]
    const topRight = corners[1]
    const rotatePoint = { x: (top.x + topRight.x) / 2, y: (top.y + topRight.y) / 2 - 46 / zoom }
    ctx.strokeStyle = SELECTION_STROKE
    ctx.lineWidth = Math.max(2 / zoom, 1.25)
    ctx.beginPath()
    ctx.moveTo((top.x + topRight.x) / 2, (top.y + topRight.y) / 2)
    ctx.lineTo(rotatePoint.x, rotatePoint.y)
    ctx.stroke()
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.28)'
    ctx.shadowBlur = 5 / zoom
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = SELECTION_STROKE
    ctx.lineWidth = Math.max(2 / zoom, 1.25)
    ctx.beginPath()
    ctx.arc(rotatePoint.x, rotatePoint.y, handleSize * 0.72, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = SELECTION_STROKE
    ctx.font = `700 ${Math.max(11 / zoom, 9)}px Georgia, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('↻', rotatePoint.x, rotatePoint.y + 0.5 / zoom)
    ctx.restore()
  }
  ctx.restore()
}

export function drawPointHandles(ctx, object, zoom) {
  const points = Array.isArray(object.metadata?.points)
    ? object.metadata.points.map(point => objectPointToMap(point, object))
    : []
  const facePoints = Array.isArray(object.metadata?.faces)
    ? object.metadata.faces.flatMap(face => face.map(point => objectPointToMap(point, object)))
    : []
  const allPoints = [...points, ...facePoints]
  if (!allPoints.length) return
  const size = Math.max(12 / zoom, 8)
  ctx.save()
  ctx.setLineDash([])
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = SELECTION_STROKE
  ctx.lineWidth = Math.max(2 / zoom, 1.25)
  allPoints.forEach(mapPoint => {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.25)'
    ctx.shadowBlur = 4 / zoom
    ctx.beginPath()
    ctx.arc(mapPoint.x, mapPoint.y, size / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  })
  ctx.restore()
}

export function cursorForHandle(handle) {
  if (!handle) return null
  if (handle.type === 'rotate') return 'grab'
  if (handle.type === 'point') return 'crosshair'
  if (handle.type !== 'resize') return null
  return {
    nw: 'nwse-resize',
    se: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
  }[handle.corner] || 'move'
}

export function hitHandle(point, selectedObjects, zoom) {
  if (selectedObjects.length !== 1) return null
  const object = selectedObjects[0]
  const pointHit = hitPointHandle(point, object, zoom)
  if (pointHit) return { type: 'point', ...pointHit }
  const corners = objectCorners(object)
  const handleRadius = Math.max(16 / zoom, 10)
  const names = ['nw', 'ne', 'se', 'sw']
  for (let index = 0; index < corners.length; index += 1) {
    if (Math.hypot(point.x - corners[index].x, point.y - corners[index].y) <= handleRadius) {
      return { type: 'resize', corner: names[index] }
    }
  }
  const topMid = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 }
  const rotatePoint = { x: topMid.x, y: topMid.y - 46 / zoom }
  if (Math.hypot(point.x - rotatePoint.x, point.y - rotatePoint.y) <= handleRadius) {
    return { type: 'rotate' }
  }
  return null
}

export function hitPointHandle(point, object, zoom) {
  const radius = Math.max(16 / zoom, 10)
  const points = Array.isArray(object.metadata?.points) ? object.metadata.points : []
  const pointIndex = points.findIndex(item => {
    const mapPoint = objectPointToMap(item, object)
    return Math.hypot(point.x - mapPoint.x, point.y - mapPoint.y) <= radius
  })
  if (pointIndex >= 0) return { pointIndex }
  const faces = Array.isArray(object.metadata?.faces) ? object.metadata.faces : []
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const nextPointIndex = faces[faceIndex].findIndex(item => {
      const mapPoint = objectPointToMap(item, object)
      return Math.hypot(point.x - mapPoint.x, point.y - mapPoint.y) <= radius
    })
    if (nextPointIndex >= 0) return { faceIndex, pointIndex: nextPointIndex }
  }
  return null
}

export function drawDraft(ctx, draft, zoom) {
  if (!draft) return
  ctx.save()
  ctx.strokeStyle = draft.stroke || '#1677ff'
  ctx.fillStyle = draft.fill && draft.fill !== 'transparent' ? colorWithAlpha(draft.fill, 0.62) : 'rgba(22, 119, 255, 0.12)'
  ctx.lineWidth = Math.max(2 / zoom, draft.lineThickness || 2)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (draft.dashed) ctx.setLineDash([16 / zoom, 10 / zoom])
  if (draft.kind === 'shape' && draft.start && draft.end) {
    const left = Math.min(draft.start.x, draft.end.x)
    const right = Math.max(draft.start.x, draft.end.x)
    const top = Math.min(draft.start.y, draft.end.y)
    const bottom = Math.max(draft.start.y, draft.end.y)
    ctx.beginPath()
    if (draft.shapeKind === 'circle') {
      ctx.ellipse((left + right) / 2, (top + bottom) / 2, Math.max(1, (right - left) / 2), Math.max(1, (bottom - top) / 2), 0, 0, Math.PI * 2)
    } else {
      ctx.rect(left, top, right - left, bottom - top)
    }
    ctx.fill()
    ctx.stroke()
  } else if (draft.points?.length) {
    ctx.beginPath()
    draft.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    if (draft.preview) ctx.lineTo(draft.preview.x, draft.preview.y)
    if (draft.closed && draft.points.length >= 3) {
      ctx.closePath()
      ctx.fill()
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#ffffff'
    draft.points.forEach(point => {
      ctx.beginPath()
      ctx.arc(point.x, point.y, Math.max(5 / zoom, 4), 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    })
  }
  ctx.restore()
}

