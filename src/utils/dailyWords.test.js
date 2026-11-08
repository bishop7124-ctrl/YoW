import { describe, expect, it } from 'vitest'
import { dailyWordsForScenes, sceneNetByDate, totalWordsOnDate, getSceneHistory } from './dailyWords'

const entry = (date, words, timestamp) => ({ date, words, timestamp })

describe('dailyWords', () => {
  it('uses the last entry per date, net of the previous logged date', () => {
    const scene = {
      content: 'a '.repeat(300),
      wordHistory: [entry('2026-09-01', 100, 1), entry('2026-09-01', 200, 2), entry('2026-09-02', 300, 3)],
    }
    expect(sceneNetByDate(scene)).toEqual({ '2026-09-01': 200, '2026-09-02': 100 })
  })

  it('never reports negative days when text is deleted', () => {
    const scene = {
      content: 'a '.repeat(100),
      wordHistory: [entry('2026-09-01', 500, 1), entry('2026-09-02', 100, 2)],
    }
    expect(sceneNetByDate(scene)['2026-09-02']).toBe(0)
  })

  it('counts intra-day dips as net, not gross', () => {
    const scene = {
      content: 'a '.repeat(50),
      wordHistory: [entry('2026-09-01', 0, 1), entry('2026-09-01', 400, 2), entry('2026-09-01', 50, 3)],
    }
    expect(sceneNetByDate(scene)).toEqual({ '2026-09-01': 50 })
  })

  it('sums scenes and reflects unlogged current text', () => {
    const ts = Date.parse('2026-09-03T10:00:00')
    const scenes = [
      { content: 'w '.repeat(10), lastModified: ts, wordHistory: [entry('2026-09-02', 4, ts - 86400000)] },
      { content: 'w '.repeat(5), lastModified: ts, wordHistory: [] },
    ]
    expect(dailyWordsForScenes(scenes)).toEqual({ '2026-09-02': 4, '2026-09-03': 11 })
    expect(totalWordsOnDate(scenes, '2026-09-03')).toBe(11)
  })

  it('tolerates missing input', () => {
    expect(dailyWordsForScenes(undefined)).toEqual({})
    expect(getSceneHistory({}).length).toBe(1)
  })
})

describe('wordsOnDates', () => {
  it('returns zero for days with no writing in one pass', async () => {
    const { wordsOnDates } = await import('./dailyWords')
    const scenes = [{ content: 'x', wordHistory: [{ date: '2026-09-02', words: 4, timestamp: 1 }, { date: '2026-09-03', words: 9, timestamp: 2 }] }]
    // current content ("x" = 1 word) differs from last history entry, so it syncs
    const out = wordsOnDates(scenes, ['2026-09-01', '2026-09-02'])
    expect(out[0]).toEqual({ date: '2026-09-01', words: 0 })
    expect(out[1].date).toBe('2026-09-02')
  })
})
