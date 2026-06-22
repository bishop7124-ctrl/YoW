import { useState } from 'react'

const INPUT = 'field w-full px-3 py-2 text-sm placeholder:text-[var(--text-muted)]'
const LABEL = 'block form-label mb-1'

export default function EraManager({ eras = [], addEra, updateEra, deleteEra }) {
  const [editingId, setEditingId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  const sorted = [...eras].sort((a, b) => (a.startYear ?? Infinity) - (b.startYear ?? Infinity))

  return (
    <div className="space-y-4 min-w-[340px]">
      {sorted.length === 0 && !showAdd && (
        <p className="text-xs text-[var(--text-muted)] text-center py-4">No eras defined yet. Add one to group history entries chronologically.</p>
      )}

      {sorted.map(era => (
        editingId === era.id
          ? <EraForm
              key={era.id}
              initial={era}
              onSave={(data) => { updateEra(era.id, data); setEditingId(null) }}
              onCancel={() => setEditingId(null)}
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
                onClick={() => setEditingId(era.id)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] px-2 py-1 rounded hover:bg-[var(--bg-nav)] transition-colors"
              >Edit</button>
              <button
                onClick={() => { if (confirm(`Delete era "${era.name}"? Entries will become unassigned.`)) deleteEra(era.id) }}
                className="text-xs text-[var(--text-muted)] hover:text-red-400 px-2 py-1 rounded hover:bg-[var(--bg-nav)] transition-colors"
              >Delete</button>
            </div>
          )
      ))}

      {showAdd
        ? <EraForm
            onSave={(data) => { addEra(data); setShowAdd(false) }}
            onCancel={() => setShowAdd(false)}
          />
        : (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full text-sm text-[var(--accent)] border border-dashed border-[var(--accent)]/40 rounded py-2 hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 transition-colors"
          >+ Add Era</button>
        )
      }
    </div>
  )
}

function EraForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [startYear, setStartYear] = useState(initial?.startYear ?? '')
  const [endYear, setEndYear] = useState(initial?.endYear ?? '')

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      startYear: startYear !== '' ? parseInt(startYear, 10) : null,
      endYear: endYear !== '' ? parseInt(endYear, 10) : null,
    })
  }

  return (
    <form onSubmit={submit} className="border border-[var(--accent)]/30 rounded p-3 space-y-3 bg-[var(--bg-main)]">
      <div>
        <label className={LABEL}>Era name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. The Second Age" className={INPUT} required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Start year</label>
          <input type="number" value={startYear} onChange={e => setStartYear(e.target.value)} placeholder="e.g. −500" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>End year</label>
          <input type="number" value={endYear} onChange={e => setEndYear(e.target.value)} placeholder="e.g. 1200" className={INPUT} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary text-sm">Save</button>
        <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">Cancel</button>
      </div>
    </form>
  )
}
