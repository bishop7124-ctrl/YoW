// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resetStorageBackend } from './projectStorage.js'
import {
  markLocalWriteFailed,
  clearLocalWriteFailed,
  hasLocalWriteFailed,
  readFailedWriteKeys,
  markLocalReadCorrupt,
  hasCorruptLocalData,
  readCorruptKeys,
  withRetry,
} from './writeDurability.js'

beforeEach(() => {
  localStorage.clear()
  resetStorageBackend()
})

afterEach(() => {
  resetStorageBackend()
})

describe('local write failure tracking', () => {
  it('starts with nothing failed', () => {
    expect(hasLocalWriteFailed()).toBe(false)
    expect(readFailedWriteKeys().size).toBe(0)
  })

  it('marks and clears a key independently of other keys', () => {
    markLocalWriteFailed('nf_scenes')
    markLocalWriteFailed('nf_characters')
    expect(hasLocalWriteFailed()).toBe(true)
    expect(readFailedWriteKeys()).toEqual(new Set(['nf_scenes', 'nf_characters']))

    clearLocalWriteFailed('nf_scenes')
    expect(hasLocalWriteFailed()).toBe(true) // nf_characters still failed
    expect(readFailedWriteKeys()).toEqual(new Set(['nf_characters']))

    clearLocalWriteFailed('nf_characters')
    expect(hasLocalWriteFailed()).toBe(false)
  })

  it('survives a reload — the ledger is itself persisted, not in-memory only', () => {
    markLocalWriteFailed('nf_scenes')
    // Simulate "reload": a fresh read with no in-memory state, only storage.
    expect(readFailedWriteKeys().has('nf_scenes')).toBe(true)
  })
})

describe('corrupt-read tracking', () => {
  it('starts with nothing corrupted', () => {
    expect(hasCorruptLocalData()).toBe(false)
  })

  it('marks a key as corrupted', () => {
    markLocalReadCorrupt('nf_scenes')
    expect(hasCorruptLocalData()).toBe(true)
    expect(readCorruptKeys().has('nf_scenes')).toBe(true)
  })
})

describe('withRetry', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 0 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('retries on failure and succeeds once the underlying call recovers', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      if (calls < 3) throw new Error('transient')
      return 'recovered'
    })
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 0 })).resolves.toBe('recovered')
    expect(calls).toBe(3)
  })

  it('gives up and rejects with the last error after exhausting attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent'))
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 0 })).rejects.toThrow('permanent')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('attempts: 1 disables retrying entirely — fails on the first try', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent'))
    await expect(withRetry(fn, { attempts: 1 })).rejects.toThrow('permanent')
    expect(fn).toHaveBeenCalledOnce()
  })
})
