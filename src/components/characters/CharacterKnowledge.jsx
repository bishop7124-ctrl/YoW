import { useMemo, useState } from 'react'
import Modal from '../shared/Modal'
import { StudioButton, StudioEmpty, StudioNote } from '../presentation/Studio'
import {
  KNOWLEDGE_CONFIDENCE, KNOWLEDGE_VIA, MAX_FACTS_PER_CHARACTER, MAX_FACT_TEXT, normalizeKnowledge, removeFact, sceneChoices, upsertFact,
} from '../../utils/characterKnowledge'

const INPUT = 'field w-full px-3 py-2 text-base placeholder:text-[var(--text-muted)]'
const LABEL = 'block form-label mb-1.5'
const labelOf = (list, value) => list.find(item => item.value === value)?.label || ''

function FactForm({ fact, scenes, events, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    text: fact?.text || '', learnedAtSceneId: fact?.learnedAtSceneId || '', learnedAtEventId: fact?.learnedAtEventId || '',
    via: fact?.via || '', confidence: fact?.confidence || 'believed', usedInSceneIds: fact?.usedInSceneIds || [], note: fact?.note || '',
  }))
  const [error, setError] = useState('')
  const set = field => event => { setError(''); setForm(prev => ({ ...prev, [field]: event.target.value })) }
  const toggleUsed = id => setForm(prev => ({
    ...prev, usedInSceneIds: prev.usedInSceneIds.includes(id) ? prev.usedInSceneIds.filter(item => item !== id) : [...prev.usedInSceneIds, id],
  }))
  const submit = event => {
    event.preventDefault()
    if (!form.text.trim()) { setError('Write what the character knows.'); return }
    if (!onSave({ ...fact, ...form })) setError('This could not be saved. Your changes are still here.')
  }
  return (
    <form data-confirms-save onSubmit={submit} className="space-y-4 text-left" aria-label={fact ? 'Edit what they know' : 'Add what they know'}>
      <div>
        <label htmlFor="kn-text" className={LABEL}>What do they know?</label>
        <textarea id="kn-text" className={`${INPUT} resize-none h-24`} maxLength={MAX_FACT_TEXT} value={form.text} onChange={set('text')} placeholder="e.g. The bridge at Northwatch is mined" autoFocus />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="kn-scene" className={LABEL}>Learns it in scene</label>
          <select id="kn-scene" className={INPUT} value={form.learnedAtSceneId} onChange={set('learnedAtSceneId')}>
            <option value="">Not recorded</option>
            {scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="kn-event" className={LABEL}>Learns it at event</label>
          <select id="kn-event" className={INPUT} value={form.learnedAtEventId} onChange={set('learnedAtEventId')}>
            <option value="">Not recorded</option>
            {events.map(event => <option key={event.id} value={event.id}>{event.title || 'Untitled event'}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="kn-via" className={LABEL}>How</label>
          <select id="kn-via" className={INPUT} value={form.via} onChange={set('via')}>
            {KNOWLEDGE_VIA.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="kn-confidence" className={LABEL}>How sure are they?</label>
          <select id="kn-confidence" className={INPUT} value={form.confidence} onChange={set('confidence')}>
            {KNOWLEDGE_CONFIDENCE.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </div>
      <fieldset>
        <legend className={LABEL}>Scenes where they act on it</legend>
        <div className="max-h-44 overflow-y-auto border border-[var(--border)] rounded p-2 space-y-1">
          {scenes.length === 0 && <p className="text-xs text-[var(--text-muted)] italic">No scenes yet.</p>}
          {scenes.map(scene => (
            <label key={scene.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.usedInSceneIds.includes(scene.id)} onChange={() => toggleUsed(scene.id)} />
              <span>{scene.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="kn-note" className={LABEL}>Note</label>
        <input id="kn-note" className={INPUT} value={form.note} onChange={set('note')} placeholder="Optional" />
      </div>
      {error && <p role="alert" className="text-sm text-[var(--danger,#dc2626)]">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-sm">{fact ? 'Save' : 'Add'}</button>
      </div>
    </form>
  )
}

// What this character knows and when they find out (Release C, C3). Shown only while `character_knowledge` is on.
// Everything here is what the writer typed; Story Check (R17, R18) uses it to flag a scene where the character acts
// on something before the scene where they learn it.
export default function CharacterKnowledge({ character, acts = [], chapters = [], scenes = [], timeline = [], onSave, readOnly = false }) {
  const facts = useMemo(() => normalizeKnowledge(character.knowledge), [character.knowledge])
  const choices = useMemo(() => sceneChoices({ acts, chapters, scenes }), [acts, chapters, scenes])
  const sceneLabel = useMemo(() => new Map(choices.map(choice => [choice.id, choice.label])), [choices])
  const eventTitle = useMemo(() => new Map(timeline.map(event => [event.id, event.title || 'Untitled event'])), [timeline])
  const [editing, setEditing] = useState(null) // null | {} (new) | { fact }
  const [error, setError] = useState('')

  const save = next => {
    if (readOnly || !onSave(next)) { setError('Could not save. Your changes have not been applied.'); return false }
    setError('')
    return true
  }
  const atLimit = facts.length >= MAX_FACTS_PER_CHARACTER

  return (
    <StudioNote className="lg:col-span-2">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest">What {character.name || 'this character'} knows</h3>
        <StudioButton tone="primary" size="sm" disabled={readOnly || atLimit || Boolean(editing)} onClick={() => setEditing({})}>Add</StudioButton>
      </div>
      {error && <p role="alert" className="text-sm text-[var(--danger,#dc2626)] mb-3">{error}</p>}
      {facts.length === 0 ? (
        <StudioEmpty
          title="Nothing recorded yet"
          body="Note what this character knows and the scene where they find out. Story Check will warn you if a scene has them act on it earlier. It only uses what you record here."
        />
      ) : (
        <ul className="space-y-3">
          {facts.map(fact => {
            const learned = fact.learnedAtSceneId ? sceneLabel.get(fact.learnedAtSceneId) : ''
            const learnedEvent = fact.learnedAtEventId ? eventTitle.get(fact.learnedAtEventId) : ''
            const used = fact.usedInSceneIds.map(id => sceneLabel.get(id)).filter(Boolean)
            return (
              <li key={fact.id} className="border border-[var(--border)] rounded-lg p-3 space-y-1.5">
                <p className="font-medium text-[var(--text-main)] break-words">{fact.text}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {learned || learnedEvent ? `Learns it: ${[learned, learnedEvent && `event "${learnedEvent}"`].filter(Boolean).join(', ')}` : 'Where they learn it: not recorded'}
                  {fact.via ? ` · ${labelOf(KNOWLEDGE_VIA, fact.via)}` : ''} · {labelOf(KNOWLEDGE_CONFIDENCE, fact.confidence)}
                </p>
                {used.length > 0 && <p className="text-xs text-[var(--text-muted)]">Acts on it in: {used.join(', ')}</p>}
                {fact.note && <p className="text-xs italic text-[var(--text-muted)]">{fact.note}</p>}
                {!readOnly && (
                  <div className="flex gap-2 pt-1">
                    <StudioButton tone="secondary" size="sm" disabled={Boolean(editing)} onClick={() => setEditing({ fact })}>Edit</StudioButton>
                    <StudioButton tone="secondary" size="sm" disabled={Boolean(editing)} onClick={() => { if (confirm('Remove this?')) save(removeFact(facts, fact.id)) }}>Remove</StudioButton>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {editing && (
        <Modal title={editing.fact ? 'Edit what they know' : 'Add what they know'} onClose={() => setEditing(null)} centered>
          <FactForm
            key={editing.fact?.id || 'new'}
            fact={editing.fact}
            scenes={choices}
            events={timeline}
            onCancel={() => setEditing(null)}
            onSave={data => { if (!save(upsertFact(facts, data))) return false; setEditing(null); return true }}
          />
        </Modal>
      )}
    </StudioNote>
  )
}
