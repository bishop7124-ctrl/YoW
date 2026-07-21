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

  // Regression: importData (the login/reconciliation path) restored every
  // synced entity except rpgCharacters, so Party/Character Builder sheets
  // always came back empty after sign-out + sign-in even when the write had
  // reached the cloud fine — "created two characters, neither there on
  // login".
  it('restores rpg (Party) characters with imported project data', () => {
    const { result } = renderHook(() => useStore(null))
    const novel = { id: 'novel-1', title: 'Campaign', type: 'dnd_campaign' }
    const pc = { id: 'pc-1', novelId: novel.id, name: 'Thorin Testblade', isPartyMember: true }

    act(() => {
      result.current.importData({
        novels: [novel],
        activeNovelId: novel.id,
        rpgCharacters: [pc],
      })
    })

    // rpgCharacters is normalized as it's loaded (see below), so it carries
    // backfilled defaults on top of the stored record — assert the identity/
    // fields that matter rather than exact equality.
    expect(result.current.rpgCharacters).toEqual([expect.objectContaining(pc)])
    expect(JSON.parse(localStorage.getItem('nf_rpg_characters'))).toEqual([expect.objectContaining(pc)])
  })

  // Regression: the Party page crashed with "Cannot read properties of
  // undefined (reading 'current')" — CharacterSheet/CharacterBuilder read
  // character.hp.current directly. Once rpgCharacters actually loaded from
  // the cloud (the fix above), older/incomplete records with no hp object
  // (e.g. from an AI import that omitted it) reached the UI for the first
  // time and crashed. rpgCharacters is now normalized as part of the loaded
  // state (not just where it's read), so the healed record — not just the
  // crash — makes it into the store and localStorage. See the next test for
  // the healed record actually reaching Supabase.
  it('backfills a missing hp object on rpg characters read from storage, and heals it in state (not just at render)', () => {
    const { result } = renderHook(() => useStore(null))
    const novel = { id: 'novel-1', title: 'Campaign', type: 'dnd_campaign' }
    const incomplete = { id: 'pc-legacy', novelId: novel.id, name: 'Legacy NPC' }

    act(() => {
      result.current.importData({
        novels: [novel],
        activeNovelId: novel.id,
        rpgCharacters: [incomplete],
      })
    })

    // The healed hp must be in the persisted snapshot too — that's what the
    // debounced cloud-sync effect reads and pushes back to Supabase to
    // actually fix the row, not just what the UI happens to render.
    const [storedHealed] = JSON.parse(localStorage.getItem('nf_rpg_characters'))
    expect(storedHealed.hp).toEqual({ max: 10, current: 10, temp: 0 })

    const [loaded] = result.current.rpgCharacters
    expect(loaded.hp).toEqual({ max: 10, current: 10, temp: 0 })
    expect(loaded.abilityScores).toMatchObject({ str: 10, dex: 10 })
  })

  // Regression: normalizing rpgCharacters in importData isn't enough on its
  // own — the regular debounced cloud-sync effect is suppressed for the
  // whole import (guarded by `importing.current`, cleared 500ms after import
  // finishes) and nothing changes rpgCharacters again afterward to
  // re-trigger it. Without an explicit push, a healed character stayed
  // healed only in memory and localStorage; the bad row in Supabase was
  // never actually fixed, so it kept getting "healed" from scratch — and
  // crashing any other client that read it directly — on every load.
  it('pushes a healed rpg character back to the cloud after import settles', async () => {
    vi.mocked(upsertItems).mockClear()
    vi.mocked(upsertItems).mockResolvedValue({})
    const { result } = renderHook(() => useStore('user-heal', { cloudSyncEnabled: true }))
    const novel = { id: 'novel-1', title: 'Campaign', type: 'dnd_campaign' }
    const incomplete = { id: 'pc-legacy', novelId: novel.id, name: 'Legacy NPC' }

    act(() => {
      result.current.importData({
        novels: [novel],
        activeNovelId: novel.id,
        rpgCharacters: [incomplete],
      })
    })

    await waitFor(() => expect(upsertItems).toHaveBeenCalledWith(
      'rpg_characters',
      'user-heal',
      [expect.objectContaining({ id: 'pc-legacy', hp: { max: 10, current: 10, temp: 0 } })]
    ), { timeout: 2000 })
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

  it('updateNovel blocks edits to a non-active project on the free tier even while a different project is active', () => {
    // Seed two novels directly and make the free project the active one.
    localStorage.setItem('nf_novels', JSON.stringify([
      { id: 'free-1', title: 'Locked Free Project', type: 'novel' },
      { id: 'other-2', title: 'Other Project', type: 'novel' },
    ]))
    const { result } = renderHook(() => useStore(null, { freeProjectId: 'free-1' }))
    act(() => { result.current.setActiveNovelId('free-1') })

    expect(result.current.readOnly).toBe(false)

    act(() => { result.current.updateNovel('other-2', { title: 'Hacked title' }) })

    const stored = JSON.parse(localStorage.getItem('nf_novels'))
    expect(stored.find(n => n.id === 'other-2').title).toBe('Other Project')
  })

  it('deleteNovel blocks deleting a non-active project on the free tier', () => {
    localStorage.setItem('nf_novels', JSON.stringify([
      { id: 'free-1', title: 'Locked Free Project', type: 'novel' },
      { id: 'other-2', title: 'Other Project', type: 'novel' },
    ]))
    const { result } = renderHook(() => useStore(null, { freeProjectId: 'free-1' }))
    act(() => { result.current.setActiveNovelId('free-1') })

    act(() => { result.current.deleteNovel('other-2') })

    const stored = JSON.parse(localStorage.getItem('nf_novels'))
    expect(stored.map(n => n.id)).toContain('other-2')
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

// ─── immediate data-safety persistence ───────────────────────────────────────

describe('immediate data-safety persistence', () => {
  it('writes worldbuilding, schedule, and RPG records before the next effect tick', () => {
    const { result } = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))

    act(() => { result.current.addNovel({ title: 'Safe World', type: 'dnd_campaign' }) })

    act(() => { result.current.saveCharacter({ name: 'Immediate Hero' }) })
    act(() => { result.current.saveLocation({ name: 'Immediate Keep' }) })
    act(() => { result.current.addLoreEntry({ title: 'Immediate Lore' }) })
    act(() => { result.current.addEvent({ title: 'Immediate Event' }, { createHistory: false }) })
    act(() => { result.current.addScheduleEvent({ title: 'Immediate Session' }) })
    act(() => { result.current.saveRpgCharacter({ name: 'Immediate PC' }) })

    expect(JSON.parse(localStorage.getItem('nf_characters')).some(item => item.name === 'Immediate Hero')).toBe(true)
    expect(JSON.parse(localStorage.getItem('nf_locations')).some(item => item.name === 'Immediate Keep')).toBe(true)
    expect(JSON.parse(localStorage.getItem('nf_loreEntries')).some(item => item.title === 'Immediate Lore')).toBe(true)
    expect(JSON.parse(localStorage.getItem('nf_timeline')).some(item => item.title === 'Immediate Event')).toBe(true)
    expect(JSON.parse(localStorage.getItem('nf_storySchedule')).some(item => item.title === 'Immediate Session')).toBe(true)
    expect(JSON.parse(localStorage.getItem('nf_rpg_characters')).some(item => item.name === 'Immediate PC')).toBe(true)
    expect(localStorage.getItem('nf_localOwner')).toBe('user-local')
    expect(Number(localStorage.getItem('nf_localWriteAt'))).toBeGreaterThan(0)
  })

  it('persists active project selection immediately for refresh and logout recovery', () => {
    const { result } = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))

    act(() => { result.current.addNovel({ title: 'First Project', type: 'novel' }) })
    const firstId = result.current.activeNovelId
    act(() => { result.current.addNovel({ title: 'Second Project', type: 'dnd_campaign' }) })
    const secondId = result.current.activeNovelId

    expect(secondId).not.toBe(firstId)
    expect(localStorage.getItem('nf_activeNovel').replaceAll('"', '')).toBe(secondId)

    act(() => { result.current.setActiveNovelId(firstId) })

    expect(localStorage.getItem('nf_activeNovel').replaceAll('"', '')).toBe(firstId)
    expect(localStorage.getItem('nf_localOwner')).toBe('user-local')
  })

  it('restores the same active D&D project after sign-out cleanup when cloud settings are stale', () => {
    const { result } = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))

    act(() => { result.current.addNovel({ title: 'Novel Project', type: 'novel' }) })
    const novelId = result.current.activeNovelId
    act(() => { result.current.addNovel({ title: 'Campaign Project', type: 'dnd_campaign' }) })
    const dndId = result.current.activeNovelId

    act(() => { result.current.clearData() })
    act(() => {
      result.current.importData({
        _savedAt: 1,
        activeNovelId: novelId,
        novels: [
          { id: novelId, title: 'Novel Project', type: 'novel' },
          { id: dndId, title: 'Campaign Project', type: 'dnd_campaign' },
        ],
      })
    })

    expect(result.current.activeNovelId).toBe(dndId)
  })

  it('preserves a newer scene edit as a conflict copy when a stale tab writes over it', () => {
    const tabA = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))

    act(() => { tabA.result.current.addNovel({ title: 'Two Tabs', type: 'novel' }) })
    const sceneId = tabA.result.current.scenes[0].id

    const tabB = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))

    act(() => { tabA.result.current.updateSceneContent(sceneId, 'Tab A newer text') })
    act(() => { tabB.result.current.updateSceneContent(sceneId, 'Tab B stale text') })

    const storedScenes = JSON.parse(localStorage.getItem('nf_scenes'))
    const original = storedScenes.find(scene => scene.id === sceneId)
    const conflict = storedScenes.find(scene => scene.conflictOf === sceneId)

    expect(original.content).toBe('Tab B stale text')
    expect(conflict).toBeTruthy()
    expect(conflict.content).toBe('Tab A newer text')
    expect(conflict.title).toContain('conflict copy')
  })

  it('excludes conflict copies from the normal scenes list and exposes them via sceneConflicts', () => {
    const tabA = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.addNovel({ title: 'Two Tabs', type: 'novel' }) })
    const sceneId = tabA.result.current.scenes[0].id

    const tabB = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.updateSceneContent(sceneId, 'Tab A newer text') })
    act(() => { tabB.result.current.updateSceneContent(sceneId, 'Tab B stale text') })

    // Re-render tabA to pick up the persisted conflict copy.
    const tabAFresh = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))

    expect(tabAFresh.result.current.scenes.some(s => s.conflictOf === sceneId)).toBe(false)
    expect(tabAFresh.result.current.sceneConflicts).toHaveLength(1)
    expect(tabAFresh.result.current.sceneConflicts[0].conflictOf).toBe(sceneId)
  })

  it('restoreSceneConflict copies the conflict content back onto the original scene and removes the copy', () => {
    const tabA = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.addNovel({ title: 'Two Tabs', type: 'novel' }) })
    const sceneId = tabA.result.current.scenes[0].id

    const tabB = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.updateSceneContent(sceneId, 'Tab A newer text') })
    act(() => { tabB.result.current.updateSceneContent(sceneId, 'Tab B stale text') })

    const tabAFresh = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))
    const conflictId = tabAFresh.result.current.sceneConflicts[0].id

    act(() => { tabAFresh.result.current.restoreSceneConflict(conflictId) })

    expect(tabAFresh.result.current.sceneConflicts).toHaveLength(0)
    expect(tabAFresh.result.current.scenes.find(s => s.id === sceneId).content).toBe('Tab A newer text')
  })

  it('discardSceneConflict removes the copy without touching the original scene', () => {
    const tabA = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.addNovel({ title: 'Two Tabs', type: 'novel' }) })
    const sceneId = tabA.result.current.scenes[0].id

    const tabB = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.updateSceneContent(sceneId, 'Tab A newer text') })
    act(() => { tabB.result.current.updateSceneContent(sceneId, 'Tab B stale text') })

    const tabAFresh = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))
    const conflictId = tabAFresh.result.current.sceneConflicts[0].id

    act(() => { tabAFresh.result.current.discardSceneConflict(conflictId) })

    expect(tabAFresh.result.current.sceneConflicts).toHaveLength(0)
    expect(tabAFresh.result.current.scenes.find(s => s.id === sceneId).content).toBe('Tab B stale text')
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
    await new Promise(r => setTimeout(r, 2200))

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

