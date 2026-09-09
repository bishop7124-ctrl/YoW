import { useEffect, useMemo, useRef, useState } from 'react'
import { CHARACTER_LINK_REL_TYPES, DEFAULT_CHARACTER_LINK_REL_TYPE, getRelType } from '../../constants/relationshipTypes.js'
import { FACTION_ICONS } from '../../constants/factionIcons'
import { buildRelationshipIndex, relationshipMapPage, RELATIONSHIP_MAP_SIZE } from '../../utils/relationshipMap.js'
import FactionLogo from '../Factions/FactionLogo'
import { CharacterAvatar as PortraitAvatar } from '../shared/CharacterPortrait'

const EMPTY = []
const factionIcons = new Map(FACTION_ICONS.map(icon => [icon.id, icon]))
const displayName = character => character?.name || 'Unnamed character'

function CharacterAvatar({ character, faction, size = 52 }) {
  const legacyIcon = factionIcons.get(faction?.iconId)
  return (
    <span className="relative inline-flex flex-shrink-0">
      <PortraitAvatar character={character} size={size} shape="circle" />
      {faction && (
        <span className="absolute -right-1 -bottom-1 w-6 h-6 grid place-items-center rounded-md border border-[var(--border)] bg-[var(--bg-main)] shadow-sm overflow-hidden"
          title={`${faction.name || 'Faction'} logo`} aria-label={`${faction.name || 'Faction'} logo`}>
          {legacyIcon ? <img src={legacyIcon.url} alt="" className="w-[70%] h-[70%] object-contain opacity-70" /> : <FactionLogo shapes={faction.logo} size={19} />}
        </span>
      )}
    </span>
  )
}

