import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CHARACTER_LINK_REL_TYPES, DEFAULT_CHARACTER_LINK_REL_TYPE, getRelType } from '../../constants/relationshipTypes.js'
import { FACTION_ICONS } from '../../constants/factionIcons'
import { buildRelationshipGraph, buildRelationshipIndex } from '../../utils/relationshipMap.js'
import { ALPHA_STOP, createBestLayout, createForceState, forceBounds, reheatForce, settleNewcomers, stepForce } from '../../utils/relationshipForce.js'
import { clearMapLayout, loadMapLayout, saveMapLayout } from '../../utils/relationshipMapLayout.js'
import FactionLogo from '../Factions/FactionLogo'
import { CharacterAvatar as PortraitAvatar } from '../shared/CharacterPortrait'

const EMPTY = []
const factionIcons = new Map(FACTION_ICONS.map(icon => [icon.id, icon]))
const displayName = character => character?.name || 'Unnamed character'
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
// The app runs desktop widths at a 90% page zoom (CSS `zoom` on body), which makes
// getBoundingClientRect and pointer coordinates screen pixels while the map's own
// transform works in CSS pixels. `z` converts between the two.
const viewportMetrics = viewport => {
  const rect = viewport.getBoundingClientRect()
  const width = viewport.offsetWidth || rect.width || 900
  const height = viewport.offsetHeight || rect.height || 430
  const z = rect.width && viewport.offsetWidth ? rect.width / viewport.offsetWidth : 1
  return { rect, width, height, z }
}

function CharacterAvatar({ character, faction, size = 52 }) {
  const legacyIcon = factionIcons.get(faction?.iconId)
  const badgeSize = size >= 34 ? 14 : 12
  return (
    <span className="relative inline-flex flex-shrink-0">
      <PortraitAvatar character={character} size={size} shape="circle" />
      {faction && (
        <span className="absolute grid place-items-center border border-[var(--border)] bg-[var(--bg-main)] shadow-sm overflow-hidden"
          style={{ width: badgeSize, height: badgeSize, right: -2, bottom: -2, borderRadius: 4 }}
          title={`${faction.name || 'Faction'} logo`} aria-label={`${faction.name || 'Faction'} logo`}>
          {legacyIcon ? <img src={legacyIcon.url} alt="" className="w-[72%] h-[72%] object-contain opacity-70" /> : <FactionLogo shapes={faction.logo} size={badgeSize - 4} />}
        </span>
      )}
    </span>
  )
}

