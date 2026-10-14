import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storageUpload = vi.fn(() => Promise.resolve({ error: null }))
const storageRemove = vi.fn(() => Promise.resolve({ error: null }))
const fromSpy = vi.fn()

vi.mock('../supabase', () => ({
  supabase: {
    storage: { from: () => ({ upload: storageUpload, remove: storageRemove }) },
    from: (...args) => { fromSpy(...args); throw new Error('unexpected table write') },
    rpc: vi.fn(),
  },
}))
vi.mock('./imageOptimize.js', () => ({
  optimizeImage: vi.fn(async () => new Blob(['x'], { type: 'image/webp' })),
  optimizeImageToDataUrl: vi.fn(async () => 'data:image/webp;base64,AAAA'),
}))
vi.mock('./offlineMock.js', () => ({ OFFLINE_MODE: false }))

import {
  areCloudWritesAllowed,
  assertCloudWritesAllowed,
  setCloudWritesAllowed,
} from './cloudWritePolicy'
import { deleteUserMedia, uploadEmbeddedImage, uploadUserMedia } from './uploadUserMedia.js'
import {
  createInterview,
  deleteFinding,
  deleteInterview,
  saveAllFindings,
  saveFinding,
  updateFindingStatus,
  updateInterview,
} from './aiFindings'

beforeEach(() => {
  vi.clearAllMocks()
  setCloudWritesAllowed(false)
})

afterEach(() => {
  setCloudWritesAllowed(true)
})

describe('no cloud writes while cloud sync is unavailable (Local Mode / Local-first / archived)', () => {
  it('defaults to allowed and can be switched', () => {
    setCloudWritesAllowed(true)
    expect(areCloudWritesAllowed()).toBe(true)
    expect(() => assertCloudWritesAllowed('x')).not.toThrow()
    setCloudWritesAllowed(false)
    expect(() => assertCloudWritesAllowed('x')).toThrow(/Cloud Mode/)
  })

  it('keeps new images on the device as a data URL and never touches Storage', async () => {
    const result = await uploadUserMedia(new Blob(['a'], { type: 'image/png' }), { userId: 'u1', category: 'covers' })
    expect(result).toBe('data:image/webp;base64,AAAA')
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('does not remove remote objects or relocate embedded images', async () => {
    await deleteUserMedia('yow-media:u1/covers/a.webp')
    expect(storageRemove).not.toHaveBeenCalled()
    await expect(uploadEmbeddedImage('data:image/png;base64,AAAA', { userId: 'u1', category: 'covers' })).rejects.toThrow(/Cloud Mode/)
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('refuses every AI findings / interview write before reaching the database', async () => {
    await expect(saveFinding('u1', 'p1', 'plot_hole', { title: 't' })).rejects.toThrow(/Cloud Mode/)
    await expect(saveAllFindings('u1', 'p1', 'plot_hole', [{ title: 't' }])).rejects.toThrow(/Cloud Mode/)
    await expect(updateFindingStatus('f1', 'resolved')).rejects.toThrow(/Cloud Mode/)
    await expect(deleteFinding('f1')).rejects.toThrow(/Cloud Mode/)
    await expect(createInterview('u1', 'p1', 'c1', 'x')).rejects.toThrow(/Cloud Mode/)
    await expect(updateInterview('i1', [], [])).rejects.toThrow(/Cloud Mode/)
    await expect(deleteInterview('i1')).rejects.toThrow(/Cloud Mode/)
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('uploads normally once cloud writes are allowed again (renewal)', async () => {
    setCloudWritesAllowed(true)
    const result = await uploadUserMedia(new Blob(['a'], { type: 'image/png' }), { userId: 'u1', category: 'covers' })
    expect(result).toMatch(/^yow-media:u1\/covers\//)
    expect(storageUpload).toHaveBeenCalledTimes(1)
  })
})
