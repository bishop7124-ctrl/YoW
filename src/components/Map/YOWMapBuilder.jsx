import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MAP_W, MAP_H, DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, WHEEL_ZOOM_INTENSITY,
  DRAG_THRESHOLD_PX, MIN_SIZE, STYLE_PRESETS,
  TERRAIN_TYPES, TOOLS, POINT_DRAW_TOOLS, MAP_TYPE_TOOLS, STAMP_LIBRARY,
  LOCATION_ICON_OPTIONS, MAP_FONT_OPTIONS, MAP_TYPE_OPTIONS, SCHEMA_VERSION,
} from './mapConstants.js'
import {
  uid, clamp, round, screenToMap, snapToGrid,
  objectContainsPoint, normalizeObject, loadJson, saveJson,
} from './mapUtils.js'
import { drawBackground, drawMovementGrid, drawObject, drawDraft, drawHoverHighlight } from './mapDraw.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const PANEL_W = 260
const TOOLBAR_W = 88
const CMD_H = 48

const STYLE_SWATCHES = {
  parchment: '#e8d6a4',
  atlas: '#b4cfd8',
  campaign: '#e4d9c4',
  blueprint: '#1e2f50',
}

const MAP_TYPE_HELP = {
  world: 'Continents, oceans, and kingdoms',
  region: 'Provinces, routes, and landmarks',
  local: 'Towns, islands, and battlefields',
  interior: 'Dungeons, buildings, and rooms',
}

const MAP_TYPE_ICON = {
  world: '◎',
  region: '◇',
  local: '⌂',
  interior: '▦',
}

const STAMP_FALLBACK_ICON = {
  bridge: '╪',
  shrine: '✧',
  camp: '△',
  tower: '▵',
  landmark: '◆',
  ruins: '▥',
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MapBuilder({ store }) {
  const { mapProject: project, addMap, selectMap, deleteMap, renameMap, updateActiveMapData, saveLocation } = store

  if (!project) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Open a project to use the map builder.</div>
      </div>
    )
  }

  const activeMap = (project.maps || []).find(m => m.id === project.activeMapId) || null
  if (!activeMap) {
    return (
      <MapDashboard
        project={project}
        addMap={addMap}
        selectMap={selectMap}
        deleteMap={deleteMap}
        renameMap={renameMap}
      />
    )
  }

  return (
    <MapEditor
      key={activeMap.id}
      activeMap={activeMap}
      project={project}
      addMap={addMap}
      selectMap={selectMap}
      deleteMap={deleteMap}
      renameMap={renameMap}
      updateActiveMapData={updateActiveMapData}
      saveLocation={saveLocation}
    />
  )
}

// ─── Map Dashboard ────────────────────────────────────────────────────────────

