import { useState, useMemo, useEffect } from 'react'

const DAYS_PER_MONTH = 30

const MONTH_NAMES = [
  '', 'First Month', 'Second Month', 'Third Month', 'Fourth Month',
  'Fifth Month', 'Sixth Month', 'Seventh Month', 'Eighth Month',
  'Ninth Month', 'Tenth Month', 'Eleventh Month', 'Twelfth Month',
]

const CATEGORIES = [
  { id: 'scene',    label: 'Scene',    color: '#8b8fff' },
  { id: 'battle',   label: 'Battle',   color: '#ef4444' },
  { id: 'travel',   label: 'Travel',   color: '#f59e0b' },
  { id: 'meeting',  label: 'Meeting',  color: '#22c55e' },
  { id: 'festival', label: 'Festival', color: '#f97316' },
  { id: 'other',    label: 'Other',    color: '#94a3b8' },
]

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]))
const CATEGORY_COLORS = ['#8b8fff', '#ef4444', '#f59e0b', '#22c55e', '#f97316', '#94a3b8', '#14b8a6', '#ec4899']
const slugCategory = value => String(value || 'other').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'other'
const getScheduleCategories = project => {
  const configured = project?.categoryOptions?.schedule
  const labels = Array.isArray(configured) && configured.length ? configured : CATEGORIES.map(cat => cat.label)
  return labels.map((label, index) => {
    const builtIn = CATEGORIES.find(cat => cat.label.toLowerCase() === String(label).toLowerCase())
    return builtIn || { id: slugCategory(label), label, color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }
  })
}

const INPUT_STYLE = {
  width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 10px', color: 'var(--text-main)', fontSize: 14,
  boxSizing: 'border-box', fontFamily: 'inherit',
}

const LABEL_STYLE = { display: 'block', color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }

// ─── Event modal ─────────────────────────────────────────────────────────────

