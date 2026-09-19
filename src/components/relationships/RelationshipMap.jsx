import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CHARACTER_LINK_REL_TYPES, DEFAULT_CHARACTER_LINK_REL_TYPE, getRelType } from '../../constants/relationshipTypes.js'
import { FACTION_ICONS } from '../../constants/factionIcons'
import { buildRelationshipGraph, buildRelationshipIndex, relationshipNetworkLayout } from '../../utils/relationshipMap.js'
import FactionLogo from '../Factions/FactionLogo'
import { CharacterAvatar as PortraitAvatar } from '../shared/CharacterPortrait'

const EMPTY = []
const factionIcons = new Map(FACTION_ICONS.map(icon => [icon.id, icon]))
const displayName = character => character?.name || 'Unnamed character'
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

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
  const [view, setViewState] = useState({ scale: 1, x: 0, y: 0 })
  const graph = useMemo(() => buildRelationshipGraph(index), [index])
  const layout = useMemo(() => relationshipNetworkLayout(graph.nodes, graph.edges), [graph])
  const positions = useMemo(() => new Map(layout.nodes.map(node => [node.id, node])), [layout.nodes])
  const focalConnections = useMemo(() => new Set(index.connectionsFor(focalCharacter.id).map(connection => connection.character.id)), [index, focalCharacter.id])

  const setView = useCallback(next => {
    viewRef.current = next
    setViewState(next)
  }, [])
  const fitAll = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const width = rect.width || viewport.clientWidth || 900
    const height = rect.height || viewport.clientHeight || 430
    const padding = width < 520 ? 28 : 52
    const scale = clamp(Math.min((width - padding * 2) / layout.size.width, (height - padding * 2) / layout.size.height), .22, 1.15)
    setView({
      scale,
      x: (width - layout.size.width * scale) / 2,
      y: (height - layout.size.height * scale) / 2,
    })
  }, [layout.size.height, layout.size.width, setView])
  const zoomAt = useCallback((clientX, clientY, factor) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const current = viewRef.current
    const scale = clamp(current.scale * factor, .22, 2.5)
    const screenX = clientX - rect.left
    const screenY = clientY - rect.top
    const graphX = (screenX - current.x) / current.scale
    const graphY = (screenY - current.y) / current.scale
    setView({ scale, x: screenX - graphX * scale, y: screenY - graphY * scale })
  }, [setView])
  const zoomCenter = useCallback(factor => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }, [zoomAt])

  useEffect(() => { fitAll() }, [fitAll, projectKey])
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
    const observer = new ResizeObserver(() => fitAll())
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [fitAll])

  const beginGesture = event => {
    if (event.button !== undefined && event.button !== 0) return
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
    if (!pointersRef.current.has(event.pointerId) || !gestureRef.current) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const gesture = gestureRef.current
    const points = [...pointersRef.current.values()]
    if (gesture.type === 'pinch' && points.length > 1) {
      const [a, b] = points
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const rect = viewportRef.current.getBoundingClientRect()
      const startX = gesture.midpoint.x - rect.left
      const startY = gesture.midpoint.y - rect.top
      const graphX = (startX - gesture.view.x) / gesture.view.scale
      const graphY = (startY - gesture.view.y) / gesture.view.scale
      const scale = clamp(gesture.view.scale * Math.hypot(b.x - a.x, b.y - a.y) / gesture.distance, .22, 2.5)
      setView({ scale, x: midpoint.x - rect.left - graphX * scale, y: midpoint.y - rect.top - graphY * scale })
    } else if (gesture.type === 'pan') {
      setView({ ...gesture.view, x: gesture.view.x + event.clientX - gesture.x, y: gesture.view.y + event.clientY - gesture.y })
    }
  }
  const endGesture = event => {
    pointersRef.current.delete(event.pointerId)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const remaining = [...pointersRef.current.values()][0]
    gestureRef.current = remaining ? { type: 'pan', view: viewRef.current, x: remaining.x, y: remaining.y } : null
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

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden bg-[var(--bg-main)]">
      <div className="absolute left-3 top-3 z-30 rounded-lg border border-[var(--border)] bg-[var(--bg-nav)]/95 px-2.5 py-1.5 text-[10px] text-[var(--text-muted)] shadow-sm">
        {graph.nodes.length} character{graph.nodes.length === 1 ? '' : 's'} · {graph.edges.length} connection{graph.edges.length === 1 ? '' : 's'}
      </div>
      <div role="group" aria-label="Relationship map zoom" className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-nav)]/95 p-1 shadow-lg">
        <button aria-label="Zoom relationship map out" title="Zoom out" disabled={view.scale <= .22} onClick={() => zoomCenter(1 / 1.18)} className="grid h-8 w-8 place-items-center rounded-lg text-base font-bold text-[var(--text-main)] hover:bg-[var(--bg-hover)] disabled:opacity-40">−</button>
        <span aria-live="polite" className="w-10 text-center text-[10px] tabular-nums text-[var(--text-muted)]">{Math.round(view.scale * 100)}%</span>
        <button aria-label="Zoom relationship map in" title="Zoom in" disabled={view.scale >= 2.5} onClick={() => zoomCenter(1.18)} className="grid h-8 w-8 place-items-center rounded-lg text-base font-bold text-[var(--text-main)] hover:bg-[var(--bg-hover)] disabled:opacity-40">+</button>
        <button onClick={fitAll} className="h-8 rounded-lg border-l border-[var(--border)] px-2.5 text-[10px] font-semibold text-[var(--text-main)] hover:bg-[var(--bg-hover)]" title="Fit every character and connection in view">Fit all</button>
      </div>
      <div ref={viewportRef} tabIndex={0} role="region" aria-label="Interactive relationship map; drag to pan, use the mouse wheel or plus and minus keys to zoom, and press F to fit all" onKeyDown={handleKeyDown} onPointerDown={beginGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture}
        className="absolute inset-0 cursor-grab select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] active:cursor-grabbing" style={{ touchAction: 'none' }}>
        <div className="absolute left-0 top-0" style={{ width: layout.size.width, height: layout.size.height, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${layout.size.width} ${layout.size.height}`} aria-hidden="true">
            {layout.edges.map(edge => {
              const source = positions.get(edge.sourceId)
              const target = positions.get(edge.targetId)
              const highlighted = edge.sourceId === focalCharacter.id || edge.targetId === focalCharacter.id
              const socialFact = edge.facts[0]
              return <line key={edge.key} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={socialFact ? getRelType(socialFact.type).color : 'var(--text-muted)'} strokeWidth={highlighted ? 3 : 1.6} strokeDasharray={!socialFact && edge.family ? '7 5' : undefined} opacity={highlighted ? .9 : .34}><title>{edge.labels.join(', ')}</title></line>
            })}
          </svg>
          {layout.nodes.map((character, position) => {
            const focused = character.id === focalCharacter.id
            const directlyConnected = focalConnections.has(character.id)
            return (
              <button key={character.id} onPointerDown={event => event.stopPropagation()} onClick={() => onFocus(character.id)} aria-label={`Focus on ${displayName(character)}`} aria-pressed={focused} title={`${displayName(character)} · ${character.degree} connection${character.degree === 1 ? '' : 's'}`}
                className={`relationship-node-enter absolute z-20 flex h-[78px] w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border bg-[var(--bg-nav)] px-2 text-center shadow-lg transition-[opacity,border-color,box-shadow] ${focused ? 'border-2 border-[var(--accent)] shadow-xl' : 'border-[var(--border)] hover:border-[var(--accent)]'} ${!focused && !directlyConnected ? 'opacity-80' : ''}`}
                style={{ left: character.x, top: character.y, animationDelay: `${Math.min(position, 18) * 22}ms` }}>
                {avatar(character, 22)}
                <strong className="mt-1 w-full text-[10px] font-semibold leading-[1.1] text-[var(--text-main)] [overflow-wrap:anywhere]">{displayName(character)}</strong>
                <span className={`mt-0.5 text-[8px] ${focused ? 'font-bold text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>{focused ? 'Focused' : `${character.degree} connection${character.degree === 1 ? '' : 's'}`}</span>
              </button>
            )
          })}
        </div>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--bg-nav)]/90 px-3 py-1 text-center text-[9px] text-[var(--text-muted)] shadow-sm">Drag to pan · Scroll or pinch to zoom · Select a character to focus</p>
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
