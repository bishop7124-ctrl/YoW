import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryBackend, resetStorageBackend, setStorageBackend } from '../storage/projectStorage'
import { addPendingDelete, loadPendingDeletes, removePendingDelete, withoutPendingDeletes } from './pendingDeletes'

beforeEach(() => { setStorageBackend(createMemoryBackend()) })
afterEach(() => { resetStorageBackend() })

describe('pending deletes (audit YOW-07)', () => {
  it('remembers a delete per account until it is confirmed', () => {
    addPendingDelete('user-a', 'characters', 'c1')
    addPendingDelete('user-a', 'characters', 'c1')
    addPendingDelete('user-a', 'scenes', 's1')
    expect(loadPendingDeletes('user-a').map(({ table, id }) => [table, id])).toEqual([['characters', 'c1'], ['scenes', 's1']])
    expect(loadPendingDeletes('user-b')).toEqual([])
    removePendingDelete('user-a', 'characters', 'c1')
    expect(loadPendingDeletes('user-a').map(entry => entry.id)).toEqual(['s1'])
    removePendingDelete('user-a', 'scenes', 's1')
    expect(loadPendingDeletes('user-a')).toEqual([])
  })

  it('hides pending-deleted records from loaded cloud data without touching anything else', () => {
    const data = {
      characters: [{ id: 'c1' }, { id: 'c2' }],
      scenes: [{ id: 's1' }],
      locations: [{ id: 'l1' }],
      _savedAt: 5,
    }
    const result = withoutPendingDeletes(data, [{ table: 'characters', id: 'c1' }, { table: 'scenes', id: 's1' }])
    expect(result.characters).toEqual([{ id: 'c2' }])
    expect(result.scenes).toEqual([])
    expect(result.locations).toEqual([{ id: 'l1' }])
    expect(result._savedAt).toBe(5)
    expect(data.characters).toHaveLength(2)
  })

  it('returns the data unchanged when nothing is pending', () => {
    const data = { characters: [{ id: 'c1' }] }
    expect(withoutPendingDeletes(data, [])).toBe(data)
  })
})
