import { useState } from 'react'
import {
  RACES, CLASSES, BACKGROUNDS, ALIGNMENTS, ABILITY_KEYS, ABILITY_SHORT,
  STANDARD_ARRAY, POINT_BUY_COSTS, POINT_BUY_BUDGET, STARTING_EQUIPMENT,
  getModifier, formatMod, getProficiencyBonus, makeNewCharacter,
} from './rpgData'

const STEPS = [
  { id: 'basics',   label: 'Basics',        icon: '✦' },
  { id: 'race',     label: 'Race',          icon: '⬡' },
  { id: 'class',    label: 'Class',         icon: '⚔' },
  { id: 'scores',   label: 'Ability Scores', icon: '⬡' },
  { id: 'equip',    label: 'Equipment',     icon: '⚒' },
  { id: 'review',   label: 'Review',        icon: '✓' },
]

const resizePortrait = (file) => new Promise((resolve, reject) => {
  const img = new Image()
  const url = URL.createObjectURL(file)
  img.onload = () => {
    URL.revokeObjectURL(url)
    const size = 400
    const scale = Math.min(size / img.width, size / img.height)
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d').drawImage(img, 0, 0, w, h)
    resolve(canvas.toDataURL('image/jpeg', 0.82))
  }
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
  img.src = url
})

function rollAbilityScore() {
  const rolls = [1,2,3,4].map(() => Math.floor(Math.random() * 6) + 1).sort((a, b) => a - b)
  return rolls.slice(1).reduce((a, b) => a + b, 0)
}

// ─── Step 1: Basics ──────────────────────────────────────────────────────────

function StepBasics({ data, onChange }) {
  const [portraitError, setPortraitError] = useState('')

  const handlePortrait = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setPortraitError('Please select an image file.'); return }
    try {
      setPortraitError('')
      const portrait = await resizePortrait(file)
      onChange({ portrait })
    } catch { setPortraitError('Could not load that image.') }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 24, alignItems: 'start' }}>
      {/* Portrait */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <div style={{
          width: 120, height: 140, borderRadius: 12,
          border: '2px dashed color-mix(in srgb, var(--accent) 50%, transparent)',
          background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-main))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', flexShrink: 0,
        }}>
          {data.portrait
            ? <img src={data.portrait} alt="Portrait" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ textAlign: 'center', padding: 10 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity=".5">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Portrait</p>
              </div>
          }
        </div>
        <label style={{ cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--accent)', padding: '5px 12px', border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)', borderRadius: 7 }}>
          <input type="file" accept="image/*" onChange={handlePortrait} style={{ display: 'none' }} />
          {data.portrait ? 'Change' : 'Upload'}
        </label>
        {portraitError && <p style={{ fontSize: 10, color: '#f87171' }}>{portraitError}</p>}
      </div>

      {/* Fields */}
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Character Name *">
          <input className="field" value={data.name} onChange={e => onChange({ name: e.target.value })} placeholder="e.g. Aethon Brightblade" style={{ padding: '8px 10px', fontSize: 13 }} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Age">
            <input className="field" value={data.age} onChange={e => onChange({ age: e.target.value })} placeholder="e.g. 24" style={{ padding: '8px 10px', fontSize: 13 }} />
          </Field>
          <Field label="Gender">
            <input className="field" value={data.gender} onChange={e => onChange({ gender: e.target.value })} placeholder="e.g. Non-binary" style={{ padding: '8px 10px', fontSize: 13 }} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Pronouns">
            <input className="field" value={data.pronouns} onChange={e => onChange({ pronouns: e.target.value })} placeholder="e.g. they/them" style={{ padding: '8px 10px', fontSize: 13 }} />
          </Field>
          <Field label="Alignment">
            <select className="field" value={data.alignment} onChange={e => onChange({ alignment: e.target.value })} style={{ padding: '8px 10px', fontSize: 13 }}>
              {ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Background">
          <select className="field" value={data.background} onChange={e => onChange({ background: e.target.value })} style={{ padding: '8px 10px', fontSize: 13 }}>
            {BACKGROUNDS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </Field>
        {data.background === 'custom' && (
          <Field label="Custom Background Name">
            <input className="field" value={data.customBackground || ''} onChange={e => onChange({ customBackground: e.target.value })} placeholder="Enter background name" style={{ padding: '8px 10px', fontSize: 13 }} />
          </Field>
        )}
        <Field label="Backstory (optional)">
          <textarea className="field" rows={3} value={data.backstory || ''} onChange={e => onChange({ backstory: e.target.value })} placeholder="A brief origin story..." style={{ padding: '8px 10px', fontSize: 13, resize: 'vertical' }} />
        </Field>
      </div>
    </div>
  )
}