function EventModal({ event, prefillDay, prefillMonth, prefillYear, store, categories, onClose }) {
  const isEdit = Boolean(event)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const [form, setForm] = useState({
    title: event?.title ?? '',
    description: event?.description ?? '',
    year: event?.year ?? prefillYear,
    month: event?.month ?? prefillMonth,
    day: event?.day ?? prefillDay,
    duration: event?.duration ?? 1,
    category: event?.category ?? 'scene',
    tags: event?.tags?.join(', ') ?? '',
    linkedCharacters: event?.linkedCharacters ?? [],
    linkedLocations: event?.linkedLocations ?? [],
  })
  const [error, setError] = useState('')

  const set = field => e => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const save = () => {
    if (!form.title.trim()) { setError('Title is required'); return }
    const data = {
      ...form,
      year: parseInt(form.year) || 1,
      month: Math.max(1, Math.min(12, parseInt(form.month) || 1)),
      day: Math.max(1, Math.min(DAYS_PER_MONTH, parseInt(form.day) || 1)),
      duration: Math.max(1, parseInt(form.duration) || 1),
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    }
    if (isEdit) store.updateScheduleEvent(event.id, data)
    else store.addScheduleEvent(data)
    onClose()
  }

  const remove = () => { store.deleteScheduleEvent(event.id); onClose() }

  const toggleChar = id => setForm(prev => ({
    ...prev,
    linkedCharacters: prev.linkedCharacters.includes(id)
      ? prev.linkedCharacters.filter(c => c !== id)
      : [...prev.linkedCharacters, id],
  }))

  const toggleLoc = id => setForm(prev => ({
    ...prev,
    linkedLocations: prev.linkedLocations.includes(id)
      ? prev.linkedLocations.filter(l => l !== id)
      : [...prev.linkedLocations, id],
  }))

  const novelChars = store.characters ?? []
  const novelLocs = store.locations ?? []

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div style={{ background: 'var(--bg-nav)', border: '1px solid var(--border)', borderRadius: 12, width: 500, maxHeight: '90vh', overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ color: 'var(--text-main)', fontWeight: 700, fontSize: 16, margin: 0 }}>
            {isEdit ? 'Edit Event' : 'New Event'}
          </h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LABEL_STYLE}>Title *</label>
            <input value={form.title} onChange={set('title')} placeholder="Event name…" autoFocus style={INPUT_STYLE} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={LABEL_STYLE}>Year</label>
              <input type="number" value={form.year} onChange={set('year')} style={INPUT_STYLE} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Month</label>
              <input type="number" min="1" max="12" value={form.month} onChange={set('month')} style={INPUT_STYLE} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Day</label>
              <input type="number" min="1" max={DAYS_PER_MONTH} value={form.day} onChange={set('day')} style={INPUT_STYLE} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Duration</label>
              <input type="number" min="1" value={form.duration} onChange={set('duration')} style={INPUT_STYLE} />
            </div>
          </div>

          <div>
            <label style={{ ...LABEL_STYLE, marginBottom: 6 }}>Category</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setForm(prev => ({ ...prev, category: cat.id }))}
                  style={{
                    padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `2px solid ${form.category === cat.id ? cat.color : 'transparent'}`,
                    background: form.category === cat.id ? cat.color + '33' : 'var(--bg-main)',
                    color: cat.color,
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={LABEL_STYLE}>Description</label>
            <textarea
              value={form.description} onChange={set('description')} rows={3}
              placeholder="What happens…"
              style={{ ...INPUT_STYLE, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Tags (comma-separated)</label>
            <input value={form.tags} onChange={set('tags')} placeholder="war, magic, intrigue…" style={INPUT_STYLE} />
          </div>

          {novelChars.length > 0 && (
            <div>
              <label style={LABEL_STYLE}>Characters</label>
              <div className="panel-soft max-h-32 overflow-y-auto flex flex-wrap gap-2 p-2">
                {novelChars.map(char => {
                  const active = form.linkedCharacters.includes(char.id)
                  return (
                    <button key={char.id} type="button" onClick={() => toggleChar(char.id)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${active ? 'bg-[var(--accent-fade)] border-[var(--accent)]/40 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                      {active && <span>✓</span>}{char.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {novelLocs.length > 0 && (
            <div>
              <label style={LABEL_STYLE}>Locations</label>
              <div className="panel-soft max-h-32 overflow-y-auto flex flex-wrap gap-2 p-2">
                {novelLocs.map(loc => {
                  const active = form.linkedLocations.includes(loc.id)
                  return (
                    <button key={loc.id} type="button" onClick={() => toggleLoc(loc.id)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${active ? 'bg-[var(--accent-fade)] border-[var(--accent)]/40 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                      {active && <span>✓</span>}{loc.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          {isEdit && (
            <button onClick={remove} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1px solid #ef4444', color: '#ef4444', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              Delete
            </button>
          )}
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={save} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: 'var(--bg-main)', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
            {isEdit ? 'Save Changes' : 'Add Event'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Event detail popover ─────────────────────────────────────────────────────

function EventPopover({ event, store, categoriesById, onEdit, onClose }) {
  const cat = categoriesById[event.category] || CAT_MAP[event.category] || CAT_MAP.other
  const chars = (event.linkedCharacters ?? [])
    .map(id => store.characters?.find(c => c.id === id)?.name).filter(Boolean)
  const locs = (event.linkedLocations ?? [])
    .map(id => store.locations?.find(l => l.id === id)?.name).filter(Boolean)

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900 }}
    >
      <div style={{ background: 'var(--bg-nav)', border: `2px solid ${cat.color}44`, borderRadius: 12, width: 380, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-main)', fontWeight: 700, fontSize: 15 }}>{event.title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
              {MONTH_NAMES[event.month]}, Day {event.day} · Year {event.year}
              {event.duration > 1 && ` · ${event.duration} days`}
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, marginLeft: 8 }}>×</button>
        </div>

        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: cat.color + '22', color: cat.color, fontSize: 11, fontWeight: 600, marginBottom: 10 }}>{cat.label}</span>

        {event.description && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>{event.description}</p>
        )}

        {event.tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {event.tags.map(t => (
              <span key={t} style={{ color: 'var(--text-muted)', fontSize: 11 }}>#{t}</span>
            ))}
          </div>
        )}

        {chars.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Characters: </span>
            <span style={{ color: 'var(--text-main)', fontSize: 12 }}>{chars.join(', ')}</span>
          </div>
        )}
        {locs.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Locations: </span>
            <span style={{ color: 'var(--text-main)', fontSize: 12 }}>{locs.join(', ')}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onEdit} style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: 'var(--bg-main)', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main calendar ────────────────────────────────────────────────────────────

export default function ScheduleCalendar({ store }) {
  const [viewYear, setViewYear] = useState(1)
  const [viewMonth, setViewMonth] = useState(1)
  const [viewMode, setViewMode] = useState('month')
  const [modal, setModal] = useState(null)

  const events = useMemo(() => store.storySchedule ?? [], [store.storySchedule])
  const categories = useMemo(() => getScheduleCategories(store.activeNovel), [store.activeNovel])
  const categoriesById = useMemo(() => Object.fromEntries(categories.map(cat => [cat.id, cat])), [categories])

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }
  const goToday = () => {
    const year = store.activeNovel?.currentYear || 1
    setViewYear(year)
    setViewMonth(1)
  }

  const monthEvents = useMemo(() => {
    return events.filter(ev => {
      if (ev.year !== viewYear) return false
      const evAbsStart = (ev.month - 1) * DAYS_PER_MONTH + (ev.day - 1)
      const evAbsEnd = evAbsStart + (ev.duration - 1)
      const mAbsStart = (viewMonth - 1) * DAYS_PER_MONTH
      const mAbsEnd = mAbsStart + (DAYS_PER_MONTH - 1)
      return evAbsStart <= mAbsEnd && evAbsEnd >= mAbsStart
    })
  }, [events, viewYear, viewMonth])

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => (a.year - b.year) || (a.month - b.month) || (a.day - b.day) || a.title.localeCompare(b.title))
  }, [events])

  const eventSegments = useMemo(() => {
    const segments = []
    const lanesByWeek = Array.from({ length: 5 }, () => [])
    const sortedMonthEvents = [...monthEvents].sort((a, b) => (a.day - b.day) || ((b.duration || 1) - (a.duration || 1)) || a.title.localeCompare(b.title))

    sortedMonthEvents.forEach(ev => {
      const evAbsStart = (ev.month - 1) * DAYS_PER_MONTH + (ev.day - 1)
      const evAbsEnd = evAbsStart + (ev.duration - 1)
      const mAbsStart = (viewMonth - 1) * DAYS_PER_MONTH
      const mAbsEnd = mAbsStart + (DAYS_PER_MONTH - 1)
      const overlapStart = Math.max(evAbsStart, mAbsStart)
      const overlapEnd = Math.min(evAbsEnd, mAbsEnd)
      let cursor = overlapStart
      while (cursor <= overlapEnd) {
        const dayIndex = cursor - mAbsStart
        const week = Math.floor(dayIndex / 7)
        const col = dayIndex % 7
        const weekEnd = Math.min(overlapEnd, mAbsStart + (week * 7) + 6)
        const span = weekEnd - cursor + 1
        const endCol = col + span - 1
        const weekLanes = lanesByWeek[week]
        let lane = weekLanes.findIndex(items => items.every(item => endCol < item.col || col > item.endCol))
        if (lane === -1) {
          lane = weekLanes.length
          weekLanes.push([])
        }
        weekLanes[lane].push({ col, endCol })
        segments.push({ event: ev, week, col, span, lane, startsBefore: cursor > evAbsStart, endsAfter: weekEnd < evAbsEnd })
        cursor = weekEnd + 1
      }
    })
    return segments
  }, [monthEvents, viewMonth])

  const cells = Array.from({ length: 35 }, (_, i) => (i < DAYS_PER_MONTH ? i + 1 : null))

  const openCreate = day => setModal({ type: 'create', day })
  const openDetail = event => setModal({ type: 'detail', event })

  const closeModal = () => setModal(null)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div className="schedule-header">
        <button onClick={prevMonth} title="Previous month" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 12px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>←</button>

        <div className="schedule-date-controls">
          <select value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))} className="field px-2 py-1.5 text-xs">
            {MONTH_NAMES.slice(1).map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </select>
          <input type="number" value={viewYear} onChange={e => setViewYear(parseInt(e.target.value) || 1)} className="field px-2 py-1.5 text-xs" aria-label="Year" />
          <button type="button" onClick={goToday} className="btn btn-secondary btn-sm">Today</button>
        </div>

        <button onClick={nextMonth} title="Next month" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 12px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>→</button>

        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {['month', 'list'].map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: viewMode === mode ? 'var(--accent)' : 'transparent',
                color: viewMode === mode ? 'var(--bg-main)' : 'var(--text-muted)',
                textTransform: 'capitalize',
              }}
            >
              {mode}
            </button>
          ))}
        </div>

        <button
          onClick={() => openCreate(1)}
          style={{ padding: '6px 16px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: 'var(--bg-main)', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginLeft: 4 }}
        >
          + Add Event
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>

        {viewMode === 'month' ? (
          <>
            <div className="schedule-month-title">{MONTH_NAMES[viewMonth]} · Year {viewYear}</div>
            {/* Day-of-week header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, paddingTop: 14, marginBottom: 2 }}>
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0' }}>
                  Day {i + 1}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="schedule-grid">
              {cells.map((day, idx) => {
                const isReal = day !== null
                return (
                  <div
                    key={idx}
                    className="schedule-day-cell"
                    onClick={() => isReal && openCreate(day)}
                    style={{
                      gridColumn: (idx % 7) + 1,
                      gridRow: Math.floor(idx / 7) + 1,
                      background: isReal ? 'var(--bg-nav)' : 'transparent',
                      border: isReal ? '1px solid var(--border)' : 'none',
                      borderRadius: 8,
                      minHeight: 88,
                      padding: isReal ? '6px 7px' : 0,
                      cursor: isReal ? 'pointer' : 'default',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { if (isReal) e.currentTarget.style.background = 'var(--bg-hover)' }}
                    onMouseLeave={e => { if (isReal) e.currentTarget.style.background = 'var(--bg-nav)' }}
                  >
                    {day && (
                      <>
                        <div className="schedule-day-number" style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                          {day}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
              {eventSegments.map((segment, index) => {
                const cat = categoriesById[segment.event.category] || CAT_MAP[segment.event.category] || CAT_MAP.other
                return (
                  <button
                    key={`${segment.event.id}-${index}`}
                    type="button"
                    className="schedule-ribbon"
                    onClick={e => { e.stopPropagation(); openDetail(segment.event) }}
                    title={segment.event.title}
                    style={{
                      '--event-color': cat.color,
                      gridColumn: `${segment.col + 1} / span ${segment.span}`,
                      gridRow: segment.week + 1,
                      marginTop: `${28 + Math.min(segment.lane, 3) * 22}px`,
                      borderTopLeftRadius: segment.startsBefore ? 0 : 6,
                      borderBottomLeftRadius: segment.startsBefore ? 0 : 6,
                      borderTopRightRadius: segment.endsAfter ? 0 : 6,
                      borderBottomRightRadius: segment.endsAfter ? 0 : 6,
                    }}
                  >
                    {segment.startsBefore ? '← ' : ''}{segment.event.title}{segment.endsAfter ? ' →' : ''}
                  </button>
                )
              })}
            </div>
            {monthEvents.length === 0 && (
              <div className="schedule-empty-month">
                <p>No events in {MONTH_NAMES[viewMonth]}, Year {viewYear}</p>
                <button onClick={() => openCreate(1)} className="btn btn-primary btn-sm">Add event</button>
              </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap', paddingLeft: 2 }}>
              {categories.map(cat => (
                <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 9, height: 9, borderRadius: 3, background: cat.color }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{cat.label}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* ── List view ── */
          <div style={{ paddingTop: 16 }}>
            {sortedEvents.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 80 }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 12 }}>
                  No scheduled events yet.
                </p>
                <button
                  onClick={() => openCreate(1)}
                  style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: 'var(--bg-main)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Add the first event
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 680 }}>
                {sortedEvents
                  .map(ev => {
                    const cat = categoriesById[ev.category] || CAT_MAP[ev.category] || CAT_MAP.other
                    const chars = (ev.linkedCharacters ?? [])
                      .map(id => store.characters?.find(c => c.id === id)?.name).filter(Boolean)
                    return (
                      <div
                        key={ev.id}
                        onClick={() => openDetail(ev)}
                        style={{
                          display: 'flex', gap: 16, alignItems: 'flex-start',
                          background: 'var(--bg-nav)', border: '1px solid var(--border)',
                          borderLeft: `4px solid ${cat.color}`,
                          borderRadius: 8, padding: '12px 16px', cursor: 'pointer',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-nav)'}
                      >
                        <div style={{ minWidth: 44, textAlign: 'right', paddingTop: 2 }}>
                          <div style={{ color: 'var(--text-main)', fontWeight: 700, fontSize: 20, lineHeight: 1 }}>{ev.day}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 1 }}>Y{ev.year} M{ev.month}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: 'var(--text-main)', fontWeight: 600, fontSize: 14 }}>{ev.title}</div>
                          {ev.description && (
                            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ev.description}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 999, background: cat.color + '22', color: cat.color, fontSize: 11, fontWeight: 600 }}>
                              {cat.label}
                            </span>
                            {ev.duration > 1 && (
                              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                Day {ev.day} to Day {Math.min(DAYS_PER_MONTH, ev.day + ev.duration - 1)} · {ev.duration} days
                              </span>
                            )}
                            {chars.length > 0 && (
                              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{chars.join(', ')}</span>
                            )}
                            {(ev.tags ?? []).map(t => (
                              <span key={t} style={{ color: 'var(--text-muted)', fontSize: 11 }}>#{t}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })
                }
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modal?.type === 'create' && (
        <EventModal
          event={null}
          prefillDay={modal.day}
          prefillMonth={viewMonth}
          prefillYear={viewYear}
          store={store}
          categories={categories}
          onClose={closeModal}
        />
      )}
      {modal?.type === 'edit' && (
        <EventModal
          event={modal.event}
          prefillDay={modal.event.day}
          prefillMonth={modal.event.month}
          prefillYear={modal.event.year}
          store={store}
          categories={categories}
          onClose={closeModal}
        />
      )}
      {modal?.type === 'detail' && (
        <EventPopover
          event={modal.event}
          store={store}
          categoriesById={categoriesById}
          onEdit={() => setModal({ type: 'edit', event: modal.event })}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