function MapDashboard({ project, addMap, selectMap, deleteMap, renameMap }) {
  const [showModal, setShowModal] = useState(false)
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const maps = project.maps || []

  function handleCreate({ name, mapType, stylePreset }) {
    const id = addMap(name, mapType, { stylePreset })
    if (id) {
      setTimeout(() => selectMap(id), 0)
    }
    setShowModal(false)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', padding: '32px 40px', gap: 24, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Maps</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>New map</button>
      </div>

      {!maps.length ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 40 }}>🗺️</div>
            <div style={{ color: 'var(--text)', fontWeight: 600 }}>Create your first map</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Start shaping your world with landmasses, terrain, cities, and routes.</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>Create map</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {maps.map(map => (
            <div
              key={map.id}
              style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}
            >
              <div
                style={{ height: 120, background: map.metadata?.stylePreset === 'blueprint' ? '#1a2b4a' : map.metadata?.stylePreset === 'atlas' ? '#c0d8e4' : '#e8d6a4', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 32 }}
                onClick={() => selectMap(map.id)}
              >
                🗺️
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                {renamingId === map.id ? (
                  <input
                    autoFocus
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onBlur={() => { if (renameVal.trim()) renameMap(map.id, renameVal.trim()); setRenamingId(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') { if (renameVal.trim()) renameMap(map.id, renameVal.trim()); setRenamingId(null) } if (e.key === 'Escape') setRenamingId(null) }}
                    style={{ border: '1px solid var(--accent)', borderRadius: 5, padding: '4px 7px', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, width: '100%' }}
                  />
                ) : (
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', cursor: 'pointer' }} onDoubleClick={() => { setRenamingId(map.id); setRenameVal(map.name || '') }}>
                    {map.name || 'Untitled Map'}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>
                  {(map.mapType || 'region').replace('_', ' ')} · {(map.mapObjects || []).length} objects
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1, fontSize: 12 }} onClick={() => selectMap(map.id)}>Open</button>
                  <button className="btn btn-secondary btn-sm" style={{ fontSize: 12 }} onClick={() => { setRenamingId(map.id); setRenameVal(map.name || '') }}>Rename</button>
                  {maps.length > 1 && <button className="btn btn-secondary btn-sm" style={{ fontSize: 12 }} onClick={() => { if (confirm('Delete this map?')) deleteMap(map.id) }}>Delete</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && <NewMapModal onClose={() => setShowModal(false)} onCreate={handleCreate} />}
    </div>
  )
}

function NewMapModal({ onClose, onCreate }) {
  const [newMapName, setNewMapName] = useState('')
  const [newMapType, setNewMapType] = useState('region')
  const [newMapStyle, setNewMapStyle] = useState('parchment')

  function handleSubmit(e) {
    e.preventDefault()
    onCreate({
      name: newMapName.trim() || 'Untitled Map',
      mapType: newMapType,
      stylePreset: newMapStyle,
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'grid', placeItems: 'center', zIndex: 999 }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={handleSubmit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px 24px 22px', width: 'min(520px, calc(100vw - 32px))', display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>New map</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Create a map</h2>
        </div>

        <Field label="Map name">
          <input autoFocus value={newMapName} onChange={e => setNewMapName(e.target.value)} placeholder="Untitled Map" style={{ ...inputStyle, fontSize: 14, padding: '10px 12px' }} />
        </Field>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Map type</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {MAP_TYPE_OPTIONS.map(t => {
              const isActive = newMapType === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setNewMapType(t.value)}
                  aria-pressed={isActive}
                  style={{
                    minHeight: 86,
                    padding: '12px 14px',
                    borderRadius: 8,
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    background: isActive ? 'color-mix(in srgb, var(--accent) 12%, var(--surface2))' : 'var(--surface2)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: 6, background: isActive ? 'var(--accent)' : 'color-mix(in srgb, var(--text) 8%, transparent)', color: isActive ? '#fff' : 'var(--muted)', fontWeight: 800 }}>{MAP_TYPE_ICON[t.value] || '□'}</span>
                    <div style={{ fontWeight: 700, fontSize: 13, color: isActive ? 'var(--accent)' : 'var(--text)' }}>{t.label}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.35 }}>{MAP_TYPE_HELP[t.value] || 'Planning map'}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Visual style</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
            {STYLE_PRESETS.map(s => {
              const isActive = newMapStyle === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setNewMapStyle(s.value)}
                  aria-pressed={isActive}
                  style={{
                    padding: '8px 6px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    background: isActive ? 'color-mix(in srgb, var(--accent) 12%, var(--surface2))' : 'var(--surface2)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 5,
                    minWidth: 0,
                  }}
                >
                  <div style={{ width: '100%', height: 28, borderRadius: 5, background: STYLE_SWATCHES[s.value] || '#d8d0bc', border: '1px solid rgba(0,0,0,0.18)' }} />
                  <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--accent)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{s.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <button className="btn btn-secondary btn-sm" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" type="submit" style={{ minWidth: 100 }}>Create map</button>
        </div>
      </form>
    </div>
  )
}

// ─── Map Editor ───────────────────────────────────────────────────────────────

function MapEditor({ activeMap, project, addMap, selectMap, deleteMap, renameMap, updateActiveMapData, saveLocation }) {
  const canvasRef = useRef(null)
  const viewportRef = useRef(null)
  const frameRef = useRef(null)
  const interactionRef = useRef(null)
  const viewRef = useRef({ zoom: DEFAULT_ZOOM, pan: { x: 80, y: 80 } })
  const objectsRef = useRef([])
  const selectedIdsRef = useRef([])
  const hoveredIdRef = useRef(null)
  const draftRef = useRef(null)
  const activeMapRef = useRef(null)
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const spacePressedRef = useRef(false)

  const [mode, setMode] = useState('select')
  const [view, setView] = useState(viewRef.current)
  const [selectedIds, setSelectedIds] = useState([])
  const [hoveredId, setHoveredId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [stampSearch, setStampSearch] = useState('')
  const [stampCategory, setStampCategory] = useState('All')
  const [selectedTerrainType, setSelectedTerrainType] = useState('forest')
  const [selectedStampId, setSelectedStampId] = useState('capital')
  const [favoriteStamps, setFavoriteStamps] = useState(() => loadJson('yow_map_fav_stamps', []))
  const [recentStamps, setRecentStamps] = useState(() => loadJson('yow_map_recent_stamps', []))
  const [cursorMapPoint, setCursorMapPoint] = useState(null)
  const [modal, setModal] = useState(null) // { kind, point?, ... }
  const [showNewMapModal, setShowNewMapModal] = useState(false)
  const [inspectorTab, setInspectorTab] = useState('object')

  // Label tool config
  const [labelConfig, setLabelConfig] = useState({ text: '', fontSize: 40, fontFamily: MAP_FONT_OPTIONS[0].value, fontWeight: 600, fontStyle: 'normal', textColor: '#1a140a', outlineColor: '#f4e8c4', backgroundColor: 'transparent' })
  // Location tool config
  const [locConfig, setLocConfig] = useState({ name: '', markerIcon: 'pin', size: 64, linkToId: '', createNew: false })
  // Note tool config
  const [noteConfig, setNoteConfig] = useState({ title: '', body: '', gmOnly: false, visibility: 'private' })
  const [territoryConfig, setTerritoryConfig] = useState({ name: '', fill: '#7050a8', linkToId: '', createNewLocation: false })

  // Parse the stored map
  const schema = useMemo(() => parseMapSchema(activeMap), [activeMap])
  const objects = schema.objects
  const stylePreset = schema.metadata?.stylePreset || 'parchment'
  const gridSettings = useMemo(() => normalizeGrid(schema.metadata?.gridSettings, activeMap?.mapType), [schema.metadata?.gridSettings, activeMap?.mapType])
  const activeMapType = activeMap?.mapType || 'region'
  const isCampaign = ['dnd_campaign', 'tabletop_rpg'].includes(project?.type)

  const visibleObjects = useMemo(() => {
    return [...objects].filter(o => o.visible !== false).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
  }, [objects])

  const selectedObjects = objects.filter(o => selectedIds.includes(o.id))
  const primarySelection = selectedObjects[0] || null

  const allowedTools = MAP_TYPE_TOOLS[activeMapType] || MAP_TYPE_TOOLS.region
  const activeTools = TOOLS.filter(t => allowedTools.includes(t.id))

  const allStampCategories = useMemo(() => {
    const cats = new Set(STAMP_LIBRARY.map(s => s.category))
    return ['All', 'Favourites', 'Recent', ...cats]
  }, [])

  const filteredStamps = useMemo(() => {
    const q = stampSearch.trim().toLowerCase()
    return STAMP_LIBRARY.filter(s => {
      if (stampCategory === 'Favourites') return favoriteStamps.includes(s.id)
      if (stampCategory === 'Recent') return recentStamps.includes(s.id)
      if (stampCategory !== 'All' && s.category !== stampCategory) return false
      if (q) return `${s.name} ${s.category} ${s.keywords || ''}`.toLowerCase().includes(q)
      return true
    })
  }, [stampSearch, stampCategory, favoriteStamps, recentStamps])

  // Sync refs
  useEffect(() => { objectsRef.current = objects; selectedIdsRef.current = selectedIds }, [objects, selectedIds])
  useEffect(() => { hoveredIdRef.current = hoveredId; requestRender() }, [hoveredId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { activeMapRef.current = activeMap }, [activeMap])
  useEffect(() => { draftRef.current = draft; requestRender() }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { viewRef.current = view; requestRender() }, [view]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { undoStackRef.current = []; redoStackRef.current = [] }, [activeMap?.id])
  useEffect(() => { if (!['stamp', 'location', 'label', 'note'].includes(mode)) setCursorMapPoint(null) }, [mode])

  useEffect(() => {
    requestRender()
  }, [visibleObjects, selectedIds, cursorMapPoint, mode, selectedStampId, labelConfig, locConfig, noteConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = e => {
      const typing = e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
      if (typing) return
      if (e.code === 'Space') { spacePressedRef.current = true; return }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdsRef.current.length) { e.preventDefault(); deleteSelected(); return }
      if (e.key === 'Escape' && draftRef.current) { e.preventDefault(); setDraft(null); return }
      if (e.key === 'Enter' && draftRef.current?.points?.length >= 2) { e.preventDefault(); completeDraft(); return }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelectedIds(objectsRef.current.filter(o => !o.locked).map(o => o.id)); return }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && selectedIdsRef.current.length) { e.preventDefault(); duplicateSelected(); return }
      if (e.key === 'v' || e.key === 'V') { setMode('select'); setDraft(null) }
    }
    const onKeyUp = e => { if (e.code === 'Space') spacePressedRef.current = false }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Stamp asset event
  useEffect(() => {
    const onLoad = () => requestRender()
    window.addEventListener('yow:stamp-asset-loaded', onLoad)
    return () => window.removeEventListener('yow:stamp-asset-loaded', onLoad)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fit on mount
  useEffect(() => { fitCanvas() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persistence ────────────────────────────────────────────────────────────

  function persistObjects(nextObjects) {
    updateActiveMapData(() => ({
      schemaVersion: SCHEMA_VERSION,
      width: MAP_W, height: MAP_H,
      mapObjects: nextObjects,
      mapLayers: schema.layers,
      metadata: schema.metadata,
    }))
  }

  function persistMeta(patch) {
    updateActiveMapData(() => ({
      schemaVersion: SCHEMA_VERSION,
      width: MAP_W, height: MAP_H,
      mapObjects: objectsRef.current,
      mapLayers: schema.layers,
      metadata: { ...(schema.metadata || {}), ...patch },
    }))
  }

  // ── History ────────────────────────────────────────────────────────────────

  function takeSnapshot() {
    const cur = activeMapRef.current
    if (!cur) return
    undoStackRef.current = [...undoStackRef.current.slice(-39), {
      mapObjects: objectsRef.current.map(o => ({ ...o })),
      mapLayers: schema.layers,
      metadata: schema.metadata,
    }]
    redoStackRef.current = []
    setHistoryVersion(v => v + 1)
  }

  function applySnapshot(snap) {
    updateActiveMapData(() => ({ schemaVersion: SCHEMA_VERSION, width: MAP_W, height: MAP_H, ...snap }))
    setSelectedIds([]); setDraft(null)
  }

  function undo() {
    const prev = undoStackRef.current.pop()
    const cur = activeMapRef.current
    if (!prev || !cur) return
    redoStackRef.current = [...redoStackRef.current.slice(-39), { mapObjects: objectsRef.current, mapLayers: schema.layers, metadata: schema.metadata }]
    applySnapshot(prev); setHistoryVersion(v => v + 1)
  }

  function redo() {
    const next = redoStackRef.current.pop()
    const cur = activeMapRef.current
    if (!next || !cur) return
    undoStackRef.current = [...undoStackRef.current.slice(-39), { mapObjects: objectsRef.current, mapLayers: schema.layers, metadata: schema.metadata }]
    applySnapshot(next); setHistoryVersion(v => v + 1)
  }

  // ── Object mutations ────────────────────────────────────────────────────────

  function updateObjects(updater, { skipHistory } = {}) {
    if (!skipHistory) takeSnapshot()
    const next = typeof updater === 'function' ? updater(objectsRef.current) : updater
    persistObjects(next)
  }

  function patchSelected(patch) {
    const ids = new Set(selectedIds)
    updateObjects(cur => cur.map(o => ids.has(o.id) && !o.locked && !isLayerLocked(o)
      ? { ...o, ...patch, properties: patch.properties ? { ...o.properties, ...patch.properties } : o.properties, linkedEntity: patch.linkedEntity !== undefined ? patch.linkedEntity : o.linkedEntity }
      : o))
  }

  function deleteSelected() {
    const ids = new Set(selectedIdsRef.current)
    updateObjects(cur => cur.filter(o => !ids.has(o.id) || o.locked))
    setSelectedIds([])
  }

  function duplicateSelected() {
    const ids = new Set(selectedIds)
    const maxZ = Math.max(0, ...objectsRef.current.map(o => o.zIndex || 0))
    const copies = objectsRef.current.filter(o => ids.has(o.id) && !o.locked).map((o, i) => ({
      ...o, id: uid(o.type), x: (o.x || 0) + 36, y: (o.y || 0) + 36, zIndex: maxZ + i + 1,
      geometry: o.geometry ? { ...o.geometry, points: o.geometry.points?.map(p => ({ ...p })) } : null,
    }))
    if (!copies.length) return
    updateObjects(cur => [...cur, ...copies])
    setSelectedIds(copies.map(o => o.id))
  }

  function isLayerLocked() { return false }

  // ── Canvas rendering ────────────────────────────────────────────────────────

  function requestRender() {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => { frameRef.current = null; renderCanvas() })
  }

  function renderCanvas() {
    const canvas = canvasRef.current
    const vp = viewportRef.current
    if (!canvas || !vp) return
    const rect = vp.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.floor(rect.width * dpr))
    const h = Math.max(1, Math.floor(rect.height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h
      canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = '#2d3136'
    ctx.fillRect(0, 0, rect.width, rect.height)

    ctx.save()
    ctx.translate(viewRef.current.pan.x, viewRef.current.pan.y)
    ctx.scale(viewRef.current.zoom, viewRef.current.zoom)

    ctx.shadowColor = 'rgba(0,0,0,.28)'
    ctx.shadowBlur = 40 / viewRef.current.zoom
    ctx.shadowOffsetY = 12 / viewRef.current.zoom
    drawBackground(ctx, MAP_W, MAP_H, stylePreset)
    ctx.shadowColor = 'transparent'

    ctx.save()
    ctx.beginPath(); ctx.rect(0, 0, MAP_W, MAP_H); ctx.clip()
    drawMovementGrid(ctx, MAP_W, MAP_H, gridSettings)
    visibleObjects.forEach(o => drawObject(ctx, o, selectedIdsRef.current.includes(o.id), { style: stylePreset, mapType: activeMapType }))
    ctx.restore()

    // cursor preview
    if (cursorMapPoint && !modal && ['stamp', 'location'].includes(mode)) {
      const previewOpts = { style: stylePreset, mapType: activeMapType, preview: true }
      if (mode === 'stamp') {
        const stamp = STAMP_LIBRARY.find(s => s.id === selectedStampId)
        const size = stamp?.size || 80
        const prev = { id: 'preview', type: 'stamp', x: cursorMapPoint.x, y: cursorMapPoint.y, width: size, height: size, zIndex: 9999, properties: { stampId: selectedStampId, name: stamp?.name || '' } }
        ctx.save(); ctx.globalAlpha = 0.68; drawObject(ctx, prev, false, previewOpts); ctx.restore()
      } else if (mode === 'location') {
        const size = locConfig.size || 64
        const prev = { id: 'preview', type: 'location', x: cursorMapPoint.x, y: cursorMapPoint.y, width: size, height: size, zIndex: 9999, properties: { markerIcon: locConfig.markerIcon, name: '' } }
        ctx.save(); ctx.globalAlpha = 0.68; drawObject(ctx, prev, false, previewOpts); ctx.restore()
      }
    }

    // hover
    const hovObj = visibleObjects.find(o => o.id === hoveredIdRef.current && !selectedIdsRef.current.includes(o.id))
    drawHoverHighlight(ctx, hovObj, viewRef.current.zoom)

    // draft
    drawDraft(ctx, draftRef.current, viewRef.current.zoom)
    ctx.restore()
  }

  // ── View helpers ────────────────────────────────────────────────────────────

  function fitCanvas() {
    const vp = viewportRef.current
    if (!vp) return
    const rect = vp.getBoundingClientRect()
    const pad = 80
    const zoom = clamp(Math.min((rect.width - pad) / MAP_W, (rect.height - pad) / MAP_H, 1), MIN_ZOOM, MAX_ZOOM)
    const next = { zoom, pan: { x: (rect.width - MAP_W * zoom) / 2, y: (rect.height - MAP_H * zoom) / 2 } }
    viewRef.current = next; setView(next)
  }

  function zoomAt(clientX, clientY, factor) {
    const vp = viewportRef.current; if (!vp) return
    const rect = vp.getBoundingClientRect()
    const cur = viewRef.current
    const nextZoom = clamp(cur.zoom * factor, MIN_ZOOM, MAX_ZOOM)
    const sx = clientX - rect.left, sy = clientY - rect.top
    const mapX = (sx - cur.pan.x) / cur.zoom, mapY = (sy - cur.pan.y) / cur.zoom
    setView({ zoom: nextZoom, pan: { x: sx - mapX * nextZoom, y: sy - mapY * nextZoom } })
  }

  function zoomCenter(factor) {
    const vp = viewportRef.current; if (!vp) return
    const rect = vp.getBoundingClientRect()
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }

  // ── Hit test ────────────────────────────────────────────────────────────────

  function hitTest(point) {
    // Non-polygon first (top to bottom z-order)
    for (let i = visibleObjects.length - 1; i >= 0; i--) {
      const o = visibleObjects[i]
      if (!o.geometry?.type && objectContainsPoint(o, point)) return o
    }
    // Then polygons/paths
    for (let i = visibleObjects.length - 1; i >= 0; i--) {
      const o = visibleObjects[i]
      if (o.geometry?.type && objectContainsPoint(o, point)) return o
    }
    return null
  }

  function getSnappedPoint(point) {
    return gridSettings.snapToGrid ? snapToGrid(point, gridSettings.size || 40, true) : point
  }

  // ── Draft drawing ───────────────────────────────────────────────────────────

  function startOrExtendDraft(rawPoint, tool, shouldClose = false) {
    const point = getSnappedPoint(rawPoint)
    setDraft(cur => {
      const sameTool = cur?.kind === tool
      if (!sameTool) {
        return { kind: tool, points: [point], preview: point }
      }
      const pts = cur.points
      const first = pts[0]
      const dist = Math.hypot(point.x - first.x, point.y - first.y)
      const isPolygon = tool === 'shape' || tool === 'terrain' || tool === 'region'
      const minClose = isPolygon ? 3 : 2
      const closesOnOrigin = isPolygon && pts.length >= minClose && dist <= Math.max(10, 18 / viewRef.current.zoom)
      if (shouldClose || closesOnOrigin) {
        if (pts.length >= minClose) { setTimeout(() => completeDraft({ ...cur, points: pts }), 0); return null }
        return cur
      }
      return { ...cur, points: [...pts, point], preview: point }
    })
  }

  function completeDraft(source) {
    const src = source || draftRef.current
    if (!src?.points?.length) return
    const isPolygon = ['shape', 'terrain', 'region'].includes(src.kind)
    const minPts = isPolygon ? 3 : 2
    if (src.points.length < minPts) { setDraft(null); return }

    // Map tool ID to object type
    const typeMap = { terrain: 'region', region: 'territory', shape: 'shape', river: 'river', road: 'road', border: 'border', mountain: 'mountain' }
    const objectType = typeMap[src.kind] || src.kind

    const maxZ = Math.max(0, ...objectsRef.current.map(o => o.zIndex || 0)) + 1
    const obj = normalizeObject({
      id: uid(objectType),
      type: objectType,
      x: 0, y: 0, width: 0, height: 0,
      zIndex: maxZ,
      geometry: {
        type: isPolygon ? 'polygon' : 'path',
        points: src.points,
      },
      properties: getDefaultProperties(src.kind),
    })
    updateObjects(cur => [...cur, obj])
    setSelectedIds([obj.id])
    setDraft(null)

    // Political regions need a name — open naming modal
    if (objectType === 'territory') {
      setModal({ kind: 'territory', objectId: obj.id })
    } else {
      setMode('select')
    }
  }

  function getDefaultProperties(kind) {
    switch (kind) {
      case 'shape': return { fill: '#1e3d20', stroke: '#142a16', organicEdges: true }
      case 'terrain': return { fill: TERRAIN_TYPES.find(t => t.value === selectedTerrainType)?.color || '#6b9e44', stroke: '#2a3a18', opacity: 0.44, terrainType: selectedTerrainType }
      case 'region': return { fill: TERRAIN_TYPES.find(t => t.value === selectedTerrainType)?.color || '#6b9e44', stroke: '#2a3a18', opacity: 0.44, terrainType: selectedTerrainType } // legacy compat
      case 'territory': return { fill: '#7050a8', stroke: '#4a3070', opacity: 0.14, name: '' }
      case 'river': return { stroke: '#3a80b0', lineThickness: 7 }
      case 'road': return { stroke: '#8b6030', lineThickness: 5 }
      case 'border': return { stroke: '#9050a0', lineThickness: 4 }
      case 'mountain': return { fill: '#7a7060', stroke: '#3a3228', lineThickness: 22 }
      default: return {}
    }
  }

  // ── Place objects ───────────────────────────────────────────────────────────

  function placeStampAt(rawPoint) {
    const point = getSnappedPoint(rawPoint)
    const stamp = STAMP_LIBRARY.find(s => s.id === selectedStampId) || STAMP_LIBRARY[0]
    const size = stamp.size || 80
    const maxZ = Math.max(0, ...objectsRef.current.map(o => o.zIndex || 0)) + 1
    const obj = normalizeObject({ id: uid('stamp'), type: 'stamp', x: point.x, y: point.y, width: size, height: size, zIndex: maxZ, properties: { stampId: stamp.id, name: stamp.name, showLabel: true } })
    updateObjects(cur => [...cur, obj])
    setSelectedIds([obj.id])
    setRecentStamps(prev => { const next = [stamp.id, ...prev.filter(id => id !== stamp.id)].slice(0, 10); saveJson('yow_map_recent_stamps', next); return next })
  }

  function placeLocationAt(point, config) {
    let locationId = config.linkToId || null
    let locationName = config.name.trim() || 'Location'
    if (config.createNew && config.name.trim() && saveLocation) {
      const created = saveLocation({ name: config.name.trim(), category: 'Other', description: '' })
      if (created?.id) { locationId = created.id; locationName = created.name || config.name.trim() }
    } else if (config.linkToId) {
      const linked = (project.locations || []).find(l => l.id === config.linkToId)
      if (linked) locationName = linked.name || locationName
    }
    const size = config.size || 64
    const maxZ = Math.max(0, ...objectsRef.current.map(o => o.zIndex || 0)) + 1
    const obj = normalizeObject({
      id: uid('location'), type: 'location', x: point.x, y: point.y,
      width: size, height: size, zIndex: maxZ,
      properties: { name: locationName, markerIcon: config.markerIcon || 'pin', showLabel: true },
      linkedEntity: locationId ? { entityType: 'location', entityId: locationId } : null,
    })
    updateObjects(cur => [...cur, obj])
    setSelectedIds([obj.id])
  }

  function placeLabelAt(point, config) {
    const text = config.text.trim()
    if (!text) return
    const fontSize = config.fontSize || 40
    const w = Math.max(180, text.length * fontSize * 0.62)
    const h = Math.max(64, fontSize * 1.7)
    const maxZ = Math.max(0, ...objectsRef.current.map(o => o.zIndex || 0)) + 1
    const obj = normalizeObject({
      id: uid('label'), type: 'label', x: point.x, y: point.y,
      width: w, height: h, zIndex: maxZ,
      properties: { name: text, text, ...config },
    })
    updateObjects(cur => [...cur, obj])
    setSelectedIds([obj.id])
  }

  function placeNoteAt(point, config) {
    const maxZ = Math.max(0, ...objectsRef.current.map(o => o.zIndex || 0)) + 1
    const obj = normalizeObject({
      id: uid('note'), type: 'note', x: point.x, y: point.y,
      width: 80, height: 88, zIndex: maxZ,
      properties: { title: config.title || '', name: config.title || 'Note', notes: config.body || '', gmOnly: Boolean(config.gmOnly), visibility: config.gmOnly ? 'private' : (config.visibility || 'private') },
    })
    updateObjects(cur => [...cur, obj])
    setSelectedIds([obj.id])
  }

  // ── Pointer events ──────────────────────────────────────────────────────────

  function handlePointerDown(e) {
    if (!activeMap || e.button !== 0) return
    const vp = viewportRef.current
    const point = screenToMap(e.clientX, e.clientY, vp, viewRef.current)
    e.currentTarget.setPointerCapture(e.pointerId)

    // pan modes
    if (mode === 'pan' || e.altKey || spacePressedRef.current || (e.shiftKey && !hitTest(point))) {
      interactionRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, startPan: viewRef.current.pan }
      return
    }
    if (mode === 'zoom') { zoomAt(e.clientX, e.clientY, e.shiftKey ? 0.78 : 1.22); return }

    // drawing tools
    if (POINT_DRAW_TOOLS.has(mode)) { startOrExtendDraft(point, mode, e.detail >= 2); return }

    // stamp
    if (mode === 'stamp') { placeStampAt(point); return }

    // location
    if (mode === 'location') {
      setLocConfig({ name: '', markerIcon: 'pin', size: 64, linkToId: '', createNew: false })
      setModal({ kind: 'location', point: getSnappedPoint(point) })
      return
    }

    // label
    if (mode === 'label') {
      setLabelConfig(c => ({ ...c, text: '' }))
      setModal({ kind: 'label', point: getSnappedPoint(point) })
      return
    }

    // note
    if (mode === 'note') {
      setNoteConfig({ title: '', body: '', gmOnly: false, visibility: 'private' })
      setModal({ kind: 'note', point: getSnappedPoint(point) })
      return
    }

    // select
    const hit = hitTest(point)
    if (hit && !hit.locked && !isLayerLocked(hit)) {
      const additive = e.shiftKey || e.metaKey || e.ctrlKey
      const next = additive
        ? (selectedIdsRef.current.includes(hit.id) ? selectedIdsRef.current.filter(id => id !== hit.id) : [...selectedIdsRef.current, hit.id])
        : selectedIdsRef.current.includes(hit.id) ? selectedIdsRef.current : [hit.id]
      setSelectedIds(next)
      interactionRef.current = {
        type: 'drag',
        startClientX: e.clientX, startClientY: e.clientY, hasMoved: false, startPoint: point,
        startObjects: objectsRef.current.filter(o => next.includes(o.id)).map(o => ({ id: o.id, x: o.x || 0, y: o.y || 0, geometry: o.geometry })),
      }
      return
    }
    if (!e.shiftKey) setSelectedIds([])
    setHoveredId(null)
  }

  function handlePointerMove(e) {
    const ia = interactionRef.current
    const pt = screenToMap(e.clientX, e.clientY, viewportRef.current, viewRef.current)

    if (!ia && ['stamp', 'location'].includes(mode) && !modal) {
      setCursorMapPoint(getSnappedPoint(pt))
    }

    if (!ia) {
      if (draftRef.current?.points?.length && POINT_DRAW_TOOLS.has(mode)) {
        setDraft(cur => cur ? { ...cur, preview: getSnappedPoint(pt) } : cur)
        setHoveredId(null)
        return
      }
      if (mode === 'select') {
        const hit = hitTest(pt)
        if (hoveredIdRef.current !== (hit?.id || null)) setHoveredId(hit?.id || null)
      }
      return
    }

    if (ia.type === 'pan') {
      setView(cur => ({ ...cur, pan: { x: ia.startPan.x + e.clientX - ia.startX, y: ia.startPan.y + e.clientY - ia.startY } }))
      return
    }

    if (ia.type === 'drag') {
      const screenDist = Math.hypot(e.clientX - ia.startClientX, e.clientY - ia.startClientY)
      if (!ia.hasMoved && screenDist < DRAG_THRESHOLD_PX) return
      if (!ia.hasMoved) { takeSnapshot(); ia.hasMoved = true }
      const dx = pt.x - ia.startPoint.x, dy = pt.y - ia.startPoint.y
      updateObjects(cur => cur.map(o => {
        const start = ia.startObjects.find(s => s.id === o.id)
        if (!start || o.locked) return o
        if (o.geometry?.type === 'polygon' || o.geometry?.type === 'path') {
          const pts = start.geometry?.points || []
          return { ...o, geometry: { ...o.geometry, points: pts.map(p => getSnappedPoint({ x: p.x + dx, y: p.y + dy })) } }
        }
        return { ...o, ...getSnappedPoint({ x: start.x + dx, y: start.y + dy }) }
      }), { skipHistory: true })
    }
  }

  function handlePointerUp(e) {
    if (interactionRef.current?.type === 'drag' && !interactionRef.current.hasMoved && selectedIds.length === 1) {
      // single click on already-selected object — keep selection
    }
    interactionRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  function handlePointerLeave() {
    if (!interactionRef.current) { setCursorMapPoint(null); setHoveredId(null) }
  }

  // Wheel zoom is attached via useEffect with passive:false so preventDefault works.
  // The JSX onWheel is a no-op fallback.
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e) => {
      e.preventDefault()
      const norm = Math.max(-120, Math.min(120, e.deltaY))
      const factor = Math.exp(-norm * WHEEL_ZOOM_INTENSITY)
      const rect = vp.getBoundingClientRect()
      const cur = viewRef.current
      const nextZoom = clamp(cur.zoom * factor, MIN_ZOOM, MAX_ZOOM)
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top
      const mapX = (sx - cur.pan.x) / cur.zoom, mapY = (sy - cur.pan.y) / cur.zoom
      const next = { zoom: nextZoom, pan: { x: sx - mapX * nextZoom, y: sy - mapY * nextZoom } }
      viewRef.current = next
      setView(next)
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export PNG ──────────────────────────────────────────────────────────────

  function exportPng() {
    const scale = 2
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = MAP_W * scale; exportCanvas.height = MAP_H * scale
    const ctx = exportCanvas.getContext('2d')
    ctx.scale(scale, scale)
    const opts = { style: stylePreset, mapType: activeMapType }
    drawBackground(ctx, MAP_W, MAP_H, stylePreset)
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, MAP_W, MAP_H); ctx.clip()
    drawMovementGrid(ctx, MAP_W, MAP_H, gridSettings)
    visibleObjects.forEach(o => drawObject(ctx, o, false, opts))
    ctx.restore()
    exportCanvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${(activeMap.name || 'map').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`; a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  function handleCreateMap({ name, mapType, stylePreset }) {
    const id = addMap(name, mapType, { stylePreset })
    if (id) setTimeout(() => selectMap(id), 0)
    setShowNewMapModal(false)
  }

  // ── Modals ──────────────────────────────────────────────────────────────────

  const canUndo = historyVersion >= 0 && undoStackRef.current.length > 0
  const canRedo = historyVersion >= 0 && redoStackRef.current.length > 0

  const canvasCursor = mode === 'pan' || spacePressedRef.current ? 'grab'
    : mode === 'zoom' ? 'zoom-in'
    : mode === 'select' ? (hoveredId ? 'move' : 'default')
    : POINT_DRAW_TOOLS.has(mode) ? 'crosshair'
    : ['stamp', 'location', 'label', 'note'].includes(mode) ? 'crosshair'
    : 'default'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#2a2e33', overflow: 'hidden' }}>

      {/* Command bar */}
      <div style={{ height: CMD_H, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', flexShrink: 0, zIndex: 10 }}>
        {/* Map switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            value={activeMap.id}
            onChange={e => selectMap(e.target.value)}
            style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 6, padding: '4px 8px', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, maxWidth: 160 }}
          >
            {(project.maps || []).map(m => <option key={m.id} value={m.id}>{m.name || 'Untitled'}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" title="New map" onClick={() => setShowNewMapModal(true)} style={{ fontSize: 13, lineHeight: 1 }}>+</button>
        </div>
        <span style={{ fontSize: 10, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{activeMapType}</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
        <button className="btn btn-secondary btn-sm" onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)">↷</button>
        <div style={{ width: 1, background: 'var(--border)', height: 20, margin: '0 4px' }} />
        <button className="btn btn-secondary btn-sm" onClick={() => zoomCenter(0.82)} title="Zoom out">−</button>
        <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 42, textAlign: 'center' }}>{Math.round(view.zoom * 100)}%</span>
        <button className="btn btn-secondary btn-sm" onClick={() => zoomCenter(1.2)} title="Zoom in">+</button>
        <button className="btn btn-secondary btn-sm" onClick={() => fitCanvas()} title="Fit to screen" style={{ fontSize: 11 }}>Fit</button>
        <div style={{ width: 1, background: 'var(--border)', height: 20, margin: '0 4px' }} />
        <select
          value={stylePreset}
          onChange={e => persistMeta({ stylePreset: e.target.value })}
          style={{ height: 28, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', borderRadius: 6, padding: '0 8px', fontSize: 12, fontFamily: 'inherit' }}
        >
          {STYLE_PRESETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={exportPng} style={{ fontSize: 12 }}>Export PNG</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left toolbar */}
        <div style={{ width: TOOLBAR_W, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: '8px 6px', gap: 2, flexShrink: 0, overflowY: 'auto' }}>
          {activeTools.map((tool, idx) => {
            const prevTool = activeTools[idx - 1]
            const showSep = prevTool && prevTool.group !== tool.group
            const isActive = mode === tool.id
            return (
              <div key={tool.id} style={{ display: 'contents' }}>
                {showSep && <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />}
                <button
                  title={tool.label}
                  onClick={() => { setMode(isActive ? 'select' : tool.id); setDraft(null) }}
                  style={{
                    borderRadius: 7,
                    border: isActive ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2, padding: '7px 4px 6px',
                    fontFamily: 'inherit',
                    background: isActive ? 'color-mix(in srgb, var(--accent) 18%, var(--surface2))' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--muted)',
                    transition: 'background 0.1s, color 0.1s, border-color 0.1s',
                  }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1 }}>{tool.icon}</span>
                  <span style={{ fontSize: 9, lineHeight: 1, fontWeight: isActive ? 700 : 400, letterSpacing: '0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 72 }}>{tool.label}</span>
                </button>
              </div>
            )
          })}

          {/* Terrain type picker */}
          {mode === 'terrain' && (
            <div style={{ position: 'absolute', left: TOOLBAR_W, top: CMD_H + 8, width: 196, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 6, boxShadow: 'var(--shadow-md)' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', marginBottom: 2 }}>Terrain type</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>Click to select, then draw on the canvas.</div>
              {TERRAIN_TYPES.map(t => {
                const isActive = selectedTerrainType === t.value
                return (
                  <button
                    key={t.value}
                    onClick={() => setSelectedTerrainType(t.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                      borderRadius: 7, border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                      background: isActive ? 'color-mix(in srgb, var(--accent) 12%, var(--surface2))' : 'var(--surface2)',
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    <span style={{ width: 18, height: 18, borderRadius: 4, background: t.color, flexShrink: 0, border: '1px solid rgba(0,0,0,0.18)' }} />
                    <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--accent)' : 'var(--text)' }}>{t.label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Stamp picker */}
          {mode === 'stamp' && (
            <div style={{ position: 'absolute', left: TOOLBAR_W, top: CMD_H + 8, width: 220, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'var(--shadow-md)', maxHeight: '80vh', overflow: 'hidden' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)' }}>Stamps</div>
              <input value={stampSearch} onChange={e => setStampSearch(e.target.value)} placeholder="Search stamps" style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }} />
              <select value={stampCategory} onChange={e => setStampCategory(e.target.value)} style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }}>
                {allStampCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, overflowY: 'auto', flex: 1 }}>
                {filteredStamps.map(stamp => (
                  <button
                    key={stamp.id}
                    onClick={() => setSelectedStampId(stamp.id)}
                    title={stamp.name}
                    style={{
                      minHeight: 76,
                      padding: '6px 4px', borderRadius: 7, border: `2px solid ${selectedStampId === stamp.id ? 'var(--accent)' : 'var(--border)'}`,
                      background: selectedStampId === stamp.id ? 'color-mix(in srgb, var(--accent) 14%, var(--surface2))' : 'var(--surface2)',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                      fontFamily: 'inherit',
                    }}
                  >
                    {stamp.assetSrc ? (
                      <img
                        src={stamp.assetSrc}
                        alt=""
                        draggable={false}
                        style={{
                          width: 42,
                          height: 42,
                          objectFit: 'contain',
                          filter: selectedStampId === stamp.id ? 'drop-shadow(0 0 5px color-mix(in srgb, var(--accent) 45%, transparent))' : 'drop-shadow(0 2px 2px rgba(0,0,0,0.25))',
                        }}
                      />
                    ) : (
                      <span style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 8, background: '#8f6a33', color: '#fff', fontWeight: 800, fontSize: 20 }}>{STAMP_FALLBACK_ICON[stamp.id] || '✦'}</span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{stamp.name}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: 11 }}
                  onClick={() => setFavoriteStamps(prev => {
                    const next = prev.includes(selectedStampId) ? prev.filter(id => id !== selectedStampId) : [...prev, selectedStampId]
                    saveJson('yow_map_fav_stamps', next); return next
                  })}
                >{favoriteStamps.includes(selectedStampId) ? '★ Unfave' : '☆ Favourite'}</button>
              </div>
            </div>
          )}
        </div>

        {/* Canvas */}
        <main
          ref={viewportRef}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: canvasCursor }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

          {/* Status pill */}
          <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 8, background: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)', pointerEvents: 'none' }}>
            <span>{MAP_W} × {MAP_H}</span>
            <span>{objects.length} objects</span>
            {selectedIds.length > 0 && <span>{selectedIds.length} selected</span>}
          </div>

          {/* Draft hint */}
          {draft && (
            <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.68)', color: '#fff', borderRadius: 8, padding: '6px 14px', fontSize: 12, display: 'flex', gap: 12, backdropFilter: 'blur(4px)' }}>
              <span>{draft.points.length} points</span>
              <span>Enter or double-click to finish</span>
              <button onClick={() => completeDraft()} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 12 }}>Done</button>
              <button onClick={() => setDraft(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 12 }}>Cancel</button>
            </div>
          )}
        </main>

        {/* Right inspector */}
        <aside style={{ width: PANEL_W, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto', zIndex: 5 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, padding: 8, borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => setInspectorTab('object')} style={tabStyle(inspectorTab === 'object')}>Object</button>
            <button onClick={() => setInspectorTab('layers')} style={tabStyle(inspectorTab === 'layers')}>Layers</button>
            <button onClick={() => setInspectorTab('map')} style={tabStyle(inspectorTab === 'map')}>Map</button>
          </div>

          <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
            {inspectorTab === 'object' ? (
              <ObjectInspector
                primarySelection={primarySelection}
                selectedIds={selectedIds}
                patchSelected={patchSelected}
                deleteSelected={deleteSelected}
                duplicateSelected={duplicateSelected}
                project={project}
                isCampaign={isCampaign}
                locations={project.locations || []}
              />
            ) : inspectorTab === 'layers' ? (
              <LayersPanel
                objects={objects}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                updateObjects={updateObjects}
                setMode={setMode}
              />
            ) : (
              <MapInspector
                activeMap={activeMap}
                project={project}
                stylePreset={stylePreset}
                gridSettings={gridSettings}
                persistMeta={persistMeta}
                selectMap={selectMap}
                deleteMap={deleteMap}
                renameMap={renameMap}
                onOpenNewMap={() => setShowNewMapModal(true)}
              />
            )}
          </div>
        </aside>
      </div>

      {/* Modals */}
      {modal && (
        <MapModal
          modal={modal}
          onClose={() => { setModal(null); setMode('select') }}
          locConfig={locConfig} setLocConfig={setLocConfig}
          labelConfig={labelConfig} setLabelConfig={setLabelConfig}
          noteConfig={noteConfig} setNoteConfig={setNoteConfig}
          territoryConfig={territoryConfig} setTerritoryConfig={setTerritoryConfig}
          locations={project.locations || []}
          isCampaign={isCampaign}
          onConfirm={() => {
            if (modal.kind === 'location' && modal.point) { placeLocationAt(modal.point, locConfig); setModal(null); setMode('select') }
            if (modal.kind === 'label' && modal.point && labelConfig.text.trim()) { placeLabelAt(modal.point, labelConfig); setModal(null); setMode('select') }
            if (modal.kind === 'note' && modal.point) { placeNoteAt(modal.point, noteConfig); setModal(null); setMode('select') }
            if (modal.kind === 'territory' && modal.objectId) {
              const name = (territoryConfig.name || '').trim()
              let locationId = territoryConfig.linkToId || null
              if (territoryConfig.createNewLocation && name && saveLocation) {
                const loc = saveLocation({ name, category: 'Region', description: '' })
                if (loc?.id) locationId = loc.id
              }
              const ids = new Set([modal.objectId])
              updateObjects(cur => cur.map(o => ids.has(o.id)
                ? { ...o, properties: { ...o.properties, name, fill: territoryConfig.fill || o.properties.fill }, linkedEntity: locationId ? { entityType: 'location', entityId: locationId } : null }
                : o))
              setTerritoryConfig({ name: '', fill: '#7050a8', linkToId: '', createNewLocation: false })
              setModal(null); setMode('select')
            }
          }}
        />
      )}
      {showNewMapModal && (
        <NewMapModal
          onClose={() => setShowNewMapModal(false)}
          onCreate={handleCreateMap}
        />
      )}
    </div>
  )
}

// ─── Object Inspector ─────────────────────────────────────────────────────────

function ObjectInspector({ primarySelection, selectedIds, patchSelected, deleteSelected, duplicateSelected, project, isCampaign, locations }) {
  if (!primarySelection) {
    return <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>Select an object on the canvas to edit its properties.</div>
  }

  const o = primarySelection
  const multi = selectedIds.length > 1

  function prop(key) { return o.properties?.[key] }
  function setProp(key, val) { patchSelected({ properties: { [key]: val } }) }

  const linkedLocation = o.linkedEntity?.entityType === 'location'
    ? (project.locations || []).find(l => l.id === o.linkedEntity.entityId) : null

  return (
    <>
      {multi && <div style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 8px', background: 'var(--surface2)', borderRadius: 6 }}>{selectedIds.length} objects selected — changes apply to all</div>}

      <Field label="Name">
        <input value={prop('name') || ''} onChange={e => setProp('name', e.target.value)} style={inputStyle} />
      </Field>

      {/* Worldbuilding integration — most prominent for location/stamp */}
      {(o.type === 'location' || (o.type === 'stamp' && ['capital', 'city', 'village', 'castle', 'fortress', 'harbor'].includes(prop('stampId')))) && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, background: 'color-mix(in srgb, var(--accent) 7%, var(--surface))' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Worldbuilding link</div>
          {linkedLocation ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>→ {linkedLocation.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Location · {linkedLocation.category || 'Other'}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => { window.dispatchEvent(new CustomEvent('yow:open-location', { detail: { locationId: linkedLocation.id, name: linkedLocation.name } })) }}>Open location</button>
                <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => patchSelected({ linkedEntity: null })}>Unlink</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Not linked to a worldbuilding entry.</div>
              <Field label="Link to existing location">
                <select
                  value={o.linkedEntity?.entityId || ''}
                  onChange={e => {
                    const loc = locations.find(l => l.id === e.target.value)
                    patchSelected({ properties: { name: loc?.name || prop('name') }, linkedEntity: loc ? { entityType: 'location', entityId: loc.id } : null })
                  }}
                  style={inputStyle}
                >
                  <option value="">— unlinked —</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>
      )}

      {/* Type-specific fields */}
      {o.type === 'location' && (
        <Field label="Marker icon">
          <select value={prop('markerIcon') || 'pin'} onChange={e => setProp('markerIcon', e.target.value)} style={inputStyle}>
            {LOCATION_ICON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      )}

      {o.type === 'region' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Terrain type</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {TERRAIN_TYPES.map(t => {
              const isActive = (prop('terrainType') || 'grassland') === t.value
              return (
                <button
                  key={t.value}
                  onClick={() => patchSelected({ properties: { terrainType: t.value, fill: t.color } })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px',
                    borderRadius: 6, border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    background: isActive ? 'color-mix(in srgb, var(--accent) 12%, var(--surface2))' : 'var(--surface2)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: t.color, flexShrink: 0, border: '1px solid rgba(0,0,0,0.2)' }} />
                  <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {(o.type === 'shape' || o.type === 'region') && (
        <Field label="Organic edges">
          <input type="checkbox" checked={prop('organicEdges') !== false} onChange={e => setProp('organicEdges', e.target.checked)} />
        </Field>
      )}

      {o.type === 'label' && (
        <>
          <Field label="Text">
            <input value={prop('text') || prop('name') || ''} onChange={e => patchSelected({ properties: { text: e.target.value, name: e.target.value } })} style={inputStyle} />
          </Field>
          <Field label="Font">
            <select value={prop('fontFamily') || MAP_FONT_OPTIONS[0].value} onChange={e => setProp('fontFamily', e.target.value)} style={inputStyle}>
              {MAP_FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Field label="Size"><input type="number" value={prop('fontSize') || 40} min={10} onChange={e => setProp('fontSize', Number(e.target.value))} style={inputStyle} /></Field>
            <Field label="Style">
              <select value={prop('fontStyle') || 'normal'} onChange={e => setProp('fontStyle', e.target.value)} style={inputStyle}>
                <option value="normal">Regular</option><option value="italic">Italic</option>
              </select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Field label="Text colour"><input type="color" value={prop('textColor') === 'transparent' ? '#1a140a' : (prop('textColor') || '#1a140a')} onChange={e => setProp('textColor', e.target.value)} style={{ ...inputStyle, height: 32, padding: 2 }} /></Field>
            <Field label="Outline colour"><input type="color" value={prop('outlineColor') === 'transparent' ? '#f4e8c4' : (prop('outlineColor') || '#f4e8c4')} onChange={e => setProp('outlineColor', e.target.value)} style={{ ...inputStyle, height: 32, padding: 2 }} /></Field>
          </div>
        </>
      )}

      {o.type === 'note' && (
        <>
          <Field label="Title">
            <input value={prop('title') || ''} onChange={e => patchSelected({ properties: { title: e.target.value, name: e.target.value || 'Note' } })} style={inputStyle} />
          </Field>
          <Field label="Visibility">
            <select value={prop('visibility') || 'private'} onChange={e => setProp('visibility', e.target.value)} style={inputStyle}>
              <option value="private">Private (editor only)</option>
              <option value="public">Exportable</option>
            </select>
          </Field>
          {isCampaign && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}><input type="checkbox" checked={Boolean(prop('gmOnly'))} onChange={e => setProp('gmOnly', e.target.checked)} /> GM only</label>}
        </>
      )}

      {/* Fill/stroke for polygon shapes */}
      {(o.type === 'shape' || o.type === 'region') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <Field label="Fill"><input type="color" value={prop('fill') || '#1e3d20'} onChange={e => setProp('fill', e.target.value)} style={{ ...inputStyle, height: 32, padding: 2 }} /></Field>
          <Field label="Outline"><input type="color" value={prop('stroke') || '#142a16'} onChange={e => setProp('stroke', e.target.value)} style={{ ...inputStyle, height: 32, padding: 2 }} /></Field>
        </div>
      )}

      {/* Line objects */}
      {['river', 'road', 'border', 'mountain'].includes(o.type) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <Field label="Colour"><input type="color" value={prop('stroke') || '#333'} onChange={e => setProp('stroke', e.target.value)} style={{ ...inputStyle, height: 32, padding: 2 }} /></Field>
          <Field label="Thickness"><input type="number" value={prop('lineThickness') || 5} min={1} onChange={e => setProp('lineThickness', Number(e.target.value))} style={inputStyle} /></Field>
        </div>
      )}

      {/* Opacity */}
      {!['label', 'stamp'].includes(o.type) && (
        <Field label="Opacity %">
          <input type="number" value={round((prop('opacity') ?? 1) * 100, 0)} min={0} max={100} onChange={e => setProp('opacity', clamp(Number(e.target.value) / 100, 0, 1))} style={inputStyle} />
        </Field>
      )}

      {/* Notes (private, for all objects) */}
      <Field label="Notes (private)">
        <textarea
          value={prop('notes') || ''}
          onChange={e => setProp('notes', e.target.value)}
          placeholder="Private notes for this object..."
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
        />
      </Field>
      {isCampaign && o.type !== 'note' && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(prop('gmOnly'))} onChange={e => setProp('gmOnly', e.target.checked)} /> GM only
        </label>
      )}

      {/* Position/size for point objects */}
      {!o.geometry && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <Field label="X"><input type="number" value={round(o.x || 0, 0)} onChange={e => patchSelected({ x: Number(e.target.value) })} style={inputStyle} /></Field>
          <Field label="Y"><input type="number" value={round(o.y || 0, 0)} onChange={e => patchSelected({ y: Number(e.target.value) })} style={inputStyle} /></Field>
          <Field label="Width"><input type="number" value={round(o.width || 80, 0)} min={MIN_SIZE} onChange={e => patchSelected({ width: Number(e.target.value) })} style={inputStyle} /></Field>
          <Field label="Height"><input type="number" value={round(o.height || 80, 0)} min={MIN_SIZE} onChange={e => patchSelected({ height: Number(e.target.value) })} style={inputStyle} /></Field>
          <Field label="Rotate"><input type="number" value={round(o.rotation || 0, 0)} onChange={e => patchSelected({ rotation: Number(e.target.value) })} style={inputStyle} /></Field>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
        <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={duplicateSelected}>Duplicate</button>
        <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => patchSelected({ locked: !o.locked })}>{o.locked ? 'Unlock' : 'Lock'}</button>
        <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => patchSelected({ visible: o.visible === false })}>{o.visible === false ? 'Show' : 'Hide'}</button>
        <button className="btn btn-secondary btn-sm" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={deleteSelected}>Delete</button>
      </div>
    </>
  )
}

// ─── Layers Panel ─────────────────────────────────────────────────────────────

const TYPE_ICONS = { shape: '▰', region: '◫', territory: '□', river: '〜', road: '—', border: '⋯', mountain: '△', stamp: '✦', location: '⌖', label: 'T', note: '✎', marker: '•' }
const TYPE_COLORS = { shape: '#3a7a3a', region: '#6a9a44', territory: '#7050a8', river: '#3a80b0', road: '#8b6030', border: '#9050a0', mountain: '#7a7060', stamp: '#8f6a33', location: '#c8602a', label: '#2a6090', note: '#c8a020' }

function LayersPanel({ objects, selectedIds, setSelectedIds, updateObjects, setMode }) {
  const [draggingId, setDraggingId] = useState(null)
  const sorted = [...objects].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))

  function applyDisplayOrder(displayObjects) {
    const count = displayObjects.length
    const zById = new Map(displayObjects.map((o, index) => [o.id, count - index]))
    updateObjects(cur => cur.map(o => zById.has(o.id) ? { ...o, zIndex: zById.get(o.id) } : o))
  }

  function moveObject(id, direction) {
    const idx = sorted.findIndex(o => o.id === id)
    const targetIdx = clamp(idx + direction, 0, sorted.length - 1)
    if (idx < 0 || targetIdx === idx) return
    const next = [...sorted]
    const [item] = next.splice(idx, 1)
    next.splice(targetIdx, 0, item)
    applyDisplayOrder(next)
  }

  function dropObject(targetId) {
    if (!draggingId || draggingId === targetId) return
    const fromIndex = sorted.findIndex(o => o.id === draggingId)
    const toIndex = sorted.findIndex(o => o.id === targetId)
    if (fromIndex < 0 || toIndex < 0) return
    const next = [...sorted]
    const [item] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, item)
    applyDisplayOrder(next)
  }

  function toggleVisible(id) {
    updateObjects(cur => cur.map(o => o.id === id ? { ...o, visible: o.visible === false } : o))
  }

  function deleteOne(id) {
    updateObjects(cur => cur.filter(o => o.id !== id))
    setSelectedIds(prev => prev.filter(sid => sid !== id))
  }

  if (!sorted.length) {
    return <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>No objects yet. Draw on the canvas to add objects.</div>
  }

  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
        {objects.length} objects — top to bottom draw order
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sorted.map((o, idx) => {
          const isSelected = selectedIds.includes(o.id)
          const name = o.properties?.name || o.properties?.text || o.properties?.title || o.properties?.stampId || o.type
          const icon = TYPE_ICONS[o.type] || '□'
          const color = TYPE_COLORS[o.type] || 'var(--muted)'
          return (
            <div
              key={o.id}
              draggable
              onDragStart={e => { setDraggingId(o.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', o.id) }}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDrop={e => { e.preventDefault(); dropObject(o.id); setDraggingId(null) }}
              onDragEnd={() => setDraggingId(null)}
              onClick={() => { setMode('select'); setSelectedIds([o.id]) }}
              style={{
                display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 4, alignItems: 'center',
                padding: '5px 7px', borderRadius: 7, cursor: 'pointer',
                opacity: draggingId === o.id ? 0.45 : 1,
                background: isSelected ? 'color-mix(in srgb, var(--accent) 14%, var(--surface2))' : 'var(--surface2)',
                border: `1px solid ${isSelected || draggingId === o.id ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              <span style={{ width: 22, height: 22, borderRadius: 5, background: color, display: 'grid', placeItems: 'center', fontSize: 11, color: '#fff', flexShrink: 0, fontWeight: 700 }}>{icon}</span>
              <span style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(name).slice(0, 22)}</span>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <button onClick={e => { e.stopPropagation(); moveObject(o.id, -1) }} title="Move up in draw order" style={layerBtnStyle} disabled={idx === 0}>↑</button>
                <button onClick={e => { e.stopPropagation(); moveObject(o.id, 1) }} title="Move down in draw order" style={layerBtnStyle} disabled={idx === sorted.length - 1}>↓</button>
                <button onClick={e => { e.stopPropagation(); toggleVisible(o.id) }} title={o.visible === false ? 'Show' : 'Hide'} style={{ ...layerBtnStyle, color: o.visible === false ? 'var(--faint)' : 'var(--muted)' }}>{o.visible === false ? '○' : '●'}</button>
                <button onClick={e => { e.stopPropagation(); deleteOne(o.id) }} title="Delete" style={{ ...layerBtnStyle, color: 'var(--danger)' }}>×</button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

const layerBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12, padding: '0 2px', fontFamily: 'inherit', lineHeight: 1 }

// ─── Map Inspector ────────────────────────────────────────────────────────────

function MapInspector({ activeMap, project, stylePreset, gridSettings, persistMeta, selectMap, deleteMap, renameMap, onOpenNewMap }) {
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const maps = project.maps || []

  function updateGrid(patch) { persistMeta({ gridSettings: { ...gridSettings, ...patch } }) }

  return (
    <>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Style</div>
      <Field label="Visual style">
        <select value={stylePreset} onChange={e => persistMeta({ stylePreset: e.target.value })} style={inputStyle}>
          {STYLE_PRESETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginTop: 6 }}>Grid overlay</div>
      <label style={checkStyle}><input type="checkbox" checked={Boolean(gridSettings.enabled)} onChange={e => updateGrid({ enabled: e.target.checked })} /> Show grid</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <Field label="Type">
          <select value={gridSettings.type || 'square'} onChange={e => updateGrid({ type: e.target.value })} style={inputStyle}>
            <option value="square">Square</option><option value="hex">Hex</option>
          </select>
        </Field>
        <Field label="Size"><input type="number" value={gridSettings.size || 40} min={10} onChange={e => updateGrid({ size: Number(e.target.value) })} style={inputStyle} /></Field>
        <Field label="Opacity %"><input type="number" value={round((gridSettings.opacity || 0.28) * 100, 0)} min={5} max={90} onChange={e => updateGrid({ opacity: clamp(Number(e.target.value) / 100, 0.05, 0.9) })} style={inputStyle} /></Field>
        <Field label="Colour"><input type="color" value={gridSettings.color || '#5b4630'} onChange={e => updateGrid({ color: e.target.value })} style={{ ...inputStyle, height: 32, padding: 2 }} /></Field>
      </div>
      <label style={checkStyle}><input type="checkbox" checked={Boolean(gridSettings.snapToGrid)} onChange={e => updateGrid({ snapToGrid: e.target.checked })} /> Snap to grid</label>
      <Field label="Scale label"><input value={gridSettings.scale || ''} onChange={e => updateGrid({ scale: e.target.value })} placeholder="e.g. 1 square = 5 ft" style={inputStyle} /></Field>

      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginTop: 6 }}>Maps</div>
      {maps.map(map => (
        <div key={map.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {renamingId === map.id ? (
            <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
              onBlur={() => { if (renameVal.trim()) renameMap(map.id, renameVal.trim()); setRenamingId(null) }}
              onKeyDown={e => { if (e.key === 'Enter') { if (renameVal.trim()) renameMap(map.id, renameVal.trim()); setRenamingId(null) } if (e.key === 'Escape') setRenamingId(null) }}
              style={{ ...inputStyle, flex: 1, fontSize: 12 }} />
          ) : (
            <button onClick={() => selectMap(map.id)} onDoubleClick={() => { setRenamingId(map.id); setRenameVal(map.name || '') }}
              style={{ flex: 1, textAlign: 'left', background: map.id === activeMap.id ? 'var(--accent)' : 'var(--surface2)', color: map.id === activeMap.id ? '#fff' : 'var(--muted)', border: `1px solid ${map.id === activeMap.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {map.name || 'Untitled'}
            </button>
          )}
          {maps.length > 1 && <button className="btn btn-secondary btn-sm" style={{ padding: '0 6px', minHeight: 26 }} onClick={() => { if (confirm('Delete this map?')) deleteMap(map.id) }}>×</button>}
        </div>
      ))}
      <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} onClick={onOpenNewMap}>+ New map</button>
    </>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function MapModal({ modal, onClose, locConfig, setLocConfig, labelConfig, setLabelConfig, noteConfig, setNoteConfig, territoryConfig, setTerritoryConfig, locations, isCampaign, onConfirm }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 999 }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 380, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
          {modal.kind === 'location' ? 'Place location' : modal.kind === 'label' ? 'Add label' : modal.kind === 'territory' ? 'Name this region' : 'Add note'}
        </div>

        {modal.kind === 'location' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
              Link this marker to an existing worldbuilding location, or name a new one.
            </div>
            <Field label="Link to existing location">
              <select value={locConfig.linkToId} onChange={e => {
                const loc = locations.find(l => l.id === e.target.value)
                setLocConfig(c => ({ ...c, linkToId: e.target.value, name: loc?.name || c.name, createNew: false }))
              }} style={inputStyle}>
                <option value="">— no link —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label={locConfig.linkToId ? 'Or create new location' : 'Name'}>
              <input value={locConfig.name} onChange={e => setLocConfig(c => ({ ...c, name: e.target.value, linkToId: '', createNew: true }))} placeholder={locConfig.linkToId ? 'Leave blank to use linked name' : 'Location name'} style={inputStyle} />
            </Field>
            <Field label="Marker icon">
              <select value={locConfig.markerIcon} onChange={e => setLocConfig(c => ({ ...c, markerIcon: e.target.value }))} style={inputStyle}>
                {LOCATION_ICON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </>
        )}

        {modal.kind === 'label' && (
          <>
            <Field label="Label text">
              <input autoFocus value={labelConfig.text} onChange={e => setLabelConfig(c => ({ ...c, text: e.target.value }))} placeholder="Your label text..." style={inputStyle} />
            </Field>
            <Field label="Font">
              <select value={labelConfig.fontFamily} onChange={e => setLabelConfig(c => ({ ...c, fontFamily: e.target.value }))} style={inputStyle}>
                {MAP_FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Size"><input type="number" value={labelConfig.fontSize} min={10} onChange={e => setLabelConfig(c => ({ ...c, fontSize: Number(e.target.value) }))} style={inputStyle} /></Field>
              <Field label="Style">
                <select value={labelConfig.fontStyle} onChange={e => setLabelConfig(c => ({ ...c, fontStyle: e.target.value }))} style={inputStyle}>
                  <option value="normal">Regular</option><option value="italic">Italic</option>
                </select>
              </Field>
            </div>
          </>
        )}

        {modal.kind === 'note' && (
          <>
            <Field label="Title (optional)">
              <input autoFocus value={noteConfig.title} onChange={e => setNoteConfig(c => ({ ...c, title: e.target.value }))} placeholder="Note title..." style={inputStyle} />
            </Field>
            <Field label="Note body">
              <textarea value={noteConfig.body} onChange={e => setNoteConfig(c => ({ ...c, body: e.target.value }))} placeholder="Write your note here..." rows={4} style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} />
            </Field>
            <label style={checkStyle}>
              <input type="checkbox" checked={noteConfig.visibility === 'private'} onChange={e => setNoteConfig(c => ({ ...c, visibility: e.target.checked ? 'private' : 'public' }))} /> Private (not exported by default)
            </label>
            {isCampaign && (
              <label style={checkStyle}>
                <input type="checkbox" checked={Boolean(noteConfig.gmOnly)} onChange={e => setNoteConfig(c => ({ ...c, gmOnly: e.target.checked }))} /> GM only
              </label>
            )}
          </>
        )}

        {modal.kind === 'territory' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
              Name this political region. It will appear as a label on the map and can create an entry in your worldbuilding locations.
            </div>
            <Field label="Region name">
              <input autoFocus value={territoryConfig.name} onChange={e => setTerritoryConfig(c => ({ ...c, name: e.target.value }))} placeholder="e.g. Kingdom of Aurethos" style={inputStyle} />
            </Field>
            <Field label="Region colour">
              <input type="color" value={territoryConfig.fill} onChange={e => setTerritoryConfig(c => ({ ...c, fill: e.target.value }))} style={{ ...inputStyle, height: 36, padding: 3, cursor: 'pointer' }} />
            </Field>
            <Field label="Link to existing location (optional)">
              <select value={territoryConfig.linkToId} onChange={e => setTerritoryConfig(c => ({ ...c, linkToId: e.target.value, createNewLocation: false }))} style={inputStyle}>
                <option value="">— none —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <label style={checkStyle}>
              <input type="checkbox" checked={Boolean(territoryConfig.createNewLocation)} onChange={e => setTerritoryConfig(c => ({ ...c, createNewLocation: e.target.checked, linkToId: '' }))} />
              {' '}Create a new location entry for this region
            </label>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={modal.kind === 'label' && !labelConfig.text.trim()} onClick={onConfirm}>
            {modal.kind === 'location' ? 'Place' : modal.kind === 'label' ? 'Place label' : modal.kind === 'territory' ? 'Save region' : 'Place note'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle = {
  width: '100%', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)',
  borderRadius: 6, padding: '6px 9px', fontFamily: 'inherit', fontSize: 12, boxSizing: 'border-box',
}

function tabStyle(active) {
  return {
    padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: active ? 700 : 400,
    background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--muted)', transition: 'background 0.1s',
  }
}

const checkStyle = { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }

// ─── Map schema parsing ───────────────────────────────────────────────────────

function migrateOldObject(o) {
  const meta = o.metadata || {}
  const { layerId, faces, points: metaPoints, ...rest } = meta

  // Convert old normalized-coord polygon faces to map-coordinate geometry
  if (faces?.length) {
    const face = faces[0] || []
    const pts = face.map(p => ({
      x: (o.x || 0) + (p.x - 0.5) * (o.width || 80),
      y: (o.y || 0) + (p.y - 0.5) * (o.height || 80),
    }))
    const geometry = pts.length >= 3 ? { type: 'polygon', points: pts } : null
    return { ...o, properties: rest, geometry }
  }

  // Convert old normalized-coord path points
  if (metaPoints?.length) {
    const pts = metaPoints.map(p => ({
      x: (o.x || 0) + (p.x - 0.5) * (o.width || 80),
      y: (o.y || 0) + (p.y - 0.5) * (o.height || 80),
    }))
    return { ...o, properties: rest, geometry: { type: 'path', points: pts } }
  }

  // Point objects (stamps, labels, locations, etc.)
  return { ...o, properties: rest, geometry: o.geometry || null }
}

function parseMapSchema(activeMap) {
  if (!activeMap) return { objects: [], layers: [], metadata: {}, width: MAP_W, height: MAP_H }
  const objects = (activeMap.mapObjects || []).map(o => {
    if (o.geometry && o.properties) return o  // already new format
    if (o.metadata) return migrateOldObject(o)  // old schema
    return { ...o, properties: o.properties || {}, geometry: o.geometry || null }
  })
  return {
    objects,
    layers: activeMap.mapLayers || [],
    metadata: activeMap.metadata || {},
    width: activeMap.width || MAP_W,
    height: activeMap.height || MAP_H,
  }
}

function normalizeGrid(settings, mapType) {
  const base = settings || {}
  const isInterior = mapType === 'interior'
  return {
    enabled: base.enabled ?? false,
    type: base.type || 'square',
    size: base.size || (isInterior ? 80 : 40),
    opacity: base.opacity ?? 0.28,
    color: base.color || '#5b4630',
    snapToGrid: base.snapToGrid ?? false,
    scale: base.scale || '',
  }
}
