import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  uploadResult: { error: null },
  removeResult: { error: null },
  publicUrl: 'https://project.supabase.co/storage/v1/object/public/user-media/user-1/covers/abc.webp',
  signedUrl: 'https://project.supabase.co/storage/v1/object/sign/user-media/user-1/covers/abc.webp?token=signed',
  removeCalls: [],
  uploadCalls: [],
  signedUrlCalls: [],
  listCalls: [],
  listEntries: {},
  listError: null,
  offlineMode: false,
  // Lets a single test force createSignedUrl to fail (e.g. the real
  // "Object not found" the sign/list endpoints have been observed returning
  // for an object that upload()/getPublicUrl() can both reach fine) without
  // touching the default happy-path behavior every other test relies on.
  signedUrlError: null,
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
        createSignedUrl: vi.fn((path, expiresIn) => {
          mockState.signedUrlCalls.push({ path, expiresIn })
          if (mockState.signedUrlError) return Promise.resolve({ data: null, error: mockState.signedUrlError })
          return Promise.resolve({ data: { signedUrl: mockState.signedUrl }, error: null })
        }),
        list: vi.fn((prefix, options) => {
          mockState.listCalls.push({ prefix, options })
          if (mockState.listError) return Promise.resolve({ data: null, error: mockState.listError })
          const entries = mockState.listEntries[prefix] || []
          return Promise.resolve({
            data: entries.slice(options.offset, options.offset + options.limit),
            error: null,
          })
        }),
        remove: vi.fn((paths) => {
          mockState.removeCalls.push(paths)
          return Promise.resolve(mockState.removeResult)
        }),
      })),
    },
  },
}))

vi.mock('./imageOptimize.js', () => ({
  optimizeImage: vi.fn(async () => new Blob(['fake-image-bytes'], { type: 'image/webp' })),
  optimizeImageToDataUrl: vi.fn(async () => 'data:image/webp;base64,ZmFrZQ=='),
}))

const { uploadUserMedia, uploadEmbeddedImage, deleteUserMedia, deleteAllUserMedia, getSignedUserMediaUrl, getUserMediaPath } = await import('./uploadUserMedia.js')
const { optimizeImage, optimizeImageToDataUrl } = await import('./imageOptimize.js')

