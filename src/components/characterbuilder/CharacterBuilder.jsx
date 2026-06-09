import { useState, useMemo } from 'react'
import CharacterSheet from './CharacterSheet'
import CharacterWizard from './CharacterWizard'
import DiceRoller from './DiceRoller'
import { RACES, CLASSES, CHARACTER_STATUSES, getProficiencyBonus, getModifier, formatMod } from './rpgData'

// ─── Party Card ───────────────────────────────────────────────────────────────

function PartyCard({ character, onClick }) {
  const cls = CLASSES.find(c => c.id === character.class)
  const race = RACES.find(r => r.id === character.race)
  const status = CHARACTER_STATUSES.find(s => s.id === character.status) || CHARACTER_STATUSES[0]
  const hpPct = Math.max(0, Math.min(100, (character.hp.current / character.hp.max) * 100))
  const hpColor = hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#f59e0b' : '#ef4444'
  const profBonus = getProficiencyBonus(character.level)
  const conditions = character.conditions || []

  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
        border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
        background: 'color-mix(in srgb, var(--bg-nav) 70%, transparent)',
        transition: 'all .15s ease',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.border = '1px solid color-mix(in srgb, var(--accent) 45%, transparent)'
        e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, var(--bg-nav))'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.border = '1px solid color-mix(in srgb, var(--border) 60%, transparent)'
        e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-nav) 70%, transparent)'
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Portrait */}
        <div style={{
          width: 52, height: 64, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
          background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-main))',
          border: `1.5px solid color-mix(in srgb, ${status.color} 40%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {character.portrait
            ? <img src={character.portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" opacity=".5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          }
        </div>

        {/* Identity */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{character.name}</p>
          <p style={{ fontSize: 11, color: 'var(--accent)', margin: '2px 0', fontWeight: 600 }}>
            Lvl {character.level} {character.class === 'custom' ? (character.customClass || 'Custom') : (cls?.label || '?')}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>
            {character.race === 'custom' ? (character.customRace || 'Custom') : (race?.label || '?')}
          </p>
        </div>

        {/* Level badge */}
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'color-mix(in srgb, var(--accent) 14%, var(--bg-main))',
          border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>{character.level}</span>
        </div>
      </div>

      {/* HP bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>HP</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: hpColor }}>{character.hp.current}/{character.hp.max}</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'color-mix(in srgb, var(--border) 50%, transparent)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${hpPct}%`, background: hpColor, borderRadius: 2, transition: 'width .3s' }} />
        </div>
      </div>

      {/* Quick stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {[['AC', character.ac], ['Prof', `+${profBonus}`], ['Init', formatMod(getModifier(character.abilityScores.dex))]].map(([label, value]) => (
          <div key={label} style={{ textAlign: 'center', padding: '4px 2px', borderRadius: 6, background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)' }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Conditions */}
      {conditions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {conditions.slice(0, 4).map(id => (
            <span key={id} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'color-mix(in srgb, #f97316 15%, transparent)', color: '#f97316', fontWeight: 600, textTransform: 'capitalize' }}>{id}</span>
          ))}
          {conditions.length > 4 && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>+{conditions.length - 4}</span>}
        </div>
      )}

      {/* Status */}
      {character.status !== 'active' && (
        <div style={{ fontSize: 10, fontWeight: 700, color: status.color, textTransform: 'uppercase', letterSpacing: '.06em' }}>{status.label}</div>
      )}
    </div>
  )
}

// ─── Character List Index ─────────────────────────────────────────────────────

