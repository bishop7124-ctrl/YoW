import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryBackend, resetStorageBackend, setStorageBackend } from '../storage/projectStorage'
import { loadDirtyRecords, setDirtyTable, overlayDirtyRecords } from './dirtyRecords'

beforeEach(() => { setStorageBackend(createMemoryBackend()) })
afterEach(() => { resetStorageBackend() })

describe('dirty record tracking (audit YOW-04)', () => {
  it('reports "never tracked" as null and keeps each account separate', () => {
    expect(loadDirtyRecords('user-a')).toBeNull()
    setDirtyTable('user-a', 'characters', { c1: {} })
    expect(loadDirtyRecords('user-a')).toEqual({ characters: { c1: {} } })
    expect(loadDirtyRecords('user-b')).toBeNull()
  })

  it('replaces one table without touching another, and drops an emptied table', () => {
    setDirtyTable('user-a', 'characters', { c1: {} })
    setDirtyTable('user-a', 'locations', { l1: {} })
    setDirtyTable('user-a', 'characters', {})
    expect(loadDirtyRecords('user-a')).toEqual({ locations: { l1: {} } })
    setDirtyTable('user-a', 'locations', {})
    expect(loadDirtyRecords('user-a')).toEqual({})
  })
})

describe('overlayDirtyRecords', () => {
  const opts = { now: 1, conflictId: () => 'conflict-1' }

  it('keeps a locally edited record over an older cloud copy, however old the edit is', () => {
    const cloud = { characters: [{ id: 'c1', name: 'Old' }, { id: 'c2', name: 'Cloud only' }] }
    const local = { characters: [{ id: 'c1', name: 'Edited offline' }, { id: 'c2', name: 'Stale local' }] }
    const { data, conflicts } = overlayDirtyRecords(cloud, local, { characters: { c1: {} } }, opts)
    expect(data.characters).toEqual([{ id: 'c1', name: 'Edited offline' }, { id: 'c2', name: 'Cloud only' }])
    // The cloud's differing version of the edited record is kept for review, not discarded.
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ table: 'characters', recordId: 'c1', theirs: { id: 'c1', name: 'Old' } })
  })

  it('never lets a clean (acknowledged) local record override the cloud, including cloud deletions', () => {
    const cloud = { characters: [{ id: 'c1', name: 'Newer in cloud' }], novels: [] }
    const local = { characters: [{ id: 'c1', name: 'Stale' }, { id: 'c-deleted', name: 'Deleted elsewhere' }], novels: [{ id: 'n-deleted' }] }
    const { data, conflicts, pushes } = overlayDirtyRecords(cloud, local, { locations: {} }, opts)
    expect(data.characters).toEqual([{ id: 'c1', name: 'Newer in cloud' }])
    expect(data.novels).toEqual([])
    expect(conflicts).toEqual([])
    expect(pushes).toEqual({})
  })

  it('adds a dirty local record the cloud never received, and lists it for pushing', () => {
    const { data, pushes, conflicts } = overlayDirtyRecords(
      { characters: [] },
      { characters: [{ id: 'new', name: 'Created offline' }] },
      { characters: { new: {} } },
      opts,
    )
    expect(data.characters).toEqual([{ id: 'new', name: 'Created offline' }])
    expect(pushes).toEqual({ characters: ['new'] })
    expect(conflicts).toEqual([])
  })

  it('does nothing for a dirty record the cloud already holds identically', () => {
    const record = { id: 'c1', name: 'Same' }
    const { pushes, conflicts } = overlayDirtyRecords({ characters: [record] }, { characters: [{ ...record }] }, { characters: { c1: {} } }, opts)
    expect(pushes).toEqual({})
    expect(conflicts).toEqual([])
  })

  it('ignores a dirty id whose record no longer exists locally', () => {
    const cloud = { characters: [{ id: 'c1', name: 'Cloud' }] }
    const { data, pushes } = overlayDirtyRecords(cloud, { characters: [] }, { characters: { c1: {} } }, opts)
    expect(data.characters).toEqual([{ id: 'c1', name: 'Cloud' }])
    expect(pushes).toEqual({})
  })

  it('keeps a dirty scene local and records the revision it was based on, without a duplicate conflict record', () => {
    const cloud = { scenes: [{ id: 's1', content: 'cloud prose' }], _sceneRevisions: { s1: 9 } }
    const local = { scenes: [{ id: 's1', content: 'my prose' }] }
    const { data, pushes, conflicts } = overlayDirtyRecords(cloud, local, { scenes: { s1: { baseRevision: 7 } } }, opts)
    expect(data.scenes).toEqual([{ id: 's1', content: 'my prose' }])
    expect(pushes).toEqual({ scenes: ['s1'] })
    // The revision-checked scene save turns a moved-on cloud copy into a preserved conflict copy.
    expect(conflicts).toEqual([])
  })
})
