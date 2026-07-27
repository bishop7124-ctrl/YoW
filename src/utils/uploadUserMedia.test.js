import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  uploadResult: { error: null },
  publicUrl: 'https://project.supabase.co/storage/v1/object/public/user-media/user-1/covers/abc.webp',
  removeCalls: [],
  uploadCalls: [],
  offlineMode: false,
}))

vi.mock('./offlineMock.js', () => ({
  get OFFLINE_MODE() { return mockState.offlineMode },
}))

vi.mock('../supabase.js', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn((path, blob, opts) => {
          mockState.uploadCalls.push({ path, blob, opts })
          return Promise.resolve(mockState.uploadResult)
        }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: mockState.publicUrl } })),
        remove: vi.fn((paths) => {
          mockState.removeCalls.push(paths)
          return Promise.resolve({ error: null })
        }),
      })),
    },
  },
}))

vi.mock('./imageOptimize.js', () => ({
  optimizeImage: vi.fn(async () => new Blob(['fake-image-bytes'], { type: 'image/webp' })),
  optimizeImageToDataUrl: vi.fn(async () => 'data:image/webp;base64,ZmFrZQ=='),
}))

const { uploadUserMedia, deleteUserMedia } = await import('./uploadUserMedia.js')
const { optimizeImage, optimizeImageToDataUrl } = await import('./imageOptimize.js')

describe('uploadUserMedia', () => {
  beforeEach(() => {
    mockState.uploadResult = { error: null }
    mockState.removeCalls = []
    mockState.uploadCalls = []
    mockState.offlineMode = false
    vi.clearAllMocks()
  })

  it('falls back to a local data URL in offline mode, without touching Supabase', async () => {
    mockState.offlineMode = true
    const url = await uploadUserMedia(new File(['x'], 'a.png'), { category: 'covers' })
    expect(url).toBe('data:image/webp;base64,ZmFrZQ==')
    expect(optimizeImageToDataUrl).toHaveBeenCalled()
    expect(optimizeImage).not.toHaveBeenCalled()
    expect(mockState.uploadCalls).toHaveLength(0)
  })

  it('requires a signed-in user', async () => {
    await expect(uploadUserMedia(new File(['x'], 'a.png'), { category: 'covers' }))
      .rejects.toThrow('Sign in to upload images.')
  })

  it('requires a category', async () => {
    await expect(uploadUserMedia(new File(['x'], 'a.png'), { userId: 'user-1' }))
      .rejects.toThrow('uploadUserMedia requires a category.')
  })

  it('blocks the upload when it would exceed the plan quota', async () => {
    await expect(uploadUserMedia(new File(['x'], 'a.png'), {
      userId: 'user-1',
      category: 'covers',
      currentUsedBytes: 99,
      quotaBytes: 100, // optimized blob is 17 bytes ('fake-image-bytes'), pushing usage over quota
    })).rejects.toThrow(/Not enough storage/)
    expect(mockState.uploadCalls).toHaveLength(0)
  })

  it('treats a missing/non-finite quota as unlimited', async () => {
    const url = await uploadUserMedia(new File(['x'], 'a.png'), {
      userId: 'user-1',
      category: 'covers',
      currentUsedBytes: 999_999_999,
      quotaBytes: null,
    })
    expect(url).toBe(mockState.publicUrl)
  })

  it('uploads the optimized blob under {userId}/{category}/ and returns the public URL', async () => {
    const url = await uploadUserMedia(new File(['x'], 'a.png'), {
      userId: 'user-1',
      category: 'covers',
      currentUsedBytes: 0,
      quotaBytes: 1_000_000,
    })

    expect(optimizeImage).toHaveBeenCalled()
    expect(mockState.uploadCalls).toHaveLength(1)
    expect(mockState.uploadCalls[0].path).toMatch(/^user-1\/covers\/[a-f0-9-]+\.webp$/)
    expect(mockState.uploadCalls[0].opts).toEqual({ contentType: 'image/webp', upsert: false })
    expect(url).toBe(mockState.publicUrl)
  })

  it('surfaces a Supabase upload error as a thrown Error', async () => {
    mockState.uploadResult = { error: { message: 'bucket not found' } }
    await expect(uploadUserMedia(new File(['x'], 'a.png'), {
      userId: 'user-1',
      category: 'covers',
      quotaBytes: 1_000_000,
    })).rejects.toThrow('Upload failed: bucket not found')
  })
})

describe('deleteUserMedia', () => {
  beforeEach(() => {
    mockState.removeCalls = []
    mockState.offlineMode = false
    vi.clearAllMocks()
  })

  it('no-ops in offline mode, without touching Supabase', async () => {
    mockState.offlineMode = true
    await deleteUserMedia('https://project.supabase.co/storage/v1/object/public/user-media/user-1/covers/abc.webp')
    expect(mockState.removeCalls).toHaveLength(0)
  })

  it('no-ops for a data: URL', async () => {
    await deleteUserMedia('data:image/png;base64,abc123')
    expect(mockState.removeCalls).toHaveLength(0)
  })

  it('no-ops for a static demo asset path', async () => {
    await deleteUserMedia('/demo-projects/the-last-ember/cover.jpg')
    expect(mockState.removeCalls).toHaveLength(0)
  })

  it('no-ops for null/undefined', async () => {
    await deleteUserMedia(null)
    await deleteUserMedia(undefined)
    expect(mockState.removeCalls).toHaveLength(0)
  })

  it('removes the parsed object path for a matching user-media URL', async () => {
    await deleteUserMedia('https://project.supabase.co/storage/v1/object/public/user-media/user-1/covers/abc.webp')
    expect(mockState.removeCalls).toEqual([['user-1/covers/abc.webp']])
  })
})
