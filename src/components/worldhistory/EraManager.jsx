import { useId, useMemo, useState } from 'react'
import { parseYearInput, sortTimelineEras } from '../../utils/timelineYear'

const INPUT = 'field w-full px-3 py-2 text-base placeholder:text-[var(--text-muted)]'
const LABEL = 'block form-label mb-1'

export default function EraManager({ eras = [], addEra, updateEra, deleteEra }) {
  const [pendingEditor, setEditor] = useState(null)
  const editor = pendingEditor?.type === 'edit' && !eras.some(era => era.id === pendingEditor.id) ? null : pendingEditor
  const showAdd = editor?.type === 'new'
  const sorted = useMemo(() => sortTimelineEras(eras), [eras])

  return (
    <div className="space-y-4 min-w-0">
      {sorted.length === 0 && !showAdd && (
        <p className="text-xs text-[var(--text-muted)] text-center py-4">No eras defined yet. Add one to group history entries chronologically.</p>
      )}

      {sorted.map(era => (
        editor?.id === era.id
          ? <EraForm
              key={era.id}
              initial={era}
              onSave={(data) => { if (!updateEra(era.id, data)) return false; setEditor(null); return true }}
              onCancel={() => setEditor(null)}
            />
          : (
            <div key={era.id} className="flex items-center gap-2 px-3 py-2.5 rounded border border-[var(--border)] bg-[var(--bg-main)]">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--text-main)]">{era.name}</div>
                {(era.startYear != null || era.endYear != null) && (
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    {era.startYear ?? '?'} – {era.endYear ?? '?'}
                  </div>
                )}
              </div>
              <button
                disabled={Boolean(editor)}
                onClick={() => setEditor({ type: 'edit', id: era.id })}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] px-2 py-1 rounded hover:bg-[var(--bg-nav)] transition-colors"
              >Edit</button>
              <button
                disabled={Boolean(editor)}
                onClick={() => { if (confirm(`Delete era "${era.name}"? Entries will become unassigned.`)) deleteEra(era.id) }}
                className="text-xs text-[var(--text-muted)] hover:text-red-400 px-2 py-1 rounded hover:bg-[var(--bg-nav)] transition-colors"
              >Delete</button>
            </div>
          )
      ))}

      {showAdd
        ? <EraForm
            onSave={(data) => { if (!addEra(data)) return false; setEditor(null); return true }}
            onCancel={() => setEditor(null)}
          />
        : (
          <button
            disabled={Boolean(editor)}
            onClick={() => setEditor({ type: 'new' })}
            className="w-full text-sm text-[var(--accent)] border border-dashed border-[var(--accent)]/40 rounded py-2 hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 transition-colors"
          >+ Add Era</button>
        )
      }
    </div>
  )
}

function EraForm({ initial, onSave, onCancel }) {
  const fieldId = useId()
  const [name, setName] = useState(String(initial?.name ?? ''))
  const [startYear, setStartYear] = useState(initial?.startYear ?? '')
  const [endYear, setEndYear] = useState(initial?.endYear ?? '')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    const start = parseYearInput(startYear)
    const end = parseYearInput(endYear)
    if ((String(startYear).trim() && start === null) || (String(endYear).trim() && end === null)) {
      setError('Enter valid whole-number years.')
      return
    }
    if (start !== null && end !== null && end < start) {
      setError('End year must be the same as or later than the start year.')
      return
    }
    const saved = onSave({
      name: name.trim(),
      startYear: start,
      endYear: end,
    })
    if (saved === false) setError('This era could not be saved. Your draft is still here.')
    else e.currentTarget.dispatchEvent(new CustomEvent('studio-form-saved', { bubbles: true }))
  }

  return (
    <form onSubmit={submit} data-confirms-save className="border border-[var(--accent)]/30 rounded p-3 space-y-3 bg-[var(--bg-main)]">
      <div>
        <label htmlFor={`${fieldId}-name`} className={LABEL}>Era name *</label>
        <input id={`${fieldId}-name`} value={name} onChange={e => { setError(''); setName(e.target.value) }} placeholder="e.g. The Second Age" className={INPUT} required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${fieldId}-start`} className={LABEL}>Start year</label>
          <input id={`${fieldId}-start`} type="number" value={startYear} onChange={e => { setError(''); setStartYear(e.target.value) }} placeholder="e.g. −500" className={INPUT} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-end`} className={LABEL}>End year</label>
          <input id={`${fieldId}-end`} type="number" value={endYear} onChange={e => { setError(''); setEndYear(e.target.value) }} placeholder="e.g. 1200" className={INPUT} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-[var(--text-main)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary text-sm">Save</button>
        <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">Cancel</button>
      </div>
    </form>
  )
}
