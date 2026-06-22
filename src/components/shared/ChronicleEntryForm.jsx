import { useState, useEffect } from 'react'

const INPUT = 'field w-full px-3 py-2 text-sm placeholder:text-[var(--text-muted)]'
const LABEL = 'block form-label mb-1.5'

const unique = values => Array.from(new Set((values || []).filter(Boolean)))

export default function ChronicleEntryForm({
  kind = 'timeline',
  initial,
  characters = [],
  locations = [],
  eras = [],
  onSave,
  onCancel,
}) {
  const isWorldHistory = kind === 'worldhistory'

  const [form, setForm] = useState({
    title: initial?.title ?? '',
    date: initial?.date ?? initial?.dateRange ?? '',
    startYear: initial?.startYear != null ? String(initial.startYear) : '',
    endYear: initial?.endYear != null ? String(initial.endYear) : '',
    era: initial?.era ?? '',
    eraId: initial?.eraId ?? '',
    description: initial?.description ?? initial?.content ?? '',
    type: initial?.type ?? initial?.category ?? '',
    tags: initial?.tags ?? [],
    linkedCharacters: initial?.linkedCharacters ?? [],
    linkedLocations: initial?.linkedLocations ?? [],
  })
  const [tagInput, setTagInput] = useState('')
  const [eraManuallySet, setEraManuallySet] = useState(!!initial?.eraId)

  const sortedEras = [...eras].sort((a, b) => (a.startYear ?? Infinity) - (b.startYear ?? Infinity))

  const field = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const findEraForYear = (year) => {
    if (year == null || !Number.isFinite(year)) return ''
    const match = sortedEras.find(er => {
      const start = er.startYear ?? -Infinity
      const end = er.endYear ?? Infinity
      return year >= start && year <= end
    })
    return match?.id ?? ''
  }

  // Auto-assign era when startYear changes (unless user has manually picked one)
  useEffect(() => {
    if (eraManuallySet) return
    const year = form.startYear !== '' ? parseInt(form.startYear, 10) : null
    const autoId = year != null && Number.isFinite(year) ? findEraForYear(year) : ''
    setForm(prev => ({ ...prev, eraId: autoId }))
  }, [form.startYear]) // eslint-disable-line react-hooks/exhaustive-deps

  // For timeline: also auto-assign from date free text
  useEffect(() => {
    if (isWorldHistory || eraManuallySet) return
    const match = form.date.match(/-?\d+/)
    const year = match ? parseInt(match[0], 10) : null
    const autoId = year != null && Number.isFinite(year) ? findEraForYear(year) : ''
    setForm(prev => ({ ...prev, eraId: autoId }))
  }, [form.date]) // eslint-disable-line react-hooks/exhaustive-deps

  const addTag = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const tag = tagInput.trim().replace(/,$/, '')
      if (tag) setForm(prev => ({ ...prev, tags: unique([...prev.tags, tag]) }))
      setTagInput('')
    }
  }

  const toggle = (key, id) => setForm(prev => ({
    ...prev,
    [key]: prev[key].includes(id) ? prev[key].filter(x => x !== id) : [...prev[key], id],
  }))

  const submit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    if (isWorldHistory && form.startYear.trim() === '') return
    const selectedEra = eras.find(er => er.id === form.eraId)
    const startYear = form.startYear !== '' ? parseInt(form.startYear, 10) : null
    const endYear = form.endYear !== '' ? parseInt(form.endYear, 10) : null
    onSave({
      title: form.title.trim(),
      // worldhistory uses startYear/endYear; timeline uses date
      ...(isWorldHistory
        ? { startYear, endYear, date: startYear != null ? String(startYear) : form.date }
        : { date: form.date, dateRange: form.date }
      ),
      era: selectedEra?.name ?? form.era,
      eraId: form.eraId || null,
      description: form.description,
      content: form.description,
      type: form.type,
      category: form.type,
      tags: form.tags,
      linkedCharacters: form.linkedCharacters,
      linkedLocations: form.linkedLocations,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className={LABEL}>Title *</label>
        <input value={form.title} onChange={field('title')} className={INPUT} required />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Era</label>
          {sortedEras.length > 0 ? (
            <select value={form.eraId} onChange={e => { setEraManuallySet(true); field('eraId')(e) }} className={INPUT}>
              <option value="">— None —</option>
              {sortedEras.map(er => (
                <option key={er.id} value={er.id}>{er.name}</option>
              ))}
            </select>
          ) : (
            <input value={form.era} onChange={field('era')} placeholder="e.g. The Second Age" className={INPUT} />
          )}
        </div>

        {isWorldHistory ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Start year *</label>
              <input
                type="number"
                value={form.startYear}
                onChange={field('startYear')}
                placeholder="e.g. −500"
                className={INPUT}
                required
              />
            </div>
            <div>
              <label className={LABEL}>End year</label>
              <input
                type="number"
                value={form.endYear}
                onChange={field('endYear')}
                placeholder="optional"
                className={INPUT}
              />
            </div>
          </div>
        ) : (
          <div>
            <label className={LABEL}>Date / Time</label>
            <input value={form.date} onChange={field('date')} placeholder="e.g. Year 312, First Month" className={INPUT} />
          </div>
        )}
      </div>

      <div>
        <label className={LABEL}>Category / Type</label>
        <input value={form.type} onChange={field('type')} placeholder="War, founding, journey…" className={INPUT} />
      </div>

      <div>
        <label className={LABEL}>{isWorldHistory ? 'Content' : 'Description'}</label>
        <textarea
          value={form.description}
          onChange={field('description')}
          rows={isWorldHistory ? 8 : 5}
          className={INPUT + ' resize-none'}
        />
      </div>

      <div>
        <label className={LABEL}>Tags</label>
        {form.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {form.tags.map(tag => (
              <span key={tag} className="chip">
                {tag}
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, tags: prev.tags.filter(x => x !== tag) }))}
                  className="text-[var(--text-muted)] hover:text-[var(--text-main)]"
                >×</button>
              </span>
            ))}
          </div>
        )}
        <input
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={addTag}
          placeholder="Type a tag and press Enter"
          className={INPUT}
        />
      </div>

      {characters.length > 0 && (
        <div>
          <label className={LABEL}>Linked characters</label>
          <div className="panel-soft max-h-32 overflow-y-auto flex flex-wrap gap-2 p-2">
            {characters.map(char => {
              const active = form.linkedCharacters.includes(char.id)
              return (
                <button key={char.id} type="button" onClick={() => toggle('linkedCharacters', char.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${active ? 'bg-[var(--accent-fade)] border-[var(--accent)]/40 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                  {active && <span>✓</span>}{char.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {locations.length > 0 && (
        <div>
          <label className={LABEL}>Linked locations</label>
          <div className="panel-soft max-h-32 overflow-y-auto flex flex-wrap gap-2 p-2">
            {locations.map(location => {
              const active = form.linkedLocations.includes(location.id)
              return (
                <button key={location.id} type="button" onClick={() => toggle('linkedLocations', location.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${active ? 'bg-[var(--accent-fade)] border-[var(--accent)]/40 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                  {active && <span>✓</span>}{location.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1 border-t border-[var(--border)]">
        <button type="submit" className="btn btn-primary">Save</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-[var(--text-muted)] hover:text-[var(--text-main)] text-sm transition-colors">Cancel</button>
      </div>
    </form>
  )
}