// A create (e.g. a Party character) debounces its cloud push by 2s. If the
// user signs out inside that window, the store wipes its local cache on the
// userId change — so flushPendingSync must be able to send the push
// immediately, before sign-out revokes the session, or the edit is lost for
// good (reproduces the "created two characters, neither there on login" bug).
describe('flushPendingSync', () => {
  beforeEach(() => {
    vi.mocked(upsertItems).mockClear()
    vi.mocked(upsertItems).mockResolvedValue({})
  })

  it('sends a still-debounced push immediately instead of waiting out the delay', async () => {
    const { result } = renderHook(() => useStore('user-flush', { cloudSyncEnabled: true }))
    act(() => { result.current.finishRemoteLoad(true) })
    act(() => { result.current.saveRpgCharacter({ name: 'Quick Exit' }) })

    // Still inside the 2s debounce window — nothing should have gone out yet.
    expect(upsertItems).not.toHaveBeenCalled()

    await act(async () => { await result.current.flushPendingSync() })

    expect(upsertItems).toHaveBeenCalledWith('rpg_characters', 'user-flush', expect.arrayContaining([
      expect.objectContaining({ name: 'Quick Exit' }),
    ]))
  })

  it('resolves with nothing pending rather than hanging', async () => {
    const { result } = renderHook(() => useStore('user-flush-idle', { cloudSyncEnabled: true }))
    act(() => { result.current.finishRemoteLoad(true) })

    await expect(act(async () => { await result.current.flushPendingSync() })).resolves.not.toThrow()
    expect(upsertItems).not.toHaveBeenCalled()
  })
})
