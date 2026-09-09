import { lazy, Suspense, useEffect, useRef, useState } from 'react'
const LegacyMapBuilder = lazy(() => import('./YOWMapBuilder.jsx'))
import AtlasCanvas, { InkSymbol } from './AtlasCanvas.jsx'
import { ATLAS_VERSION, SCALES, PALETTES, makeObject, moveObject, newMapData, parseAtlas, canvasPoint } from './atlasModel.js'
import { uid } from './mapUtils.js'
import { downloadBlob } from '../../utils/projectExportHelpers.js'
import { SYMBOL_GROUPS } from './atlasSymbols.js'
import './atlas.css'

function modalKeys(event, close) {
  if (event.key === 'Escape') { event.stopPropagation(); close() }
  if (event.key !== 'Tab') return
  const fields = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select, [tabindex="0"]')]
  const first = fields[0], last = fields.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}

const titleCase = value => value[0].toUpperCase() + value.slice(1)
const TOOL_INFO = {
  select: ['Select', 'Click an item to edit it. Drag it to move.'],
  pan: ['Move view', 'Drag the map to look around. Use Fit to see everything.'],
  shape: ['Land', 'Drag around a coastline. Release to close the shape.'],
  water: ['Water', 'Drag around a lake or riverbank. Release to fill with water.'],
  river: ['River', 'Drag to draw a river. Release to finish.'],
  road: ['Route', 'Drag to draw a route. Release to finish.'],
  territory: ['Territory', 'Drag around an area. Release to close its boundary.'],
  wall: ['Wall', 'Drag to draw a wall. Release to finish.'],
  stamp: ['Symbols', 'Choose a symbol, then click the map to place it.'],
  location: ['Place', 'Click the map to add a place, then name or link it.'],
  label: ['Text', 'Click the map to place a label.'],
}
const TOOL_ICONS = { select: '↖', pan: '✥', shape: '◒', water: '≈', river: '〰', road: '┄', territory: '⬡', wall: '⊞', stamp: '♧', location: '⌖', label: 'T' }

const TOOL_KEYS = { v: 'select', h: 'pan', l: 'shape', w: 'water', r: 'river', p: 'road', b: 'territory', x: 'wall', s: 'stamp', m: 'location', t: 'label' }
const SHORTCUTS = [
  ['V / H', 'Select / move view'], ['L / W', 'Land or room / water'], ['R / P', 'River / route'], ['B / X', 'Territory / wall'], ['S / M / T', 'Symbols / place / text'],
  ['⌘ or Ctrl Z', 'Undo'], ['⌘ or Ctrl Shift Z / Ctrl Y', 'Redo'], ['⌘ or Ctrl D', 'Duplicate selection'], ['Delete / Backspace', 'Delete selection'],
  ['Arrow keys', 'Move selection (Shift for larger steps)'], ['+ / − / 0', 'Zoom in / out / fit'], ['F', 'Expand or restore canvas'], ['Escape', 'Cancel drawing / clear selection'], ['?', 'Show keyboard shortcuts'],
]

