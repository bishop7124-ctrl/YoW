import { useEffect, useState } from 'react'
import Modal from '../shared/Modal'
import { StudioSplit, StudioIndex, StudioRecord, StudioDetail, StudioButton, StudioEmpty, StudioPageHeader, StudioNote } from '../presentation/Studio'
import ChronicleEntryForm from '../shared/ChronicleEntryForm'
import EraManager from './EraManager'

export default function WorldHistory({ store }) {
  const { timeline, characters, locations, addEvent, updateEvent, deleteEvent, setSelectedCharacterId, setSelectedLocationId, selectedTimelineEventId, setSelectedTimelineEventId, eras, addEra, updateEra, deleteEra } = store
  const [search, setSearch] = useState('')
  const selectedId = selectedTimelineEventId
  const setSelectedId = setSelectedTimelineEventId
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [showEraManager, setShowEraManager] = useState(false)

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

  const parseYear = (e) => {
    if (e.startYear != null) return e.startYear
    const match = (e.date || '').match(/-?\d+/)
    return match ? parseInt(match[0], 10) : Infinity
  }

  // Sort eras by startYear, then entries within each era by year
  const sortedEras = [...(eras || [])].sort((a, b) => (a.startYear ?? Infinity) - (b.startYear ?? Infinity))

  // Group entries: matched by eraId first, fallback to era string name, then unassigned
  const eraMap = {}
  const unassigned = []

  for (const e of filtered) {
    if (e.eraId) {
      if (!eraMap[e.eraId]) eraMap[e.eraId] = []
      eraMap[e.eraId].push(e)
    } else if (e.era) {
      // legacy string era — show under "Other"
      if (!eraMap['__other__']) eraMap['__other__'] = []
      eraMap['__other__'].push(e)
    } else {
      unassigned.push(e)
    }
  }

  // Sort entries within each group by year
  const sortGroup = (arr) => [...arr].sort((a, b) => parseYear(a) - parseYear(b))

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
  const selectedEra = liveSelected?.eraId ? (eras || []).find(er => er.id === liveSelected.eraId) : null

  return (
    <StudioSplit>
      <StudioIndex
        eyebrow="Chronicle wall"
        title="History"
        data-tour="worldhistory-header"
        tools={
          <div className="flex gap-1">
            <StudioButton tone="secondary" size="sm" onClick={() => setShowEraManager(true)}>Eras</StudioButton>
            <StudioButton tone="primary" size="sm" data-tour="worldhistory-new" onClick={() => { setEditTarget(null); setShowForm(true) }}>New</StudioButton>
          </div>
        }
      >
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="field w-full px-2.5 py-1.5 text-xs placeholder:text-[var(--text-muted)]"
        />

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

        {/* Era-grouped timeline */}
        {sortedEras.map(era => {
          const entries = eraMap[era.id] ?? []
          return (
            <EraSection
              key={era.id}
              label={era.name}
              range={era.startYear != null || era.endYear != null ? `${era.startYear ?? '?'} – ${era.endYear ?? '?'}` : null}
              entries={sortGroup(entries)}
              selectedId={liveSelected?.id}
              onSelect={setSelectedId}
            />
          )
        })}

        {eraMap['__other__']?.length > 0 && (
          <EraSection
            label="Other"
            entries={sortGroup(eraMap['__other__'])}
            selectedId={liveSelected?.id}
            onSelect={setSelectedId}
          />
        )}

        {unassigned.length > 0 && (
          <EraSection
            label="Unassigned"
            entries={sortGroup(unassigned)}
            selectedId={liveSelected?.id}
            onSelect={setSelectedId}
          />
        )}
      </StudioIndex>

      <StudioDetail>
        {!liveSelected ? (
          <StudioEmpty
            title="Select a chronicle entry"
            body="Choose a period from the history wall or create a new one."
            action={<StudioButton tone="primary" className="mt-4" onClick={() => { setEditTarget(null); setShowForm(true) }}>Add Entry</StudioButton>}
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
                {selectedEra && <span className="text-xs text-[var(--accent)]">{selectedEra.name}</span>}
                {liveSelected.startYear != null ? (
                  <span className="text-xs text-[var(--text-muted)]">
                    {liveSelected.endYear != null ? `${liveSelected.startYear} – ${liveSelected.endYear}` : String(liveSelected.startYear)}
                  </span>
                ) : liveSelected.date ? (
                  <span className="text-xs text-[var(--text-muted)]">{liveSelected.date}</span>
                ) : null}
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

            {liveSelected.linkedCharacters?.length > 0 && (
              <div className="pt-3 border-t border-[var(--border)]">
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Characters</div>
                <div className="flex flex-wrap gap-1">
                  {liveSelected.linkedCharacters.map(id => {
                    const c = characters.find(x => x.id === id)
                    if (!c) return null
                    return (
                      <button key={id} className="chip hover:border-[var(--accent)] hover:text-[var(--accent)]" onClick={() => setSelectedCharacterId(id)}>
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {liveSelected.linkedLocations?.length > 0 && (
              <div className="pt-3 border-t border-[var(--border)]">
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Locations</div>
                <div className="flex flex-wrap gap-1">
                  {liveSelected.linkedLocations.map(id => {
                    const l = locations.find(x => x.id === id)
                    if (!l) return null
                    return (
                      <button key={id} className="chip hover:border-[var(--accent)] hover:text-[var(--accent)]" onClick={() => setSelectedLocationId(id)}>
                        {l.name}
                      </button>
                    )
                  })}
                </div>
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
            eras={eras}
            onSave={handleSave}
            onCancel={closeForm}
          />
        </Modal>
      )}

      {showEraManager && (
        <Modal title="Manage Eras" onClose={() => setShowEraManager(false)}>
          <EraManager eras={eras} addEra={addEra} updateEra={updateEra} deleteEra={deleteEra} />
        </Modal>
      )}
    </StudioSplit>
  )
}

function EraSection({ label, range, entries, selectedId, onSelect }) {
  return (
    <div>
      <div className="px-3 py-1.5 flex items-baseline gap-2 border-b border-[var(--border)] bg-[var(--bg-nav)] sticky top-0 z-10">
        <span className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider">{label}</span>
        {range && <span className="text-[10px] text-[var(--text-muted)]">{range}</span>}
      </div>
      {entries.map(e => (
        <StudioRecord
          key={e.id}
          onClick={() => onSelect(e.id)}
          active={selectedId === e.id}
        >
          <div className="text-sm font-medium text-[var(--text-main)] truncate">{e.title}</div>
          {(e.startYear != null || e.date) && (
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              {e.startYear != null
                ? e.endYear != null ? `${e.startYear} – ${e.endYear}` : String(e.startYear)
                : e.date}
            </div>
          )}
        </StudioRecord>
      ))}
    </div>
  )
}
