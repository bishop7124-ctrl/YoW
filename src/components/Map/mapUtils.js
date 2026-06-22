import {
  MAP_W, MAP_H, SCHEMA_VERSION, MIN_SIZE, DEFAULT_OBJECT_LAYER_ID, DEFAULT_LOCATION_LAYER_ID,
  LAND_FILL, LAND_STROKE, LINE_OBJECT_TYPES, CONTENT_OBJECT_TYPES,
  MAP_TYPE_OPTIONS, OBJECT_TYPES, STAMP_LIBRARY,
} from './mapConstants.js'

export function uid(prefix = 'obj') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`
}

export function loadJson(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback
  try {
    const value = JSON.parse(localStorage.getItem(key))
    return value ?? fallback
  } catch {
    return fallback
  }
}

export function saveJson(key, value) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

export function normalizeMapType(value) {
  if (value === 'regional') return 'region'
  return MAP_TYPE_OPTIONS.some(option => option.value === value) ? value : 'region'
}

export function objectTypeLabel(object) {
  if (object?.metadata?.semanticType === 'room') return 'Room'
  if (object?.metadata?.semanticType === 'corridor') return 'Corridor'
  if (object?.metadata?.semanticType === 'wall') return 'Wall'
  return OBJECT_TYPES[object?.type]?.label || object?.type || 'Object'
}

export function objectDisplayName(object) {
  const name = object?.metadata?.name || object?.type || 'Object'
  return object?.type === 'shape' && name === 'Shape' ? 'Land' : name
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function round(value, precision = 1) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

export function hashString(value) {
  let hash = 2166136261
  const input = String(value || 'map')
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function seededNoise(seed, salt = 0) {
  let value = (seed + salt * 374761393) >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return ((value >>> 0) / 4294967295)
}

export function colorWithAlpha(color, alpha) {
  if (!color || color === 'transparent') return `rgba(0,0,0,${alpha})`
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(color)
  if (!match) return color
  const baseAlpha = match[4] ? parseInt(match[4], 16) / 255 : 1
  return `rgba(${parseInt(match[1], 16)},${parseInt(match[2], 16)},${parseInt(match[3], 16)},${round(baseAlpha * alpha, 3)})`
}

export function drawSmoothPath(ctx, points, closed = false) {
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

export function resampleSegment(a, b, spacing) {
  const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
  const steps = Math.max(1, Math.ceil(distance / spacing))
  return Array.from({ length: steps }, (_, index) => {
    const t = index / steps
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  })
}

export function organicPoints(points, seed, options = {}) {
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

export function objectLocalPoints(object) {
  const points = object.metadata?.points
  return Array.isArray(points) ? points.map(point => normalizedToLocal(point, object)) : []
}

export function objectLocalFaces(object) {
  const faces = Array.isArray(object.metadata?.faces) ? object.metadata.faces : []
  const validFaces = faces
    .filter(face => Array.isArray(face) && face.length >= 3)
    .map(face => face.map(point => normalizedToLocal(point, object)))
  const base = objectLocalPoints(object)
  if (base.length >= 3) validFaces.unshift(base)
  return validFaces
}

export const DEFAULT_CATEGORY_LAYER_IDS = new Set([
  'shapes', 'regions', 'water', 'terrain', 'routes', 'boundaries',
  'stamps', 'labels', DEFAULT_LOCATION_LAYER_ID, 'markers', DEFAULT_OBJECT_LAYER_ID,
])

export function defaultLayerIdForObject(type) {
  return {
    shape: 'shapes',
    region: 'regions',
    river: 'water',
    mountain: 'terrain',
    road: 'routes',
    border: 'boundaries',
    stamp: 'stamps',
    label: 'labels',
    location: DEFAULT_LOCATION_LAYER_ID,
    marker: 'markers',
  }[type] || DEFAULT_OBJECT_LAYER_ID
}

export function defaultLayers(mapType = 'region') {
  const shapeName = mapType === 'interior' ? 'Rooms' : mapType === 'world' ? 'Landmasses' : 'Areas'
  const boundaryName = mapType === 'interior' ? 'Walls' : 'Boundaries'
  return [
    { id: 'shapes', name: shapeName, visible: true, locked: false, zIndex: 0 },
    { id: 'regions', name: 'Regions', visible: true, locked: false, zIndex: 1 },
    { id: 'water', name: 'Water', visible: true, locked: false, zIndex: 2 },
    { id: 'terrain', name: 'Terrain', visible: true, locked: false, zIndex: 3 },
    { id: 'routes', name: 'Routes', visible: true, locked: false, zIndex: 4 },
    { id: 'boundaries', name: boundaryName, visible: true, locked: false, zIndex: 5 },
    { id: 'stamps', name: 'Stamps', visible: true, locked: false, zIndex: 6 },
    { id: 'labels', name: 'Labels', visible: true, locked: false, zIndex: 7 },
    { id: DEFAULT_LOCATION_LAYER_ID, name: 'Locations', visible: true, locked: false, zIndex: 8 },
    { id: 'markers', name: 'Markers', visible: true, locked: false, zIndex: 9 },
    { id: DEFAULT_OBJECT_LAYER_ID, name: 'Other', visible: true, locked: false, zIndex: 10 },
  ]
}

export function createObject(type, index = 0) {
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
      lineThickness: type === 'river' ? 12 : type === 'road' ? 7 : type === 'border' ? 5 : 2,
      dashed: type === 'road' || type === 'border',
      shapeKind: type === 'shape' ? 'polygon' : 'rectangle',
      points: isLine ? [{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }] : null,
      layerId: defaultLayerIdForObject(type),
    },
  }
}

export function createStampObject(stamp, index = 0, point = null) {
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
      icon: stamp.icon,
      assetSrc: stamp.assetSrc,
      stampType: stamp.name,
      category: stamp.category,
      opacity: 1,
      lineThickness: 2,
      layerId: defaultLayerIdForObject('stamp'),
    },
  }, index)
}

export function createLabelObject(index = 0, point = null) {
  return normalizeObject({
    ...createObject('label', index),
    x: point?.x ?? 440 + index * 24,
    y: point?.y ?? 340 + index * 24,
    metadata: {
      ...createObject('label', index).metadata,
      name: 'Label',
      text: 'Label',
      fontFamily: '"Palatino Linotype", "Book Antiqua", Georgia, serif',
      fontWeight: 600,
      fontStyle: 'normal',
      textColor: '#2a241b',
      outlineColor: 'transparent',
      backgroundColor: 'transparent',
    },
  }, index)
}

export function createLocationObject(location, index = 0, point = null) {
  return normalizeObject({
    ...createObject('location', index),
    x: point?.x ?? 460 + index * 24,
    y: point?.y ?? 360 + index * 24,
    width: 72,
    height: 72,
    metadata: {
      ...createObject('location', index).metadata,
      name: location?.name || 'New Location',
      text: location?.name || 'New Location',
      locationId: location?.id || null,
      category: location?.category || 'Other',
      fill: '#d6b45f',
      stroke: '#6f5524',
      markerIcon: location?.markerIcon || 'pin',
      layerId: DEFAULT_LOCATION_LAYER_ID,
    },
  }, index)
}

export function normalizeObject(raw, index) {
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

export function normalizeMetadata(metadata, type) {
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
    organicEdges: ['region', 'shape'].includes(type) ? metadata.organicEdges !== false : metadata.organicEdges,
    opacity: Number.isFinite(metadata.opacity) ? clamp(metadata.opacity, 0, 1) : 1,
    lineThickness: Math.max(1, Number.isFinite(metadata.lineThickness) ? metadata.lineThickness : LINE_OBJECT_TYPES.has(type) ? 8 : 2),
    fontSize: Number.isFinite(metadata.fontSize) ? clamp(metadata.fontSize, 10, 144) : (type === 'label' ? 34 : metadata.fontSize),
    curvedLabel: Boolean(metadata.curvedLabel),
    dashed: Boolean(metadata.dashed),
    wallTexture: ['stone', 'brick', 'wood', 'solid'].includes(metadata.wallTexture) ? metadata.wallTexture : metadata.semanticType === 'wall' ? 'stone' : metadata.wallTexture,
    shapeKind: metadata.shapeKind || (type === 'shape' ? 'polygon' : 'rectangle'),
  }
}

export function normalizeGridSettings(settings = {}, mapType = 'region') {
  const interior = mapType === 'interior'
  const rawType = settings.type || settings.gridType || 'square'
  const size = Number.isFinite(Number(settings.size)) ? Number(settings.size) : interior ? 80 : 40
  const opacity = Number.isFinite(Number(settings.opacity)) ? Number(settings.opacity) : interior ? 0.36 : 0.28
  const scale = String(settings.scale || settings.movementScale || '1 square = 5 ft').trim()
  const color = /^#[0-9a-f]{3,8}$/i.test(String(settings.color || '')) ? settings.color : interior ? '#6f7780' : '#5b4630'
  return {
    enabled: settings.enabled !== undefined ? Boolean(settings.enabled) : interior,
    type: rawType === 'hex' ? 'hex' : 'square',
    size: clamp(size, 10, 240),
    opacity: clamp(opacity, 0.05, 0.9),
    color,
    snapToGrid: settings.snapToGrid !== undefined ? Boolean(settings.snapToGrid) : interior,
    scale: scale || '1 square = 5 ft',
  }
}

export function mapSnapshot(map) {
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

export function migrateLegacyObjects(map) {
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
        icon: STAMP_LIBRARY.find(item => item.name === stamp.stampType || item.id === stamp.stampType)?.icon || OBJECT_TYPES.stamp.icon,
        assetSrc: STAMP_LIBRARY.find(item => item.name === stamp.stampType || item.id === stamp.stampType)?.assetSrc,
        layerId: stamp.layerId || DEFAULT_OBJECT_LAYER_ID,
      },
    }, migrated.length))
  })
  return migrated
}

export function normalizeMapSchema(map) {
  const mapType = normalizeMapType(map?.mapType || map?.metadata?.mapType || 'region')
  const rawObjects = Array.isArray(map?.objects)
    ? map.objects
    : Array.isArray(map?.mapObjects)
      ? map.mapObjects
      : migrateLegacyObjects(map)
  const normalizedObjects = rawObjects.map(normalizeObject).map(object => {
    if (mapType !== 'interior') return object
    const genericNames = {
      room: new Set(['Land', 'Round Land', 'Shape']),
      corridor: new Set(['Road']),
      wall: new Set(['Border']),
    }
    const semanticType = object.type === 'shape'
      ? 'room'
      : object.type === 'road'
        ? 'corridor'
        : object.type === 'border'
          ? 'wall'
          : object.metadata?.semanticType
    if (!semanticType) return object
    const name = genericNames[semanticType]?.has(object.metadata?.name)
      ? semanticType[0].toUpperCase() + semanticType.slice(1)
      : object.metadata?.name
    return { ...object, metadata: { ...object.metadata, semanticType, name } }
  }).sort((a, b) => a.zIndex - b.zIndex)
  const rawLayers = Array.isArray(map?.layers) && map.layers.length
    ? map.layers
    : Array.isArray(map?.mapLayers) && map.mapLayers.length
      ? map.mapLayers
      : []
  const normalizedLayers = rawLayers.length
    ? rawLayers.map((layer, index) => ({
        id: layer.id || uid('layer'),
        name: layer.name || `Layer ${index + 1}`,
        visible: layer.visible !== false,
        locked: Boolean(layer.locked),
        zIndex: Number.isFinite(layer.zIndex) ? layer.zIndex : index,
      }))
    : []
  const shouldCategorize = Number(map?.schemaVersion || map?.version || 0) < SCHEMA_VERSION && !map?.metadata?.categorizedLayers
  const objects = normalizedObjects.map(object => {
    if (!shouldCategorize) return object
    const currentLayerId = object.metadata?.layerId || DEFAULT_OBJECT_LAYER_ID
    if (!DEFAULT_CATEGORY_LAYER_IDS.has(currentLayerId)) return object
    return { ...object, metadata: { ...object.metadata, layerId: defaultLayerIdForObject(object.type) } }
  })
  const categoryLayers = defaultLayers(mapType)
  const existingLayersById = new Map(normalizedLayers.map(layer => [layer.id, layer]))
  const usedCategoryIds = new Set(objects.map(object => object.metadata?.layerId || defaultLayerIdForObject(object.type)))
  const layers = [
    ...categoryLayers.filter(layer => usedCategoryIds.has(layer.id)).map(layer => ({ ...layer, ...(existingLayersById.get(layer.id) || {}), name: layer.name })),
    ...normalizedLayers.filter(layer => !DEFAULT_CATEGORY_LAYER_IDS.has(layer.id)),
  ].map((layer, index) => ({ ...layer, zIndex: index }))
  return {
    version: SCHEMA_VERSION,
    width: Number.isFinite(map?.width) ? map.width : MAP_W,
    height: Number.isFinite(map?.height) ? map.height : MAP_H,
    objects,
    layers,
    metadata: {
      ...(map?.metadata || {}),
      categorizedLayers: true,
      gridSettings: normalizeGridSettings(map?.metadata?.gridSettings, mapType),
      migratedFromTerrain: Boolean(rawObjects.length && !map?.objects && !map?.mapObjects),
    },
  }
}

export function exportPayload(map, schema) {
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

export function screenToMap(clientX, clientY, viewport, view) {
  const rect = viewport.getBoundingClientRect()
  return {
    x: (clientX - rect.left - view.pan.x) / view.zoom,
    y: (clientY - rect.top - view.pan.y) / view.zoom,
  }
}

export function toLocal(point, object) {
  const angle = -(object.rotation || 0) * Math.PI / 180
  const dx = point.x - object.x
  const dy = point.y - object.y
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle),
  }
}

export function localToMap(point, object) {
  const angle = (object.rotation || 0) * Math.PI / 180
  return {
    x: object.x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: object.y + point.x * Math.sin(angle) + point.y * Math.cos(angle),
  }
}

export function normalizedToLocal(point, object) {
  return {
    x: point.x * object.width,
    y: point.y * object.height,
  }
}

export function localToNormalized(point, object) {
  return {
    x: clamp(point.x / Math.max(1, object.width), -1.5, 1.5),
    y: clamp(point.y / Math.max(1, object.height), -1.5, 1.5),
  }
}

export function objectPointToMap(point, object) {
  return localToMap(normalizedToLocal(point, object), object)
}

export function pointsToObject(points, type, index, options = {}) {
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

export function shapeFromRect(start, end, shapeKind, index) {
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

export function moveLandToBase(object, current) {
  const minZ = Math.min(0, ...current.map(item => Number.isFinite(item.zIndex) ? item.zIndex : 0))
  return { ...object, zIndex: minZ - 1 }
}

export function objectContainsPoint(object, point) {
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

export function distanceToSegment(point, a, b) {
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

export function pointInPolygon(local, points) {
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

export function objectCorners(object) {
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

export function isLandObject(object) {
  const kind = object?.metadata?.shapeKind
  return object?.type === 'region' || object?.type === 'shape' || kind === 'polygon'
}

export function selectionBounds(objects) {
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