// ─── Step 2: Race ────────────────────────────────────────────────────────────

function StepRace({ data, onChange }) {
  const selected = RACES.find(r => r.id === data.race) || RACES[0]
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {RACES.map(race => (
          <button
            key={race.id}
            onClick={() => onChange({ race: race.id, customRace: '' })}
            style={{
              padding: '14px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
              border: `2px solid ${data.race === race.id ? 'var(--accent)' : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
              background: data.race === race.id ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-main))' : 'color-mix(in srgb, var(--bg-nav) 60%, transparent)',
              transition: 'all .15s ease',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: data.race === race.id ? 'var(--accent)' : 'var(--text-main)' }}>{race.label}</div>
            {race.abilityBonuses && Object.keys(race.abilityBonuses).length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                {Object.entries(race.abilityBonuses).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(', ')}
              </div>
            )}
          </button>
        ))}
      </div>

      {data.race === 'custom' && (
        <Field label="Custom Race Name">
          <input className="field" value={data.customRace || ''} onChange={e => onChange({ customRace: e.target.value })} placeholder="Enter race name" style={{ padding: '8px 10px', fontSize: 13 }} />
        </Field>
      )}

      {selected && selected.traits.length > 0 && (
        <div style={{ padding: '14px 18px', borderRadius: 12, background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-main))', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em' }}>{selected.label} Traits</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selected.traits.map(t => (
              <span key={t} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--text-main)' }}>{t}</span>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Speed: {selected.speed} ft.</p>
        </div>
      )}
    </div>
  )
}

// ─── Step 3: Class ───────────────────────────────────────────────────────────

function StepClass({ data, onChange }) {
  const selected = CLASSES.find(c => c.id === data.class) || CLASSES[0]
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {CLASSES.map(cls => (
          <button
            key={cls.id}
            onClick={() => onChange({ class: cls.id, customClass: '', subclass: '' })}
            style={{
              padding: '14px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
              border: `2px solid ${data.class === cls.id ? 'var(--accent)' : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
              background: data.class === cls.id ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-main))' : 'color-mix(in srgb, var(--bg-nav) 60%, transparent)',
              transition: 'all .15s ease',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: data.class === cls.id ? 'var(--accent)' : 'var(--text-main)' }}>{cls.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>Hit die: {cls.hitDie}</div>
          </button>
        ))}
      </div>

      {data.class === 'custom' && (
        <Field label="Custom Class Name">
          <input className="field" value={data.customClass || ''} onChange={e => onChange({ customClass: e.target.value })} placeholder="Enter class name" style={{ padding: '8px 10px', fontSize: 13 }} />
        </Field>
      )}

      {selected && selected.features.length > 0 && (
        <div style={{ padding: '14px 18px', borderRadius: 12, background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-main))', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em' }}>{selected.label} Features (Level 1)</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {selected.features.map(f => (
              <span key={f} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--text-main)' }}>{f}</span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text-main)' }}>Armor:</strong> {selected.armorProf || 'None'}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text-main)' }}>Saves:</strong> {selected.savingThrows.map(s => s.toUpperCase()).join(', ')}</p>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Starting Level">
          <input type="number" min={1} max={20} className="field" value={data.level} onChange={e => onChange({ level: Math.max(1, Math.min(20, Number(e.target.value))) })} style={{ padding: '8px 10px', fontSize: 13 }} />
        </Field>
        <Field label="Subclass / Archetype">
          <input className="field" value={data.subclass || ''} onChange={e => onChange({ subclass: e.target.value })} placeholder="e.g. Champion, Thief…" style={{ padding: '8px 10px', fontSize: 13 }} />
        </Field>
      </div>
    </div>
  )
}

// ─── Step 4: Ability Scores ──────────────────────────────────────────────────

