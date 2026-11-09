import { describe, expect, it } from 'vitest'
import { buildGoalProgress, weekStartKey, monthStartKey, wordsInRange, recentPace, daysBetween, sprintWords, formatClock, isDateKey } from './goalProgress'

// 2026-11-11 is a Wednesday.
const TODAY = '2026-11-11'

describe('date helpers', () => {
  it('finds Monday as the start of the week, including from a Sunday and a Monday', () => {
    expect(weekStartKey('2026-11-11')).toBe('2026-11-09')
    expect(weekStartKey('2026-11-15')).toBe('2026-11-09') // Sunday
    expect(weekStartKey('2026-11-09')).toBe('2026-11-09')
    expect(weekStartKey('2026-11-01')).toBe('2026-10-26') // crosses a month
  })
  it('counts whole days across daylight-saving changes', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2026-11-11', '2026-11-11')).toBe(0)
  })
  it('validates date keys', () => {
    expect(isDateKey('2026-11-11')).toBe(true)
    expect(isDateKey('11/11/2026')).toBe(false)
    expect(monthStartKey('2026-11-27')).toBe('2026-11-01')
  })
})

describe('weekly and monthly goals', () => {
  const dailyWords = { '2026-11-08': 900, '2026-11-09': 400, '2026-11-10': 600, '2026-11-11': 300, '2026-10-30': 700 }
  it('sums this week (Monday to today) and this month only', () => {
    expect(wordsInRange(dailyWords, '2026-11-09', TODAY)).toBe(1300)
    const p = buildGoalProgress({ dailyWords, goals: { weekly: 2000, monthly: 5000 }, today: TODAY })
    expect(p.week).toMatchObject({ words: 1300, goal: 2000, remaining: 700, pct: 65, met: false, daysLeft: 5 })
    expect(p.week.perDayToFinish).toBe(140)
    expect(p.month).toMatchObject({ words: 2200, goal: 5000, remaining: 2800, daysLeft: 20 })
  })
  it('marks a goal met and never reports a negative remainder', () => {
    const p = buildGoalProgress({ dailyWords, goals: { weekly: 1000 }, today: TODAY })
    expect(p.week).toMatchObject({ met: true, remaining: 0, pct: 100, perDayToFinish: 0 })
  })
  it('an unset goal is off, not zero progress', () => {
    const p = buildGoalProgress({ dailyWords, goals: {}, today: TODAY })
    expect(p.week).toMatchObject({ goal: 0, pct: 0, met: false })
    expect(p.deadline).toBeNull()
  })
  it('ignores junk entries in the daily map', () => {
    expect(wordsInRange({ 'not-a-date': 50, '2026-11-10': -20, '2026-11-11': 'x' }, '2026-11-01', TODAY)).toBe(0)
  })
})

describe('recent pace', () => {
  it('averages the last 14 days including empty days', () => {
    const daily = { '2026-11-11': 1400 }
    expect(recentPace(daily, TODAY)).toBe(100)
    expect(recentPace({ '2026-10-01': 5000 }, TODAY)).toBe(0) // outside the window
  })
})

describe('deadline projection', () => {
  const pace = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`2026-11-${String(11 - (i % 11)).padStart(2, '0')}`, 0]))
  const steady = { '2026-11-11': 400, '2026-11-10': 500, '2026-11-09': 500 } // pace 100/day over three writing days
  it('reports on track when the recent pace meets what is needed', () => {
    const p = buildGoalProgress({ dailyWords: steady, goals: { manuscript: 10000, deadline: '2027-03-01' }, totalWords: 8000, today: TODAY })
    expect(p.deadline.status).toBe('on-track')
    expect(p.deadline.remainingWords).toBe(2000)
    expect(p.deadline.projectedFinish).toBe('2026-12-01') // 2000 / 100 = 20 days
  })
  it('reports behind, with the words a day required', () => {
    const p = buildGoalProgress({ dailyWords: steady, goals: { manuscript: 10000, deadline: '2026-11-21' }, totalWords: 8000, today: TODAY })
    expect(p.deadline.status).toBe('behind')
    expect(p.deadline.requiredPerDay).toBe(Math.ceil(2000 / 11))
    expect(p.deadline.message).toMatch(/Behind/)
  })
  it('does not print a date decades away for a tiny pace', () => {
    const p = buildGoalProgress({ dailyWords: { '2026-11-11': 5, '2026-11-10': 5, '2026-11-09': 4 }, goals: { manuscript: 90000, deadline: '2026-12-31' }, totalWords: 0, today: TODAY })
    expect(p.deadline.status).toBe('behind')
    expect(p.deadline.projectedFinish).toBeNull()
    expect(p.deadline.message).toMatch(/more than ten years/)
  })
  it('does not warn "behind" off a single writing day: it explains it needs a few days of history', () => {
    const p = buildGoalProgress({ dailyWords: { '2026-11-11': 454 }, goals: { manuscript: 90000, deadline: '2027-08-31' }, totalWords: 454, today: TODAY })
    expect(p.deadline.status).toBe('no-pace')
    expect(p.deadline.message).toMatch(/few different days/)
  })
  it('explains that days off count as zero in the pace it quotes', () => {
    const p = buildGoalProgress({ dailyWords: { '2026-11-11': 400, '2026-11-10': 500, '2026-11-09': 500 }, goals: { manuscript: 10000, deadline: '2026-11-21' }, totalWords: 8000, today: TODAY })
    expect(p.deadline.message).toMatch(/days off count as zero/)
  })
  it('says there is no projection without recent writing, instead of guessing', () => {
    const p = buildGoalProgress({ dailyWords: pace, goals: { manuscript: 10000, deadline: '2026-12-31' }, totalWords: 100, today: TODAY })
    expect(p.deadline.status).toBe('no-pace')
    expect(p.deadline.projectedFinish).toBeNull()
  })
  it('handles done, passed, due today and no target', () => {
    const base = { dailyWords: steady, today: TODAY }
    expect(buildGoalProgress({ ...base, goals: { manuscript: 5000, deadline: '2027-01-01' }, totalWords: 5000 }).deadline.status).toBe('done')
    const passed = buildGoalProgress({ ...base, goals: { manuscript: 5000, deadline: '2026-11-01' }, totalWords: 100 }).deadline
    expect(passed.status).toBe('passed')
    expect(passed.message).toMatch(/10 days ago/)
    const today = buildGoalProgress({ ...base, goals: { manuscript: 5000, deadline: TODAY }, totalWords: 4900 }).deadline
    expect(today.requiredPerDay).toBe(100)
    expect(buildGoalProgress({ ...base, goals: { deadline: '2027-01-01' }, totalWords: 100 }).deadline.status).toBe('no-target')
  })
  it('ignores an invalid deadline value', () => {
    expect(buildGoalProgress({ goals: { manuscript: 5000, deadline: 'soon' }, today: TODAY }).deadline).toBeNull()
  })
})

describe('sprint helpers', () => {
  it('counts words added and never goes negative', () => {
    expect(sprintWords(1000, 1250)).toBe(250)
    expect(sprintWords(1000, 900)).toBe(0)
    expect(sprintWords(undefined, 5)).toBe(5)
  })
  it('formats the clock', () => {
    expect(formatClock(25 * 60 * 1000)).toBe('25:00')
    expect(formatClock(61_000)).toBe('1:01')
    expect(formatClock(500)).toBe('0:01')
    expect(formatClock(-5)).toBe('0:00')
  })
})
