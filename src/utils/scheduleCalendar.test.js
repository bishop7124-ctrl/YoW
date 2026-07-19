import { describe, it, expect } from 'vitest'
import {
  getScheduleCalendar, defaultScheduleCalendar, monthName, daysInMonth, absoluteDay,
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
