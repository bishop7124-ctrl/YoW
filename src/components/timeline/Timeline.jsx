import { useMemo, useRef, useState } from 'react'
import Modal from '../shared/Modal'
import ChronicleEntryForm from '../shared/ChronicleEntryForm'

function parseTimelineYear(value) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const date = value.toString().replace(/[−–—]/g, '-')
  const yearMatch = date.match(/\byears?\s*(-?\d+)/i)
  const firstNumber = yearMatch || date.match(/-?\d+/)
  if (!firstNumber) return null
  let year = parseInt(firstNumber[1] ?? firstNumber[0], 10)
  if (!Number.isFinite(year)) return null
  if (/\b(?:bc|bce)\b/i.test(date) && year > 0) year = -year
  return year
}

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
  const eraRefs = useRef({})
  const scrollRef = useRef(null)

  const allEvents = useMemo(() => {
    const manual = timeline.map(e => ({
      ...e,
      year: e.startYear != null ? parseTimelineYear(e.startYear) : parseTimelineYear(e.date),
      sourceType: 'timeline',
    }))
    const birthdays = characters
      .filter(c => c.birthDate?.toString().trim())
      .map(c => ({
        id: `birth-${c.id}`,
        title: c.name,
        date: c.birthDate,
        year: parseTimelineYear(c.birthDate),
        tags: [],
        linkedCharacters: [c.id],
        linkedLocations: [],
        sourceType: 'birthday',
        readOnly: true,
      }))
    return [...manual, ...birthdays].sort((a, b) => {
      const ya = Number.isFinite(a.year) ? a.year : Infinity
      const yb = Number.isFinite(b.year) ? b.year : Infinity
      return ya - yb || (a.title || '').localeCompare(b.title || '')
    })
  }, [timeline, characters])

  const sortedEras = useMemo(() =>
    [...eras].sort((a, b) => (a.startYear ?? Infinity) - (b.startYear ?? Infinity)),
    [eras]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return allEvents.filter(e => {
      if (activeEraId !== 'all' && e.eraId !== activeEraId) return false
      if (!q) return true
      return (
        (e.title || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.date || '').toLowerCase().includes(q) ||
        (e.tags || []).some(t => t.toLowerCase().includes(q))
      )
    })
  }, [allEvents, activeEraId, search])

  // Group into sections: one per era (always shown when eras exist), then unassigned
  const sections = useMemo(() => {
    if (sortedEras.length === 0) {
      return [{ era: null, unassigned: false, events: filtered }]
    }
    const eraMap = new Map(sortedEras.map(e => [e.id, []]))
    const unassigned = []
    for (const ev of filtered) {
      if (ev.eraId && eraMap.has(ev.eraId)) eraMap.get(ev.eraId).push(ev)
      else unassigned.push(ev)
    }
    const result = sortedEras.map(era => ({ era, unassigned: false, events: eraMap.get(era.id) ?? [] }))
    if (unassigned.length > 0) {
      result.push({ era: null, unassigned: true, events: unassigned })
    }
    return result
  }, [filtered, sortedEras])

  const selectedEvent = selectedId ? allEvents.find(e => e.id === selectedId) : null
  const selectedEra = selectedEvent?.eraId ? eras.find(e => e.id === selectedEvent.eraId) : null

  const handleSave = (data) => {
    if (formState?.type === 'edit') {
      const event = updateEvent(formState.item.id, data)
      if (event?.id) setSelectedId(event.id)
    } else {
      addEvent(data, { createHistory: false })
    }
    setFormState(null)
  }

  const handleDelete = (id) => {
    if (!confirm('Delete this timeline entry?')) return
    const scope = confirm('Delete from every synced project?\n\nOK = all\nCancel = current only') ? 'all' : 'current'
    deleteEvent(id, { scope })
    setSelectedId(null)
  }

  const jumpToEra = (eraId) => {
    setActiveEraId(eraId)
    if (eraId !== 'all') {
      setTimeout(() => eraRefs.current[eraId]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } else {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const hasContent = filtered.length > 0

  const formatYear = (ev) => {
    if (ev.startYear != null) {
      return ev.endYear != null ? `${ev.startYear} – ${ev.endYear}` : String(ev.startYear)
    }
    return ev.date || 'Undated'
  }

  return (
    <div className="tl2-root" data-tour="timeline-header">
      <div className="tl2-topbar">
        <div>
          <p className="eyebrow">Chronicle</p>
          <h2 className="font-serif text-xl font-bold text-[var(--text-main)]">Timeline</h2>
        </div>
        <div className="tl2-toolbar">
          {currentYear ? <span className="tl2-year-badge">Year {currentYear}</span> : null}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events…"
            className="field px-3 py-1.5 text-xs w-44 placeholder:text-[var(--text-muted)]"
          />
          <button onClick={() => setFormState({ type: 'new' })} className="btn btn-primary btn-sm">New Event</button>
        </div>
      </div>

      {sortedEras.length > 0 && (
        <div className="tl2-era-strip">
          <button className={`tl2-era-chip${activeEraId === 'all' ? ' is-active' : ''}`} onClick={() => jumpToEra('all')}>All</button>
          {sortedEras.map(era => (
            <button
              key={era.id}
              className={`tl2-era-chip${activeEraId === era.id ? ' is-active' : ''}`}
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
            </div>
          ) : (
            <div className="tl2-entries">
              {sections.map(section => (
                <div
                  key={section.era?.id ?? '__unassigned'}
                  ref={el => { if (section.era) eraRefs.current[section.era.id] = el }}
                >
                  {/* Era section header — always shown when eras exist */}
                  {(section.era || section.unassigned) && (
                    <div className={`tl2-era-band${section.unassigned ? ' tl2-era-band--unassigned' : ''}`}>
                      <div className="tl2-era-band-inner">
                        <span className="tl2-era-band-name">
                          {section.unassigned ? 'No era assigned' : section.era.name}
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
                        <div key={event.id} className="tl2-birthday">
                          <span className="tl2-birthday-pip" />
                          <span className="tl2-birthday-text">
                            {event.title} born{event.date ? ` · ${event.date}` : ''}
                          </span>
                        </div>
                      )
                    }

                    const isSelected = selectedId === event.id
                    return (
                      <div key={event.id} className={`tl2-event${isSelected ? ' is-selected' : ''}`}>
                        <span className="tl2-spine-dot" />
                        <span className="tl2-connector" />
                        <button
                          type="button"
                          className="tl2-card"
                          onClick={() => setSelectedId(isSelected ? null : event.id)}
                        >
                          <div className="tl2-card-date">{formatYear(event)}</div>
                          <div className="tl2-card-title">{event.title}</div>
                          {event.description && (
                            <div className="tl2-card-desc">{event.description}</div>
                          )}
                          {(event.linkedCharacters?.length > 0 || event.linkedLocations?.length > 0 || event.tags?.length > 0) && (
                            <div className="tl2-card-meta">
                              {event.tags?.map(t => <span key={t} className="tl2-tag">{t}</span>)}
                              {event.linkedCharacters?.map(id => {
                                const c = characters.find(x => x.id === id)
                                return c ? <span key={id} className="tl2-link tl2-link--char">⊙ {c.name}</span> : null
                              })}
                              {event.linkedLocations?.map(id => {
                                const l = locations.find(x => x.id === id)
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
                  {formatYear(selectedEvent)}
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
                      const c = characters.find(x => x.id === id)
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
                      const l = locations.find(x => x.id === id)
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

            {!selectedEvent.readOnly && (
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
