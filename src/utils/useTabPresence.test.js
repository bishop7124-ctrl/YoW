import { describe, expect, it } from 'vitest'
import { presenceHasPriority } from './useTabPresence.js'

describe('presenceHasPriority', () => {
  it('gives the scene lease to the editor that arrived first', () => {
    expect(presenceHasPriority(
      { id: 'later', startedAt: 200 },
      { id: 'earlier', startedAt: 100 },
    )).toBe(true)
    expect(presenceHasPriority(
      { id: 'earlier', startedAt: 100 },
      { id: 'later', startedAt: 200 },
    )).toBe(false)
  })

  it('uses the tab id as a deterministic tie-breaker', () => {
    expect(presenceHasPriority(
      { id: 'tab-b', startedAt: 100 },
      { id: 'tab-a', startedAt: 100 },
    )).toBe(true)
  })
})