function CharacterIndex({ characters, onSelect, onNew, onDice }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    let list = characters
    if (filter === 'party')    list = list.filter(c => c.isPartyMember)
    if (filter === 'active')   list = list.filter(c => c.status === 'active')
    if (filter === 'deceased') list = list.filter(c => c.status === 'deceased')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.class?.toLowerCase().includes(q) ||
        c.race?.toLowerCase().includes(q)
      )
    }
    return list
  }, [characters, filter, search])

  const partyMembers = characters.filter(c => c.isPartyMember && c.status === 'active')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
        flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          className="field" placeholder="Search characters…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 140, padding: '6px 10px', fontSize: 12 }}
        />
        <select className="field" value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '6px 10px', fontSize: 12 }}>
          <option value="all">All Characters</option>
          <option value="party">Party Only</option>
          <option value="active">Active</option>
          <option value="deceased">Deceased</option>
        </select>
        <button
          onClick={onDice}
          title="Open dice roller"
          style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="4"/>
            <circle cx="8.5" cy="8.5" r="1.5"/><circle cx="15.5" cy="8.5" r="1.5"/>
            <circle cx="8.5" cy="15.5" r="1.5"/><circle cx="15.5" cy="15.5" r="1.5"/>
          </svg>
        </button>
        <button
          onClick={onNew}
          style={{ padding: '6px 16px', borderRadius: 8, background: 'var(--accent)', color: 'var(--bg-main)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
        >+ New Character</button>
      </div>

      {/* Party Summary Bar */}
      {partyMembers.length > 0 && (
        <div style={{
          padding: '10px 16px', flexShrink: 0,
          borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
          background: 'color-mix(in srgb, var(--accent) 4%, transparent)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.1em', flexShrink: 0 }}>Active Party</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {partyMembers.map(c => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                style={{
                  padding: '3px 10px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {c.name} <span style={{ opacity: 0.7, fontSize: 10 }}>Lvl {c.level}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Character grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {characters.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14, padding: 40 }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" opacity=".3">
              <circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/>
              <circle cx="17" cy="10" r="2.5"/><path d="M14.5 20a4.5 4.5 0 0 1 6 0"/>
            </svg>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)', margin: '0 0 6px' }}>No characters yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 300, margin: '0 auto 18px' }}>Create your first character to start building your party.</p>
              <button
                onClick={onNew}
                style={{ padding: '9px 22px', borderRadius: 10, background: 'var(--accent)', color: 'var(--bg-main)', border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
              >Create First Character</button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: 13 }}>No characters match your search.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {filtered.map(c => (
              <PartyCard key={c.id} character={c} onClick={() => onSelect(c.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main CharacterBuilder ────────────────────────────────────────────────────

export default function CharacterBuilder({ store }) {
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [diceOpen, setDiceOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  const characters = store.rpgCharacters || []
  const selected = characters.find(c => c.id === selectedId) || null

  const handleNew = () => setWizardOpen(true)

  const handleWizardSave = (charData) => {
    const id = store.saveRpgCharacter(charData)
    setWizardOpen(false)
    setSelectedId(id)
    setView('detail')
  }

  const handleSelect = (id) => {
    setSelectedId(id)
    setView('detail')
  }

  const handleUpdate = (updatedChar) => {
    store.saveRpgCharacter(updatedChar, updatedChar.id)
  }

  const handleBack = () => {
    setSelectedId(null)
    setView('list')
  }

  const handleDelete = (id) => {
    store.deleteRpgCharacter(id)
    if (selectedId === id) {
      setSelectedId(null)
      setView('list')
    }
    setDeleteConfirmId(null)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* Detail action bar when in detail view */}
      {view === 'detail' && selected && (
        <div style={{
          position: 'absolute', top: 0, right: 0, zIndex: 10,
          padding: '8px 14px',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <button
            onClick={() => setDiceOpen(true)}
            title="Dice Roller"
            style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >🎲 Roll</button>
          <button
            onClick={() => {
              const updated = { ...selected, isPartyMember: !selected.isPartyMember }
              handleUpdate(updated)
            }}
            style={{
              padding: '5px 12px', borderRadius: 7,
              border: `1px solid ${selected.isPartyMember ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
              background: selected.isPartyMember ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
              color: selected.isPartyMember ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >{selected.isPartyMember ? '⚔ In Party' : '+ Add to Party'}</button>
          <button
            onClick={() => setDeleteConfirmId(selected.id)}
            style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid color-mix(in srgb, #ef4444 30%, transparent)', background: 'transparent', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >Delete</button>
        </div>
      )}

      {/* Main content */}
      {view === 'list' && (
        <CharacterIndex
          characters={characters}
          onSelect={handleSelect}
          onNew={handleNew}
          onDice={() => setDiceOpen(true)}
        />
      )}

      {view === 'detail' && selected && (
        <CharacterSheet
          character={selected}
          onUpdate={handleUpdate}
          onBack={handleBack}
          store={store}
        />
      )}

      {/* Wizard */}
      {wizardOpen && (
        <CharacterWizard
          novelId={store.activeNovelId}
          onSave={handleWizardSave}
          onCancel={() => setWizardOpen(false)}
        />
      )}

      {/* Dice roller */}
      {diceOpen && <DiceRoller onClose={() => setDiceOpen(false)} />}

      {/* Delete confirm */}
      {deleteConfirmId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 350, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => e.target === e.currentTarget && setDeleteConfirmId(null)}>
          <div style={{ background: 'var(--bg-nav)', border: '1px solid color-mix(in srgb, #ef4444 40%, transparent)', borderRadius: 16, padding: 28, width: 'min(360px, 100%)', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 8 }}>Delete Character?</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              {characters.find(c => c.id === deleteConfirmId)?.name || 'This character'} will be permanently removed.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setDeleteConfirmId(null)} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirmId)} style={{ padding: '8px 18px', borderRadius: 9, background: '#ef4444', color: 'white', border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
