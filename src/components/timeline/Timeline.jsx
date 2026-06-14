import { useMemo, useRef, useState } from 'react'
import Modal from '../shared/Modal'
import ChronicleEntryForm from '../shared/ChronicleEntryForm'

function parseTimelineYear(value) {
  if (!value) return null
  const date = value.toString().replace(/[−–—]/g, '-')
  const yearMatch = date.match(/\byears?\s*(-?\d+)/i)
  const firstNumber = yearMatch || date.match(/-?\d+/)
  if (!firstNumber) return null
  let year = parseInt(firstNumber[1] ?? firstNumber[0], 10)
  if (!Number.isFinite(year)) return null
  if (/\b(?:bc|bce)\b/i.test(date) && year > 0) year = -year
  return year
}

function compareEventsByYear(a, b) {
  const safeA = Number.isFinite(a.year) ? a.year : Infinity
  const safeB = Number.isFinite(b.year) ? b.year : Infinity
  return safeA - safeB || (a.title || '').localeCompare(b.title || '')
}

function buildClusters(events, zoom) {
  if (!events.length) return []
  const threshold = { era: 90, years: 42, months: 16, days: 6 }[zoom] ?? 42
  const clusters = []
  events.forEach(event => {
    const last = clusters[clusters.length - 1]
    if (last && Number.isFinite(event.year) && Number.isFinite(last.maxYear) && event.year - last.maxYear <= threshold) {
      last.events.push(event)
      last.maxYear = Math.max(last.maxYear, event.year)
      last.year = Math.round((last.year + event.year) / 2)
    } else {
      clusters.push({ id: event.id, year: event.year, maxYear: event.year, events: [event] })
    }
  })
  return clusters
}

