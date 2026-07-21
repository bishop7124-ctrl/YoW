import { useState } from 'react'
import {
  RACES, CLASSES, BACKGROUNDS, ABILITY_KEYS, ABILITY_LABELS, ABILITY_SHORT,
  SKILLS, CONDITIONS, NPC_RELATIONSHIP_TYPES, CHARACTER_STATUSES, SPELL_SCHOOLS,
  getModifier, formatMod, getProficiencyBonus, xpForNextLevel, XP_THRESHOLDS,
  isSpellcaster, isKnownCaster, isPreparedCaster, getSpellcastingAbility,
  getCantripsKnown, getKnownSpellCount, getPreparedSpellCount, getSpellSlots, getAlwaysPreparedSpells,
  ASI_LEVELS, METAMAGIC_OPTIONS, getMetamagicKnownCount, INVOCATIONS, getInvocationsKnownCount,
} from './rpgData'
import { cantripsForClass, spellsForClassAtLevel, findSpellByName } from './spellData'

const toSpellEntry = (spell) => ({
  id: `spell-${spell.name.replace(/\s+/g, '-').toLowerCase()}`,
  name: spell.name,
  level: spell.level,
  school: spell.school,
  description: spell.desc || '',
})

const SHEET_TABS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'combat',    label: 'Combat & Skills' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'spells',    label: 'Spells' },
  { id: 'features',  label: 'Features' },
  { id: 'notes',     label: 'Notes' },
  { id: 'campaign',  label: 'Campaign' },
]

const CURRENCY_LABELS = { cp: 'CP', sp: 'SP', ep: 'EP', gp: 'GP', pp: 'PP' }

