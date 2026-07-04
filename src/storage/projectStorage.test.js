// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createMemoryBackend,
  getStorageBackend,
  setStorageBackend,
  resetStorageBackend,
  readItem,
  writeItem,
  removeItem,
  loadValue,
} from './projectStorage.js'
import { loadStorageMode, saveStorageMode, STORAGE_MODES } from '../utils/storageMode.js'

beforeEach(() => {
  localStorage.clear()
  resetStorageBackend()
})

afterEach(() => {
  resetStorageBackend()
})

// ─── default backend ─────────────────────────────────────────────────────────

describe('default backend', () => {
  it('uses browser localStorage when available', () => {
    expect(getStorageBackend().name).toBe('browser-local')

    writeItem('nf_test', JSON.stringify({ a: 1 }))
    expect(JSON.parse(localStorage.getItem('nf_test'))).toEqual({ a: 1 })

    localStorage.setItem('nf_other', JSON.stringify([1, 2, 3]))
    expect(loadValue('nf_other', [])).toEqual([1, 2, 3])
  })

  it('removeItem deletes from localStorage', () => {
    localStorage.setItem('nf_gone', 'x')
    removeItem('nf_gone')
    expect(localStorage.getItem('nf_gone')).toBeNull()
  })
})

// ─── loadValue semantics ─────────────────────────────────────────────────────

describe('loadValue', () => {
  it('returns the default when the key is missing', () => {
    expect(loadValue('nf_missing', 'fallback')).toBe('fallback')
    expect(loadValue('nf_missing')).toBeNull()
  })

  it('returns the default when stored JSON is corrupt', () => {
    localStorage.setItem('nf_corrupt', '{not json')
    expect(loadValue('nf_corrupt', [])).toEqual([])
  })

  it('returns the default when the stored value is JSON null', () => {
    localStorage.setItem('nf_null', 'null')
    expect(loadValue('nf_null', 0)).toBe(0)
  })
})

// ─── backend swap (the desktop vault seam) ───────────────────────────────────

describe('backend swap', () => {
  it('redirects reads and writes to the injected backend without touching localStorage', () => {
    const memory = createMemoryBackend()
    setStorageBackend(memory)

    writeItem('nf_novels', JSON.stringify([{ id: '1' }]))
    expect(loadValue('nf_novels', [])).toEqual([{ id: '1' }])
    expect(localStorage.getItem('nf_novels')).toBeNull()

    removeItem('nf_novels')
    expect(readItem('nf_novels')).toBeNull()
  })

  it('resetStorageBackend restores the browser backend', () => {
    setStorageBackend(createMemoryBackend())
    resetStorageBackend()
    expect(getStorageBackend().name).toBe('browser-local')

    writeItem('nf_back', '"yes"')
    expect(localStorage.getItem('nf_back')).toBe('"yes"')
  })

  it('rejects backends that do not implement the contract', () => {
    expect(() => setStorageBackend(null)).toThrow()
    expect(() => setStorageBackend({ getItem: () => null })).toThrow()
  })

  it('memory backend seeds from initial entries and isolates instances', () => {
    const a = createMemoryBackend({ nf_seed: '"a"' })
    const b = createMemoryBackend()
    expect(a.getItem('nf_seed')).toBe('"a"')
    expect(b.getItem('nf_seed')).toBeNull()
  })
})

// ─── write failure semantics (quota fallback contract) ───────────────────────

describe('write failure semantics', () => {
  it('propagates backend write errors so callers can run quota fallbacks', () => {
    const quotaError = new Error('QuotaExceededError')
    setStorageBackend({
      name: 'full-disk',
      getItem: () => null,
      setItem: () => { throw quotaError },
      removeItem: () => {},
    })
    expect(() => writeItem('nf_novels', 'big payload')).toThrow(quotaError)
    // loadValue stays non-throwing even if the backend read throws
    setStorageBackend({
      name: 'broken-read',
      getItem: () => { throw new Error('unavailable') },
      setItem: () => {},
      removeItem: () => {},
    })
    expect(loadValue('nf_novels', 'safe')).toBe('safe')
  })
})

// ─── consumers follow the active backend ─────────────────────────────────────

describe('storageMode through the abstraction', () => {
  it('reads and writes the mode preference via the active backend', () => {
    const memory = createMemoryBackend()
    setStorageBackend(memory)

    expect(loadStorageMode('user-1')).toBe(STORAGE_MODES.CLOUD_SYNC)
    saveStorageMode('user-1', STORAGE_MODES.LOCAL_FIRST)
    expect(loadStorageMode('user-1')).toBe(STORAGE_MODES.LOCAL_FIRST)
    expect(memory.getItem('nf_storageMode:user-1')).toBe(STORAGE_MODES.LOCAL_FIRST)
    expect(localStorage.getItem('nf_storageMode:user-1')).toBeNull()
  })
})
