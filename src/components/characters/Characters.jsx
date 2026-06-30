import { useState, useRef, useEffect, useMemo } from 'react'
import Modal from '../shared/Modal'
import { FACTION_ICONS } from '../../constants/factionIcons'
import { CHARACTER_LINK_REL_TYPES, DEFAULT_CHARACTER_LINK_REL_TYPE, REL_TYPES } from '../../constants/Constants'
import { StudioSplit, StudioIndex, StudioRecord, StudioDetail, StudioButton, StudioEmpty, StudioPageHeader, StudioNote } from '../presentation/Studio'
import { allRefsFor } from '../../utils/worldLinks'
import { getAgeInputValue, getBirthDateFromAge, getCharacterAge } from '../../utils/characterAge'
import CharacterJourney from './CharacterJourney'

// The Fix: uses theme variables so all 4 themes apply correctly
const INPUT = 'field w-full px-3 py-2 text-sm placeholder:text-[var(--text-muted)]'
const LABEL = 'block form-label mb-1.5'
const CHECKBOX_LABEL = 'flex items-center gap-2 text-[var(--text-main)]'
const SECTION_HEAD = 'text-[10px] text-[var(--text-muted)] uppercase tracking-widest pb-2 mb-3 border-b border-[var(--border)]'

const CHARACTER_ROLE_PRESETS = [
  'Protagonist',
  'Deuteragonist',
  'Antagonist',
  'Love interest',
  'Mentor',
  'Foil',
  'Confidant',
  'Sidekick',
  'Ally',
  'Rival',
  'Threshold guardian',
  'Trickster',
  'Catalyst',
  'Narrator',
  'Supporting character',
  'Background character',
]

const TRAIT_FIELDS = [
  ['strengths', 'Strengths'],
  ['weaknesses', 'Weaknesses'],
  ['internalGoal', 'Internal Goal'],
  ['externalGoal', 'External Goal'],
  ['disabilities', 'Disabilities'],
  ['qualifications', 'Qualifications'],
  ['talents', 'Talents'],
  ['languages', 'Languages'],
  ['fears', 'Fears'],
  ['passions', 'Passions'],
]

const BACKGROUND_FIELDS = [
  ['hometown', 'Hometown'],
  ['religion', 'Religion'],
  ['language', 'Primary Language'],
  ['historicEventsWitnessed', 'Historic Events Witnessed'],
  ['lifeEvents', 'Life Events'],
]

const CHARACTER_TABS = [
  ['overview', 'Overview'],
  ['journey', 'Journey'],
  ['relationships', 'Relationships'],
  ['traits', 'Character Traits'],
  ['background', 'Background'],
]

const CHARACTER_FORM_TABS = CHARACTER_TABS.filter(([id]) => id !== 'journey')

function getChildIds(character, characters) {
  const explicit = character?.childIds || []
  const derived = characters.filter(c => (c.parentIds || []).includes(character?.id)).map(c => c.id)
  return [...new Set([...explicit, ...derived])]
}

// Renders a character image respecting focal point and optional zoom level
function CharacterPortrait({ src, position, zoom, className = '' }) {
  const z = zoom || 1
  return (
    <div className={`overflow-hidden ${className}`}>
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover pointer-events-none"
        style={{
          objectPosition: position || '50% 50%',
          ...(z !== 1 && { transform: `scale(${z})`, transformOrigin: position || '50% 50%' }),
        }}
      />
    </div>
  )
}

function TextField({ label, value, onChange, placeholder, className = '' }) {
  return (
    <label className={className}>
      <span className={LABEL}>{label}</span>
      <input className={INPUT} value={value} onChange={onChange} placeholder={placeholder} />
    </label>
  )
}

