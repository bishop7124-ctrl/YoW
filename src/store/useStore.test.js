// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useStore } from './useStore.js'
import { loadLocalFirstSnapshot, saveStorageMode, STORAGE_MODES } from '../utils/storageMode.js'
import { upsertItems } from '../utils/firestoreSync.js'

// Mock Supabase-backed modules so tests run without network
vi.mock('../utils/firestoreSync', () => ({
  upsertItems:        vi.fn().mockResolvedValue({}),
  deleteItem:         vi.fn().mockResolvedValue({}),
  deleteItemsByNovel: vi.fn().mockResolvedValue({}),
  saveUserSettings:   vi.fn().mockResolvedValue({}),
  saveSceneDoc:       vi.fn().mockResolvedValue({}),
  deleteSceneDoc:     vi.fn().mockResolvedValue({}),
}))
vi.mock('../utils/projectStats', () => ({
  buildProjectStats: vi.fn().mockReturnValue({}),
}))
vi.mock('../utils/storageQuota', () => ({
  estimateStoreSize: vi.fn().mockReturnValue(0),
}))

beforeEach(() => {
  localStorage.clear()
})

// ─── localStorage persistence ────────────────────────────────────────────────

describe('localStorage persistence', () => {
  it('loads novels seeded in localStorage on mount', () => {
    const novels = [{ id: '1', title: 'Dune', type: 'novel' }]
    localStorage.setItem('nf_novels', JSON.stringify(novels))
    localStorage.setItem('nf_localOwner', 'user-abc')

    const { result } = renderHook(() => useStore('user-abc'))
    expect(result.current.novels).toEqual(novels)
  })

  it('starts empty when localStorage is empty', () => {
    const { result } = renderHook(() => useStore(null))
    expect(result.current.novels).toEqual([])
    expect(result.current.characters).toEqual([])
  })

  it('saves a new novel to localStorage', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => {
      result.current.addNovel({ title: 'My Novel', type: 'novel' })
    })

    expect(result.current.novels).toHaveLength(1)
    expect(result.current.novels[0].title).toBe('My Novel')

    const stored = JSON.parse(localStorage.getItem('nf_novels'))
    expect(stored).toHaveLength(1)
    expect(stored[0].title).toBe('My Novel')
  })

  it('persists characters to localStorage when saved', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => {
      result.current.addNovel({ title: 'My Novel', type: 'novel' })
    })
    act(() => {
      result.current.saveCharacter({ name: 'Aragorn', role: 'hero' })
    })

    const stored = JSON.parse(localStorage.getItem('nf_characters'))
    expect(stored.some(c => c.name === 'Aragorn')).toBe(true)
  })

  it('restores and clears timeline eras with imported project data', () => {
    const { result } = renderHook(() => useStore(null))
    const novel = { id: 'novel-1', title: 'Chronicle', type: 'novel' }
    const era = { id: 'era-1', novelId: novel.id, name: 'Founding Age', startYear: 1, endYear: 99 }

    act(() => {
      result.current.importData({
        novels: [novel],
        activeNovelId: novel.id,
        eras: [era],
        timeline: [{ id: 'event-1', novelId: novel.id, title: 'First Gate', eraId: era.id }],
      })
    })

    expect(result.current.eras).toEqual([era])
    expect(JSON.parse(localStorage.getItem('nf_eras'))).toEqual([era])

    act(() => {
      result.current.clearData()
    })

    expect(result.current.eras).toEqual([])
    expect(JSON.parse(localStorage.getItem('nf_eras'))).toEqual([])
  })
})

// ─── ownership guard ─────────────────────────────────────────────────────────
// If localStorage is owned by a different user, the store must NOT load it.

describe('ownership guard', () => {
  it('ignores localStorage owned by a different user', () => {
    const novels = [{ id: '1', title: 'Stolen Data', type: 'novel' }]
    localStorage.setItem('nf_novels', JSON.stringify(novels))
    localStorage.setItem('nf_localOwner', 'user-other')

    const { result } = renderHook(() => useStore('user-alice'))
    expect(result.current.novels).toEqual([])
  })

  it('loads localStorage when userId matches the stored owner', () => {
    const novels = [{ id: '1', title: 'My Book', type: 'novel' }]
    localStorage.setItem('nf_novels', JSON.stringify(novels))
    localStorage.setItem('nf_localOwner', 'user-alice')

    const { result } = renderHook(() => useStore('user-alice'))
    expect(result.current.novels).toEqual(novels)
  })

  it('loads localStorage when there is no stored owner (guest data)', () => {
    const novels = [{ id: '1', title: 'Guest Work', type: 'novel' }]
    localStorage.setItem('nf_novels', JSON.stringify(novels))

    const { result } = renderHook(() => useStore(null))
    expect(result.current.novels).toEqual(novels)
  })
})

// ─── Local-first sign-out safety ────────────────────────────────────────────

describe('Local-first sign-out safety', () => {
  it('snapshots live local work before clearing the signed-out store', () => {
    saveStorageMode('user-local', STORAGE_MODES.LOCAL_FIRST)

    const { result, rerender } = renderHook(
      ({ userId }) => useStore(userId, { cloudSyncEnabled: false }),
      { initialProps: { userId: 'user-local' } }
    )

    act(() => {
      result.current.addNovel({ title: 'Offline Draft', type: 'novel' })
    })
    const draftId = result.current.novels[0].id
    act(() => {
      result.current.saveCharacter({ name: 'Saved Person', novelId: draftId })
    })

    rerender({ userId: null })

    const snapshot = loadLocalFirstSnapshot('user-local')
    expect(snapshot.novels).toHaveLength(1)
    expect(snapshot.novels[0].title).toBe('Offline Draft')
    expect(snapshot.characters).toHaveLength(1)
    expect(snapshot.characters[0].name).toBe('Saved Person')
  })
})

