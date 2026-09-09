import { useMemo, useRef, useState } from 'react'
import Modal from '../shared/Modal'
import ChronicleEntryForm from '../shared/ChronicleEntryForm'
import { formatTimelineDate, sortTimelineEras } from '../../utils/timelineYear'
import { buildTimelineEntries, groupTimelineEntries, matchesTimelineSearch } from '../../utils/timelineEntries'

export default function Timeline({ store }) {
  const {
    timeline = [], characters = [], locations = [], eras = [],
    addEvent, updateEvent, deleteEvent,
    currentYear,
    setSelectedCharacterId, setSelectedLocationId,
    selectedTimelineEventId, setSelectedTimelineEventId,
  } = store

  const [search, setSearch] = useState('')
  const [activeEraId, setActiveEraId] = useState('all')
  const selectedId = selectedTimelineEventId
  const setSelectedId = setSelectedTimelineEventId
  const [formState, setFormState] = useState(null)
  const scrollRef = useRef(null)

  const sortedEras = useMemo(() => sortTimelineEras(eras), [eras])
  const eraById = useMemo(() => new Map(eras.map(era => [era.id, era])), [eras])
  const characterById = useMemo(() => new Map(characters.map(character => [character.id, character])), [characters])
  const locationById = useMemo(() => new Map(locations.map(location => [location.id, location])), [locations])
  const allEvents = useMemo(() => buildTimelineEntries(timeline, characters, sortedEras), [timeline, characters, sortedEras])
  // A deleted era must not leave the timeline permanently filtered to nothing.
  const effectiveEraId = eraById.has(activeEraId) ? activeEraId : 'all'
  const query = search.trim().toLowerCase()

  const filtered = useMemo(() => {
    return allEvents.filter(e => {
      if (effectiveEraId !== 'all' && e.eraId !== effectiveEraId) return false
      return matchesTimelineSearch(e, query)
    })
  }, [allEvents, effectiveEraId, query])

  const sections = useMemo(() => groupTimelineEntries(filtered,
    effectiveEraId === 'all' ? sortedEras : sortedEras.filter(era => era.id === effectiveEraId),
    { includeEmpty: !query && effectiveEraId === 'all' }), [filtered, sortedEras, effectiveEraId, query])

  const selectedEvent = selectedId ? filtered.find(e => e.sourceType === 'timeline' && e.id === selectedId) : null
  const selectedEra = eraById.get(selectedEvent?.eraId)

  const handleSave = (data) => {
    const event = formState?.type === 'edit'
      ? updateEvent(formState.item.id, data)
      : addEvent(data, { createHistory: false })
    if (!event) return false // Refused edits need the same draft protection as creates.
    setSelectedId(event.id)
    setSearch('')
    setActiveEraId('all')
    setFormState(null)
    return true
  }

  const handleDelete = (id) => {
    if (!confirm('Delete this timeline entry?')) return
    const scope = confirm('Delete from every synced project?\n\nOK = all\nCancel = current only') ? 'all' : 'current'
    deleteEvent(id, { scope })
    setSelectedId(null)
  }

  const jumpToEra = (eraId) => {
    setActiveEraId(eraId)
    scrollRef.current?.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  const hasContent = filtered.length > 0

  return (
    <div className="tl2-root" data-tour="timeline-header">
      <div className="tl2-topbar">
        <div>
          <p className="eyebrow">Chronicle</p>
          <h2 className="font-serif text-xl font-bold text-[var(--text-main)]">Timeline</h2>
          <p className="text-xs text-[var(--text-muted)]">Dated events in your story and world. Manage eras and historical records in History.</p>
        </div>
        <div className="tl2-toolbar">
          {currentYear != null && String(currentYear).trim() !== '' ? <span className="tl2-year-badge">Year {currentYear}</span> : null}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events…"
            aria-label="Search events"
            className="field px-3 py-1.5 text-base w-44 placeholder:text-[var(--text-muted)]"
          />
          <button onClick={() => setFormState({ type: 'new' })} disabled={store.readOnly} className="btn btn-primary btn-sm">New Event</button>
        </div>
      </div>

      {sortedEras.length > 0 && (
        <div className="tl2-era-strip">
          <button aria-pressed={effectiveEraId === 'all'} className={`tl2-era-chip${effectiveEraId === 'all' ? ' is-active' : ''}`} onClick={() => jumpToEra('all')}>All</button>
          {sortedEras.map(era => (
            <button
              key={era.id}
              aria-pressed={effectiveEraId === era.id}
              className={`tl2-era-chip${effectiveEraId === era.id ? ' is-active' : ''}`}
              onClick={() => jumpToEra(era.id)}
            >
              {era.name}
              {era.startYear != null && (
                <span className="tl2-era-chip-years"> {era.startYear}–{era.endYear ?? '?'}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="tl2-body">
        <div className={`tl2-scroll${selectedEvent ? ' has-panel' : ''}`} ref={scrollRef}>
          {!hasContent ? (
            <div className="tl2-empty">
              <p className="text-sm text-[var(--text-main)]">
                {allEvents.length === 0 ? 'No timeline events yet.' : 'No matches.'}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1.5">
                {allEvents.length === 0 ? 'Create events to build the story spine.' : 'Try a different search or era filter.'}
              </p>
              {allEvents.length === 0 && (
                <button onClick={() => setFormState({ type: 'new' })} className="btn btn-primary btn-sm mt-4">Add First Event</button>
              )}
              {allEvents.length > 0 && <button className="btn btn-secondary btn-sm mt-4" onClick={() => { setSearch(''); jumpToEra('all') }}>Clear filters</button>}
            </div>
          ) : (
            <div className="tl2-entries">
              {sections.map(section => (
                <div
                  key={section.era?.id ?? '__unassigned'}
                >
                  {/* Era section header — always shown when eras exist */}
                  {sortedEras.length > 0 && (
                    <div className={`tl2-era-band${!section.era ? ' tl2-era-band--unassigned' : ''}`}>
                      <div className="tl2-era-band-inner">
                        <span className="tl2-era-band-name">
                          {!section.era ? 'No era assigned' : section.era.name}
                        </span>
                        {section.era && (section.era.startYear != null || section.era.endYear != null) && (
                          <span className="tl2-era-band-range">
                            {section.era.startYear ?? '?'} — {section.era.endYear ?? 'ongoing'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {section.events.length === 0 && section.era && (
                    <div className="tl2-era-empty">No events in this era yet</div>
                  )}

                  {section.events.map(event => {
                    if (event.sourceType === 'birthday') {
                      return (
                        <div key={event.renderKey} className="tl2-birthday">
                          <span className="tl2-birthday-pip" />
                          <span className="tl2-birthday-text">
                            {event.title} born · {formatTimelineDate(event)}
                          </span>
                        </div>
                      )
                    }

                    const isSelected = selectedId === event.id
                    return (
                      <div key={event.renderKey} className={`tl2-event${isSelected ? ' is-selected' : ''}`}>
                        <span className="tl2-spine-dot" />
                        <span className="tl2-connector" />
                        <button
                          type="button"
                          className="tl2-card"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedId(isSelected ? null : event.id)}
                        >
                          <div className="tl2-card-date">{formatTimelineDate(event)}</div>
                          <div className="tl2-card-title">{event.title}</div>
                          {event.description && (
                            <div className="tl2-card-desc">{event.description}</div>
                          )}
                          {(event.linkedCharacters?.length > 0 || event.linkedLocations?.length > 0 || event.tags?.length > 0) && (
                            <div className="tl2-card-meta">
                              {event.tags?.map(t => <span key={t} className="tl2-tag">{t}</span>)}
                              {event.linkedCharacters?.map(id => {
                                const c = characterById.get(id)
                                return c ? <span key={id} className="tl2-link tl2-link--char">⊙ {c.name}</span> : null
                              })}
                              {event.linkedLocations?.map(id => {
                                const l = locationById.get(id)
                                return l ? <span key={id} className="tl2-link tl2-link--loc">◈ {l.name}</span> : null
                              })}
                            </div>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedEvent && (
          <aside className="tl2-panel">
            <div className="tl2-panel-head">
              <div className="min-w-0">
                <div className="tl2-panel-date">
                  {formatTimelineDate(selectedEvent)}
                  {selectedEra ? ` · ${selectedEra.name}` : ''}
                </div>
                <h3 className="tl2-panel-title">{selectedEvent.title}</h3>
              </div>
              <button onClick={() => setSelectedId(null)} className="tl2-panel-close" aria-label="Close">×</button>
            </div>

            <div className="tl2-panel-body">
              {selectedEvent.description && (
                <p className="tl2-panel-desc">{selectedEvent.description}</p>
              )}
              {selectedEvent.tags?.length > 0 && (
                <div className="tl2-panel-section">
                  <div className="tl2-panel-label">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedEvent.tags.map(t => <span key={t} className="chip">{t}</span>)}
                  </div>
                </div>
              )}
              {selectedEvent.linkedCharacters?.length > 0 && (
                <div className="tl2-panel-section">
                  <div className="tl2-panel-label">Characters</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedEvent.linkedCharacters.map(id => {
                      const c = characterById.get(id)
                      return c ? (
                        <button key={id} className="tl2-panel-link"
                          onClick={() => { setSelectedId(null); setSelectedCharacterId(id); window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: 'characters' } })) }}>
                          ⊙ {c.name}
                        </button>
                      ) : null
                    })}
                  </div>
                </div>
              )}
              {selectedEvent.linkedLocations?.length > 0 && (
                <div className="tl2-panel-section">
                  <div className="tl2-panel-label">Locations</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedEvent.linkedLocations.map(id => {
                      const l = locationById.get(id)
                      return l ? (
                        <button key={id} className="tl2-panel-link"
                          onClick={() => { setSelectedId(null); setSelectedLocationId(id); window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: 'locations' } })) }}>
                          ◈ {l.name}
                        </button>
                      ) : null
                    })}
                  </div>
                </div>
              )}
            </div>

            {!store.readOnly && !selectedEvent.readOnly && (
              <div className="tl2-panel-actions">
                <button className="btn btn-secondary btn-sm flex-1"
                  onClick={() => setFormState({ type: 'edit', item: selectedEvent })}>Edit</button>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => handleDelete(selectedEvent.id)}>Delete</button>
              </div>
            )}
          </aside>
        )}
      </div>

      {formState && (
        <Modal
          title={formState.type === 'new' ? 'New Timeline Event' : `Edit — ${formState.item?.title}`}
          onClose={() => setFormState(null)}
          wide
        >
          <ChronicleEntryForm
            kind="timeline"
            initial={formState.type === 'edit' ? formState.item : null}
            characters={characters}
            locations={locations}
            eras={eras}
            onSave={handleSave}
            onCancel={() => setFormState(null)}
          />
        </Modal>
      )}
    </div>
  )
}