function RelationshipNetworkCanvas({ index, focalCharacter, onFocus, avatar, projectKey }) {
  const viewportRef = useRef(null)
  const viewRef = useRef({ scale: 1, x: 0, y: 0 })
  const pointersRef = useRef(new Map())
  const gestureRef = useRef(null)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const sizeRef = useRef(null)
  const touchedRef = useRef(false)
  // True from a project's first render until its remembered pan/zoom has been applied;
  // until then we must not overwrite the stored view with the default one.
  const pendingRestoreRef = useRef(false)
  const frameRef = useRef(0)
  const viewAnimRef = useRef(0)
  const simRef = useRef(null)
  const previousFocalRef = useRef(null)
  const [view, setViewState] = useState({ scale: 1, x: 0, y: 0 })
  const [, setTick] = useState(0)
  const graph = useMemo(() => buildRelationshipGraph(index), [index])
  const focalConnections = useMemo(() => new Set(index.connectionsFor(focalCharacter.id).map(connection => connection.character.id)), [index, focalCharacter.id])
  const degrees = useMemo(() => {
    const counts = new Map(graph.nodes.map(node => [node.id, 0]))
    graph.edges.forEach(edge => {
      counts.set(edge.sourceId, (counts.get(edge.sourceId) || 0) + 1)
      counts.set(edge.targetId, (counts.get(edge.targetId) || 0) + 1)
    })
    return counts
  }, [graph])

  // Build (or extend) the simulation synchronously during render so the first
  // paint is already a settled layout. A first visit gets the least-tangled
  // layout we can find; after that the map comes back exactly as the user left
  // it, and characters added later are placed without moving the others.
  const simKey = `${projectKey}:${graph.nodes.map(node => node.id).join('|')}:${graph.edges.map(edge => edge.key).join('|')}`
  const simKeyRef = useRef(null)
  if (simKeyRef.current !== simKey) {
    const seeds = new Map()
    const old = simRef.current
    if (old && simKeyRef.current?.startsWith(`${projectKey}:`)) old.ids.forEach((id, i) => seeds.set(id, { x: old.x[i], y: old.y[i] }))
    else {
      const present = new Set(graph.nodes.map(node => node.id))
      const saved = loadMapLayout(projectKey)
      saved?.nodes.forEach((point, id) => { if (present.has(id)) seeds.set(id, point) })
      pendingRestoreRef.current = Boolean(saved?.view)
    }
    let next
    if (!seeds.size) next = createBestLayout(graph.nodes, graph.edges)
    else {
      next = createForceState(graph.nodes, graph.edges, seeds)
      if (seeds.size < next.ids.length) settleNewcomers(next, [...seeds.keys()])
      else next.alpha = 0
    }
    simRef.current = next
    simKeyRef.current = simKey
  }
  const sim = simRef.current

  const setView = useCallback(next => {
    viewRef.current = next
    setViewState(next)
  }, [])
  const stopViewAnimation = useCallback(() => { cancelAnimationFrame(viewAnimRef.current) }, [])
  const markTouched = () => { touchedRef.current = true }
  const persist = useCallback(() => {
    if (simRef.current) saveMapLayout(projectKey, simRef.current, pendingRestoreRef.current ? undefined : touchedRef.current ? viewRef.current : null, sizeRef.current)
  }, [projectKey])
  const startPhysics = useCallback(() => {
    if (frameRef.current) return
    const run = () => {
      const state = simRef.current
      const active = state && stepForce(state)
      setTick(tick => tick + 1)
      frameRef.current = active || dragRef.current?.moved ? requestAnimationFrame(run) : 0
      if (!frameRef.current) persist()
    }
    frameRef.current = requestAnimationFrame(run)
  }, [persist])
  useEffect(() => {
    if (sim.alpha > ALPHA_STOP) startPhysics()
    else persist()
  }, [sim, startPhysics, persist])
  // Remember pan/zoom a moment after the user stops moving the view.
  useEffect(() => {
    const timer = setTimeout(persist, 400)
    return () => clearTimeout(timer)
  }, [view, persist])
  useEffect(() => () => { cancelAnimationFrame(frameRef.current); cancelAnimationFrame(viewAnimRef.current); frameRef.current = 0; persist() }, [persist])

  // `getTarget` is re-read every frame so the view keeps tracking a character
  // who is still drifting (neighbours settling after a drag).
  const animateTo = useCallback(getTarget => {
    cancelAnimationFrame(viewAnimRef.current)
    touchedRef.current = true
    const from = viewRef.current
    const started = performance.now()
    const run = now => {
      const t = clamp((now - started) / 450, 0, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      const target = getTarget()
      setView({ scale: from.scale + (target.scale - from.scale) * ease, x: from.x + (target.x - from.x) * ease, y: from.y + (target.y - from.y) * ease })
      if (t < 1 || (simRef.current?.alpha > ALPHA_STOP)) viewAnimRef.current = requestAnimationFrame(run)
    }
    viewAnimRef.current = requestAnimationFrame(run)
  }, [setView])
  const fitAll = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    stopViewAnimation()
    const { width, height } = viewportMetrics(viewport)
    sizeRef.current = { width, height }
    const bounds = forceBounds(simRef.current, width < 520 ? 40 : 70)
    const scale = clamp(Math.min(width / bounds.width, height / bounds.height), .22, 1.15)
    setView({ scale, x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale, y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale })
  }, [setView, stopViewAnimation])
  // Throw away the remembered arrangement and lay the cast out afresh.
  const tidy = useCallback(() => {
    clearMapLayout(projectKey)
    simRef.current = createBestLayout(graph.nodes, graph.edges)
    touchedRef.current = false
    setTick(tick => tick + 1)
    fitAll()
    persist()
  }, [projectKey, graph, fitAll, persist])
  const centerOn = useCallback(id => {
    const viewport = viewportRef.current
    const state = simRef.current
    const i = state?.index.get(id)
    if (!viewport || i === undefined) return
    const { width, height } = viewportMetrics(viewport)
    const scale = clamp(Math.max(viewRef.current.scale, width < 520 ? .7 : .95), .5, 1.4)
    animateTo(() => ({ scale, x: width / 2 - state.x[i] * scale, y: height / 2 - state.y[i] * scale }))
  }, [animateTo])
  const zoomAt = useCallback((clientX, clientY, factor) => {
    const viewport = viewportRef.current
    if (!viewport) return
    stopViewAnimation()
    touchedRef.current = true
    const { rect, z } = viewportMetrics(viewport)
    const current = viewRef.current
    const scale = clamp(current.scale * factor, .22, 2.5)
    const screenX = (clientX - rect.left) / z
    const screenY = (clientY - rect.top) / z
    const graphX = (screenX - current.x) / current.scale
    const graphY = (screenY - current.y) / current.scale
    setView({ scale, x: screenX - graphX * scale, y: screenY - graphY * scale })
  }, [setView, stopViewAnimation])
  const zoomCenter = useCallback(factor => {
    const viewport = viewportRef.current
    if (!viewport) return
    const { rect } = viewportMetrics(viewport)
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }, [zoomAt])

  useEffect(() => {
    const saved = loadMapLayout(projectKey)
    const viewport = viewportRef.current
    if (saved?.view && viewport) {
      const { width, height } = viewportMetrics(viewport)
      sizeRef.current = { width, height }
      touchedRef.current = true
      pendingRestoreRef.current = false
      setView({ scale: saved.view.scale, x: width / 2 - saved.view.cx * saved.view.scale, y: height / 2 - saved.view.cy * saved.view.scale })
      return
    }
    pendingRestoreRef.current = false
    touchedRef.current = false
    fitAll()
  }, [fitAll, projectKey, setView])
  // Choosing a different character (click or the selector) glides the view onto them.
  useEffect(() => {
    if (previousFocalRef.current && previousFocalRef.current !== focalCharacter.id) centerOn(focalCharacter.id)
    previousFocalRef.current = focalCharacter.id
  }, [focalCharacter.id, centerOn])
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined
    const onWheel = event => {
      event.preventDefault()
      zoomAt(event.clientX, event.clientY, Math.exp(-clamp(event.deltaY, -120, 120) * .0024))
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [zoomAt])
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return undefined
    // Until the user moves the view a resize re-fits the whole cast; afterwards it
    // keeps whatever they were looking at centred, so focusing a character sticks.
    const observer = new ResizeObserver(() => {
      const { width, height } = viewportMetrics(viewport)
      const before = sizeRef.current
      sizeRef.current = { width, height }
      if (!touchedRef.current || !before) { fitAll(); return }
      const current = viewRef.current
      setView({ ...current, x: current.x + (width - before.width) / 2, y: current.y + (height - before.height) / 2 })
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [fitAll, setView])

  const toGraph = (clientX, clientY) => {
    const { rect, z } = viewportMetrics(viewportRef.current)
    const current = viewRef.current
    return { x: ((clientX - rect.left) / z - current.x) / current.scale, y: ((clientY - rect.top) / z - current.y) / current.scale }
  }
  const beginGesture = event => {
    if (event.button !== undefined && event.button !== 0) return
    markTouched()
    stopViewAnimation()
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const points = [...pointersRef.current.values()]
    if (points.length > 1) {
      const [a, b] = points
      gestureRef.current = {
        type: 'pinch', view: viewRef.current,
        distance: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
    } else {
      gestureRef.current = { type: 'pan', view: viewRef.current, x: event.clientX, y: event.clientY }
    }
  }
  const moveGesture = event => {
    const drag = dragRef.current
    if (drag && drag.pointerId === event.pointerId) {
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
      drag.moved = true
      const point = toGraph(event.clientX, event.clientY)
      simRef.current.pinned.set(drag.nodeIndex, point)
      reheatForce(simRef.current, 0.5)
      startPhysics()
      return
    }
    if (!pointersRef.current.has(event.pointerId) || !gestureRef.current) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const gesture = gestureRef.current
    const points = [...pointersRef.current.values()]
    if (gesture.type === 'pinch' && points.length > 1) {
      const [a, b] = points
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const { rect, z } = viewportMetrics(viewportRef.current)
      const startX = (gesture.midpoint.x - rect.left) / z
      const startY = (gesture.midpoint.y - rect.top) / z
      const graphX = (startX - gesture.view.x) / gesture.view.scale
      const graphY = (startY - gesture.view.y) / gesture.view.scale
      const scale = clamp(gesture.view.scale * Math.hypot(b.x - a.x, b.y - a.y) / gesture.distance, .22, 2.5)
      setView({ scale, x: (midpoint.x - rect.left) / z - graphX * scale, y: (midpoint.y - rect.top) / z - graphY * scale })
    } else if (gesture.type === 'pan') {
      const { z } = viewportMetrics(viewportRef.current)
      setView({ ...gesture.view, x: gesture.view.x + (event.clientX - gesture.x) / z, y: gesture.view.y + (event.clientY - gesture.y) / z })
    }
  }
  const endGesture = event => {
    const drag = dragRef.current
    if (drag && drag.pointerId === event.pointerId) {
      simRef.current.pinned.delete(drag.nodeIndex)
      dragRef.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      if (!drag.moved) onFocus(drag.id)
      else { suppressClickRef.current = true; reheatForce(simRef.current, 0.2); startPhysics() }
      return
    }
    pointersRef.current.delete(event.pointerId)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const remaining = [...pointersRef.current.values()][0]
    gestureRef.current = remaining ? { type: 'pan', view: viewRef.current, x: remaining.x, y: remaining.y } : null
  }
  const beginNodeDrag = (event, id) => {
    if (event.button !== undefined && event.button !== 0) return
    event.stopPropagation()
    stopViewAnimation()
    const nodeIndex = simRef.current.index.get(id)
    dragRef.current = { id, nodeIndex, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false }
    viewportRef.current?.setPointerCapture?.(event.pointerId)
  }
  const handleKeyDown = event => {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomCenter(1.18) }
    else if (event.key === '-') { event.preventDefault(); zoomCenter(1 / 1.18) }
    else if (event.key === '0' || event.key.toLowerCase() === 'f') { event.preventDefault(); fitAll() }
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      const step = event.shiftKey ? 80 : 32
      setView({ ...viewRef.current, x: viewRef.current.x + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0), y: viewRef.current.y + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0) })
    }
  }

  const nodes = graph.nodes.map(character => {
    const i = sim.index.get(character.id)
    return { character, x: sim.x[i], y: sim.y[i], degree: degrees.get(character.id) || 0 }
  })
  const positions = new Map(nodes.map(node => [node.character.id, node]))
  const focusedId = focalCharacter.id

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden bg-[var(--bg-main)]">
      <div className="absolute left-3 top-3 z-30 rounded-lg border border-[var(--border)] bg-[var(--bg-nav)]/95 px-2.5 py-1.5 text-[10px] text-[var(--text-muted)] shadow-sm">
        {graph.nodes.length} character{graph.nodes.length === 1 ? '' : 's'} · {graph.edges.length} connection{graph.edges.length === 1 ? '' : 's'}
      </div>
      <div role="group" aria-label="Relationship map zoom" className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-nav)]/95 p-1 shadow-lg">
        <button aria-label="Zoom relationship map out" title="Zoom out" disabled={view.scale <= .22} onClick={() => zoomCenter(1 / 1.18)} className="grid h-8 w-8 place-items-center rounded-lg text-base font-bold text-[var(--text-main)] hover:bg-[var(--bg-hover)] disabled:opacity-40">−</button>
        <span aria-live="polite" className="w-10 text-center text-[10px] tabular-nums text-[var(--text-muted)]">{Math.round(view.scale * 100)}%</span>
        <button aria-label="Zoom relationship map in" title="Zoom in" disabled={view.scale >= 2.5} onClick={() => zoomCenter(1.18)} className="grid h-8 w-8 place-items-center rounded-lg text-base font-bold text-[var(--text-main)] hover:bg-[var(--bg-hover)] disabled:opacity-40">+</button>
        <button onClick={() => centerOn(focusedId)} className="h-8 rounded-lg border-l border-[var(--border)] px-2.5 text-[10px] font-semibold text-[var(--text-main)] hover:bg-[var(--bg-hover)]" title="Centre the view on the focused character">Centre</button>
        <button onClick={fitAll} className="h-8 rounded-lg border-l border-[var(--border)] px-2.5 text-[10px] font-semibold text-[var(--text-main)] hover:bg-[var(--bg-hover)]" title="Fit every character and connection in view">Fit all</button>
        <button onClick={tidy} className="h-8 rounded-lg border-l border-[var(--border)] px-2.5 text-[10px] font-semibold text-[var(--text-main)] hover:bg-[var(--bg-hover)]" title="Re-arrange the whole cast to minimise crossing lines (forgets your custom layout)">Tidy</button>
      </div>
      <div ref={viewportRef} tabIndex={0} role="region" aria-label="Interactive relationship map; drag to pan, use the mouse wheel or plus and minus keys to zoom, and press F to fit all" onKeyDown={handleKeyDown} onPointerDown={beginGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture}
        onScroll={event => { if (event.currentTarget.scrollLeft || event.currentTarget.scrollTop) event.currentTarget.scrollTo(0, 0) }}
        className="absolute inset-0 cursor-grab select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] active:cursor-grabbing" style={{ touchAction: 'none' }}>
        <div className="absolute left-0 top-0" style={{ width: 0, height: 0, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
            {graph.edges.map(edge => {
              const source = positions.get(edge.sourceId)
              const target = positions.get(edge.targetId)
              const highlighted = edge.sourceId === focusedId || edge.targetId === focusedId
              const socialFact = edge.facts[0]
              const mx = (source.x + target.x) / 2
              const my = (source.y + target.y) / 2
              const dx = target.x - source.x
              const dy = target.y - source.y
              const bow = Math.min(40, Math.hypot(dx, dy) * .12) * (edge.sourceId < edge.targetId ? 1 : -1)
              const cx = mx - (dy / (Math.hypot(dx, dy) || 1)) * bow
              const cy = my + (dx / (Math.hypot(dx, dy) || 1)) * bow
              const colour = socialFact ? getRelType(socialFact.type).color : 'var(--text-muted)'
              return (
                <g key={edge.key} style={{ transition: 'opacity .25s' }} opacity={highlighted ? 1 : .22}>
                  <path d={`M${source.x},${source.y} Q${cx},${cy} ${target.x},${target.y}`} fill="none" stroke={colour} strokeWidth={highlighted ? 3 : 1.4} strokeLinecap="round" strokeDasharray={!socialFact && edge.family ? '7 5' : undefined}><title>{edge.labels.join(', ')}</title></path>
                  {highlighted && edge.labels.map((label, k) => (
                    <text key={label} x={(source.x + 2 * cx + target.x) / 4} y={(source.y + 2 * cy + target.y) / 4 + k * 11 - (edge.labels.length - 1) * 5.5} textAnchor="middle" fontSize="10" fontWeight="600" fill={colour} style={{ paintOrder: 'stroke', stroke: 'var(--bg-main)', strokeWidth: 4, strokeLinejoin: 'round' }}>{label}</text>
                  ))}
                </g>
              )
            })}
          </svg>
          {nodes.map(({ character, x, y, degree }) => {
            const focused = character.id === focusedId
            const near = focalConnections.has(character.id)
            const size = focused ? 58 : 40
            return (
              <button key={character.id} onFocus={() => viewportRef.current?.scrollTo(0, 0)} onPointerDown={event => beginNodeDrag(event, character.id)} onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return } onFocus(character.id) }}
                aria-label={`Focus on ${displayName(character)}`} aria-pressed={focused} title={`${displayName(character)} · ${degree} connection${degree === 1 ? '' : 's'}`}
                className={`absolute z-20 flex w-24 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none flex-col items-center gap-1 bg-transparent p-0 text-center outline-none transition-opacity focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-[var(--accent)] ${focused || near ? 'opacity-100' : 'opacity-35 hover:opacity-100'}`}
                style={{ left: x, top: y }}>
                <span className={`relative inline-flex rounded-full bg-[var(--bg-nav)] shadow-lg ring-2 ${focused ? 'ring-[var(--accent)] shadow-xl' : near ? 'ring-[var(--border)]' : 'ring-transparent'}`}>{avatar(character, size)}</span>
                <strong className={`w-full rounded-md bg-[var(--bg-main)]/80 px-1 text-[10px] font-semibold leading-[1.15] text-[var(--text-main)] [overflow-wrap:anywhere] ${focused ? 'text-[11px]' : ''}`}>{displayName(character)}</strong>
                {focused && <span className="text-[8px] font-bold text-[var(--accent)]">Focused · {degree} connection{degree === 1 ? '' : 's'}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--bg-nav)]/90 px-3 py-1 text-center text-[9px] text-[var(--text-muted)] shadow-sm">Click a character to focus · Drag a character to move them · Drag empty space to pan · Scroll or pinch to zoom</p>
    </div>
  )
}

