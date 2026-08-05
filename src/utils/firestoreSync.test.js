// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  tables: {},
  selects: [],
  upserts: [],
  // Queue of { error } results to hand out (in order) before falling back to
  // the normal success response — lets tests simulate a table query that
  // fails N times before succeeding, or fails on every attempt.
  errorQueues: {},
}))

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn((table) => ({
      select: vi.fn((columns) => {
        mockState.selects.push({ table, columns })
        const nextResult = () => {
          const queue = mockState.errorQueues[table]
          if (queue?.length) return { data: null, error: queue.shift() }
          return { data: mockState.tables[table] || [], error: null }
        }
        return {
          eq: vi.fn(() => {
            if (table === 'user_settings') {
              return {
                maybeSingle: vi.fn(() => {
                  const queue = mockState.errorQueues[table]
                  if (queue?.length) return Promise.resolve({ data: null, error: queue.shift() })
                  return Promise.resolve({ data: mockState.tables.user_settings || null, error: null })
                }),
              }
            }
            return Promise.resolve(nextResult())
          }),
        }
      }),
      upsert: vi.fn((rows) => {
        mockState.upserts.push({ table, rows })
        return Promise.resolve({ error: null })
      }),
      // Mimics Postgres delete-by-filter against the in-memory table so tests
      // can assert on what rows actually remain afterwards, not just on what
      // arguments were passed.
      delete: vi.fn(() => {
        const filters = []
        const builder = {
          eq: vi.fn((col, val) => { filters.push([col, val]); return builder }),
          then: (resolve) => {
            const rows = mockState.tables[table] || []
            mockState.tables[table] = rows.filter(
              row => !filters.every(([col, val]) => row[col] === val)
            )
            resolve({ data: null, error: null })
          },
        }
        return builder
      }),
    })),
  },
}))

describe('loadUserData', () => {
  beforeEach(() => {
    mockState.tables = {}
    mockState.selects = []
    mockState.upserts = []
    mockState.errorQueues = {}
  })

  it('uses persisted updated_at timestamps instead of load time for freshness', async () => {
    const { loadUserData } = await import('./firestoreSync.js')
    mockState.tables.user_settings = {
      data: { activeNovelId: 'novel-1' },
      updated_at: '2026-07-19T10:00:00.000Z',
    }
    mockState.tables.characters = [{
      id: 'char-1',
      data: { id: 'char-1', novelId: 'novel-1', name: 'Fresh Cloud Character' },
      updated_at: '2026-07-19T10:05:00.000Z',
    }]
    mockState.tables.locations = [{
      id: 'loc-1',
      data: { id: 'loc-1', novelId: 'novel-1', name: 'Older Cloud Location' },
      updated_at: '2026-07-19T09:00:00.000Z',
    }]

    const data = await loadUserData('user-1')

    expect(data._savedAt).toBe(new Date('2026-07-19T10:05:00.000Z').getTime())
    expect(data.characters).toEqual([{ id: 'char-1', novelId: 'novel-1', name: 'Fresh Cloud Character' }])
    expect(mockState.selects.find(call => call.table === 'characters')?.columns).toContain('updated_at')
    expect(mockState.selects.find(call => call.table === 'scenes')?.columns).toBe('scene_id, data')
  })

  it('recovers from a one-off transient error on a single table instead of failing the whole load', async () => {
    const { loadUserData } = await import('./firestoreSync.js')
    mockState.tables.characters = [{
      id: 'char-1',
      data: { id: 'char-1', novelId: 'novel-1', name: 'Survives A Blip' },
      updated_at: '2026-07-19T10:05:00.000Z',
    }]
    // Fails once, then the next attempt (from withRetry) hits the normal
    // success path above — simulating a single dropped request among the
    // ~20 fired in parallel by loadUserData, not a real outage.
    mockState.errorQueues.characters = [{ message: 'network blip' }]

    const data = await loadUserData('user-1')

    expect(data.characters).toEqual([{ id: 'char-1', novelId: 'novel-1', name: 'Survives A Blip' }])
  })

  it('still throws (and never hydrates a zeroed-out category) when a table fails on every retry attempt', async () => {
    const { loadUserData } = await import('./firestoreSync.js')
    mockState.tables.characters = [{
      id: 'char-1',
      data: { id: 'char-1', novelId: 'novel-1', name: 'Should Not Silently Vanish' },
      updated_at: '2026-07-19T10:05:00.000Z',
    }]
    // More failures queued than withRetry's attempt budget — a genuine,
    // persistent failure must still surface as a thrown error, not as an
    // empty characters array indistinguishable from a truly empty project.
    mockState.errorQueues.characters = [
      { message: 'down 1' }, { message: 'down 2' }, { message: 'down 3' },
    ]

    await expect(loadUserData('user-1')).rejects.toThrow(/characters/)
  })
})

describe('scene cloud cleanup on project delete', () => {
  beforeEach(() => {
    mockState.tables = {}
    mockState.selects = []
    mockState.upserts = []
    mockState.errorQueues = {}
  })

  it('writes novel_id on scene saves so bulk cleanup can find them later', async () => {
    const { saveSceneDoc } = await import('./firestoreSync.js')

    await saveSceneDoc('user-1', { id: 'scene-1', novelId: 'novel-1', title: 'Opening' })

    const call = mockState.upserts.find(u => u.table === 'scenes')
    expect(call.rows).toEqual({
      user_id: 'user-1',
      scene_id: 'scene-1',
      novel_id: 'novel-1',
      data: { id: 'scene-1', novelId: 'novel-1', title: 'Opening' },
    })
  })

  it('deleteItemsByNovel leaves no scene rows behind for the deleted project, without touching other projects', async () => {
    const { deleteItemsByNovel } = await import('./firestoreSync.js')

    mockState.tables.scenes = [
      { user_id: 'user-1', scene_id: 'scene-1', novel_id: 'novel-1', data: { id: 'scene-1', novelId: 'novel-1' } },
      { user_id: 'user-1', scene_id: 'scene-2', novel_id: 'novel-1', data: { id: 'scene-2', novelId: 'novel-1' } },
      { user_id: 'user-1', scene_id: 'scene-3', novel_id: 'novel-2', data: { id: 'scene-3', novelId: 'novel-2' } },
      // Another user's row with the same novel_id must survive too.
      { user_id: 'user-2', scene_id: 'scene-4', novel_id: 'novel-1', data: { id: 'scene-4', novelId: 'novel-1' } },
    ]

    await deleteItemsByNovel('user-1', 'novel-1')

    const remaining = mockState.tables.scenes
    expect(remaining.find(r => r.novel_id === 'novel-1' && r.user_id === 'user-1')).toBeUndefined()
    expect(remaining.map(r => r.scene_id).sort()).toEqual(['scene-3', 'scene-4'])
  })
})
