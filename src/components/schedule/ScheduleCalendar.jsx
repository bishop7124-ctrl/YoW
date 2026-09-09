import { useEffect, useMemo, useState } from 'react'
import { StudioSheet } from '../presentation/Studio'
import {
  getScheduleCalendar, getScheduleViewSettings, getScheduleCategories,
  normalizeScheduleCategoryId, normalizeScheduleEvent, scheduleDateLabel,
  scheduleRangeLabel, scheduleEventSegments, sortScheduleEvents, SCHEDULE_OPEN_MODES,
} from '../../utils/scheduleCalendar.js'
import ScheduleEventEditor from './ScheduleEventEditor.jsx'
import ScheduleSettingsModal from './ScheduleSettingsModal.jsx'

const titleCase = value => String(value || 'other').replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
const UNKNOWN_COLORS = ['#14b8a6', '#ec4899', '#a78bfa', '#84cc16']

export default function ScheduleCalendar({ store, initialEntryId = null }) {
  return <ScheduleWorkspace key={store.activeNovelId || store.activeNovel?.id || 'none'} store={store} initialEntryId={initialEntryId} />
}

function ScheduleWorkspace({ store, initialEntryId }) {
  const { activeNovelId, readOnly, updateNovel } = store
  const calendar = useMemo(() => getScheduleCalendar(store.activeNovel), [store.activeNovel])
  const viewSettings = useMemo(() => getScheduleViewSettings(store.activeNovel, calendar), [store.activeNovel, calendar])
  const [viewYear, setViewYear] = useState(() => viewSettings.openYear)
  const [viewMonth, setViewMonth] = useState(() => viewSettings.openMonth)
  const [viewMode, setViewMode] = useState('month')
  const [modal, setModal] = useState(initialEntryId ? { type: 'detail', eventId: initialEntryId } : null)
  const events = useMemo(() => (store.storySchedule || []).map(normalizeScheduleEvent), [store.storySchedule])
  const eventIndex = useMemo(() => new Map(events.map(event => [event.id, event])), [events])
  const configuredCategories = useMemo(() => getScheduleCategories(store.activeNovel), [store.activeNovel])
  const categories = useMemo(() => {
    const result = new Map(configuredCategories.map(category => [category.id, category]))
    events.forEach(event => {
      if (!result.has(event.category)) result.set(event.category, { id: event.category, label: titleCase(event.category), color: UNKNOWN_COLORS[result.size % UNKNOWN_COLORS.length] })
    })
    return [...result.values()]
  }, [configuredCategories, events])
  const categoryIndex = useMemo(() => new Map(categories.map(category => [category.id, category])), [categories])
  const month = Math.max(1, Math.min(viewMonth, calendar.months.length))
  const layout = useMemo(() => scheduleEventSegments(events, calendar, viewYear, month), [events, calendar, viewYear, month])
  const monthEventCount = useMemo(() => new Set(layout.segments.map(segment => segment.event.id)).size, [layout.segments])
  const sortedEvents = useMemo(() => sortScheduleEvents(events, calendar), [events, calendar])
  const cells = useMemo(() => {
    const days = calendar.months[month - 1].days
    return Array.from({ length: layout.weeks * calendar.weekLength }, (_, index) => {
      const day = index - layout.leadingDays + 1
      return day >= 1 && day <= days ? day : null
    })
  }, [calendar, month, layout.leadingDays, layout.weeks])
  const maxLane = layout.segments.reduce((max, segment) => Math.max(max, segment.lane), 0)
  const activeEvent = modal?.eventId ? eventIndex.get(modal.eventId) : null

  useEffect(() => {
    if (!modal?.eventId || activeEvent) return
    // A remote deletion must not leave a stale detail/editor over the board.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModal(null)
  }, [modal?.eventId, activeEvent])

  useEffect(() => {
    if (!activeNovelId || readOnly || viewSettings.openMode !== SCHEDULE_OPEN_MODES.LAST_VIEWED) return
    if (viewSettings.lastViewedYear === viewYear && viewSettings.lastViewedMonth === month) return
    updateNovel(activeNovelId, { scheduleViewSettings: {
      openMode: viewSettings.openMode, defaultYear: viewSettings.defaultYear, defaultMonth: viewSettings.defaultMonth,
      lastViewedYear: viewYear, lastViewedMonth: month,
    } })
  }, [activeNovelId, readOnly, updateNovel, viewSettings, viewYear, month])

  const previousMonth = () => {
    if (month === 1) { setViewMonth(calendar.months.length); setViewYear(year => year - 1) } else setViewMonth(month - 1)
  }
  const nextMonth = () => {
    if (month === calendar.months.length) { setViewMonth(1); setViewYear(year => year + 1) } else setViewMonth(month + 1)
  }
  const create = day => { if (!store.readOnly) setModal({ type: 'create', day }) }
  const categoryFor = event => categoryIndex.get(normalizeScheduleCategoryId(event.category)) || { label: titleCase(event.category), color: '#94a3b8' }
  const saved = event => {
    setModal(null)
    setViewYear(event.year)
    setViewMonth(Math.max(1, Math.min(event.month, calendar.months.length)))
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <header className="schedule-header">
        <button type="button" onClick={previousMonth} aria-label="Previous schedule month" className="schedule-icon-button">←</button>
        <div className="schedule-date-controls">
          <label className="schedule-date-field schedule-date-field--month"><span>Month</span><select value={month} onChange={event => setViewMonth(Number(event.target.value))} className="field" aria-label="Schedule month">{calendar.months.map((item, index) => <option key={index} value={index + 1}>{item.name}</option>)}</select></label>
          <label className="schedule-date-field schedule-date-field--year"><span>Year</span><input type="number" value={viewYear} onChange={event => { const value = Number(event.target.value); setViewYear(Number.isFinite(value) ? Math.trunc(value) : 1) }} className="field" aria-label="Schedule year" /></label>
        </div>
        <button type="button" onClick={nextMonth} aria-label="Next schedule month" className="schedule-icon-button">→</button>
        <div className="schedule-toolbar-actions">
          <div className="schedule-view-toggle" role="group" aria-label="Schedule view">{['month', 'list'].map(mode => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)} className={viewMode === mode ? 'is-active' : ''}>{mode}</button>)}</div>
          <button type="button" disabled={store.readOnly} onClick={() => setModal({ type: 'settings' })} className="schedule-secondary-button">Calendar settings</button>
          <button type="button" disabled={store.readOnly} onClick={() => create(1)} className="schedule-primary-button">Add event</button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto px-3 sm:px-5 pb-5">
        {viewMode === 'month' ? <>
          <h2 className="schedule-month-title">{calendar.months[month - 1].name} · Year {viewYear}</h2>
          <div className="grid gap-0.5 pt-3 mb-0.5" style={{ gridTemplateColumns: `repeat(${calendar.weekLength}, minmax(5.75rem, 1fr))`, minWidth: `${calendar.weekLength * 103}px` }}>{calendar.dayNames.map((name, index) => <div key={index} className="truncate py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{name}</div>)}</div>
          <div className="schedule-grid" style={{ '--schedule-week': calendar.weekLength, gridAutoRows: `${Math.max(88, 52 + (maxLane + 1) * 22)}px` }}>
            {cells.map((day, index) => day ? <button key={index} type="button" disabled={store.readOnly} aria-label={`Add event on ${calendar.months[month - 1].name}, day ${day}, year ${viewYear}`} className="schedule-day-cell text-left" onClick={() => create(day)} style={{ gridColumn: index % calendar.weekLength + 1, gridRow: Math.floor(index / calendar.weekLength) + 1 }}><span className="schedule-day-number">{day}</span></button> : <span key={index} aria-hidden="true" style={{ gridColumn: index % calendar.weekLength + 1, gridRow: Math.floor(index / calendar.weekLength) + 1 }} />)}
            {layout.segments.map((segment, index) => { const category = categoryFor(segment.event); return <button key={`${segment.event.id}-${index}`} type="button" className="schedule-ribbon" onClick={() => setModal({ type: 'detail', eventId: segment.event.id })} title={segment.event.title} style={{ '--event-color': category.color, gridColumn: `${segment.col + 1} / span ${segment.span}`, gridRow: segment.week + 1, marginTop: `${28 + segment.lane * 22}px`, borderTopLeftRadius: segment.startsBefore ? 0 : 6, borderBottomLeftRadius: segment.startsBefore ? 0 : 6, borderTopRightRadius: segment.endsAfter ? 0 : 6, borderBottomRightRadius: segment.endsAfter ? 0 : 6 }}>{segment.startsBefore ? '← ' : ''}{segment.event.title}{segment.endsAfter ? ' →' : ''}</button> })}
          </div>
          {!monthEventCount && <div className="schedule-empty-month"><p>No events in {calendar.months[month - 1].name}, Year {viewYear}</p>{!store.readOnly && <button type="button" onClick={() => create(1)} className="schedule-primary-button">Add event</button>}</div>}
          <div className="flex flex-wrap gap-4 mt-4">{categories.map(category => <span key={category.id} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><i aria-hidden="true" className="w-2.5 h-2.5 rounded-sm" style={{ background: category.color }} />{category.label}</span>)}</div>
        </> : <section className="py-4 max-w-3xl" aria-label="Scheduled events">
          {!sortedEvents.length ? <div className="schedule-empty-month"><p>No scheduled events yet.</p>{!store.readOnly && <button type="button" onClick={() => create(1)} className="schedule-primary-button">Add the first event</button>}</div> : <div className="space-y-2">{sortedEvents.map(event => { const category = categoryFor(event); return <button type="button" key={event.id} onClick={() => setModal({ type: 'detail', eventId: event.id })} className="w-full text-left panel-soft rounded-lg border-l-4 p-3 flex gap-4" style={{ borderLeftColor: category.color }}><time className="shrink-0 w-36 text-xs text-[var(--text-muted)]">{scheduleDateLabel(calendar, event)}</time><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{event.title || 'Untitled event'}</strong>{event.description && <span className="block truncate text-sm text-[var(--text-muted)] mt-1">{event.description}</span>}<span className="flex flex-wrap gap-2 mt-2 text-xs text-[var(--text-muted)]"><i style={{ color: category.color }}>{category.label}</i>{event.duration > 1 && <i>{event.duration} days</i>}{event.tags.map(tag => <i key={tag}>#{tag}</i>)}</span></span></button> })}</div>}
        </section>}
      </main>

      {modal?.type === 'create' && <ScheduleEventEditor date={{ day: modal.day, month, year: viewYear }} store={store} categories={categories} calendar={calendar} onClose={() => setModal(null)} onSaved={saved} />}
      {modal?.type === 'edit' && activeEvent && <ScheduleEventEditor key={activeEvent.id} event={activeEvent} date={activeEvent} store={store} categories={categories} calendar={calendar} onClose={() => setModal(null)} onSaved={saved} />}
      {modal?.type === 'detail' && activeEvent && <EventDetail event={activeEvent} store={store} calendar={calendar} category={categoryFor(activeEvent)} onClose={() => setModal(null)} onEdit={() => setModal({ type: 'edit', eventId: activeEvent.id })} />}
      {modal?.type === 'settings' && <ScheduleSettingsModal store={store} onClose={() => setModal(null)} />}
    </div>
  )
}

function EventDetail({ event, store, calendar, category, onClose, onEdit }) {
  const linked = (ids, items, label) => ids.map(id => `${items?.find(item => item.id === id)?.name || `Unavailable ${label} (${id})`}`)
  const characters = linked(event.linkedCharacters, store.characters, 'character')
  const locations = linked(event.linkedLocations, store.locations, 'location')
  return <StudioSheet title={event.title || 'Untitled event'} eyebrow="Schedule event" onClose={onClose} narrow centered>
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">{scheduleRangeLabel(calendar, event)}</p>
      <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ color: category.color, background: `${category.color}22` }}>{category.label}</span>
      {event.description && <p className="whitespace-pre-wrap text-sm">{event.description}</p>}
      {!!event.tags.length && <p className="flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">{event.tags.map(tag => <span key={tag}>#{tag}</span>)}</p>}
      {!!characters.length && <p className="text-sm"><strong>Characters:</strong> {characters.join(', ')}</p>}
      {!!locations.length && <p className="text-sm"><strong>Locations:</strong> {locations.join(', ')}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>{!store.readOnly && <button type="button" className="btn btn-primary" onClick={onEdit}>Edit</button>}</div>
    </div>
  </StudioSheet>
}
