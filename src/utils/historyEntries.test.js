import { describe, expect, it } from 'vitest'
import { buildHistoryEntries, normalizeHistoryEntry } from './historyEntries'

describe('History records', () => {
  it('shows standalone history immediately without creating timeline data', () => {
    const history = [{ id: 'h', title: 'Myth', content: 'Before time', dateRange: '5 BCE', linkedCharacters: ['c', 'c'] }]
    const before = JSON.stringify(history)
    expect(buildHistoryEntries([], history)).toEqual([expect.objectContaining({ id: 'h', sourceType: 'history', description: 'Before time', timelineId: null, linkedCharacters: ['c'] })])
    expect(JSON.stringify(history)).toBe(before)
  })

  it.each(['both', 'forward', 'reverse'])('shows a linked pair once with %s pointers and uses history content', direction => {
    const timeline = [{ id: 't', title: 'Old title', ...(direction !== 'reverse' ? { worldHistoryEntryId: 'h' } : {}) }]
    const history = [{ id: 'h', title: 'Current title', content: 'Current', description: 'Stale', ...(direction !== 'forward' ? { timelineEventId: 't' } : {}) }]
    expect(buildHistoryEntries(timeline, history)).toEqual([expect.objectContaining({ title: 'Current title', description: 'Current', timelineId: 't', historyId: 'h' })])
  })

  it('does not merge same titles, colliding IDs or conflicting claims', () => {
    const entries = buildHistoryEntries([{ id: 'same', title: 'Same' }], [{ id: 'same', title: 'Same' }])
    expect(entries).toHaveLength(2)
    expect(new Set(entries.map(entry => entry.recordKey)).size).toBe(2)
    const conflicts = buildHistoryEntries([{ id: 't', worldHistoryEntryId: 'h1' }], [{ id: 'h1' }, { id: 'h2', timelineEventId: 't' }])
    expect(conflicts).toHaveLength(3)
  })

  it('keeps history with missing counterparts and does not hide multiple timeline claims', () => {
    expect(buildHistoryEntries([], [{ id: 'h', timelineEventId: 'missing' }])).toHaveLength(1)
    expect(buildHistoryEntries([{ id: 't1', worldHistoryEntryId: 'h' }, { id: 't2', worldHistoryEntryId: 'h' }], [{ id: 'h' }])).toHaveLength(3)
  })

  it('sorts both sources by year and retains explicitly cleared content', () => {
    const entries = buildHistoryEntries([{ id: 'zero', date: 0 }, { id: 'undated' }], [{ id: 'old', dateRange: '2 BCE', content: '', description: 'Stale' }])
    expect(entries.map(entry => entry.id)).toEqual(['old', 'zero', 'undated'])
    expect(entries[0].description).toBe('')
    expect(normalizeHistoryEntry({ notes: 'Legacy notes' }).description).toBe('Legacy notes')
  })
})
