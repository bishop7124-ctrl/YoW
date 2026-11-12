import { useId, useState } from 'react'
import { safeSourceUrl, sourceHost } from '../../utils/references'

const INPUT = 'field w-full px-3 py-2 text-base placeholder:text-[var(--text-muted)]'
const LABEL = 'block form-label mb-1.5'

// Add or edit a reference: a title, where it came from, how to cite it, and the writer's own notes.
export function ReferenceForm({ initial, onSave, onCancel }) {
  const uid = useId()
  const [form, setForm] = useState(() => ({
    title: initial?.title || '',
    sourceUrl: initial?.sourceUrl || '',
    citation: initial?.citation || '',
    content: initial?.content || '',
    tags: (initial?.tags || []).join(', '),
  }))
  const [error, setError] = useState('')
  const set = field => event => { setError(''); setForm(prev => ({ ...prev, [field]: event.target.value })) }

  const submit = event => {
    event.preventDefault()
    if (!form.title.trim()) { setError('Enter a title for this reference.'); return }
    if (form.sourceUrl.trim() && !safeSourceUrl(form.sourceUrl)) { setError('Enter a web address that starts with http:// or https://, or leave it blank.'); return }
    const saved = onSave({
      title: form.title,
      sourceUrl: form.sourceUrl,
      citation: form.citation,
      content: form.content,
      tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
    })
    if (!saved) setError('This reference could not be saved. Your draft is still here.')
  }

  return (
    <form data-confirms-save onSubmit={submit} className="space-y-4 text-left" aria-label={initial ? 'Edit reference' : 'New reference'}>
      <div>
        <label htmlFor={`${uid}-title`} className={LABEL}>Title</label>
        <input id={`${uid}-title`} className={INPUT} value={form.title} onChange={set('title')} placeholder="e.g. Medieval grain storage" required autoFocus />
      </div>
      <div>
        <label htmlFor={`${uid}-url`} className={LABEL}>Source link</label>
        <input id={`${uid}-url`} className={INPUT} value={form.sourceUrl} onChange={set('sourceUrl')} placeholder="https://" inputMode="url" />
      </div>
      <div>
        <label htmlFor={`${uid}-citation`} className={LABEL}>Citation</label>
        <input id={`${uid}-citation`} className={INPUT} value={form.citation} onChange={set('citation')} placeholder="Author, title, year" />
      </div>
      <div>
        <label htmlFor={`${uid}-notes`} className={LABEL}>Notes</label>
        <textarea id={`${uid}-notes`} className={`${INPUT} resize-none h-40`} value={form.content} onChange={set('content')} placeholder="What you learned, quotes, what to check later" />
      </div>
      <div>
        <label htmlFor={`${uid}-tags`} className={LABEL}>Tags</label>
        <input id={`${uid}-tags`} className={INPUT} value={form.tags} onChange={set('tags')} placeholder="Separate with commas" />
      </div>
      {error && <p role="alert" className="text-sm text-[var(--danger,#dc2626)]">{error}</p>}
      <div className="flex gap-2 justify-end">
        {onCancel && <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn btn-primary btn-sm">{initial ? 'Save' : 'Add reference'}</button>
      </div>
    </form>
  )
}

// A reference's content: source link, citation and notes. The link is re-checked at display time, so even an
// address that reached storage some other way (an import, a sync) can never be rendered as anything but http(s).
export function ReferenceBody({ entry }) {
  const href = safeSourceUrl(entry.sourceUrl)
  return (
    <div className="space-y-4">
      {href && (
        <p className="text-sm">
          <span className="text-[var(--text-muted)]">Source: </span>
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] underline break-all">{sourceHost(href) || href}</a>
        </p>
      )}
      {entry.citation && <p className="text-sm"><span className="text-[var(--text-muted)]">Cite as: </span>{entry.citation}</p>}
      {entry.content
        ? <p className="whitespace-pre-wrap break-words leading-relaxed">{entry.content}</p>
        : <p className="italic text-[var(--text-muted)]">No notes yet.</p>}
      {entry.tags?.length > 0 && <div className="flex flex-wrap gap-2">{entry.tags.map(tag => <span key={tag} className="chip">#{tag}</span>)}</div>}
    </div>
  )
}

export const confirmDeleteReference = entry => confirm(`Delete "${entry.title}"?`)
export const confirmConvertReference = entry => confirm(`Move "${entry.title}" into your world's Lore?\n\nIt will then appear in the Lore room, be recognised in your manuscript and be included in exports.`)