export default function AtlasBuilder({ store }) {
  const [library, setLibrary] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const project = store.mapProject
  if (!project) return <div className="atlas-empty">Open a project to make a map.</div>
  const activeMap = project.maps.find(m => m.id === project.activeMapId)
  function create(name, type, blank, palette) {
    const data = newMapData(type, blank, palette)
    const id = store.addMap(name, type, { metadata: data.metadata })
    if (!id) { setError('The map could not be created. Check your available storage and try again.'); return }
    store.updateMapData(id, () => data)
    store.selectMap(id)
    setCreating(false); setLibrary(false); setError('')
  }
  async function importMap(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > 10000000) throw new Error('Choose a map smaller than 10 MB.')
      const map = parseAtlas(await file.text())
      const locationIds = new Set(project.locations.map(l => l.id))
      map.mapObjects = map.mapObjects.map(o => ({ ...o, linkedEntity: o.linkedEntity?.entityType === 'location' && locationIds.has(o.linkedEntity.entityId) ? o.linkedEntity : null }))
      const id = store.addMap(map.name, map.mapType, { metadata: map.metadata })
      if (!id) throw new Error('The map could not be imported. Check your available storage.')
      store.updateMapData(id, () => map); store.selectMap(id); setLibrary(false); setError('')
    } catch (e) { setError(e.message || 'The map could not be imported.') }
  }
  return <section className="atlas" aria-label="Map builder">
    <input ref={inputRef} type="file" accept=".json,application/json" hidden onChange={importMap}/>
    {error && <div className="atlas-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {library || !activeMap ? <div className="atlas-library">
      <header><div><span className="atlas-eyebrow">YOUR WORLD, ON PAPER</span><h1>Every story has a place.</h1><p>Make a map worth getting lost in. Start with a little inspiration, then make it yours.</p></div><button className="atlas-primary" onClick={() => setCreating(true)}>+ New map</button></header>
      <div className="atlas-library-label"><h2>{project.maps.length ? 'Your atlas' : 'Where will your story begin?'}</h2><button onClick={() => inputRef.current.click()}>Import map</button></div>
      {!project.maps.length ? <div className="atlas-start-grid">{SCALES.map(s => <button className="atlas-start-card" key={s.id} onClick={() => setCreating(s.id)}><AtlasCanvas objects={newMapData(s.id, false, 'paper').mapObjects} metadata={newMapData(s.id, false, 'paper').metadata}/><strong>{s.name}</strong><span>{s.detail}</span></button>)}</div> : <div className="atlas-start-grid">{project.maps.map(m => <button className="atlas-start-card" key={m.id} onClick={() => { store.selectMap(m.id); setLibrary(false) }}>
        {m.metadata?.builder === ATLAS_VERSION ? <AtlasCanvas objects={m.mapObjects || []} metadata={m.metadata}/> : <div className="atlas-legacy-preview">⌖<span>Original map</span></div>}
        <strong>{m.name}</strong><span>{titleCase(m.mapType || 'region')} · {m.mapObjects?.length || 0} elements</span></button>)}</div>}
      <p className="atlas-library-note">Worlds connect through places. Link a pin to any Location in your project. Imported maps keep links to matching Locations; other places can be linked again.</p>
    </div> : activeMap.metadata?.builder === ATLAS_VERSION ? <Editor key={activeMap.id} map={activeMap} store={store} onLibrary={() => setLibrary(true)}/> : <><div className="atlas-legacy-bar"><button onClick={() => setLibrary(true)}>← Your atlas</button><span>This map uses the original editor.</span><button className="atlas-primary" onClick={() => setCreating(true)}>Try the new builder</button></div><Suspense fallback={<div className="atlas-empty">Opening original map…</div>}><LegacyMapBuilder store={store}/></Suspense></>}
    {creating && <CreateMap initialType={typeof creating === 'string' ? creating : 'world'} onClose={() => setCreating(false)} onCreate={create}/>}
  </section>
}

