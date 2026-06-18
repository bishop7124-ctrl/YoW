import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_CATEGORIES_BY_MAP_TYPE, DEFAULT_OBJECT_LAYER_ID, DEFAULT_ZOOM, DRAG_THRESHOLD_PX,
  LAND_FILL, LAND_STROKE, MAP_H, MAP_TYPE_OPTIONS, MAP_TYPE_TOOLSETS, MAP_W,
  MAX_ZOOM, MIN_SIZE, MIN_ZOOM, OBJECT_TYPES, POINT_DRAW_TOOLS, SCHEMA_VERSION, SNAP_SIZES,
  STAMP_LIBRARY, STYLE_PRESET_OPTIONS, TOOLBAR_MODES, WATER_FILL, WATER_STROKE, WHEEL_ZOOM_INTENSITY,
} from './mapConstants.js'
import {
  clamp, createLabelObject, createLocationObject, createObject, createStampObject,
  exportPayload, isLandObject, loadJson, localToNormalized, mapSnapshot, moveLandToBase,
  normalizeMapSchema, normalizeMapType, normalizeObject, objectContainsPoint, objectDisplayName,
  objectTypeLabel, pointsToObject, round, saveJson, screenToMap, shapeFromRect, toLocal, uid,
} from './mapUtils.js'
import {
  cursorForHandle, drawDraft, drawGrid, drawHoverHighlight, drawObject, drawSelection, hitHandle,
} from './mapDraw.js'
import {
  PanelTitle, StampPreview, InspectorTabButton, PropertyInput, ReadOnlyField,
  NumberInput, ColorInput, CheckboxInput, SelectInput,
} from './MapInspectorComponents.jsx'

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
  const hoveredIdRef = useRef(null)
  const hoverHandleRef = useRef(null)
  const activeMapRef = useRef(null)
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const spacePressedRef = useRef(false)

  const [mode, setMode] = useState('select')
  const [view, setView] = useState(viewRef.current)
  const [selectedIds, setSelectedIds] = useState([])
  const [hoveredId, setHoveredId] = useState(null)
  const [hoverHandle, setHoverHandle] = useState(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [newMapName, setNewMapName] = useState('')
  const [newLayerName, setNewLayerName] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [inspectorTab, setInspectorTab] = useState('object')
  const [activeLayerId, setActiveLayerId] = useState(DEFAULT_OBJECT_LAYER_ID)
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
  const [isMapModalOpen, setIsMapModalOpen] = useState(false)

  const schema = useMemo(() => normalizeMapSchema(activeMap), [activeMap])
  const objects = schema.objects
  const visibleObjects = useMemo(() => {
    const visibleLayers = new Set(schema.layers.filter(layer => layer.visible !== false).map(layer => layer.id))
    return objects
      .filter(object => object.visible !== false && visibleLayers.has(object.metadata?.layerId || DEFAULT_OBJECT_LAYER_ID))
      .sort((a, b) => a.zIndex - b.zIndex)
  }, [objects, schema.layers])
  const layerMap = useMemo(() => new Map(schema.layers.map(layer => [layer.id, layer])), [schema.layers])
  const selectedObjects = objects.filter(object => selectedIds.includes(object.id))
  const primarySelection = selectedObjects[0] || null
  const layerObjects = useMemo(() => [...objects].sort((a, b) => b.zIndex - a.zIndex), [objects])
  const selectedLayerId = primarySelection?.metadata?.layerId || DEFAULT_OBJECT_LAYER_ID
  const activeLayer = layerMap.get(activeLayerId) || schema.layers[0]
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
    hoveredIdRef.current = hoveredId
    requestRender()
  }, [hoveredId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    hoverHandleRef.current = hoverHandle
  }, [hoverHandle])

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
  }, [visibleObjects, selectedIds, hoveredId, activeMapType, activeStylePreset]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!schema.layers.some(layer => layer.id === activeLayerId)) {
      const timer = window.setTimeout(() => {
        setActiveLayerId(schema.layers[0]?.id || DEFAULT_OBJECT_LAYER_ID)
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [activeLayerId, schema.layers])

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

  useEffect(() => {
    const onStampAssetLoaded = () => requestRender()
    window.addEventListener('yow:stamp-asset-loaded', onStampAssetLoaded)
    return () => window.removeEventListener('yow:stamp-asset-loaded', onStampAssetLoaded)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const persistLayers = useCallback((nextLayers, extra = {}) => {
    updateActiveMapData(() => ({
      ...extra,
      schemaVersion: SCHEMA_VERSION,
      width: schema.width,
      height: schema.height,
      mapObjects: objectsRef.current.map(normalizeObject),
      mapLayers: nextLayers,
    }))
  }, [schema.height, schema.width, updateActiveMapData])

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
    const hoveredObject = visibleObjects.find(object => object.id === hoveredIdRef.current && !selectedIdsRef.current.includes(object.id))
    drawHoverHighlight(ctx, hoveredObject, viewRef.current.zoom)
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

  function placeObjectAtPoint(object, options = {}) {
    const layerId = activeLayer?.id || DEFAULT_OBJECT_LAYER_ID
    const placedObject = normalizeObject({
      ...object,
      metadata: { ...object.metadata, layerId },
    }, objectsRef.current.length)
    updateObjects(current => {
      const placed = placedObject.type === 'shape' ? moveLandToBase(placedObject, current) : placedObject
      return [...current, placed]
    })
    if (options.selectPlaced) setSelectedIds([placedObject.id])
  }

  function isObjectLockedByLayer(object) {
    return Boolean(layerMap.get(object.metadata?.layerId || DEFAULT_OBJECT_LAYER_ID)?.locked)
  }

  function isObjectEditable(object) {
    return Boolean(object) && !object.locked && !isObjectLockedByLayer(object)
  }

  function placeStampAt(point, stamp = selectedStamp) {
    if (!stamp) return
    const object = createStampObject(stamp, objectsRef.current.length, snapPoint(point))
    placeObjectAtPoint(object, { selectPlaced: false })
    setSelectedStampId(stamp.id)
    noteStampUsed(stamp.id)
  }

  function placeLabelAt(point) {
    placeObjectAtPoint(createLabelObject(objectsRef.current.length, snapPoint(point)), { selectPlaced: false })
  }

  function createLocationFromName(point) {
    const name = newLocationName.trim() || 'New Location'
    const location = saveLocation
      ? saveLocation({ name, category: activeMapType === 'interior' ? 'Landmark' : 'Other', description: '' })
      : { id: uid('location'), name, category: 'Other' }
    setNewLocationName('')
    setSelectedLocationId(location?.id || '')
    placeObjectAtPoint(createLocationObject(location, objectsRef.current.length, snapPoint(point)), { selectPlaced: false })
  }

  function placeLocationAt(point) {
    const linked = (locations || []).find(location => location.id === selectedLocationId)
    if (linked) placeObjectAtPoint(createLocationObject(linked, objectsRef.current.length, snapPoint(point)), { selectPlaced: false })
    else createLocationFromName(point)
  }

  function handlePointerDown(event) {
    if (!activeMap || event.button !== 0) return
    const viewport = viewportRef.current
    const point = screenToMap(event.clientX, event.clientY, viewport, viewRef.current)
    const selected = objectsRef.current
      .filter(object => selectedIdsRef.current.includes(object.id))
      .filter(isObjectEditable)
    const handle = hitHandle(point, selected, viewRef.current.zoom)
    const hit = hitTest(point)
    event.currentTarget.setPointerCapture(event.pointerId)

    const shiftPan = event.shiftKey && !hit && !handle
    if (mode === 'pan' || event.altKey || spacePressedRef.current || shiftPan) {
      setHoverHandle(null)
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
    if (hit && isObjectEditable(hit)) {
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
      setHoveredId(hit.id)
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
    setHoveredId(null)
    setHoverHandle(null)
  }

  function handlePointerMove(event) {
    const interaction = interactionRef.current
    if (!interaction) {
      if (draftRef.current?.points?.length && (POINT_DRAW_TOOLS.has(mode) || draftRef.current.kind === 'shapePolygon')) {
        const point = screenToMap(event.clientX, event.clientY, viewportRef.current, viewRef.current)
        setDraft(current => current ? { ...current, preview: point } : current)
        setHoveredId(null)
        setHoverHandle(null)
        return
      }
      if (mode === 'select') {
        const point = screenToMap(event.clientX, event.clientY, viewportRef.current, viewRef.current)
        const selected = objectsRef.current
          .filter(object => selectedIdsRef.current.includes(object.id))
          .filter(isObjectEditable)
        const handle = hitHandle(point, selected, viewRef.current.zoom)
        const hit = hitTest(point)
        const nextHoveredId = handle ? selected[0]?.id || null : hit?.id || null
        if (hoveredIdRef.current !== nextHoveredId) setHoveredId(nextHoveredId)
        const nextHandleKey = handle ? `${handle.type}:${handle.corner || handle.pointIndex || ''}:${handle.faceIndex || ''}` : null
        const currentHandleKey = hoverHandleRef.current ? `${hoverHandleRef.current.type}:${hoverHandleRef.current.corner || hoverHandleRef.current.pointIndex || ''}:${hoverHandleRef.current.faceIndex || ''}` : null
        if (currentHandleKey !== nextHandleKey) setHoverHandle(handle)
      } else if (!['pan', 'zoom'].includes(mode)) {
        setHoveredId(null)
        setHoverHandle(null)
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
      const baseShape = shapeFromRect(draftRef.current.start, draftRef.current.end, interaction.shapeKind, objectsRef.current.length)
      const object = normalizeObject({
        ...baseShape,
        metadata: {
          ...baseShape.metadata,
          layerId: activeLayer?.id || DEFAULT_OBJECT_LAYER_ID,
        },
      }, objectsRef.current.length)
      if (object.width > MIN_SIZE || object.height > MIN_SIZE) {
        updateObjects(current => {
          const placed = moveLandToBase(object, current)
          return [...current, placed]
        })
      }
      setDraft(null)
    }
    interactionRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function handlePointerLeave() {
    if (interactionRef.current) return
    setHoveredId(null)
    setHoverHandle(null)
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
      layerId: activeLayer?.id || DEFAULT_OBJECT_LAYER_ID,
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
    const objectWithLayer = normalizeObject({
      ...object,
      metadata: { ...object.metadata, layerId: activeLayer?.id || DEFAULT_OBJECT_LAYER_ID },
    }, objects.length)
    let selectedId = object.id
    updateObjects(current => {
      const placed = objectWithLayer.type === 'shape' ? moveLandToBase(objectWithLayer, current) : objectWithLayer
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
    updateObjects(current => current.map(object => ids.has(object.id) && isObjectEditable(object)
      ? {
          ...object,
          ...patch,
          metadata: patch.metadata ? { ...object.metadata, ...patch.metadata } : object.metadata,
        }
      : object))
  }

  function updateLayers(updater, options = {}) {
    const nextLayers = typeof updater === 'function' ? updater(schema.layers) : updater
    if (!options.skipHistory) pushUndoSnapshot()
    persistLayers(nextLayers.map((layer, index) => ({
      ...layer,
      id: layer.id || uid('layer'),
      name: layer.name || `Layer ${index + 1}`,
      visible: layer.visible !== false,
      locked: Boolean(layer.locked),
      zIndex: index,
    })))
  }

  function addLayer(event) {
    event?.preventDefault?.()
    const name = newLayerName.trim() || `Layer ${schema.layers.length + 1}`
    const id = uid('layer')
    updateLayers(current => [...current, { id, name, visible: true, locked: false, zIndex: current.length }])
    setNewLayerName('')
    setActiveLayerId(id)
    setInspectorTab('layers')
  }

  function renameLayer(layerId, name) {
    const nextName = name.trim()
    if (!nextName) return
    updateLayers(current => current.map(layer => layer.id === layerId ? { ...layer, name: nextName } : layer))
  }

  function deleteLayer(layerId) {
    if (layerId === DEFAULT_OBJECT_LAYER_ID || schema.layers.length <= 1) return
    pushUndoSnapshot()
    const nextLayers = schema.layers.filter(layer => layer.id !== layerId)
    const nextObjects = objectsRef.current.map(object => (object.metadata?.layerId || DEFAULT_OBJECT_LAYER_ID) === layerId
      ? { ...object, metadata: { ...object.metadata, layerId: DEFAULT_OBJECT_LAYER_ID } }
      : object)
    updateActiveMapData(() => ({
      schemaVersion: SCHEMA_VERSION,
      width: schema.width,
      height: schema.height,
      mapObjects: nextObjects.map(normalizeObject),
      mapLayers: nextLayers,
    }))
    if (activeLayerId === layerId) setActiveLayerId(DEFAULT_OBJECT_LAYER_ID)
  }

  function toggleLayerVisibility(layerId) {
    updateLayers(current => current.map(layer => layer.id === layerId ? { ...layer, visible: layer.visible === false } : layer))
  }

  function toggleLayerLock(layerId) {
    updateLayers(current => current.map(layer => layer.id === layerId ? { ...layer, locked: !layer.locked } : layer))
  }

  function moveSelectedToLayer(layerId) {
    patchSelected({ metadata: { layerId } })
    setActiveLayerId(layerId)
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
    setIsMapModalOpen(false)
    setTimeout(() => {
      selectMap(id)
      fitCanvasToViewport()
    }, 0)
  }

  function selectEditorMode(nextMode, options = {}) {
    const shouldToggleOff = options.toggle !== false && nextMode === mode && nextMode !== 'select'
    const resolvedMode = shouldToggleOff ? 'select' : nextMode
    setMode(resolvedMode)
    if (resolvedMode !== mode || shouldToggleOff) setDraft(null)
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
  const primaryLayerLocked = primarySelection ? isObjectLockedByLayer(primarySelection) : false
  const primaryEditable = primarySelection ? isObjectEditable(primarySelection) : false
  const canvasCursor = mode === 'pan'
    ? 'grab'
    : mode === 'zoom'
      ? 'zoom-in'
      : mode === 'select'
        ? cursorForHandle(hoverHandle) || (hoveredId ? 'move' : 'default')
        : POINT_DRAW_TOOLS.has(mode) || (mode === 'shape' && shapeKind === 'polygon')
          ? 'crosshair'
          : ['shape', 'stamp', 'label', 'location'].includes(mode)
            ? 'crosshair'
            : 'default'

  const activeModeLabel = TOOLBAR_MODES.find(item => item.id === mode)?.label || activeTypeConfig.tools.find(tool => tool.mode === mode)?.label || 'Select'

  return (
    <div data-tour="map-header" className="map-builder-shell">
      <main
        ref={viewportRef}
        className="map-builder-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
        onDragOver={event => event.preventDefault()}
        onDrop={handleDrop}
        style={{ cursor: canvasCursor }}
      >
        {activeMap ? (
          <>
            <canvas ref={canvasRef} className="map-builder-canvas" />
            <div className="map-builder-status-pill">
              <span>{MAP_W} × {MAP_H}</span>
              <span>{objects.length} objects</span>
              <span>{selectedIds.length} selected</span>
              {hoveredId && !selectedIds.includes(hoveredId) && <span>{objectDisplayName(objects.find(object => object.id === hoveredId))}</span>}
            </div>
          </>
        ) : (
          <div className="map-builder-empty">
            <strong>Start with a map.</strong>
            <span>Create a world, region, local, or interior map for this project.</span>
            <button className="btn btn-primary btn-sm" onClick={() => setIsMapModalOpen(true)}>New Map</button>
          </div>
        )}
      </main>

      <div className="map-builder-float map-builder-map-nav">
        <SelectInput
          label={`${activeTypeConfig.label} · ${activeModeLabel}`}
          value={activeMap?.id || ''}
          options={(project.maps || []).map(map => ({ value: map.id, label: map.name || 'Untitled Map' }))}
          onChange={value => selectMap(value)}
        />
        <button className="btn btn-primary btn-sm map-builder-add-map" onClick={() => setIsMapModalOpen(true)} title="New map" aria-label="New map">+</button>
      </div>

      <div className="map-builder-float map-builder-command-bar">
        <button className="btn btn-secondary btn-sm" onClick={() => selectEditorMode('select')} title="Select">↖</button>
        <button className="btn btn-secondary btn-sm" onClick={() => selectEditorMode('pan')} title="Pan">✥</button>
        <button className="btn btn-secondary btn-sm" onClick={undoMapChange} disabled={!canUndo} title="Undo">↶</button>
        <button className="btn btn-secondary btn-sm" onClick={redoMapChange} disabled={!canRedo} title="Redo">↷</button>
        <button className="btn btn-secondary btn-sm" onClick={() => zoomViewportCenter(0.86)} title="Zoom out">−</button>
        <span className="map-builder-zoom-readout">{Math.round(view.zoom * 100)}%</span>
        <button className="btn btn-secondary btn-sm" onClick={() => zoomViewportCenter(1.16)} title="Zoom in">+</button>
        <button className="btn btn-secondary btn-sm" onClick={fitCanvasToViewport}>Fit</button>
        <button className="btn btn-secondary btn-sm" onClick={downloadJson} disabled={!activeMap}>Export</button>
        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={event => importJson(event.target.files?.[0])} style={{ display: 'none' }} />
        {jsonStatus && <span className={jsonStatus === 'Invalid JSON' ? 'map-builder-status is-error' : 'map-builder-status'}>{jsonStatus}</span>}
      </div>

      <aside className="map-builder-float map-builder-tools">
          {!activeMap && (
            <button className="btn btn-primary btn-sm" onClick={() => setIsMapModalOpen(true)}>Create map</button>
          )}
          <section data-tour="map-tools" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: isCompact ? 180 : 0 }}>
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
            {(mode === 'river' || mode === 'road' || mode === 'border') && (
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
                    onClick={() => {
                      const sameStampBrush = mode === 'stamp' && selectedStampId === stamp.id
                      setSelectedStampId(stamp.id)
                      selectEditorMode('stamp', { toggle: sameStampBrush })
                    }}
                    title={`${stamp.name} (${stamp.category})`}
                    style={{ minHeight: 58, padding: 6, display: 'grid', gap: 3, justifyItems: 'center', borderColor: selectedStampId === stamp.id ? 'var(--accent)' : undefined, background: selectedStampId === stamp.id ? 'color-mix(in srgb, var(--accent) 16%, var(--surface2))' : undefined }}
                  >
                    <StampPreview stamp={stamp} size={30} />
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

      <aside className="map-builder-float map-builder-inspector">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, padding: 3, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)' }}>
            <InspectorTabButton active={inspectorTab === 'object'} onClick={() => setInspectorTab('object')}>Object</InspectorTabButton>
            <InspectorTabButton active={inspectorTab === 'layers'} onClick={() => setInspectorTab('layers')}>Layers</InspectorTabButton>
            <InspectorTabButton active={inspectorTab === 'map'} onClick={() => setInspectorTab('map')}>Map</InspectorTabButton>
          </div>

          {inspectorTab === 'object' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PanelTitle>Object Properties</PanelTitle>
            {primarySelection ? (
              <>
                {selectedIds.length > 1 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{selectedIds.length} objects selected. Changes apply to the selection.</div>}
                {primaryLayerLocked && <div style={{ color: '#d8942f', fontSize: 12, lineHeight: 1.4 }}>This object is on a locked layer. Unlock the layer before editing.</div>}
                <PropertyInput label="Name" value={objectDisplayName(primarySelection)} onChange={value => patchSelected({ metadata: { name: value } })} disabled={!primaryEditable} />
                <PropertyInput label="Text" value={primarySelection.metadata?.text || ''} onChange={value => patchSelected({ metadata: { text: value } })} disabled={!primaryEditable} />
                <SelectInput
                  label="Object layer"
                  value={selectedLayerId}
                  options={schema.layers.map(layer => ({ value: layer.id, label: layer.name }))}
                  onChange={moveSelectedToLayer}
                  disabled={!primaryEditable}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <NumberInput label="X" value={primarySelection.x} onChange={value => patchSelected({ x: value })} disabled={!primaryEditable} />
                  <NumberInput label="Y" value={primarySelection.y} onChange={value => patchSelected({ y: value })} disabled={!primaryEditable} />
                  <NumberInput label="W" value={primarySelection.width} min={MIN_SIZE} onChange={value => patchSelected({ width: value })} disabled={!primaryEditable} />
                  <NumberInput label="H" value={primarySelection.height} min={MIN_SIZE} onChange={value => patchSelected({ height: value })} disabled={!primaryEditable} />
                  <NumberInput label="Rotate" value={primarySelection.rotation} onChange={value => patchSelected({ rotation: value })} disabled={!primaryEditable} />
                  <NumberInput label="Order" value={primarySelection.zIndex} onChange={value => patchSelected({ zIndex: value })} disabled={!primaryEditable} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <ColorInput label="Fill" value={primarySelection.metadata?.fill || LAND_FILL} onChange={value => patchSelected({ metadata: { fill: value } })} disabled={!primaryEditable} />
                  <ColorInput label="Stroke" value={primarySelection.metadata?.stroke || LAND_STROKE} onChange={value => patchSelected({ metadata: { stroke: value } })} disabled={!primaryEditable} />
                </div>
                {primarySelection.type === 'label' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, alignItems: 'end' }}>
                    <NumberInput label="Font size" value={primarySelection.metadata?.fontSize || 34} min={10} onChange={value => patchSelected({ metadata: { fontSize: value } })} disabled={!primaryEditable} />
                    <CheckboxInput label="Curved" checked={Boolean(primarySelection.metadata?.curvedLabel)} onChange={value => patchSelected({ metadata: { curvedLabel: value } })} disabled={!primaryEditable} />
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
                    disabled={!primaryEditable}
                  />
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <NumberInput label="Opacity" value={round((primarySelection.metadata?.opacity ?? 1) * 100, 0)} min={0} onChange={value => patchSelected({ metadata: { opacity: clamp(value / 100, 0, 1) } })} disabled={!primaryEditable} />
                  <NumberInput label="Line" value={primarySelection.metadata?.lineThickness || 2} min={1} onChange={value => patchSelected({ metadata: { lineThickness: value } })} disabled={!primaryEditable} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <CheckboxInput label="Dashed" checked={Boolean(primarySelection.metadata?.dashed)} onChange={value => patchSelected({ metadata: { dashed: value } })} disabled={!primaryEditable} />
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
                      disabled={!primaryEditable}
                    />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" disabled={primaryLayerLocked} onClick={() => patchSelected({ locked: !primarySelection.locked })}>{primarySelection.locked ? 'Unlock' : 'Lock'}</button>
                  <button className="btn btn-secondary btn-sm" disabled={primaryLayerLocked} onClick={() => patchSelected({ visible: primarySelection.visible === false })}>{primarySelection.visible === false ? 'Show' : 'Hide'}</button>
                  <button className="btn btn-secondary btn-sm" disabled={!primaryEditable} onClick={duplicateSelectedObjects}>Duplicate</button>
                  {selectedIds.length > 1 && <button className="btn btn-secondary btn-sm" disabled={!primaryEditable} onClick={groupSelectedObjects}>Group selected</button>}
                  {selectedObjects.some(object => object.metadata?.groupId) && <button className="btn btn-secondary btn-sm" disabled={!primaryEditable} onClick={ungroupSelectedObjects}>Ungroup</button>}
                  <button className="btn btn-secondary btn-sm" disabled={!primaryEditable} onClick={() => moveLayer('front')}>Front</button>
                  <button className="btn btn-secondary btn-sm" disabled={!primaryEditable} onClick={() => moveLayer('back')}>Back</button>
                  <button className="btn btn-secondary btn-sm" disabled={!primaryEditable} onClick={deleteSelectedObjects}>Delete</button>
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>Select an object to edit its position, size, rotation, layer, visibility, lock state, and metadata.</div>
            )}
          </section>
          )}

          {inspectorTab === 'map' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PanelTitle>Maps</PanelTitle>
            <ReadOnlyField label="Current type" value={activeTypeConfig.label} />
            <SelectInput
              label="Style"
              value={activeStylePreset}
              options={STYLE_PRESET_OPTIONS}
              onChange={updateStylePreset}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setIsMapModalOpen(true)}>New Map</button>
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
                {['marker', 'shape', 'region', 'river', 'road', 'border'].map(type => {
                  const item = OBJECT_TYPES[type]
                  return (
                    <button key={type} className="btn btn-secondary btn-sm" onClick={() => addObject(type)} title={`Add ${item.label}`}>
                      {item.icon}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
          )}

          {inspectorTab === 'layers' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PanelTitle>Layers</PanelTitle>
            <form onSubmit={addLayer} style={{ display: 'flex', gap: 6 }}>
              <input
                value={newLayerName}
                onChange={event => setNewLayerName(event.target.value)}
                placeholder="New layer"
                style={{ minWidth: 0, flex: 1, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 7, padding: '7px 8px', fontFamily: 'inherit' }}
              />
              <button className="btn btn-primary btn-sm" type="submit">+</button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {schema.layers.map(layer => {
                const active = activeLayerId === layer.id
                const count = objects.filter(object => (object.metadata?.layerId || DEFAULT_OBJECT_LAYER_ID) === layer.id).length
                return (
                  <div key={layer.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) repeat(3, 28px)', gap: 4, alignItems: 'center', padding: 6, borderRadius: 7, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--surface2))' : 'var(--surface2)' }}>
                    <button onClick={() => setActiveLayerId(layer.id)} style={{ minWidth: 0, display: 'grid', gap: 1, padding: 0, border: 'none', background: 'transparent', color: 'var(--text)', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }}>
                      <input
                        defaultValue={layer.name}
                        onBlur={event => renameLayer(layer.id, event.target.value)}
                        onClick={event => event.stopPropagation()}
                        onKeyDown={event => {
                          if (event.key === 'Enter') event.currentTarget.blur()
                          if (event.key === 'Escape') {
                            event.currentTarget.value = layer.name
                            event.currentTarget.blur()
                          }
                        }}
                        style={{ minWidth: 0, border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: 0 }}
                      />
                      <span style={{ color: 'var(--faint)', fontSize: 10 }}>{count} object{count === 1 ? '' : 's'}{layer.locked ? ' · locked' : ''}</span>
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleLayerVisibility(layer.id)} title={layer.visible === false ? 'Show layer' : 'Hide layer'}>{layer.visible === false ? '○' : '●'}</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleLayerLock(layer.id)} title={layer.locked ? 'Unlock layer' : 'Lock layer'}>{layer.locked ? 'L' : 'U'}</button>
                    <button className="btn btn-secondary btn-sm" disabled={layer.id === DEFAULT_OBJECT_LAYER_ID || schema.layers.length <= 1} onClick={() => deleteLayer(layer.id)} title="Delete layer">×</button>
                  </div>
                )
              })}
            </div>
            <PanelTitle>Object Stack</PanelTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(objects.filter(isObjectEditable).map(object => object.id))} title="Select all editable objects">All</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds([])} title="Clear object selection">None</button>
              </div>
              {layerObjects.map((object, index) => {
                const selected = selectedIds.includes(object.id)
                const isTop = index === 0
                const isBottom = index === layerObjects.length - 1
                const objectEditable = isObjectEditable(object)
                const objectLayer = layerMap.get(object.metadata?.layerId || DEFAULT_OBJECT_LAYER_ID)
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
                          <span style={{ color: 'var(--faint)', fontSize: 10, textTransform: 'uppercase' }}>{objectTypeLabel(object)} · {objectLayer?.name || 'Objects'}{object.metadata?.groupId ? ' · group' : ''}</span>
                        </span>
                      </span>
                    </button>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 28px)', gap: 4 }}>
                      <button className="btn btn-secondary btn-sm" disabled={isTop || !objectEditable} onClick={event => { event.stopPropagation(); moveLayerObject(object.id, 1) }} title="Move up">↑</button>
                      <button className="btn btn-secondary btn-sm" disabled={isBottom || !objectEditable} onClick={event => { event.stopPropagation(); moveLayerObject(object.id, -1) }} title="Move down">↓</button>
                      <button className="btn btn-secondary btn-sm" disabled={isObjectLockedByLayer(object)} onClick={event => { event.stopPropagation(); toggleVisibility(object.id) }} title={object.visible === false ? 'Show' : 'Hide'}>{object.visible === false ? '○' : '●'}</button>
                      <button className="btn btn-secondary btn-sm" disabled={isObjectLockedByLayer(object)} onClick={event => { event.stopPropagation(); toggleLock(object.id) }} title={object.locked ? 'Unlock' : 'Lock'}>{object.locked ? 'L' : 'U'}</button>
                    </div>
                  </div>
                )
              })}
              {!objects.length && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No objects yet.</div>}
            </div>
          </section>
          )}
        </aside>

      {isMapModalOpen && (
        <div className="map-builder-modal-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setIsMapModalOpen(false)
        }}>
          <form className="map-builder-modal" role="dialog" aria-modal="true" aria-labelledby="map-builder-modal-title" onSubmit={handleCreateMap}>
            <header>
              <div>
                <p>New map</p>
                <h3 id="map-builder-modal-title">Create a map</h3>
              </div>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setIsMapModalOpen(false)} aria-label="Close">×</button>
            </header>
            <label>
              <span>Map name</span>
              <input
                autoFocus
                value={newMapName}
                onChange={event => setNewMapName(event.target.value)}
                placeholder="Aurethos World Map"
              />
            </label>
            <SelectInput
              label="Map type"
              value={mapType}
              options={MAP_TYPE_OPTIONS}
              onChange={setMapType}
            />
            <footer>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setIsMapModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" type="submit">Create map</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  )
}