// ─── novel CRUD ──────────────────────────────────────────────────────────────

describe('novel CRUD', () => {
  it('addNovel creates a novel with a generated id', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'Test Novel', type: 'novel' }) })

    expect(result.current.novels).toHaveLength(1)
    expect(result.current.novels[0].id).toBeTruthy()
    expect(result.current.novels[0].title).toBe('Test Novel')
    expect(result.current.novels[0].type).toBe('novel')
  })

  it('updateNovel merges fields without losing existing data', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'Original', type: 'novel' }) })
    const id = result.current.novels[0].id

    act(() => { result.current.updateNovel(id, { title: 'Updated' }) })

    const novel = result.current.novels[0]
    expect(novel.title).toBe('Updated')
    expect(novel.type).toBe('novel')
    expect(novel.id).toBe(id)
  })

  it('deleteNovel removes the novel and persists the deletion', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'To Delete', type: 'novel' }) })
    const id = result.current.novels[0].id

    act(() => { result.current.deleteNovel(id) })

    expect(result.current.novels).toHaveLength(0)
    const stored = JSON.parse(localStorage.getItem('nf_novels'))
    expect(stored).toHaveLength(0)
  })
})

// ─── character CRUD ──────────────────────────────────────────────────────────

describe('character CRUD', () => {
  it('saveCharacter assigns a unique id per character', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    act(() => { result.current.saveCharacter({ name: 'Frodo' }) })
    act(() => { result.current.saveCharacter({ name: 'Sam' }) })

    expect(result.current.characters).toHaveLength(2)
    const [a, b] = result.current.characters
    expect(a.id).not.toBe(b.id)
  })

  it('saveCharacter with an existing id updates rather than duplicates', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    act(() => { result.current.saveCharacter({ name: 'Gandalf', role: 'wizard' }) })
    const id = result.current.characters[0].id

    act(() => { result.current.saveCharacter({ name: 'Gandalf', role: 'guide' }, id) })

    expect(result.current.characters).toHaveLength(1)
    expect(result.current.characters[0].role).toBe('guide')
  })
})

// ─── cloud sync status ───────────────────────────────────────────────────────
// Phase 5 (desktop cloud sync bridge): last synced / syncing / error surfaced
// to the Storage settings UI. Exercises the debounced push pipeline directly
// rather than mocking trackSync, so it proves the real wiring.

describe('cloud sync status', () => {
  beforeEach(() => {
    vi.mocked(upsertItems).mockClear()
    vi.mocked(upsertItems).mockResolvedValue({})
  })

  it('starts idle before any cloud sync has run', () => {
    const { result } = renderHook(() => useStore('user-sync', { cloudSyncEnabled: true }))
    expect(result.current.syncStatus).toEqual({ state: 'idle', lastSyncedAt: null, lastError: null })
  })

  it('transitions to synced with a timestamp after a successful push', async () => {
    const { result } = renderHook(() => useStore('user-sync', { cloudSyncEnabled: true }))
    // Mirrors the app calling finishRemoteLoad after login data is ready —
    // the debounced push effects are suppressed until remoteReady flips true.
    act(() => { result.current.finishRemoteLoad(true) })
    act(() => { result.current.addNovel({ title: 'Cloud Book', type: 'novel' }) })

    await waitFor(() => expect(result.current.syncStatus.state).toBe('synced'), { timeout: 3000 })
    expect(result.current.syncStatus.lastSyncedAt).toBeGreaterThan(0)
    expect(result.current.syncStatus.lastError).toBeNull()
  })

  it('transitions to error with a message when a push fails', async () => {
    const { result } = renderHook(() => useStore('user-sync', { cloudSyncEnabled: true }))
    act(() => { result.current.finishRemoteLoad(true) })
    // addNovel also touches activeNovelId, which debounces a concurrent
    // settings push — let that settle first so only the characters push
    // (the one we're about to fail) is in flight.
    act(() => { result.current.addNovel({ title: 'Doomed Book', type: 'novel' }) })
    await waitFor(() => expect(result.current.syncStatus.state).toBe('synced'), { timeout: 3000 })

    vi.mocked(upsertItems).mockRejectedValueOnce(new Error('network unreachable'))
    act(() => { result.current.saveCharacter({ name: 'Unsynced Hero' }) })

    await waitFor(() => expect(result.current.syncStatus.state).toBe('error'), { timeout: 3000 })
    expect(result.current.syncStatus.lastError).toBe('network unreachable')
  })

  it('does not update sync status when cloud sync is disabled', async () => {
    const { result } = renderHook(() => useStore('user-sync', { cloudSyncEnabled: false }))
    act(() => { result.current.finishRemoteLoad(true) })
    act(() => { result.current.addNovel({ title: 'Local Only', type: 'novel' }) })
    await new Promise(r => setTimeout(r, 50))

    expect(result.current.syncStatus).toEqual({ state: 'idle', lastSyncedAt: null, lastError: null })
    expect(upsertItems).not.toHaveBeenCalled()
  })

  it('resets to idle when the signed-in user changes', async () => {
    const { result, rerender } = renderHook(
      ({ userId }) => useStore(userId, { cloudSyncEnabled: true }),
      { initialProps: { userId: 'user-a' } }
    )
    act(() => { result.current.finishRemoteLoad(true) })
    act(() => { result.current.addNovel({ title: 'A Book', type: 'novel' }) })
    await waitFor(() => expect(result.current.syncStatus.state).toBe('synced'), { timeout: 3000 })

    rerender({ userId: 'user-b' })

    expect(result.current.syncStatus).toEqual({ state: 'idle', lastSyncedAt: null, lastError: null })
  })
})
