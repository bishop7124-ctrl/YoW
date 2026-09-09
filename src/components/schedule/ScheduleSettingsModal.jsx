import { useState } from 'react'
import { StudioSheet } from '../presentation/Studio'
import {
  getScheduleCalendar, getScheduleViewSettings, defaultScheduleCalendar,
  SCHEDULE_OPEN_MODES, MAX_MONTHS, MAX_DAYS_PER_MONTH, MAX_WEEK_LENGTH,
} from '../../utils/scheduleCalendar.js'

const storedCalendar = calendar => ({ months: calendar.months, weekLength: calendar.weekLength, dayNames: calendar.dayNames })
const storedView = view => ({
  openMode: view.openMode, defaultYear: view.defaultYear, defaultMonth: view.defaultMonth,
  lastViewedYear: view.lastViewedYear, lastViewedMonth: view.lastViewedMonth,
})
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export default function ScheduleSettingsModal({ store, onClose }) {
  const [original] = useState(() => ({
    calendar: storedCalendar(getScheduleCalendar(store.activeNovel)),
    view: storedView(getScheduleViewSettings(store.activeNovel)),
  }))
  const [months, setMonths] = useState(() => original.calendar.months.map(month => ({ ...month })))
  const [weekLength, setWeekLength] = useState(original.calendar.weekLength)
  const [dayNames, setDayNames] = useState(() => [...original.calendar.dayNames])
  const [openMode, setOpenMode] = useState(original.view.openMode)
  const [defaultYear, setDefaultYear] = useState(original.view.defaultYear)
  const [defaultMonth, setDefaultMonth] = useState(original.view.defaultMonth)
  const [error, setError] = useState('')

  const setMonth = (index, patch) => setMonths(current => current.map((month, position) => position === index ? { ...month, ...patch } : month))
  const setWeek = value => {
    const length = Math.max(1, Math.min(MAX_WEEK_LENGTH, Number.parseInt(value, 10) || 1))
    setWeekLength(length)
    setDayNames(current => Array.from({ length }, (_, index) => current[index] ?? `Day ${index + 1}`))
  }
  const reset = () => {
    const defaults = getScheduleCalendar({ scheduleCalendar: defaultScheduleCalendar() })
    setMonths(defaults.months.map(month => ({ ...month })))
    setWeekLength(defaults.weekLength)
    setDayNames([...defaults.dayNames])
  }
  const submit = event => {
    event.preventDefault()
    setError('')
    const currentCalendar = storedCalendar(getScheduleCalendar(store.activeNovel))
    const currentView = storedView(getScheduleViewSettings(store.activeNovel, currentCalendar))
    if (!same(currentCalendar, original.calendar) || !same(currentView, original.view)) {
      setError('Calendar settings changed elsewhere. Your draft is still here; close and review the latest settings before retrying.')
      return
    }
    const normalized = getScheduleCalendar({ scheduleCalendar: { months, weekLength, dayNames } })
    const normalizedView = getScheduleViewSettings({ scheduleViewSettings: {
      openMode, defaultYear, defaultMonth,
      lastViewedYear: original.view.lastViewedYear, lastViewedMonth: original.view.lastViewedMonth,
    } }, normalized)
    store.updateNovel(store.activeNovelId, { scheduleCalendar: storedCalendar(normalized), scheduleViewSettings: storedView(normalizedView) })
    event.currentTarget.dispatchEvent(new CustomEvent('studio-form-saved', { bubbles: true }))
    onClose()
  }

  return (
    <StudioSheet title="Calendar settings" eyebrow="Schedule" onClose={onClose} centered>
      <form data-confirms-save onSubmit={submit} className="space-y-6">
        <p className="text-sm text-[var(--text-muted)]">Shape this project’s story calendar. Existing events retain their stored dates; events outside a revised calendar remain available in List view.</p>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <fieldset disabled={store.readOnly} className="space-y-3">
          <legend className="studio-kicker mb-2">Opening view</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="schedule-open-mode" checked={openMode === SCHEDULE_OPEN_MODES.FIXED} onChange={() => setOpenMode(SCHEDULE_OPEN_MODES.FIXED)} /> Open to a chosen month and year</label>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3 pl-6">
            <label className="text-sm">Month<select aria-label="Default schedule month" className="field w-full text-base" value={Math.min(Number(defaultMonth) || 1, months.length)} onChange={event => setDefaultMonth(Number(event.target.value))} disabled={store.readOnly || openMode !== SCHEDULE_OPEN_MODES.FIXED}>{months.map((month, index) => <option key={index} value={index + 1}>{month.name || `Month ${index + 1}`}</option>)}</select></label>
            <label className="text-sm">Year<input aria-label="Default schedule year" type="number" className="field w-full text-base" value={defaultYear} onChange={event => setDefaultYear(event.target.value)} disabled={store.readOnly || openMode !== SCHEDULE_OPEN_MODES.FIXED} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="schedule-open-mode" checked={openMode === SCHEDULE_OPEN_MODES.LAST_VIEWED} onChange={() => setOpenMode(SCHEDULE_OPEN_MODES.LAST_VIEWED)} /> Preserve the last viewed month and year</label>
        </fieldset>

        <fieldset disabled={store.readOnly}>
          <legend className="studio-kicker mb-2">Months ({months.length})</legend>
          <div className="space-y-2">{months.map((month, index) => <div key={index} className="grid grid-cols-[1.5rem_minmax(0,1fr)_5rem_auto] items-center gap-2"><span className="text-xs text-[var(--text-muted)] text-right">{index + 1}</span><input aria-label={`Month ${index + 1} name`} className="field w-full text-base" value={month.name} onChange={event => setMonth(index, { name: event.target.value })} /><input aria-label={`Month ${index + 1} days`} type="number" min="1" max={MAX_DAYS_PER_MONTH} className="field w-full text-base" value={month.days} onChange={event => setMonth(index, { days: event.target.value })} /><button type="button" data-dirties-form className="btn btn-secondary" aria-label={`Remove month ${index + 1}`} disabled={months.length <= 1} onClick={() => setMonths(current => current.filter((_, position) => position !== index))}>×</button></div>)}</div>
          <button type="button" data-dirties-form className="btn btn-secondary mt-3" disabled={months.length >= MAX_MONTHS} onClick={() => setMonths(current => [...current, { name: `Month ${current.length + 1}`, days: 30 }])}>Add month</button>
        </fieldset>

        <fieldset disabled={store.readOnly}>
          <legend className="studio-kicker mb-2">Week</legend>
          <label className="block text-sm max-w-48">Days per week (1–{MAX_WEEK_LENGTH})<input aria-label="Days per schedule week" type="number" min="1" max={MAX_WEEK_LENGTH} className="field w-full text-base" value={weekLength} onChange={event => setWeek(event.target.value)} /></label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">{dayNames.slice(0, weekLength).map((name, index) => <input key={index} aria-label={`Day ${index + 1} label`} className="field w-full text-base" value={name} onChange={event => setDayNames(current => current.map((day, position) => position === index ? event.target.value : day))} />)}</div>
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
          {!store.readOnly && <button type="button" data-dirties-form className="btn btn-secondary mr-auto" onClick={reset}>Reset to default</button>}
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {!store.readOnly && <button type="submit" className="btn btn-primary">Save calendar</button>}
        </div>
      </form>
    </StudioSheet>
  )
}
