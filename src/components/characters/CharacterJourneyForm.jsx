import { useState } from 'react'
import Modal from '../shared/Modal'
import { StudioButton } from '../presentation/Studio'
import { ARC_TYPE_OPTIONS, normalizeJourney } from '../../utils/characterJourney'

const INPUT = 'field w-full px-3 py-2 text-sm placeholder:text-[var(--text-muted)]'
const LABEL = 'block form-label mb-1.5'

const groups = [
  {
    title: 'Where the journey begins',
    help: 'Capture the inner weather they carry into the story.',
    fields: [
      ['startingState', 'Starting state', 'Who are they when we first meet them?'],
      ['coreWound', 'Core wound', 'What hurt still shapes their choices?'],
      ['fear', 'Core fear', 'What are they most afraid will happen?'],
      ['lieBelieved', 'The lie they believe', 'The mistaken belief holding them back.'],
      ['want', 'What they want', 'The visible thing they pursue.'],
      ['fatalFlaw', 'Fatal flaw', 'The pattern most likely to undo them.'],
      ['strength', 'Strength', 'What helps them endure or change?'],
    ],
  },
  {
    title: 'The change beneath the plot',
    help: 'Name the pressure, lesson, and destination of the arc.',
    fields: [
      ['endingState', 'Ending state', 'Who have they become by the end?'],
      ['truthLearned', 'Truth they need to learn', 'The truth that can replace the lie.'],
      ['need', 'What they need', 'What will actually make them whole or honest?'],
      ['internalConflict', 'Internal conflict', 'The struggle happening inside them.'],
      ['externalConflict', 'External conflict', 'The outside force opposing them.'],
      ['notes', 'Journey notes', 'Loose thoughts, themes, contradictions, or possibilities.'],
    ],
  },
  {
    title: 'Before & after',
    help: 'Use these when the beginning and ending need more precision than the overview above.',
    fields: [
      ['beginningBelief', 'Beginning belief', 'How do they understand the world at the start?'],
      ['endingBelief', 'Ending belief', 'What do they believe by the end?'],
      ['beginningGoal', 'Beginning goal', 'What are they pursuing at first?'],
      ['endingGoal', 'Ending goal', 'What matters to them by the end?'],
      ['beginningFear', 'Beginning fear', 'How does the fear first appear?'],
      ['endingFear', 'Changed or resolved fear', 'How has their relationship to the fear changed?'],
      ['beginningRelationships', 'Beginning relationship to self & others', 'How do they connect, trust, or protect themselves?'],
      ['endingRelationships', 'Ending relationship to self & others', 'What has shifted in how they relate?'],
    ],
  },
]

export default function CharacterJourneyForm({ character, onSave, onClose }) {
  const [form, setForm] = useState(() => normalizeJourney(character.journey))
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }))

  return (
    <Modal title={`Shape ${character.name}'s journey`} onClose={onClose} wide centered>
      <form className="space-y-6" onSubmit={event => { event.preventDefault(); onSave(form) }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className={LABEL}>Arc type</span>
            <select className={INPUT} value={form.arcType} onChange={event => set('arcType', event.target.value)}>
              {ARC_TYPE_OPTIONS.map(option => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span className={LABEL}>Journey scope</span>
            <select className={INPUT} value={form.scope} onChange={event => set('scope', event.target.value)}>
              <option value="project">This project</option>
              <option value="series">Across the series</option>
            </select>
            <span className="mt-1 block text-[11px] text-[var(--text-muted)]">A label for your intent; series character syncing still follows YOW’s normal forward-sync rules.</span>
          </label>
        </div>

        {groups.map(group => (
          <section key={group.title} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
            <h3 className="font-serif text-lg text-[var(--text-main)]">{group.title}</h3>
            <p className="mb-4 text-xs text-[var(--text-muted)]">{group.help}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {group.fields.map(([field, label, placeholder]) => (
                <label key={field} className={field === 'notes' ? 'md:col-span-2' : ''}>
                  <span className={LABEL}>{label}</span>
                  <textarea className={`${INPUT} min-h-24 resize-y`} value={form[field]} onChange={event => set(field, event.target.value)} placeholder={placeholder} />
                </label>
              ))}
            </div>
          </section>
        ))}

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <StudioButton type="button" tone="secondary" onClick={onClose}>Cancel</StudioButton>
          <StudioButton type="submit" tone="primary">Save journey</StudioButton>
        </div>
      </form>
    </Modal>
  )
}