function TabStrip({ tabs, activeTab, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`px-3 py-1.5 rounded border text-xs font-bold transition-colors ${activeTab === id ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-fade)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function ComboSelect({ value, onChange, options, placeholder, allowCustom = false }) {
  const [query, setQuery] = useState(null)
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const listRef = useRef(null)

  const selectedLabel = options.find(o => o.value === value)?.label ?? (allowCustom ? (value || '') : '')
  const displayValue = query !== null ? query : selectedLabel
  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    listRef.current?.children[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  const commit = (opt) => {
    onChange(opt.value)
    setQuery(null)
    setOpen(false)
  }

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault()
        setOpen(true)
        setHighlighted(Math.max(0, options.findIndex(o => o.value === value)))
      }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlighted]) commit(filtered[highlighted])
      else if (allowCustom && query?.trim()) { onChange(query.trim()); setQuery(null); setOpen(false) }
    }
    else if (e.key === 'Escape') { setOpen(false); setQuery(null) }
    else if (e.key === 'Tab') {
      if (filtered[highlighted]) commit(filtered[highlighted])
      setOpen(false); setQuery(null)
    }
  }

  return (
    <div className="relative">
      <input
        className={INPUT}
        value={displayValue}
        onChange={e => { setQuery(e.target.value); setHighlighted(0); setOpen(true) }}
        onFocus={() => { setOpen(true); setHighlighted(Math.max(0, options.findIndex(o => o.value === value))) }}
        onBlur={() => setTimeout(() => { setOpen(false); setQuery(null) }, 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && (
        <ul ref={listRef} className="absolute z-50 top-full left-0 right-0 mt-1 max-h-44 overflow-y-auto bg-[var(--bg-nav)] border border-[var(--border)] rounded-lg shadow-xl py-1">
          {filtered.length > 0 ? filtered.map((opt, i) => (
            <li
              key={String(opt.value)}
              className={`px-3 py-1.5 text-sm cursor-pointer transition-colors ${i === highlighted ? 'bg-[var(--accent-fade)] text-[var(--accent)]' : 'text-[var(--text-main)] hover:bg-[var(--bg-main)]'}`}
              onMouseDown={() => commit(opt)}
              onMouseEnter={() => setHighlighted(i)}
            >
              {opt.label}
            </li>
          )) : (
            <li className="px-3 py-1.5 text-sm text-[var(--text-muted)] italic">
              {allowCustom && query ? `Press Enter to use "${query}"` : 'No matches'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

// Full-screen photo editor popup: set focal point and zoom level
function PhotoEditorModal({ image, imagePosition, imageZoom, onSave, onClose }) {
  const [pos, setPos] = useState(imagePosition || '50% 50%')
  const [zoom, setZoom] = useState(imageZoom || 1)
  const pickerRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleInteraction = (e) => {
    if (!pickerRef.current) return
    const rect = pickerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)))
    const y = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 100)))
    setPos(`${x}% ${y}%`)
  }

  const [posX, posY] = pos.split(' ')

  const previewStyle = {
    objectFit: 'cover',
    objectPosition: pos,
    ...(zoom !== 1 && { transform: `scale(${zoom})`, transformOrigin: pos }),
  }

  return (
    <Modal title="Edit Portrait" onClose={onClose} wide centered>
      <div className="flex gap-6 items-start">
        {/* Main drag-to-position area */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[var(--text-muted)] mb-2">
            Drag or click to set the focal point — controls where the portrait is cropped across the app.
          </p>
          <div
            ref={pickerRef}
            className="relative h-72 rounded-lg overflow-hidden cursor-crosshair select-none border border-[var(--border)]"
            onMouseDown={(e) => { setIsDragging(true); handleInteraction(e) }}
            onMouseMove={(e) => { if (isDragging) handleInteraction(e) }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
            <img
              src={image}
              alt="Portrait"
              className="w-full h-full pointer-events-none"
              style={previewStyle}
            />
            {/* Focal point crosshair */}
            <div
              className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: posX, top: posY }}
            >
              <div className="absolute inset-0 rounded-full border-2 border-white shadow-lg" />
              <div className="absolute top-1/2 left-0 w-full h-px bg-white/80 -translate-y-1/2" />
              <div className="absolute left-1/2 top-0 h-full w-px bg-white/80 -translate-x-1/2" />
            </div>
          </div>

          {/* Zoom slider */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Zoom</span>
              <span className="text-[10px] text-[var(--text-muted)]">{zoom.toFixed(1)}×</span>
            </div>
            <input
              type="range" min="1" max="3" step="0.05" value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="w-full h-1 accent-[var(--accent)]"
            />
            {zoom > 1 && (
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="mt-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              >
                Reset zoom
              </button>
            )}
          </div>
        </div>

        {/* Live previews */}
        <div className="flex flex-col gap-4 items-center flex-shrink-0 pt-6">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-[var(--border)] mx-auto">
              <img src={image} alt="" className="w-full h-full" style={previewStyle} />
            </div>
            <p className="text-[9px] text-[var(--text-muted)] mt-1">Avatar</p>
          </div>
          <div className="text-center">
            <div className="w-16 h-20 rounded-lg overflow-hidden border border-[var(--border)] mx-auto">
              <img src={image} alt="" className="w-full h-full" style={previewStyle} />
            </div>
            <p className="text-[9px] text-[var(--text-muted)] mt-1">Card</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-xl overflow-hidden border border-[var(--border)] mx-auto">
              <img src={image} alt="" className="w-full h-full" style={previewStyle} />
            </div>
            <p className="text-[9px] text-[var(--text-muted)] mt-1">Profile</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-5 pt-4 border-t border-[var(--border)]">
        <button
          onClick={() => onSave(pos, zoom)}
          className="flex-1 bg-[var(--accent)] text-[var(--bg-main)] font-bold py-2 rounded hover:opacity-90"
        >
          Apply
        </button>
        <button onClick={onClose} className="px-4 py-2 text-[var(--text-muted)]">
          Cancel
        </button>
      </div>
    </Modal>
  )
}

function CharacterForm({ initial, onSave, onCancel, factions, characters, currentYear }) {
  const initialChildIds = getChildIds(initial, characters)
  const [form, setForm] = useState({
    name: initial?.name || '',
    familyGroup: initial?.familyGroup || '',
    factionId: initial?.factionId || '',
    role: initial?.role || '',
    species: initial?.species || '',
    titleJob: initial?.titleJob || initial?.title || '',
    bio: initial?.bio || '',
    age: getAgeInputValue(initial, currentYear),
    deathDate: initial?.deathDate || '',
    parentIds: initial?.parentIds || [],
    childIds: initialChildIds,
    spouseIds: initial?.spouseIds || [],
    relationships: Array.isArray(initial?.relationships) ? initial.relationships : [],
    keywords: initial?.keywords || [],
    traits: {
      strengths: initial?.traits?.strengths || '',
      weaknesses: initial?.traits?.weaknesses || '',
      internalGoal: initial?.traits?.internalGoal || '',
      externalGoal: initial?.traits?.externalGoal || '',
      disabilities: initial?.traits?.disabilities || '',
      qualifications: initial?.traits?.qualifications || '',
      talents: initial?.traits?.talents || '',
      languages: initial?.traits?.languages || '',
      fears: initial?.traits?.fears || '',
      passions: initial?.traits?.passions || '',
    },
    background: {
      hometown: initial?.background?.hometown || '',
      religion: initial?.background?.religion || '',
      language: initial?.background?.language || '',
      historicEventsWitnessed: initial?.background?.historicEventsWitnessed || '',
      lifeEvents: initial?.background?.lifeEvents || '',
    },
    extraAbilities: initial?.extraAbilities?.length ? initial.extraAbilities : [],
    image: initial?.image || '',
    imagePosition: initial?.imagePosition || '50% 50%',
    imageZoom: initial?.imageZoom || 1,
  })
  const [editorTab, setEditorTab] = useState('overview')
  const [keywordInput, setKeywordInput] = useState('')
  const [showPhotoEditor, setShowPhotoEditor] = useState(false)

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setForm(prev => ({ ...prev, image: ev.target.result, imagePosition: '50% 50%', imageZoom: 1 }))
    reader.readAsDataURL(file)
  }

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))
  const handleNestedChange = (section, field) => (e) => {
    setForm(prev => ({ ...prev, [section]: { ...prev[section], [field]: e.target.value } }))
  }
  const updateAbility = (index, patch) => {
    setForm(prev => {
      const next = [...prev.extraAbilities]
      next[index] = { ...next[index], ...patch }
      return { ...prev, extraAbilities: next }
    })
  }
  const addAbility = () => {
    setForm(prev => ({ ...prev, extraAbilities: [...prev.extraAbilities, { name: '', description: '' }] }))
  }
  const removeAbility = (index) => {
    setForm(prev => ({ ...prev, extraAbilities: prev.extraAbilities.filter((_, i) => i !== index) }))
  }
  const toggleArrayValue = (field, value) => {
    setForm(prev => {
      const values = prev[field] || []
      return {
        ...prev,
        [field]: values.includes(value)
          ? values.filter(v => v !== value)
          : [...values, value],
      }
    })
  }
  const upsertRelationship = (index, patch) => {
    setForm(prev => {
      const next = [...prev.relationships]
      if (patch.targetId) {
        next.forEach((relationship, relationshipIndex) => {
          if (relationshipIndex !== index && relationship.targetId === patch.targetId) {
            next[relationshipIndex] = { ...relationship, targetId: '' }
          }
        })
      }
      next[index] = { ...next[index], ...patch }
      return { ...prev, relationships: next }
    })
  }
  const removeRelationship = (index) => {
    setForm(prev => ({
      ...prev,
      relationships: prev.relationships.filter((_, i) => i !== index),
    }))
  }
  const addRelationship = () => {
    setForm(prev => ({
      ...prev,
      relationships: [...prev.relationships, { targetId: '', type: DEFAULT_CHARACTER_LINK_REL_TYPE }],
    }))
  }

  const addKeyword = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && keywordInput.trim()) {
      e.preventDefault()
      const kw = keywordInput.trim().replace(/,$/, '')
      if (kw && !form.keywords.includes(kw)) setForm(prev => ({ ...prev, keywords: [...prev.keywords, kw] }))
      setKeywordInput('')
    }
  }
  const removeKeyword = (kw) => setForm(prev => ({ ...prev, keywords: prev.keywords.filter(k => k !== kw) }))
  const relationshipTargets = characters.filter(c => c.id !== initial?.id)
  const validRelationships = [...new Map(
    form.relationships.filter(r => r.targetId && r.type).map(relationship => [relationship.targetId, relationship]),
  ).values()]
  const validAbilities = form.extraAbilities
    .map(ability => ({ name: ability.name?.trim() || '', description: ability.description?.trim() || '' }))
    .filter(ability => ability.name || ability.description)
  const saveForm = () => {
    const birthDate = form.age === '' ? '' : getBirthDateFromAge(form.age, currentYear, form.deathDate)
    const rest = { ...form }
    delete rest.age
    onSave({ ...rest, birthDate, relationships: validRelationships, extraAbilities: validAbilities })
  }

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); saveForm(); }} className="space-y-4 text-left">
        <TabStrip tabs={CHARACTER_FORM_TABS} activeTab={editorTab} onChange={setEditorTab} />

        {editorTab === 'overview' && (
          <div className="space-y-5">

            {/* Identity */}
            <div>
              <h3 className={SECTION_HEAD}>Identity</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={LABEL}>Name</label>
                  <input className={INPUT} value={form.name} onChange={handleChange('name')} required />
                </div>
                <div>
                  <label className={LABEL}>Role</label>
                  <ComboSelect
                    value={form.role}
                    onChange={v => setForm(prev => ({ ...prev, role: v }))}
                    options={[{ value: '', label: 'Select role' }, ...CHARACTER_ROLE_PRESETS.map(r => ({ value: r, label: r }))]}
                    placeholder="Select or type role..."
                    allowCustom
                  />
                </div>
                <TextField
                  label="Species"
                  value={form.species}
                  onChange={handleChange('species')}
                  placeholder="Human, elf, android..."
                />
                <TextField
                  label="Title / Job"
                  value={form.titleJob}
                  onChange={handleChange('titleJob')}
                  placeholder="Queen, detective, cartographer..."
                  className="col-span-2"
                />
              </div>
            </div>

            {/* Affiliation */}
            <div>
              <h3 className={SECTION_HEAD}>Affiliation</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Family Group</label>
                  <input className={INPUT} value={form.familyGroup} onChange={handleChange('familyGroup')} placeholder="e.g. Stark, Lannister" />
                </div>
                <div>
                  <label className={LABEL}>Faction / Allegiance</label>
                  <ComboSelect
                    value={form.factionId}
                    onChange={v => setForm(prev => ({ ...prev, factionId: v }))}
                    options={[{ value: '', label: 'No Faction' }, ...factions.map(f => ({ value: f.id, label: f.name }))]}
                    placeholder="No Faction"
                  />
                </div>
              </div>
            </div>

            {/* Vitals */}
            <div>
              <h3 className={SECTION_HEAD}>Vitals</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Age</label>
                  <input className={INPUT} type="number" min="0" step="1" value={form.age} onChange={handleChange('age')} placeholder="32" />
                </div>
                <div>
                  <label className={LABEL}>Death Date (Optional)</label>
                  <input className={INPUT} value={form.deathDate} onChange={handleChange('deathDate')} placeholder="Year 98" />
                </div>
              </div>
            </div>

            {/* Alias */}
            <div>
              <h3 className={SECTION_HEAD}>Alias / Keywords</h3>
              <p className="text-xs text-[var(--text-muted)] mb-2">These aliases are tracked in the manuscript. Press Enter or comma to add.</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {form.keywords.map(kw => (
                  <span key={kw} className="bg-[var(--accent-fade)] border border-[var(--accent)]/30 text-[var(--accent)] px-2 py-0.5 rounded text-xs flex items-center gap-1">
                    {kw}
                    <button type="button" onClick={() => removeKeyword(kw)} className="opacity-60 hover:opacity-100 leading-none">×</button>
                  </span>
                ))}
              </div>
              <input
                className={INPUT}
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                onKeyDown={addKeyword}
                placeholder="e.g. The Raven, Lord Blackwood..."
              />
            </div>

            {/* Portrait */}
            <div>
              <h3 className={SECTION_HEAD}>Portrait</h3>
              <div className="flex items-center gap-3 mb-3">
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="char-image-upload" />
                <label htmlFor="char-image-upload" className="cursor-pointer text-xs text-[var(--accent)] border border-[var(--accent)]/30 hover:border-[var(--accent)] px-3 py-1.5 rounded transition-colors">
                  {form.image ? 'Change Image' : 'Upload Image'}
                </label>
                {form.image && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowPhotoEditor(true)}
                      className="text-xs text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] px-3 py-1.5 rounded transition-colors"
                    >
                      Edit Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, image: '', imagePosition: '50% 50%', imageZoom: 1 }))}
                      className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
              {form.image && (
                <div className="flex gap-4 items-center">
                  <CharacterPortrait
                    src={form.image}
                    position={form.imagePosition}
                    zoom={form.imageZoom}
                    className="w-20 h-24 rounded-lg border border-[var(--border)] flex-shrink-0"
                  />
                  <div className="text-xs text-[var(--text-muted)] space-y-1">
                    {form.imageZoom > 1 && (
                      <div>Zoom: {form.imageZoom.toFixed(1)}×</div>
                    )}
                    <div>Focal point: {form.imagePosition}</div>
                    <button
                      type="button"
                      onClick={() => setShowPhotoEditor(true)}
                      className="text-[var(--accent)] hover:underline block"
                    >
                      Open photo editor →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Biography */}
            <div>
              <h3 className={SECTION_HEAD}>Biography</h3>
              <textarea className={INPUT + ' h-44 resize-none'} value={form.bio} onChange={handleChange('bio')} placeholder="Describe their history..." />
            </div>

          </div>
        )}

        {editorTab === 'relationships' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-[var(--border)] rounded p-3">
              <div>
                <label className={LABEL}>Parents</label>
                <div className="max-h-28 overflow-y-auto space-y-1 text-sm bg-[var(--bg-main)] border border-[var(--border)] rounded p-2">
                  {relationshipTargets.length === 0 && <p className="text-[var(--text-muted)] text-xs">No other characters yet.</p>}
                  {relationshipTargets.map(c => (
                    <label key={`parent-${c.id}`} className={CHECKBOX_LABEL}>
                      <input
                        type="checkbox"
                        checked={form.parentIds.includes(c.id)}
                        onChange={() => toggleArrayValue('parentIds', c.id)}
                        className="accent-[var(--accent)]"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={LABEL}>Children</label>
                <div className="max-h-28 overflow-y-auto space-y-1 text-sm bg-[var(--bg-main)] border border-[var(--border)] rounded p-2">
                  {relationshipTargets.length === 0 && <p className="text-[var(--text-muted)] text-xs">No other characters yet.</p>}
                  {relationshipTargets.map(c => (
                    <label key={`child-${c.id}`} className={CHECKBOX_LABEL}>
                      <input
                        type="checkbox"
                        checked={form.childIds.includes(c.id)}
                        onChange={() => toggleArrayValue('childIds', c.id)}
                        className="accent-[var(--accent)]"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={LABEL}>Spouses / Partners</label>
                <div className="max-h-28 overflow-y-auto space-y-1 text-sm bg-[var(--bg-main)] border border-[var(--border)] rounded p-2">
                  {relationshipTargets.length === 0 && <p className="text-[var(--text-muted)] text-xs">No other characters yet.</p>}
                  {relationshipTargets.map(c => (
                    <label key={`spouse-${c.id}`} className={CHECKBOX_LABEL}>
                      <input
                        type="checkbox"
                        checked={form.spouseIds.includes(c.id)}
                        onChange={() => toggleArrayValue('spouseIds', c.id)}
                        className="accent-[var(--accent)]"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="border border-[var(--border)] rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className={LABEL + ' mb-0'}>Relationship Links</label>
                <button type="button" onClick={addRelationship} className="text-xs text-[var(--accent)] font-bold">+ Add Link</button>
              </div>
              {form.relationships.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">Add links like allies, enemies, lovers, etc.</p>
              )}
              {form.relationships.map((rel, index) => (
                <div key={`rel-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <ComboSelect
                    value={rel.targetId}
                    onChange={v => upsertRelationship(index, { targetId: v })}
                    options={[{ value: '', label: 'Select character' }, ...relationshipTargets.map(c => ({ value: c.id, label: c.name }))]}
                    placeholder="Select character"
                  />
                  <ComboSelect
                    value={rel.type}
                    onChange={v => upsertRelationship(index, { type: v })}
                    options={CHARACTER_LINK_REL_TYPES.map(t => ({ value: t.id, label: t.label }))}
                    placeholder="Relationship type"
                  />
                  <button type="button" onClick={() => removeRelationship(index)} className="px-3 text-red-400 hover:text-red-300">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {editorTab === 'traits' && (
          <div className="space-y-4">
            <div className="border border-[var(--border)] rounded p-3">
              <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">Character Traits</h3>
              <div className="grid grid-cols-2 gap-3">
                {TRAIT_FIELDS.map(([field, label]) => (
                  <label key={field} className={field === 'internalGoal' || field === 'externalGoal' ? 'col-span-2' : ''}>
                    <span className={LABEL}>{label}</span>
                    <textarea
                      className={INPUT + ' min-h-[78px] resize-y'}
                      value={form.traits[field]}
                      onChange={handleNestedChange('traits', field)}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="border border-[var(--border)] rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest">Extra Abilities</h3>
                <button type="button" onClick={addAbility} className="text-xs text-[var(--accent)] font-bold">+ Add Ability</button>
              </div>
              {form.extraAbilities.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">Optional: add magic, powers, enhanced skills, unusual senses, or other ability notes.</p>
              )}
              {form.extraAbilities.map((ability, index) => (
                <div key={`ability-${index}`} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] gap-2">
                  <input
                    className={INPUT}
                    value={ability.name || ''}
                    onChange={(e) => updateAbility(index, { name: e.target.value })}
                    placeholder="Ability"
                  />
                  <input
                    className={INPUT}
                    value={ability.description || ''}
                    onChange={(e) => updateAbility(index, { description: e.target.value })}
                    placeholder="Free text description"
                  />
                  <button type="button" onClick={() => removeAbility(index)} className="px-3 text-red-400 hover:text-red-300">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {editorTab === 'background' && (
          <div className="border border-[var(--border)] rounded p-3">
            <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">Background</h3>
            <div className="grid grid-cols-2 gap-3">
              {BACKGROUND_FIELDS.map(([field, label]) => (
                <label key={field} className={field === 'historicEventsWitnessed' || field === 'lifeEvents' ? 'col-span-2' : ''}>
                  <span className={LABEL}>{label}</span>
                  {field === 'historicEventsWitnessed' || field === 'lifeEvents' ? (
                    <textarea
                      className={INPUT + ' min-h-[88px] resize-y'}
                      value={form.background[field]}
                      onChange={handleNestedChange('background', field)}
                    />
                  ) : (
                    <input className={INPUT} value={form.background[field]} onChange={handleNestedChange('background', field)} />
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t border-[var(--border)]">
          <button type="submit" className="flex-1 bg-[var(--accent)] text-[var(--bg-main)] font-bold py-2 rounded hover:opacity-90">
            Save Character
          </button>
          <button type="button" onClick={onCancel} className="px-4 py-2 text-[var(--text-muted)]">
            Cancel
          </button>
        </div>
      </form>

      {showPhotoEditor && form.image && (
        <PhotoEditorModal
          image={form.image}
          imagePosition={form.imagePosition}
          imageZoom={form.imageZoom}
          onSave={(pos, zoom) => {
            setForm(prev => ({ ...prev, imagePosition: pos, imageZoom: zoom }))
            setShowPhotoEditor(false)
          }}
          onClose={() => setShowPhotoEditor(false)}
        />
      )}
    </>
  )
}

function DetailLine({ label, value }) {
  return (
    <div>
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">{label}</div>
      <div className="mt-1 text-[var(--text-main)]">{value || 'Not set'}</div>
    </div>
  )
}

function DetailBlock({ label, value }) {
  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-main)] p-3">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">{label}</div>
      <p className="mt-2 text-sm text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">{value || 'Not set'}</p>
    </div>
  )
}

function LinkedNames({ label, items }) {
  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-main)] p-3">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">{label}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.length === 0 ? (
          <span className="text-sm text-[var(--text-muted)]">None linked</span>
        ) : (
          items.map(item => <span key={item.id} className="chip">{item.name}</span>)
        )}
      </div>
    </div>
  )
}

export default function Characters({ store }) {
  const { characters, saveCharacter, saveCharacterJourney, deleteCharacter, selectedCharacterId, setSelectedCharacterId, factions, currentYear, loreEntries = [], timeline = [], chapters = [], scenes = [], setSelectedLoreEntryId } = store
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name-asc')
  const [filterFamily, setFilterFamily] = useState('')
  const [filterFaction, setFilterFaction] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [profileTab, setProfileTab] = useState('overview')

  // Unique family groups for the filter dropdown
  const familyGroups = [...new Set(characters.map(c => c.familyGroup).filter(Boolean))].sort()

  const filtered = characters
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .filter(c => !filterFamily || c.familyGroup === filterFamily)
    .filter(c => {
      if (!filterFaction) return true
      if (filterFaction === '__none__') return !c.factionId
      return c.factionId === filterFaction
    })
    .sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name)
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name)
      if (sortBy === 'role') return (a.role || '').localeCompare(b.role || '')
      if (sortBy === 'faction') return (a.factionId || '').localeCompare(b.factionId || '')
      return 0
    })
  const selected = characters.find(c => c.id === selectedCharacterId)
  const selectedChildren = selected ? getChildIds(selected, characters).map(id => characters.find(c => c.id === id)).filter(Boolean) : []
  const selectedParents = selected ? (selected.parentIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean) : []
  const selectedSpouses = selected ? (selected.spouseIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean) : []
  const selectedRelationships = selected
    ? (Array.isArray(selected.relationships) ? selected.relationships : []).map(rel => ({
      ...rel,
      target: characters.find(c => c.id === rel.targetId),
      label: REL_TYPES.find(type => type.id === rel.type)?.label || rel.type,
    })).filter(rel => rel.target)
    : []
  const selectedAge = getCharacterAge(selected, currentYear)
  const incomingRefs = useMemo(() => selected
    ? allRefsFor(selected.id, { loreEntries, timeline, characters })
    : { lore: [], timeline: [], characters: [] },
    [selected, loreEntries, timeline, characters]
  )
  const profileTabs = CHARACTER_TABS
  const activeProfileTab = profileTabs.some(([id]) => id === profileTab) ? profileTab : 'overview'

  const handleSave = (formData) => {
    const savedId = saveCharacter(formData, editTarget?.id || null)
    setShowForm(false)
    setEditTarget(null)
    if (savedId) {
      setSelectedCharacterId(savedId)
      setProfileTab('overview')
    }
  }

  const getFactionIconUrl = (char) => {
    if (!char || !char.factionId) return null;
    const faction = factions.find(f => f.id === char.factionId);
    if (!faction) return null;
    return FACTION_ICONS.find(i => i.id === faction.iconId)?.url || null;
  }

  const activeFilters = (filterFamily ? 1 : 0) + (filterFaction ? 1 : 0)

  return (
    <StudioSplit variant="dossier" data-tour="characters-header">
      <StudioIndex
        title="Characters"
        tools={<StudioButton data-tour="characters-add" tone="primary" size="sm" onClick={() => { setEditTarget(null); setShowForm(true); }}>New</StudioButton>}
      >
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search..." className="field w-full px-2 py-1.5 text-xs placeholder:text-[var(--text-muted)]"
        />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="field w-full px-2 py-1.5 text-xs">
          <option value="name-asc">Name A→Z</option>
          <option value="name-desc">Name Z→A</option>
          <option value="role">Role</option>
          <option value="faction">Faction</option>
        </select>

        {/* Family group filter */}
        {familyGroups.length > 0 && (
          <select value={filterFamily} onChange={e => setFilterFamily(e.target.value)} className="field w-full px-2 py-1.5 text-xs">
            <option value="">All families</option>
            {familyGroups.map(fg => (
              <option key={fg} value={fg}>{fg}</option>
            ))}
          </select>
        )}

        {/* Faction filter */}
        {factions.length > 0 && (
          <select value={filterFaction} onChange={e => setFilterFaction(e.target.value)} className="field w-full px-2 py-1.5 text-xs">
            <option value="">All factions</option>
            <option value="__none__">No faction</option>
            {factions.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        )}

        {/* Active filter indicator + clear */}
        {activeFilters > 0 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-[var(--accent)]">{filtered.length} of {characters.length} shown</span>
            <button
              type="button"
              onClick={() => { setFilterFamily(''); setFilterFaction('') }}
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}

        {characters.length === 0 && (
          <div className="px-4 py-6 text-center space-y-1">
            <p className="text-sm text-[var(--text-main)]">No characters yet.</p>
            <p className="text-xs text-[var(--text-muted)]">Add your cast using the New button above.</p>
          </div>
        )}
        {characters.length > 0 && filtered.length === 0 && (
          <div className="px-4 py-4 text-center">
            <p className="text-xs text-[var(--text-muted)]">No matches. Try adjusting your search or filters.</p>
          </div>
        )}

        {filtered.map(c => (
          <StudioRecord
            key={c.id}
            onClick={() => { setSelectedCharacterId(c.id); setProfileTab('overview') }}
            active={selectedCharacterId === c.id}
          >
            <div className="flex items-center gap-2.5">
              {c.image ? (
                <CharacterPortrait
                  src={c.image}
                  position={c.imagePosition}
                  zoom={c.imageZoom}
                  className="w-8 h-8 rounded-full flex-shrink-0 border border-[var(--border)]"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[var(--accent-fade)] border border-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-[var(--accent)]">{c.name.charAt(0)}</span>
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-[var(--text-main)]">{c.name}</div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{c.role || 'Supporting'}</div>
              </div>
            </div>
          </StudioRecord>
        ))}
      </StudioIndex>

      <StudioDetail>
        {!selected ? (
          <StudioEmpty
            title="Select a dossier"
            body="Choose a character from the characters list or add someone new."
            action={<StudioButton tone="primary" className="mt-4" onClick={() => { setEditTarget(null); setShowForm(true); }}>Add Character</StudioButton>}
          />
        ) : (
          <div className="max-w-5xl">
            <StudioPageHeader
              eyebrow="Character dossier"
              title={selected.name}
              meta={[selected.role, selectedAge ? `Age ${selectedAge}` : null].filter(Boolean).join(' · ') || 'Character'}
              actions={(
                <>
                  <StudioButton tone="secondary" size="sm" onClick={() => { setEditTarget(selected); setShowForm(true); }}>Edit</StudioButton>
                  <StudioButton tone="secondary" size="sm" onClick={() => {
                    if (!confirm('Delete this character?')) return
                    const scope = confirm('Delete this character from every synced project too?\n\nOK = every synced project\nCancel = current project only') ? 'all' : 'current'
                    deleteCharacter(selected.id, { scope })
                    setSelectedCharacterId(null)
                  }}>Delete</StudioButton>
                </>
              )}
            >
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {selected.image && (
                  <CharacterPortrait
                    src={selected.image}
                    position={selected.imagePosition}
                    zoom={selected.imageZoom}
                    className="w-24 h-24 rounded-xl border border-[var(--border)] flex-shrink-0"
                  />
                )}
                {getFactionIconUrl(selected) && (
                  <img src={getFactionIconUrl(selected)} alt="Faction Icon" className="w-10 h-10 opacity-60 flex-shrink-0" />
                )}
                {selected.familyGroup && (
                  <span className="chip">House {selected.familyGroup}</span>
                )}
                {selected.factionId && factions.find(f => f.id === selected.factionId) && (
                  <span className="chip chip-accent">
                    {factions.find(f => f.id === selected.factionId).name}
                  </span>
                )}
                {selected.species && <span className="chip">{selected.species}</span>}
                {selected.titleJob && <span className="chip">{selected.titleJob}</span>}
              </div>
            </StudioPageHeader>
            <div className="mb-5">
              <TabStrip tabs={profileTabs} activeTab={activeProfileTab} onChange={setProfileTab} />
            </div>

            <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
              {activeProfileTab === 'overview' && (
                <>
                  <StudioNote>
                    <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">Profile Details</h3>
                    <div className="space-y-3 text-sm">
                      <DetailLine label="Name" value={selected.name} />
                      <DetailLine label="Alias" value={selected.keywords?.join(', ')} />
                      <DetailLine label="Role" value={selected.role} />
                      <DetailLine label="Species" value={selected.species} />
                      <DetailLine label="Title / Job" value={selected.titleJob} />
                      <DetailLine label="Family Group" value={selected.familyGroup} />
                      <DetailLine label="Birth Year" value={selected.birthDate} />
                      <DetailLine label="Death Date" value={selected.deathDate} />
                      <DetailLine label="Age" value={selectedAge} />
                    </div>
                  </StudioNote>
                  <StudioNote>
                    <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-4">Character Bio</h3>
                    <p className="text-[var(--text-main)] whitespace-pre-wrap leading-relaxed text-lg">{selected.bio || "No biography provided."}</p>
                  </StudioNote>
                </>
              )}

              {activeProfileTab === 'relationships' && (
                <>
                  <StudioNote className="lg:col-span-2">
                    <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">Family Links</h3>
                    <div className="grid gap-3 md:grid-cols-3">
                      <LinkedNames label="Parents" items={selectedParents} />
                      <LinkedNames label="Children" items={selectedChildren} />
                      <LinkedNames label="Spouses / Partners" items={selectedSpouses} />
                    </div>
                  </StudioNote>
                  <StudioNote className="lg:col-span-2">
                    <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">Relationship Links</h3>
                    {selectedRelationships.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">No relationship links added.</p>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {selectedRelationships.map(rel => (
                          <DetailBlock key={`${rel.targetId}-${rel.type}`} label={rel.label} value={rel.target.name} />
                        ))}
                      </div>
                    )}
                  </StudioNote>
                  {(incomingRefs.lore.length > 0 || incomingRefs.timeline.length > 0) && (
                    <StudioNote className="lg:col-span-2">
                      <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">Referenced in</h3>
                      {incomingRefs.lore.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-[var(--text-muted)] mb-1.5">Lore</div>
                          <div className="flex flex-wrap gap-1">
                            {incomingRefs.lore.map(e => (
                              <button key={e.id} className="chip hover:border-[var(--accent)] hover:text-[var(--accent)]" onClick={() => setSelectedLoreEntryId(e.id)}>
                                {e.title}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {incomingRefs.timeline.length > 0 && (
                        <div>
                          <div className="text-xs text-[var(--text-muted)] mb-1.5">Timeline / History</div>
                          <div className="flex flex-wrap gap-1">
                            {incomingRefs.timeline.map(e => (
                              <span key={e.id} className="chip">{e.title}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </StudioNote>
                  )}
                </>
              )}

              {activeProfileTab === 'journey' && (
                <CharacterJourney
                  character={selected}
                  characters={characters}
                  timeline={timeline}
                  chapters={chapters}
                  scenes={scenes}
                  onSave={data => saveCharacterJourney(selected.id, data.journey)}
                />
              )}

              {activeProfileTab === 'traits' && (
                <StudioNote className="lg:col-span-2">
                  <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-4">Character Traits</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {TRAIT_FIELDS.map(([field, label]) => (
                      <DetailBlock key={field} label={label} value={selected.traits?.[field]} />
                    ))}
                  </div>
                  {selected.extraAbilities?.length > 0 && (
                    <>
                      <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mt-6 mb-4">Extra Abilities</h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        {selected.extraAbilities.map((ability, index) => (
                          <DetailBlock key={`${ability.name || 'ability'}-${index}`} label={ability.name || `Ability ${index + 1}`} value={ability.description} />
                        ))}
                      </div>
                    </>
                  )}
                </StudioNote>
              )}

              {activeProfileTab === 'background' && (
                <StudioNote className="lg:col-span-2">
                  <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-4">Background</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {BACKGROUND_FIELDS.map(([field, label]) => (
                      <DetailBlock key={field} label={label} value={selected.background?.[field]} />
                    ))}
                  </div>
                </StudioNote>
              )}

            </div>
          </div>
        )}
      </StudioDetail>

      {showForm && (
        <Modal title={editTarget ? `Edit ${editTarget.name}` : "Create Character"} onClose={() => setShowForm(false)} wide centered>
          <CharacterForm
            initial={editTarget}
            onSave={handleSave}
            onCancel={() => setShowForm(false)}
            factions={factions}
            characters={characters}
            currentYear={currentYear}
          />
        </Modal>
      )}
    </StudioSplit>
  )
}
