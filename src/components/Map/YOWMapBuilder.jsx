import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const MAP_W = 2560
const MAP_H = 1920
const SCHEMA_VERSION = 1
const MIN_SIZE = 18
const DEFAULT_ZOOM = 0.42
const MIN_ZOOM = 0.12
const MAX_ZOOM = 2.5
const WHEEL_ZOOM_INTENSITY = 0.0016
const DRAG_THRESHOLD_PX = 4
const DEFAULT_OBJECT_LAYER_ID = 'objects'
const LAND_FILL = '#244b2f'
const LAND_STROKE = '#162a1c'
const WATER_FILL = '#4aa7c7'
const WATER_STROKE = '#236783'

const OBJECT_TYPES = {
  marker: { label: 'Marker', icon: '•', fill: '#d6b45f', stroke: '#6f5524' },
  stamp: { label: 'Stamp', icon: '✦', fill: '#8f6a33', stroke: '#312719' },
  label: { label: 'Label', icon: 'T', fill: '#f7e7ba', stroke: '#262118' },
  location: { label: 'Location', icon: '⌖', fill: '#d6b45f', stroke: '#6f5524' },
  region: { label: 'Region', icon: '□', fill: '#7b5fb8', stroke: '#4f3a83' },
  river: { label: 'River', icon: '~', fill: 'transparent', stroke: '#3c93b8' },
  mountain: { label: 'Mountain', icon: '△', fill: 'transparent', stroke: '#77746d' },
  road: { label: 'Road', icon: '—', fill: 'transparent', stroke: '#8b6743' },
  border: { label: 'Border', icon: '⋯', fill: 'transparent', stroke: '#9b5ab8' },
  shape: { label: 'Land', icon: '▰', fill: LAND_FILL, stroke: LAND_STROKE },
}

const TOOLBAR_MODES = [
  { id: 'select', label: 'Select', icon: '↖' },
  { id: 'pan', label: 'Pan', icon: '✥' },
  { id: 'zoom', label: 'Zoom', icon: '+' },
  { id: 'region', label: 'Region', icon: '□' },
  { id: 'river', label: 'River', icon: '~' },
  { id: 'mountain', label: 'Mountain', icon: '△' },
  { id: 'road', label: 'Road', icon: '—' },
  { id: 'border', label: 'Border', icon: '⋯' },
  { id: 'shape', label: 'Land', icon: '▰' },
  { id: 'stamp', label: 'Stamp', icon: '✦' },
  { id: 'label', label: 'Label', icon: 'T' },
  { id: 'location', label: 'Location', icon: '⌖' },
]

const POINT_DRAW_TOOLS = new Set(['region', 'river', 'mountain', 'road', 'border'])
const LINE_OBJECT_TYPES = new Set(['river', 'mountain', 'road', 'border'])
const CONTENT_OBJECT_TYPES = new Set(['marker', 'stamp', 'label', 'location'])
const SNAP_SIZES = [20, 40, 80]

const STYLE_PRESET_OPTIONS = [
  { value: 'parchment', label: 'Parchment' },
  { value: 'ink', label: 'Ink' },
  { value: 'atlas', label: 'Atlas' },
]

const MAP_TYPE_OPTIONS = [
  { value: 'world', label: 'World' },
  { value: 'region', label: 'Region' },
  { value: 'local', label: 'Local' },
  { value: 'interior', label: 'Interior' },
]

const STAMP_LIBRARY = [
  { id: 'mountains', name: 'Mountains', icon: '△', category: 'Terrain', mapTypes: ['world', 'region'], size: 116, fill: '#8a8068', stroke: '#3b3328', keywords: 'peaks range hills' },
  { id: 'forest', name: 'Forest', icon: '♠', category: 'Terrain', mapTypes: ['world', 'region', 'local'], size: 112, fill: '#40683b', stroke: '#21381f', keywords: 'woods trees woodland' },
  { id: 'trees', name: 'Trees', icon: '♠', category: 'Nature', mapTypes: ['region', 'local'], size: 74, fill: '#3f7142', stroke: '#203821', keywords: 'tree woods forest' },
  { id: 'city', name: 'City', icon: '●', category: 'Settlements', mapTypes: ['world', 'region', 'local'], size: 86, fill: '#b9854e', stroke: '#4c3320', keywords: 'settlement place urban' },
  { id: 'capital', name: 'Capital', icon: '★', category: 'Settlements', mapTypes: ['world', 'region'], size: 96, fill: '#c89a4b', stroke: '#4a2e16', keywords: 'kingdom seat city crown' },
  { id: 'town', name: 'Town', icon: '○', category: 'Settlements', mapTypes: ['region', 'local'], size: 70, fill: '#bd875a', stroke: '#4b321f', keywords: 'village settlement' },
  { id: 'building', name: 'Building', icon: '▥', category: 'Structure', mapTypes: ['local'], size: 78, fill: '#9f7650', stroke: '#3d2a1c', keywords: 'house shop neighborhood town' },
  { id: 'kingdom', name: 'Kingdom', icon: '♛', category: 'Political', mapTypes: ['world'], size: 128, fill: '#a85f61', stroke: '#4a2325', keywords: 'realm country empire' },
  { id: 'castle', name: 'Castle', icon: '▣', category: 'Landmarks', mapTypes: ['world', 'region', 'local'], size: 92, fill: '#8f8574', stroke: '#352d25', keywords: 'fort keep citadel' },
  { id: 'ruins', name: 'Ruins', icon: '⌁', category: 'Landmarks', mapTypes: ['world', 'region', 'local'], size: 86, fill: '#92745b', stroke: '#3f3026', keywords: 'ancient broken landmark' },
  { id: 'walls', name: 'Walls', icon: '▤', category: 'Structure', mapTypes: ['interior'], size: 120, fill: '#8a7b68', stroke: '#3d342b', keywords: 'room stone barrier' },
  { id: 'door', name: 'Door', icon: '▯', category: 'Structure', mapTypes: ['interior', 'local'], size: 70, fill: '#8b5a33', stroke: '#3d2414', keywords: 'entry exit gate' },
  { id: 'window', name: 'Window', icon: '▦', category: 'Structure', mapTypes: ['interior'], size: 58, fill: '#6f98a4', stroke: '#263b42', keywords: 'glass opening interior' },
  { id: 'table', name: 'Table', icon: '▭', category: 'Furniture', mapTypes: ['interior'], size: 90, fill: '#7a4f30', stroke: '#382213', keywords: 'desk furniture dining' },
  { id: 'chair', name: 'Chair', icon: '┘', category: 'Furniture', mapTypes: ['interior'], size: 58, fill: '#7b5435', stroke: '#3a2415', keywords: 'seat furniture' },
  { id: 'bed', name: 'Bed', icon: '▰', category: 'Furniture', mapTypes: ['interior'], size: 108, fill: '#926d65', stroke: '#3d2727', keywords: 'sleep furniture' },
  { id: 'container', name: 'Container', icon: '▣', category: 'Furniture', mapTypes: ['interior', 'local'], size: 66, fill: '#9a6a32', stroke: '#3e2611', keywords: 'chest crate barrel box' },
  { id: 'fireplace', name: 'Fireplace', icon: '▲', category: 'Furniture', mapTypes: ['interior'], size: 78, fill: '#a24e36', stroke: '#432018', keywords: 'hearth fire' },
]

const DEFAULT_CATEGORIES_BY_MAP_TYPE = {
  world: ['Terrain', 'Political', 'Settlements', 'Landmarks'],
  region: ['Terrain', 'Nature', 'Settlements', 'Landmarks'],
  local: ['Nature', 'Settlements', 'Landmarks', 'Structure'],
  interior: ['Structure', 'Furniture'],
}

const MAP_TYPE_TOOLSETS = {
  world: {
    label: 'World Map',
    purpose: 'Large-scale geography and realms',
    tools: [
      { id: 'landmasses', mode: 'shape', label: 'Landmasses', icon: '▰' },
      { id: 'regions', mode: 'region', label: 'Kingdoms', icon: '□' },
      { id: 'borders', mode: 'border', label: 'Borders', icon: '⋯' },
      { id: 'waters', mode: 'river', label: 'Rivers & seas', icon: '~' },
      { id: 'mountains', mode: 'mountain', label: 'Mountains', icon: '△' },
      { id: 'terrain', mode: 'stamp', label: 'Stamps', icon: '✦' },
      { id: 'cities', mode: 'location', label: 'Cities', icon: '⌖' },
      { id: 'labels', mode: 'label', label: 'Labels', icon: 'T' },
    ],
  },
  region: {
    label: 'Region Map',
    purpose: 'Kingdoms, provinces, routes, and landmarks',
    tools: [
      { id: 'provinces', mode: 'region', label: 'Provinces', icon: '□' },
      { id: 'roads', mode: 'road', label: 'Roads', icon: '—' },
      { id: 'rivers', mode: 'river', label: 'Rivers', icon: '~' },
      { id: 'mountains', mode: 'mountain', label: 'Mountains', icon: '△' },
      { id: 'towns', mode: 'location', label: 'Towns', icon: '⌖' },
      { id: 'landmarks', mode: 'stamp', label: 'Landmarks', icon: '✦' },
      { id: 'borders', mode: 'border', label: 'Borders', icon: '⋯' },
      { id: 'labels', mode: 'label', label: 'Labels', icon: 'T' },
    ],
  },
  local: {
    label: 'Local Map',
    purpose: 'Towns, islands, camps, battlefields, and neighborhoods',
    tools: [
      { id: 'buildings', mode: 'stamp', label: 'Buildings', icon: '▥' },
      { id: 'paths', mode: 'road', label: 'Paths', icon: '—' },
      { id: 'terrain-zones', mode: 'region', label: 'Terrain zones', icon: '□' },
      { id: 'landmarks', mode: 'stamp', label: 'Landmarks', icon: '✦' },
      { id: 'poi', mode: 'location', label: 'Points of interest', icon: '⌖' },
      { id: 'labels', mode: 'label', label: 'Labels', icon: 'T' },
      { id: 'decor', mode: 'stamp', label: 'Decorative stamps', icon: '✦' },
    ],
  },
  interior: {
    label: 'Interior Map',
    purpose: 'Rooms, buildings, dungeons, and interiors',
    tools: [
      { id: 'rooms', mode: 'shape', label: 'Rooms', icon: '▰' },
      { id: 'walls', mode: 'border', label: 'Walls', icon: '▤' },
      { id: 'doors', mode: 'stamp', label: 'Doors', icon: '▯' },
      { id: 'windows', mode: 'stamp', label: 'Windows', icon: '▦' },
      { id: 'furniture', mode: 'stamp', label: 'Furniture', icon: '▭' },
      { id: 'objects', mode: 'stamp', label: 'Interior objects', icon: '▣' },
      { id: 'labels', mode: 'label', label: 'Labels', icon: 'T' },
    ],
  },
}

