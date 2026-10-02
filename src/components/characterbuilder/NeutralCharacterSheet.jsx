import { useState } from 'react'
import { CHARACTER_STATUSES, NEUTRAL_PRESETS, makeNeutralCharacter, makeNeutralDetails } from './rpgData'
import { TabCampaign } from './CharacterSheet'
import { UserMediaImage } from '../shared/UserMedia'

// System-neutral character sheet for Tabletop Campaign projects. Contains no
// game-system rules: stats, resource trackers, and traits are all user-named.

const SHEET_TABS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'traits',    label: 'Traits & Abilities' },
  { id: 'equipment', label: 'Inventory' },
  { id: 'notes',     label: 'Notes' },
  { id: 'campaign',  label: 'Campaign' },
]

const PANEL_STYLE = {
  padding: '14px 16px', borderRadius: 12,
  border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
  background: 'color-mix(in srgb, var(--bg-nav) 80%, transparent)',
}
const LABEL_STYLE = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em' }
const ADD_BTN_STYLE = { padding: '6px 14px', borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }
const REMOVE_BTN_STYLE = { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

// ─── Create dialog ────────────────────────────────────────────────────────────

export function NeutralCharacterCreate({ novelId, onSave, onCancel }) {
  const [name, setName] = useState('')
  const [concept, setConcept] = useState('')
  const [system, setSystem] = useState('')
  const [preset, setPreset] = useState('blank')

  const submit = () => onSave(makeNeutralCharacter(novelId, { name, concept, system, preset }))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 350, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div role="dialog" aria-label="New character" style={{ background: 'var(--bg-nav)', border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', borderRadius: 16, padding: 24, width: 'min(440px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: 14 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>New Character</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>A system-neutral sheet — name your own stats, trackers, and traits to match any game.</p>
        </div>
        <label style={{ display: 'grid', gap: 5 }}>
          <span style={LABEL_STYLE}>Name</span>
          <input className="field" autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Character name" style={{ padding: '8px 10px', fontSize: 16 }} />
        </label>
        <label style={{ display: 'grid', gap: 5 }}>
          <span style={LABEL_STYLE}>Role / concept</span>
          <input className="field" value={concept} onChange={e => setConcept(e.target.value)} placeholder="e.g. Smuggler, Detective, Hedge Knight" style={{ padding: '8px 10px', fontSize: 16 }} />
        </label>
        <label style={{ display: 'grid', gap: 5 }}>
          <span style={LABEL_STYLE}>Game system (optional)</span>
          <input className="field" value={system} onChange={e => setSystem(e.target.value)} placeholder="Whatever you are playing" style={{ padding: '8px 10px', fontSize: 16 }} />
        </label>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={LABEL_STYLE}>Starting layout</span>
          {NEUTRAL_PRESETS.map(p => (
            <button key={p.id} type="button" onClick={() => setPreset(p.id)} style={{
              textAlign: 'left', padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${preset === p.id ? 'var(--accent)' : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
              background: preset === p.id ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
              color: 'var(--text-main)',
            }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>{p.label}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{p.description}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} style={{ ...ADD_BTN_STYLE, padding: '8px 18px', fontSize: 13 }}>Create Character</button>
        </div>
      </div>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function TabOverview({ details, onDetails }) {
  const [newStat, setNewStat] = useState('')
  const [newRes, setNewRes] = useState({ name: '', max: 10 })
  const [newTag, setNewTag] = useState('')

  const updateList = (key, id, patch) => onDetails({ [key]: details[key].map(x => x.id === id ? { ...x, ...patch } : x) })
  const removeFrom = (key, id) => onDetails({ [key]: details[key].filter(x => x.id !== id) })

  const addStat = () => {
    if (!newStat.trim()) return
    onDetails({ stats: [...details.stats, { id: uid('stat'), name: newStat.trim(), value: '' }] })
    setNewStat('')
  }
  const addResource = () => {
    if (!newRes.name.trim()) return
    const max = Math.max(0, Number(newRes.max) || 0)
    onDetails({ resources: [...details.resources, { id: uid('res'), name: newRes.name.trim(), current: max, max }] })
    setNewRes({ name: '', max: 10 })
  }
  const addTag = () => {
    const tag = newTag.trim()
    if (!tag || details.tags.includes(tag)) return
    onDetails({ tags: [...details.tags, tag] })
    setNewTag('')
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={PANEL_STYLE}>
        <p style={{ ...LABEL_STYLE, marginBottom: 10 }}>Stats</p>
        {details.stats.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>No stats yet. Add the numbers or ratings your system uses.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 10 }}>
          {details.stats.map(stat => (
            <div key={stat.id} style={{ padding: '8px', borderRadius: 10, textAlign: 'center', border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)', position: 'relative' }}>
              <button onClick={() => removeFrom('stats', stat.id)} aria-label={`Remove ${stat.name}`} style={{ ...REMOVE_BTN_STYLE, position: 'absolute', top: 2, right: 2, fontSize: 11 }}>✕</button>
              <input value={stat.name} onChange={e => updateList('stats', stat.id, { name: e.target.value })} aria-label="Stat name"
                style={{ width: '88%', textAlign: 'center', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }} />
              <input value={stat.value} onChange={e => updateList('stats', stat.id, { value: e.target.value })} aria-label={`${stat.name} value`} placeholder="—"
                className="field" style={{ width: '100%', textAlign: 'center', fontSize: 16, fontWeight: 800, padding: '4px' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="field" placeholder="New stat name…" value={newStat} onChange={e => setNewStat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStat()} style={{ flex: 1, padding: '6px 10px', fontSize: 16 }} />
          <button onClick={addStat} style={ADD_BTN_STYLE}>Add Stat</button>
        </div>
      </div>

      <div style={PANEL_STYLE}>
        <p style={{ ...LABEL_STYLE, marginBottom: 10 }}>Trackers</p>
        {details.resources.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>Track health, stress, fate points, ammo — anything with a current and maximum value.</p>}
        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          {details.resources.map(res => {
            const pct = res.max > 0 ? Math.max(0, Math.min(100, (res.current / res.max) * 100)) : 0
            return (
              <div key={res.id} style={{ display: 'grid', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input value={res.name} onChange={e => updateList('resources', res.id, { name: e.target.value })} aria-label="Tracker name"
                    style={{ flex: 1, minWidth: 80, background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: 13, fontWeight: 700 }} />
                  <button onClick={() => updateList('resources', res.id, { current: Math.max(0, res.current - 1) })} aria-label={`Decrease ${res.name}`} style={{ ...ADD_BTN_STYLE, padding: '2px 10px' }}>−</button>
                  <input type="number" value={res.current} onChange={e => updateList('resources', res.id, { current: Math.max(0, Number(e.target.value) || 0) })} aria-label={`${res.name} current`} className="field" style={{ width: 56, textAlign: 'center', fontSize: 16, padding: '3px' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/</span>
                  <input type="number" value={res.max} onChange={e => updateList('resources', res.id, { max: Math.max(0, Number(e.target.value) || 0) })} aria-label={`${res.name} maximum`} className="field" style={{ width: 56, textAlign: 'center', fontSize: 16, padding: '3px' }} />
                  <button onClick={() => updateList('resources', res.id, { current: res.current + 1 })} aria-label={`Increase ${res.name}`} style={{ ...ADD_BTN_STYLE, padding: '2px 10px' }}>+</button>
                  <button onClick={() => removeFrom('resources', res.id)} aria-label={`Remove ${res.name}`} style={REMOVE_BTN_STYLE}>✕</button>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'color-mix(in srgb, var(--border) 50%, transparent)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s' }} />
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="field" placeholder="New tracker name…" value={newRes.name} onChange={e => setNewRes(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addResource()} style={{ flex: 1, minWidth: 120, padding: '6px 10px', fontSize: 16 }} />
          <input type="number" min={0} className="field" value={newRes.max} onChange={e => setNewRes(p => ({ ...p, max: e.target.value }))} aria-label="Maximum" style={{ width: 64, textAlign: 'center', padding: '6px', fontSize: 16 }} />
          <button onClick={addResource} style={ADD_BTN_STYLE}>Add Tracker</button>
        </div>
      </div>

      <div style={PANEL_STYLE}>
        <p style={{ ...LABEL_STYLE, marginBottom: 10 }}>Conditions &amp; Tags</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {details.tags.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>None.</span>}
          {details.tags.map(tag => (
            <span key={tag} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 600, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
              {tag}
              <button onClick={() => onDetails({ tags: details.tags.filter(t => t !== tag) })} aria-label={`Remove ${tag}`} style={{ ...REMOVE_BTN_STYLE, color: 'inherit', fontSize: 11, padding: '0 0 0 6px' }}>✕</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="field" placeholder="e.g. Wounded, Marked, Inspired…" value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} style={{ flex: 1, padding: '6px 10px', fontSize: 16 }} />
          <button onClick={addTag} style={ADD_BTN_STYLE}>Add</button>
        </div>
      </div>
    </div>
  )
}

function TabTraits({ details, onDetails }) {
  const [draft, setDraft] = useState({ name: '', description: '' })
  const add = () => {
    if (!draft.name.trim()) return
    onDetails({ traits: [...details.traits, { id: uid('trait'), name: draft.name.trim(), description: draft.description.trim() }] })
    setDraft({ name: '', description: '' })
  }
  const update = (id, patch) => onDetails({ traits: details.traits.map(t => t.id === id ? { ...t, ...patch } : t) })

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <input className="field" placeholder="Skill, ability, move, aspect, or trait name…" value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} style={{ padding: '7px 10px', fontSize: 16 }} />
        <textarea className="field" placeholder="Description, rules text, or notes (optional)" value={draft.description} onChange={e => setDraft(p => ({ ...p, description: e.target.value }))} style={{ padding: '7px 10px', fontSize: 16, minHeight: 64, resize: 'vertical' }} />
        <button onClick={add} style={{ ...ADD_BTN_STYLE, justifySelf: 'start' }}>Add Trait</button>
      </div>
      {details.traits.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No traits yet. Use this for skills, abilities, advantages, powers, or anything else your game tracks.</p>
        : details.traits.map(t => (
          <div key={t.id} style={PANEL_STYLE}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={t.name} onChange={e => update(t.id, { name: e.target.value })} aria-label="Trait name" style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: 14, fontWeight: 700 }} />
              <button onClick={() => onDetails({ traits: details.traits.filter(x => x.id !== t.id) })} aria-label={`Remove ${t.name}`} style={REMOVE_BTN_STYLE}>✕</button>
            </div>
            <textarea className="field" value={t.description} onChange={e => update(t.id, { description: e.target.value })} aria-label={`${t.name} description`} style={{ width: '100%', marginTop: 6, padding: '6px 8px', fontSize: 16, minHeight: 56, resize: 'vertical' }} />
          </div>
        ))}
    </div>
  )
}

function TabInventory({ character, onChange }) {
  const [draft, setDraft] = useState({ name: '', quantity: 1 })
  const items = character.equipment || []
  const add = () => {
    if (!draft.name.trim()) return
    onChange({ equipment: [...items, { id: uid('eq'), name: draft.name.trim(), type: 'gear', quantity: Math.max(1, Number(draft.quantity) || 1), description: '' }] })
    setDraft({ name: '', quantity: 1 })
  }
  const update = (id, patch) => onChange({ equipment: items.map(i => i.id === id ? { ...i, ...patch } : i) })

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="field" placeholder="Item name…" value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && add()} style={{ flex: 1, minWidth: 140, padding: '7px 10px', fontSize: 16 }} />
        <input type="number" min={1} className="field" value={draft.quantity} onChange={e => setDraft(p => ({ ...p, quantity: e.target.value }))} aria-label="Quantity" style={{ width: 60, textAlign: 'center', padding: '7px 8px', fontSize: 16 }} />
        <button onClick={add} style={ADD_BTN_STYLE}>Add</button>
      </div>
      {items.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>Nothing carried yet. Add gear, money, or any resource your game tracks.</p>
        : items.map(item => (
          <div key={item.id} style={{ ...PANEL_STYLE, padding: '9px 12px', display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input value={item.name} onChange={e => update(item.id, { name: e.target.value })} aria-label="Item name" style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: 13, fontWeight: 600 }} />
              <input type="number" min={1} value={item.quantity} onChange={e => update(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} aria-label={`${item.name} quantity`} style={{ width: 52, padding: '3px 5px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 16, textAlign: 'center' }} />
              <button onClick={() => onChange({ equipment: items.filter(i => i.id !== item.id) })} aria-label={`Remove ${item.name}`} style={REMOVE_BTN_STYLE}>✕</button>
            </div>
            <input className="field" value={item.description || ''} onChange={e => update(item.id, { description: e.target.value })} placeholder="Notes…" aria-label={`${item.name} notes`} style={{ padding: '4px 8px', fontSize: 16 }} />
          </div>
        ))}
    </div>
  )
}

function TabNotes({ character, onChange }) {
  const [noteTab, setNoteTab] = useState('backstory')
  const noteTabs = [['backstory', 'Backstory'], ['journal', 'Journal'], ['sessionNotes', 'Session Notes'], ['secrets', 'Secrets']]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {noteTabs.map(([id, label]) => (
          <button key={id} onClick={() => setNoteTab(id)} style={{
            padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            border: `1px solid ${noteTab === id ? 'var(--accent)' : 'color-mix(in srgb, var(--border) 60%, transparent)'}`,
            background: noteTab === id ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-main))' : 'transparent',
            color: noteTab === id ? 'var(--accent)' : 'var(--text-muted)',
          }}>{label}</button>
        ))}
      </div>
      <textarea
        value={character[noteTab] || ''}
        onChange={e => onChange({ [noteTab]: e.target.value })}
        placeholder={`Write ${noteTabs.find(t => t[0] === noteTab)?.[1].toLowerCase()} here…`}
        className="field"
        style={{ minHeight: 320, padding: '12px 14px', fontSize: 16, resize: 'vertical', lineHeight: 1.6 }}
      />
    </div>
  )
}

// ─── Sheet ────────────────────────────────────────────────────────────────────

export default function NeutralCharacterSheet({ character, onUpdate, onBack, store }) {
  const [tab, setTab] = useState('overview')
  const details = makeNeutralDetails(character.neutral || {})
  const status = CHARACTER_STATUSES.find(s => s.id === character.status) || CHARACTER_STATUSES[0]

  const handleChange = (patch) => onUpdate({ ...character, ...patch, updatedAt: new Date().toISOString() })
  const handleDetails = (patch) => handleChange({ neutral: { ...details, ...patch } })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 0', fontSize: 13, fontWeight: 600 }}>← All Characters</button>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 12 }}>
          <div style={{
            width: 64, height: 80, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
            border: `2px solid color-mix(in srgb, ${status.color} 40%, transparent)`,
            background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-main))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {character.portrait
              ? <UserMediaImage src={character.portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" opacity=".5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 4 }}>
            <input value={character.name || ''} onChange={e => handleChange({ name: e.target.value })} aria-label="Character name"
              style={{ background: 'transparent', border: 'none', fontSize: 18, fontWeight: 800, color: 'var(--text-main)', padding: 0 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={details.concept} onChange={e => handleDetails({ concept: e.target.value })} placeholder="Role / concept" aria-label="Role or concept"
                style={{ flex: 1, minWidth: 110, background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, padding: 0 }} />
              <input value={details.system} onChange={e => handleDetails({ system: e.target.value })} placeholder="Game system" aria-label="Game system"
                style={{ flex: 1, minWidth: 110, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, padding: 0 }} />
            </div>
            <input value={character.pronouns || ''} onChange={e => handleChange({ pronouns: e.target.value })} placeholder="Pronouns" aria-label="Pronouns"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, padding: 0 }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--bg-nav) 40%, transparent)' }}>
        {SHEET_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '9px 14px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', background: 'none',
            borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
            color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
        {tab === 'overview'  && <TabOverview details={details} onDetails={handleDetails} />}
        {tab === 'traits'    && <TabTraits details={details} onDetails={handleDetails} />}
        {tab === 'equipment' && <TabInventory character={character} onChange={handleChange} />}
        {tab === 'notes'     && <TabNotes character={character} onChange={handleChange} />}
        {tab === 'campaign'  && <TabCampaign character={character} onChange={handleChange} store={store} />}
      </div>
    </div>
  )
}
