import { useMemo, useState } from 'react'
import { getRelType, REL_TYPES } from '../../constants/Constants'

const FAMILY_RELATIONSHIP_TYPES = new Set([
  'spouse', 'parent', 'child', 'sibling', 'cousin', 'auntuncle', 'grandparent',
])

const toArray = value => Array.isArray(value) ? value : []

const isSocialRelationship = relationship => (
  Boolean(relationship?.targetId)
  && !FAMILY_RELATIONSHIP_TYPES.has(relationship.type)
  && !getRelType(relationship.type).structural
)

const getFocalConnections = (characters, focalId) => {
  const byId = new Map(characters.map(character => [character.id, character]))
  const outgoingByCharacter = new Map()
  const incomingByCharacter = new Map()

  characters.forEach(character => {
    toArray(character.relationships).filter(isSocialRelationship).forEach(relationship => {
      const outgoing = character.id === focalId
      const incoming = relationship.targetId === focalId
      if (!outgoing && !incoming) return

      const otherId = outgoing ? relationship.targetId : character.id
      if (!byId.has(otherId) || otherId === focalId) return
      const connection = {
        character: byId.get(otherId),
        type: relationship.type,
        direction: outgoing ? 'outgoing' : 'incoming',
      }
      if (outgoing) outgoingByCharacter.set(otherId, connection)
      else if (!incomingByCharacter.has(otherId)) incomingByCharacter.set(otherId, connection)
    })
  })

  const connections = [...new Set([...outgoingByCharacter.keys(), ...incomingByCharacter.keys()])]
    .map(characterId => outgoingByCharacter.get(characterId) || incomingByCharacter.get(characterId))
  return connections.sort((a, b) => (
    getRelType(a.type).label.localeCompare(getRelType(b.type).label)
    || (a.character.name || '').localeCompare(b.character.name || '')
  ))
}

const initials = name => (name || '?')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0]?.toUpperCase())
  .join('') || '?'

function CharacterAvatar({ character, size = 62 }) {
  if (character.image) {
    return <img src={character.image} alt="" style={{ width: size, height: size }} className="rounded-full object-cover border-2 border-[var(--border)]" />
  }
  return (
    <span style={{ width: size, height: size }} className="rounded-full grid place-items-center border-2 border-[var(--border)] bg-[var(--surface2)] text-[var(--accent)] font-bold">
      {initials(character.name)}
    </span>
  )
}

