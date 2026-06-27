let _uidCounter = 0
export function uid(prefix = 'obj') {
  return `${prefix}_${Date.now()}_${(_uidCounter += 1)}`
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

export function round(v, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round(v * factor) / factor
}

export function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function seededNoise(seed, index) {
  const x = Math.sin(seed * 9301 + index * 49297 + 233720) * 14918731
  return x - Math.floor(x)
}

export function colorWithAlpha(hex, alpha) {
  if (!hex || hex === 'transparent') return `rgba(0,0,0,0)`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function screenToMap(clientX, clientY, viewport, view) {
  const rect = viewport.getBoundingClientRect()
  return {
    x: (clientX - rect.left - view.pan.x) / view.zoom,
    y: (clientY - rect.top - view.pan.y) / view.zoom,
  }
}

export function snapToGrid(point, gridSize, enabled) {
  if (!enabled || !gridSize) return point
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  }
}

export function getObjectBounds(object) {
  if (object.geometry?.type === 'polygon' || object.geometry?.type === 'path') {
    const pts = object.geometry.points || []
    if (!pts.length) return { x: object.x || 0, y: object.y || 0, width: 0, height: 0 }
    const xs = pts.map(p => p.x)
    const ys = pts.map(p => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
  }
  const w = object.width || 80
  const h = object.height || 80
  return { x: (object.x || 0) - w / 2, y: (object.y || 0) - h / 2, width: w, height: h }
}

export function objectContainsPoint(object, point) {
  if (object.geometry?.type === 'polygon') {
    return pointInPolygon(point, object.geometry.points || [])
  }
  if (object.geometry?.type === 'path') {
    return pointNearPath(point, object.geometry.points || [], (object.properties?.lineThickness || 8) + 12)
  }
  const w = object.width || 80
  const h = object.height || 80
  const cx = object.x || 0
  const cy = object.y || 0
  return Math.abs(point.x - cx) <= w / 2 && Math.abs(point.y - cy) <= h / 2
}

function pointInPolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if ((yi > point.y) !== (yj > point.y) && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function pointNearPath(point, path, threshold) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (len2 === 0) continue
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / len2, 0, 1)
    const nearX = a.x + t * dx
    const nearY = a.y + t * dy
    if (Math.hypot(point.x - nearX, point.y - nearY) <= threshold) return true
  }
  return false
}

export function organicPoints(points, seed, { closed = true, amplitude = 18, spacing = 40 } = {}) {
  if (points.length < 2) return points
  const result = []
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length]
    const curr = points[i]
    result.push(curr)
    const isLastOpen = !closed && i === points.length - 1
    if (!isLastOpen) {
      const dist = Math.hypot(next.x - curr.x, next.y - curr.y)
      const steps = Math.max(1, Math.floor(dist / spacing))
      for (let s = 1; s < steps; s++) {
        const t = s / steps
        const mx = curr.x + (next.x - curr.x) * t
        const my = curr.y + (next.y - curr.y) * t
        const nx = -(next.y - curr.y) / Math.max(dist, 0.001)
        const ny = (next.x - curr.x) / Math.max(dist, 0.001)
        const jitter = (seededNoise(seed, i * 100 + s) - 0.5) * 2 * amplitude
        result.push({ x: mx + nx * jitter, y: my + ny * jitter })
      }
    }
  }
  return result
}

export function drawSmoothPath(ctx, points, closed = false) {
  if (points.length < 2) return
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2
    const my = (points[i].y + points[i + 1].y) / 2
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my)
  }
  const last = points[points.length - 1]
  if (closed && points.length > 2) {
    ctx.quadraticCurveTo(last.x, last.y, (last.x + points[0].x) / 2, (last.y + points[0].y) / 2)
    ctx.closePath()
  } else {
    ctx.lineTo(last.x, last.y)
  }
}

export function normalizeObject(obj) {
  return {
    id: obj.id || uid(obj.type || 'obj'),
    type: obj.type || 'stamp',
    x: obj.x ?? 0,
    y: obj.y ?? 0,
    width: obj.width ?? 80,
    height: obj.height ?? 80,
    rotation: obj.rotation ?? 0,
    zIndex: obj.zIndex ?? 0,
    locked: Boolean(obj.locked),
    visible: obj.visible !== false,
    geometry: obj.geometry || null,
    properties: obj.properties || {},
    linkedEntity: obj.linkedEntity || null,
  }
}

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch (_) { return fallback }
}

export function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch (_) { /* storage unavailable */ }
}
