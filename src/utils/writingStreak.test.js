import { describe, expect, it } from 'vitest'
import { buildWritingGoalStreak, shiftDateKey, withDailyGoalHistory } from './writingStreak.js'

const TODAY = '2026-09-02'

describe('buildWritingGoalStreak', () => {
  it('counts consecutive goal days through today and records the best run', () => {
    const result = buildWritingGoalStreak({
      '2026-08-28': 500,
      '2026-08-29': 100,
      '2026-08-30': 500,
      '2026-08-31': 700,
      '2026-09-01': 500,
      '2026-09-02': 650,
    }, 500, [], TODAY)

    expect(result.currentStreak).toBe(4)
    expect(result.bestStreak).toBe(4)
    expect(result.todayMet).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('keeps yesterday\'s streak alive while today is still in progress', () => {
    const result = buildWritingGoalStreak({
      '2026-08-31': 500,
      '2026-09-01': 550,
      '2026-09-02': 120,
    }, 500, [], TODAY)

    expect(result.currentStreak).toBe(2)
    expect(result.todayMet).toBe(false)
    expect(result.remaining).toBe(380)
  })

  it('breaks the current streak when the previous completed day missed', () => {
    const result = buildWritingGoalStreak({
      '2026-08-30': 500,
      '2026-08-31': 500,
      '2026-09-01': 499,
      '2026-09-02': 0,
    }, 500, [], TODAY)

    expect(result.currentStreak).toBe(0)
    expect(result.bestStreak).toBe(2)
  })

  it('uses the goal that applied on each historical day', () => {
    const history = [
      { date: '1970-01-01', goal: 500 },
      { date: TODAY, goal: 1000 },
    ]
    const result = buildWritingGoalStreak({
      '2026-08-31': 550,
      '2026-09-01': 600,
      '2026-09-02': 1000,
    }, 1000, history, TODAY)

    expect(result.currentStreak).toBe(3)
    expect(result.recentDays.at(-2).goal).toBe(500)
    expect(result.recentDays.at(-1).goal).toBe(1000)
  })

  it('does not create goal hits while tracking is disabled', () => {
    const result = buildWritingGoalStreak({ [TODAY]: 2000 }, 0, [], TODAY)
    expect(result.enabled).toBe(false)
    expect(result.currentStreak).toBe(0)
    expect(result.bestStreak).toBe(0)
    expect(result.totalGoalDays).toBe(0)
  })
})

describe('withDailyGoalHistory', () => {
  it('preserves a legacy goal before applying a changed goal today', () => {
    expect(withDailyGoalHistory({ daily: 500 }, 750, TODAY)).toEqual({
      daily: 750,
      dailyHistory: [
        { date: '1970-01-01', goal: 500 },
        { date: TODAY, goal: 750 },
      ],
    })
  })

  it('replaces repeated edits made on the same day', () => {
    const first = withDailyGoalHistory({ daily: 500 }, 750, TODAY)
    const second = withDailyGoalHistory(first, 900, TODAY)
    expect(second.dailyHistory).toEqual([
      { date: '1970-01-01', goal: 500 },
      { date: TODAY, goal: 900 },
    ])
  })
})

describe('shiftDateKey', () => {
  it('moves safely across month and leap-year boundaries', () => {
    expect(shiftDateKey('2024-03-01', -1)).toBe('2024-02-29')
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01')
  })
})