function FocusedRelationships({ store, index, focalCharacter }) {
  const identity = `${store.activeNovelId || ''}:${focalCharacter.id}`
  const emptyDraft = () => ({ identity, targetId: '', relationshipType: DEFAULT_CHARACTER_LINK_REL_TYPE, error: '' })
  const [storedDraft, setDraft] = useState(emptyDraft)
  let draft = storedDraft
  if (storedDraft.identity !== identity) {
    draft = emptyDraft()
    setDraft(draft)
  }
  const { targetId, relationshipType, error } = draft
  const setError = value => setDraft(current => ({ ...current, error: value }))
  const setTargetId = value => setDraft(current => ({ ...current, targetId: value }))
  const setRelationshipType = value => setDraft(current => ({ ...current, relationshipType: value }))
  const connections = useMemo(() => index.connectionsFor(focalCharacter.id), [index, focalCharacter.id])
  const readOnly = store.readOnly || focalCharacter.readOnly
  const duplicate = connections.some(connection => connection.character.id === targetId
    && connection.facts.some(fact => !fact.family && fact.direction === 'outgoing' && fact.type === relationshipType))
  const validTarget = targetId !== focalCharacter.id && index.byId.has(targetId)

  const save = (sourceId, otherId, type, remove = false) => {
    setError('')
    try {
      const savedId = store.saveRelationship(sourceId, otherId, type, { remove })
      if (!savedId) {
        setError('This connection could not be saved. Check that both characters are available and editable, then try again.')
        return false
      }
      if (sourceId === focalCharacter.id && savedId !== sourceId) store.setSelectedCharacterId(savedId)
      return true
    } catch {
      setError('This connection could not be saved. Your selection has been kept so you can try again.')
      return false
    }
  }
  const addConnection = () => {
    if (readOnly || !validTarget || duplicate) return
    if (save(focalCharacter.id, targetId, relationshipType)) setTargetId('')
  }
  const openProfile = () => {
    store.setSelectedCharacterId(focalCharacter.id)
    window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: 'characters' } }))
  }
  const avatar = (character, size) => <CharacterAvatar character={character} faction={index.factions.get(character.factionId)} size={size} />

  return (
    <div className="min-h-0 flex flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start xl:items-stretch">
        <section className="min-w-0 min-h-[420px] rounded-2xl border border-[var(--border)] bg-[var(--bg-nav)] overflow-hidden" data-tour="relationships-map">
          <RelationshipNetworkCanvas index={index} focalCharacter={focalCharacter} onFocus={store.setSelectedCharacterId} avatar={avatar} projectKey={store.activeNovelId} />
        </section>
        <aside className="rounded-2xl border border-[var(--border)] bg-[var(--bg-nav)] p-4 space-y-4 xl:max-h-full xl:overflow-y-auto">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Focused on</p>
            <h2 className="text-lg font-bold text-[var(--text-main)] mt-1 break-words">{displayName(focalCharacter)}</h2>
          </div>
          <div className="border-t border-[var(--border)] pt-4 space-y-2">
            <h3 className="text-xs font-bold text-[var(--text-main)]">Add a connection</h3>
            <p className="text-xs text-[var(--text-muted)]">Links are directional. Adding a type keeps other types and reverse links.</p>
            <select aria-label="Connection character" disabled={readOnly} value={validTarget ? targetId : ''} onChange={event => { setTargetId(event.target.value); setError('') }} className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-2 py-2 text-base text-[var(--text-main)]">
              <option value="">Choose character…</option>
              {index.entries.filter(character => character.id !== focalCharacter.id).map(character => <option key={character.id} value={character.id}>{displayName(character)}</option>)}
            </select>
            <select aria-label="Connection type" disabled={readOnly} value={relationshipType} onChange={event => { setRelationshipType(event.target.value); setError('') }} className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-2 py-2 text-base text-[var(--text-main)]">
              {CHARACTER_LINK_REL_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
            <button disabled={readOnly || !validTarget || duplicate} onClick={addConnection} className="w-full bg-[var(--accent)] disabled:opacity-40 text-[var(--bg-main)] text-xs font-bold py-2 rounded-lg">Add Connection</button>
            {duplicate && <p className="text-xs text-[var(--text-muted)]">This outgoing connection already exists.</p>}
            {readOnly && <p className="text-xs text-[var(--text-muted)]">Connections are read-only.</p>}
            {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          </div>
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="text-xs font-bold text-[var(--text-main)] mb-2">Connections</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {!connections.length && <p className="text-xs italic text-[var(--text-muted)]">Nothing mapped yet.</p>}
              {connections.map(connection => (
                <div key={connection.character.id} className="bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-2 py-2">
                  <button onClick={() => store.setSelectedCharacterId(connection.character.id)} className="text-xs font-semibold text-[var(--text-main)] text-left break-words">{displayName(connection.character)}</button>
                  {connection.facts.map(fact => {
                    const sourceName = displayName(index.byId.get(fact.sourceId))
                    const targetName = displayName(index.byId.get(fact.targetId))
                    return (
                      <div key={fact.key} className="flex items-center justify-between gap-2 mt-2">
                        <span className="min-w-0 text-[10px]" style={{ color: getRelType(fact.type).color }}>
                          {fact.label}
                          <span className="block text-[var(--text-muted)] break-words">{fact.family ? 'Family · read-only' : `${sourceName} → ${targetName}`}</span>
                        </span>
                        {!fact.family && <button disabled={store.readOnly || index.byId.get(fact.sourceId)?.readOnly} onClick={() => save(fact.sourceId, fact.targetId, fact.type, true)} className="text-xs text-red-400 p-2 disabled:opacity-40" aria-label={`Remove ${fact.label} link from ${sourceName} to ${targetName}`}>✕</button>}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          <button onClick={openProfile} className="w-full border border-[var(--border)] text-[var(--text-main)] text-xs py-2 rounded-lg hover:border-[var(--accent)]">Open Character Profile</button>
          <p className="text-[10px] text-[var(--text-muted)] text-center">Canvas counts show each character's unique connected people.</p>
        </aside>
      </div>
    </div>
  )
}

export default function RelationshipMap({ store }) {
  const characters = store.characters || EMPTY
  const factions = store.factions || EMPTY
  const knownCharacters = store.continuityRecords?.characters || characters
  const index = useMemo(() => buildRelationshipIndex(characters, factions, knownCharacters), [characters, factions, knownCharacters])
  const focalCharacter = index.byId.get(index.aliases.get(store.selectedCharacterId)) || index.entries[0]
  return (
    <div className="h-full overflow-auto xl:overflow-hidden bg-[var(--bg-main)] p-4">
      <div className="max-w-7xl h-full mx-auto flex flex-col gap-3">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between" data-tour="relationships-header">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-main)]">Relationship Map</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">Explore the whole cast at once, then focus on any character to inspect their links. Family links are read-only here and managed in the Family Tree.</p>
          </div>
          {focalCharacter && <label className="text-xs text-[var(--text-muted)]">Focal character
            <select value={focalCharacter.id} onChange={event => store.setSelectedCharacterId(event.target.value)} className="block mt-1 w-full md:w-56 bg-[var(--bg-nav)] border border-[var(--border)] rounded-lg px-3 py-2 text-base text-[var(--text-main)]">
              {index.entries.map(character => <option key={character.id} value={character.id}>{displayName(character)}</option>)}
            </select>
          </label>}
        </header>
        {focalCharacter ? <FocusedRelationships store={store} index={index} focalCharacter={focalCharacter} /> : (
          <div className="h-[58vh] grid place-items-center border border-dashed border-[var(--border)] rounded-2xl text-center px-8">
            <div><p className="text-sm font-semibold text-[var(--text-main)]">Add a character to begin</p><p className="text-xs text-[var(--text-muted)] mt-2">Relationship mapping will appear once your cast has someone to focus on.</p></div>
          </div>
        )}
      </div>
    </div>
  )
}
