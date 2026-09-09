import { useState } from 'react'
import { StudioSheet } from '../presentation/Studio.jsx'
import {
  SESSION_PLAN_FIELDS,
  SESSION_RECAP_FIELDS,
  normalizeOutlineItem,
} from '../../utils/outlineDisplay.js'

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const CAMPAIGN_TYPES = new Set(['dnd_campaign', 'tabletop_rpg'])

const itemLabel = (type, labels) => ({
  act: labels.level1,
  chapter: labels.level2,
  scene: labels.level3,
})[type]

export default function OutlineItemEditor({ type, item, store, labels, indicators, onClose, onSaved }) {
  const [initial] = useState(() => normalizeOutlineItem(item, type))
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const label = itemLabel(type, labels)
  const isCampaignChapter = type === 'chapter' && CAMPAIGN_TYPES.has(store.activeNovel?.type)
  const fields = ['title', 'synopsis', 'storyEvent', ...(isCampaignChapter ? ['sessionPlan', 'sessionRecap'] : [])]
  const change = field => event => setForm(current => ({ ...current, [field]: event.target.value }))
  const changeSession = (group, key) => event => setForm(current => ({
    ...current,
    [group]: { ...current[group], [key]: event.target.value },
  }))

  const submit = event => {
    event.preventDefault()
    setError('')
    const prepared = {
      ...form,
      title: form.title.trim() || label,
      synopsis: form.synopsis,
      storyEvent: form.storyEvent || '',
    }
    const data = Object.fromEntries(fields.filter(field => !same(prepared[field], initial[field])).map(field => [field, prepared[field]]))
    if (!Object.keys(data).length) { onClose(); return }
    const expected = Object.fromEntries(Object.keys(data).map(field => [field, initial[field]]))
    const action = type === 'act' ? store.updateAct : type === 'chapter' ? store.updateChapter : store.updateScene
    const saved = action(item.id, data, { expected })
    if (!saved) {
      setError(`This ${label.toLowerCase()} could not be saved or changed elsewhere. Your draft is still here.`)
      return
    }
    event.currentTarget.dispatchEvent(new CustomEvent('studio-form-saved', { bubbles: true }))
    onSaved(saved)
  }

  const remove = () => {
    setError('')
    const action = type === 'act' ? store.deleteAct : type === 'chapter' ? store.deleteChapter : store.deleteScene
    if (!action(item.id)) {
      setError(`This ${label.toLowerCase()} could not be deleted. It may have changed or no longer be editable.`)
      return
    }
    onClose()
  }

  return (
    <StudioSheet title={`Edit ${label.toLowerCase()}`} eyebrow="Outline" onClose={onClose} centered>
      <form data-confirms-save onSubmit={submit} className="space-y-5">
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <label className="block text-sm">
          Title
          <input autoFocus={!store.readOnly} className="field w-full text-base" value={form.title} onChange={change('title')} readOnly={store.readOnly} />
        </label>
        <label className="block text-sm">
          Story event
          <select className="field w-full text-base" value={form.storyEvent} onChange={change('storyEvent')} disabled={store.readOnly}>
            <option value="">None</option>
            {form.storyEvent && !indicators.some(indicator => indicator.id === form.storyEvent) && <option value={form.storyEvent}>{form.storyEvent}</option>}
            {indicators.map(indicator => <option key={indicator.id} value={indicator.id}>{indicator.label}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          Synopsis
          <textarea className="field w-full resize-y text-base" rows={5} value={form.synopsis} onChange={change('synopsis')} readOnly={store.readOnly} />
        </label>

        {isCampaignChapter && <SessionFields title="Plan" group="sessionPlan" fields={SESSION_PLAN_FIELDS} form={form} disabled={store.readOnly} onChange={changeSession} />}
        {isCampaignChapter && <SessionFields title="Recap" group="sessionRecap" fields={SESSION_RECAP_FIELDS} form={form} disabled={store.readOnly} onChange={changeSession} />}

        {confirmDelete && (
          <div role="alertdialog" aria-label={`Confirm ${label.toLowerCase()} deletion`} className="panel-soft space-y-3 p-4">
            <p>Delete “{initial.title || label}”{type === 'act' ? ` and all of its ${labels.level2.toLowerCase()}s and ${labels.level3.toLowerCase()}s` : type === 'chapter' ? ` and all of its ${labels.level3.toLowerCase()}s` : ''}?</p>
            <p className="text-xs text-[var(--text-muted)]">This removes the same record from the manuscript structure and clears affected journey links.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel deletion</button>
              <button type="button" className="btn btn-primary" onClick={remove}>Delete {label.toLowerCase()}</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
          {!store.readOnly && !confirmDelete && <button type="button" className="btn btn-secondary mr-auto" onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button type="button" className="btn btn-secondary">Cancel</button>
          {!store.readOnly && <button type="submit" className="btn btn-primary">Save changes</button>}
        </div>
      </form>
    </StudioSheet>
  )
}

function SessionFields({ title, group, fields, form, disabled, onChange }) {
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-md border border-[var(--border)] p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map(field => (
          <label key={field.key} className="block text-sm">
            {field.label}
            <textarea
              className="field min-h-20 w-full resize-y text-base"
              value={form[group][field.key] || ''}
              onChange={onChange(group, field.key)}
              placeholder={field.placeholder}
            />
          </label>
        ))}
      </div>
    </fieldset>
  )
}
