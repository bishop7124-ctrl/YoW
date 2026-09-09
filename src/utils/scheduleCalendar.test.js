import { describe, it, expect } from 'vitest'
import {
  getScheduleCalendar, defaultScheduleCalendar, monthName, daysInMonth, absoluteDay,
  getScheduleViewSettings, SCHEDULE_OPEN_MODES,
  getScheduleCategories, normalizeScheduleEvent, prepareScheduleEvent,
  scheduleDateOrdinal, scheduleDateFromOrdinal, scheduleRangeLabel,
  scheduleEventSegments, sortScheduleEvents, scheduleExportFields,
} from './scheduleCalendar.js'

describe('getScheduleCalendar', () => {
  it('returns the historical 12×30×7 default when no config exists', () => {
    for (const novel of [undefined, null, {}, { scheduleCalendar: null }, { scheduleCalendar: 'junk' }]) {
      const cal = getScheduleCalendar(novel)
      expect(cal.months).toHaveLength(12)
      expect(cal.months.every(m => m.days === 30)).toBe(true)
      expect(cal.months[0].name).toBe('First Month')
      expect(cal.weekLength).toBe(7)
      expect(cal.dayNames).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'])
      expect(cal.daysInYear).toBe(360)
      expect(cal.monthStarts[1]).toBe(30)
    }
  })

  it('normalizes a custom calendar', () => {
    const cal = getScheduleCalendar({
      scheduleCalendar: {
        months: [{ name: 'Frostwane', days: 40 }, { name: '', days: 25 }, { name: 'Embertide', days: '10' }],
        weekLength: 5,
        dayNames: ['Sunfall', 'Moonrise'],
      },
    })
    expect(cal.months).toEqual([
      { name: 'Frostwane', days: 40 },
      { name: 'Second Month', days: 25 },
      { name: 'Embertide', days: 10 },
    ])
    expect(cal.weekLength).toBe(5)
    expect(cal.dayNames).toEqual(['Sunfall', 'Moonrise', 'Day 3', 'Day 4', 'Day 5'])
    expect(cal.monthStarts).toEqual([0, 40, 65])
    expect(cal.daysInYear).toBe(75)
  })

  it('clamps out-of-range values', () => {
    const cal = getScheduleCalendar({
      scheduleCalendar: {
        months: Array.from({ length: 40 }, () => ({ name: 'M', days: 500 })),
        weekLength: 99,
      },
    })
    expect(cal.months).toHaveLength(24)
    expect(cal.months[0].days).toBe(99)
    expect(cal.weekLength).toBe(14)

    const tiny = getScheduleCalendar({ scheduleCalendar: { months: [{ days: 0 }], weekLength: 0 } })
    expect(tiny.months[0].days).toBe(1)
    expect(tiny.weekLength).toBe(1)
  })

  it('trims and caps label lengths', () => {
    const cal = getScheduleCalendar({
      scheduleCalendar: { months: [{ name: '  ' + 'x'.repeat(80), days: 30 }], weekLength: 2, dayNames: ['  ', 'y'.repeat(80)] },
    })
    expect(cal.months[0].name).toHaveLength(40)
    expect(cal.dayNames[0]).toBe('Day 1')
    expect(cal.dayNames[1]).toHaveLength(40)
  })
})

describe('calendar math', () => {
  const cal = getScheduleCalendar({
    scheduleCalendar: { months: [{ name: 'A', days: 20 }, { name: 'B', days: 10 }], weekLength: 6 },
  })

  it('monthName and daysInMonth fall back safely out of range', () => {
    expect(monthName(cal, 1)).toBe('A')
    expect(monthName(cal, 5)).toBe('Month 5')
    expect(daysInMonth(cal, 2)).toBe(10)
    expect(daysInMonth(cal, 5)).toBe(30)
  })

  it('absoluteDay uses cumulative month offsets', () => {
    expect(absoluteDay(cal, 1, 1)).toBe(0)
    expect(absoluteDay(cal, 1, 20)).toBe(19)
    expect(absoluteDay(cal, 2, 1)).toBe(20)
    expect(absoluteDay(cal, 2, 10)).toBe(29)
  })

  it('projects months beyond the configured year instead of collapsing them', () => {
    // Month 3 doesn't exist in a 2-month calendar; it lands past the year end
    expect(absoluteDay(cal, 3, 1)).toBe(30)
    expect(absoluteDay(cal, 4, 1)).toBe(60)
  })

  it('defaultScheduleCalendar matches the legacy layout', () => {
    const def = getScheduleCalendar({ scheduleCalendar: defaultScheduleCalendar() })
    expect(def.daysInYear).toBe(360)
    expect(absoluteDay(def, 5, 3)).toBe((5 - 1) * 30 + 2)
  })
})