function CreateMap({ initialType, onClose, onCreate }) {
  const [type, setType] = useState(initialType)
  const [name, setName] = useState('')
  const [blank, setBlank] = useState(false)
  const [palette, setPalette] = useState('paper')
  const start = newMapData(type, blank, palette)
  return <div className="atlas-modal-backdrop" onKeyDown={e => modalKeys(e, onClose)}><form className="atlas-create" role="dialog" aria-modal="true" aria-labelledby="atlas-create-title" onSubmit={e => { e.preventDefault(); if (name.trim()) onCreate(name.trim(), type, blank, palette) }}>
    <div className="atlas-create-fields"><div className="atlas-row"><span className="atlas-eyebrow">A NEW CORNER OF YOUR WORLD</span><button type="button" onClick={onClose} aria-label="Close new map">×</button></div><h2 id="atlas-create-title">Start somewhere.</h2><p>A few good shapes. The rest is your story.</p>
      <label>Map name<input autoFocus required maxLength={100} placeholder="The Sunken Kingdoms" value={name} onChange={e => setName(e.target.value)}/></label>
      <fieldset><legend>How far are we looking?</legend><div className="atlas-scales">{SCALES.map(s => <button type="button" key={s.id} aria-pressed={type === s.id} onClick={() => setType(s.id)}>{s.name}</button>)}</div><small>{SCALES.find(s => s.id === type).detail}</small></fieldset>
      <fieldset><legend>Your starting point</legend><div className="atlas-options"><button type="button" aria-pressed={!blank} onClick={() => setBlank(false)}>{SCALES.find(s => s.id === type).starter}<small>Everything is editable</small></button><button type="button" aria-pressed={blank} onClick={() => setBlank(true)}>Blank canvas<small>Make the first mark</small></button></div></fieldset>
      <fieldset><legend>Paper & ink</legend><div className="atlas-palettes">{Object.entries(PALETTES).map(([key,p]) => <button type="button" key={key} aria-pressed={palette === key} onClick={() => setPalette(key)}><i style={{ background: p.water, borderColor: p.forest }}/>{p.name}</button>)}</div></fieldset>
      <button className="atlas-primary" type="submit" disabled={!name.trim()}>Create map →</button>
    </div><div className="atlas-create-preview"><AtlasCanvas objects={start.mapObjects} metadata={start.metadata} name={name || 'Your world begins here'}/><p>Original linework. No generated images. Just your imagination.</p></div>
  </form></div>
}