export default function RelationshipMap({ store }) {
  const { characters, selectedCharacterId, setSelectedCharacterId, saveCharacter } = store
  const [targetId, setTargetId] = useState('')
  const [relationshipType, setRelationshipType] = useState('friend')

  const focalCharacter = characters.find(character => character.id === selectedCharacterId) || characters[0] || null
  const connections = useMemo(
    () => getFocalConnections(characters, focalCharacter?.id),
    [characters, focalCharacter?.id],
  )
  const networkNodes = useMemo(() => {
    const compact = connections.length > 8
    const innerCount = compact ? Math.min(6, Math.ceil(connections.length * 0.4)) : connections.length
    return connections.map((connection, index) => {
      const outer = compact && index >= innerCount
      const ringIndex = outer ? index - innerCount : index
      const ringCount = outer ? connections.length - innerCount : innerCount
      const angle = (Math.PI * 2 * ringIndex / Math.max(ringCount, 1)) - Math.PI / 2 + (outer ? Math.PI / Math.max(ringCount, 1) : 0)
      const radiusX = outer ? 375 : compact ? 225 : 315
      const radiusY = outer ? 235 : compact ? 145 : 205
      return {
        ...connection,
        angle,
        compact,
        x: 500 + Math.cos(angle) * radiusX,
        y: 310 + Math.sin(angle) * radiusY,
      }
    })
  }, [connections])
  const extendedByDirectId = useMemo(() => {
    return new Map(networkNodes.map(node => [
      node.character.id,
      getFocalConnections(characters, node.character.id)
        .filter(connection => connection.character.id !== focalCharacter?.id),
    ]))
  }, [characters, focalCharacter?.id, networkNodes])
  const socialTypes = REL_TYPES.filter(type => !FAMILY_RELATIONSHIP_TYPES.has(type.id) && !type.structural)
  const connectedIds = new Set(connections.map(connection => connection.character.id))
  const availableTargets = characters.filter(character => character.id !== focalCharacter?.id && !connectedIds.has(character.id))

  const addConnection = () => {
    if (!focalCharacter || !targetId || targetId === focalCharacter.id) return
    const target = characters.find(character => character.id === targetId)
    if (target) {
      saveCharacter({ relationships: toArray(target.relationships).filter(rel => rel.targetId !== focalCharacter.id || !isSocialRelationship(rel)) }, target.id)
    }
    const withoutExistingPair = toArray(focalCharacter.relationships).filter(rel => rel.targetId !== targetId || !isSocialRelationship(rel))
    saveCharacter({ relationships: [...withoutExistingPair, { targetId, type: relationshipType }] }, focalCharacter.id)
    setTargetId('')
  }

  const removeConnection = connection => {
    if (!focalCharacter) return
    saveCharacter({
      relationships: toArray(focalCharacter.relationships).filter(rel => rel.targetId !== connection.character.id || !isSocialRelationship(rel)),
    }, focalCharacter.id)
    saveCharacter({
      relationships: toArray(connection.character.relationships).filter(rel => rel.targetId !== focalCharacter.id || !isSocialRelationship(rel)),
    }, connection.character.id)
  }

  const openProfile = characterId => {
    setSelectedCharacterId(characterId)
    window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: 'characters' } }))
  }

  return (
    <div className="h-full overflow-auto bg-[var(--bg-main)] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between" data-tour="relationships-header">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-main)]">Relationship Map</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">Focus on one character and see their direct social connections. Family links stay in the Family Tree.</p>
          </div>
          {characters.length > 0 && (
            <label className="text-xs text-[var(--text-muted)]">
              Focal character
              <select
                value={focalCharacter?.id || ''}
                onChange={event => setSelectedCharacterId(event.target.value)}
                className="block mt-1 min-w-56 bg-[var(--bg-nav)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)]"
              >
                {characters.map(character => <option key={character.id} value={character.id}>{character.name || 'Unnamed character'}</option>)}
              </select>
            </label>
          )}
        </header>

        {!focalCharacter ? (
          <div className="h-[58vh] grid place-items-center border border-dashed border-[var(--border)] rounded-2xl text-center px-8">
            <div>
              <p className="text-sm font-semibold text-[var(--text-main)]">Add a character to begin</p>
              <p className="text-xs text-[var(--text-muted)] mt-2">Relationship mapping will appear once your cast has someone to focus on.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
            <section className="relative min-h-[620px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-nav)]" data-tour="relationships-map">
              <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
                {networkNodes.map(node => {
                  const type = getRelType(node.type)
                  return <line key={node.character.id} x1="500" y1="310" x2={node.x} y2={node.y} stroke={type.color} strokeWidth="2.4" strokeDasharray={type.dash || '0'} opacity=".82" />
                })}
              </svg>

              <button
                key={focalCharacter.id}
                onClick={() => openProfile(focalCharacter.id)}
                className="relationship-focus-enter absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-40 min-h-44 rounded-[2rem] border-2 border-[var(--accent)] bg-[var(--bg-main)] shadow-2xl p-4 flex flex-col items-center justify-center text-center hover:-translate-y-[51%] transition-transform"
              >
                <CharacterAvatar character={focalCharacter} size={76} />
                <strong className="text-sm text-[var(--text-main)] mt-3 leading-tight">{focalCharacter.name || 'Unnamed character'}</strong>
                <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] mt-1">Focal character</span>
              </button>

              {networkNodes.map((node, index) => {
                const type = getRelType(node.type)
                const extended = extendedByDirectId.get(node.character.id) || []
                const extendedNames = extended.map(connection => connection.character.name).join(', ')
                return (
                  <button
                    key={`node-${node.character.id}`}
                    onClick={() => setSelectedCharacterId(node.character.id)}
                    className={`relationship-node-enter absolute z-20 ${node.compact ? 'w-28 min-h-24 p-2' : 'w-36 min-h-32 p-3'} -translate-x-1/2 -translate-y-1/2 rounded-[1.4rem] border bg-[var(--bg-main)] shadow-lg flex flex-col items-center text-center hover:scale-105 transition-transform`}
                    style={{ left: `${node.x / 10}%`, top: `${node.y / 6.2}%`, borderColor: type.color, animationDelay: `${Math.min(index * 45, 360)}ms` }}
                    title={`Make ${node.character.name} the focal character`}
                  >
                    <CharacterAvatar character={node.character} size={node.compact ? 40 : 52} />
                    <strong className="text-xs text-[var(--text-main)] mt-2 leading-tight">{node.character.name || 'Unnamed character'}</strong>
                    <span className="text-[10px] mt-1 leading-tight" style={{ color: type.color }}>{type.label}</span>
                    {node.direction === 'incoming' && <span className="text-[9px] text-[var(--text-muted)]">linked to focal</span>}
                    {extended.length > 0 && (
                      <span
                        className="absolute -right-2 -bottom-2 w-7 h-7 rounded-md grid place-items-center border border-[var(--border)] bg-[var(--surface2)] text-[9px] font-bold text-[var(--text-muted)] shadow-md"
                        title={`${extended.length} other connection${extended.length === 1 ? '' : 's'}: ${extendedNames}`}
                        aria-label={`${extended.length} other connection${extended.length === 1 ? '' : 's'}`}
                      >
                        +{extended.length}
                      </span>
                    )}
                  </button>
                )
              })}

              {connections.length === 0 && (
                <div className="absolute left-1/2 top-[76%] -translate-x-1/2 text-center w-72">
                  <p className="text-xs text-[var(--text-muted)]">No non-family connections yet. Add a friend, ally, enemy, partner, or romantic interest.</p>
                </div>
              )}
            </section>

            <aside className="rounded-2xl border border-[var(--border)] bg-[var(--bg-nav)] p-4 space-y-4 xl:sticky xl:top-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Focused on</p>
                <h2 className="text-lg font-bold text-[var(--text-main)] mt-1">{focalCharacter.name || 'Unnamed character'}</h2>
                <p className="text-xs text-[var(--text-muted)] mt-1">{networkNodes.length} direct connection{networkNodes.length === 1 ? '' : 's'}</p>
              </div>

              <div className="border-t border-[var(--border)] pt-4 space-y-2">
                <h3 className="text-xs font-bold text-[var(--text-main)]">Add a connection</h3>
                <select value={targetId} onChange={event => setTargetId(event.target.value)} className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-2 py-2 text-xs text-[var(--text-main)]">
                  <option value="">Choose character…</option>
                  {availableTargets.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}
                </select>
                <select value={relationshipType} onChange={event => setRelationshipType(event.target.value)} className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-2 py-2 text-xs text-[var(--text-main)]">
                  {socialTypes.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
                <button disabled={!targetId} onClick={addConnection} className="w-full bg-[var(--accent)] disabled:opacity-40 text-[var(--bg-main)] text-xs font-bold py-2 rounded-lg">Add Connection</button>
              </div>

              <div className="border-t border-[var(--border)] pt-4">
                <h3 className="text-xs font-bold text-[var(--text-main)] mb-2">Connections</h3>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {connections.length === 0 && <p className="text-xs italic text-[var(--text-muted)]">Nothing mapped yet.</p>}
                  {connections.map(connection => {
                    const type = getRelType(connection.type)
                    return (
                      <div key={`list-${connection.character.id}-${connection.type}`} className="flex items-center justify-between gap-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-2 py-2">
                        <button onClick={() => setSelectedCharacterId(connection.character.id)} className="min-w-0 text-left">
                          <span className="block text-xs font-semibold text-[var(--text-main)] truncate">{connection.character.name}</span>
                          <span className="block text-[10px]" style={{ color: type.color }}>{type.label}</span>
                        </button>
                        <button onClick={() => removeConnection(connection)} className="text-xs text-red-400 px-1" aria-label={`Remove ${type.label} connection to ${connection.character.name}`}>✕</button>
                      </div>
                    )
                  })}
                </div>
              </div>

              <button onClick={() => openProfile(focalCharacter.id)} className="w-full border border-[var(--border)] text-[var(--text-main)] text-xs py-2 rounded-lg hover:border-[var(--accent)]">Open Character Profile</button>
              <p className="text-[10px] text-[var(--text-muted)] text-center">A + badge shows that a character has other connections.</p>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