function StepScores({ data, onChange }) {
  const [method, setMethod] = useState('standard')
  const [arrayAssigned, setArrayAssigned] = useState({})
  const [rolled, setRolled] = useState(null)

  const scores = data.abilityScores

  const setScore = (key, value) => {
    const clamped = Math.max(1, Math.min(30, Number(value) || 10))
    onChange({ abilityScores: { ...scores, [key]: clamped } })
  }

  const assignFromArray = (key, val) => {
    const next = { ...arrayAssigned, [key]: Number(val) }
    setArrayAssigned(next)
    onChange({ abilityScores: { ...scores, [key]: Number(val) } })
  }

  const pointBuyTotal = ABILITY_KEYS.reduce((acc, k) => acc + (POINT_BUY_COSTS[scores[k]] ?? 0), 0)
  const pointBuyLeft = POINT_BUY_BUDGET - pointBuyTotal

  const rollAll = () => {
    const newRolled = {}
    ABILITY_KEYS.forEach(k => { newRolled[k] = rollAbilityScore() })
    setRolled(newRolled)
    onChange({ abilityScores: { ...newRolled } })
  }

  const rerollSingle = (key) => {
    const val = rollAbilityScore()
    setRolled(prev => ({ ...prev, [key]: val }))
    onChange({ abilityScores: { ...scores, [key]: val } })
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Method selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['standard', 'Standard Array'], ['pointbuy', 'Point Buy'], ['manual', 'Manual Entry'], ['dice', 'Dice Roll']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setMethod(id); if (id === 'dice' && !rolled) rollAll() }}
            style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              border: `1px solid ${method === id ? 'var(--accent)' : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
              background: method === id ? 'color-mix(in srgb, var(--accent) 14%, var(--bg-main))' : 'transparent',
              color: method === id ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >{label}</button>
        ))}
      </div>

      {method === 'standard' && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Assign values from: {STANDARD_ARRAY.join(', ')}. Each value can only be used once.
        </p>
      )}
      {method === 'pointbuy' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Budget: {POINT_BUY_BUDGET} points</p>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
            background: pointBuyLeft < 0 ? 'color-mix(in srgb, #ef4444 15%, transparent)' : 'color-mix(in srgb, var(--accent) 15%, transparent)',
            color: pointBuyLeft < 0 ? '#ef4444' : 'var(--accent)',
          }}>{pointBuyLeft} left</span>
        </div>
      )}
      {method === 'dice' && (
        <button onClick={rollAll} style={{ alignSelf: 'start', padding: '7px 16px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Roll All (4d6 drop lowest)
        </button>
      )}

      {/* Score grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {ABILITY_KEYS.map(key => {
          const mod = getModifier(scores[key])
          return (
            <div key={key} style={{
              padding: '14px 12px', borderRadius: 12, textAlign: 'center',
              background: 'color-mix(in srgb, var(--bg-nav) 70%, transparent)',
              border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
            }}>
              <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>{ABILITY_SHORT[key]}</p>

              {method === 'standard' ? (
                <select
                  className="field"
                  value={scores[key]}
                  onChange={e => assignFromArray(key, e.target.value)}
                  style={{ textAlign: 'center', padding: '4px', fontSize: 18, fontWeight: 700, width: '100%' }}
                >
                  {STANDARD_ARRAY.map(v => (
                    <option key={v} value={v} disabled={Object.entries(arrayAssigned).some(([k2, v2]) => k2 !== key && v2 === v)}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : method === 'pointbuy' ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <button
                    onClick={() => setScore(key, scores[key] - 1)}
                    disabled={scores[key] <= 8}
                    style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-main)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}
                  >−</button>
                  <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', minWidth: 28 }}>{scores[key]}</span>
                  <button
                    onClick={() => setScore(key, scores[key] + 1)}
                    disabled={scores[key] >= 15 || pointBuyLeft <= 0}
                    style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-main)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}
                  >+</button>
                </div>
              ) : method === 'dice' ? (
                <div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-main)' }}>{scores[key]}</div>
                  <button onClick={() => rerollSingle(key)} style={{ marginTop: 4, fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>reroll</button>
                </div>
              ) : (
                <input
                  type="number" min={1} max={30}
                  value={scores[key]}
                  onChange={e => setScore(key, e.target.value)}
                  className="field"
                  style={{ textAlign: 'center', padding: '4px', fontSize: 18, fontWeight: 700, width: '100%' }}
                />
              )}

              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>
                {formatMod(mod)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Step 5: Equipment ───────────────────────────────────────────────────────

function StepEquipment({ data, onChange }) {
  const [custom, setCustom] = useState('')
  const classId = data.class
  const starter = STARTING_EQUIPMENT[classId] || []
  const equipment = data.equipment || []

  const addPreset = () => {
    const items = starter.map(name => ({ id: `preset-${name}`, name, type: 'gear', quantity: 1, weight: 0, description: '' }))
    onChange({ equipment: items })
  }

  const addCustom = () => {
    if (!custom.trim()) return
    onChange({
      equipment: [...equipment, { id: `eq-${Date.now()}`, name: custom.trim(), type: 'gear', quantity: 1, weight: 0, description: '' }]
    })
    setCustom('')
  }

  const removeItem = (id) => onChange({ equipment: equipment.filter(e => e.id !== id) })

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {starter.length > 0 && (
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
            Standard starting equipment for {CLASSES.find(c => c.id === classId)?.label || 'your class'}:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {starter.map(item => (
              <span key={item} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: 'color-mix(in srgb, var(--border) 50%, transparent)', color: 'var(--text-muted)' }}>{item}</span>
            ))}
          </div>
          <button
            onClick={addPreset}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            Add Starting Equipment
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="field"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCustom()}
          placeholder="Add custom item…"
          style={{ flex: 1, padding: '8px 10px', fontSize: 13 }}
        />
        <button onClick={addCustom} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--bg-main)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Add</button>
      </div>

      {equipment.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {equipment.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '8px 12px', borderRadius: 8,
              background: 'color-mix(in srgb, var(--bg-nav) 70%, transparent)',
              border: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-main)' }}>{item.name}</span>
              <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {equipment.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
          No equipment added yet. Use the preset button or add custom items above.
        </p>
      )}
    </div>
  )
}

// ─── Step 6: Review ──────────────────────────────────────────────────────────

function StepReview({ data }) {
  const race = RACES.find(r => r.id === data.race)
  const cls = CLASSES.find(c => c.id === data.class)
  const background = BACKGROUNDS.find(b => b.id === data.background)
  const profBonus = getProficiencyBonus(data.level)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Identity */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {data.portrait && (
          <img src={data.portrait} alt="" style={{ width: 80, height: 96, objectFit: 'cover', borderRadius: 10, flexShrink: 0, border: '2px solid color-mix(in srgb, var(--accent) 40%, transparent)' }} />
        )}
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>{data.name || 'Unnamed'}</h3>
          <p style={{ fontSize: 13, color: 'var(--accent)', margin: '3px 0' }}>
            Level {data.level} {data.race === 'custom' ? (data.customRace || 'Custom Race') : race?.label} {data.class === 'custom' ? (data.customClass || 'Custom Class') : cls?.label}
            {data.subclass && ` · ${data.subclass}`}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            {data.alignment} · {data.background === 'custom' ? (data.customBackground || 'Custom Background') : background?.label}
            {data.age && ` · Age ${data.age}`}
          </p>
        </div>
      </div>

      {/* Ability Scores */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Ability Scores</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {ABILITY_KEYS.map(key => (
            <div key={key} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 10, background: 'color-mix(in srgb, var(--bg-nav) 70%, transparent)', border: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>{ABILITY_SHORT[key]}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-main)' }}>{data.abilityScores[key]}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{formatMod(getModifier(data.abilityScores[key]))}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          ['HP', data.hp?.max || 10 + getModifier(data.abilityScores.con)],
          ['AC', data.ac || 10 + getModifier(data.abilityScores.dex)],
          ['Prof Bonus', `+${profBonus}`],
          ['Speed', `${(RACES.find(r => r.id === data.race)?.speed || 30)} ft`],
          ['Hit Die', cls?.hitDie || 'd8'],
          ['Inspiration', data.inspiration ? 'Yes' : 'No'],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: '10px 12px', borderRadius: 10, background: 'color-mix(in srgb, var(--bg-nav) 70%, transparent)', border: '1px solid color-mix(in srgb, var(--border) 50%, transparent)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Equipment */}
      {data.equipment?.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Equipment ({data.equipment.length} items)</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.equipment.map(e => e.name).join(', ')}</p>
        </div>
      )}
    </div>
  )
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.03em' }}>{label}</span>
      {children}
    </label>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function CharacterWizard({ novelId, onSave, onCancel }) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState(() => makeNewCharacter(novelId))
  const [saving, setSaving] = useState(false)

  const patch = (updates) => setDraft(prev => ({ ...prev, ...updates }))

  const canProceed = () => {
    if (step === 0) return draft.name?.trim().length > 0
    return true
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)

    // Derive HP from class and CON modifier
    const cls = CLASSES.find(c => c.id === draft.class)
    const hitDieMax = parseInt(cls?.hitDie?.replace('d', '') || '8')
    const conMod = getModifier(draft.abilityScores.con)
    const hpMax = hitDieMax + conMod

    // Derive AC from DEX modifier (no armor = 10 + DEX)
    const dexMod = getModifier(draft.abilityScores.dex)

    // Apply race ability bonuses
    const race = RACES.find(r => r.id === draft.race)
    const bonuses = race?.abilityBonuses || {}
    const finalScores = { ...draft.abilityScores }
    ABILITY_KEYS.forEach(k => { if (bonuses[k]) finalScores[k] = (finalScores[k] || 10) + bonuses[k] })

    // Build features list
    const features = (cls?.features || []).map((name, i) => ({
      id: `feat-${i}`,
      name,
      source: cls.label,
      description: '',
    }))
    if (race?.traits?.length) {
      race.traits.forEach((name, i) => features.push({ id: `race-trait-${i}`, name, source: race.label, description: '' }))
    }

    const bg = BACKGROUNDS.find(b => b.id === draft.background)
    if (bg?.feature) features.push({ id: 'bg-feat', name: bg.feature, source: bg.label, description: '' })

    const finalChar = {
      ...draft,
      abilityScores: finalScores,
      hp: { max: Math.max(1, hpMax), current: Math.max(1, hpMax), temp: 0 },
      ac: 10 + dexMod,
      speed: race?.speed || 30,
      features,
      updatedAt: new Date().toISOString(),
    }

    try {
      await onSave(finalChar)
    } finally {
      setSaving(false)
    }
  }

  const stepComponents = [
    <StepBasics data={draft} onChange={patch} />,
    <StepRace data={draft} onChange={patch} />,
    <StepClass data={draft} onChange={patch} />,
    <StepScores data={draft} onChange={patch} />,
    <StepEquipment data={draft} onChange={patch} />,
    <StepReview data={draft} />,
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 250,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{
        background: 'var(--bg-nav)',
        border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
        borderRadius: 20,
        width: 'min(760px, 100%)',
        maxHeight: 'calc(100vh - 48px)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>Character Builder</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>Create New Character</p>
            </div>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}>✕</button>
          </div>
          {/* Step indicators */}
          <div style={{ display: 'flex', gap: 0 }}>
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => i < step && setStep(i)}
                style={{
                  flex: 1, padding: '6px 4px', borderRadius: 0,
                  background: 'none', border: 'none', cursor: i < step ? 'pointer' : 'default',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  borderBottom: `2px solid ${i === step ? 'var(--accent)' : i < step ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'color-mix(in srgb, var(--border) 50%, transparent)'}`,
                  paddingBottom: 8,
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: i === step ? 'var(--accent)' : i < step ? 'var(--text-main)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {stepComponents[step]}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >← Back</button>
            )}
            <button
              onClick={onCancel}
              style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >Cancel</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Step {step + 1} of {STEPS.length}</span>
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => canProceed() && setStep(s => s + 1)}
                disabled={!canProceed()}
                style={{
                  padding: '8px 20px', borderRadius: 9,
                  background: canProceed() ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)',
                  color: canProceed() ? 'var(--bg-main)' : 'var(--text-muted)',
                  border: 'none', fontSize: 13, fontWeight: 800, cursor: canProceed() ? 'pointer' : 'default',
                }}
              >Next →</button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 20px', borderRadius: 9,
                  background: 'var(--accent)', color: 'var(--bg-main)',
                  border: 'none', fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >{saving ? 'Creating…' : 'Create Character ✓'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