function Editor({ map, store, onLibrary }) {
  const [tool, setTool] = useState('select')
  const [symbol, setSymbol] = useState(map.mapType === 'interior' ? 'table' : 'mountain')
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const [history, setHistory] = useState({ past: [], future: [] })
  const [message, setMessage] = useState('')
  const [exporting, setExporting] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [lineWidth, setLineWidth] = useState(5)
  const [symbolSearch, setSymbolSearch] = useState('')
  const svgRef = useRef(null)
  const gesture = useRef(null)
  const objects = map.mapObjects || []
  const metadata = map.metadata || {}
  const selected = objects.find(o => o.id === selectedId)
  const interior = map.mapType === 'interior'
  const tools = interior ? ['select','pan','shape','wall','stamp','location','label'] : ['select','pan','shape','water','river','road','territory','stamp','location','label']
  const current = { mapObjects: objects, metadata }
  function commit(next) {
    const result = store.updateMapData(map.id, () => next)
    if (!result) { setMessage('This change could not be saved. Please try again.'); return false }
    setHistory(h => ({ past: [...h.past.slice(-49), current], future: [] }))
    setMessage(''); return true
  }
  function undo(redo = false) {
    const stack = redo ? history.future : history.past
    if (!stack.length) return
    const next = stack[stack.length - 1]
    if (!store.updateMapData(map.id, () => next)) { setMessage('This change could not be saved.'); return }
    setHistory(redo ? { past: [...history.past, current], future: history.future.slice(0,-1) } : { past: history.past.slice(0,-1), future: [...history.future, current] })
    setSelectedId(null)
  }
  function patch(props) { commit({ ...current, mapObjects: objects.map(o => o.id === selectedId ? { ...o, ...props } : o) }) }
  function remove() { if (selected && commit({ ...current, mapObjects: objects.filter(o => o.id !== selectedId) })) setSelectedId(null) }
  function cancel() { gesture.current = null; setDraft(null) }
  function duplicate() {
    if (!selected) return
    const copy = { ...moveObject(selected, 25, 25), id: uid('atlas') }
    if (commit({ ...current, mapObjects: [...objects, copy] })) setSelectedId(copy.id)
  }
  function changeTool(next) { cancel(); setTool(next); if (next !== 'select') setSelectedId(null) }
  function keyDown(e) {
    if (e.isComposing || e.target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return
    if (showDelete || showShortcuts || e.target?.closest?.('[role="dialog"]')) return
    const key = e.key.toLowerCase(), command = e.ctrlKey || e.metaKey
    let handled = true
    if (command && key === 'z') { cancel(); undo(e.shiftKey) }
    else if (command && key === 'y') { cancel(); undo(true) }
    else if (command && key === 'd') duplicate()
    else if (command || e.altKey) handled = false
    else if (key === 'escape') { cancel(); setTool('select'); setSelectedId(null); setExpanded(false) }
    else if (key === 'delete' || key === 'backspace') remove()
    else if (key.startsWith('arrow') && selected) {
      const distance = e.shiftKey ? 10 : 1
      const delta = { arrowleft: [-distance,0], arrowright: [distance,0], arrowup: [0,-distance], arrowdown: [0,distance] }[key]
      if (delta) patch(moveObject(selected, ...delta)); else handled = false
    }
    else if (key === '+' || key === '=') setView(v => ({ ...v, zoom: Math.min(3,v.zoom+.25) }))
    else if (key === '-') setView(v => ({ ...v, zoom: Math.max(.5,v.zoom-.25) }))
    else if (key === '0') setView({ zoom: 1, x: 0, y: 0 })
    else if (key === 'f') setExpanded(v => !v)
    else if (key === '?') setShowShortcuts(true)
    else if (TOOL_KEYS[key] && tools.includes(TOOL_KEYS[key])) changeTool(TOOL_KEYS[key])
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }
  // Only mounted while this map editor is active. Rebind to the latest selection
  // and history; text fields and dialogs keep their native editing shortcuts.
  useEffect(() => {
    document.addEventListener('keydown', keyDown)
    return () => document.removeEventListener('keydown', keyDown)
  })
  function point(e) {
    const grid = metadata.gridSettings || {}
    const snap = grid.enabled && grid.snapToGrid ? Math.max(1, Number(grid.size) || 40) : 0
    return canvasPoint(e.clientX, e.clientY, svgRef.current.getBoundingClientRect(), snap)
  }
  function start(e, object) {
    if (e.button !== 0 || gesture.current) return
    e.preventDefault(); e.stopPropagation()
    const p = point(e)
    if (!p) return
    svgRef.current.focus({ preventScroll: true })
    svgRef.current.setPointerCapture(e.pointerId)
    if (tool === 'pan') { gesture.current = { kind: 'pan', x: e.clientX, y: e.clientY, view }; return }
    if (tool === 'select') {
      setSelectedId(object?.id || null)
      if (object) gesture.current = { kind: 'move', start: p, object }
      return
    }
    if (['stamp','label','location'].includes(tool)) {
      const o = makeObject(tool, p, { symbol, ...(tool === 'location' ? { anchor: 'tip' } : {}), name: tool === 'label' ? 'New label' : tool === 'location' ? 'New place' : '', size: 42 })
      if (commit({ ...current, mapObjects: [...objects, o] })) { setSelectedId(o.id); if (tool !== 'stamp') setTool('select') }
      return
    }
    const objectDraft = makeObject(tool, { x: 0, y: 0 }, { size: lineWidth, room: interior && tool === 'shape' }, [p])
    gesture.current = { kind: 'draw', start: p, points: [p], draft: objectDraft }
    setDraft(objectDraft)
  }
  function move(e) {
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pan') { setView({ ...g.view, x: g.view.x + e.clientX-g.x, y: g.view.y + e.clientY-g.y }); return }
    const p = point(e)
    if (!p) return
    if (g.kind === 'move') { g.draft = moveObject(g.object, p.x-g.start.x, p.y-g.start.y); setDraft(g.draft); return }
    if (interior && tool === 'shape') g.points = [g.start, { x: p.x, y: g.start.y }, p, { x: g.start.x, y: p.y }]
    else if (Math.hypot(p.x-g.points.at(-1).x, p.y-g.points.at(-1).y) > 3 && g.points.length < 4000) g.points.push(p)
    g.draft = { ...g.draft, geometry: { ...g.draft.geometry, points: [...g.points] } }
    setDraft(g.draft)
  }
  function finish(e) {
    const g = gesture.current
    if (g) move(e) // Commit the release position, even when the last move has not rendered.
    const finished = g?.draft
    gesture.current = null
    if (svgRef.current.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
    if (g?.kind === 'move' && finished && (finished.x !== g.object.x || finished.y !== g.object.y)) commit({ ...current, mapObjects: objects.map(o => o.id === g.object.id ? finished : o) })
    if (g?.kind === 'draw' && finished && g.points.length >= (finished.geometry.type === 'polygon' ? 3 : 2)) { commit({ ...current, mapObjects: [...objects, finished] }); setSelectedId(finished.id) }
    setDraft(null)
  }
  async function exportMap(kind) {
    if (kind === 'json') { downloadBlob(new Blob([JSON.stringify({ format: ATLAS_VERSION, name: map.name, mapType: map.mapType, ...current }, null, 2)], { type: 'application/json' }), `${map.name}.json`); return }
    setExporting(true); setMessage('')
    let url
    try {
      const clone = svgRef.current.cloneNode(true)
      clone.removeAttribute('style'); clone.setAttribute('width','2400'); clone.setAttribute('height','1600')
      clone.querySelectorAll('[data-selection]').forEach(el => el.remove())
      const xml = new XMLSerializer().serializeToString(clone)
      const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
      if (kind === 'svg') { downloadBlob(blob, `${map.name}.svg`); return }
      url = URL.createObjectURL(blob)
      const img = new Image()
      await new Promise((resolve,reject) => { img.onload = resolve; img.onerror = reject; img.src = url })
      const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 1600
      canvas.getContext('2d').drawImage(img, 0, 0)
      const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!png) throw new Error('Export failed')
      downloadBlob(png, `${map.name}.png`)
    } catch (_) { setMessage('The image could not be exported. Try again, or download the map JSON.') }
    finally { if (url) URL.revokeObjectURL(url); setExporting(false) }
  }
  const visibleObjects = draft ? objects.some(o => o.id === draft.id) ? objects.map(o => o.id === draft.id ? draft : o) : [...objects,draft] : objects
  return <div className={`atlas-editor${expanded ? ' atlas-expanded' : ''}${sidebarOpen ? '' : ' atlas-sidebar-hidden'}`}>
    <header className="atlas-topbar"><button onClick={onLibrary}>← Atlas</button><div className="atlas-title"><input aria-label="Map name" key={map.name} defaultValue={map.name} onBlur={e => { if (e.target.value.trim() && e.target.value !== map.name) store.renameMap(map.id, e.target.value.trim()) }} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}/><span>{titleCase(map.mapType)} map</span></div><div className="atlas-history"><button disabled={!history.past.length} onClick={() => undo()} aria-label="Undo">↶</button><button disabled={!history.future.length} onClick={() => undo(true)} aria-label="Redo">↷</button></div><button aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setShowShortcuts(true)}>?</button><button className="atlas-space-toggle" aria-pressed={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? 'Exit expanded view' : 'Expand canvas'}</button><button aria-label={sidebarOpen ? 'Hide panel' : 'Show panel'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(v => !v)}>☷</button><details className="atlas-export"><summary>Export ↓</summary><div>{['png','svg','json'].map(k => <button key={k} disabled={exporting} onClick={() => exportMap(k)}>{k === 'json' ? 'Editable map JSON' : `${k.toUpperCase()} image`}</button>)}</div></details></header>
    <div className="atlas-workspace"><nav className="atlas-tools" aria-label="Map tools">{tools.map(t => <button key={t} aria-pressed={tool === t} title={`${TOOL_INFO[t][0]} (${Object.keys(TOOL_KEYS).find(k => TOOL_KEYS[k] === t)?.toUpperCase()})`} aria-keyshortcuts={Object.keys(TOOL_KEYS).find(k => TOOL_KEYS[k] === t)} onClick={() => changeTool(t)}><b aria-hidden="true">{TOOL_ICONS[t]}</b><span>{interior && t === 'shape' ? 'Room' : TOOL_INFO[t][0]}</span></button>)}</nav>
      <div className="atlas-stage"><div className="atlas-hint">{interior && tool === 'shape' ? 'Drag from one corner to the other to draw a room.' : TOOL_INFO[tool][1]}</div><div className="atlas-viewport"><div className="atlas-paper" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}><AtlasCanvas svgRef={svgRef} objects={visibleObjects} metadata={metadata} name={map.name} selectedId={selectedId} onPick={start} onPointerDown={e => start(e)} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} tabIndex={0}/></div></div><div className="atlas-view-controls"><button aria-label="Zoom out" onClick={() => setView(v => ({ ...v, zoom: Math.max(.5,v.zoom-.25) }))}>−</button><span>{Math.round(view.zoom*100)}%</span><button aria-label="Zoom in" onClick={() => setView(v => ({ ...v, zoom: Math.min(3,v.zoom+.25) }))}>+</button><button onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>Fit</button></div><div className="atlas-caption">{objects.length} elements · Changes save with your project</div></div>
      <aside className="atlas-sidebar" hidden={!sidebarOpen}>
        <div className="atlas-drawing-settings">
          {['river','road'].includes(tool) && <label>New {tool === 'river' ? 'river' : 'route'} thickness: {lineWidth}<input aria-label="New line thickness" type="range" min="1" max="40" value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))}/></label>}
          {!interior && <label className="atlas-checkbox"><input type="checkbox" checked={metadata.organicBorders !== false} onChange={e => commit({ ...current, metadata: { ...metadata, organicBorders: e.target.checked } })}/> Organic borders</label>}
          {!interior && metadata.organicBorders !== false && <label>Border variation<input aria-label="Border variation" type="range" min="2" max="30" value={metadata.organicStrength || 12} onChange={e => commit({ ...current, metadata: { ...metadata, organicStrength: Number(e.target.value) } })}/></label>}
          {metadata.gridSettings?.enabled && <label className="atlas-checkbox"><input type="checkbox" checked={Boolean(metadata.gridSettings.snapToGrid)} onChange={e => commit({ ...current, metadata: { ...metadata, gridSettings: { ...metadata.gridSettings, snapToGrid: e.target.checked } } })}/> Snap to grid</label>}
        </div>
        {tool === 'stamp' ? <><span className="atlas-eyebrow">MAKE YOUR MARK</span><h2>A few familiar shapes.</h2><p>Click a symbol, then place it on the map. You can keep placing as many as you like.</p><label>Find a symbol<input type="search" value={symbolSearch} onChange={e => setSymbolSearch(e.target.value)} placeholder="Bridge, cave, bed…"/></label>{SYMBOL_GROUPS.filter(group => group.interior === interior).map(group => {
          const matches = group.symbols.filter(s => s.includes(symbolSearch.toLowerCase().trim()))
          return matches.length ? <div key={group.name}><h3>{group.name}</h3><div className="atlas-symbols">{matches.map(s => <button key={s} aria-pressed={symbol === s} onClick={() => setSymbol(s)}><svg viewBox="-40 -40 80 80"><InkSymbol kind={s}/></svg><span>{titleCase(s)}</span></button>)}</div></div> : null
        })}{!SYMBOL_GROUPS.some(g => g.interior === interior && g.symbols.some(s => s.includes(symbolSearch.toLowerCase().trim()))) && <p>No matching symbols.</p>}</> : selected ? <><span className="atlas-eyebrow">SELECTED {selected.type === 'stamp' ? 'SYMBOL' : selected.type.toUpperCase()}</span><h2>Make it yours.</h2><label>Name<input aria-label="Element name" value={selected.properties?.name || ''} onChange={e => patch({ properties: { ...selected.properties, name: e.target.value } })} placeholder="Give this place a name"/></label>
          {['river','road'].includes(selected.type) && <label>{selected.type === 'river' ? 'River' : 'Route'} thickness: {selected.properties?.size || 5}<input aria-label="Line thickness" type="range" min="1" max="40" value={selected.properties?.size || 5} onChange={e => patch({ properties: { ...selected.properties, size: Number(e.target.value) } })}/></label>}
          {!selected.geometry && <label>Size<input type="range" min="20" max="100" value={selected.properties?.size || 42} onChange={e => patch({ properties: { ...selected.properties, size: Number(e.target.value) } })}/></label>}
          <label>Linked location<select value={selected.linkedEntity?.entityId || ''} onChange={e => patch({ linkedEntity: e.target.value ? { entityType: 'location', entityId: e.target.value } : null })}><option value="">No location linked</option>{store.mapProject.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          {selected.linkedEntity ? <button onClick={() => { store.setSelectedLocationId?.(selected.linkedEntity.entityId); window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: 'locations' } })) }}>Open location ↗</button> : <button disabled={!selected.properties?.name?.trim()} onClick={() => { const location = store.saveLocation({ name: selected.properties.name.trim(), category: 'Other', description: '' }); if (location?.id) patch({ linkedEntity: { entityType: 'location', entityId: location.id } }) }}>Create Location from this</button>}
          <div className="atlas-options"><button onClick={duplicate}>Duplicate</button><button onClick={remove}>Delete item</button></div>
          <div className="atlas-options"><button onClick={() => commit({ ...current, mapObjects: [selected,...objects.filter(o => o.id !== selectedId)] })}>Send back</button><button onClick={() => commit({ ...current, mapObjects: [...objects.filter(o => o.id !== selectedId),selected] })}>Bring forward</button></div>
          <button onClick={() => setSelectedId(null)}>Done</button>
        </> : <><span className="atlas-eyebrow">THE LOOK OF YOUR WORLD</span><h2>Paper & ink.</h2><p>Keep it simple. A coastline, a few landmarks, and a name can tell a whole story.</p><label>Map style<select value={metadata.palette || 'paper'} onChange={e => commit({ ...current, metadata: { ...metadata, palette: e.target.value } })}>{Object.entries(PALETTES).map(([id,p]) => <option value={id} key={id}>{p.name}</option>)}</select></label><label className="atlas-checkbox"><input type="checkbox" checked={Boolean(metadata.gridSettings?.enabled)} onChange={e => commit({ ...current, metadata: { ...metadata, gridSettings: { ...metadata.gridSettings, enabled: e.target.checked } } })}/> Show a square grid</label>{metadata.gridSettings?.enabled && <label>Distance per square<input value={metadata.gridSettings.scale || ''} onChange={e => commit({ ...current, metadata: { ...metadata, gridSettings: { ...metadata.gridSettings, scale: e.target.value } } })}/></label>}
          <div className="atlas-places"><h3>Places on this map</h3>{objects.filter(o => o.properties?.name).length ? objects.filter(o => o.properties?.name).map(o => <button key={o.id} onClick={() => { setSelectedId(o.id); setTool('select') }}><span>⌖ {o.properties.name}</span><small>{o.linkedEntity ? 'Linked' : 'Edit →'}</small></button>) : <p>Choose Place to mark somewhere that matters.</p>}</div>
          <button className="atlas-delete-map" onClick={() => setShowDelete(true)}>Delete map…</button>
        </>}
      </aside></div>
    {message && <div className="atlas-error" role="alert">{message}</div>}
    {showShortcuts && <div className="atlas-modal-backdrop" onKeyDown={e => modalKeys(e, () => setShowShortcuts(false))}><div className="atlas-confirm atlas-shortcuts" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"><div className="atlas-row"><h2>Keyboard shortcuts</h2><button autoFocus aria-label="Close shortcuts" onClick={() => setShowShortcuts(false)}>×</button></div><p>Available while editing a map. Typing in a field keeps its usual keyboard controls.</p><dl>{SHORTCUTS.map(([keys,action]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>)}</dl></div></div>}
    {showDelete && <div className="atlas-modal-backdrop" onKeyDown={e => modalKeys(e, () => setShowDelete(false))}><div className="atlas-confirm" role="dialog" aria-modal="true" aria-label="Delete map"><h2>Delete {map.name}?</h2><p>This removes this map from your project. Linked Locations will stay. Export a JSON copy first if you may want it back.</p><div className="atlas-options"><button autoFocus onClick={() => setShowDelete(false)}>Keep map</button><button onClick={() => { if (store.deleteMap(map.id)) onLibrary() }}>Delete map</button></div></div></div>}
  </div>
}
