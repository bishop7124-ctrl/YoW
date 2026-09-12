import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryBackend, resetStorageBackend, setStorageBackend } from '../storage/projectStorage'
import {
  STORAGE_MODES,
  clearDesktopLapseSnapshot,
  isLocalFirstMode,
  loadDesktopLapseSnapshot,
  loadLocalFirstSnapshot,
  loadPendingDesktopLapseResumeBase,
  loadStorageMode,
  saveDesktopLapseSnapshot,
  saveLocalFirstSnapshot,
  saveStorageMode,
} from './storageMode'

// The test environment runs under Node (no `window`), so the storage
// abstraction's default backend is already the in-memory one — but it's a
// module-level singleton, not reset between tests on its own. Give every
// test its own fresh backend explicitly rather than relying on a
// `window.localStorage` stub that this module never actually reads in Node.
beforeEach(() => {
  setStorageBackend(createMemoryBackend())
})

afterEach(() => {
  resetStorageBackend()
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

describe('desktop lapse snapshots', () => {
  it('stores and restores a user-scoped snapshot captured when hosting lapses', () => {
    const snapshot = {
      novels: [{ id: 'novel-1', title: 'Written while lapsed' }],
      scenes: [{ id: 'scene-1', novelId: 'novel-1', content: 'Offline during the lapse' }],
    }

    expect(saveDesktopLapseSnapshot('user-a', snapshot)).toBe(true)

    expect(loadDesktopLapseSnapshot('user-a')).toEqual(snapshot)
    expect(loadDesktopLapseSnapshot('user-b')).toBeNull()
  })

  it('does not overwrite an existing, not-yet-consumed snapshot', () => {
    const firstLapse = { novels: [{ id: 'novel-1', title: 'First lapse base' }] }
    const secondLapse = { novels: [{ id: 'novel-1', title: 'Second lapse base' }] }

    expect(saveDesktopLapseSnapshot('user-a', firstLapse)).toBe(true)
    expect(saveDesktopLapseSnapshot('user-a', secondLapse)).toBe(false)

    expect(loadDesktopLapseSnapshot('user-a')).toEqual(firstLapse)
  })

  it('allows a fresh snapshot once the previous one is consumed/cleared', () => {
    const firstLapse = { novels: [{ id: 'novel-1', title: 'First lapse base' }] }
    const secondLapse = { novels: [{ id: 'novel-1', title: 'Second lapse base' }] }

    saveDesktopLapseSnapshot('user-a', firstLapse)
    clearDesktopLapseSnapshot('user-a')

    expect(loadDesktopLapseSnapshot('user-a')).toBeNull()
    expect(saveDesktopLapseSnapshot('user-a', secondLapse)).toBe(true)
    expect(loadDesktopLapseSnapshot('user-a')).toEqual(secondLapse)
  })
})

describe('loadPendingDesktopLapseResumeBase', () => {
  // Bugs table, 2026-09-12: `importData`'s own 30-minute local-trust window
  // is not sized for a multi-day desktop hosting lapse — if the app was
  // closed for the whole lapse and only reopened after renewal, a plain
  // login/refresh has no true→false transition to observe, only whatever
  // lapse-start snapshot is still sitting in storage. This is the guard a
  // plain data-load path should use to decide "treat this as a lapse resume
  // and merge" instead of trusting freshly loaded cloud data wholesale.
  const base = { novels: [{ id: 'novel-1', title: 'Written while lapsed' }] }

  it('returns the pending snapshot once hosting has renewed (isLocalMode false) on a desktop app', () => {
    saveDesktopLapseSnapshot('user-a', base)

    expect(loadPendingDesktopLapseResumeBase('user-a', {
      desktopApp: true,
      isLocalMode: false,
      userLocalFirstMode: false,
    })).toEqual(base)
  })

  it('returns null while still lapsed — nothing to reconcile against yet', () => {
    saveDesktopLapseSnapshot('user-a', base)

    expect(loadPendingDesktopLapseResumeBase('user-a', {
      desktopApp: true,
      isLocalMode: true,
      userLocalFirstMode: false,
    })).toBeNull()
  })

  it('returns null while deliberately still in manual Local-first mode', () => {
    saveDesktopLapseSnapshot('user-a', base)

    expect(loadPendingDesktopLapseResumeBase('user-a', {
      desktopApp: true,
      isLocalMode: false,
      userLocalFirstMode: true,
    })).toBeNull()
  })

  it('returns null on web (not a desktop app), even with a stray snapshot', () => {
    saveDesktopLapseSnapshot('user-a', base)

    expect(loadPendingDesktopLapseResumeBase('user-a', {
      desktopApp: false,
      isLocalMode: false,
      userLocalFirstMode: false,
    })).toBeNull()
  })

  it('returns null when there is no pending snapshot at all (the common case)', () => {
    expect(loadPendingDesktopLapseResumeBase('user-a', {
      desktopApp: true,
      isLocalMode: false,
      userLocalFirstMode: false,
    })).toBeNull()
  })
})
