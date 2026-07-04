import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STORAGE_MODES,
  isLocalFirstMode,
  loadLocalFirstSnapshot,
  loadStorageMode,
  saveLocalFirstSnapshot,
  saveStorageMode,
} from './storageMode'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(key => store.get(key) ?? null),
    setItem: vi.fn((key, value) => { store.set(key, String(value)) }),
    removeItem: vi.fn(key => { store.delete(key) }),
    clear: vi.fn(() => { store.clear() }),
  })
  localStorage.clear()
})

describe('storage mode preferences', () => {
  it('defaults to Cloud Sync per user', () => {
    expect(loadStorageMode('user-a')).toBe(STORAGE_MODES.CLOUD_SYNC)
    expect(isLocalFirstMode(loadStorageMode('user-a'))).toBe(false)
  })

  it('stores Local-first mode per user', () => {
    saveStorageMode('user-a', STORAGE_MODES.LOCAL_FIRST)

    expect(loadStorageMode('user-a')).toBe(STORAGE_MODES.LOCAL_FIRST)
    expect(loadStorageMode('user-b')).toBe(STORAGE_MODES.CLOUD_SYNC)
    expect(isLocalFirstMode(loadStorageMode('user-a'))).toBe(true)
  })
})

describe('local-first snapshots', () => {
  it('stores and restores a user-scoped browser snapshot', () => {
    const snapshot = {
      novels: [{ id: 'novel-1', title: 'Local draft' }],
      scenes: [{ id: 'scene-1', novelId: 'novel-1', content: 'Offline words' }],
    }

    expect(saveLocalFirstSnapshot('user-a', snapshot)).toBe(true)

    expect(loadLocalFirstSnapshot('user-a')).toEqual(snapshot)
    expect(loadLocalFirstSnapshot('user-b')).toBeNull()
  })
})
