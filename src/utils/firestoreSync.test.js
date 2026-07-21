// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  tables: {},
  selects: [],
}))

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn((table) => ({
      select: vi.fn((columns) => {
        mockState.selects.push({ table, columns })
        return {
          eq: vi.fn(() => {
            if (table === 'user_settings') {
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: mockState.tables.user_settings || null,
                  error: null,
                }),
              }
            }
            return Promise.resolve({
              data: mockState.tables[table] || [],
              error: null,
            })
          }),
        }
      }),
    })),
  },
}))

describe('loadUserData', () => {
  beforeEach(() => {
    mockState.tables = {}
    mockState.selects = []
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
})
