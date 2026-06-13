import { useEffect, useState } from 'react'
import Modal from '../shared/Modal'
import { StudioSplit, StudioIndex, StudioRecord, StudioDetail, StudioButton, StudioEmpty, StudioPageHeader, StudioNote } from '../presentation/Studio'
import ChronicleEntryForm from '../shared/ChronicleEntryForm'

export default function WorldHistory({ store }) {
  const { timeline, characters, locations, addEvent, updateEvent, deleteEvent } = store
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('era-asc')
  const [selectedId, setSelectedId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)

  useEffect(() => {
    const openNewHistoryForm = () => { setEditTarget(null); setShowForm(true) }
    window.addEventListener('open-history-form', openNewHistoryForm)
    return () => window.removeEventListener('open-history-form', openNewHistoryForm)
  }, [])

  const filtered = (timeline || []).filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    (e.era || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.description || e.content || '').toLowerCase().includes(search.toLowerCase())
  )

  const sorter = (a, b) => {
    if (sortBy === 'title-desc') return b.title.localeCompare(a.title)
    return a.title.localeCompare(b.title)
  }

  const groups = filtered.reduce((acc, e) => {
    const era = e.era || 'Unknown Era'
    if (!acc[era]) acc[era] = []
    acc[era].push(e)
    return acc
  }, {})
  Object.keys(groups).forEach(era => groups[era].sort(sorter))
  const grouped = sortBy === 'era-asc'
    ? Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)))
    : sortBy === 'era-desc'
      ? Object.fromEntries(Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)))
      : groups

  const closeForm = () => { setShowForm(false); setEditTarget(null) }

  const handleSave = (data) => {
    if (editTarget) {
      const event = updateEvent(editTarget.id, data)
      setSelectedId(event?.id || editTarget.id)
    } else {
      const event = addEvent(data, { createHistory: false })
      setSelectedId(event.id)
    }
    closeForm()
  }

  const handleDelete = (id) => {
    if (!confirm('Delete this chronicle entry?')) return
    const scope = confirm('Delete this chronicle entry from every synced project too?\n\nOK = every synced project\nCancel = current project only') ? 'all' : 'current'
    deleteEvent(id, { scope })
    if (selectedId === id) setSelectedId(null)
  }

  const liveSelected = selectedId ? (timeline || []).find(e => e.id === selectedId) : null

  return (
    <StudioSplit>
      <StudioIndex
        eyebrow="Chronicle wall"
        title="History"
        tools={<StudioButton tone="primary" size="sm" onClick={() => { setEditTarget(null); setShowForm(true) }}>New</StudioButton>}
      >
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="field w-full px-2.5 py-1.5 text-xs placeholder:text-[var(--text-muted)]"
        />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="field w-full px-2 py-1.5 text-xs">
          <option value="title-asc">Title A→Z</option>
          <option value="title-desc">Title Z→A</option>
          <option value="era-asc">Era A→Z</option>
          <option value="era-desc">Era Z→A</option>
        </select>

        {filtered.length === 0 && (timeline || []).length === 0 && (
          <div className="p-4 text-center space-y-2">
            <p className="text-[var(--text-muted)] text-xs">No chronicle entries yet.</p>
            <p className="text-[var(--text-muted)] text-[10px] leading-relaxed">
              Add world-building events — ages, eras, wars, founding myths — using the New button above.
            </p>
          </div>
        )}
        {filtered.length === 0 && (timeline || []).length > 0 && (
          <p className="text-[var(--text-muted)] text-xs p-4 text-center">No matches.</p>
        )}

        {Object.entries(grouped).map(([era, entries]) => (
          <div key={era}>
            <div className="px-3 py-1.5 text-xs font-medium text-[var(--accent)]/60 uppercase tracking-wider border-b border-[var(--border)] bg-[var(--bg-nav)]/50 sticky top-0">
              {era}
            </div>
            {entries.map(e => (
              <StudioRecord
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                active={liveSelected?.id === e.id}
              >
                <div className="text-sm font-medium text-[var(--text-main)] truncate">{e.title}</div>
                {e.date && <div className="text-xs text-[var(--text-muted)] mt-0.5">{e.date}</div>}
              </StudioRecord>
            ))}
          </div>
        ))}
      </StudioIndex>

      <StudioDetail>
        {!liveSelected ? (
          <StudioEmpty
            title="Select a chronicle entry"
            body="Choose a period from the history wall or create a new one."
          />
        ) : (
          <div className="max-w-4xl">
            <StudioPageHeader
              eyebrow="Historical record"
              title={liveSelected.title}
              actions={(
                <>
                  <StudioButton tone="secondary" size="sm" onClick={() => { setEditTarget(liveSelected); setShowForm(true) }}>Edit</StudioButton>
                  <StudioButton tone="secondary" size="sm" onClick={() => handleDelete(liveSelected.id)}>Delete</StudioButton>
                </>
              )}
            >
              <div className="flex items-center gap-3 mt-1.5">
                {liveSelected.era && <span className="text-xs text-[var(--accent)]">{liveSelected.era}</span>}
                {liveSelected.date && <span className="text-xs text-[var(--text-muted)]">{liveSelected.date}</span>}
              </div>
            </StudioPageHeader>

            {(liveSelected.description || liveSelected.content) && (
              <StudioNote className="text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap mb-4">
                {liveSelected.description || liveSelected.content}
              </StudioNote>
            )}

            {liveSelected.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-3 border-t border-[var(--border)]">
                {liveSelected.tags.map(t => (
                  <span key={t} className="bg-[var(--bg-nav)] border border-[var(--border)] text-[var(--text-muted)] text-xs px-2 py-0.5 rounded">{t}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </StudioDetail>

      {showForm && (
        <Modal title={editTarget ? `Edit — ${editTarget.title}` : 'New History Entry'} onClose={closeForm} wide>
          <ChronicleEntryForm
            kind="worldhistory"
            initial={editTarget}
            characters={characters}
            locations={locations}
            onSave={handleSave}
            onCancel={closeForm}
          />
        </Modal>
      )}
    </StudioSplit>
  )
}
