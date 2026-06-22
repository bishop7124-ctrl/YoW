import { useMemo, useState } from 'react'
import Modal from '../shared/Modal'
import { StudioButton } from '../presentation/Studio'
import { STORY_PHASE_OPTIONS } from '../../utils/characterJourney'

const INPUT = 'field w-full px-3 py-2 text-sm placeholder:text-[var(--text-muted)]'
const LABEL = 'block form-label mb-1.5'

const emptyBeat = {
  title: '', description: '', storyPhase: 'Beginning', customPhase: '', emotionalState: '', belief: '', goal: '',
  conflict: '', choiceMade: '', consequence: '', timelineEventId: '', chapterId: '', sceneId: '', linkedCharacterId: '',
  isMajorTurningPoint: false,
}

export default function JourneyBeatModal({ beat, character, characters, timeline, chapters, scenes, onSave, onClose }) {
  const [form, setForm] = useState(() => ({ ...emptyBeat, ...(beat || {}) }))
  const [error, setError] = useState('')
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }))
  const projectCharacters = useMemo(() => characters.filter(item => item.id !== character.id), [characters, character.id])
  const sceneOptions = useMemo(() => scenes.filter(scene => !form.chapterId || scene.chapterId === form.chapterId), [scenes, form.chapterId])

  const submit = event => {
    event.preventDefault()
    if (!form.title.trim()) { setError('Give this journey beat a title.'); return }
    onSave({ ...form, title: form.title.trim() })
  }

  return (
    <Modal title={beat ? 'Edit journey beat' : 'Add journey beat'} onClose={onClose} wide centered>
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className={LABEL}>Beat title *</span>
            <input autoFocus className={INPUT} value={form.title} onChange={event => { set('title', event.target.value); setError('') }} placeholder="The choice at the bridge" />
            {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
          </label>
          <label>
            <span className={LABEL}>Story phase</span>
            <select className={INPUT} value={form.storyPhase} onChange={event => set('storyPhase', event.target.value)}>
              {STORY_PHASE_OPTIONS.map(option => <option key={option}>{option}</option>)}
            </select>
          </label>
          {form.storyPhase === 'Custom' && (
            <label>
              <span className={LABEL}>Custom phase</span>
              <input className={INPUT} value={form.customPhase} onChange={event => set('customPhase', event.target.value)} placeholder="Dark night of the soul" />
            </label>
          )}
          <label className="flex items-center gap-2 self-end rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-main)]">
            <input type="checkbox" checked={form.isMajorTurningPoint} onChange={event => set('isMajorTurningPoint', event.target.checked)} />
            Mark as a major turning point
          </label>
          <label className="md:col-span-2">
            <span className={LABEL}>What happens?</span>
            <textarea className={`${INPUT} min-h-24`} value={form.description} onChange={event => set('description', event.target.value)} placeholder="Describe the story moment and why it matters to this character." />
          </label>
          {[
            ['emotionalState', 'Emotional state', 'Guarded, hopeful, ashamed…'],
            ['belief', 'Belief at this point', 'What do they currently believe?'],
            ['goal', 'Goal at this point', 'What are they trying to achieve now?'],
            ['conflict', 'Conflict or obstacle', 'What stands in their way?'],
            ['choiceMade', 'Choice made', 'What do they decide?'],
            ['consequence', 'Consequence', 'What changes because of that choice?'],
          ].map(([field, label, placeholder]) => (
            <label key={field}>
              <span className={LABEL}>{label}</span>
              <textarea className={`${INPUT} min-h-20`} value={form[field]} onChange={event => set(field, event.target.value)} placeholder={placeholder} />
            </label>
          ))}
        </div>

        <section className="rounded-xl border border-[var(--border)] p-4">
          <h3 className="mb-1 text-sm font-semibold text-[var(--text-main)]">Story links</h3>
          <p className="mb-4 text-xs text-[var(--text-muted)]">Optional links keep the inner journey connected to the events and pages where it happens.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <label><span className={LABEL}>Timeline event</span><select className={INPUT} value={form.timelineEventId} onChange={event => set('timelineEventId', event.target.value)}><option value="">None</option>{timeline.map(item => <option key={item.id} value={item.id}>{item.title || 'Untitled event'}</option>)}</select></label>
            <label><span className={LABEL}>Related character</span><select className={INPUT} value={form.linkedCharacterId} onChange={event => set('linkedCharacterId', event.target.value)}><option value="">None</option>{projectCharacters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span className={LABEL}>Chapter</span><select className={INPUT} value={form.chapterId} onChange={event => setForm(current => ({ ...current, chapterId: event.target.value, sceneId: '' }))}><option value="">None</option>{chapters.map(item => <option key={item.id} value={item.id}>{item.title || 'Untitled chapter'}</option>)}</select></label>
            <label><span className={LABEL}>Scene</span><select className={INPUT} value={form.sceneId} onChange={event => set('sceneId', event.target.value)}><option value="">None</option>{sceneOptions.map(item => <option key={item.id} value={item.id}>{item.title || 'Untitled scene'}</option>)}</select></label>
          </div>
        </section>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <StudioButton type="button" tone="secondary" onClick={onClose}>Cancel</StudioButton>
          <StudioButton type="submit" tone="primary">Save beat</StudioButton>
        </div>
      </form>
    </Modal>
  )
}
