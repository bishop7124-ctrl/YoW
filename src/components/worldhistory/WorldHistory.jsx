import { useEffect, useMemo, useState } from 'react'
import Modal from '../shared/Modal'
import { StudioSplit, StudioIndex, StudioRecord, StudioDetail, StudioButton, StudioEmpty, StudioPageHeader, StudioNote } from '../presentation/Studio'
import ChronicleEntryForm from '../shared/ChronicleEntryForm'
import EraManager from './EraManager'
import { formatTimelineDate, sortTimelineEras } from '../../utils/timelineYear'
import { createEraLookup, groupTimelineEntries, matchesTimelineSearch, resolveTimelineEra } from '../../utils/timelineEntries'
import { buildHistoryEntries } from '../../utils/historyEntries'

export default function WorldHistory({ store }) {
  return <HistoryWorkspace key={store.activeNovelId || 'history'} store={store} />
}

function HistoryWorkspace({ store }) {
  const { timeline, worldHistory, characters, locations, addHistoryEntry, updateHistoryEntry, deleteHistoryEntry, updateEvent, deleteEvent, setSelectedCharacterId, setSelectedLocationId, selectedTimelineEventId, setSelectedTimelineEventId, selectedHistoryEntryId, setSelectedHistoryEntryId, eras, addEra, updateEra, deleteEra } = store
  const [search, setSearch] = useState('')
  const [formState, setFormState] = useState(null)
  const [notice, setNotice] = useState('')
  const editTarget = formState?.item

  useEffect(() => {
    // Repeating the quick-add event must not replace an open edit draft.
    const openNewHistoryForm = () => { if (!store.readOnly) setFormState(current => current || { type: 'new' }) }
    window.addEventListener('open-history-form', openNewHistoryForm)
    return () => window.removeEventListener('open-history-form', openNewHistoryForm)
  }, [store.readOnly])

  const query = search.trim().toLowerCase()
  const entries = useMemo(() => buildHistoryEntries(timeline, worldHistory), [timeline, worldHistory])
  const filtered = useMemo(() => entries.filter(entry => matchesTimelineSearch(entry, query)), [entries, query])
  const sortedEras = useMemo(() => sortTimelineEras(eras || []), [eras])
  const eraLookup = useMemo(() => createEraLookup(sortedEras), [sortedEras])
  const sections = useMemo(() => groupTimelineEntries(filtered, sortedEras, { includeEmpty: !query }), [filtered, sortedEras, query])
  const characterById = useMemo(() => new Map((characters || []).map(character => [character.id, character])), [characters])
  const locationById = useMemo(() => new Map((locations || []).map(location => [location.id, location])), [locations])

  const closeForm = () => setFormState(null)
  const openNew = () => { setNotice(''); setFormState({ type: 'new' }) }
  const selectEntry = entry => {
    if (entry.sourceType === 'history') setSelectedHistoryEntryId(entry.id)
    else setSelectedTimelineEventId(entry.id)
  }

  const handleSave = (data) => {
    const sourceType = editTarget?.sourceType || 'history'
    const saved = editTarget
      ? (sourceType === 'history' ? updateHistoryEntry : updateEvent)(editTarget.id, data)
      : addHistoryEntry(data, { createTimeline: true })
    if (!saved) return false
    selectEntry({ ...saved, sourceType })
    closeForm()
    setSearch('')
    setNotice('')
    return true
  }

  const handleDelete = entry => {
    const isHistory = entry.sourceType === 'history'
    const retained = isHistory && entry.timelineId ? ' Its linked Timeline event will be kept.' : ''
    if (!confirm(`Delete this ${isHistory ? 'History record' : 'Timeline event'}?${retained}`)) return
    const scope = confirm('Delete from every synced project too?\n\nOK = every synced project\nCancel = current project only') ? 'all' : 'current'
    const deleted = (isHistory ? deleteHistoryEntry : deleteEvent)(entry.id, { scope })
    if (!deleted) { setNotice('This entry could not be deleted.'); return }
    if (isHistory) setSelectedHistoryEntryId(null)
    else setSelectedTimelineEventId(null)
    setNotice(isHistory && entry.timelineId ? 'History record deleted. Its Timeline event was kept.' : 'Entry deleted.')
  }

  const liveSelected = filtered.find(entry => selectedHistoryEntryId
    ? entry.historyId === selectedHistoryEntryId
    : selectedTimelineEventId && entry.timelineId === selectedTimelineEventId)
  const selectedEra = liveSelected ? resolveTimelineEra(liveSelected, eraLookup) : null

  return (
    <StudioSplit>
      <StudioIndex
        eyebrow="Chronicle wall"
        title="History"
        data-tour="worldhistory-header"
        tools={
          <div className="flex gap-1">
            <StudioButton tone="secondary" size="sm" disabled={store.readOnly} onClick={() => setFormState({ type: 'eras' })}>Eras</StudioButton>
            <StudioButton tone="primary" size="sm" disabled={store.readOnly} data-tour="worldhistory-new" onClick={openNew}>New</StudioButton>
          </div>
        }
      >
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          aria-label="Search history"
          className="field w-full px-2.5 py-1.5 text-base placeholder:text-[var(--text-muted)]"
        />

        {notice && <p role="status" className="text-xs p-3">{notice}</p>}
        {filtered.length === 0 && entries.length === 0 && (
          <div className="p-4 text-center space-y-2">
            <p className="text-[var(--text-muted)] text-xs">No chronicle entries yet.</p>
            <p className="text-[var(--text-muted)] text-[10px] leading-relaxed">
              Add world-building events — ages, eras, wars, founding myths — using the New button above.
            </p>
          </div>
        )}
        {filtered.length === 0 && entries.length > 0 && (
          <div className="text-[var(--text-muted)] text-xs p-4 text-center">
            <p>No matches.</p>
            <StudioButton size="sm" className="mt-2" onClick={() => setSearch('')}>Clear search</StudioButton>
          </div>
        )}

        {/* Era-grouped timeline */}
        {sections.map(({ era, events }) => (
            <EraSection
              key={era?.id || '__unassigned'}
              label={era?.name || 'Unassigned'}
              range={era && (era.startYear != null || era.endYear != null) ? `${era.startYear ?? '?'} – ${era.endYear ?? '?'}` : null}
              entries={events}
              selectedKey={liveSelected?.recordKey}
              onSelect={selectEntry}
            />
        ))}
      </StudioIndex>

      <StudioDetail>
        {!liveSelected ? (
          <StudioEmpty
            title="Select a chronicle entry"
            body="Choose a period from the history wall or create a new one."
            action={<StudioButton tone="primary" className="mt-4" disabled={store.readOnly} onClick={openNew}>Add Entry</StudioButton>}
          />
        ) : (
          <div className="max-w-4xl">
            <StudioPageHeader
              eyebrow={liveSelected.sourceType === 'history' ? 'Historical record' : 'Timeline event'}
              title={liveSelected.title}
              actions={(
                <>
                  <StudioButton tone="secondary" size="sm" disabled={store.readOnly || liveSelected.readOnly} onClick={() => setFormState({ type: 'edit', item: liveSelected })}>Edit</StudioButton>
                  <StudioButton tone="secondary" size="sm" disabled={store.readOnly || liveSelected.readOnly} onClick={() => handleDelete(liveSelected)}>Delete</StudioButton>
                </>
              )}
            >
              <div className="flex flex-wrap items-center gap-3 mt-1.5">
                {(selectedEra || liveSelected.era) && <span className="text-xs text-[var(--accent)]">{selectedEra?.name || liveSelected.era}</span>}
                <span className="text-xs text-[var(--text-muted)]">{formatTimelineDate(liveSelected)}</span>
                {(liveSelected.category || liveSelected.type) && <span className="chip">{liveSelected.category || liveSelected.type}</span>}
              </div>
            </StudioPageHeader>

            {liveSelected.description && (
              <StudioNote className="text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap break-words mb-4">
                {liveSelected.description}
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
                    const c = characterById.get(id)
                    if (!c) return null
                    return (
                      <button key={id} className="chip hover:border-[var(--accent)] hover:text-[var(--accent)]" onClick={() => { setSelectedCharacterId(id); window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: 'characters' } })) }}>
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
                    const l = locationById.get(id)
                    if (!l) return null
                    return (
                      <button key={id} className="chip hover:border-[var(--accent)] hover:text-[var(--accent)]" onClick={() => { setSelectedLocationId(id); window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: 'locations' } })) }}>
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

      {formState && formState.type !== 'eras' && (
        <Modal title={editTarget ? `Edit — ${editTarget.title}` : 'New History Entry'} onClose={closeForm} wide>
          <ChronicleEntryForm
            key={editTarget?.recordKey || 'new'}
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

      {formState?.type === 'eras' && (
        <Modal title="Manage Eras" onClose={closeForm}>
          <EraManager eras={eras} addEra={addEra} updateEra={updateEra} deleteEra={deleteEra} />
        </Modal>
      )}
    </StudioSplit>
  )
}

function EraSection({ label, range, entries, selectedKey, onSelect }) {
  return (
    <div>
      <div className="px-3 py-1.5 flex flex-wrap items-baseline gap-2 border-b border-[var(--border)] bg-[var(--bg-nav)] sticky top-0 z-10">
        <span className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider">{label}</span>
        {range && <span className="text-[10px] text-[var(--text-muted)]">{range}</span>}
      </div>
      {entries.map(e => (
        <StudioRecord
          key={e.recordKey}
          onClick={() => onSelect(e)}
          active={selectedKey === e.recordKey}
        >
          <div className="text-sm font-medium text-[var(--text-main)] truncate">{e.title}</div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">{formatTimelineDate(e)}</div>
          {e.sourceType === 'timeline' && <div className="text-[10px] text-[var(--text-muted)]">Timeline only</div>}
        </StudioRecord>
      ))}
    </div>
  )
}
