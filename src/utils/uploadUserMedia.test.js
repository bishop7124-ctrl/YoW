import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  uploadResult: { error: null },
  publicUrl: 'https://project.supabase.co/storage/v1/object/public/user-media/user-1/covers/abc.webp',
  signedUrl: 'https://project.supabase.co/storage/v1/object/sign/user-media/user-1/covers/abc.webp?token=signed',
  removeCalls: [],
  uploadCalls: [],
  signedUrlCalls: [],
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

const { uploadUserMedia, deleteUserMedia, getSignedUserMediaUrl, getUserMediaPath } = await import('./uploadUserMedia.js')
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

  it('removes a private media reference', async () => {
    await deleteUserMedia('yow-media:user-1/covers/abc.webp')
    expect(mockState.removeCalls).toEqual([['user-1/covers/abc.webp']])
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

  // Reproduced live against the real bucket: createSignedUrl (and list) can
  // return a hard "Object not found" for an object that upload() just
  // confirmed writing and that download()/getPublicUrl() can both reach —
  // not a propagation race (persisted 20s+ across repeated attempts in that
  // session). Until that's resolved upstream, a signing failure must not
  // render as a blank image for an object that plainly exists — fall back
  // to the plain public URL rather than throwing.
  it('falls back to the public URL when signing fails for an object that otherwise exists', async () => {
    mockState.signedUrlError = { message: 'Object not found' }
    // A path not used by an earlier test in this file — getSignedUserMediaUrl
    // caches successful resolutions at module scope, so reusing 'user-1/covers/abc.webp'
    // here would just return the previous test's cached signed URL without
    // exercising the fallback at all.
    const url = await getSignedUserMediaUrl('yow-media:user-1/characters/def.webp')
    expect(url).toBe(mockState.publicUrl)
  })

  it('passes through non-user-media URLs', async () => {
    await expect(getSignedUserMediaUrl('/demo-projects/the-last-ember/cover.jpg')).resolves.toBe('/demo-projects/the-last-ember/cover.jpg')
    expect(mockState.signedUrlCalls).toHaveLength(0)
  })
})