function uid(prefix = 'obj') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`
}

function loadJson(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback
  try {
    const value = JSON.parse(localStorage.getItem(key))
    return value ?? fallback
  } catch {
    return fallback
  }
}

function saveJson(key, value) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

function normalizeMapType(value) {
  if (value === 'regional') return 'region'
  return MAP_TYPE_OPTIONS.some(option => option.value === value) ? value : 'region'
}

function objectTypeLabel(object) {
  return OBJECT_TYPES[object?.type]?.label || object?.type || 'Object'
}

function objectDisplayName(object) {
  const name = object?.metadata?.name || object?.type || 'Object'
  return object?.type === 'shape' && name === 'Shape' ? 'Land' : name
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function round(value, precision = 1) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function hashString(value) {
  let hash = 2166136261
  const input = String(value || 'map')
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededNoise(seed, salt = 0) {
  let value = (seed + salt * 374761393) >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return ((value >>> 0) / 4294967295)
}

function colorWithAlpha(color, alpha) {
  if (!color || color === 'transparent') return `rgba(0,0,0,${alpha})`
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(color)
  if (!match) return color
  const baseAlpha = match[4] ? parseInt(match[4], 16) / 255 : 1
  return `rgba(${parseInt(match[1], 16)},${parseInt(match[2], 16)},${parseInt(match[3], 16)},${round(baseAlpha * alpha, 3)})`
}

function drawSmoothPath(ctx, points, closed = false) {
  if (!points.length) return
  if (points.length < 3) {
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    points.slice(1).forEach(point => ctx.lineTo(point.x, point.y))
    if (closed) ctx.closePath()
    return
  }

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2)
  }
  const last = points[points.length - 1]
  if (closed) {
    const first = points[0]
    ctx.quadraticCurveTo(last.x, last.y, (last.x + first.x) / 2, (last.y + first.y) / 2)
    ctx.quadraticCurveTo(first.x, first.y, first.x, first.y)
    ctx.closePath()
  } else {
    ctx.lineTo(last.x, last.y)
  }
}

function resampleSegment(a, b, spacing) {
  const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
  const steps = Math.max(1, Math.ceil(distance / spacing))
  return Array.from({ length: steps }, (_, index) => {
    const t = index / steps
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  })
}

function organicPoints(points, seed, options = {}) {
  if (points.length < 2) return points
  const closed = Boolean(options.closed)
  const amplitude = options.amplitude ?? 14
  const spacing = options.spacing ?? 34
  const source = closed ? [...points, points[0]] : points
  const resampled = []

  for (let index = 1; index < source.length; index += 1) {
    const a = source[index - 1]
    const b = source[index]
    resampled.push(...resampleSegment(a, b, spacing))
  }
  if (!closed) resampled.push(points[points.length - 1])

  return resampled.map((point, index) => {
    const prev = resampled[Math.max(0, index - 1)] || point
    const next = resampled[Math.min(resampled.length - 1, index + 1)] || point
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    const normal = { x: -dy / len, y: dx / len }
    const broad = (seededNoise(seed, index) - 0.5) * amplitude
    const fine = (seededNoise(seed, index + 900) - 0.5) * amplitude * 0.42
    const taper = closed ? 1 : Math.sin(Math.PI * (index / Math.max(1, resampled.length - 1)))
    return {
      x: point.x + normal.x * (broad + fine) * Math.max(0.18, taper),
      y: point.y + normal.y * (broad + fine) * Math.max(0.18, taper),
    }
  })
}

function objectLocalPoints(object) {
  const points = object.metadata?.points
  return Array.isArray(points) ? points.map(point => normalizedToLocal(point, object)) : []
}

function objectLocalFaces(object) {
  const faces = Array.isArray(object.metadata?.faces) ? object.metadata.faces : []
  const validFaces = faces
    .filter(face => Array.isArray(face) && face.length >= 3)
    .map(face => face.map(point => normalizedToLocal(point, object)))
  const base = objectLocalPoints(object)
  if (base.length >= 3) validFaces.unshift(base)
  return validFaces
}

function defaultLayers() {
  return [{ id: DEFAULT_OBJECT_LAYER_ID, name: 'Objects', visible: true, locked: false, zIndex: 0 }]
}

function createObject(type, index = 0) {
  const base = OBJECT_TYPES[type] || OBJECT_TYPES.region
  const stagger = index * 28
  const isLine = LINE_OBJECT_TYPES.has(type)
  const isContent = CONTENT_OBJECT_TYPES.has(type)
  return {
    id: uid(type),
    type,
    x: 420 + stagger,
    y: 320 + stagger,
    width: isLine ? 360 : type === 'label' ? 260 : isContent ? 82 : type === 'shape' ? 220 : 420,
    height: isLine ? 90 : type === 'label' ? 88 : isContent ? 82 : type === 'shape' ? 160 : 260,
    rotation: 0,
    zIndex: index + 1,
    locked: false,
    visible: true,
    metadata: {
      name: base.label,
      text: type === 'label' ? 'New Label' : base.label,
      fill: base.fill,
      stroke: base.stroke,
      opacity: type === 'region' ? 0.32 : 1,
      fontSize: type === 'label' ? 34 : undefined,
      curvedLabel: type === 'label',
      lineThickness: type === 'river' ? 12 : type === 'mountain' ? 16 : type === 'road' ? 7 : type === 'border' ? 5 : 2,
      dashed: type === 'road' || type === 'border',
      shapeKind: type === 'shape' ? 'polygon' : 'rectangle',
      points: isLine ? [{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }] : null,
      layerId: DEFAULT_OBJECT_LAYER_ID,
    },
  }
}

function createStampObject(stamp, index = 0, point = null) {
  const size = stamp.size || 82
  return normalizeObject({
    id: uid('stamp'),
    type: 'stamp',
    x: point?.x ?? 420 + index * 24,
    y: point?.y ?? 320 + index * 24,
    width: size,
    height: size,
    rotation: 0,
    zIndex: index + 1,
    metadata: {
      name: stamp.name,
      text: stamp.name,
      fill: stamp.fill || OBJECT_TYPES.stamp.fill,
      stroke: stamp.stroke || OBJECT_TYPES.stamp.stroke,
      stampId: stamp.id,
      stampType: stamp.name,
      category: stamp.category,
      opacity: 1,
      lineThickness: 2,
      layerId: DEFAULT_OBJECT_LAYER_ID,
    },
  }, index)
}

function createLabelObject(index = 0, point = null) {
  return normalizeObject({
    ...createObject('label', index),
    x: point?.x ?? 440 + index * 24,
    y: point?.y ?? 340 + index * 24,
  }, index)
}

function createLocationObject(location, index = 0, point = null) {
  return normalizeObject({
    ...createObject('location', index),
    x: point?.x ?? 460 + index * 24,
    y: point?.y ?? 360 + index * 24,
    width: 96,
    height: 96,
    metadata: {
      ...createObject('location', index).metadata,
      name: location?.name || 'New Location',
      text: location?.name || 'New Location',
      locationId: location?.id || null,
      category: location?.category || 'Other',
      fill: '#d6b45f',
      stroke: '#6f5524',
    },
  }, index)
}

function normalizeObject(raw, index) {
  const fallback = createObject(raw?.type || 'region', index)
  return {
    ...fallback,
    ...raw,
    id: raw?.id || fallback.id,
    type: raw?.type || fallback.type,
    x: Number.isFinite(raw?.x) ? raw.x : fallback.x,
    y: Number.isFinite(raw?.y) ? raw.y : fallback.y,
    width: Math.max(MIN_SIZE, Number.isFinite(raw?.width) ? raw.width : fallback.width),
    height: Math.max(MIN_SIZE, Number.isFinite(raw?.height) ? raw.height : fallback.height),
    rotation: Number.isFinite(raw?.rotation) ? raw.rotation : 0,
    zIndex: Number.isFinite(raw?.zIndex) ? raw.zIndex : index,
    locked: Boolean(raw?.locked),
    visible: raw?.visible !== false,
    metadata: normalizeMetadata({ ...fallback.metadata, ...(raw?.metadata || {}) }, raw?.type || fallback.type),
  }
}

function normalizeMetadata(metadata, type) {
  const points = Array.isArray(metadata.points)
    ? metadata.points
        .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
        .map(point => ({ x: clamp(point.x, -1.5, 1.5), y: clamp(point.y, -1.5, 1.5) }))
    : metadata.points
  const faces = Array.isArray(metadata.faces)
    ? metadata.faces
        .filter(face => Array.isArray(face) && face.length >= 3)
        .map(face => face
          .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
          .map(point => ({ x: clamp(point.x, -1.5, 1.5), y: clamp(point.y, -1.5, 1.5) }))
        )
        .filter(face => face.length >= 3)
    : []
  return {
    ...metadata,
    points,
    faces,
    waterKind: metadata.waterKind || (type === 'river' && metadata.closed ? 'waterMass' : undefined),
    opacity: Number.isFinite(metadata.opacity) ? clamp(metadata.opacity, 0, 1) : 1,
    lineThickness: Math.max(1, Number.isFinite(metadata.lineThickness) ? metadata.lineThickness : LINE_OBJECT_TYPES.has(type) ? 8 : 2),
    fontSize: Number.isFinite(metadata.fontSize) ? clamp(metadata.fontSize, 10, 144) : (type === 'label' ? 34 : metadata.fontSize),
    curvedLabel: Boolean(metadata.curvedLabel),
    dashed: Boolean(metadata.dashed),
    shapeKind: metadata.shapeKind || (type === 'shape' ? 'polygon' : 'rectangle'),
  }
}

function mapSnapshot(map) {
  const normalized = normalizeMapSchema(map)
  return {
    schemaVersion: SCHEMA_VERSION,
    width: normalized.width,
    height: normalized.height,
    mapObjects: normalized.objects,
    mapLayers: normalized.layers,
    mapType: normalizeMapType(map?.mapType || map?.metadata?.mapType || 'region'),
    metadata: { ...(map?.metadata || normalized.metadata || {}) },
  }
}

function migrateLegacyObjects(map) {
  const migrated = []
  ;(map?.mapPins || []).forEach((pin, index) => {
    migrated.push(normalizeObject({
      id: pin.id,
      type: 'marker',
      x: pin.mapX || MAP_W / 2,
      y: pin.mapY || MAP_H / 2,
      width: pin.size || 82,
      height: pin.size || 82,
      zIndex: pin.objectOrder ?? index,
      metadata: {
        name: pin.name || 'Marker',
        text: pin.name || '',
        fill: pin.coreColor || '#d6b45f',
        stroke: pin.color || '#f6d986',
        locationId: pin.locationId,
        layerId: pin.layerId || DEFAULT_OBJECT_LAYER_ID,
      },
    }, migrated.length))
  })
  ;(map?.mapLabels || []).forEach((label, index) => {
    migrated.push(normalizeObject({
      id: label.id,
      type: 'label',
      x: label.mapX || MAP_W / 2,
      y: label.mapY || MAP_H / 2,
      width: Math.max(160, String(label.text || '').length * (label.size || 28) * 0.62),
      height: Math.max(64, (label.size || 28) * 2.1),
      zIndex: label.objectOrder ?? index + 100,
      metadata: {
        name: label.text || 'Label',
        text: label.text || 'Label',
        fill: label.color || '#f7e7ba',
        stroke: label.outline || '#262118',
        layerId: label.layerId || DEFAULT_OBJECT_LAYER_ID,
      },
    }, migrated.length))
  })
  ;(map?.mapRegions || []).forEach((region, index) => {
    const points = Array.isArray(region.points) ? region.points : []
    const xs = points.map(point => point.x * MAP_W)
    const ys = points.map(point => point.y * MAP_H)
    const left = xs.length ? Math.min(...xs) : (region.cx || 0.5) * MAP_W - 180
    const right = xs.length ? Math.max(...xs) : (region.cx || 0.5) * MAP_W + 180
    const top = ys.length ? Math.min(...ys) : (region.cy || 0.5) * MAP_H - 120
    const bottom = ys.length ? Math.max(...ys) : (region.cy || 0.5) * MAP_H + 120
    migrated.push(normalizeObject({
      id: region.id,
      type: 'region',
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      width: Math.max(80, right - left),
      height: Math.max(60, bottom - top),
      zIndex: region.objectOrder ?? index + 200,
      metadata: {
        name: region.name || 'Region',
        text: region.name || '',
        fill: region.fill || LAND_FILL,
        stroke: region.color || LAND_STROKE,
        locationId: region.locationId,
        layerId: region.layerId || DEFAULT_OBJECT_LAYER_ID,
      },
    }, migrated.length))
  })
  ;(map?.mapStamps || []).forEach((stamp, index) => {
    migrated.push(normalizeObject({
      id: stamp.id,
      type: 'stamp',
      x: stamp.mapX || MAP_W / 2,
      y: stamp.mapY || MAP_H / 2,
      width: stamp.size || 72,
      height: stamp.size || 72,
      zIndex: stamp.objectOrder ?? index + 300,
      metadata: {
        name: stamp.stampType || 'Stamp',
        text: stamp.stampType || '',
        fill: '#c79b5d',
        stroke: '#312719',
        stampType: stamp.stampType,
        layerId: stamp.layerId || DEFAULT_OBJECT_LAYER_ID,
      },
    }, migrated.length))
  })
  return migrated
}

function normalizeMapSchema(map) {
  const rawObjects = Array.isArray(map?.objects)
    ? map.objects
    : Array.isArray(map?.mapObjects)
      ? map.mapObjects
      : migrateLegacyObjects(map)
  const objects = rawObjects.map(normalizeObject).sort((a, b) => a.zIndex - b.zIndex)
  const rawLayers = Array.isArray(map?.layers) && map.layers.length
    ? map.layers
    : Array.isArray(map?.mapLayers) && map.mapLayers.length
      ? map.mapLayers
      : []
  const layers = rawLayers.length
    ? rawLayers.map((layer, index) => ({
        id: layer.id || uid('layer'),
        name: layer.name || `Layer ${index + 1}`,
        visible: layer.visible !== false,
        locked: Boolean(layer.locked),
        zIndex: Number.isFinite(layer.zIndex) ? layer.zIndex : index,
      }))
    : defaultLayers()
  return {
    version: SCHEMA_VERSION,
    width: Number.isFinite(map?.width) ? map.width : MAP_W,
    height: Number.isFinite(map?.height) ? map.height : MAP_H,
    objects,
    layers,
    metadata: { ...(map?.metadata || {}), migratedFromTerrain: Boolean(rawObjects.length && !map?.objects && !map?.mapObjects) },
  }
}

function exportPayload(map, schema) {
  return {
    schema: 'yow.object-map',
    version: SCHEMA_VERSION,
    id: map?.id,
    name: map?.name || 'Untitled Map',
    width: schema.width,
    height: schema.height,
    objects: schema.objects,
    layers: schema.layers,
    metadata: schema.metadata || {},
  }
}

function screenToMap(clientX, clientY, viewport, view) {
  const rect = viewport.getBoundingClientRect()
  return {
    x: (clientX - rect.left - view.pan.x) / view.zoom,
    y: (clientY - rect.top - view.pan.y) / view.zoom,
  }
}

function toLocal(point, object) {
  const angle = -(object.rotation || 0) * Math.PI / 180
  const dx = point.x - object.x
  const dy = point.y - object.y
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle),
  }
}

function localToMap(point, object) {
  const angle = (object.rotation || 0) * Math.PI / 180
  return {
    x: object.x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: object.y + point.x * Math.sin(angle) + point.y * Math.cos(angle),
  }
}

function normalizedToLocal(point, object) {
  return {
    x: point.x * object.width,
    y: point.y * object.height,
  }
}

function localToNormalized(point, object) {
  return {
    x: clamp(point.x / Math.max(1, object.width), -1.5, 1.5),
    y: clamp(point.y / Math.max(1, object.height), -1.5, 1.5),
  }
}

function objectPointToMap(point, object) {
  return localToMap(normalizedToLocal(point, object), object)
}

function pointsToObject(points, type, index, options = {}) {
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  const width = Math.max(MIN_SIZE, right - left)
  const height = Math.max(MIN_SIZE, bottom - top)
  const x = (left + right) / 2
  const y = (top + bottom) / 2
  const base = createObject(type, index)
  return normalizeObject({
    ...base,
    x,
    y,
    width,
    height,
    metadata: {
      ...base.metadata,
      ...options,
      points: points.map(point => ({
        x: clamp((point.x - x) / width, -1.5, 1.5),
        y: clamp((point.y - y) / height, -1.5, 1.5),
      })),
    },
  }, index)
}

function shapeFromRect(start, end, shapeKind, index) {
  const left = Math.min(start.x, end.x)
  const right = Math.max(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const bottom = Math.max(start.y, end.y)
  const base = createObject('shape', index)
  return normalizeObject({
    ...base,
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: Math.max(MIN_SIZE, right - left),
    height: Math.max(MIN_SIZE, bottom - top),
    metadata: {
      ...base.metadata,
      name: shapeKind === 'circle' ? 'Round Land' : 'Land',
      text: '',
      fill: LAND_FILL,
      stroke: LAND_STROKE,
      shapeKind,
    },
  }, index)
}

function moveLandToBase(object, current) {
  const minZ = Math.min(0, ...current.map(item => Number.isFinite(item.zIndex) ? item.zIndex : 0))
  return { ...object, zIndex: minZ - 1 }
}

function objectContainsPoint(object, point) {
  if (object.visible === false) return false
  const local = toLocal(point, object)
  const meta = object.metadata || {}
  if (object.type === 'river' && meta.closed && objectLocalFaces(object).length) {
    return objectLocalFaces(object).some(face => pointInPolygon(local, face))
  }
  if (LINE_OBJECT_TYPES.has(object.type) && Array.isArray(meta.points)) {
    const thickness = Math.max(12, (meta.lineThickness || 6) + 10)
    for (let index = 1; index < meta.points.length; index += 1) {
      const a = normalizedToLocal(meta.points[index - 1], object)
      const b = normalizedToLocal(meta.points[index], object)
      if (distanceToSegment(local, a, b) <= thickness) return true
    }
    return false
  }
  if ((object.type === 'region' || meta.shapeKind === 'polygon') && objectLocalFaces(object).length) {
    return objectLocalFaces(object).some(face => pointInPolygon(local, face))
  }
  if (object.type === 'shape' && meta.shapeKind === 'circle') {
    const rx = object.width / 2
    const ry = object.height / 2
    return (local.x * local.x) / Math.max(1, rx * rx) + (local.y * local.y) / Math.max(1, ry * ry) <= 1
  }
  return Math.abs(local.x) <= object.width / 2 && Math.abs(local.y) <= object.height / 2
}

function distanceToSegment(point, a, b) {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const wx = point.x - a.x
  const wy = point.y - a.y
  const lenSq = vx * vx + vy * vy || 1
  const t = clamp((wx * vx + wy * vy) / lenSq, 0, 1)
  const px = a.x + vx * t
  const py = a.y + vy * t
  return Math.hypot(point.x - px, point.y - py)
}

function pointInPolygon(local, points) {
  let inside = false
  for (let index = 0, prev = points.length - 1; index < points.length; prev = index, index += 1) {
    const a = points[index]
    const b = points[prev]
    const crosses = (a.y > local.y) !== (b.y > local.y)
      && local.x < ((b.x - a.x) * (local.y - a.y)) / Math.max(0.0001, b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

function objectCorners(object) {
  const angle = (object.rotation || 0) * Math.PI / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [
    { x: -object.width / 2, y: -object.height / 2 },
    { x: object.width / 2, y: -object.height / 2 },
    { x: object.width / 2, y: object.height / 2 },
    { x: -object.width / 2, y: object.height / 2 },
  ].map(point => ({
    x: object.x + point.x * cos - point.y * sin,
    y: object.y + point.x * sin + point.y * cos,
  }))
}

function isLandObject(object) {
  const kind = object?.metadata?.shapeKind
  return object?.type === 'region' || object?.type === 'shape' || kind === 'polygon'
}

function selectionBounds(objects) {
  if (!objects.length) return null
  const points = objects.flatMap(objectCorners)
  const left = Math.min(...points.map(point => point.x))
  const right = Math.max(...points.map(point => point.x))
  const top = Math.min(...points.map(point => point.y))
  const bottom = Math.max(...points.map(point => point.y))
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
    rotation: objects.length === 1 ? objects[0].rotation : 0,
  }
}

function drawGrid(ctx, width, height, stylePreset = 'parchment') {
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

function drawObject(ctx, object, selected, options = {}) {
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

function drawCleanPolygonObject(ctx, object, selected) {
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

function drawCleanWaterMass(ctx, object, selected) {
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

function drawOrganicWaterMass(ctx, object, selected) {
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

function drawCleanEllipseObject(ctx, object, selected) {
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

function drawCleanRectObject(ctx, object, selected) {
  const points = [
    { x: -object.width / 2, y: -object.height / 2 },
    { x: object.width / 2, y: -object.height / 2 },
    { x: object.width / 2, y: object.height / 2 },
    { x: -object.width / 2, y: object.height / 2 },
  ]
  drawCleanPolygonObject(ctx, { ...object, metadata: { ...object.metadata, points: points.map(point => localToNormalized(point, object)), shapeKind: 'polygon' } }, selected)
}

function drawStraightPath(ctx, points, closed = false) {
  if (!points.length) return
  ctx.beginPath()
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y)
    else ctx.lineTo(point.x, point.y)
  })
  if (closed) ctx.closePath()
}

function drawOrganicPolygonObject(ctx, object, selected) {
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

function drawOrganicEllipseObject(ctx, object, selected) {
  const seed = hashString(object.id)
  const points = Array.from({ length: 34 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 34
    const jitter = 1 + (seededNoise(seed, index) - 0.5) * 0.11
    return { x: Math.cos(angle) * object.width * 0.5 * jitter, y: Math.sin(angle) * object.height * 0.5 * jitter }
  })
  drawOrganicPolygonObject(ctx, { ...object, metadata: { ...object.metadata, points: points.map(point => localToNormalized(point, object)), shapeKind: 'polygon' } }, selected)
}

function drawOrganicRectObject(ctx, object, selected) {
  const points = [
    { x: -object.width / 2, y: -object.height / 2 },
    { x: object.width / 2, y: -object.height / 2 },
    { x: object.width / 2, y: object.height / 2 },
    { x: -object.width / 2, y: object.height / 2 },
  ]
  drawOrganicPolygonObject(ctx, { ...object, metadata: { ...object.metadata, points: points.map(point => localToNormalized(point, object)), shapeKind: 'polygon' } }, selected)
}

function drawInteriorTexture(ctx, object, seed) {
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

function drawStyledLineObject(ctx, object, selected, options = {}) {
  const meta = object.metadata || {}
  const seed = hashString(object.id)
  const basePoints = objectLocalPoints(object)
  if (basePoints.length < 2) return
  const points = options.cleanEdges ? basePoints : organicPoints(basePoints, seed, {
    closed: false,
    amplitude: object.type === 'mountain' ? 34 : object.type === 'river' ? 14 : 7,
    spacing: object.type === 'mountain' ? 26 : object.type === 'river' ? 42 : 34,
  })
  const stroke = selected ? '#1677ff' : meta.stroke || OBJECT_TYPES[object.type]?.stroke || '#4a2e18'
  const thickness = Math.max(1, meta.lineThickness || 6)

  ctx.save()
  ctx.setLineDash([])
  if (object.type === 'mountain') {
    drawJaggedMountainPath(ctx, points, thickness, selected ? '#1677ff' : stroke, seed)
  } else if (object.type === 'river') {
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

function drawJaggedMountainPath(ctx, points, baseWidth, stroke, seed) {
  if (points.length < 2) return
  ctx.save()
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  ctx.strokeStyle = colorWithAlpha('#2f302e', 0.24)
  ctx.lineWidth = Math.max(4, baseWidth * 0.75)
  drawStraightPath(ctx, points, false)
  ctx.stroke()

  ctx.strokeStyle = colorWithAlpha(stroke, 0.95)
  ctx.lineWidth = Math.max(2, baseWidth * 0.42)
  drawStraightPath(ctx, points, false)
  ctx.stroke()

  const tickSpacing = Math.max(18, baseWidth * 1.35)
  points.slice(1).forEach((point, index) => {
    const prev = points[index]
    const dx = point.x - prev.x
    const dy = point.y - prev.y
    const distance = Math.max(1, Math.hypot(dx, dy))
    const steps = Math.max(1, Math.floor(distance / tickSpacing))
    const nx = -dy / distance
    const ny = dx / distance
    for (let step = 1; step <= steps; step += 1) {
      const t = step / (steps + 1)
      const x = prev.x + dx * t
      const y = prev.y + dy * t
      const side = seededNoise(seed, index * 100 + step) > 0.5 ? 1 : -1
      const height = baseWidth * (0.75 + seededNoise(seed, index * 100 + step + 40) * 1.35)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + nx * height * side, y + ny * height * side)
      ctx.stroke()
    }
  })
  ctx.restore()
}

function drawTaperedPath(ctx, points, baseWidth, stroke, seed, scale = 1) {
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

function drawFantasyMarker(ctx, object, selected) {
  const meta = object.metadata || {}
  const seed = hashString(object.id)
  const radius = Math.min(object.width, object.height) / 2
  const name = String(meta.stampType || meta.text || meta.name || '').toLowerCase()
  ctx.save()
  ctx.strokeStyle = selected ? '#1677ff' : colorWithAlpha(meta.stroke || '#3a2a16', 0.86)
  ctx.fillStyle = colorWithAlpha(meta.fill || '#8f6a33', 0.72)
  ctx.lineWidth = Math.max(2, radius * 0.08)

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

function drawFantasyLabel(ctx, object) {
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

function drawSelection(ctx, objects, zoom) {
  if (!objects.length) return
  const bounds = selectionBounds(objects)
  if (!bounds) return
  const handleSize = Math.max(12 / zoom, 9)
  const corners = objectCorners(bounds)

  ctx.save()
  ctx.strokeStyle = '#1677ff'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = Math.max(1.5 / zoom, 1)
  ctx.setLineDash([8 / zoom, 5 / zoom])
  ctx.beginPath()
  corners.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
  ctx.closePath()
  ctx.stroke()
  ctx.setLineDash([])
  corners.forEach(point => {
    ctx.beginPath()
    ctx.rect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize)
    ctx.fill()
    ctx.stroke()
  })
  if (objects.length === 1) {
    drawPointHandles(ctx, objects[0], zoom)
    const top = corners[0]
    const topRight = corners[1]
    const rotatePoint = { x: (top.x + topRight.x) / 2, y: (top.y + topRight.y) / 2 - 46 / zoom }
    ctx.beginPath()
    ctx.moveTo((top.x + topRight.x) / 2, (top.y + topRight.y) / 2)
    ctx.lineTo(rotatePoint.x, rotatePoint.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(rotatePoint.x, rotatePoint.y, handleSize * 0.62, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

function drawPointHandles(ctx, object, zoom) {
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
  ctx.strokeStyle = '#1677ff'
  ctx.lineWidth = Math.max(1.5 / zoom, 1)
  allPoints.forEach(mapPoint => {
    ctx.beginPath()
    ctx.arc(mapPoint.x, mapPoint.y, size / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  })
  ctx.restore()
}

function hitHandle(point, selectedObjects, zoom) {
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

function hitPointHandle(point, object, zoom) {
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

function drawDraft(ctx, draft, zoom) {
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

export default function MapBuilder({ store }) {
  const {
    mapProject: project,
    addMap,
    selectMap,
    deleteMap,
    renameMap,
    updateActiveMapData,
    locations = [],
    saveLocation,
  } = store

  const activeMap = project?.maps?.find(map => map.id === project?.activeMapId) || null
  const canvasRef = useRef(null)
  const viewportRef = useRef(null)
  const fileInputRef = useRef(null)
  const frameRef = useRef(null)
  const interactionRef = useRef(null)
  const draftRef = useRef(null)
  const viewRef = useRef({ zoom: DEFAULT_ZOOM, pan: { x: 80, y: 80 } })
  const objectsRef = useRef([])
  const selectedIdsRef = useRef([])
  const activeMapRef = useRef(null)
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const spacePressedRef = useRef(false)

  const [mode, setMode] = useState('select')
  const [view, setView] = useState(viewRef.current)
  const [selectedIds, setSelectedIds] = useState([])
  const [historyVersion, setHistoryVersion] = useState(0)
  const [newMapName, setNewMapName] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [jsonStatus, setJsonStatus] = useState('')
  const [isCompact, setIsCompact] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 920 : false)
  const [draft, setDraft] = useState(null)
  const [shapeKind, setShapeKind] = useState('polygon')
  const [lineThickness, setLineThickness] = useState(8)
  const [dashedLines, setDashedLines] = useState(false)
  const [mapType, setMapType] = useState('region')
  const [stampSearch, setStampSearch] = useState('')
  const [stampCategory, setStampCategory] = useState('All')
  const [selectedStampId, setSelectedStampId] = useState('mountains')
  const [favoriteStamps, setFavoriteStamps] = useState(() => loadJson('yow_map_favorite_stamps', []))
  const [recentStamps, setRecentStamps] = useState(() => loadJson('yow_map_recent_stamps', []))
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapSize, setSnapSize] = useState(40)
  const [locationSearch, setLocationSearch] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [newLocationName, setNewLocationName] = useState('')

  const schema = useMemo(() => normalizeMapSchema(activeMap), [activeMap])
  const objects = schema.objects
  const visibleObjects = useMemo(() => {
    const visibleLayers = new Set(schema.layers.filter(layer => layer.visible !== false).map(layer => layer.id))
    return objects
      .filter(object => object.visible !== false && visibleLayers.has(object.metadata?.layerId || DEFAULT_OBJECT_LAYER_ID))
      .sort((a, b) => a.zIndex - b.zIndex)
  }, [objects, schema.layers])
  const selectedObjects = objects.filter(object => selectedIds.includes(object.id))
  const primarySelection = selectedObjects[0] || null
  const layerObjects = useMemo(() => [...objects].sort((a, b) => b.zIndex - a.zIndex), [objects])
  const activeMapType = normalizeMapType(activeMap?.mapType || activeMap?.metadata?.mapType || mapType || 'region')
  const activeTypeConfig = MAP_TYPE_TOOLSETS[activeMapType] || MAP_TYPE_TOOLSETS.region
  const activeStylePreset = activeMap?.metadata?.stylePreset || 'parchment'
  const activeToolIds = useMemo(() => new Set(activeTypeConfig.tools.map(tool => tool.mode)), [activeTypeConfig])
  const selectedStamp = STAMP_LIBRARY.find(stamp => stamp.id === selectedStampId) || STAMP_LIBRARY[0]
  const defaultCategories = DEFAULT_CATEGORIES_BY_MAP_TYPE[activeMapType] || DEFAULT_CATEGORIES_BY_MAP_TYPE.region
  const stampCategories = useMemo(() => {
    const categories = new Set(STAMP_LIBRARY.map(stamp => stamp.category))
    return ['All', 'Default', 'Favourites', 'Recent', ...categories]
  }, [])
  const filteredStamps = useMemo(() => {
    const query = stampSearch.trim().toLowerCase()
    return STAMP_LIBRARY.filter(stamp => {
      const allowedForMapType = stamp.mapTypes.includes(activeMapType)
      const inDefault = defaultCategories.includes(stamp.category) || stamp.mapTypes.includes(activeMapType)
      const categoryMatch = stampCategory === 'All'
        || (stampCategory === 'Default' && inDefault)
        || (stampCategory === 'Favourites' && favoriteStamps.includes(stamp.id))
        || (stampCategory === 'Recent' && recentStamps.includes(stamp.id))
        || stamp.category === stampCategory
      const searchMatch = !query || `${stamp.name} ${stamp.category} ${stamp.keywords}`.toLowerCase().includes(query)
      return allowedForMapType && categoryMatch && searchMatch
    }).sort((a, b) => {
      const aDefault = defaultCategories.includes(a.category) || a.mapTypes.includes(activeMapType)
      const bDefault = defaultCategories.includes(b.category) || b.mapTypes.includes(activeMapType)
      if (aDefault !== bDefault) return aDefault ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [activeMapType, defaultCategories, favoriteStamps, recentStamps, stampCategory, stampSearch])
  const filteredLocations = useMemo(() => {
    const query = locationSearch.trim().toLowerCase()
    return (locations || []).filter(location => !query || `${location.name || ''} ${location.category || ''}`.toLowerCase().includes(query))
  }, [locationSearch, locations])

  useEffect(() => {
    objectsRef.current = objects
    selectedIdsRef.current = selectedIds
  }, [objects, selectedIds])

  useEffect(() => {
    activeMapRef.current = activeMap
  }, [activeMap])

  useEffect(() => {
    undoStackRef.current = []
    redoStackRef.current = []
  }, [activeMap?.id])

  useEffect(() => {
    draftRef.current = draft
    requestRender()
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    viewRef.current = view
    requestRender()
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMapType(normalizeMapType(activeMap?.mapType || activeMap?.metadata?.mapType || 'region'))
      setStampCategory('Default')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [activeMap?.id, activeMap?.mapType, activeMap?.metadata?.mapType])

  useEffect(() => {
    if (!['select', 'pan', 'zoom'].includes(mode) && !activeToolIds.has(mode)) {
      const timer = window.setTimeout(() => {
        setMode('select')
        setDraft(null)
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [activeToolIds, mode])

  useEffect(() => {
    requestRender()
  }, [visibleObjects, selectedIds, activeMapType, activeStylePreset]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeMap) return
    const current = normalizeMapSchema(activeMap)
    if (activeMap.schemaVersion === SCHEMA_VERSION && Array.isArray(activeMap.mapObjects)) return
    updateActiveMapData(() => ({
      schemaVersion: SCHEMA_VERSION,
      width: current.width,
      height: current.height,
      mapObjects: current.objects,
      mapLayers: current.layers,
      mapPins: [],
      mapRegions: [],
      mapLabels: [],
      mapStamps: [],
    }))
  }, [activeMap, updateActiveMapData])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedIds(current => current.filter(id => objects.some(object => object.id === id)))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [objects])

  useEffect(() => {
    const onKeyDown = event => {
      const target = event.target
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if (typing) return
      if (event.code === 'Space') {
        spacePressedRef.current = true
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redoMapChange()
        else undoMapChange()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redoMapChange()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIdsRef.current.length) {
        event.preventDefault()
        deleteSelectedObjects()
      }
      if (event.key === 'Enter' && draftRef.current?.points?.length) {
        event.preventDefault()
        completeDraft()
      }
      if (event.key === 'Escape' && draftRef.current) {
        event.preventDefault()
        setDraft(null)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setSelectedIds(objectsRef.current.filter(object => !object.locked).map(object => object.id))
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selectedIdsRef.current.length) {
        event.preventDefault()
        duplicateSelectedObjects()
      }
    }
    const onKeyUp = event => {
      if (event.code === 'Space') spacePressedRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const resize = () => {
      setIsCompact(window.innerWidth < 920)
      fitCanvasToViewport(false)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [activeMap]) // eslint-disable-line react-hooks/exhaustive-deps

  const persistObjects = useCallback((nextObjects, extra = {}) => {
    updateActiveMapData(() => ({
      ...extra,
      schemaVersion: SCHEMA_VERSION,
      width: schema.width,
      height: schema.height,
      mapObjects: nextObjects.map(normalizeObject),
      mapLayers: schema.layers,
    }))
  }, [schema.height, schema.layers, schema.width, updateActiveMapData])

  function pushUndoSnapshot() {
    const current = activeMapRef.current
    if (!current) return
    undoStackRef.current = [...undoStackRef.current.slice(-39), mapSnapshot(current)]
    redoStackRef.current = []
    setHistoryVersion(version => version + 1)
  }

  function applyMapSnapshot(snapshot) {
    updateActiveMapData(() => ({
      schemaVersion: SCHEMA_VERSION,
      width: snapshot.width,
      height: snapshot.height,
      mapObjects: snapshot.mapObjects,
      mapLayers: snapshot.mapLayers,
      mapType: snapshot.mapType,
      metadata: snapshot.metadata,
    }))
    setSelectedIds([])
    setDraft(null)
  }

  function undoMapChange() {
    const previous = undoStackRef.current.pop()
    const current = activeMapRef.current
    if (!previous || !current) return
    redoStackRef.current = [...redoStackRef.current.slice(-39), mapSnapshot(current)]
    applyMapSnapshot(previous)
    setHistoryVersion(version => version + 1)
  }

  function redoMapChange() {
    const next = redoStackRef.current.pop()
    const current = activeMapRef.current
    if (!next || !current) return
    undoStackRef.current = [...undoStackRef.current.slice(-39), mapSnapshot(current)]
    applyMapSnapshot(next)
    setHistoryVersion(version => version + 1)
  }

  const updateObjects = useCallback((updater, extra, options = {}) => {
    const next = typeof updater === 'function' ? updater(objectsRef.current) : updater
    if (!options.skipHistory) pushUndoSnapshot()
    persistObjects(next, extra)
  }, [persistObjects])

  function requestRender() {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      renderCanvas()
    })
  }

  function renderCanvas() {
    const canvas = canvasRef.current
    const viewport = viewportRef.current
    if (!canvas || !viewport) return
    const rect = viewport.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(rect.width * dpr))
    const height = Math.max(1, Math.floor(rect.height * dpr))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = '#2d3136'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.save()
    ctx.translate(viewRef.current.pan.x, viewRef.current.pan.y)
    ctx.scale(viewRef.current.zoom, viewRef.current.zoom)
    ctx.shadowColor = 'rgba(0,0,0,.26)'
    ctx.shadowBlur = 38 / viewRef.current.zoom
    ctx.shadowOffsetY = 14 / viewRef.current.zoom
    drawGrid(ctx, MAP_W, MAP_H, activeStylePreset)
    ctx.shadowColor = 'transparent'
    visibleObjects.forEach(object => drawObject(ctx, object, selectedIdsRef.current.includes(object.id), { mapType: activeMapType, stylePreset: activeStylePreset }))
    drawDraft(ctx, draftRef.current, viewRef.current.zoom)
    drawSelection(ctx, objectsRef.current.filter(object => selectedIdsRef.current.includes(object.id)), viewRef.current.zoom)
    ctx.restore()
  }

  function fitCanvasToViewport(animate = true) {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const mapWidth = schema.width || MAP_W
    const mapHeight = schema.height || MAP_H
    const padding = Math.min(96, Math.max(32, Math.min(rect.width, rect.height) * 0.1))
    const zoom = Math.min((rect.width - padding) / mapWidth, (rect.height - padding) / mapHeight, 1)
    const nextZoom = clamp(zoom || DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM)
    const nextView = {
      zoom: nextZoom,
      pan: {
        x: (rect.width - mapWidth * nextZoom) / 2,
        y: (rect.height - mapHeight * nextZoom) / 2,
      },
    }
    setView(nextView)
    if (!animate) viewRef.current = nextView
  }

  function zoomAt(clientX, clientY, factor) {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const current = viewRef.current
    const nextZoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM)
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    const mapX = (sx - current.pan.x) / current.zoom
    const mapY = (sy - current.pan.y) / current.zoom
    setView({
      zoom: nextZoom,
      pan: { x: sx - mapX * nextZoom, y: sy - mapY * nextZoom },
    })
  }

  function zoomViewportCenter(factor) {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }

  function hitTest(point) {
    for (let index = visibleObjects.length - 1; index >= 0; index -= 1) {
      const object = visibleObjects[index]
      if (!isLandObject(object) && objectContainsPoint(object, point)) return object
    }
    for (let index = visibleObjects.length - 1; index >= 0; index -= 1) {
      const object = visibleObjects[index]
      if (isLandObject(object) && objectContainsPoint(object, point)) return object
    }
    return null
  }

  function snapPoint(point) {
    if (!snapEnabled) return point
    return {
      x: Math.round(point.x / snapSize) * snapSize,
      y: Math.round(point.y / snapSize) * snapSize,
    }
  }

  function noteStampUsed(stampId) {
    if (!stampId) return
    setRecentStamps(current => {
      const next = [stampId, ...current.filter(id => id !== stampId)].slice(0, 10)
      saveJson('yow_map_recent_stamps', next)
      return next
    })
  }

  function toggleFavoriteStamp(stampId) {
    setFavoriteStamps(current => {
      const next = current.includes(stampId) ? current.filter(id => id !== stampId) : [...current, stampId]
      saveJson('yow_map_favorite_stamps', next)
      return next
    })
  }

  function placeObjectAtPoint(object) {
    updateObjects(current => {
      const placed = object.type === 'shape' ? moveLandToBase(object, current) : object
      return [...current, placed]
    })
    setSelectedIds([object.id])
  }

  function placeStampAt(point, stamp = selectedStamp) {
    if (!stamp) return
    const object = createStampObject(stamp, objectsRef.current.length, snapPoint(point))
    placeObjectAtPoint(object)
    setSelectedStampId(stamp.id)
    noteStampUsed(stamp.id)
  }

  function placeLabelAt(point) {
    placeObjectAtPoint(createLabelObject(objectsRef.current.length, snapPoint(point)))
  }

  function createLocationFromName(point) {
    const name = newLocationName.trim() || 'New Location'
    const location = saveLocation
      ? saveLocation({ name, category: activeMapType === 'interior' ? 'Landmark' : 'Other', description: '' })
      : { id: uid('location'), name, category: 'Other' }
    setNewLocationName('')
    setSelectedLocationId(location?.id || '')
    placeObjectAtPoint(createLocationObject(location, objectsRef.current.length, snapPoint(point)))
  }

  function placeLocationAt(point) {
    const linked = (locations || []).find(location => location.id === selectedLocationId)
    if (linked) placeObjectAtPoint(createLocationObject(linked, objectsRef.current.length, snapPoint(point)))
    else createLocationFromName(point)
  }

  function handlePointerDown(event) {
    if (!activeMap || event.button !== 0) return
    const viewport = viewportRef.current
    const point = screenToMap(event.clientX, event.clientY, viewport, viewRef.current)
    const selected = objectsRef.current.filter(object => selectedIdsRef.current.includes(object.id))
    const handle = hitHandle(point, selected, viewRef.current.zoom)
    const hit = hitTest(point)
    event.currentTarget.setPointerCapture(event.pointerId)

    if (mode === 'pan' || event.altKey || spacePressedRef.current) {
      interactionRef.current = { type: 'pan', startX: event.clientX, startY: event.clientY, startPan: viewRef.current.pan }
      return
    }
    if (mode === 'zoom') {
      zoomAt(event.clientX, event.clientY, event.shiftKey ? 0.78 : 1.22)
      return
    }
    if (POINT_DRAW_TOOLS.has(mode)) {
      startOrExtendPointDraft(point, mode, event.detail >= 2)
      return
    }
    if (mode === 'stamp') {
      placeStampAt(point)
      return
    }
    if (mode === 'label') {
      placeLabelAt(point)
      return
    }
    if (mode === 'location') {
      placeLocationAt(point)
      return
    }
    if (mode === 'shape' && shapeKind === 'polygon') {
      startOrExtendPointDraft(point, 'shapePolygon', event.detail >= 2)
      return
    }
    if (mode === 'shape') {
      interactionRef.current = {
        type: 'shape',
        startPoint: point,
        shapeKind,
      }
      setDraft({
        kind: 'shape',
        start: point,
        end: point,
        shapeKind,
        fill: LAND_FILL,
        stroke: LAND_STROKE,
      })
      return
    }
    if (handle?.type === 'rotate') {
      const object = selected[0]
      pushUndoSnapshot()
      interactionRef.current = {
        type: 'rotate',
        id: object.id,
        startRotation: object.rotation || 0,
        center: { x: object.x, y: object.y },
        startAngle: Math.atan2(point.y - object.y, point.x - object.x),
      }
      return
    }
    if (handle?.type === 'resize') {
      const object = selected[0]
      pushUndoSnapshot()
      interactionRef.current = {
        type: 'resize',
        id: object.id,
        startObject: object,
        corner: handle.corner,
      }
      return
    }
    if (handle?.type === 'point') {
      const object = selected[0]
      pushUndoSnapshot()
      interactionRef.current = {
        type: 'point',
        id: object.id,
        pointIndex: handle.pointIndex,
        faceIndex: handle.faceIndex,
        startObject: object,
      }
      return
    }
    if (hit && !hit.locked) {
      const additive = event.shiftKey || event.metaKey || event.ctrlKey
      const groupIds = hit.metadata?.groupId && !additive
        ? objectsRef.current.filter(object => object.metadata?.groupId === hit.metadata.groupId && !object.locked).map(object => object.id)
        : null
      const nextSelected = additive
        ? selectedIdsRef.current.includes(hit.id)
          ? selectedIdsRef.current.filter(id => id !== hit.id)
          : [...selectedIdsRef.current, hit.id]
        : groupIds?.length
          ? groupIds
        : selectedIdsRef.current.includes(hit.id)
          ? selectedIdsRef.current
          : [hit.id]
      setSelectedIds(nextSelected)
      interactionRef.current = {
        type: 'drag',
        startClientX: event.clientX,
        startClientY: event.clientY,
        hasMoved: false,
        startPoint: point,
        startObjects: objectsRef.current
          .filter(object => nextSelected.includes(object.id))
          .map(object => ({ id: object.id, x: object.x, y: object.y })),
      }
      return
    }
    if (!event.shiftKey) setSelectedIds([])
  }

  function handlePointerMove(event) {
    const interaction = interactionRef.current
    if (!interaction) {
      if (draftRef.current?.points?.length && (POINT_DRAW_TOOLS.has(mode) || draftRef.current.kind === 'shapePolygon')) {
        const point = screenToMap(event.clientX, event.clientY, viewportRef.current, viewRef.current)
        setDraft(current => current ? { ...current, preview: point } : current)
      }
      return
    }
    if (interaction.type === 'pan') {
      setView(current => ({
        ...current,
        pan: {
          x: interaction.startPan.x + event.clientX - interaction.startX,
          y: interaction.startPan.y + event.clientY - interaction.startY,
        },
      }))
      return
    }
    const point = screenToMap(event.clientX, event.clientY, viewportRef.current, viewRef.current)
    if (interaction.type === 'drag') {
      const screenDistance = Math.hypot(event.clientX - interaction.startClientX, event.clientY - interaction.startClientY)
      if (!interaction.hasMoved) {
        if (screenDistance < DRAG_THRESHOLD_PX) return
        pushUndoSnapshot()
        interaction.hasMoved = true
      }
      const dx = point.x - interaction.startPoint.x
      const dy = point.y - interaction.startPoint.y
      updateObjects(current => current.map(object => {
        const start = interaction.startObjects.find(item => item.id === object.id)
        return start ? { ...object, ...snapPoint({ x: start.x + dx, y: start.y + dy }) } : object
      }), undefined, { skipHistory: true })
      return
    }
    if (interaction.type === 'resize') {
      updateObjects(current => current.map(object => {
        if (object.id !== interaction.id || object.locked) return object
        const start = interaction.startObject
        const local = toLocal(point, start)
        const directionX = interaction.corner.includes('e') ? 1 : -1
        const directionY = interaction.corner.includes('s') ? 1 : -1
        return {
          ...object,
          width: Math.max(MIN_SIZE, Math.abs(local.x * 2 * directionX)),
          height: Math.max(MIN_SIZE, Math.abs(local.y * 2 * directionY)),
        }
      }), undefined, { skipHistory: true })
      return
    }
    if (interaction.type === 'point') {
      updateObjects(current => current.map(object => {
        if (object.id !== interaction.id || object.locked) return object
        const local = toLocal(point, object)
        if (Number.isFinite(interaction.faceIndex)) {
          const faces = (object.metadata?.faces || []).map(face => [...face])
          faces[interaction.faceIndex][interaction.pointIndex] = localToNormalized(local, object)
          return { ...object, metadata: { ...object.metadata, faces } }
        }
        const points = [...(object.metadata?.points || [])]
        points[interaction.pointIndex] = localToNormalized(local, object)
        return { ...object, metadata: { ...object.metadata, points } }
      }), undefined, { skipHistory: true })
      return
    }
    if (interaction.type === 'shape') {
      setDraft(current => current ? { ...current, end: point } : current)
      return
    }
    if (interaction.type === 'rotate') {
      const angle = Math.atan2(point.y - interaction.center.y, point.x - interaction.center.x)
      const delta = (angle - interaction.startAngle) * 180 / Math.PI
      updateObjects(current => current.map(object => {
        if (object.id !== interaction.id || object.locked) return object
        return { ...object, rotation: round(interaction.startRotation + delta, 0) }
      }), undefined, { skipHistory: true })
    }
  }

  function handlePointerUp(event) {
    const interaction = interactionRef.current
    if (interaction?.type === 'shape' && draftRef.current?.start && draftRef.current?.end) {
      const object = shapeFromRect(draftRef.current.start, draftRef.current.end, interaction.shapeKind, objectsRef.current.length)
      if (object.width > MIN_SIZE || object.height > MIN_SIZE) {
        let selectedId = object.id
        updateObjects(current => {
          const placed = moveLandToBase(object, current)
          selectedId = placed.id
          return [...current, placed]
        })
        setSelectedIds([selectedId])
      }
      setDraft(null)
    }
    interactionRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function handleWheel(event) {
    event.preventDefault()
    const normalizedDelta = Math.max(-120, Math.min(120, event.deltaY))
    const factor = Math.exp(-normalizedDelta * WHEEL_ZOOM_INTENSITY)
    zoomAt(event.clientX, event.clientY, factor)
  }

  function handleDrop(event) {
    event.preventDefault()
    if (!activeMap) return
    const stampId = event.dataTransfer.getData('application/x-yow-stamp')
    const stamp = STAMP_LIBRARY.find(item => item.id === stampId)
    if (!stamp) return
    const point = screenToMap(event.clientX, event.clientY, viewportRef.current, viewRef.current)
    placeStampAt(point, stamp)
  }

  function startOrExtendPointDraft(point, tool, shouldComplete = false) {
    const defaults = {
      region: { closed: true, fill: OBJECT_TYPES.region.fill, stroke: OBJECT_TYPES.region.stroke, opacity: 0.32, lineThickness: 3, dashed: false },
      river: { closed: false, fill: 'transparent', stroke: '#3c93b8', lineThickness, dashed: false },
      mountain: { closed: false, fill: 'transparent', stroke: OBJECT_TYPES.mountain.stroke, lineThickness: Math.max(lineThickness, 16), dashed: false },
      road: { closed: false, fill: 'transparent', stroke: '#8b6743', lineThickness, dashed: dashedLines },
      border: { closed: false, fill: 'transparent', stroke: '#9b5ab8', lineThickness, dashed: dashedLines },
      shapePolygon: { closed: true, fill: LAND_FILL, stroke: LAND_STROKE, lineThickness: 2, dashed: false },
    }
    setDraft(current => {
      const sameTool = current?.kind === tool
      const firstPoint = sameTool ? current.points[0] : null
      const lastPoint = sameTool ? current.points[current.points.length - 1] : null
      const minPoints = tool === 'region' || tool === 'shapePolygon' ? 3 : 2
      const closeMinPoints = Math.max(3, minPoints)
      const closesOnOrigin = Boolean(firstPoint)
        && Math.hypot(point.x - firstPoint.x, point.y - firstPoint.y) <= Math.max(10, 16 / viewRef.current.zoom)
        && current.points.length >= closeMinPoints
      const finishesOpenLine = Boolean(lastPoint)
        && !defaults[tool]?.closed
        && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) <= Math.max(10, 16 / viewRef.current.zoom)
        && current.points.length >= minPoints
      const next = sameTool
        ? { ...current, points: shouldComplete || closesOnOrigin || finishesOpenLine ? current.points : [...current.points, point], preview: point, closed: closesOnOrigin ? true : current.closed }
        : { kind: tool, points: [point], preview: point, ...defaults[tool] }
      if ((shouldComplete || closesOnOrigin || finishesOpenLine) && next.points.length >= minPoints) {
        setTimeout(() => completeDraft(next), 0)
      }
      return next
    })
  }

  function completeDraft(source = draftRef.current) {
    if (!source?.points?.length) return
    const minPoints = source.kind === 'region' || source.kind === 'shapePolygon' ? 3 : 2
    if (source.points.length < minPoints) return
    const objectType = source.kind === 'shapePolygon' ? 'shape' : source.kind
    const isClosedWater = objectType === 'river' && source.closed
    const object = pointsToObject(source.points, objectType, objectsRef.current.length, {
      name: source.kind === 'shapePolygon' ? 'Land' : isClosedWater ? 'Water Mass' : OBJECT_TYPES[source.kind]?.label || 'Object',
      text: '',
      fill: isClosedWater ? WATER_FILL : source.fill,
      stroke: isClosedWater ? WATER_STROKE : source.stroke,
      opacity: isClosedWater ? 0.82 : source.opacity ?? 1,
      lineThickness: source.lineThickness,
      dashed: source.dashed,
      closed: Boolean(source.closed),
      waterKind: isClosedWater ? 'waterMass' : undefined,
      shapeKind: source.kind === 'region' || source.kind === 'shapePolygon' || isClosedWater ? 'polygon' : undefined,
    })
    let selectedId = object.id
    updateObjects(current => {
      if (object.type === 'shape') {
        const placed = moveLandToBase(object, current)
        selectedId = placed.id
        return [...current, placed]
      }
      return [...current, object]
    })
    setSelectedIds([selectedId])
    setDraft(null)
    setMode('select')
  }

  function addObject(type) {
    const object = type === 'stamp'
      ? createStampObject(selectedStamp, objects.length)
      : type === 'label'
        ? createLabelObject(objects.length)
        : type === 'location'
          ? createLocationObject((locations || []).find(location => location.id === selectedLocationId), objects.length)
          : createObject(type, objects.length)
    let selectedId = object.id
    updateObjects(current => {
      const placed = object.type === 'shape' ? moveLandToBase(object, current) : object
      selectedId = placed.id
      return [...current, placed]
    })
    setSelectedIds([selectedId])
    if (type === 'stamp') noteStampUsed(selectedStamp?.id)
  }

  function deleteSelectedObjects() {
    const ids = new Set(selectedIdsRef.current)
    updateObjects(current => current.filter(object => !ids.has(object.id) || object.locked))
    setSelectedIds([])
  }

  function patchSelected(patch) {
    const ids = new Set(selectedIds)
    updateObjects(current => current.map(object => ids.has(object.id) && !object.locked
      ? {
          ...object,
          ...patch,
          metadata: patch.metadata ? { ...object.metadata, ...patch.metadata } : object.metadata,
        }
      : object))
  }

  function duplicateSelectedObjects() {
    if (!selectedIds.length) return
    const selected = new Set(selectedIds)
    const copies = objects
      .filter(object => selected.has(object.id) && !object.locked)
      .map((object, index) => normalizeObject({
        ...object,
        id: uid(object.type),
        x: object.x + 36,
        y: object.y + 36,
        zIndex: Math.max(...objects.map(item => item.zIndex), 0) + index + 1,
        metadata: { ...object.metadata, groupId: object.metadata?.groupId },
      }, objects.length + index))
    if (!copies.length) return
    updateObjects(current => [...current, ...copies])
    setSelectedIds(copies.map(object => object.id))
  }

  function groupSelectedObjects() {
    if (selectedIds.length < 2) return
    const groupId = uid('group')
    patchSelected({ metadata: { groupId } })
  }

  function ungroupSelectedObjects() {
    patchSelected({ metadata: { groupId: null } })
  }

  function updateMapType(nextType) {
    pushUndoSnapshot()
    setMapType(nextType)
    updateActiveMapData(() => ({ mapType: nextType, metadata: { ...(activeMap?.metadata || {}), mapType: nextType } }))
    setStampCategory('Default')
  }

  function updateStylePreset(nextPreset) {
    pushUndoSnapshot()
    updateActiveMapData(() => ({
      metadata: { ...(activeMap?.metadata || {}), stylePreset: nextPreset },
    }))
  }

  function moveLayer(direction) {
    if (!selectedIds.length) return
    const selected = new Set(selectedIds)
    const ordered = [...objects].sort((a, b) => a.zIndex - b.zIndex)
    const min = Math.min(...ordered.map(object => object.zIndex), 0)
    const max = Math.max(...ordered.map(object => object.zIndex), 0)
    const next = objects.map(object => {
      if (!selected.has(object.id) || object.locked) return object
      if (direction === 'front') return { ...object, zIndex: max + 1 }
      if (direction === 'back') return { ...object, zIndex: min - 1 }
      return { ...object, zIndex: object.zIndex + direction }
    })
    updateObjects(next.map((object, index) => ({ ...object, zIndex: object.zIndex + index * 0.001 })))
  }

  function normalizeZOrder(list) {
    return [...list]
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((object, index) => ({ ...object, zIndex: index + 1 }))
  }

  function moveLayerObject(id, direction) {
    const ordered = normalizeZOrder(objects)
    const index = ordered.findIndex(object => object.id === id)
    if (index < 0 || ordered[index].locked) return
    const targetIndex = direction === 'front'
      ? ordered.length - 1
      : direction === 'back'
        ? 0
        : clamp(index + direction, 0, ordered.length - 1)
    if (targetIndex === index) return
    const [item] = ordered.splice(index, 1)
    ordered.splice(targetIndex, 0, item)
    updateObjects(ordered.map((object, nextIndex) => ({ ...object, zIndex: nextIndex + 1 })))
  }

  function selectLayerObject(event, object) {
    event.stopPropagation()
    setMode('select')
    setDraft(null)
    const additive = event.metaKey || event.ctrlKey
    if (additive) {
      setSelectedIds(current => current.includes(object.id) ? current.filter(id => id !== object.id) : [...current, object.id])
      return
    }
    if (selectedIdsRef.current.length === 1 && selectedIdsRef.current[0] === object.id) {
      setSelectedIds([])
      return
    }
    setSelectedIds([object.id])
  }

  function toggleVisibility(id) {
    updateObjects(current => current.map(object => object.id === id ? { ...object, visible: object.visible === false } : object))
  }

  function toggleLock(id) {
    updateObjects(current => current.map(object => object.id === id ? { ...object, locked: !object.locked } : object))
  }

  function handleCreateMap(event) {
    event.preventDefault()
    const id = addMap(newMapName.trim() || 'Untitled Map', mapType || 'region')
    setNewMapName('')
    setTimeout(() => {
      selectMap(id)
      fitCanvasToViewport()
    }, 0)
  }

  function selectEditorMode(nextMode) {
    setMode(nextMode)
    if (nextMode !== mode) setDraft(null)
  }

  function finishRename(map) {
    const name = renameValue.trim()
    if (name) renameMap(map.id, name)
    setRenamingId(null)
    setRenameValue('')
  }

  function downloadJson() {
    if (!activeMap) return
    const blob = new Blob([JSON.stringify(exportPayload(activeMap, schema), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(activeMap.name || 'map').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-object-map.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  function importJson(file) {
    if (!file || !activeMap) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'))
        const imported = normalizeMapSchema(parsed)
        pushUndoSnapshot()
        updateActiveMapData(() => ({
          schemaVersion: SCHEMA_VERSION,
          width: imported.width,
          height: imported.height,
          mapObjects: imported.objects,
          mapLayers: imported.layers,
          metadata: imported.metadata,
        }))
        setSelectedIds([])
        setJsonStatus('Imported')
        setTimeout(() => setJsonStatus(''), 1800)
      } catch {
        setJsonStatus('Invalid JSON')
        setTimeout(() => setJsonStatus(''), 2200)
      }
    }
    reader.readAsText(file)
  }

  if (!project) {
    return (
      <div className="workspace-page" style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
        <div className="empty-state">Open a project to use the map builder.</div>
      </div>
    )
  }

  const canUndo = historyVersion >= 0 && undoStackRef.current.length > 0
  const canRedo = historyVersion >= 0 && redoStackRef.current.length > 0

  return (
    <div style={{ flex: 1, minHeight: 0, height: isCompact ? '100%' : 'min(100%, calc(100dvh - 190px))', maxHeight: isCompact ? '100%' : 'calc(100dvh - 190px)', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', background: 'var(--surface)', color: 'var(--text)', position: 'relative', zIndex: 1 }}>
      <div className="studio-topbar map-builder-topbar" style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'minmax(170px, 260px) minmax(320px, 1fr) auto', alignItems: 'end', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', minWidth: 0, position: 'relative', zIndex: 8, overflow: 'visible' }}>
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <strong style={{ fontFamily: 'var(--font-serif)', fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeMap?.name || 'Map Builder'}</strong>
          <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTypeConfig.label} · {TOOLBAR_MODES.find(item => item.id === mode)?.label || 'Select'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'minmax(130px, 1fr) minmax(126px, .75fr) minmax(126px, .75fr)', gap: 8, minWidth: 0 }}>
          <SelectInput
            label="Map"
            value={activeMap?.id || ''}
            options={(project.maps || []).map(map => ({ value: map.id, label: map.name || 'Untitled Map' }))}
            onChange={value => selectMap(value)}
          />
          <SelectInput
            label="Type"
            value={activeMap ? activeMapType : mapType}
            options={MAP_TYPE_OPTIONS}
            onChange={value => activeMap ? updateMapType(value) : setMapType(value)}
          />
          <SelectInput
            label="Style"
            value={activeStylePreset}
            options={STYLE_PRESET_OPTIONS}
            onChange={updateStylePreset}
          />
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: isCompact ? 'flex-start' : 'flex-end', flexWrap: 'wrap', minWidth: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => selectEditorMode('select')} title="Select">↖</button>
          <button className="btn btn-secondary btn-sm" onClick={() => selectEditorMode('pan')} title="Pan">✥</button>
          <button className="btn btn-secondary btn-sm" onClick={undoMapChange} disabled={!canUndo} title="Undo">↶</button>
          <button className="btn btn-secondary btn-sm" onClick={redoMapChange} disabled={!canRedo} title="Redo">↷</button>
          <button className="btn btn-secondary btn-sm" onClick={() => zoomViewportCenter(0.86)} title="Zoom out">−</button>
          <span style={{ minWidth: 44, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>{Math.round(view.zoom * 100)}%</span>
          <button className="btn btn-secondary btn-sm" onClick={() => zoomViewportCenter(1.16)} title="Zoom in">+</button>
          <button className="btn btn-secondary btn-sm" onClick={fitCanvasToViewport}>Fit</button>
          <button className="btn btn-secondary btn-sm" onClick={downloadJson}>Export</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={event => importJson(event.target.files?.[0])} style={{ display: 'none' }} />
          {jsonStatus && <span style={{ fontSize: 12, color: jsonStatus === 'Invalid JSON' ? '#d86b70' : 'var(--accent)' }}>{jsonStatus}</span>}
        </div>
      </div>

      <div style={{ minHeight: 0, display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'minmax(150px, 176px) minmax(0, 1fr) minmax(238px, 284px)', gridTemplateRows: isCompact ? 'minmax(320px, 1fr) auto auto' : 'minmax(0, 1fr)', overflowX: 'visible', overflowY: isCompact ? 'auto' : 'visible', paddingBottom: isCompact ? 12 : 0 }}>
        <aside style={{ order: isCompact ? 2 : undefined, borderRight: isCompact ? 'none' : '1px solid var(--border)', borderBottom: isCompact ? '1px solid var(--border)' : 'none', background: 'color-mix(in srgb, var(--surface) 96%, #000)', padding: 10, overflowY: 'auto', display: 'flex', flexDirection: isCompact ? 'row' : 'column', gap: 10, flexWrap: isCompact ? 'wrap' : 'nowrap', minHeight: 0 }}>
          {!activeMap && (
            <form onSubmit={handleCreateMap} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: isCompact ? 220 : 0 }}>
              <PanelTitle>New Map</PanelTitle>
              <input
                value={newMapName}
                onChange={event => setNewMapName(event.target.value)}
                placeholder="Map name"
                style={{ minWidth: 0, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit' }}
              />
              <button className="btn btn-primary btn-sm" type="submit">Create map</button>
            </form>
          )}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: isCompact ? 180 : 0 }}>
            <PanelTitle>{activeTypeConfig.label}</PanelTitle>
            <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.35, marginBottom: 2 }}>{activeTypeConfig.purpose}</div>
            {activeTypeConfig.tools.map(tool => (
              <button
                key={tool.id}
                className="btn btn-secondary btn-sm"
                onClick={() => selectEditorMode(tool.mode)}
                style={{ justifyContent: 'flex-start', display: 'flex', gap: 8, minHeight: 34, background: mode === tool.mode ? 'var(--accent)' : undefined, color: mode === tool.mode ? '#fff' : undefined }}
              >
                <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>{tool.icon}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.label}</span>
              </button>
            ))}
            {(mode === 'river' || mode === 'mountain' || mode === 'road' || mode === 'border') && (
              <>
                <NumberInput label="Thickness" value={lineThickness} min={1} onChange={setLineThickness} />
                {(mode === 'road' || mode === 'border') && <CheckboxInput label="Dashed" checked={dashedLines} onChange={setDashedLines} />}
              </>
            )}
            {mode === 'shape' && (
              <SelectInput
                label="Land type"
                value={shapeKind}
                options={[
                  { value: 'polygon', label: 'Polygon' },
                  { value: 'rectangle', label: 'Rectangle' },
                  { value: 'circle', label: 'Circle' },
                ]}
                onChange={value => { setShapeKind(value); setDraft(null) }}
              />
            )}
            {draft?.points?.length ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary btn-sm" onClick={() => completeDraft()}>Done</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setDraft(null)}>Cancel</button>
              </div>
            ) : null}
          </section>

          <details open={mode === 'stamp'} style={{ minWidth: isCompact ? 240 : 0 }}>
            <summary style={{ cursor: 'pointer' }}><PanelTitle>Stamps</PanelTitle></summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
              <input
                value={stampSearch}
                onChange={event => setStampSearch(event.target.value)}
                placeholder="Search stamps"
                style={{ minWidth: 0, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit', fontSize: 12 }}
              />
              <select
                value={stampCategory}
                onChange={event => setStampCategory(event.target.value)}
                style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit', fontSize: 12 }}
              >
                {stampCategories.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6 }}>
                {filteredStamps.slice(0, 18).map(stamp => (
                  <button
                    key={stamp.id}
                    className="btn btn-secondary btn-sm"
                    draggable
                    onDragStart={event => event.dataTransfer.setData('application/x-yow-stamp', stamp.id)}
                    onClick={() => { setSelectedStampId(stamp.id); selectEditorMode('stamp') }}
                    title={`${stamp.name} (${stamp.category})`}
                    style={{ minHeight: 58, padding: 6, display: 'grid', gap: 3, justifyItems: 'center', borderColor: selectedStampId === stamp.id ? 'var(--accent)' : undefined, background: selectedStampId === stamp.id ? 'color-mix(in srgb, var(--accent) 16%, var(--surface2))' : undefined }}
                  >
                    <span style={{ fontSize: 19, color: stamp.fill }}>{stamp.icon}</span>
                    <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>{stamp.name}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary btn-sm" onClick={() => selectEditorMode('stamp')} style={{ flex: 1 }}>Place</button>
                <button className="btn btn-secondary btn-sm" onClick={() => toggleFavoriteStamp(selectedStampId)} title="Favourite stamp">{favoriteStamps.includes(selectedStampId) ? '★' : '☆'}</button>
              </div>
            </div>
          </details>

          <details open={mode === 'location'} style={{ minWidth: isCompact ? 220 : 0 }}>
            <summary style={{ cursor: 'pointer' }}><PanelTitle>Placement Options</PanelTitle></summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {mode === 'location' && (
              <>
                <input
                  value={locationSearch}
                  onChange={event => setLocationSearch(event.target.value)}
                  placeholder="Find location"
                  style={{ minWidth: 0, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit', fontSize: 12 }}
                />
                <select value={selectedLocationId} onChange={event => setSelectedLocationId(event.target.value)} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit', fontSize: 12 }}>
                  <option value="">New linked location</option>
                  {filteredLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
                {!selectedLocationId && (
                  <input
                    value={newLocationName}
                    onChange={event => setNewLocationName(event.target.value)}
                    placeholder="New location name"
                    style={{ minWidth: 0, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit', fontSize: 12 }}
                  />
                )}
              </>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <CheckboxInput label="Snap" checked={snapEnabled} onChange={setSnapEnabled} />
              <select value={snapSize} onChange={event => setSnapSize(Number(event.target.value))} disabled={!snapEnabled} style={{ minWidth: 0, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit', fontSize: 12 }}>
                {SNAP_SIZES.map(size => <option key={size} value={size}>{size}px</option>)}
              </select>
            </div>
            </div>
          </details>
        </aside>

        <main
          ref={viewportRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onDragOver={event => event.preventDefault()}
          onDrop={handleDrop}
          style={{ order: isCompact ? 1 : undefined, minWidth: 0, minHeight: isCompact ? 320 : 0, position: 'relative', overflow: 'hidden', touchAction: 'none', cursor: mode === 'pan' ? 'grab' : mode === 'zoom' ? 'zoom-in' : 'default', zIndex: 1 }}
        >
          {activeMap ? (
            <>
              <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
              <div style={{ position: 'absolute', left: 14, top: 14, display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: 'rgba(0,0,0,.5)', color: '#fff', fontSize: 12, pointerEvents: 'none' }}>
                <span>{MAP_W} × {MAP_H}</span>
                <span>{objects.length} objects</span>
                <span>{selectedIds.length} selected</span>
              </div>
            </>
          ) : (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
              Create a map to start.
            </div>
          )}
        </main>

        <aside style={{ order: isCompact ? 3 : undefined, borderLeft: isCompact ? 'none' : '1px solid var(--border)', borderTop: isCompact ? '1px solid var(--border)' : 'none', background: 'color-mix(in srgb, var(--surface) 96%, #000)', padding: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PanelTitle>Properties</PanelTitle>
            {primarySelection ? (
              <>
                {selectedIds.length > 1 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{selectedIds.length} objects selected. Changes apply to the selection.</div>}
                <PropertyInput label="Name" value={objectDisplayName(primarySelection)} onChange={value => patchSelected({ metadata: { name: value } })} />
                <PropertyInput label="Text" value={primarySelection.metadata?.text || ''} onChange={value => patchSelected({ metadata: { text: value } })} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <NumberInput label="X" value={primarySelection.x} onChange={value => patchSelected({ x: value })} />
                  <NumberInput label="Y" value={primarySelection.y} onChange={value => patchSelected({ y: value })} />
                  <NumberInput label="W" value={primarySelection.width} min={MIN_SIZE} onChange={value => patchSelected({ width: value })} />
                  <NumberInput label="H" value={primarySelection.height} min={MIN_SIZE} onChange={value => patchSelected({ height: value })} />
                  <NumberInput label="Rotate" value={primarySelection.rotation} onChange={value => patchSelected({ rotation: value })} />
                  <NumberInput label="Layer" value={primarySelection.zIndex} onChange={value => patchSelected({ zIndex: value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <ColorInput label="Fill" value={primarySelection.metadata?.fill || LAND_FILL} onChange={value => patchSelected({ metadata: { fill: value } })} />
                  <ColorInput label="Stroke" value={primarySelection.metadata?.stroke || LAND_STROKE} onChange={value => patchSelected({ metadata: { stroke: value } })} />
                </div>
                {primarySelection.type === 'label' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, alignItems: 'end' }}>
                    <NumberInput label="Font size" value={primarySelection.metadata?.fontSize || 34} min={10} onChange={value => patchSelected({ metadata: { fontSize: value } })} />
                    <CheckboxInput label="Curved" checked={Boolean(primarySelection.metadata?.curvedLabel)} onChange={value => patchSelected({ metadata: { curvedLabel: value } })} />
                  </div>
                )}
                {primarySelection.type === 'location' && (
                  <SelectInput
                    label="Linked location"
                    value={primarySelection.metadata?.locationId || ''}
                    options={[
                      { value: '', label: 'Unlinked' },
                      ...(locations || []).map(location => ({ value: location.id, label: location.name || 'Untitled' })),
                    ]}
                    onChange={value => {
                      const linked = (locations || []).find(location => location.id === value)
                      patchSelected({ metadata: { locationId: value || null, name: linked?.name || primarySelection.metadata?.name || 'Location', text: linked?.name || primarySelection.metadata?.text || 'Location', category: linked?.category || primarySelection.metadata?.category } })
                    }}
                  />
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <NumberInput label="Opacity" value={round((primarySelection.metadata?.opacity ?? 1) * 100, 0)} min={0} onChange={value => patchSelected({ metadata: { opacity: clamp(value / 100, 0, 1) } })} />
                  <NumberInput label="Line" value={primarySelection.metadata?.lineThickness || 2} min={1} onChange={value => patchSelected({ metadata: { lineThickness: value } })} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <CheckboxInput label="Dashed" checked={Boolean(primarySelection.metadata?.dashed)} onChange={value => patchSelected({ metadata: { dashed: value } })} />
                  {primarySelection.type === 'shape' && (
                    <SelectInput
                      label="Land type"
                      value={primarySelection.metadata?.shapeKind || 'polygon'}
                      options={[
                        { value: 'polygon', label: 'Polygon' },
                        { value: 'rectangle', label: 'Rectangle' },
                        { value: 'circle', label: 'Circle' },
                      ]}
                      onChange={value => patchSelected({ metadata: { shapeKind: value } })}
                    />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => patchSelected({ locked: !primarySelection.locked })}>{primarySelection.locked ? 'Unlock' : 'Lock'}</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => patchSelected({ visible: primarySelection.visible === false })}>{primarySelection.visible === false ? 'Show' : 'Hide'}</button>
                  <button className="btn btn-secondary btn-sm" onClick={duplicateSelectedObjects}>Duplicate</button>
                  {selectedIds.length > 1 && <button className="btn btn-secondary btn-sm" onClick={groupSelectedObjects}>Group selected</button>}
                  {selectedObjects.some(object => object.metadata?.groupId) && <button className="btn btn-secondary btn-sm" onClick={ungroupSelectedObjects}>Ungroup</button>}
                  <button className="btn btn-secondary btn-sm" onClick={() => moveLayer('front')}>Front</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => moveLayer('back')}>Back</button>
                  <button className="btn btn-secondary btn-sm" onClick={deleteSelectedObjects}>Delete</button>
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>Select an object to edit its position, size, rotation, visibility, lock state, and metadata.</div>
            )}
          </section>

          <details>
            <summary style={{ cursor: 'pointer' }}><PanelTitle>Maps & Advanced</PanelTitle></summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              <form onSubmit={handleCreateMap} style={{ display: 'flex', gap: 6 }}>
                <input
                  value={newMapName}
                  onChange={event => setNewMapName(event.target.value)}
                  placeholder="New map"
                  style={{ minWidth: 0, flex: 1, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit' }}
                />
                <button className="btn btn-primary btn-sm" type="submit">+</button>
              </form>
              {(project.maps || []).map(map => {
                const active = map.id === project.activeMapId
                return (
                  <div key={map.id} style={{ display: 'flex', gap: 3, alignItems: 'stretch' }}>
                    {renamingId === map.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={event => setRenameValue(event.target.value)}
                        onBlur={() => finishRename(map)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') finishRename(map)
                          if (event.key === 'Escape') setRenamingId(null)
                        }}
                        style={{ flex: 1, minWidth: 0, border: '1px solid var(--accent)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '6px 8px', fontFamily: 'inherit' }}
                      />
                    ) : (
                      <>
                        <button
                          onClick={() => selectMap(map.id)}
                          onDoubleClick={() => { setRenamingId(map.id); setRenameValue(map.name || '') }}
                          style={{ flex: 1, minWidth: 0, padding: '7px 9px', borderRadius: 7, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent)' : 'var(--surface2)', color: active ? '#fff' : 'var(--muted)', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          {map.name || 'Untitled Map'}
                        </button>
                        {(project.maps || []).length > 1 && (
                          <button className="btn btn-secondary btn-sm" onClick={() => deleteMap(map.id)} title="Delete map">×</button>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>Import JSON</button>
                {['marker', 'shape', 'region', 'river', 'mountain', 'road', 'border'].map(type => {
                  const item = OBJECT_TYPES[type]
                  return (
                    <button key={type} className="btn btn-secondary btn-sm" onClick={() => addObject(type)} title={`Add ${item.label}`}>
                      {item.icon}
                    </button>
                  )
                })}
              </div>
            </div>
          </details>

          <details>
            <summary style={{ cursor: 'pointer' }}><PanelTitle>Layers</PanelTitle></summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(objects.filter(object => !object.locked).map(object => object.id))} title="Select all layers">All</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds([])} title="Clear layer selection">None</button>
              </div>
              {layerObjects.map((object, index) => {
                const selected = selectedIds.includes(object.id)
                const isTop = index === 0
                const isBottom = index === layerObjects.length - 1
                return (
                  <div
                    key={object.id}
                    onClick={event => selectLayerObject(event, object)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 6,
                      alignItems: 'center',
                      padding: 7,
                      borderRadius: 7,
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: selected ? 'color-mix(in srgb, var(--accent) 14%, var(--surface2))' : 'var(--surface2)',
                      cursor: object.locked ? 'default' : 'pointer',
                    }}
                  >
                    <button
                      onClick={event => selectLayerObject(event, object)}
                      title={selected ? 'Deselect layer' : 'Select layer'}
                      style={{ minWidth: 0, textAlign: 'left', background: 'none', border: 'none', color: selected ? 'var(--text-main)' : 'var(--muted)', fontFamily: 'inherit', cursor: 'pointer', overflow: 'hidden', padding: 0 }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span style={{ width: 18, height: 18, borderRadius: 5, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--surface) 70%, #000)', color: selected ? 'var(--accent)' : 'var(--muted)', flexShrink: 0 }}>{OBJECT_TYPES[object.type]?.icon || '□'}</span>
                        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{objectDisplayName(object)}</span>
                          <span style={{ color: 'var(--faint)', fontSize: 10, textTransform: 'uppercase' }}>{objectTypeLabel(object)}{object.metadata?.groupId ? ' · group' : ''}</span>
                        </span>
                      </span>
                    </button>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 28px)', gap: 4 }}>
                      <button className="btn btn-secondary btn-sm" disabled={isTop || object.locked} onClick={event => { event.stopPropagation(); moveLayerObject(object.id, 1) }} title="Move up">↑</button>
                      <button className="btn btn-secondary btn-sm" disabled={isBottom || object.locked} onClick={event => { event.stopPropagation(); moveLayerObject(object.id, -1) }} title="Move down">↓</button>
                      <button className="btn btn-secondary btn-sm" onClick={event => { event.stopPropagation(); toggleVisibility(object.id) }} title={object.visible === false ? 'Show' : 'Hide'}>{object.visible === false ? '○' : '●'}</button>
                      <button className="btn btn-secondary btn-sm" onClick={event => { event.stopPropagation(); toggleLock(object.id) }} title={object.locked ? 'Unlock' : 'Lock'}>{object.locked ? 'L' : 'U'}</button>
                    </div>
                  </div>
                )
              })}
              {!objects.length && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No objects yet.</div>}
            </div>
          </details>
        </aside>
      </div>
    </div>
  )
}

function PanelTitle({ children }) {
  return <div style={{ fontSize: 10, color: 'var(--faint)', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{children}</div>
}

function PropertyInput({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
      <span>{label}</span>
      <input value={value} onChange={event => onChange(event.target.value)} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit' }} />
    </label>
  )
}

function NumberInput({ label, value, min = -Infinity, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? round(value) : 0}
        onChange={event => onChange(Math.max(min, Number(event.target.value) || 0))}
        style={{ minWidth: 0, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit' }}
      />
    </label>
  )
}

function ColorInput({ label, value, onChange }) {
  const safeValue = /^#[0-9a-f]{6}$/i.test(value) ? value : LAND_FILL
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
      <span>{label}</span>
      <input type="color" value={safeValue} onChange={event => onChange(event.target.value)} style={{ width: '100%', minHeight: 34, border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 7, padding: 3 }} />
    </label>
  )
}

function CheckboxInput({ label, checked, onChange }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', minHeight: 32 }}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} style={{ accentColor: 'var(--accent)' }} />
      <span>{label}</span>
    </label>
  )
}

function SelectInput({ label, value, options, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)', minWidth: 120 }}>
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit' }}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}