function FocusedRelationships({ store, index, focalCharacter }) {
  const [targetId, setTargetId] = useState('')
  const [relationshipType, setRelationshipType] = useState(DEFAULT_CHARACTER_LINK_REL_TYPE)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const scrollRef = useRef(null)
  const connections = useMemo(() => index.connectionsFor(focalCharacter.id), [index, focalCharacter.id])
  const { nodes, page: currentPage, pageCount } = useMemo(() => relationshipMapPage(connections, page), [connections, page])
  const extendedCounts = useMemo(() => new Map(nodes.map(node => [
    node.character.id, index.connectionsFor(node.character.id).filter(connection => connection.character.id !== focalCharacter.id).length,
  ])), [index, nodes, focalCharacter.id])
  const readOnly = store.readOnly || focalCharacter.readOnly
  const duplicate = connections.some(connection => connection.character.id === targetId
    && connection.facts.some(fact => !fact.family && fact.direction === 'outgoing' && fact.type === relationshipType))
  const validTarget = targetId !== focalCharacter.id && index.byId.has(targetId)
  useEffect(() => {
    const viewport = scrollRef.current
    if (viewport) viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2)
  }, [focalCharacter.id, currentPage])

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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">{connections.length} connected character{connections.length === 1 ? '' : 's'}. Up to eight are shown at a time.</p>
        {pageCount > 1 && (
          <nav aria-label="Connection pages" className="flex items-center gap-3 text-xs">
            <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="border border-[var(--border)] rounded-lg px-3 py-2 disabled:opacity-40">Previous connections</button>
            <span role="status">Page {currentPage + 1} of {pageCount}</span>
            <button disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)} className="border border-[var(--border)] rounded-lg px-3 py-2 disabled:opacity-40">Next connections</button>
          </nav>
        )}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        <section className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--bg-nav)] overflow-hidden" data-tour="relationships-map">
          <p className="text-xs text-[var(--text-muted)] px-4 py-2">Scroll the map horizontally on smaller screens. Select a character to refocus.</p>
          <div ref={scrollRef} tabIndex={0} role="region" aria-label="Relationship map canvas" className="overflow-x-auto">
            <div className="relative" style={{ width: RELATIONSHIP_MAP_SIZE.width, height: RELATIONSHIP_MAP_SIZE.height }}>
              <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${RELATIONSHIP_MAP_SIZE.width} ${RELATIONSHIP_MAP_SIZE.height}`} aria-hidden="true">
                {nodes.map(node => <line key={node.character.id} x1={RELATIONSHIP_MAP_SIZE.centerX} y1={RELATIONSHIP_MAP_SIZE.centerY} x2={node.x} y2={node.y} stroke={getRelType(node.facts[0].type).color} strokeWidth="2.4" opacity=".82" />)}
              </svg>
              <button onClick={openProfile} title="Open focal character profile"
                className="relationship-focus-enter absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-40 h-48 rounded-[2rem] border-2 border-[var(--accent)] bg-[var(--bg-main)] shadow-2xl p-4 flex flex-col items-center justify-center text-center">
                {avatar(focalCharacter, 76)}
                <strong className="w-full text-sm text-[var(--text-main)] mt-3 leading-tight line-clamp-2">{displayName(focalCharacter)}</strong>
                <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] mt-1">Focal character</span>
              </button>
              {nodes.map((node, position) => {
                const color = getRelType(node.facts[0].type).color
                const count = extendedCounts.get(node.character.id)
                return (
                  <button key={node.character.id} onClick={() => store.setSelectedCharacterId(node.character.id)}
                    aria-label={`Focus on ${displayName(node.character)}`} title={`${displayName(node.character)}: ${node.labels.join(', ')}`}
                    className="relationship-node-enter absolute z-20 w-[152px] h-[170px] p-3 -translate-x-1/2 -translate-y-1/2 rounded-[1.4rem] border bg-[var(--bg-main)] shadow-lg flex flex-col items-center justify-center text-center"
                    style={{ left: node.x, top: node.y, borderColor: color, animationDelay: `${position * 35}ms` }}>
                    {avatar(node.character, 52)}
                    <strong className="w-full text-xs text-[var(--text-main)] mt-2 leading-tight line-clamp-2">{displayName(node.character)}</strong>
                    <span className="text-[10px] mt-1 leading-tight line-clamp-2" style={{ color }}>{node.labels.join(' · ')}</span>
                    {node.facts.some(fact => fact.family) && <span className="text-[9px] text-[var(--text-muted)]">from family tree</span>}
                    {count > 0 && <span className="absolute -right-2 -bottom-2 w-7 h-7 rounded-md grid place-items-center border border-[var(--border)] bg-[var(--surface2)] text-[9px] font-bold text-[var(--text-muted)] shadow-md" title={`${count} other connected characters`} aria-label={`${count} other connected characters`}>+{count}</span>}
                  </button>
                )
              })}
              {!connections.length && <p className="absolute left-1/2 top-[76%] -translate-x-1/2 text-center w-72 text-xs text-[var(--text-muted)]">No connections yet. Add a social link here or manage family links in the Family Tree.</p>}
            </div>
          </div>
        </section>
        <aside className="rounded-2xl border border-[var(--border)] bg-[var(--bg-nav)] p-4 space-y-4 xl:sticky xl:top-4">
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
            <h3 className="text-xs font-bold text-[var(--text-main)] mb-2">Connections on this page</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {!nodes.length && <p className="text-xs italic text-[var(--text-muted)]">Nothing mapped yet.</p>}
              {nodes.map(connection => (
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
          <p className="text-[10px] text-[var(--text-muted)] text-center">A + badge counts other connected people, not relationship types.</p>
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
    <div className="h-full overflow-auto bg-[var(--bg-main)] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between" data-tour="relationships-header">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-main)]">Relationship Map</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">Focus on one character and see their social and family connections. Family links are read-only here and managed in the Family Tree.</p>
          </div>
          {focalCharacter && <label className="text-xs text-[var(--text-muted)]">Focal character
            <select value={focalCharacter.id} onChange={event => store.setSelectedCharacterId(event.target.value)} className="block mt-1 w-full md:w-56 bg-[var(--bg-nav)] border border-[var(--border)] rounded-lg px-3 py-2 text-base text-[var(--text-main)]">
              {index.entries.map(character => <option key={character.id} value={character.id}>{displayName(character)}</option>)}
            </select>
          </label>}
        </header>
        {focalCharacter ? <FocusedRelationships key={`${store.activeNovelId || ''}:${focalCharacter.id}`} store={store} index={index} focalCharacter={focalCharacter} /> : (
          <div className="h-[58vh] grid place-items-center border border-dashed border-[var(--border)] rounded-2xl text-center px-8">
            <div><p className="text-sm font-semibold text-[var(--text-main)]">Add a character to begin</p><p className="text-xs text-[var(--text-muted)] mt-2">Relationship mapping will appear once your cast has someone to focus on.</p></div>
          </div>
        )}
      </div>
    </div>
  )
}
