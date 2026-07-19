import { useState, useEffect } from 'react'
import {
  getScheduleCalendar, defaultScheduleCalendar,
  MAX_MONTHS, MAX_DAYS_PER_MONTH, MAX_WEEK_LENGTH,
} from '../../utils/scheduleCalendar'

const INPUT_STYLE = {
  width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '7px 10px', color: 'var(--text-main)', fontSize: 13,
  boxSizing: 'border-box', fontFamily: 'inherit',
}

const LABEL_STYLE = { display: 'block', color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }

const SECTION_TITLE = {
  margin: '0 0 8px', fontSize: 11, fontWeight: 800, letterSpacing: '.08em',
  textTransform: 'uppercase', color: 'var(--accent)',
}

// Calendar structure settings for the Schedule workspace. Saves the raw shape
// to novel.scheduleCalendar; getScheduleCalendar() normalizes on every read, so
// partial or odd values here can never break the calendar.
export default function ScheduleSettingsModal({ store, onClose }) {
  const calendar = getScheduleCalendar(store.activeNovel)
  const [months, setMonths] = useState(() => calendar.months.map(m => ({ ...m })))
  const [weekLength, setWeekLength] = useState(calendar.weekLength)
  const [dayNames, setDayNames] = useState(() => [...calendar.dayNames])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setMonth = (index, patch) =>
    setMonths(prev => prev.map((m, i) => i === index ? { ...m, ...patch } : m))

  const addMonth = () =>
    setMonths(prev => prev.length >= MAX_MONTHS ? prev : [...prev, { name: `Month ${prev.length + 1}`, days: 30 }])

  const removeMonth = (index) =>
    setMonths(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index))

  const setWeek = (value) => {
    const w = Math.max(1, Math.min(MAX_WEEK_LENGTH, parseInt(value, 10) || 1))
    setWeekLength(w)
    setDayNames(prev => Array.from({ length: w }, (_, i) => prev[i] ?? `Day ${i + 1}`))
  }

  const resetDefault = () => {
    const def = getScheduleCalendar({ scheduleCalendar: defaultScheduleCalendar() })
    setMonths(def.months.map(m => ({ ...m })))
    setWeekLength(def.weekLength)
    setDayNames([...def.dayNames])
  }

  const save = () => {
    // Round-trip through the normalizer so the stored shape is always clean
    // (ints clamped, labels trimmed/padded) regardless of raw input state.
    const normalized = getScheduleCalendar({
      scheduleCalendar: { months, weekLength, dayNames: dayNames.slice(0, weekLength) },
    })
    store.updateNovel(store.activeNovelId, {
      scheduleCalendar: {
        months: normalized.months,
        weekLength: normalized.weekLength,
        dayNames: normalized.dayNames,
      },
    })
    onClose()
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div style={{ background: 'var(--bg-nav)', border: '1px solid var(--border)', borderRadius: 12, width: 560, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ color: 'var(--text-main)', fontWeight: 700, fontSize: 16, margin: 0 }}>Calendar settings</h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, margin: '0 0 18px' }}>
          Shape this project's story calendar — month names and lengths, week length, and day labels.
          Existing events keep their dates; anything outside the new calendar stays visible in the List view.
        </p>

        {/* Months */}
        <p style={SECTION_TITLE}>Months ({months.length})</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {months.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
              <input
                value={m.name}
                onChange={e => setMonth(i, { name: e.target.value })}
                placeholder={`Month ${i + 1}`}
                aria-label={`Month ${i + 1} name`}
                style={{ ...INPUT_STYLE, flex: 1 }}
              />
              <input
                type="number" min="1" max={MAX_DAYS_PER_MONTH}
                value={m.days}
                onChange={e => setMonth(i, { days: e.target.value })}
                aria-label={`Month ${i + 1} days`}
                style={{ ...INPUT_STYLE, width: 74, flexShrink: 0 }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>days</span>
              <button
                onClick={() => removeMonth(i)}
                disabled={months.length <= 1}
                title="Remove month"
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: months.length <= 1 ? 'var(--border)' : 'var(--text-muted)', cursor: months.length <= 1 ? 'not-allowed' : 'pointer', padding: '4px 9px', fontSize: 13, flexShrink: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addMonth}
          disabled={months.length >= MAX_MONTHS}
          style={{ padding: '6px 14px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', color: months.length >= MAX_MONTHS ? 'var(--border)' : 'var(--text-muted)', fontSize: 12, cursor: months.length >= MAX_MONTHS ? 'not-allowed' : 'pointer', marginBottom: 20 }}
        >
          + Add month
        </button>

        {/* Week */}
        <p style={SECTION_TITLE}>Week</p>
        <div style={{ marginBottom: 12, maxWidth: 180 }}>
          <label style={LABEL_STYLE}>Days per week (1–{MAX_WEEK_LENGTH})</label>
          <input type="number" min="1" max={MAX_WEEK_LENGTH} value={weekLength} onChange={e => setWeek(e.target.value)} style={INPUT_STYLE} />
        </div>
        <label style={LABEL_STYLE}>Day labels</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, marginBottom: 20 }}>
          {dayNames.slice(0, weekLength).map((name, i) => (
            <input
              key={i}
              value={name}
              onChange={e => setDayNames(prev => prev.map((d, j) => j === i ? e.target.value : d))}
              placeholder={`Day ${i + 1}`}
              aria-label={`Day ${i + 1} label`}
              style={INPUT_STYLE}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button onClick={resetDefault} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', marginRight: 'auto' }}>
            Reset to default
          </button>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={save} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: 'var(--bg-main)', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
            Save calendar
          </button>
        </div>
      </div>
    </div>
  )
}
