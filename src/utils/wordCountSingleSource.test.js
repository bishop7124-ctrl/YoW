import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { countWords, nextWordHistory, toDateKey } from './dailyWords'

// One rule for counting scene words and recording daily history (owner decision, 2026-11-11). If this fails,
// someone added a second copy: import countWords / nextWordHistory from src/utils/dailyWords.js instead.

const SRC = new URL('..', import.meta.url).pathname
const walk = dir => readdirSync(dir).flatMap(name => {
  const full = join(dir, name)
  if (statSync(full).isDirectory()) return walk(full)
  return /\.(js|jsx)$/.test(name) && !/\.test\./.test(name) ? [full] : []
})
const files = walk(SRC).filter(file => !file.endsWith('/utils/dailyWords.js'))

describe('single source of truth for manuscript word counts and daily history', () => {
  it('no other module defines its own countWords', () => {
    const offenders = files.filter(file => /\b(?:const|function)\s+countWords\b/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('no other module re-implements the history append rule (replace today, cap at 120 entries)', () => {
    const offenders = files.filter(file => /\.slice\(-120\)/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('scene text is not counted with a hand-rolled whitespace split in the editor, store or dashboards', () => {
    const watched = ['components/Manuscript/', 'store/useStore.js', 'components/dashboard/ProjectDashboard.jsx', 'utils/sceneVersions.js']
    const offenders = files
      .filter(file => watched.some(part => file.includes(part)))
      .filter(file => /content\??\.trim\(\)\.(?:match\(\/\\S\+\/g\)|split\(\/\\s\+\/\))/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})

describe('nextWordHistory', () => {
  const day = (iso, h = 12) => new Date(`${iso}T${String(h).padStart(2, '0')}:00:00`).getTime()
  it('replaces today\'s entry and appends on a new day', () => {
    const first = nextWordHistory([], 'one two', day('2026-11-10'))
    expect(first).toEqual([{ date: '2026-11-10', words: 2, timestamp: day('2026-11-10') }])
    const sameDay = nextWordHistory(first, 'one two three', day('2026-11-10', 15))
    expect(sameDay).toHaveLength(1)
    expect(sameDay[0].words).toBe(3)
    const nextDay = nextWordHistory(sameDay, 'one two three four', day('2026-11-11'))
    expect(nextDay.map(entry => entry.date)).toEqual(['2026-11-10', '2026-11-11'])
  })
  it('keeps only the latest 120 days and tolerates missing history', () => {
    let history = []
    for (let i = 0; i < 130; i += 1) history = nextWordHistory(history, 'w', Date.UTC(2026, 0, 1 + i, 12))
    expect(history).toHaveLength(120)
    expect(nextWordHistory(undefined, '', day('2026-11-11'))[0].words).toBe(0)
    expect(nextWordHistory('junk', 'a b', day('2026-11-11'))).toHaveLength(1)
  })
  it('counts words the same way everywhere', () => {
    expect(countWords('  one  two\nthree ')).toBe(3)
    expect(countWords(null)).toBe(0)
    expect(toDateKey(day('2026-03-04'))).toBe('2026-03-04')
  })
})