export default function Timeline({ store }) {
  const {
    timeline = [], characters = [], locations = [],
    addEvent, updateEvent, deleteEvent,
    currentYear,
    setSelectedCharacterId, setSelectedLocationId,
  } = store
  const railRef = useRef(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [zoom, setZoom] = useState('years')
  const [expandedCluster, setExpandedCluster] = useState(null)
  const [detailEvent, setDetailEvent] = useState(null)
  const [formState, setFormState] = useState(null)

  const allEvents = useMemo(() => {
    const manual = timeline.map(e => ({
      ...e,
      year: parseTimelineYear(e.date),
      sourceType: 'timeline',
      readOnly: false,
    }))
    const birthdays = characters
      .filter(c => c.birthDate && c.birthDate.toString().trim())
      .map(c => ({
        id: `birth-${c.id}`,
        title: `${c.name} is born`,
        date: c.birthDate,
        description: c.role ? `${c.role}` : 'Character birth',
        tags: ['birthday'],
        linkedCharacters: [c.id],
        linkedLocations: [],
        year: parseTimelineYear(c.birthDate),
        sourceType: 'birthday',
        readOnly: true,
      }))
    return [...manual, ...birthdays].sort(compareEventsByYear)
  }, [timeline, characters])

  const filtered = useMemo(() => {
    const query = search.toLowerCase()
    return allEvents.filter(e =>
      (e.title || '').toLowerCase().includes(query) ||
      (e.description || '').toLowerCase().includes(query) ||
      (e.date || '').toLowerCase().includes(query) ||
      (e.tags || []).some(tag => tag.toLowerCase().includes(query))
    )
  }, [allEvents, search])

  const finiteYears = filtered.map(e => e.year).filter(Number.isFinite)
  const minYear = finiteYears.length ? Math.min(...finiteYears) : 0
  const maxYear = finiteYears.length ? Math.max(...finiteYears) : 100
  const span = Math.max(10, maxYear - minYear)
  const pxPerYear = { era: 4, years: 12, months: 32, days: 72 }[zoom]
  const railWidth = Math.max(1280, span * pxPerYear + 420)
  const positioned = filtered.map((event, index) => ({
    ...event,
    lane: index % 6,
    x: Number.isFinite(event.year) ? 190 + ((event.year - minYear) * pxPerYear) : railWidth - 220,
  }))
  const clusters = buildClusters(positioned, zoom)

  const saveEntry = (data) => {
    if (formState?.type === 'timeline') {
      const event = updateEvent(formState.item.id, data)
      if (event?.id) setDetailEvent(event)
    } else {
      addEvent(data, { createHistory: false })
    }
    setFormState(null)
  }

  const scrollRail = direction => {
    railRef.current?.scrollBy({ left: direction * 360, behavior: 'smooth' })
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg-main)]">
      <div className="studio-topbar timeline-topbar px-5 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="eyebrow">Chronicle</p>
          <h2 className="font-serif text-xl font-bold text-[var(--text-main)]">Timeline</h2>
        </div>
        <div className="timeline-toolbar">
          {currentYear ? <span className="timeline-current-year">Current year: {currentYear}</span> : null}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events..." className="field px-3 py-1.5 text-xs w-44 placeholder:text-[var(--text-muted)]" />
          <div className="timeline-segmented">
            <button type="button" className={viewMode === 'list' ? 'is-active' : ''} onClick={() => setViewMode('list')}>List</button>
            <button type="button" className={viewMode === 'visual' ? 'is-active' : ''} onClick={() => setViewMode('visual')}>Overview</button>
          </div>
          <button onClick={() => setFormState({ type: 'new' })} className="btn btn-primary btn-sm">New</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex-1 grid place-items-center text-center px-6">
          <div className="empty-state">
            <p className="text-sm text-[var(--text-main)]">{allEvents.length === 0 ? 'No chronicle entries yet.' : 'No matches.'}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{allEvents.length === 0 ? 'Create a timeline event to begin the story spine.' : 'Try a different title, date, tag, or era.'}</p>
          </div>
        </div>
      ) : viewMode === 'visual' ? (
        <div className="timeline-visual-wrap">
          <div className="timeline-zoombar">
            <button type="button" onClick={() => scrollRail(-1)} aria-label="Scroll timeline left">←</button>
            <select value={zoom} onChange={e => setZoom(e.target.value)} className="field px-2 py-1 text-xs">
              <option value="era">Eras</option>
              <option value="years">Years</option>
              <option value="months">Months</option>
              <option value="days">Days</option>
            </select>
            <button type="button" onClick={() => scrollRail(1)} aria-label="Scroll timeline right">→</button>
          </div>
          <div className="timeline-rail-scroll" ref={railRef}>
            <div className="timeline-rail" style={{ width: railWidth }}>
              <div className="timeline-axis" />
              <div className="timeline-year-start">{Number.isFinite(minYear) ? minYear : 'Undated'}</div>
              <div className="timeline-year-end">{Number.isFinite(maxYear) ? maxYear : 'Later'}</div>
              {clusters.map(cluster => {
                const event = cluster.events[0]
                const isCluster = cluster.events.length > 1 && expandedCluster !== cluster.id
                return (
                  <div key={cluster.id} className={`timeline-visual-node lane-${event.lane}`} style={{ left: event.x }}>
                    {isCluster ? (
                      <button type="button" className="timeline-cluster" onClick={() => setExpandedCluster(cluster.id)} title="Expand cluster">
                        <strong>{cluster.events.length}</strong>
                        <span>events</span>
                      </button>
                    ) : (
                      <div className="timeline-node-stack">
                        {cluster.events.map(item => (
                          <button key={item.id} type="button" className={`timeline-node-card ${item.sourceType}`} onClick={() => setDetailEvent(item)}>
                            <span>{item.date || 'Undated'}</span>
                            <strong>{item.title}</strong>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="timeline-scroll flex-1 overflow-y-auto">
          <div className="timeline-list">
            {filtered.map(event => {
              if (event.sourceType === 'birthday') {
                return (
                  <article key={event.id} className="timeline-item is-birthday">
                    <span className="timeline-dot" />
                    <div className="timeline-birthday-row">
                      <div className="timeline-birthday-tooltip">
                        <div className="timeline-birthday-tooltip-date">{event.date || 'Undated'}</div>
                        <div className="timeline-birthday-tooltip-name">{event.title}</div>
                        {event.description && <div className="timeline-birthday-tooltip-role">{event.description}</div>}
                      </div>
                    </div>
                  </article>
                )
              }
              return (
                <article key={event.id} className="timeline-item">
                  <span className="timeline-dot" />
                  <button type="button" className="timeline-item-main" onClick={() => setDetailEvent(event)}>
                    <span className="timeline-item-copy">
                      <span className="timeline-date">{event.date || 'Undated'}{event.era ? ` · ${event.era}` : ''}</span>
                      <strong>{event.title}</strong>
                      {event.description && <small>{event.description}</small>}
                      {event.tags?.length > 0 && (
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {event.tags.map(tag => <span key={tag} className="chip">{tag}</span>)}
                        </span>
                      )}
                    </span>
                  </button>
                </article>
              )
            })}
          </div>
        </div>
      )}

      {detailEvent && (
        <Modal title={detailEvent.title} onClose={() => setDetailEvent(null)} wide>
          <div className="space-y-4">
            <div className="text-xs text-[var(--accent)]">
              {detailEvent.date || 'Undated'}
              {detailEvent.era ? ` · ${detailEvent.era}` : ''}
              {detailEvent.sourceType === 'birthday' ? ' · Birthday' : ''}
            </div>
            {detailEvent.description && (
              <p className="text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">{detailEvent.description}</p>
            )}
            {!detailEvent.readOnly && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setDetailEvent(null); setFormState({ type: 'timeline', item: detailEvent }) }}
                >Edit entry</button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    if (confirm(`Delete "${detailEvent.title}"?`)) {
                      const scope = confirm('Delete this timeline entry from every synced project too?\n\nOK = every synced project\nCancel = current project only') ? 'all' : 'current'
                      deleteEvent(detailEvent.id, { scope })
                      setDetailEvent(null)
                    }
                  }}
                >Delete</button>
              </div>
            )}
            {detailEvent.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {detailEvent.tags.map(tag => <span key={tag} className="chip">{tag}</span>)}
              </div>
            )}
            {detailEvent.linkedCharacters?.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Characters</div>
                <div className="flex flex-wrap gap-1">
                  {detailEvent.linkedCharacters.map(id => {
                    const c = characters.find(x => x.id === id)
                    if (!c) return null
                    return (
                      <button key={id} className="chip hover:border-[var(--accent)] hover:text-[var(--accent)]" onClick={() => { setDetailEvent(null); setSelectedCharacterId(id) }}>
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {detailEvent.linkedLocations?.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Locations</div>
                <div className="flex flex-wrap gap-1">
                  {detailEvent.linkedLocations.map(id => {
                    const l = locations.find(x => x.id === id)
                    if (!l) return null
                    return (
                      <button key={id} className="chip hover:border-[var(--accent)] hover:text-[var(--accent)]" onClick={() => { setDetailEvent(null); setSelectedLocationId(id) }}>
                        {l.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {formState && (
        <Modal
          title={formState.type === 'new' ? 'New Chronicle Entry' : `Edit — ${formState.item?.title}`}
          onClose={() => setFormState(null)}
          wide
        >
          <ChronicleEntryForm
            kind="timeline"
            initial={formState.type === 'timeline' ? formState.item : null}
            characters={characters}
            locations={locations}
            onSave={saveEntry}
            onCancel={() => setFormState(null)}
          />
        </Modal>
      )}
    </div>
  )
}