describe('uploadUserMedia', () => {
  beforeEach(() => {
    mockState.uploadResult = { error: null }
    mockState.removeCalls = []
    mockState.uploadCalls = []
    mockState.signedUrlCalls = []
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
    expect(url).toMatch(/^yow-media:user-1\/covers\/[a-f0-9-]+\.webp$/)
  })

  it('uploads the optimized blob under {userId}/{category}/ and returns a private media reference', async () => {
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
    expect(url).toBe(`yow-media:${mockState.uploadCalls[0].path}`)
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

describe('uploadEmbeddedImage', () => {
  beforeEach(() => {
    mockState.uploadResult = { error: null }
    mockState.uploadCalls = []
    mockState.offlineMode = false
    vi.clearAllMocks()
  })

  const dataUrl = 'data:image/png;base64,ZmFrZS1wbmctYnl0ZXM='

  it('requires a userId and category', async () => {
    await expect(uploadEmbeddedImage(dataUrl, { category: 'characters' }))
      .rejects.toThrow('uploadEmbeddedImage requires a userId.')
    await expect(uploadEmbeddedImage(dataUrl, { userId: 'user-1' }))
      .rejects.toThrow('uploadEmbeddedImage requires a category.')
  })

  it('rejects a value that is not a base64 image data URL', async () => {
    await expect(uploadEmbeddedImage('yow-media:user-1/characters/abc.webp', { userId: 'user-1', category: 'characters' }))
      .rejects.toThrow('Not a base64 image data URL.')
    await expect(uploadEmbeddedImage('https://example.com/a.png', { userId: 'user-1', category: 'characters' }))
      .rejects.toThrow('Not a base64 image data URL.')
  })

  it('returns the data URL unchanged in offline mode, without touching Supabase', async () => {
    mockState.offlineMode = true
    const result = await uploadEmbeddedImage(dataUrl, { userId: 'user-1', category: 'characters' })
    expect(result).toBe(dataUrl)
    expect(mockState.uploadCalls).toHaveLength(0)
  })

  it('uploads the decoded bytes directly, skipping optimizeImage, and returns a private media reference', async () => {
    const url = await uploadEmbeddedImage(dataUrl, { userId: 'user-1', category: 'characters' })

    expect(optimizeImage).not.toHaveBeenCalled()
    expect(mockState.uploadCalls).toHaveLength(1)
    expect(mockState.uploadCalls[0].path).toMatch(/^user-1\/characters\/[a-f0-9-]+\.png$/)
    expect(mockState.uploadCalls[0].opts).toEqual({ contentType: 'image/png', upsert: false })
    expect(url).toBe(`yow-media:${mockState.uploadCalls[0].path}`)
  })

  it('surfaces a Supabase upload error as a thrown Error', async () => {
    mockState.uploadResult = { error: { message: 'bucket not found' } }
    await expect(uploadEmbeddedImage(dataUrl, { userId: 'user-1', category: 'characters' }))
      .rejects.toThrow('Upload failed: bucket not found')
  })
})

describe('deleteUserMedia', () => {
  beforeEach(() => {
    mockState.removeCalls = []
    mockState.removeResult = { error: null }
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

  it('removes a private media reference', async () => {
    await deleteUserMedia('yow-media:user-1/covers/abc.webp')
    expect(mockState.removeCalls).toEqual([['user-1/covers/abc.webp']])
  })

  it('surfaces a resolved Supabase removal error instead of silently treating cleanup as successful', async () => {
    mockState.removeResult = { error: { message: 'object removal failed' } }
    await expect(deleteUserMedia('yow-media:user-1/covers/abc.webp'))
      .rejects.toThrow('Delete failed: object removal failed')
    expect(mockState.removeCalls).toEqual([['user-1/covers/abc.webp']])
  })
})

describe('deleteAllUserMedia', () => {
  beforeEach(() => {
    mockState.removeCalls = []
    mockState.removeResult = { error: null }
    mockState.listCalls = []
    mockState.listEntries = {}
    mockState.listError = null
    mockState.offlineMode = false
    vi.clearAllMocks()
  })

  it('recursively lists the user prefix and removes every file through the Storage API', async () => {
    mockState.listEntries = {
      'user-1': [{ id: null, name: 'covers' }, { id: null, name: 'characters' }],
      'user-1/covers': [{ id: 'cover-id', name: 'cover.webp' }],
      'user-1/characters': [{ id: 'portrait-id', name: 'portrait.webp' }],
    }

    await expect(deleteAllUserMedia('user-1')).resolves.toBe(2)
    expect(mockState.removeCalls).toEqual([[
      'user-1/characters/portrait.webp',
      'user-1/covers/cover.webp',
    ]])
  })

  it('surfaces listing failure without attempting any removal', async () => {
    mockState.listError = { message: 'list denied' }
    await expect(deleteAllUserMedia('user-1')).rejects.toThrow('Could not list account media: list denied')
    expect(mockState.removeCalls).toEqual([])
  })

  it('surfaces batch-removal failure', async () => {
    mockState.listEntries = {
      'user-1': [{ id: null, name: 'covers' }],
      'user-1/covers': [{ id: 'cover-id', name: 'cover.webp' }],
    }
    mockState.removeResult = { error: { message: 'remove denied' } }
    await expect(deleteAllUserMedia('user-1')).rejects.toThrow('Could not delete account media: remove denied')
  })
})

describe('getSignedUserMediaUrl', () => {
  beforeEach(() => {
    mockState.signedUrlCalls = []
    mockState.offlineMode = false
    mockState.signedUrlError = null
    vi.clearAllMocks()
  })

  it('extracts paths from private references and legacy public URLs', () => {
    expect(getUserMediaPath('yow-media:user-1/covers/abc.webp')).toBe('user-1/covers/abc.webp')
    expect(getUserMediaPath('https://project.supabase.co/storage/v1/object/public/user-media/user-1/covers/abc.webp')).toBe('user-1/covers/abc.webp')
  })

  it('creates a signed URL for private user media', async () => {
    const url = await getSignedUserMediaUrl('yow-media:user-1/covers/abc.webp')
    expect(url).toBe(mockState.signedUrl)
    expect(mockState.signedUrlCalls).toEqual([{ path: 'user-1/covers/abc.webp', expiresIn: 3600 }])
  })

  it('surfaces a signing failure without retrying through the private bucket public endpoint', async () => {
    mockState.signedUrlError = { message: 'Object not found' }
    // A path not used by an earlier test in this file — getSignedUserMediaUrl
    // caches successful resolutions at module scope, so reusing 'user-1/covers/abc.webp'
    // here would just return the previous test's cached signed URL without
    // exercising the fallback at all.
    await expect(getSignedUserMediaUrl('yow-media:user-1/characters/def.webp'))
      .rejects.toThrow('Could not load image: Object not found')
  })

  it('passes through non-user-media URLs', async () => {
    await expect(getSignedUserMediaUrl('/demo-projects/the-last-ember/cover.jpg')).resolves.toBe('/demo-projects/the-last-ember/cover.jpg')
    expect(mockState.signedUrlCalls).toHaveLength(0)
  })
})