describe('getScheduleViewSettings', () => {
  const calendar = getScheduleCalendar({
    scheduleCalendar: { months: [{ name: 'A', days: 20 }, { name: 'B', days: 10 }] },
  })

  it('defaults to opening the first month of year one', () => {
    expect(getScheduleViewSettings({}, calendar)).toMatchObject({
      openMode: SCHEDULE_OPEN_MODES.FIXED,
      defaultYear: 1,
      defaultMonth: 1,
      openYear: 1,
      openMonth: 1,
    })
  })

  it('opens to the fixed configured month and year', () => {
    expect(getScheduleViewSettings({
      scheduleViewSettings: { openMode: SCHEDULE_OPEN_MODES.FIXED, defaultYear: 9, defaultMonth: 2, lastViewedYear: 12, lastViewedMonth: 1 },
    }, calendar)).toMatchObject({
      openYear: 9,
      openMonth: 2,
    })
  })

  it('opens to the preserved last viewed month and year', () => {
    expect(getScheduleViewSettings({
      scheduleViewSettings: { openMode: SCHEDULE_OPEN_MODES.LAST_VIEWED, defaultYear: 9, defaultMonth: 2, lastViewedYear: 12, lastViewedMonth: 1 },
    }, calendar)).toMatchObject({
      openYear: 12,
      openMonth: 1,
    })
  })

  it('clamps configured months to the project calendar', () => {
    expect(getScheduleViewSettings({
      scheduleViewSettings: { defaultMonth: 9, lastViewedMonth: 8 },
    }, calendar)).toMatchObject({
      defaultMonth: 2,
      lastViewedMonth: 2,
    })
  })
})

describe('schedule entries', () => {
  const calendar = getScheduleCalendar({ scheduleCalendar: {
    months: [{ name: 'Longnight', days: 5 }, { name: 'Dawn', days: 4 }],
    weekLength: 3, dayNames: ['A', 'B', 'C'],
  } })

  it('normalizes malformed text, aliases, tags and links without mutating input', () => {
    const input = { title: 42, notes: 'Legacy body', year: '2', month: '2', day: '3', duration: '4', category: ' War Council ', tags: [' #Plot ', 'plot', 7], linkedCharacters: ['c', 'c', null] }
    const before = structuredClone(input)
    expect(normalizeScheduleEvent(input)).toMatchObject({ title: '42', description: 'Legacy body', year: 2, month: 2, day: 3, duration: 4, category: 'war_council', tags: ['plot', '7'], linkedCharacters: ['c'] })
    expect(input).toEqual(before)
    expect(normalizeScheduleEvent({ description: '', notes: 'STALE' }).description).toBe('')
  })

  it('deduplicates configured categories and safely restores defaults for blank configuration', () => {
    expect(getScheduleCategories({ categoryOptions: { schedule: [' War ', 'war!', 'Ritual'] } }).map(item => item.id)).toEqual(['war', 'ritual'])
    expect(getScheduleCategories({ categoryOptions: { schedule: [' ', null] } })).toHaveLength(6)
  })

  it('validates dates and duration rather than silently moving them', () => {
    expect(prepareScheduleEvent({ title: 'Outside', month: 3, day: 1 }, calendar).error).toContain('Month')
    expect(prepareScheduleEvent({ title: 'Outside', month: 2, day: 5 }, calendar).error).toContain('Day')
    expect(prepareScheduleEvent({ title: ' ', month: 1, day: 1 }, calendar).error).toContain('Title')
    expect(prepareScheduleEvent({ title: 'Valid', month: 2, day: 4 }, calendar).error).toBe('')
  })

  it('round-trips ordinals and formats ranges across months and years', () => {
    const endOfYear = { year: 1, month: 2, day: 4, duration: 3 }
    expect(scheduleDateFromOrdinal(calendar, scheduleDateOrdinal(calendar, endOfYear) + 2)).toEqual({ year: 2, month: 1, day: 2 })
    expect(scheduleRangeLabel(calendar, endOfYear)).toContain('Longnight, Day 2 · Year 2')
    expect(scheduleRangeLabel(calendar, { date: 'Sometime after dusk' })).toBe('Sometime after dusk')
  })

  it('aligns month cells to the continuous week and segments cross-year overlaps without lane collisions', () => {
    const result = scheduleEventSegments([
      { id: 'cross', title: 'Cross', year: 1, month: 2, day: 4, duration: 3 },
      { id: 'overlap', title: 'Overlap', year: 2, month: 1, day: 1, duration: 2 },
    ], calendar, 2, 1)
    expect(result.leadingDays).toBe(0)
    expect(result.segments.map(segment => segment.event.id)).toEqual(['cross', 'overlap'])
    expect(new Set(result.segments.map(segment => segment.lane)).size).toBe(2)
    expect(scheduleEventSegments([], calendar, 1, 2).leadingDays).toBe(2)
  })

  it('sorts numeric titles safely and exports live linked names with current prose', () => {
    expect(sortScheduleEvents([{ id: 'b', title: 2, year: 2 }, { id: 'a', title: 1, year: 1 }], calendar).map(item => item.id)).toEqual(['a', 'b'])
    const fields = scheduleExportFields({ project: { scheduleCalendar: { months: calendar.months, weekLength: 3 } }, characters: [{ id: 'c', name: 'Current hero' }], locations: [] }, { title: 'E', year: 1, month: 1, day: 1, linkedCharacters: ['c'], linkedLocations: ['gone'] })
    expect(fields).toContainEqual(['Characters', 'Current hero'])
    expect(fields).toContainEqual(['Locations', 'Location gone (unavailable)'])
  })
})