function StatBox({ label, value, sub, accent }) {
  return (
    <div style={{
      padding: '10px 8px', borderRadius: 10, textAlign: 'center',
      background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)',
      border: `1px solid ${accent ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ? 'var(--accent)' : 'var(--text-main)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function AbilityBlock({ abilityKey, score, profBonus, savingThrows, character, onChange }) {
  const mod = getModifier(score)
  const hasSave = savingThrows?.[abilityKey]
  const saveBonus = mod + (hasSave ? profBonus : 0)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '12px 8px', borderRadius: 12,
      border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
      background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)',
    }}>
      <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-muted)' }}>{ABILITY_SHORT[abilityKey]}</span>
      <div style={{
        width: 48, height: 48, borderRadius: 10,
        border: '2px solid color-mix(in srgb, var(--accent) 50%, transparent)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-main))',
        cursor: 'pointer', position: 'relative',
      }} onClick={() => {
        const val = prompt(`Set ${ABILITY_LABELS[abilityKey]}`, score)
        if (val !== null) {
          const n = Math.max(1, Math.min(30, Number(val) || score))
          onChange({ abilityScores: { ...character.abilityScores, [abilityKey]: n } })
        }
      }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>{score}</span>
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{formatMod(mod)}</span>
      <button
        onClick={() => onChange({ savingThrows: { ...savingThrows, [abilityKey]: !hasSave } })}
        title={`${ABILITY_LABELS[abilityKey]} saving throw${hasSave ? ' (proficient)' : ''}`}
        style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 5, border: 'none', cursor: 'pointer',
          background: hasSave ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
          color: hasSave ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600,
        }}
      >Save {formatMod(saveBonus)}</button>
    </div>
  )
}

function HPWidget({ character, onChange }) {
  const [editing, setEditing] = useState(false)
  const { hp } = character
  const pct = Math.max(0, Math.min(100, (hp.current / hp.max) * 100))
  const color = pct > 50 ? '#22c55e' : pct > 25 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 14,
      border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
      background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Hit Points</span>
        <button onClick={() => setEditing(v => !v)} style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
        {editing ? (
          <>
            <input
              type="number" value={hp.current}
              onChange={e => onChange({ hp: { ...hp, current: Number(e.target.value) } })}
              style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 18, fontWeight: 700, textAlign: 'center' }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>/</span>
            <input
              type="number" value={hp.max}
              onChange={e => onChange({ hp: { ...hp, max: Number(e.target.value) } })}
              style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 18, fontWeight: 700, textAlign: 'center' }}
            />
          </>
        ) : (
          <>
            <span style={{ fontSize: 28, fontWeight: 800, color }}>{hp.current}</span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/ {hp.max}</span>
          </>
        )}
        {hp.temp > 0 && <span style={{ fontSize: 12, color: '#3b82f6', marginLeft: 4 }}>+{hp.temp} temp</span>}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'color-mix(in srgb, var(--border) 50%, transparent)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .3s ease' }} />
      </div>
      {editing && (
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Temp HP:
            <input type="number" min={0} value={hp.temp || 0} onChange={e => onChange({ hp: { ...hp, temp: Number(e.target.value) } })}
              style={{ width: 50, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 12, textAlign: 'center' }} />
          </label>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {[['Heal', v => Math.min(hp.max, hp.current + v), '#22c55e'], ['Damage', v => Math.max(0, hp.current - v), '#ef4444']].map(([label, fn, color]) => (
              <div key={label} style={{ display: 'flex', gap: 4 }}>
                {[1, 5, 10].map(n => (
                  <button key={n} onClick={() => onChange({ hp: { ...hp, current: fn(n) } })}
                    style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: `color-mix(in srgb, ${color} 20%, transparent)`, color, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                    {label === 'Heal' ? '+' : '-'}{n}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SkillRow({ skill, proficiency, mod, profBonus, onToggle }) {
  const total = mod + (proficiency === 'expert' ? profBonus * 2 : proficiency === 'proficient' ? profBonus : 0)
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6,
        background: proficiency !== 'none' ? `color-mix(in srgb, var(--accent) ${proficiency === 'expert' ? 14 : 8}%, transparent)` : 'transparent',
        border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
        transition: 'background .1s',
      }}
    >
      <div style={{
        width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
        background: proficiency === 'expert' ? 'var(--accent)' : proficiency === 'proficient' ? 'color-mix(in srgb, var(--accent) 60%, transparent)' : 'transparent',
        border: `1.5px solid ${proficiency !== 'none' ? 'var(--accent)' : 'var(--border)'}`,
      }} />
      <span style={{ flex: 1, fontSize: 12, color: 'var(--text-main)' }}>{skill.label}</span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 2 }}>{ABILITY_SHORT[skill.ability]}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: proficiency !== 'none' ? 'var(--accent)' : 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>{formatMod(total)}</span>
    </button>
  )
}

// ─── Tab: Overview ───────────────────────────────────────────────────────────

function TabOverview({ character, onChange }) {
  const cls = CLASSES.find(c => c.id === character.class)
  const profBonus = getProficiencyBonus(character.level)
  const dexMod = getModifier(character.abilityScores.dex)
  const nextLvlXP = xpForNextLevel(character.level)
  const xpProgress = nextLvlXP ? ((character.xp - XP_THRESHOLDS[character.level - 1]) / (nextLvlXP - XP_THRESHOLDS[character.level - 1])) * 100 : 100

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Combat stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
        <HPWidget character={character} onChange={onChange} />
        <StatBox label="Armor Class" value={character.ac} />
        <StatBox label="Initiative" value={formatMod(dexMod)} />
        <StatBox label="Speed" value={`${character.speed}ft`} />
        <StatBox label="Prof Bonus" value={`+${profBonus}`} accent />
        <StatBox label="Hit Die" value={cls?.hitDie || 'd8'} />
      </div>

      {/* Ability Scores */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Ability Scores</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {ABILITY_KEYS.map(key => (
            <AbilityBlock
              key={key} abilityKey={key}
              score={character.abilityScores[key]}
              profBonus={profBonus}
              savingThrows={character.savingThrows}
              character={character}
              onChange={onChange}
            />
          ))}
        </div>
      </div>

      {/* XP and conditions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* XP */}
        <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Experience</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Level {character.level}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
            <input
              type="number" min={0} value={character.xp}
              onChange={e => onChange({ xp: Math.max(0, Number(e.target.value)) })}
              style={{ width: 80, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 16, fontWeight: 700 }}
            />
            {nextLvlXP && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ {nextLvlXP.toLocaleString()} XP</span>}
          </div>
          {nextLvlXP && (
            <div style={{ height: 4, borderRadius: 2, background: 'color-mix(in srgb, var(--border) 50%, transparent)' }}>
              <div style={{ height: '100%', width: `${Math.min(100, xpProgress)}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width .3s ease' }} />
            </div>
          )}
        </div>

        {/* Conditions */}
        <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>Conditions</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {CONDITIONS.map(cond => {
              const active = character.conditions?.includes(cond.id)
              return (
                <button
                  key={cond.id}
                  onClick={() => {
                    const next = active
                      ? (character.conditions || []).filter(c => c !== cond.id)
                      : [...(character.conditions || []), cond.id]
                    onChange({ conditions: next })
                  }}
                  style={{
                    padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${active ? cond.color : 'color-mix(in srgb, var(--border) 50%, transparent)'}`,
                    background: active ? `color-mix(in srgb, ${cond.color} 18%, transparent)` : 'transparent',
                    color: active ? cond.color : 'var(--text-muted)',
                  }}
                >{cond.label}</button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Inspiration */}
      <button
        onClick={() => onChange({ inspiration: !character.inspiration })}
        style={{
          padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
          border: `1px solid ${character.inspiration ? 'color-mix(in srgb, #f59e0b 50%, transparent)' : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
          background: character.inspiration ? 'color-mix(in srgb, #f59e0b 10%, transparent)' : 'transparent',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <span style={{ fontSize: 18 }}>{character.inspiration ? '⭐' : '☆'}</span>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: character.inspiration ? '#f59e0b' : 'var(--text-muted)' }}>Inspiration</span>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>Click to toggle. Grants advantage on one ability check, saving throw, or attack roll.</p>
        </div>
      </button>
    </div>
  )
}

// ─── Tab: Combat & Skills ────────────────────────────────────────────────────

function TabCombat({ character, onChange }) {
  const profBonus = getProficiencyBonus(character.level)
  const [editAC, setEditAC] = useState(false)
  const [editSpeed, setEditSpeed] = useState(false)

  const cycleProf = (skillId) => {
    const cur = character.skills?.[skillId] || 'none'
    const next = cur === 'none' ? 'proficient' : cur === 'proficient' ? 'expert' : 'none'
    onChange({ skills: { ...character.skills, [skillId]: next } })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Left: Saving throws + quick stats */}
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>Saving Throws</p>
          {ABILITY_KEYS.map(key => {
            const mod = getModifier(character.abilityScores[key])
            const prof = character.savingThrows?.[key]
            const total = mod + (prof ? profBonus : 0)
            return (
              <button
                key={key}
                onClick={() => onChange({ savingThrows: { ...character.savingThrows, [key]: !prof } })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '4px 6px', borderRadius: 6,
                  background: prof ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                  border: 'none', cursor: 'pointer', marginBottom: 2,
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: prof ? 'var(--accent)' : 'transparent', border: `1.5px solid ${prof ? 'var(--accent)' : 'var(--border)'}` }} />
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text-main)', textAlign: 'left' }}>{ABILITY_LABELS[key]}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: prof ? 'var(--accent)' : 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>{formatMod(total)}</span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)' }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Armor Class</p>
            {editAC
              ? <input type="number" value={character.ac} onChange={e => onChange({ ac: Number(e.target.value) })} onBlur={() => setEditAC(false)} autoFocus className="field" style={{ width: '100%', textAlign: 'center', fontSize: 18, fontWeight: 800, padding: '2px 4px' }} />
              : <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', cursor: 'pointer' }} onClick={() => setEditAC(true)}>{character.ac}</div>
            }
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)' }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Speed</p>
            {editSpeed
              ? <input type="number" value={character.speed} onChange={e => onChange({ speed: Number(e.target.value) })} onBlur={() => setEditSpeed(false)} autoFocus className="field" style={{ width: '100%', textAlign: 'center', fontSize: 18, fontWeight: 800, padding: '2px 4px' }} />
              : <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', cursor: 'pointer' }} onClick={() => setEditSpeed(true)}>{character.speed}ft</div>
            }
          </div>
        </div>
      </div>

      {/* Right: Skills */}
      <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)', overflowY: 'auto', maxHeight: 480 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
          Skills <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(click to toggle proficiency)</span>
        </p>
        {SKILLS.map(skill => {
          const proficiency = character.skills?.[skill.id] || 'none'
          const mod = getModifier(character.abilityScores[skill.ability])
          return (
            <SkillRow
              key={skill.id}
              skill={skill}
              proficiency={proficiency}
              mod={mod}
              profBonus={profBonus}
              onToggle={() => cycleProf(skill.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab: Equipment ──────────────────────────────────────────────────────────

function TabEquipment({ character, onChange }) {
  const [newItem, setNewItem] = useState({ name: '', type: 'gear', quantity: 1, weight: 0, description: '' })
  const equipment = character.equipment || []
  const currency = character.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }

  const addItem = () => {
    if (!newItem.name.trim()) return
    onChange({
      equipment: [...equipment, { id: `eq-${Date.now()}`, ...newItem, name: newItem.name.trim() }]
    })
    setNewItem({ name: '', type: 'gear', quantity: 1, weight: 0, description: '' })
  }

  const removeItem = (id) => onChange({ equipment: equipment.filter(e => e.id !== id) })

  const updateItem = (id, patch) => onChange({ equipment: equipment.map(e => e.id === id ? { ...e, ...patch } : e) })

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Currency */}
      <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>Currency</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {Object.keys(CURRENCY_LABELS).map(key => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: key === 'gp' ? '#f59e0b' : key === 'sp' ? '#94a3b8' : key === 'pp' ? '#a78bfa' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{CURRENCY_LABELS[key]}</span>
              <input
                type="number" min={0} value={currency[key] || 0}
                onChange={e => onChange({ currency: { ...currency, [key]: Math.max(0, Number(e.target.value)) } })}
                className="field"
                style={{ width: '100%', textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '5px 4px' }}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Add item */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="field" placeholder="Item name…" value={newItem.name}
          onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          style={{ flex: 1, minWidth: 140, padding: '7px 10px', fontSize: 13 }}
        />
        <select className="field" value={newItem.type} onChange={e => setNewItem(p => ({ ...p, type: e.target.value }))} style={{ padding: '7px 10px', fontSize: 12 }}>
          {['weapon', 'armor', 'gear', 'magic', 'consumable', 'tool', 'ammo', 'other'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <input type="number" min={1} value={newItem.quantity} onChange={e => setNewItem(p => ({ ...p, quantity: Number(e.target.value) }))} className="field" style={{ width: 60, padding: '7px 8px', fontSize: 13, textAlign: 'center' }} title="Quantity" />
        <button onClick={addItem} style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--accent)', color: 'var(--bg-main)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Add</button>
      </div>

      {/* Equipment list */}
      {equipment.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No equipment yet. Add items above.</p>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {equipment.map(item => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
                background: 'color-mix(in srgb, var(--bg-nav) 70%, transparent)',
                border: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
              }}>
                <span style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 5, fontWeight: 600,
                  background: item.type === 'weapon' ? 'color-mix(in srgb, #ef4444 15%, transparent)' :
                               item.type === 'armor'  ? 'color-mix(in srgb, #3b82f6 15%, transparent)' :
                               item.type === 'magic'  ? 'color-mix(in srgb, #8b5cf6 15%, transparent)' :
                               'color-mix(in srgb, var(--border) 50%, transparent)',
                  color: item.type === 'weapon' ? '#ef4444' :
                         item.type === 'armor'  ? '#3b82f6' :
                         item.type === 'magic'  ? '#8b5cf6' : 'var(--text-muted)',
                  flexShrink: 0,
                }}>{item.type}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-main)', fontWeight: 500 }}>{item.name}</span>
                <input type="number" min={1} value={item.quantity} onChange={e => updateItem(item.id, { quantity: Number(e.target.value) })}
                  style={{ width: 46, padding: '3px 5px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 12, textAlign: 'center' }} />
                <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}

// ─── Tab: Spells ─────────────────────────────────────────────────────────────

function TabSpells({ character, onChange }) {
  const spells = character.spells || {}
  const slots = spells.slots || {}
  const cantrips = spells.cantrips || []
  const classId = character.class
  const level = character.level
  const [newSpell, setNewSpell] = useState({ name: '', level: 0, school: 'Evocation', description: '' })
  const [showCustom, setShowCustom] = useState(false)
  const [pickCantrip, setPickCantrip] = useState('')
  const [pickSpell, setPickSpell] = useState('')
  const profBonus = getProficiencyBonus(level)

  const known = isKnownCaster(classId)
  const preparedCaster = isPreparedCaster(classId)
  const spellKey = known ? 'known' : (preparedCaster ? 'prepared' : 'known')
  const spellList = spells[spellKey] || []

  const spellcastingAbility = spells.spellcastingAbility || getSpellcastingAbility(classId) || 'int'
  const spellMod = getModifier(character.abilityScores[spellcastingAbility]) + profBonus
  const spellSaveDC = 8 + spellMod

  const cantripLimit = getCantripsKnown(classId, level)
  const abilityModOnly = getModifier(character.abilityScores[spellcastingAbility])
  const spellLimit = known ? getKnownSpellCount(classId, level) : preparedCaster ? getPreparedSpellCount(classId, level, abilityModOnly) : null

  const alwaysPrepared = getAlwaysPreparedSpells(classId, character.subclassId, level).map(findSpellByName).filter(Boolean)

  const slotLevels = Object.keys(slots).map(Number)
  const maxSpellLevel = slotLevels.length ? Math.max(...slotLevels) : 9

  const knownCantripNames = cantrips.map(c => c.name)
  const knownSpellNames = spellList.map(s => s.name)
  const cantripOptions = isSpellcaster(classId) ? cantripsForClass(classId).filter(s => !knownCantripNames.includes(s.name)) : []
  const spellOptions = isSpellcaster(classId) ? spellsForClassAtLevel(classId, maxSpellLevel).filter(s => !knownSpellNames.includes(s.name)) : []

  const addCantripFromCompendium = () => {
    const spell = cantripOptions.find(s => s.name === pickCantrip)
    if (!spell) return
    onChange({ spells: { ...spells, cantrips: [...cantrips, toSpellEntry(spell)] } })
    setPickCantrip('')
  }

  const addSpellFromCompendium = () => {
    const spell = spellOptions.find(s => s.name === pickSpell)
    if (!spell) return
    onChange({ spells: { ...spells, [spellKey]: [...spellList, toSpellEntry(spell)] } })
    setPickSpell('')
  }

  const addSpell = () => {
    if (!newSpell.name.trim()) return
    const spell = { id: `spell-${Date.now()}`, ...newSpell, name: newSpell.name.trim() }
    if (newSpell.level === 0) {
      onChange({ spells: { ...spells, cantrips: [...cantrips, spell] } })
    } else {
      onChange({ spells: { ...spells, [spellKey]: [...spellList, spell] } })
    }
    setNewSpell(p => ({ ...p, name: '', description: '' }))
  }

  const removeSpell = (id, isCantrip) => {
    if (isCantrip) onChange({ spells: { ...spells, cantrips: cantrips.filter(s => s.id !== id) } })
    else onChange({ spells: { ...spells, [spellKey]: spellList.filter(s => s.id !== id) } })
  }

  const setSlotUsed = (level, used) => {
    onChange({ spells: { ...spells, slots: { ...slots, [level]: { ...slots[level], used } } } })
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Spellcasting stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)', textAlign: 'center' }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Ability</p>
          <select value={spellcastingAbility} onChange={e => onChange({ spells: { ...spells, spellcastingAbility: e.target.value } })} className="field" style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '3px 6px' }}>
            {ABILITY_KEYS.map(k => <option key={k} value={k}>{ABILITY_SHORT[k]}</option>)}
          </select>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)', textAlign: 'center' }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Spell Attack</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-main)' }}>{formatMod(spellMod)}</p>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)', textAlign: 'center' }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Save DC</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-main)' }}>{spellSaveDC}</p>
        </div>
      </div>

      {/* Known/prepared limits */}
      {isSpellcaster(classId) && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cantrips: <strong style={{ color: cantrips.length >= cantripLimit ? 'var(--accent)' : 'var(--text-main)' }}>{cantrips.length} / {cantripLimit}</strong></span>
          {spellLimit !== null && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{known ? 'Spells Known' : 'Spells Prepared'}: <strong style={{ color: spellList.length >= spellLimit ? 'var(--accent)' : 'var(--text-main)' }}>{spellList.length} / {spellLimit}</strong></span>
          )}
        </div>
      )}

      {/* Always-prepared domain/oath/patron spells */}
      {alwaysPrepared.length > 0 && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'color-mix(in srgb, #8b5cf6 8%, transparent)', border: '1px solid color-mix(in srgb, #8b5cf6 25%, transparent)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Always Prepared{character.subclass ? ` (${character.subclass})` : ''}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {alwaysPrepared.map(s => (
              <span key={s.name} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: 'color-mix(in srgb, #8b5cf6 15%, transparent)', color: 'var(--text-main)' }}>{s.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Spell Slots */}
      {Object.keys(slots).length > 0 && (
        <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>Spell Slots</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {Object.entries(slots).map(([level, slot]) => (
              <div key={level} style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>Level {level}</p>
                <div style={{ display: 'flex', gap: 4 }}>
                  {Array.from({ length: slot.max }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSlotUsed(level, i < slot.used ? i : i + 1)}
                      style={{
                        width: 16, height: 16, borderRadius: '50%', border: 'none', cursor: 'pointer',
                        background: i < slot.used ? 'color-mix(in srgb, var(--border) 60%, transparent)' : 'var(--accent)',
                        transition: 'background .1s',
                      }}
                      title={i < slot.used ? 'Used' : 'Available'}
                    />
                  ))}
                </div>
                <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>{slot.max - slot.used}/{slot.max}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const resetSlots = Object.fromEntries(Object.entries(slots).map(([l, s]) => [l, { ...s, used: 0 }]))
              onChange({ spells: { ...spells, slots: resetSlots } })
            }}
            style={{ marginTop: 10, padding: '5px 12px', borderRadius: 7, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >Long Rest (Reset Slots)</button>
        </div>
      )}

      {/* Add from compendium */}
      {isSpellcaster(classId) && (
        <div style={{ display: 'grid', gap: 8 }}>
          {cantripOptions.length > 0 && cantrips.length < cantripLimit && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select className="field" value={pickCantrip} onChange={e => setPickCantrip(e.target.value)} style={{ flex: 1, minWidth: 160, padding: '7px 10px', fontSize: 13 }}>
                <option value="">Add a cantrip…</option>
                {cantripOptions.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <button onClick={addCantripFromCompendium} disabled={!pickCantrip} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--accent)', color: 'var(--bg-main)', border: 'none', fontSize: 12, fontWeight: 700, cursor: pickCantrip ? 'pointer' : 'default', opacity: pickCantrip ? 1 : 0.5, flexShrink: 0 }}>Add</button>
            </div>
          )}
          {spellOptions.length > 0 && (spellLimit === null || spellList.length < spellLimit) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select className="field" value={pickSpell} onChange={e => setPickSpell(e.target.value)} style={{ flex: 1, minWidth: 160, padding: '7px 10px', fontSize: 13 }}>
                <option value="">Add a spell…</option>
                {spellOptions.map(s => <option key={s.name} value={s.name}>Lvl {s.level} · {s.name}</option>)}
              </select>
              <button onClick={addSpellFromCompendium} disabled={!pickSpell} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--accent)', color: 'var(--bg-main)', border: 'none', fontSize: 12, fontWeight: 700, cursor: pickSpell ? 'pointer' : 'default', opacity: pickSpell ? 1 : 0.5, flexShrink: 0 }}>Add</button>
            </div>
          )}
        </div>
      )}

      {/* Custom / homebrew spell fallback */}
      <button onClick={() => setShowCustom(v => !v)} style={{ alignSelf: 'start', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
        {showCustom ? '− Hide custom spell entry' : '+ Add a custom / homebrew spell'}
      </button>
      {showCustom && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="field" placeholder="Spell name…" value={newSpell.name} onChange={e => setNewSpell(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addSpell()} style={{ flex: 1, minWidth: 120, padding: '7px 10px', fontSize: 13 }} />
          <select className="field" value={newSpell.level} onChange={e => setNewSpell(p => ({ ...p, level: Number(e.target.value) }))} style={{ padding: '7px 10px', fontSize: 12 }}>
            <option value={0}>Cantrip</option>
            {[1,2,3,4,5,6,7,8,9].map(l => <option key={l} value={l}>Level {l}</option>)}
          </select>
          <select className="field" value={newSpell.school} onChange={e => setNewSpell(p => ({ ...p, school: e.target.value }))} style={{ padding: '7px 10px', fontSize: 12 }}>
            {SPELL_SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={addSpell} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--accent)', color: 'var(--bg-main)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Add</button>
        </div>
      )}

      {/* Cantrips */}
      {cantrips.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>Cantrips</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {cantrips.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7, background: 'color-mix(in srgb, #8b5cf6 12%, transparent)', border: '1px solid color-mix(in srgb, #8b5cf6 30%, transparent)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-main)' }}>{s.name}</span>
                <button onClick={() => removeSpell(s.id, true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Known / prepared spells by level */}
      {spellList.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>{known ? 'Known Spells' : 'Prepared Spells'}</p>
          {[1,2,3,4,5,6,7,8,9].map(lvl => {
            const spellsAtLevel = spellList.filter(s => s.level === lvl)
            if (!spellsAtLevel.length) return null
            return (
              <div key={lvl} style={{ marginBottom: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>Level {lvl}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {spellsAtLevel.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--bg-nav) 70%, transparent)', border: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}>
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--text-main)' }}>{s.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.school}</span>
                      <button onClick={() => removeSpell(s.id, false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Features ───────────────────────────────────────────────────────────

function TabFeatures({ character, onChange }) {
  const features = character.features || []
  const [newFeat, setNewFeat] = useState({ name: '', source: '', description: '' })

  const addFeature = () => {
    if (!newFeat.name.trim()) return
    onChange({ features: [...features, { id: `feat-${Date.now()}`, ...newFeat, name: newFeat.name.trim() }] })
    setNewFeat({ name: '', source: '', description: '' })
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="field" placeholder="Feature / trait name…" value={newFeat.name} onChange={e => setNewFeat(p => ({ ...p, name: e.target.value }))} style={{ flex: 1, minWidth: 120, padding: '7px 10px', fontSize: 13 }} />
        <input className="field" placeholder="Source (Class, Race…)" value={newFeat.source} onChange={e => setNewFeat(p => ({ ...p, source: e.target.value }))} style={{ width: 160, padding: '7px 10px', fontSize: 13 }} />
        <button onClick={addFeature} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--accent)', color: 'var(--bg-main)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Add</button>
      </div>

      {features.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No features yet. Class and race features are added during character creation.</p>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {features.map(feat => (
              <div key={feat.id} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', align: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>{feat.name}</span>
                    {feat.source && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', fontWeight: 600 }}>{feat.source}</span>}
                  </div>
                  <button onClick={() => onChange({ features: features.filter(f => f.id !== feat.id) })} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>✕</button>
                </div>
                {feat.description
                  ? <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{feat.description}</p>
                  : <textarea
                      placeholder="Description…"
                      value={feat.description || ''}
                      onChange={e => onChange({ features: features.map(f => f.id === feat.id ? { ...f, description: e.target.value } : f) })}
                      rows={2}
                      className="field"
                      style={{ width: '100%', marginTop: 6, fontSize: 12, padding: '5px 8px', resize: 'vertical' }}
                    />
                }
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}

// ─── Tab: Notes ──────────────────────────────────────────────────────────────

function TabNotes({ character, onChange }) {
  const [noteTab, setNoteTab] = useState('backstory')
  const noteTabs = [['backstory', 'Backstory'], ['journal', 'Journal'], ['sessionNotes', 'Session Notes'], ['secrets', 'Secrets']]

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {noteTabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setNoteTab(id)}
            style={{
              padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              border: `1px solid ${noteTab === id ? 'var(--accent)' : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
              background: noteTab === id ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-main))' : 'transparent',
              color: noteTab === id ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >{label}</button>
        ))}
      </div>

      {noteTab === 'secrets' && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'color-mix(in srgb, #f59e0b 8%, transparent)', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)' }}>
          <p style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Secrets are stored locally only — they won't appear in exports unless you choose to include them.</p>
        </div>
      )}

      <textarea
        value={character[noteTab] || ''}
        onChange={e => onChange({ [noteTab]: e.target.value })}
        placeholder={`Write ${noteTabs.find(t => t[0] === noteTab)?.[1].toLowerCase()} here…`}
        className="field"
        style={{ minHeight: 320, padding: '12px 14px', fontSize: 13, resize: 'vertical', lineHeight: 1.6 }}
      />
    </div>
  )
}

// ─── Tab: Campaign ────────────────────────────────────────────────────────────

function TabCampaign({ character, onChange, store }) {
  const [newRel, setNewRel] = useState({ characterId: '', type: 'Friend', notes: '' })
  const relationships = character.npcRelationships || []
  const factionIds = character.factionIds || []
  const storyChars = (store?.characters || []).filter(c => c.id !== character.id)
  const factions = store?.factions || []

  const addRelationship = () => {
    if (!newRel.characterId && !newRel.notes.trim()) return
    onChange({ npcRelationships: [...relationships, { id: `rel-${Date.now()}`, ...newRel }] })
    setNewRel({ characterId: '', type: 'Friend', notes: '' })
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Locations */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ display: 'grid', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Current Location</span>
          <input className="field" value={character.currentLocation || ''} onChange={e => onChange({ currentLocation: e.target.value })} placeholder="Where are they now?" style={{ padding: '7px 10px', fontSize: 13 }} />
        </label>
        <label style={{ display: 'grid', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Home Location</span>
          <input className="field" value={character.homeLocation || ''} onChange={e => onChange({ homeLocation: e.target.value })} placeholder="Where are they from?" style={{ padding: '7px 10px', fontSize: 13 }} />
        </label>
      </div>

      {/* Factions */}
      {factions.length > 0 && (
        <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>Faction Memberships</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {factions.map(faction => {
              const active = factionIds.includes(faction.id)
              return (
                <button
                  key={faction.id}
                  onClick={() => {
                    const next = active ? factionIds.filter(id => id !== faction.id) : [...factionIds, faction.id]
                    onChange({ factionIds: next })
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    border: `1px solid ${active ? 'var(--accent)' : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
                    background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >{faction.name}</button>
              )
            })}
          </div>
        </div>
      )}

      {/* NPC Relationships */}
      <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>NPC Relationships</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {storyChars.length > 0 && (
            <select className="field" value={newRel.characterId} onChange={e => setNewRel(p => ({ ...p, characterId: e.target.value }))} style={{ flex: 1, minWidth: 120, padding: '6px 8px', fontSize: 12 }}>
              <option value="">Select character…</option>
              {storyChars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select className="field" value={newRel.type} onChange={e => setNewRel(p => ({ ...p, type: e.target.value }))} style={{ padding: '6px 8px', fontSize: 12 }}>
            {NPC_RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="field" placeholder="Notes…" value={newRel.notes} onChange={e => setNewRel(p => ({ ...p, notes: e.target.value }))} style={{ flex: 1, minWidth: 100, padding: '6px 8px', fontSize: 12 }} />
          <button onClick={addRelationship} style={{ padding: '6px 14px', borderRadius: 7, background: 'var(--accent)', color: 'var(--bg-main)', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Add</button>
        </div>
        {relationships.length === 0
          ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No relationships defined yet.</p>
          : relationships.map(rel => {
              const relChar = storyChars.find(c => c.id === rel.characterId)
              return (
                <div key={rel.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, background: 'color-mix(in srgb, var(--bg-main) 70%, transparent)', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>{rel.type}</span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-main)' }}>{relChar ? relChar.name : rel.notes || 'Unknown'}</span>
                  {rel.notes && relChar && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rel.notes}</span>}
                  <button onClick={() => onChange({ npcRelationships: relationships.filter(r => r.id !== rel.id) })} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>
                </div>
              )
            })
        }
      </div>

      {/* Status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {CHARACTER_STATUSES.map(s => (
          <button
            key={s.id}
            onClick={() => onChange({ status: s.id })}
            style={{
              padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              border: `1px solid ${character.status === s.id ? s.color : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
              background: character.status === s.id ? `color-mix(in srgb, ${s.color} 14%, transparent)` : 'transparent',
              color: character.status === s.id ? s.color : 'var(--text-muted)',
            }}
          >{s.label}</button>
        ))}
      </div>
    </div>
  )
}

// ─── Level Up Modal ──────────────────────────────────────────────────────────

function LevelUpPickList({ title, limit, chosen, options, onToggle }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{title}</p>
        <span style={{ fontSize: 11, fontWeight: 700, color: chosen.length >= limit ? 'var(--accent)' : 'var(--text-muted)' }}>{chosen.length} / {limit}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(opt => {
          const isChosen = chosen.some(c => (c.name || c) === (opt.name || opt.id))
          const disabled = !isChosen && chosen.length >= limit
          return (
            <button
              key={opt.id || opt.name}
              onClick={() => onToggle(opt)}
              disabled={disabled}
              title={opt.desc}
              style={{
                padding: '4px 10px', borderRadius: 7, fontSize: 12, cursor: disabled ? 'default' : 'pointer',
                border: `1px solid ${isChosen ? 'var(--accent)' : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
                background: isChosen ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                color: isChosen ? 'var(--accent)' : disabled ? 'var(--text-muted)' : 'var(--text-main)',
                opacity: disabled ? 0.5 : 1,
              }}
            >{opt.name || opt.label}</button>
          )
        })}
      </div>
    </div>
  )
}

function LevelUpModal({ character, onConfirm, onClose }) {
  const newLevel = Math.min(20, character.level + 1)
  const classId = character.class
  const cls = CLASSES.find(c => c.id === classId)
  const hitDieMax = parseInt(cls?.hitDie?.replace('d', '') || '8')
  const conMod = getModifier(character.abilityScores.con)
  const hpGain = Math.max(1, Math.floor(hitDieMax / 2) + 1 + conMod)
  const newProf = getProficiencyBonus(newLevel)

  const isASI = ASI_LEVELS.includes(newLevel)
  const [asiChoice, setAsiChoice] = useState('none')
  const [asiPrimary, setAsiPrimary] = useState('str')
  const [asiSecondary, setAsiSecondary] = useState('dex')
  const [featText, setFeatText] = useState('')

  const spells = character.spells || {}
  const abilityKey = spells.spellcastingAbility || getSpellcastingAbility(classId) || 'int'
  const abilityMod = getModifier(character.abilityScores[abilityKey])
  const known = isKnownCaster(classId)
  const preparedCaster = isPreparedCaster(classId)
  const spellKey = known ? 'known' : (preparedCaster ? 'prepared' : 'known')

  const cantripDelta = Math.max(0, getCantripsKnown(classId, newLevel) - getCantripsKnown(classId, character.level))
  const oldSpellLimit = known ? getKnownSpellCount(classId, character.level) : preparedCaster ? getPreparedSpellCount(classId, character.level, abilityMod) : 0
  const newSpellLimit = known ? getKnownSpellCount(classId, newLevel) : preparedCaster ? getPreparedSpellCount(classId, newLevel, abilityMod) : 0
  const spellDelta = Math.max(0, newSpellLimit - oldSpellLimit)

  const slots = getSpellSlots(classId, newLevel) || {}
  const slotLevels = Object.keys(slots).map(Number)
  const maxSpellLevel = slotLevels.length ? Math.max(...slotLevels) : 0

  const existingCantripNames = (spells.cantrips || []).map(c => c.name)
  const existingSpellNames = (spells[spellKey] || []).map(s => s.name)

  const [newCantrips, setNewCantrips] = useState([])
  const [newSpells, setNewSpells] = useState([])
  const [newMetamagic, setNewMetamagic] = useState([])
  const [newInvocations, setNewInvocations] = useState([])

  const cantripOptions = cantripsForClass(classId).filter(s => !existingCantripNames.includes(s.name))
  const spellOptions = maxSpellLevel > 0 ? spellsForClassAtLevel(classId, maxSpellLevel).filter(s => !existingSpellNames.includes(s.name)) : []

  const toggleFrom = (list, setList, limit, item, key) => {
    const exists = list.some(x => x[key] === item[key])
    if (exists) setList(list.filter(x => x[key] !== item[key]))
    else if (list.length < limit) setList([...list, item])
  }

  const metamagicDelta = classId === 'sorcerer' ? Math.max(0, getMetamagicKnownCount(newLevel) - getMetamagicKnownCount(character.level)) : 0
  const metamagicOptions = METAMAGIC_OPTIONS.filter(o => !(spells.metamagic || []).includes(o.id))

  const invocationDelta = classId === 'warlock' ? Math.max(0, getInvocationsKnownCount(newLevel) - getInvocationsKnownCount(character.level)) : 0
  const invocationOptions = INVOCATIONS.filter(o => !(spells.invocations || []).includes(o.id))

  const canConfirm = isASI ? asiChoice !== 'none' : true
  const spellChoicesComplete = newCantrips.length >= cantripDelta && newSpells.length >= spellDelta
    && newMetamagic.length >= metamagicDelta && newInvocations.length >= invocationDelta

  const handleConfirm = () => {
    let asi = null
    if (asiChoice === 'two') asi = { abilities: [{ key: asiPrimary, amount: 2 }] }
    else if (asiChoice === 'one') asi = { abilities: [{ key: asiPrimary, amount: 1 }, { key: asiSecondary, amount: 1 }] }
    else if (asiChoice === 'feat' && featText.trim()) asi = { feat: featText.trim() }

    onConfirm({
      newLevel, hpGain, asi,
      newSlots: slots,
      newCantrips, newSpells,
      newMetamagic: newMetamagic.map(o => o.id),
      newInvocations: newInvocations.map(o => o.id),
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-nav)', border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)', borderRadius: 18, width: 'min(520px, 100%)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>✨</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', margin: '0 0 6px' }}>Level {newLevel}!</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>{character.name} has grown in power.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <div style={{ padding: '12px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-main))', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>HP Gain</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>+{hpGain}</p>
          </div>
          <div style={{ padding: '12px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-main))', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Prof Bonus</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>+{newProf}</p>
          </div>
        </div>

        {isASI && (
          <div style={{ marginBottom: 18, textAlign: 'left' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, textAlign: 'center' }}>Ability Score Improvement</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              {[['two', '+2 one ability'], ['one', '+1 / +1 two abilities'], ['feat', 'Take a feat instead']].map(([id, label]) => (
                <button key={id} onClick={() => setAsiChoice(id)} style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${asiChoice === id ? 'var(--accent)' : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
                  background: asiChoice === id ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
                  color: asiChoice === id ? 'var(--accent)' : 'var(--text-muted)',
                }}>{label}</button>
              ))}
            </div>
            {asiChoice === 'two' && (
              <select className="field" value={asiPrimary} onChange={e => setAsiPrimary(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}>
                {ABILITY_KEYS.map(k => <option key={k} value={k}>+2 {ABILITY_LABELS[k]}</option>)}
              </select>
            )}
            {asiChoice === 'one' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="field" value={asiPrimary} onChange={e => setAsiPrimary(e.target.value)} style={{ flex: 1, padding: '6px 8px', fontSize: 13 }}>
                  {ABILITY_KEYS.map(k => <option key={k} value={k}>+1 {ABILITY_LABELS[k]}</option>)}
                </select>
                <select className="field" value={asiSecondary} onChange={e => setAsiSecondary(e.target.value)} style={{ flex: 1, padding: '6px 8px', fontSize: 13 }}>
                  {ABILITY_KEYS.map(k => <option key={k} value={k}>+1 {ABILITY_LABELS[k]}</option>)}
                </select>
              </div>
            )}
            {asiChoice === 'feat' && (
              <input className="field" value={featText} onChange={e => setFeatText(e.target.value)} placeholder="Feat name…" style={{ width: '100%', padding: '6px 8px', fontSize: 13 }} />
            )}
          </div>
        )}

        {(cantripDelta > 0 || spellDelta > 0 || metamagicDelta > 0 || invocationDelta > 0) && (
          <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
            {cantripDelta > 0 && <LevelUpPickList title="New Cantrips" limit={cantripDelta} chosen={newCantrips} options={cantripOptions} onToggle={o => toggleFrom(newCantrips, setNewCantrips, cantripDelta, toSpellEntry(o), 'name')} />}
            {spellDelta > 0 && <LevelUpPickList title={known ? 'New Spells Known' : 'New Spells Prepared'} limit={spellDelta} chosen={newSpells} options={spellOptions} onToggle={o => toggleFrom(newSpells, setNewSpells, spellDelta, toSpellEntry(o), 'name')} />}
            {metamagicDelta > 0 && <LevelUpPickList title="New Metamagic" limit={metamagicDelta} chosen={newMetamagic} options={metamagicOptions} onToggle={o => toggleFrom(newMetamagic, setNewMetamagic, metamagicDelta, o, 'id')} />}
            {invocationDelta > 0 && <LevelUpPickList title="New Eldritch Invocations" limit={invocationDelta} chosen={newInvocations} options={invocationOptions} onToggle={o => toggleFrom(newInvocations, setNewInvocations, invocationDelta, o, 'id')} />}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || !spellChoicesComplete}
            style={{ padding: '8px 22px', borderRadius: 9, background: 'var(--accent)', color: 'var(--bg-main)', border: 'none', fontSize: 13, fontWeight: 800, cursor: (canConfirm && spellChoicesComplete) ? 'pointer' : 'default', opacity: (canConfirm && spellChoicesComplete) ? 1 : 0.5 }}
          >Confirm Level Up</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main CharacterSheet ──────────────────────────────────────────────────────

export default function CharacterSheet({ character, onUpdate, onBack, store }) {
  const [tab, setTab] = useState('overview')
  const [levelUpOpen, setLevelUpOpen] = useState(false)

  const race = RACES.find(r => r.id === character.race)
  const cls = CLASSES.find(c => c.id === character.class)
  const background = BACKGROUNDS.find(b => b.id === character.background)
  const status = CHARACTER_STATUSES.find(s => s.id === character.status) || CHARACTER_STATUSES[0]

  const handleChange = (patch) => {
    onUpdate({ ...character, ...patch, updatedAt: new Date().toISOString() })
  }

  const handleLevelUp = ({ newLevel, hpGain, asi, newSlots, newCantrips, newSpells, newMetamagic, newInvocations }) => {
    let abilityScores = character.abilityScores
    const features = [...(character.features || [])]

    if (asi?.abilities) {
      abilityScores = { ...abilityScores }
      asi.abilities.forEach(({ key, amount }) => { abilityScores[key] = Math.min(20, (abilityScores[key] || 10) + amount) })
      features.push({
        id: `asi-${newLevel}`, source: 'Level Up',
        name: `Ability Score Improvement (Level ${newLevel})`,
        description: asi.abilities.map(a => `+${a.amount} ${ABILITY_LABELS[a.key]}`).join(', '),
      })
    } else if (asi?.feat) {
      features.push({ id: `feat-${newLevel}`, name: asi.feat, source: `Feat (Level ${newLevel})`, description: '' })
    }

    const spells = character.spells || {}
    const known = isKnownCaster(character.class)
    const preparedCaster = isPreparedCaster(character.class)
    const spellKey = known ? 'known' : (preparedCaster ? 'prepared' : 'known')

    newMetamagic.forEach(id => {
      const opt = METAMAGIC_OPTIONS.find(o => o.id === id)
      if (opt) features.push({ id: `metamagic-${id}`, name: opt.name, source: 'Metamagic', description: opt.desc })
    })
    newInvocations.forEach(id => {
      const opt = INVOCATIONS.find(o => o.id === id)
      if (opt) features.push({ id: `invocation-${id}`, name: opt.name, source: 'Eldritch Invocation', description: opt.desc })
    })

    handleChange({
      level: newLevel,
      abilityScores,
      features,
      hp: {
        ...character.hp,
        max: character.hp.max + hpGain,
        current: character.hp.current + hpGain,
      },
      spells: {
        ...spells,
        slots: newSlots,
        cantrips: [...(spells.cantrips || []), ...newCantrips],
        [spellKey]: [...(spells[spellKey] || []), ...newSpells],
        metamagic: [...(spells.metamagic || []), ...newMetamagic],
        invocations: [...(spells.invocations || []), ...newInvocations],
      },
    })
    setLevelUpOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Character Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
        background: 'color-mix(in srgb, var(--bg-nav) 60%, transparent)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Back button */}
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 0', fontSize: 13, fontWeight: 600, flexShrink: 0 }}
          >← All Characters</button>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 12 }}>
          {/* Portrait */}
          <div style={{
            width: 64, height: 80, borderRadius: 10, flexShrink: 0,
            border: `2px solid color-mix(in srgb, ${status.color} 40%, transparent)`,
            background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-main))',
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {character.portrait
              ? <img src={character.portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" opacity=".5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            }
          </div>

          {/* Identity */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>{character.name}</h2>
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
                background: `color-mix(in srgb, ${status.color} 15%, transparent)`,
                color: status.color,
                border: `1px solid color-mix(in srgb, ${status.color} 35%, transparent)`,
              }}>{status.label}</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--accent)', margin: '3px 0 0', fontWeight: 600 }}>
              Level {character.level} {character.race === 'custom' ? (character.customRace || 'Custom Race') : (race?.label || 'Unknown')} {character.class === 'custom' ? (character.customClass || 'Custom Class') : (cls?.label || 'Unknown')}
              {character.subclass && ` · ${character.subclass}`}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {character.alignment}
              {background && ` · ${character.background === 'custom' ? (character.customBackground || 'Custom Background') : background.label}`}
              {character.pronouns && ` · ${character.pronouns}`}
            </p>
          </div>

          {/* Level up button */}
          {character.level < 20 && (
            <button
              onClick={() => setLevelUpOpen(true)}
              style={{
                padding: '7px 14px', borderRadius: 9, flexShrink: 0,
                border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >Level Up ↑</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0, overflowX: 'auto', flexShrink: 0,
        borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
        background: 'color-mix(in srgb, var(--bg-nav) 40%, transparent)',
      }}>
        {SHEET_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '9px 14px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
              background: 'none',
              color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
              transition: 'all .1s',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
        {tab === 'overview'  && <TabOverview character={character} onChange={handleChange} />}
        {tab === 'combat'    && <TabCombat character={character} onChange={handleChange} />}
        {tab === 'equipment' && <TabEquipment character={character} onChange={handleChange} />}
        {tab === 'spells'    && <TabSpells character={character} onChange={handleChange} />}
        {tab === 'features'  && <TabFeatures character={character} onChange={handleChange} />}
        {tab === 'notes'     && <TabNotes character={character} onChange={handleChange} />}
        {tab === 'campaign'  && <TabCampaign character={character} onChange={handleChange} store={store} />}
      </div>

      {levelUpOpen && <LevelUpModal character={character} onConfirm={handleLevelUp} onClose={() => setLevelUpOpen(false)} />}
    </div>
  )
}
