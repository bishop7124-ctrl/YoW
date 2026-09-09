import { useState } from 'react'
import { StudioSheet } from '../presentation/Studio'
import { normalizeScheduleEvent, prepareScheduleEvent } from '../../utils/scheduleCalendar.js'

const EDITABLE_FIELDS = ['title', 'description', 'year', 'month', 'day', 'duration', 'category', 'tags', 'linkedCharacters', 'linkedLocations']
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export default function ScheduleEventEditor({ event, date, store, categories, calendar, onClose, onSaved }) {
  const [initial] = useState(() => normalizeScheduleEvent(event || {
    title: '', description: '', year: date.year, month: date.month, day: date.day,
    duration: 1, category: categories[0]?.id || 'other', tags: [], linkedCharacters: [], linkedLocations: [],
  }))
  const [form, setForm] = useState(() => ({ ...initial, tags: initial.tags.join(', ') }))
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editing = Boolean(event)
  const change = field => input => setForm(current => ({ ...current, [field]: input.target.value }))
  const toggle = (field, id) => setForm(current => ({
    ...current,
    [field]: current[field].includes(id) ? current[field].filter(value => value !== id) : [...current[field], id],
  }))

  const submit = submitEvent => {
    submitEvent.preventDefault()
    setError('')
    const prepared = prepareScheduleEvent({ ...form, tags: String(form.tags).split(',') }, calendar)
    if (prepared.error) { setError(prepared.error); return }
    let saved
    if (editing) {
      const data = Object.fromEntries(EDITABLE_FIELDS.filter(field => !same(prepared.event[field], initial[field])).map(field => [field, prepared.event[field]]))
      if (!Object.keys(data).length) { onClose(); return }
      const expected = Object.fromEntries(Object.keys(data).map(field => [field, initial[field]]))
      saved = store.updateScheduleEvent(event.id, data, { expected })
    } else {
      saved = store.addScheduleEvent(prepared.event)
    }
    if (!saved) { setError('This event could not be saved or changed elsewhere. Your draft is still here.'); return }
    submitEvent.currentTarget.dispatchEvent(new CustomEvent('studio-form-saved', { bubbles: true }))
    onSaved(saved)
  }

  const remove = () => {
    setError('')
    if (!store.deleteScheduleEvent(event.id)) { setError('This event could not be deleted. It may have changed or no longer be editable.'); return }
    onClose()
  }

  const missingCharacters = initial.linkedCharacters.filter(id => !store.characters?.some(character => character.id === id))
  const missingLocations = initial.linkedLocations.filter(id => !store.locations?.some(location => location.id === id))

  return (
    <StudioSheet title={editing ? 'Edit event' : 'New event'} eyebrow="Schedule" onClose={onClose} centered>
      <form data-confirms-save onSubmit={submit} className="space-y-5">
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <label className="block text-sm">Title *<input autoFocus={!store.readOnly} className="field w-full text-base" value={form.title} onChange={change('title')} readOnly={store.readOnly} /></label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="block text-sm">Year<input aria-label="Event year" type="number" className="field w-full text-base" value={form.year} onChange={change('year')} readOnly={store.readOnly} /></label>
          <label className="block text-sm">Month<input aria-label="Event month" type="number" min="1" max={calendar.months.length} className="field w-full text-base" value={form.month} onChange={change('month')} readOnly={store.readOnly} /></label>
          <label className="block text-sm">Day<input aria-label="Event day" type="number" min="1" className="field w-full text-base" value={form.day} onChange={change('day')} readOnly={store.readOnly} /></label>
          <label className="block text-sm">Duration<input aria-label="Event duration" type="number" min="1" className="field w-full text-base" value={form.duration} onChange={change('duration')} readOnly={store.readOnly} /></label>
        </div>
        <fieldset disabled={store.readOnly}>
          <legend className="text-sm mb-2">Category</legend>
          <div className="flex flex-wrap gap-2">{categories.map(category => <button key={category.id} type="button" data-dirties-form aria-pressed={form.category === category.id} className={`btn ${form.category === category.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setForm(current => ({ ...current, category: category.id }))}>{category.label}</button>)}</div>
        </fieldset>
        <label className="block text-sm">Description<textarea className="field w-full text-base resize-y" rows={4} value={form.description} onChange={change('description')} readOnly={store.readOnly} /></label>
        <label className="block text-sm">Tags (comma-separated)<input className="field w-full text-base" value={form.tags} onChange={change('tags')} readOnly={store.readOnly} /></label>
        <LinkPicker label="Characters" items={store.characters} selected={form.linkedCharacters} missing={missingCharacters} disabled={store.readOnly} onToggle={id => toggle('linkedCharacters', id)} />
        <LinkPicker label="Locations" items={store.locations} selected={form.linkedLocations} missing={missingLocations} disabled={store.readOnly} onToggle={id => toggle('linkedLocations', id)} />
        {confirmDelete && <div role="alertdialog" aria-label="Confirm event deletion" className="panel-soft p-4 space-y-3"><p>Delete “{initial.title || 'this event'}”? Linked characters and locations will be kept.</p><div className="flex flex-wrap gap-2"><button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel deletion</button><button type="button" className="btn btn-primary" onClick={remove}>Delete event</button></div></div>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
          {editing && !store.readOnly && !confirmDelete && <button type="button" className="btn btn-secondary mr-auto" onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {!store.readOnly && <button type="submit" className="btn btn-primary">{editing ? 'Save changes' : 'Add event'}</button>}
        </div>
      </form>
    </StudioSheet>
  )
}

function LinkPicker({ label, items = [], selected, missing, disabled, onToggle }) {
  if (!items.length && !missing.length) return null
  return <fieldset disabled={disabled}><legend className="text-sm mb-2">{label}</legend><div className="panel-soft max-h-32 overflow-y-auto flex flex-wrap gap-2 p-2">
    {items.map(item => { const active = selected.includes(item.id); return <button key={item.id} type="button" data-dirties-form aria-pressed={active} onClick={() => onToggle(item.id)} className={`rounded-full border px-2.5 py-1 text-xs ${active ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>{active ? '✓ ' : ''}{item.name || 'Untitled'}</button> })}
    {missing.map(id => <button key={id} type="button" data-dirties-form aria-pressed="true" onClick={() => onToggle(id)} className="rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)]">Unavailable {label.toLowerCase().replace(/s$/, '')} ({id}) ×</button>)}
  </div></fieldset>
}
