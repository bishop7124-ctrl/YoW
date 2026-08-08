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
  embeddedUploadCalls: [],
  embeddedUploadShouldFail: false,
}))

vi.mock('./uploadUserMedia', () => ({
  uploadEmbeddedImage: vi.fn(async (dataUrl, { userId, category }) => {
    mockState.embeddedUploadCalls.push({ dataUrl, userId, category })
    if (mockState.embeddedUploadShouldFail) throw new Error('upload failed')
    return `yow-media:${userId}/${category}/relocated.webp`
  }),
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

describe('upsertItems embedded-image safety net', () => {
  beforeEach(() => {
    mockState.tables = {}
    mockState.upserts = []
    mockState.embeddedUploadCalls = []
    mockState.embeddedUploadShouldFail = false
  })

  it('relocates an inline base64 image field to Storage before writing the row', async () => {
    const { upsertItems } = await import('./firestoreSync.js')

    await upsertItems('characters', 'user-1', [
      { id: 'char-1', novelId: 'novel-1', name: 'Cara', image: 'data:image/png;base64,ZmFrZQ==' },
    ])

    expect(mockState.embeddedUploadCalls).toEqual([
      { dataUrl: 'data:image/png;base64,ZmFrZQ==', userId: 'user-1', category: 'characters' },
    ])
    const row = mockState.upserts.find(u => u.table === 'characters').rows[0]
    expect(row.data.image).toBe('yow-media:user-1/characters/relocated.webp')
  })

  it('leaves already-migrated rows (yow-media: refs, plain URLs, no image) untouched, without calling the uploader', async () => {
    const { upsertItems } = await import('./firestoreSync.js')

    const items = [
      { id: 'char-1', novelId: 'novel-1', name: 'Already migrated', image: 'yow-media:user-1/characters/abc.webp' },
      { id: 'char-2', novelId: 'novel-1', name: 'No image at all' },
    ]
    await upsertItems('characters', 'user-1', items)

    expect(mockState.embeddedUploadCalls).toHaveLength(0)
    const rows = mockState.upserts.find(u => u.table === 'characters').rows
    expect(rows[0].data.image).toBe('yow-media:user-1/characters/abc.webp')
    expect(rows[1].data).toEqual(items[1])
  })

  it('finds embedded images nested inside arrays/objects (e.g. comic panels), not just top-level fields', async () => {
    const { upsertItems } = await import('./firestoreSync.js')

    await upsertItems('comic_pages', 'user-1', [
      { id: 'page-1', novelId: 'novel-1', panels: [{ id: 'p1', imageUrl: 'data:image/png;base64,ZmFrZQ==' }] },
    ])

    expect(mockState.embeddedUploadCalls).toEqual([
      { dataUrl: 'data:image/png;base64,ZmFrZQ==', userId: 'user-1', category: 'comic' },
    ])
    const row = mockState.upserts.find(u => u.table === 'comic_pages').rows[0]
    expect(row.data.panels[0].imageUrl).toBe('yow-media:user-1/comic/relocated.webp')
  })

  it('fails open: keeps the original base64 and still saves the rest of the row if the relocation upload errors', async () => {
    mockState.embeddedUploadShouldFail = true
    const { upsertItems } = await import('./firestoreSync.js')

    await upsertItems('characters', 'user-1', [
      { id: 'char-1', novelId: 'novel-1', name: 'Cara', image: 'data:image/png;base64,ZmFrZQ==' },
    ])

    const row = mockState.upserts.find(u => u.table === 'characters').rows[0]
    expect(row.data.image).toBe('data:image/png;base64,ZmFrZQ==')
    expect(row.data.name).toBe('Cara')
  })

  it('does not scan tables with no known image field (no CATEGORY_BY_TABLE entry)', async () => {
    const { upsertItems } = await import('./firestoreSync.js')

    await upsertItems('timeline_events', 'user-1', [
      { id: 'evt-1', novelId: 'novel-1', description: 'data:image/png;base64,ZmFrZQ==' },
    ])

    expect(mockState.embeddedUploadCalls).toHaveLength(0)
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
