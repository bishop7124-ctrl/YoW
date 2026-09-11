// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useStore } from './useStore.js'
import { loadLocalFirstSnapshot, saveStorageMode, STORAGE_MODES } from '../utils/storageMode.js'
import { upsertItems, saveSceneDoc, deleteItem, deleteSceneDoc, deleteProjectData, replaceUserData } from '../utils/firestoreSync.js'
import { familyRelationshipMapEdges } from '../utils/familyRelationships.js'
import { deleteUserMedia } from '../utils/uploadUserMedia.js'
import { estimateStoreSize } from '../utils/storageQuota.js'
import { createMemoryBackend, resetStorageBackend, setStorageBackend } from '../storage/projectStorage.js'

// Mock Supabase-backed modules so tests run without network
vi.mock('../utils/firestoreSync', () => ({
  upsertItems:        vi.fn().mockResolvedValue({}),
  deleteItem:         vi.fn().mockResolvedValue({}),
  saveUserSettings:   vi.fn().mockResolvedValue({}),
  saveSceneDoc:       vi.fn().mockResolvedValue({}),
  deleteSceneDoc:     vi.fn().mockResolvedValue({}),
  deleteProjectData:  vi.fn().mockResolvedValue({}),
  replaceUserData:    vi.fn().mockResolvedValue({}),
  getUserStorageUsage: vi.fn().mockResolvedValue(0),
}))
vi.mock('../utils/projectStats', () => ({
  buildProjectStats: vi.fn().mockReturnValue({}),
}))
vi.mock('../utils/storageQuota', () => ({
  estimateStoreSize: vi.fn().mockReturnValue(0),
}))
vi.mock('../utils/uploadUserMedia', async importOriginal => ({
  ...(await importOriginal()),
  deleteUserMedia: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  resetStorageBackend()
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

describe('explicit data replacement', () => {
  it('honors the selected replacement even when the local snapshot has a newer timestamp', () => {
    const localNovel = { id: 'local-novel', title: 'Newer local copy', type: 'novel' }
    localStorage.setItem('nf_localOwner', 'replace-user')
    localStorage.setItem('nf_localWriteAt', String(Date.now()))
    localStorage.setItem('nf_novels', JSON.stringify([localNovel]))
    localStorage.setItem('nf_activeNovel', JSON.stringify(localNovel.id))
    const { result } = renderHook(() => useStore('replace-user', { cloudSyncEnabled: false }))
    const restoredNovel = { id: 'backup-novel', title: 'Chosen backup', type: 'novel' }

    act(() => {
      result.current.importData({
        _savedAt: 1,
        novels: [restoredNovel],
        activeNovelId: restoredNovel.id,
      }, { preferLocal: false })
    })

    expect(result.current.novels).toEqual([restoredNovel])
    expect(result.current.activeNovelId).toBe(restoredNovel.id)
  })

  it('commits the cloud transaction before replacing local state', async () => {
    vi.mocked(replaceUserData).mockClear()
    vi.mocked(replaceUserData).mockResolvedValue({})
    const { result } = renderHook(() => useStore('replace-cloud-user'))
    const restoredNovel = { id: 'backup-novel', title: 'Chosen backup', type: 'novel' }

    await act(async () => {
      await result.current.replaceData({ novels: [restoredNovel], activeNovelId: restoredNovel.id })
    })

    expect(replaceUserData).toHaveBeenCalledExactlyOnceWith(
      'replace-cloud-user',
      { novels: [restoredNovel], activeNovelId: restoredNovel.id },
    )
    expect(result.current.novels).toEqual([restoredNovel])
  })

  it('leaves local state unchanged when the cloud transaction fails', async () => {
    vi.mocked(replaceUserData).mockRejectedValueOnce(new Error('transaction failed'))
    const { result } = renderHook(() => useStore('replace-failure-user'))
    let original
    act(() => {
      original = result.current.addNovel({ title: 'Keep this project', type: 'novel' })
    })

    await act(async () => {
      await expect(result.current.replaceData({
        novels: [{ id: 'replacement', title: 'Do not show', type: 'novel' }],
        activeNovelId: 'replacement',
      })).rejects.toThrow('transaction failed')
    })

    expect(result.current.novels).toEqual([expect.objectContaining({ id: original.id, title: 'Keep this project' })])
  })

  it('leaves rendered and mirrored local state unchanged when the local replacement transaction fails', async () => {
    const originalNovel = { id: 'original', title: 'Keep this project', type: 'novel' }
    const backend = createMemoryBackend({
      nf_localOwner: 'replace-local-user',
      nf_novels: JSON.stringify([originalNovel]),
      nf_activeNovel: JSON.stringify(originalNovel.id),
    })
    backend.replaceItems = vi.fn(async () => { throw new Error('local transaction aborted') })
    setStorageBackend(backend)
    const { result, unmount } = renderHook(() => useStore('replace-local-user', { cloudSyncEnabled: false }))

    await act(async () => {
      await expect(result.current.replaceData({
        novels: [{ id: 'replacement', title: 'Do not show', type: 'novel' }],
        activeNovelId: 'replacement',
      })).rejects.toThrow('local transaction aborted')
    })

    expect(result.current.novels).toEqual([originalNovel])
    expect(JSON.parse(backend.getItem('nf_novels'))).toEqual([originalNovel])
    expect(JSON.parse(backend.getItem('nf_localWriteFailed'))).toContain('nf_projectReplacement')
    unmount()
    resetStorageBackend()
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

  it('can create an import destination without adding starter manuscript rows', () => {
    const { result } = renderHook(() => useStore(null))
    let novel
    act(() => { novel = result.current.addNovel({ title: 'Restore', type: 'novel' }, { seedManuscript: false }) })
    const data = result.current.getProjectExportData(novel.id)
    expect(data.acts).toHaveLength(0)
    expect(data.chapters).toHaveLength(0)
    expect(data.scenes).toHaveLength(0)
    expect(data.project.seedManuscript).toBeUndefined()
  })

  it('updateNovel merges fields without losing existing data', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'Original', type: 'novel' }) })
    const id = result.current.novels[0].id

    let updated
    act(() => { updated = result.current.updateNovel(id, { id: 'hijack', type: 'comic', createdAt: 'replaced', title: 'Updated' }) })

    const novel = result.current.novels[0]
    expect(updated).toBe(novel)
    expect(novel.title).toBe('Updated')
    expect(novel.type).toBe('novel')
    expect(novel.id).toBe(id)
  })

  it('deleteNovel removes the novel and persists the deletion', async () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'To Delete', type: 'novel' }) })
    const id = result.current.novels[0].id

    let deleted
    await act(async () => { deleted = await result.current.deleteNovel(id) })

    expect(deleted).toBe(true)
    expect(result.current.novels).toHaveLength(0)
    const stored = JSON.parse(localStorage.getItem('nf_novels'))
    expect(stored).toHaveLength(0)
    await expect(result.current.deleteNovel('missing')).resolves.toBe(false)
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

  it('deleteNovel cleans up uploaded Storage images for the novel and its characters/factions', async () => {
    vi.mocked(deleteUserMedia).mockClear()
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'To Delete', type: 'novel', coverPhoto: 'https://x/storage/v1/object/public/user-media/u1/covers/a.webp', bannerImage: 'https://x/storage/v1/object/public/user-media/u1/banners/b.webp' }) })
    const id = result.current.novels[0].id
    act(() => { result.current.saveCharacter({ name: 'Frodo', novelId: id, image: 'https://x/storage/v1/object/public/user-media/u1/characters/c.webp' }) })
    act(() => { result.current.saveFaction({ name: 'Fellowship', novelId: id, logo: { source: 'image', image: 'https://x/storage/v1/object/public/user-media/u1/factions/f.webp' } }) })

    await act(async () => { await result.current.deleteNovel(id) })

    const deletedUrls = vi.mocked(deleteUserMedia).mock.calls.map(call => call[0])
    expect(deletedUrls).toEqual(expect.arrayContaining([
      'https://x/storage/v1/object/public/user-media/u1/covers/a.webp',
      'https://x/storage/v1/object/public/user-media/u1/banners/b.webp',
      'https://x/storage/v1/object/public/user-media/u1/characters/c.webp',
      'https://x/storage/v1/object/public/user-media/u1/factions/f.webp',
    ]))
  })

  it('deleteNovel blocks deleting a non-active project on the free tier', async () => {
    localStorage.setItem('nf_novels', JSON.stringify([
      { id: 'free-1', title: 'Locked Free Project', type: 'novel' },
      { id: 'other-2', title: 'Other Project', type: 'novel' },
    ]))
    const { result } = renderHook(() => useStore(null, { freeProjectId: 'free-1' }))
    act(() => { result.current.setActiveNovelId('free-1') })

    await act(async () => { await result.current.deleteNovel('other-2') })

    const stored = JSON.parse(localStorage.getItem('nf_novels'))
    expect(stored.map(n => n.id)).toContain('other-2')
  })

  it('keeps local project data intact when the atomic cloud deletion fails', async () => {
    vi.mocked(deleteProjectData).mockRejectedValueOnce(new Error('database rollback'))
    const { result } = renderHook(() => useStore('delete-cloud-user'))
    let project
    act(() => { project = result.current.addNovel({ title: 'Keep after failure', type: 'novel' }) })

    await act(async () => {
      await expect(result.current.deleteNovel(project.id)).rejects.toThrow('database rollback')
    })

    expect(result.current.novels).toEqual([expect.objectContaining({ id: project.id })])
    expect(JSON.parse(localStorage.getItem('nf_novels'))).toEqual([expect.objectContaining({ id: project.id })])
  })

  it('keeps rendered and mirrored project data intact when the local deletion transaction fails', async () => {
    const project = { id: 'local-project', title: 'Keep locally', type: 'novel' }
    const backend = createMemoryBackend({
      nf_novels: JSON.stringify([project]),
      'nf_scene_content:local-scene': 'Keep this prose',
    })
    backend.replaceItems = vi.fn(async () => { throw new Error('local delete rollback') })
    setStorageBackend(backend)
    const { result } = renderHook(() => useStore(null, { cloudSyncEnabled: false }))
    expect(result.current.novels).toEqual([project])

    await act(async () => {
      await expect(result.current.deleteNovel(project.id)).rejects.toThrow('local delete rollback')
    })

    expect(result.current.novels).toEqual([project])
    expect(backend.getItem('nf_scene_content:local-scene')).toBe('Keep this prose')
  })

  // Regression coverage for audit finding #16 ("Project deletion can leave
  // per-scene keys"): deleteNovel now reads the deleted project's scene ids
  // straight from persisted `nf_scenes` (via deleteAllSceneContentForNovel)
  // instead of only relying on whatever `scenesRef` already tracked, and
  // cleans up `nf_scene_versions` too — a step deleteNovel had no code path
  // for at all before this fix. Mirrors the analogous cloud-side test
  // ("scene cloud cleanup on project delete" in firestoreSync.test.js):
  // seed storage directly rather than building state up through the store's
  // own add* methods, then assert only the deleted project's data is gone.
  it('deleteNovel removes every per-scene content key and version-history entry for the project, leaving other projects untouched', async () => {
    localStorage.setItem('nf_novels', JSON.stringify([
      { id: 'novel-1', title: 'To Delete', type: 'novel' },
      { id: 'novel-2', title: 'Keep Me', type: 'novel' },
    ]))
    localStorage.setItem('nf_scenes', JSON.stringify([
      { id: 'scene-1', novelId: 'novel-1', title: 'Scene One' },
      { id: 'scene-2', novelId: 'novel-1', title: 'Scene Two' },
      { id: 'scene-3', novelId: 'novel-2', title: 'Other Project Scene' },
    ]))
    localStorage.setItem('nf_scene_content:scene-1', 'Novel 1 scene 1 prose.')
    localStorage.setItem('nf_scene_content:scene-2', 'Novel 1 scene 2 prose.')
    localStorage.setItem('nf_scene_content:scene-3', 'Novel 2 scene prose.')
    localStorage.setItem('nf_scene_versions', JSON.stringify([
      { id: 'v1', sceneId: 'scene-1', novelId: 'novel-1', title: 'Scene One', content: 'v1', wordCount: 1, timestamp: 1 },
      { id: 'v2', sceneId: 'scene-2', novelId: 'novel-1', title: 'Scene Two', content: 'v1', wordCount: 1, timestamp: 2 },
      { id: 'v3', sceneId: 'scene-3', novelId: 'novel-2', title: 'Other Project Scene', content: 'v1', wordCount: 1, timestamp: 3 },
    ]))
    localStorage.setItem('nf_series', JSON.stringify([{ id: 'series-1', projectOrder: ['novel-1', 'novel-2'] }]))

    const { result } = renderHook(() => useStore(null))
    await act(async () => { await result.current.deleteNovel('novel-1') })

    expect(localStorage.getItem('nf_scene_content:scene-1')).toBeNull()
    expect(localStorage.getItem('nf_scene_content:scene-2')).toBeNull()
    // Untouched project's scene content survives.
    expect(localStorage.getItem('nf_scene_content:scene-3')).toBe('Novel 2 scene prose.')

    const remainingVersions = JSON.parse(localStorage.getItem('nf_scene_versions'))
    expect(remainingVersions.map(v => v.id)).toEqual(['v3'])
    expect(JSON.parse(localStorage.getItem('nf_series'))[0].projectOrder).toEqual(['novel-2'])
  })

  // The "stale/orphan" half of finding #16: a content key whose scene record
  // is already missing from `nf_scenes` entirely (left behind by some
  // earlier gap, under no project) has no owner to attribute it to, so
  // deleteNovel's cleanup sweeps it opportunistically regardless of which
  // project is actually being deleted.
  it('deleteNovel also sweeps orphaned scene content keys that belong to no project in nf_scenes', async () => {
    localStorage.setItem('nf_novels', JSON.stringify([{ id: 'novel-1', title: 'To Delete', type: 'novel' }]))
    localStorage.setItem('nf_scenes', JSON.stringify([{ id: 'scene-1', novelId: 'novel-1', title: 'Scene One' }]))
    localStorage.setItem('nf_scene_content:scene-1', 'Novel 1 scene prose.')
    // No nf_scenes entry anywhere references this id.
    localStorage.setItem('nf_scene_content:orphan-1', 'Nobody references this scene any more.')

    const { result } = renderHook(() => useStore(null))
    await act(async () => { await result.current.deleteNovel('novel-1') })

    expect(localStorage.getItem('nf_scene_content:scene-1')).toBeNull()
    expect(localStorage.getItem('nf_scene_content:orphan-1')).toBeNull()
  })

  it('uses the locked free project as the dashboard active project during import', () => {
    const { result } = renderHook(() => useStore('user-local', { cloudSyncEnabled: false, freeProjectId: 'free-1' }))

    act(() => {
      result.current.importData({
        activeNovelId: 'paid-era-2',
        novels: [
          { id: 'free-1', title: 'Chosen Free Project', type: 'novel', focus: false },
          { id: 'paid-era-2', title: 'Old Paid Project', type: 'novel', focus: true },
        ],
      })
    })

    expect(result.current.activeNovelId).toBe('free-1')
    expect(result.current.novels.find(n => n.id === 'free-1').focus).toBe(true)
    expect(result.current.novels.find(n => n.id === 'paid-era-2').focus).toBe(false)
  })

  it('uses the locked free project even when local data is fresher than cloud settings', () => {
    localStorage.setItem('nf_localOwner', 'user-local')
    localStorage.setItem('nf_localWriteAt', '5000')
    localStorage.setItem('nf_activeNovel', JSON.stringify('paid-era-2'))
    localStorage.setItem('nf_novels', JSON.stringify([
      { id: 'free-1', title: 'Chosen Free Project', type: 'novel', focus: false },
      { id: 'paid-era-2', title: 'Old Paid Project', type: 'novel', focus: true },
    ]))

    const { result } = renderHook(() => useStore('user-local', { cloudSyncEnabled: false, freeProjectId: 'free-1' }))

    act(() => {
      result.current.importData({
        _savedAt: 1000,
        activeNovelId: 'paid-era-2',
        novels: [
          { id: 'free-1', title: 'Cloud Free Project', type: 'novel', focus: false },
          { id: 'paid-era-2', title: 'Cloud Old Paid Project', type: 'novel', focus: true },
        ],
      })
    })

    expect(result.current.activeNovelId).toBe('free-1')
    expect(result.current.novels.find(n => n.id === 'free-1').focus).toBe(true)
    expect(result.current.novels.find(n => n.id === 'paid-era-2').focus).toBe(false)
  })

  it('promotes a newly selected free project to the dashboard active project', async () => {
    const { result, rerender } = renderHook(
      ({ freeProjectId }) => useStore('user-local', { cloudSyncEnabled: false, freeProjectId }),
      { initialProps: { freeProjectId: null } }
    )

    act(() => {
      result.current.importData({
        activeNovelId: 'old-focus',
        novels: [
          { id: 'chosen-free', title: 'Chosen Free Project', type: 'novel', focus: false },
          { id: 'old-focus', title: 'Old Focus Project', type: 'novel', focus: true },
        ],
      })
    })

    rerender({ freeProjectId: 'chosen-free' })

    await waitFor(() => {
      expect(result.current.activeNovelId).toBe('chosen-free')
      expect(result.current.novels.find(n => n.id === 'chosen-free').focus).toBe(true)
      expect(result.current.novels.find(n => n.id === 'old-focus').focus).toBe(false)
    })
  })

  it('resolves a function-valued field in updateScene against the latest known value instead of writing the function itself', () => {
    // Regression test for a real crash: NotesPanel's updateNote (ManuscriptToolbar.jsx)
    // calls onUpdateScene(id, { notes: prevNotes => ... }) so a fast burst of note
    // edits each resolve against the latest committed value rather than a stale
    // closure overwriting a sibling call's result. If updateScene ever merges that
    // function value straight into the scene record (instead of resolving it first),
    // scene.notes becomes a function — later reads like `[...(scene.notes || [])]`
    // then throw "is not iterable" and crash the whole Manuscript section.
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'Draft House', type: 'novel' }) })
    const sceneId = result.current.scenes[0].id

    act(() => {
      result.current.updateScene(sceneId, { notes: [{ id: 'n1', seq: 1, title: '', text: '' }] })
    })
    act(() => {
      result.current.updateScene(sceneId, {
        notes: prevNotes => (prevNotes || []).map(n => n.id === 'n1' ? { ...n, title: 'Pacing check' } : n),
      })
    })

    const scene = result.current.scenes.find(s => s.id === sceneId)
    expect(typeof scene.notes).not.toBe('function')
    expect(scene.notes).toEqual([{ id: 'n1', seq: 1, title: 'Pacing check', text: '' }])
  })

  it('retires the current manuscript and outline, then starts a fresh manuscript', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'Draft House', type: 'novel' }) })
    const originalSceneId = result.current.scenes[0].id
    act(() => {
      result.current.updateAct(result.current.acts[0].id, { title: 'Old Act' })
      result.current.updateChapter(result.current.chapters[0].id, { title: 'Old Chapter' })
      result.current.updateScene(originalSceneId, { title: 'Old Scene', content: 'old words here' })
    })

    let copy
    act(() => {
      copy = result.current.retireManuscript('Submission draft')
    })

    expect(copy.title).toBe('Submission draft')
    expect(copy.acts[0].title).toBe('Old Act')
    expect(copy.chapters[0].title).toBe('Old Chapter')
    expect(copy.scenes[0].content).toBe('old words here')
    expect(result.current.activeNovel.manuscriptCopies).toHaveLength(1)
    expect(result.current.activeNovel.manuscriptCopies[0].id).toBe(copy.id)
    expect(result.current.acts).toHaveLength(1)
    expect(result.current.chapters).toHaveLength(1)
    expect(result.current.scenes).toHaveLength(1)
    expect(result.current.scenes[0].id).not.toBe(originalSceneId)
    expect(result.current.scenes[0].content).toBe('')
  })

  it('restores a retired manuscript copy and can retire the current manuscript first', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'Draft House', type: 'novel' }) })
    act(() => {
      result.current.updateAct(result.current.acts[0].id, { title: 'First Outline' })
      result.current.updateScene(result.current.scenes[0].id, { title: 'First Scene', content: 'first draft' })
    })
    let firstCopy
    act(() => { firstCopy = result.current.retireManuscript('First retired draft') })
    act(() => {
      result.current.updateAct(result.current.acts[0].id, { title: 'Second Outline' })
      result.current.updateScene(result.current.scenes[0].id, { title: 'Second Scene', content: 'second draft' })
    })

    act(() => {
      result.current.restoreManuscriptCopy(firstCopy.id, {
        retireCurrentFirst: true,
        currentTitle: 'Second retired draft',
      })
    })

    expect(result.current.acts[0].title).toBe('First Outline')
    expect(result.current.scenes[0].content).toBe('first draft')
    expect(result.current.activeNovel.manuscriptCopies).toHaveLength(2)
    expect(result.current.activeNovel.manuscriptCopies[0].title).toBe('Second retired draft')
    expect(result.current.activeNovel.manuscriptCopies[0].acts[0].title).toBe('Second Outline')
    expect(result.current.activeNovel.manuscriptCopies[0].scenes[0].content).toBe('second draft')
  })

  it('cleans up old cloud manuscript rows when retiring', () => {
    vi.mocked(deleteItem).mockClear()
    vi.mocked(deleteSceneDoc).mockClear()
    const { result } = renderHook(() => useStore('cloud-user', { cloudSyncEnabled: true }))

    act(() => { result.current.addNovel({ title: 'Cloud Draft', type: 'novel' }) })
    const actId = result.current.acts[0].id
    const chapterId = result.current.chapters[0].id
    const sceneId = result.current.scenes[0].id

    act(() => { result.current.retireManuscript('Cloud copy') })

    expect(deleteItem).toHaveBeenCalledWith('acts', 'cloud-user', actId)
    expect(deleteItem).toHaveBeenCalledWith('chapters', 'cloud-user', chapterId)
    expect(deleteSceneDoc).toHaveBeenCalledWith('cloud-user', sceneId)
  })
})

// ─── scene notes: racing updateScene calls from a shared stale snapshot ────
// Regression coverage for a bug in SceneEditor's handleUpdateNote / NotesPanel's
// updateNoteText: both used to compute the WHOLE next `notes` array up front from a
// `scene.notes` value closed over at render time, then hand that finished array to
// updateScene. If two such calls fire before React refreshes the closure (e.g. a
// fast typing burst outpacing the render/commit cycle), BOTH calls derive their
// replacement array from the same pre-burst snapshot — so the second call's write
// doesn't build on the first call's result, it silently reverts it, because the
// snapshot it was computed from never saw the first call's change.
//
// updateScene now also accepts a function for any field (prevValue => nextValue),
// resolved against the true latest scene at the moment each call actually runs (see
// the comment above `resolvedData` in useStore.js), so calls compose correctly
// regardless of how stale the closure that produced them was.
describe('scene notes — racing updates from a shared stale snapshot', () => {
  const seedTwoNotes = () => {
    const { result } = renderHook(() => useStore(null))
    act(() => { result.current.addNovel({ title: 'Draft House', type: 'novel' }) })
    const sceneId = result.current.scenes[0].id
    act(() => {
      result.current.updateScene(sceneId, {
        notes: [
          { id: 'n1', seq: 1, text: '', anchorOffset: 0 },
          { id: 'n2', seq: 2, text: '', anchorOffset: 10 },
        ],
      })
    })
    return { result, sceneId }
  }

  it('composes function-valued updates instead of one clobbering the other', () => {
    const { result, sceneId } = seedTwoNotes()

    // Two updates, as if produced by two different stale closures (order-independent
    // by construction — each resolves against whatever the store's true current notes
    // are when it actually runs, not against a value captured up front).
    act(() => {
      result.current.updateScene(sceneId, {
        notes: prevNotes => (prevNotes || []).map(n => n.id === 'n1' ? { ...n, text: 'hello' } : n),
      })
      result.current.updateScene(sceneId, {
        notes: prevNotes => (prevNotes || []).map(n => n.id === 'n2' ? { ...n, text: 'world' } : n),
      })
    })

    const notes = result.current.scenes.find(s => s.id === sceneId).notes
    expect(notes.find(n => n.id === 'n1').text).toBe('hello')
    expect(notes.find(n => n.id === 'n2').text).toBe('world')
  })

  it('reproduces the stale-closure data loss when notes are precomputed against a snapshot', () => {
    const { result, sceneId } = seedTwoNotes()

    // The old buggy shape: both calls map over the SAME closed-over `staleNotes`
    // snapshot — as `scene.notes` would have been throughout a fast burst — the way
    // handleUpdateNote/updateNoteText used to before the fix.
    const staleNotes = result.current.scenes.find(s => s.id === sceneId).notes
    act(() => {
      result.current.updateScene(sceneId, {
        notes: staleNotes.map(n => n.id === 'n1' ? { ...n, text: 'hello' } : n),
      })
      result.current.updateScene(sceneId, {
        notes: staleNotes.map(n => n.id === 'n2' ? { ...n, text: 'world' } : n),
      })
    })

    // The second call's replacement array was derived from the pre-burst snapshot, so
    // it silently reverts the first call's change even though it never touched n1.
    const notes = result.current.scenes.find(s => s.id === sceneId).notes
    expect(notes.find(n => n.id === 'n1').text).toBe('') // lost
    expect(notes.find(n => n.id === 'n2').text).toBe('world')
  })
})

describe('getProjectExportData', () => {
  it('seeds The Last Ember as a full connected sample project', () => {
    const { result } = renderHook(() => useStore('sample-user'))

    let sample
    act(() => {
      sample = result.current.ensureSampleProject()
    })

    const data = result.current.getProjectExportData(sample.id)
    expect(data.project.title).toBe('The Last Ember')
    expect(data.project.wordCountTarget).toBe(97500)
    expect(data.project.coverPhoto).toBe('/demo-projects/the-last-ember/cover.jpg')
    expect(data.project.bannerImage).toBe('/demo-projects/the-last-ember/banner.jpg')
    expect(data.project.scheduleCalendar.months.map(month => month.name)).toEqual([
      'Kindling',
      'Highflame',
      'Ashwane',
      'Riverturn',
      'Glassfall',
      'Emberdeep',
      'Frostbell',
      'Dawnreturn',
    ])
    expect(data.project.scheduleCalendar.weekLength).toBe(6)
    expect(data.project.categoryOptions.schedule).toEqual([
      'Story Event',
      'Travel',
      'Council',
      'Ritual',
      'Battle',
      'Discovery',
      'World Event',
      'Revelation',
    ])
    expect(data.characters).toHaveLength(12)
    expect(data.characters.filter(character => character.image).length).toBe(12)
    expect(data.factions).toHaveLength(6)
    expect(data.locations).toHaveLength(18)
    expect(data.loreEntries).toHaveLength(42)
    expect(data.timeline).toHaveLength(40)
    expect(data.timeline.every(event => event.date)).toBe(true)
    expect(new Set(data.timeline.map(event => `${event.title}\u0000${event.date}`)).size).toBe(data.timeline.length)
    expect(data.worldHistory).toHaveLength(7)
    expect(data.eras).toHaveLength(3)
    expect(data.acts).toHaveLength(3)
    expect(data.chapters).toHaveLength(15)
    expect(data.scenes).toHaveLength(1)
    expect(data.scenes.reduce((sum, scene) => sum + (scene.content?.trim().match(/\S+/g)?.length || 0), 0)).toBeGreaterThan(700)
    const populatedSceneHistories = data.scenes.filter(scene => scene.content && scene.wordHistory?.length)
    expect(populatedSceneHistories).toHaveLength(1)
    expect(populatedSceneHistories[0].wordHistory.length).toBeGreaterThanOrEqual(14)
    expect(data.storySchedule).toHaveLength(30)
    expect(data.storySchedule.every(event => event.year === 1 && event.month >= 1 && event.month <= 3)).toBe(true)
    expect(data.storySchedule.some(event => event.title === 'Escape through Kestrel Market')).toBe(true)
    expect(data.storySchedule.some(event => event.category === 'ritual')).toBe(true)
    expect(data.storySchedule.some(event => event.category === 'council')).toBe(true)
    expect(data.storySchedule.every(event => !/draft|revise|review|research|writing|editing/i.test(event.title))).toBe(true)
    expect(data.maps[0].mapObjects).toHaveLength(18)
    expect(data.ideaEntries.filter(entry => entry.tags?.includes('note'))).toHaveLength(20)
    expect(data.ideaEntries.filter(entry => entry.tags?.includes('idea-card'))).toHaveLength(25)
    expect(data.ideaEntries.filter(entry => entry.tags?.includes('ai-result'))).toHaveLength(12)
    expect(data.ideaEntries).toHaveLength(57)

    const rowan = data.characters.find(character => character.name === 'Rowan Vale')
    const elia = data.characters.find(character => character.name === 'Princess Elia Marent')
    const oren = data.characters.find(character => character.name === 'Oren Vale')
    const garrick = data.characters.find(character => character.name === 'Captain Garrick Thorn')
    const sera = data.characters.find(character => character.name === 'Sera Thorn')
    const cassian = data.characters.find(character => character.name === 'Lord Cassian Vey')
    const validRelationshipMapTypes = new Set(['ally', 'enemy', 'friend', 'romantic', 'partner', 'relative'])
    const socialRelationships = data.characters.flatMap(character => character.relationships || [])
    expect(socialRelationships).toHaveLength(62)
    expect(socialRelationships.every(relationship => validRelationshipMapTypes.has(relationship.type))).toBe(true)
    expect(data.characters.every(character => (character.relationships || []).length >= 3)).toBe(true)
    expect(rowan.relationships.some(relationship => relationship.targetId === elia.id && relationship.type === 'ally')).toBe(true)
    const familyLinks = data.characters.flatMap(character => character.familyLinks || [])
    expect(familyLinks).toHaveLength(16)
    expect(new Set(familyLinks.map(link => link.kind))).toEqual(new Set(['parent_child', 'sibling', 'guardian', 'partner']))
    expect(new Set(familyLinks.map(link => link.status))).toEqual(new Set(['active', 'former', 'secret', 'disputed', 'hidden']))
    expect(oren.familyLinks.some(link => link.targetCharacterId === rowan.id && link.kind === 'parent_child')).toBe(true)
    expect(garrick.familyLinks.some(link => link.targetCharacterId === sera.id && link.kind === 'sibling')).toBe(true)
    expect(cassian.familyLinks.some(link => link.targetCharacterId === elia.id && link.kind === 'guardian')).toBe(true)
    const rowanFamilyMapTargets = familyRelationshipMapEdges(data.characters, rowan.id).map(edge => edge.targetId)
    expect(rowanFamilyMapTargets).toContain(oren.id)
    expect(data.locations.find(location => location.name === 'Glassmere Observatory').characterIds).toContain(rowan.id)
  })

  it('enriches an existing sparse Last Ember sample with relationship and family links', () => {
    const { result } = renderHook(() => useStore('sample-user'))
    const project = { id: 'last-ember-old', title: 'The Last Ember', type: 'novel', isSampleProject: true, sampleSource: 'the-last-ember' }
    const names = [
      'Rowan Vale',
      'Princess Elia Marent',
      'Lord Cassian Vey',
      'Sister Maeve Orin',
      'Captain Garrick Thorn',
      'Nox',
      'Tamsin Reed',
      'Oren Vale',
      'Sera Thorn',
      'Brannic Sol',
      'Iyra of the Red Pines',
      'Master Vellum',
    ]

    act(() => {
      result.current.importData({
        novels: [project],
        activeNovelId: project.id,
        chapters: [
          { id: 'old-ch-1', novelId: project.id, title: 'The Impossible Map' },
          { id: 'old-ch-2', novelId: project.id, title: 'Ash in the Margins' },
          { id: 'old-ch-3', novelId: project.id, title: 'River Debts' },
          { id: 'old-ch-4', novelId: project.id, title: 'The Trees Remember' },
        ],
        scenes: [
          { id: 'old-sc-1', novelId: project.id, chapterId: 'old-ch-1', title: 'Sparse scene', content: 'Short old text.' },
          { id: 'old-sc-2', novelId: project.id, chapterId: 'old-ch-2', title: 'Sparse scene', content: '' },
          { id: 'old-sc-3', novelId: project.id, chapterId: 'old-ch-3', title: 'Sparse scene', content: '' },
          { id: 'old-sc-4', novelId: project.id, chapterId: 'old-ch-4', title: 'Sparse scene', content: '' },
        ],
        characters: names.map((name, index) => ({
          id: `old-char-${index}`,
          novelId: project.id,
          name,
          relationships: [],
          familyLinks: [],
        })),
      })
    })
    act(() => {
      result.current.enrichSampleProject(project.id)
    })

    const characters = result.current.characters
    const rowan = characters.find(character => character.name === 'Rowan Vale')
    const elia = characters.find(character => character.name === 'Princess Elia Marent')
    const oren = characters.find(character => character.name === 'Oren Vale')
    const socialRelationships = characters.flatMap(character => character.relationships || [])
    const familyLinks = characters.flatMap(character => character.familyLinks || [])
    expect(socialRelationships.length).toBeGreaterThanOrEqual(55)
    expect(characters.every(character => (character.relationships || []).length >= 3)).toBe(true)
    expect(rowan.relationships.some(relationship => relationship.targetId === elia.id && relationship.type === 'ally')).toBe(true)
    expect(familyLinks).toHaveLength(16)
    expect(oren.familyLinks.some(link => link.targetCharacterId === rowan.id && link.kind === 'parent_child')).toBe(true)
    const enrichedProject = result.current.novels.find(novel => novel.id === project.id)
    const manuscriptWords = result.current.scenes.reduce((sum, scene) => sum + (scene.content?.trim().match(/\S+/g)?.length || 0), 0)
    expect(enrichedProject.coverPhoto).toBe('/demo-projects/the-last-ember/cover.jpg')
    expect(enrichedProject.bannerImage).toBe('/demo-projects/the-last-ember/banner.jpg')
    expect(manuscriptWords).toBeGreaterThan(700)
    expect(result.current.scenes.filter(scene => scene.wordHistory?.length >= 8)).toHaveLength(1)
    expect(localStorage.getItem('nf_sampleProjectSeeded:the-last-ember-v3:sample-user')).toBe('1')
  })

  it('restores exported project eras and remaps timeline era links', () => {
    const { result } = renderHook(() => useStore('sample-user'))

    let sample
    act(() => {
      sample = result.current.ensureSampleProject()
    })
    const exported = result.current.getProjectExportData(sample.id)

    let imported
    act(() => {
      imported = result.current.importProjectFromData(exported)
    })

    const importedData = result.current.getProjectExportData(imported.id)
    expect(importedData.eras).toHaveLength(3)
    expect(importedData.eras.map(era => era.name)).toContain('The Ember Crisis')
    expect(importedData.timeline.filter(event => event.eraId).every(event => importedData.eras.some(era => era.id === event.eraId))).toBe(true)
  })

  it('never reuses exported ids, even when the same export is imported twice into one account (audit P0-06)', () => {
    const { result } = renderHook(() => useStore('sample-user'))

    let sample
    act(() => { sample = result.current.ensureSampleProject() })
    const exported = result.current.getProjectExportData(sample.id)

    let importedA
    let importedB
    act(() => { importedA = result.current.importProjectFromData(exported) })
    act(() => { importedB = result.current.importProjectFromData(exported) })

    const dataA = result.current.getProjectExportData(importedA.id)
    const dataB = result.current.getProjectExportData(importedB.id)
    const dataSource = result.current.getProjectExportData(sample.id)

    const collectionKeys = [
      'characters', 'factions', 'locations', 'timeline', 'worldHistory', 'eras',
      'acts', 'chapters', 'scenes', 'loreEntries', 'ideaEntries', 'maps',
      'whiteboards', 'storySchedule', 'rpgCharacters',
    ]
    // Every collection except rpgCharacters actually has records in this
    // fixture (confirmed against src/data/theLastEmberDemoProject.json) — an
    // empty array for any of the others would mean the round trip silently
    // dropped a whole section, not that this test doesn't apply to it.
    const nonEmptyKeys = collectionKeys.filter(key => key !== 'rpgCharacters')
    for (const key of nonEmptyKeys) {
      expect((dataSource[key] ?? []).length).toBeGreaterThan(0)
    }
    for (const key of collectionKeys) {
      const idsSource = (dataSource[key] ?? []).map(item => item.id)
      const idsA = (dataA[key] ?? []).map(item => item.id)
      const idsB = (dataB[key] ?? []).map(item => item.id)
      expect(new Set(idsA).size).toBe(idsA.length) // no duplicate ids within one import
      const overlapWithSource = idsA.filter(id => idsSource.includes(id))
      const overlapWithOther = idsA.filter(id => idsB.includes(id))
      expect(overlapWithSource).toEqual([])
      expect(overlapWithOther).toEqual([])
    }
    expect(importedA.id).not.toBe(importedB.id)
    expect(importedA.id).not.toBe(sample.id)
  })

  it('remaps every character cross-reference to the newly-imported ids (audit P0-06)', () => {
    const { result } = renderHook(() => useStore('sample-user'))

    let sample
    act(() => { sample = result.current.ensureSampleProject() })
    const exported = result.current.getProjectExportData(sample.id)

    // The fixture's own journey beats don't populate their link fields, so
    // splice in real cross-references (using ids already present elsewhere
    // in this same export) to exercise the journey-beat remap path too.
    const linkedCharacter = exported.characters[0]
    const linkedChapter = exported.chapters[0]
    const linkedScene = exported.scenes[0]
    const linkedTimelineEvent = exported.timeline[0]
    const target = exported.characters.find(c => c.id !== linkedCharacter.id)
    const exportedWithJourneyLinks = {
      ...exported,
      characters: exported.characters.map(character => character.id === target.id ? {
        ...character,
        journey: {
          ...(character.journey || {}),
          beats: [
            ...(character.journey?.beats || []),
            {
              title: 'Test beat',
              linkedCharacterId: linkedCharacter.id,
              chapterId: linkedChapter.id,
              sceneId: linkedScene.id,
              timelineEventId: linkedTimelineEvent.id,
            },
          ],
        },
      } : character),
    }

    let imported
    act(() => { imported = result.current.importProjectFromData(exportedWithJourneyLinks) })
    const importedData = result.current.getProjectExportData(imported.id)

    const importedCharacterIds = new Set(importedData.characters.map(c => c.id))
    const importedFactionIds = new Set(importedData.factions.map(f => f.id))
    const charactersWithFaction = importedData.characters.filter(c => c.factionId)
    const charactersWithRelationships = importedData.characters.filter(c => (c.relationships || []).length)
    const charactersWithParents = importedData.characters.filter(c => (c.parentIds || []).length)
    const charactersWithJourneyLinks = importedData.characters.filter(c =>
      (c.journey?.beats || []).some(beat => beat.linkedCharacterId || beat.chapterId || beat.sceneId || beat.timelineEventId)
    )
    // The fixture (plus the spliced-in journey beat above) is known to
    // exercise every one of these fields — an empty filter here would mean
    // this test stopped exercising the behavior it claims to, not that it
    // passed.
    expect(charactersWithFaction.length).toBeGreaterThan(0)
    expect(charactersWithRelationships.length).toBeGreaterThan(0)
    expect(charactersWithParents.length).toBeGreaterThan(0)
    expect(charactersWithJourneyLinks.length).toBeGreaterThan(0)

    for (const character of charactersWithFaction) {
      expect(importedFactionIds.has(character.factionId)).toBe(true)
    }
    for (const character of charactersWithRelationships) {
      for (const relationship of character.relationships) {
        expect(importedCharacterIds.has(relationship.targetId)).toBe(true)
      }
    }
    for (const character of charactersWithParents) {
      for (const parentId of character.parentIds) {
        expect(importedCharacterIds.has(parentId)).toBe(true)
      }
    }
    const importedChapterIds = new Set(importedData.chapters.map(c => c.id))
    const importedSceneIds = new Set(importedData.scenes.map(s => s.id))
    const importedTimelineIds = new Set(importedData.timeline.map(e => e.id))
    for (const character of charactersWithJourneyLinks) {
      for (const beat of character.journey.beats) {
        if (beat.linkedCharacterId) expect(importedCharacterIds.has(beat.linkedCharacterId)).toBe(true)
        if (beat.chapterId) expect(importedChapterIds.has(beat.chapterId)).toBe(true)
        if (beat.sceneId) expect(importedSceneIds.has(beat.sceneId)).toBe(true)
        if (beat.timelineEventId) expect(importedTimelineIds.has(beat.timelineEventId)).toBe(true)
      }
    }
  })

  it('remaps familyLinks, idea linkedEntities, map linkedEntity, and RPG character faction/npc links on import (audit P0-06)', () => {
    const { result } = renderHook(() => useStore('sample-user'))

    let sample
    act(() => { sample = result.current.ensureSampleProject() })
    const exported = result.current.getProjectExportData(sample.id)

    // The fixture already exercises familyLinks and idea linkedEntities;
    // splice in a map linkedEntity and an RPG character (neither present in
    // the fixture) using real ids already in this export.
    const linkedLocation = exported.locations[0]
    const linkedFaction = exported.factions[0]
    const linkedCharacter = exported.characters[0]
    const exportedWithExtraLinks = {
      ...exported,
      maps: exported.maps.map((mapRecord, index) => index === 0 ? {
        ...mapRecord,
        mapObjects: [
          ...(mapRecord.mapObjects || []),
          { id: 'test-map-object', linkedEntity: { entityType: 'location', entityId: linkedLocation.id } },
        ],
      } : mapRecord),
      rpgCharacters: [
        {
          id: 'test-rpg-1',
          novelId: sample.id,
          name: 'Test NPC',
          factionIds: [linkedFaction.id],
          npcRelationships: [{ id: 'rel-1', characterId: linkedCharacter.id, note: 'ally' }],
        },
      ],
    }

    let imported
    act(() => { imported = result.current.importProjectFromData(exportedWithExtraLinks) })
    const importedData = result.current.getProjectExportData(imported.id)

    const importedCharacterIds = new Set(importedData.characters.map(c => c.id))
    const importedLocationIds = new Set(importedData.locations.map(l => l.id))
    const importedFactionIds = new Set(importedData.factions.map(f => f.id))
    const importedLoreIds = new Set(importedData.loreEntries.map(l => l.id))

    const charactersWithFamilyLinks = importedData.characters.filter(c => (c.familyLinks || []).length)
    expect(charactersWithFamilyLinks.length).toBeGreaterThan(0)
    for (const character of charactersWithFamilyLinks) {
      for (const link of character.familyLinks) {
        expect(importedCharacterIds.has(link.sourceCharacterId)).toBe(true)
        expect(importedCharacterIds.has(link.targetCharacterId)).toBe(true)
      }
    }

    const ideasWithLinks = importedData.ideaEntries.filter(i => (i.linkedEntities || []).length)
    expect(ideasWithLinks.length).toBeGreaterThan(0)
    const idMapsByType = { character: importedCharacterIds, location: importedLocationIds, faction: importedFactionIds, lore: importedLoreIds }
    for (const idea of ideasWithLinks) {
      for (const entity of idea.linkedEntities) {
        const idSet = idMapsByType[entity.type]
        if (idSet) expect(idSet.has(entity.id)).toBe(true)
      }
    }

    const mapObject = importedData.maps[0]?.mapObjects?.find(o => o.id === 'test-map-object')
    expect(mapObject?.linkedEntity?.entityId).toBeTruthy()
    expect(importedLocationIds.has(mapObject.linkedEntity.entityId)).toBe(true)

    expect(importedData.rpgCharacters).toHaveLength(1)
    const rpgCharacter = importedData.rpgCharacters[0]
    expect(importedFactionIds.has(rpgCharacter.factionIds[0])).toBe(true)
    expect(importedCharacterIds.has(rpgCharacter.npcRelationships[0].characterId)).toBe(true)
  })

  it('remaps manuscript structure parent links (chapter->act, scene->chapter) on import (audit P0-06)', () => {
    const { result } = renderHook(() => useStore('sample-user'))

    let sample
    act(() => { sample = result.current.ensureSampleProject() })
    const exported = result.current.getProjectExportData(sample.id)

    let imported
    act(() => { imported = result.current.importProjectFromData(exported) })
    const importedData = result.current.getProjectExportData(imported.id)

    expect(importedData.chapters.length).toBeGreaterThan(0)
    const importedActIds = new Set(importedData.acts.map(a => a.id))
    for (const chapter of importedData.chapters) {
      expect(chapter.actId).toBeTruthy()
      expect(importedActIds.has(chapter.actId)).toBe(true)
    }
    if (importedData.scenes.length) {
      const importedChapterIds = new Set(importedData.chapters.map(c => c.id))
      for (const scene of importedData.scenes) {
        expect(scene.chapterId).toBeTruthy()
        expect(importedChapterIds.has(scene.chapterId)).toBe(true)
      }
    }
  })

  it('omits comicPages/comicPanels for a non-comic project even if stray comic records share its novelId', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'A Novel', type: 'novel' }) })
    const id = result.current.novels[0].id
    act(() => { result.current.setActiveNovelId(id) })
    act(() => { result.current.addComicPage('issue-1') })

    const data = result.current.getProjectExportData(id)
    expect(data).not.toHaveProperty('comicPages')
    expect(data).not.toHaveProperty('comicPanels')
  })

  it('includes comicPages/comicPanels for a comic project', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'A Comic', type: 'comic' }) })
    const id = result.current.novels[0].id
    act(() => { result.current.setActiveNovelId(id) })
    act(() => { result.current.addComicPage(result.current.chapters[0].id) })

    const data = result.current.getProjectExportData(id)
    expect(data.comicPages).toHaveLength(1)
    expect(data.comicPanels).toEqual([])
  })
})

describe('existing-project import rollback', () => {
  it('restores every importable project collection after a failed population pass', () => {
    const { result } = renderHook(() => useStore(null))
    let novel
    act(() => {
      novel = result.current.addNovel({ title: 'Protected project', type: 'comic' })
    })
    act(() => {
      result.current.saveCharacter({ name: 'Existing character' })
      result.current.setFactions([{ id: 'existing-faction', name: 'Existing faction' }])
      result.current.addEra({ name: 'Existing era' })
      result.current.updateWhiteboard({ notes: [{ id: 'existing-note', text: 'Keep me' }], groups: [] })
      result.current.addMap('Existing map', 'regional')
    })

    const baseline = result.current.getProjectExportData(novel.id)

    act(() => {
      result.current.beginProjectImport()
      result.current.saveCharacter({ name: 'Partial character' })
      result.current.setFactions(prev => [...prev, { id: 'partial-faction', name: 'Partial faction' }])
      result.current.addLocation({ name: 'Partial location' })
      result.current.addEvent({ title: 'Partial event' }, { createHistory: false })
      result.current.addHistoryEntry({ title: 'Partial history' })
      result.current.addEra({ name: 'Partial era' })
      result.current.addLoreEntry({ title: 'Partial lore' })
      result.current.addIdeaEntry({ title: 'Partial idea' })
      const importedAct = result.current.addAct('Partial act')
      const importedChapter = result.current.addChapter(importedAct.id, 'Partial issue')
      const importedScene = result.current.addScene(importedChapter.id, 'Partial scene')
      result.current.updateScene(importedScene.id, { content: 'Partial manuscript' })
      const importedPage = result.current.addComicPage(importedChapter.id, { title: 'Partial page' })
      result.current.addComicPanel(importedPage.id, { description: 'Partial panel' })
      result.current.saveRpgCharacter({ name: 'Partial party member' })
      result.current.addScheduleEvent({ title: 'Partial schedule event', year: 1, month: 1, day: 1 })
      result.current.addMap('Partial map', 'regional')
      result.current.updateWhiteboard({ notes: [{ id: 'partial-note', text: 'Remove me' }], groups: [] })
      expect(result.current.restoreProjectSnapshot(novel.id, baseline)).toBe(true)
      result.current.endProjectImport()
    })

    const restored = result.current.getProjectExportData(novel.id)
    const withoutTimestamp = ({ exportedAt: _exportedAt, ...data }) => data
    expect(withoutTimestamp(restored)).toEqual(withoutTimestamp(baseline))
  })

  it('keeps imported scene writes off the cloud until the batch has settled', () => {
    const { result } = renderHook(() => useStore('cloud-import-user'))
    let novel
    act(() => {
      novel = result.current.addNovel({ title: 'Cloud project', type: 'novel' })
    })
    const baseline = result.current.getProjectExportData(novel.id)
    vi.mocked(saveSceneDoc).mockClear()

    act(() => {
      result.current.beginProjectImport()
      const actRecord = result.current.addAct('Imported act')
      const chapter = result.current.addChapter(actRecord.id, 'Imported chapter')
      const scene = result.current.addScene(chapter.id, 'Imported scene')
      result.current.updateScene(scene.id, { content: 'Imported text' })
      result.current.restoreProjectSnapshot(novel.id, baseline)
      result.current.endProjectImport(false)
    })

    expect(saveSceneDoc).not.toHaveBeenCalled()
  })

  it('writes completed imported scenes to the cloud after the batch commits', () => {
    const { result } = renderHook(() => useStore('cloud-import-success-user'))
    act(() => {
      result.current.addNovel({ title: 'Cloud project', type: 'novel' })
    })
    vi.mocked(saveSceneDoc).mockClear()

    let importedScene
    act(() => {
      result.current.beginProjectImport()
      const actRecord = result.current.addAct('Imported act')
      const chapter = result.current.addChapter(actRecord.id, 'Imported chapter')
      importedScene = result.current.addScene(chapter.id, 'Imported scene')
      result.current.updateScene(importedScene.id, { content: 'Imported text' })
      result.current.endProjectImport(true)
    })

    expect(saveSceneDoc).toHaveBeenCalledExactlyOnceWith(
      'cloud-import-success-user',
      expect.objectContaining({ id: importedScene.id, content: 'Imported text' }),
    )
  })
})

describe('remaining workspace integrity boundaries', () => {
  it('keeps RPG character updates and deletes inside the active project', () => {
    localStorage.setItem('nf_novels', JSON.stringify([{ id: 'n1', title: 'One', type: 'dnd_campaign' }, { id: 'n2', title: 'Two', type: 'dnd_campaign' }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n1'))
    localStorage.setItem('nf_rpg_characters', JSON.stringify([{ id: 'pc1', novelId: 'n1', name: 'One' }, { id: 'pc2', novelId: 'n2', name: 'Two' }]))
    const { result } = renderHook(() => useStore(null))
    const staleSave = result.current.saveRpgCharacter

    let saved
    act(() => { saved = result.current.saveRpgCharacter({ id: 'hijack', novelId: 'n2', name: 'Updated' }, 'pc1') })
    expect(saved).toBe('pc1')
    expect(result.current.rpgCharacters[0]).toMatchObject({ id: 'pc1', novelId: 'n1', name: 'Updated' })
    expect(result.current.saveRpgCharacter({ name: 'Foreign' }, 'pc2')).toBeNull()
    expect(result.current.deleteRpgCharacter('pc2')).toBe(false)

    act(() => { result.current.setActiveNovelId('n2') })
    act(() => { expect(staleSave({ name: 'Stale' }, 'pc1')).toBeNull() })
    expect(JSON.parse(localStorage.getItem('nf_rpg_characters')).find(character => character.id === 'pc1').name).toBe('Updated')
  })

  it('hides inherited factions without deleting shared media or links, then cleans links on physical deletion', () => {
    localStorage.setItem('nf_novels', JSON.stringify(['n1', 'n2'].map(id => ({ id, title: id, type: 'novel', seriesId: 's' }))))
    localStorage.setItem('nf_series', JSON.stringify([{ id: 's', projectOrder: ['n1', 'n2'], syncCategories: ['factions'] }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n2'))
    localStorage.setItem('nf_factions', JSON.stringify([{ id: 'f', novelId: 'n1', name: 'Guild', logo: { image: 'yow-media:u/factions/guild.webp' } }]))
    localStorage.setItem('nf_characters', JSON.stringify([{ id: 'c', novelId: 'n1', name: 'Member', factionId: 'f' }]))
    localStorage.setItem('nf_rpg_characters', JSON.stringify([{ id: 'pc', novelId: 'n1', name: 'Member', factionIds: ['f', 'kept'] }]))
    const { result } = renderHook(() => useStore(null))
    vi.mocked(deleteUserMedia).mockClear()

    act(() => { expect(result.current.deleteFaction('f', { scope: 'current' })).toBe(true) })
    expect(JSON.parse(localStorage.getItem('nf_factions'))[0]).toMatchObject({ id: 'f', syncHiddenInIds: ['n2'] })
    expect(JSON.parse(localStorage.getItem('nf_characters'))[0].factionId).toBe('f')
    expect(JSON.parse(localStorage.getItem('nf_rpg_characters'))[0].factionIds).toEqual(['f', 'kept'])
    expect(deleteUserMedia).not.toHaveBeenCalled()

    act(() => { result.current.setActiveNovelId('n1') })
    act(() => { expect(result.current.deleteFaction('f', { scope: 'all' })).toBe(true) })
    expect(JSON.parse(localStorage.getItem('nf_characters'))[0].factionId).toBe('')
    expect(JSON.parse(localStorage.getItem('nf_rpg_characters'))[0].factionIds).toEqual(['kept'])
    expect(deleteUserMedia).toHaveBeenCalledWith('yow-media:u/factions/guild.webp')
    expect(result.current.deleteFaction('missing')).toBe(false)
  })

  it('validates comic parents, protects identity, and preserves omitted records during partial reorders', () => {
    localStorage.setItem('nf_novels', JSON.stringify([{ id: 'n1', title: 'One', type: 'comic' }, { id: 'n2', title: 'Two', type: 'comic' }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n1'))
    localStorage.setItem('nf_chapters', JSON.stringify([{ id: 'i1', novelId: 'n1', title: 'Issue One' }, { id: 'i2', novelId: 'n2', title: 'Issue Two' }]))
    localStorage.setItem('nf_comicPages', JSON.stringify([{ id: 'a', novelId: 'n1', issueId: 'i1', order: 0 }, { id: 'b', novelId: 'n1', issueId: 'i1', order: 1 }, { id: 'c', novelId: 'n1', issueId: 'i1', order: 2 }, { id: 'foreign', novelId: 'n2', issueId: 'i2', order: 0 }]))
    localStorage.setItem('nf_comicPanels', JSON.stringify([{ id: 'p1', novelId: 'n1', pageId: 'a', order: 0 }, { id: 'p2', novelId: 'n1', pageId: 'a', order: 1 }, { id: 'pf', novelId: 'n2', pageId: 'foreign', order: 0 }]))
    const { result } = renderHook(() => useStore(null))

    expect(result.current.addComicPage('i2')).toBeNull()
    expect(result.current.addComicPanel('foreign')).toBeNull()
    expect(result.current.updateComicPage('foreign', { title: 'Wrong' })).toBeNull()
    expect(result.current.deleteComicPanel('pf')).toBe(false)
    act(() => { result.current.updateComicPage('a', { id: 'hijack', novelId: 'n2', issueId: 'i2', title: 'Safe' }) })
    expect(result.current.comicPages.find(page => page.id === 'a')).toMatchObject({ id: 'a', novelId: 'n1', issueId: 'i1', title: 'Safe' })

    act(() => { expect(result.current.reorderComicPage('i1', ['c'])).toBe(true) })
    expect([...result.current.comicPages].sort((a, b) => a.order - b.order).map(page => page.id)).toEqual(['c', 'a', 'b'])
    act(() => { expect(result.current.reorderComicPanel('a', ['p2'])).toBe(true) })
    expect([...result.current.comicPanels].sort((a, b) => a.order - b.order).map(panel => panel.id)).toEqual(['p2', 'p1'])
    expect(JSON.parse(localStorage.getItem('nf_comicPages')).find(page => page.id === 'foreign')).toMatchObject({ novelId: 'n2', issueId: 'i2' })
    expect(JSON.parse(localStorage.getItem('nf_comicPanels')).find(panel => panel.id === 'pf')).toMatchObject({ novelId: 'n2', pageId: 'foreign' })
  })

  it('keeps unlisted series and projects when an ordering payload is partial', () => {
    localStorage.setItem('nf_novels', JSON.stringify(['n1', 'n2', 'n3'].map(id => ({ id, title: id }))))
    localStorage.setItem('nf_series', JSON.stringify(['s1', 's2', 's3'].map(id => ({ id, name: id }))))
    const { result } = renderHook(() => useStore(null))
    act(() => { result.current.reorderSeries(['s3']); result.current.reorderNovels(['n2']) })
    expect(result.current.series.map(item => item.id)).toEqual(['s3', 's1', 's2'])
    expect(result.current.novels.map(item => item.id)).toEqual(['n2', 'n1', 'n3'])
  })
})

describe('timeline and history consistency', () => {
  const setup = () => {
    const hook = renderHook(() => useStore(null))
    act(() => { hook.result.current.addNovel({ title: 'Chronicle', type: 'novel' }) })
    return hook
  }

  it('loads standalone history repeatedly without manufacturing unlinked timeline copies', () => {
    const { result } = renderHook(() => useStore(null))
    const history = [{ id: 'h', novelId: 'n', title: 'Myth', startYear: 0, endYear: 9, eraId: 'era', linkedCharacters: ['c'], linkedLocations: ['l'], content: 'Original' }]
    const snapshot = { novels: [{ id: 'n', title: 'World', type: 'novel' }], activeNovelId: 'n', timeline: [], worldHistory: history }
    act(() => { result.current.importData(snapshot) })
    act(() => { result.current.importData(result.current.getLocalSnapshot()) })
    expect(result.current.timeline).toEqual([])
    expect(result.current.worldHistory).toEqual(history)
    expect(JSON.parse(localStorage.getItem('nf_timeline'))).toEqual([])
  })

  it('keeps history and timeline selection identities separate even when IDs collide', () => {
    const { result } = setup()
    act(() => { result.current.setSelectedTimelineEventId('same') })
    expect(result.current.selectedHistoryEntryId).toBeNull()
    act(() => { result.current.setSelectedHistoryEntryId('same') })
    expect(result.current.selectedHistoryEntryId).toBe('same')
    expect(result.current.selectedTimelineEventId).toBeNull()
    act(() => { result.current.setSelectedTimelineEventId('next') })
    expect(result.current.selectedHistoryEntryId).toBeNull()
  })

  it.each(['timeline', 'history'])('hides inherited %s in one project without deleting the earlier row or clearing its links', source => {
    localStorage.setItem('nf_novels', JSON.stringify(['n1', 'n2'].map(id => ({ id, title: id, type: 'novel', seriesId: 's' }))))
    localStorage.setItem('nf_series', JSON.stringify([{ id: 's', name: 'Saga', projectOrder: ['n1', 'n2'], syncCategories: ['timeline', 'worldhistory'] }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n2'))
    localStorage.setItem('nf_timeline', JSON.stringify([{ id: 't', novelId: 'n1', title: 'Event', worldHistoryEntryId: 'h' }]))
    localStorage.setItem('nf_worldHistory', JSON.stringify([{ id: 'h', novelId: 'n1', title: 'History', timelineEventId: 't' }]))
    const { result } = renderHook(() => useStore(null))
    act(() => {
      if (source === 'timeline') expect(result.current.deleteEvent('t', { scope: 'current' })).toBe(true)
      else expect(result.current.deleteHistoryEntry('h', { scope: 'current' })).toBe(true)
    })
    expect(JSON.parse(localStorage.getItem('nf_timeline'))).toEqual([expect.objectContaining({ id: 't', worldHistoryEntryId: 'h' })])
    expect(JSON.parse(localStorage.getItem('nf_worldHistory'))).toEqual([expect.objectContaining({ id: 'h', timelineEventId: 't' })])
    expect(source === 'timeline' ? result.current.timeline : result.current.worldHistory).toEqual([])
  })

  it('deletes a history record while keeping its timeline event and clearing only its mirror pointer', () => {
    const { result } = setup()
    let entry
    act(() => { entry = result.current.addHistoryEntry({ title: 'History' }, { createTimeline: true }) })
    act(() => { expect(result.current.deleteHistoryEntry(entry.id)).toBe(true) })
    expect(result.current.worldHistory).toEqual([])
    expect(result.current.timeline).toEqual([expect.objectContaining({ id: entry.timelineEventId, title: 'History', worldHistoryEntryId: null })])
    act(() => { expect(result.current.deleteHistoryEntry('missing')).toBe(false) })
  })

  it('mirrors content, ranges, eras and entity links and preserves the link through partial edits', () => {
    const { result } = setup()
    let event
    act(() => { event = result.current.addEvent({ title: 'Founding', date: 'Year 0', startYear: 0, endYear: 10, eraId: 'era', era: 'Old', linkedCharacters: ['c'], linkedLocations: ['l'], description: 'First text' }) })
    expect(result.current.worldHistory[0]).toMatchObject({ id: event.worldHistoryEntryId, timelineEventId: event.id, startYear: 0, endYear: 10, eraId: 'era', linkedCharacters: ['c'], linkedLocations: ['l'], content: 'First text' })
    act(() => { result.current.updateEvent(event.id, { description: 'Changed' }) })
    expect(result.current.timeline[0].worldHistoryEntryId).toBe(event.worldHistoryEntryId)
    expect(result.current.worldHistory[0]).toMatchObject({ content: 'Changed', endYear: 10, eraId: 'era', timelineEventId: event.id })
    act(() => { result.current.updateHistoryEntry(event.worldHistoryEntryId, { content: 'Changed from history', endYear: null }) })
    expect(result.current.timeline[0]).toMatchObject({ description: 'Changed from history', endYear: null, worldHistoryEntryId: event.worldHistoryEntryId })
    expect(JSON.parse(localStorage.getItem('nf_timeline'))[0].description).toBe('Changed from history')
  })

  it('keeps ordinary timeline entries independent and returns the linked history entry on mirrored creation', () => {
    const { result } = setup()
    act(() => { result.current.addEvent({ title: 'Plot beat' }, { createHistory: false }) })
    expect(result.current.worldHistory).toHaveLength(0)
    let entry
    act(() => { entry = result.current.addHistoryEntry({ title: 'History', content: 'Text', linkedCharacters: ['c'] }, { createTimeline: true }) })
    expect(entry.timelineEventId).toBeTruthy()
    expect(result.current.timeline.find(event => event.id === entry.timelineEventId)).toMatchObject({ description: 'Text', linkedCharacters: ['c'], worldHistoryEntryId: entry.id })
  })

  it.each(['timeline', 'history'])('supports explicit unlink from %s without reconnecting on the next edit', source => {
    const { result } = setup()
    let event
    act(() => { event = result.current.addEvent({ title: 'Linked' }) })
    act(() => {
      if (source === 'timeline') result.current.updateEvent(event.id, { linkedHistoryEntryId: null })
      else result.current.updateHistoryEntry(event.worldHistoryEntryId, { linkedTimelineEventId: null })
    })
    act(() => { result.current.updateEvent(event.id, { description: 'Independent' }) })
    expect(result.current.timeline[0].worldHistoryEntryId).toBeNull()
    expect(result.current.worldHistory[0].timelineEventId).toBeNull()
    expect(result.current.worldHistory[0].content).not.toBe('Independent')
  })

  it('relinks one-to-one and clears both previous counterpart references', () => {
    const { result } = setup()
    let first, second
    act(() => { first = result.current.addEvent({ title: 'First' }) })
    act(() => { second = result.current.addEvent({ title: 'Second' }) })
    act(() => { result.current.linkTimelineHistory(first.id, second.worldHistoryEntryId) })
    expect(result.current.timeline.find(event => event.id === first.id).worldHistoryEntryId).toBe(second.worldHistoryEntryId)
    expect(result.current.timeline.find(event => event.id === second.id).worldHistoryEntryId).toBeNull()
    expect(result.current.worldHistory.find(entry => entry.id === first.worldHistoryEntryId).timelineEventId).toBeNull()
    expect(result.current.worldHistory.find(entry => entry.id === second.worldHistoryEntryId).timelineEventId).toBe(first.id)
  })

  it('ignores updates to missing records or explicit missing counterpart targets', () => {
    const { result } = setup()
    let event
    act(() => { event = result.current.addEvent({ title: 'Independent' }, { createHistory: false }) })
    const before = localStorage.getItem('nf_timeline')
    act(() => { expect(result.current.updateEvent('missing', { title: 'No' })).toBeNull() })
    act(() => { expect(result.current.updateEvent(event.id, { worldHistoryEntryId: 'missing' })).toBeNull() })
    expect(localStorage.getItem('nf_timeline')).toBe(before)
  })

  it.each(['timeline', 'history'])('clears an orphaned %s mirror pointer on an ordinary edit', source => {
    localStorage.setItem('nf_novels', JSON.stringify([{ id: 'n', title: 'Chronicle', type: 'novel' }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n'))
    const key = source === 'timeline' ? 'nf_timeline' : 'nf_worldHistory'
    const linkField = source === 'timeline' ? 'worldHistoryEntryId' : 'timelineEventId'
    localStorage.setItem(key, JSON.stringify([{ id: 'orphan', novelId: 'n', title: 'Old', [linkField]: 'missing' }]))
    const { result } = renderHook(() => useStore(null))
    act(() => {
      if (source === 'timeline') result.current.updateEvent('orphan', { title: 'Changed' })
      else result.current.updateHistoryEntry('orphan', { title: 'Changed' })
    })
    expect(JSON.parse(localStorage.getItem(key))[0]).toMatchObject({ title: 'Changed', [linkField]: null })
  })

  it('only unlinks the requested current pair, preserving unrelated mirrors', () => {
    const { result } = setup()
    let first, second
    act(() => { first = result.current.addEvent({ title: 'First' }) })
    act(() => { second = result.current.addEvent({ title: 'Second' }) })
    act(() => { result.current.unlinkTimelineHistory(first.id, second.worldHistoryEntryId) })
    expect(result.current.timeline.find(event => event.id === first.id).worldHistoryEntryId).toBe(first.worldHistoryEntryId)
    act(() => { result.current.unlinkTimelineHistory(first.id, first.worldHistoryEntryId) })
    expect(result.current.timeline.find(event => event.id === first.id).worldHistoryEntryId).toBeNull()
    expect(result.current.worldHistory.find(entry => entry.id === first.worldHistoryEntryId).timelineEventId).toBeNull()
    expect(result.current.worldHistory.find(entry => entry.id === second.worldHistoryEntryId).timelineEventId).toBe(second.id)
  })

  it('cleans deleted character and location references from both mirrored records', () => {
    const { result } = setup()
    let characterId, location
    act(() => { characterId = result.current.saveCharacter({ name: 'Character' }) })
    act(() => { location = result.current.saveLocation({ name: 'Location' }) })
    act(() => { result.current.addEvent({ title: 'Event', linkedCharacters: [characterId, 'kept-character'], linkedLocations: [location.id, 'kept-location'] }) })
    act(() => { result.current.deleteCharacter(characterId) })
    act(() => { result.current.deleteLocation(location.id) })
    for (const key of ['nf_timeline', 'nf_worldHistory']) {
      expect(JSON.parse(localStorage.getItem(key))[0]).toMatchObject({ linkedCharacters: ['kept-character'], linkedLocations: ['kept-location'] })
    }
  })

  it('renames and deletes eras on both mirrored records', () => {
    const { result } = setup()
    let era
    act(() => { era = result.current.addEra({ name: 'Old', startYear: 0, endYear: 10 }) })
    act(() => { result.current.addEvent({ title: 'Founding', eraId: era.id, era: 'Old' }) })
    act(() => { result.current.updateEra(era.id, { name: 'Renamed' }) })
    expect(result.current.timeline[0].era).toBe('Renamed')
    expect(result.current.worldHistory[0].era).toBe('Renamed')
    act(() => { result.current.deleteEra(era.id) })
    expect(result.current.timeline[0]).toMatchObject({ eraId: null, era: '' })
    expect(result.current.worldHistory[0]).toMatchObject({ eraId: null, era: '' })
  })

  it.each(['timeline', 'history'])('forks inherited %s mirrors and updates later copies without modifying earlier projects', source => {
    localStorage.setItem('nf_novels', JSON.stringify(['n1', 'n2', 'n3'].map(id => ({ id, title: id, type: 'novel', seriesId: 's' }))))
    localStorage.setItem('nf_series', JSON.stringify([{ id: 's', name: 'Saga', projectOrder: ['n1', 'n2', 'n3'], syncCategories: ['timeline', 'worldhistory'] }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n2'))
    localStorage.setItem('nf_timeline', JSON.stringify([1, 3].map(index => ({ id: `t${index}`, novelId: `n${index}`, syncRootId: 't1', title: 'Old', worldHistoryEntryId: `h${index}` }))))
    localStorage.setItem('nf_worldHistory', JSON.stringify([1, 3].map(index => ({ id: `h${index}`, novelId: `n${index}`, syncRootId: 'h1', title: 'Old', timelineEventId: `t${index}` }))))
    const { result } = renderHook(() => useStore(null))
    act(() => {
      if (source === 'timeline') result.current.updateEvent('t1', { title: 'Changed', description: 'New content' })
      else result.current.updateHistoryEntry('h1', { title: 'Changed', content: 'New content' })
    })
    const events = JSON.parse(localStorage.getItem('nf_timeline'))
    const history = JSON.parse(localStorage.getItem('nf_worldHistory'))
    expect(events.find(event => event.id === 't1')).toMatchObject({ title: 'Old', worldHistoryEntryId: 'h1' })
    expect(history.find(entry => entry.id === 'h1')).toMatchObject({ title: 'Old', timelineEventId: 't1' })
    const localEvent = events.find(event => event.novelId === 'n2')
    const localHistory = history.find(entry => entry.novelId === 'n2')
    expect(localEvent).toMatchObject({ title: 'Changed', description: 'New content', worldHistoryEntryId: localHistory.id })
    expect(localHistory).toMatchObject({ title: 'Changed', content: 'New content', timelineEventId: localEvent.id })
    expect(events.find(event => event.id === 't3')).toMatchObject({ title: 'Changed', worldHistoryEntryId: 'h3' })
    expect(history.find(entry => entry.id === 'h3')).toMatchObject({ title: 'Changed', timelineEventId: 't3' })
  })
})

// ─── character CRUD ──────────────────────────────────────────────────────────

describe('Ideas Board persistence', () => {
  const seed = (ideas = []) => {
    localStorage.setItem('nf_novels', JSON.stringify([{ id: 'n', title: 'World', type: 'novel' }, { id: 'other', title: 'Other', type: 'novel' }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n'))
    localStorage.setItem('nf_ideaEntries', JSON.stringify(ideas))
  }
  it('keeps legacy captures and explicit content clears consistent without touching unrelated fields', () => {
    seed()
    const { result } = renderHook(() => useStore(null))
    let created
    act(() => { created = result.current.addIdeaEntry({ title: 'Idea', body: 'Legacy capture', tags: ['keep'], linkedIdeas: ['other'] }) })
    expect(created).toMatchObject({ body: 'Legacy capture', description: 'Legacy capture' })
    act(() => { result.current.updateIdeaEntry(created.id, { description: '' }) })
    expect(result.current.ideaEntries[0]).toMatchObject({ description: '', body: '', tags: ['keep'], linkedIdeas: ['other'] })
    act(() => { result.current.updateIdeaEntry(created.id, { title: 'Renamed' }) })
    expect(result.current.ideaEntries[0]).toMatchObject({ description: '', body: '', title: 'Renamed' })
  })
  it('allocates new positions from fresh column data and atomically rebalances duplicate ranks', () => {
    seed(['a', 'b', 'c', 'd'].map(id => ({ id, title: id, novelId: 'n', order: 0, status: id === 'd' ? 'developing' : 'raw', tags: [id] })))
    const { result } = renderHook(() => useStore(null))
    act(() => { expect(result.current.moveIdeaEntry('d', 'raw', 'b').id).toBe('d') })
    const ideas = [...result.current.ideaEntries].sort((a, b) => a.order - b.order)
    expect(ideas.map(idea => idea.id)).toEqual(['a', 'd', 'b', 'c'])
    expect(ideas.every(idea => idea.status === 'raw' && idea.tags[0] === idea.id)).toBe(true)
    act(() => {
      const first = result.current.addIdeaEntry({ title: 'First', status: 'raw' })
      const second = result.current.addIdeaEntry({ title: 'Second', status: 'raw' })
      expect(second.order).toBe(first.order + 1)
    })
    act(() => { expect(result.current.moveIdeaEntry('a', 'raw').id).toBe('a') })
    expect([...result.current.ideaEntries].sort((a, b) => a.order - b.order).at(-1).id).toBe('a')
  })
  it('refuses stale expected content, missing/foreign targets, invalid moves and old-project callbacks', () => {
    seed([{ id: 'a', novelId: 'n', title: 'A', description: 'Newer' }, { id: 'foreign', novelId: 'other', title: 'Other' }])
    const { result } = renderHook(() => useStore(null))
    const oldUpdate = result.current.updateIdeaEntry
    act(() => {
      expect(result.current.updateIdeaEntry('a', { description: 'Stale AI result' }, { expected: { description: 'Old' } })).toBeNull()
      expect(result.current.updateIdeaEntry('foreign', { title: 'Wrong' })).toBeNull()
      expect(result.current.deleteIdeaEntry('missing')).toBe(false)
      expect(result.current.moveIdeaEntry('a', '__proto__')).toBeNull()
      expect(result.current.moveIdeaEntry('a', 'raw', 'foreign')).toBeNull()
    })
    act(() => { result.current.setActiveNovelId('other') })
    act(() => { expect(oldUpdate('a', { description: 'Wrong project' })).toBeNull() })
    expect(JSON.parse(localStorage.getItem('nf_ideaEntries'))[0].description).toBe('Newer')
  })
  it('preserves earlier synced records and links on a hide, and cleans references only after physical deletion', () => {
    seed()
    localStorage.setItem('nf_localOwner', 'idea-user')
    localStorage.setItem('nf_novels', JSON.stringify(['n1', 'n2', 'n3'].map(id => ({ id, title: id, type: 'novel', seriesId: 's' }))))
    localStorage.setItem('nf_series', JSON.stringify([{ id: 's', projectOrder: ['n1', 'n2', 'n3'], syncCategories: ['ideas'] }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n2'))
    const original = { id: 'a', novelId: 'n1', syncRootId: 'a', title: 'Earlier', description: 'Original', order: 0 }
    localStorage.setItem('nf_ideaEntries', JSON.stringify([original, { ...original, id: 'a3', novelId: 'n3' }, { id: 'ref', novelId: 'n1', title: 'Reference', linkedIdeas: ['a'] }]))
    const { result } = renderHook(() => useStore('idea-user', { cloudSyncEnabled: true }))
    vi.mocked(deleteItem).mockClear()
    act(() => { expect(result.current.deleteIdeaEntry('a', { scope: 'current' })).toBe(true) })
    expect(deleteItem).not.toHaveBeenCalled()
    let raw = JSON.parse(localStorage.getItem('nf_ideaEntries'))
    expect(raw.find(idea => idea.id === 'a')).toMatchObject({ description: 'Original', syncHiddenInIds: ['n2'] })
    expect(raw.find(idea => idea.id === 'ref').linkedIdeas).toEqual(['a'])
    act(() => { result.current.setActiveNovelId('n1') })
    act(() => { expect(result.current.deleteIdeaEntry('a', { scope: 'all' })).toBe(true) })
    raw = JSON.parse(localStorage.getItem('nf_ideaEntries'))
    expect(raw.find(idea => idea.id === 'ref').linkedIdeas).toEqual([])
    expect(deleteItem).toHaveBeenCalledWith('idea_entries', 'idea-user', 'a')
    expect(deleteItem).toHaveBeenCalledWith('idea_entries', 'idea-user', 'a3')
  })
  it('uses the shared series-save path for batched ranking while preserving earlier projects', () => {
    seed()
    localStorage.setItem('nf_novels', JSON.stringify(['n1', 'n2', 'n3'].map(id => ({ id, title: id, type: 'novel', seriesId: 's' }))))
    localStorage.setItem('nf_series', JSON.stringify([{ id: 's', projectOrder: ['n1', 'n2', 'n3'], syncCategories: ['ideas'] }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n2'))
    const earlier = ['a', 'b', 'c'].map(id => ({ id, syncRootId: id, novelId: 'n1', title: id, order: 0, status: 'raw' }))
    localStorage.setItem('nf_ideaEntries', JSON.stringify([...earlier, ...earlier.map(idea => ({ ...idea, id: `${idea.id}3`, novelId: 'n3' }))]))
    const { result } = renderHook(() => useStore(null))
    let saved
    act(() => { saved = result.current.moveIdeaEntry('c', 'raw', 'b') })
    expect(saved.id).not.toBe('c')
    const raw = JSON.parse(localStorage.getItem('nf_ideaEntries'))
    expect(raw.filter(idea => idea.novelId === 'n1')).toEqual(earlier)
    expect([...result.current.ideaEntries].sort((a, b) => a.order - b.order).map(idea => idea.syncRootId)).toEqual(['a', 'c', 'b'])
    expect(raw.find(idea => idea.id === 'c3').order).toBe(saved.order)
  })
  it('guards every idea mutation for read-only projects', () => {
    seed([{ id: 'a', novelId: 'n', title: 'A' }])
    const { result } = renderHook(() => useStore(null, { readOnly: true }))
    act(() => {
      result.current.addIdeaEntry({ title: 'No' })
      result.current.updateIdeaEntry('a', { title: 'No' })
      result.current.moveIdeaEntry('a', 'developing')
      result.current.deleteIdeaEntry('a')
    })
    expect(result.current.ideaEntries).toEqual([{ id: 'a', novelId: 'n', title: 'A' }])
  })
  it('round-trips chapter/event conversions and inter-idea references with fresh IDs', () => {
    const { result } = renderHook(() => useStore(null))
    const data = { project: { id: 'original', title: 'Imported', type: 'novel' },
      acts: [{ id: 'act', title: 'Act' }], chapters: [{ id: 'chapter', actId: 'act', title: 'Chapter' }], timeline: [{ id: 'event', title: 'Event' }],
      ideaEntries: [{ id: 'idea', title: 'Idea', linkedIdeas: ['other'], linkedEntities: [{ type: 'chapter', id: 'chapter' }, { type: 'event', id: 'event' }], convertedTo: { type: 'chapter', id: 'chapter', name: 'Chapter' } }, { id: 'other', title: 'Other' }],
    }
    let imported
    act(() => { imported = result.current.importProjectFromData(data) })
    const exported = result.current.getProjectExportData(imported.id)
    const idea = exported.ideaEntries.find(entry => entry.title === 'Idea')
    expect(idea.linkedIdeas).toEqual([exported.ideaEntries.find(entry => entry.title === 'Other').id])
    expect(idea.linkedEntities).toEqual([{ type: 'chapter', id: exported.chapters[0].id }, { type: 'event', id: exported.timeline[0].id }])
    expect(idea.convertedTo.id).toBe(exported.chapters[0].id)
    expect(idea.convertedTo.id).not.toBe('chapter')
  })
  it('returns a real chapter record with a plain title and initial synopsis', () => {
    seed()
    const { result } = renderHook(() => useStore(null))
    let parent
    act(() => { parent = result.current.addAct('Act') })
    let chapter
    act(() => { chapter = result.current.addChapter(parent.id, 'Converted title', { synopsis: 'Idea text' }) })
    expect(result.current.chapters.find(item => item.id === chapter.id)).toMatchObject({ title: 'Converted title', synopsis: 'Idea text' })
  })
})

describe('directed relationship edits', () => {
  const seed = () => {
    const characters = [
      { id: 'a', novelId: 'n', name: 'Ada', bio: 'Keep this', childIds: ['b'], relationships: { first: { targetId: 'b', type: 'friend', notes: 'First' }, duplicate: { targetId: 'b', type: 'friend' }, custom: { targetId: 'b', type: 'mentor', notes: 'Keep custom' } } },
      { id: 'b', novelId: 'n', name: 'Ben', parentIds: ['a'], relationships: [{ targetId: 'a', type: 'enemy' }] },
      { id: 'other', novelId: 'other-project', name: 'Other' },
    ]
    localStorage.setItem('nf_novels', JSON.stringify([{ id: 'n', title: 'World', type: 'novel' }, { id: 'other-project', title: 'Other', type: 'novel' }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n'))
    localStorage.setItem('nf_characters', JSON.stringify(characters))
    return characters
  }

  it('adds one directed type using fresh records and preserves all unrelated fields and reverse links', () => {
    const original = seed()
    const { result } = renderHook(() => useStore(null))
    act(() => {
      expect(result.current.saveRelationship('a', 'b', 'ally')).toBe('a')
      expect(result.current.saveRelationship('a', 'b', 'romantic')).toBe('a')
    })
    const records = JSON.parse(localStorage.getItem('nf_characters'))
    expect(records[0].relationships).toEqual([...Object.values(original[0].relationships), { targetId: 'b', type: 'ally' }, { targetId: 'b', type: 'romantic' }])
    expect(records[0]).toMatchObject({ bio: 'Keep this', childIds: ['b'] })
    expect(records.slice(1)).toEqual(original.slice(1))
  })

  it('removes only the exact source/type, including duplicates, without clearing the opposite direction', () => {
    const original = seed()
    const { result } = renderHook(() => useStore(null))
    act(() => { expect(result.current.saveRelationship('a', 'b', 'friend', { remove: true })).toBe('a') })
    const records = JSON.parse(localStorage.getItem('nf_characters'))
    expect(records[0].relationships).toEqual([{ targetId: 'b', type: 'mentor', notes: 'Keep custom' }])
    expect(records[0].childIds).toEqual(['b'])
    expect(records[1]).toEqual(original[1])
    act(() => { expect(result.current.saveRelationship('a', 'b', 'mentor', { remove: true })).toBe('a') })
    expect(result.current.characters.find(character => character.id === 'a').relationships).toEqual([])
  })

  it('rejects missing, foreign, self, family and unsupported additions and no-ops existing facts', () => {
    const original = seed()
    const { result } = renderHook(() => useStore(null))
    act(() => {
      for (const args of [['a', 'gone', 'friend'], ['gone', 'a', 'ally'], ['a', 'other', 'friend'], ['a', 'a', 'ally'], ['a', 'b', 'spouse'], ['a', 'b', 'invented'], ['a', 'b', 'ally', { remove: true }]]) expect(result.current.saveRelationship(...args)).toBeNull()
      expect(result.current.saveRelationship('a', 'b', 'friend')).toBe('a')
    })
    expect(JSON.parse(localStorage.getItem('nf_characters'))).toEqual(original)
  })

  it('guards read-only edits and refuses stale callbacks after a project switch', () => {
    const original = seed()
    const { result, rerender } = renderHook(({ readOnly }) => useStore(null, { readOnly }), { initialProps: { readOnly: true } })
    act(() => { expect(result.current.saveRelationship('a', 'b', 'ally')).toBeUndefined() })
    rerender({ readOnly: false })
    const oldSave = result.current.saveRelationship
    act(() => { result.current.setActiveNovelId('other-project') })
    act(() => { expect(oldSave('a', 'b', 'ally')).toBeNull() })
    expect(JSON.parse(localStorage.getItem('nf_characters'))).toEqual(original)
  })

  it('forks only the source, returns its real ID and resolves incoming links after both characters fork', () => {
    localStorage.setItem('nf_novels', JSON.stringify(['n1', 'n2', 'n3'].map(id => ({ id, title: id, type: 'novel', seriesId: 's' }))))
    localStorage.setItem('nf_series', JSON.stringify([{ id: 's', projectOrder: ['n1', 'n2', 'n3'], syncCategories: ['characters'] }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n2'))
    const a = { id: 'a', novelId: 'n1', name: 'Ada', syncRootId: 'a', relationships: [{ targetId: 'b', type: 'friend' }] }
    const b = { id: 'b', novelId: 'n1', name: 'Ben', syncRootId: 'b', relationships: [{ targetId: 'a', type: 'enemy' }] }
    localStorage.setItem('nf_characters', JSON.stringify([a, b, { ...b, id: 'b2', novelId: 'n2', syncSourceId: 'b' }, { ...a, id: 'a3', novelId: 'n3', syncSourceId: 'a' }]))
    const { result } = renderHook(() => useStore(null))
    // An existing fact addressed via an alias must not fork anything.
    act(() => { expect(result.current.saveRelationship('a', 'b2', 'friend')).toBe('a') })
    expect(JSON.parse(localStorage.getItem('nf_characters'))).toHaveLength(4)
    let savedId
    act(() => { savedId = result.current.saveRelationship('a', 'b', 'ally') })
    expect(savedId).not.toBe('a')
    const records = JSON.parse(localStorage.getItem('nf_characters'))
    expect(records).toHaveLength(5)
    expect(records.find(character => character.id === 'a')).toEqual(a)
    expect(records.find(character => character.id === 'b')).toEqual(b)
    expect(records.find(character => character.id === 'b2').relationships).toEqual(b.relationships)
    expect(records.find(character => character.id === savedId)).toMatchObject({ novelId: 'n2', syncRootId: 'a', relationships: [{ targetId: 'b', type: 'friend' }, { targetId: 'b2', type: 'ally' }] })
    expect(records.find(character => character.id === 'a3').relationships).toEqual(records.find(character => character.id === savedId).relationships)
    act(() => { expect(result.current.saveRelationship('b2', savedId, 'enemy', { remove: true })).toBe('b2') })
    expect(result.current.characters.find(character => character.id === 'b2').relationships).toEqual([])
    expect(JSON.parse(localStorage.getItem('nf_characters')).find(character => character.id === 'b')).toEqual(b)
    act(() => { result.current.deleteCharacter('b2', { scope: 'current' }) })
    act(() => { expect(result.current.saveRelationship(savedId, 'b', 'romantic')).toBeNull() })
  })

  it('rejects links to characters deleted since the form was opened', () => {
    seed()
    const { result } = renderHook(() => useStore(null))
    act(() => { result.current.deleteCharacter('b') })
    act(() => { expect(result.current.saveRelationship('a', 'b', 'ally')).toBeNull() })
  })
})

describe('character CRUD', () => {
  it('hides an inherited character without deleting its earlier record, portrait or references', () => {
    localStorage.setItem('nf_localOwner', 'character-user')
    localStorage.setItem('nf_novels', JSON.stringify(['n1', 'n2'].map(id => ({ id, title: id, type: 'novel', seriesId: 's' }))))
    localStorage.setItem('nf_series', JSON.stringify([{ id: 's', projectOrder: ['n1', 'n2'], syncCategories: ['characters'] }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n2'))
    localStorage.setItem('nf_characters', JSON.stringify([{ id: 'source', novelId: 'n1', name: 'Earlier', image: 'yow-media:u/characters/portrait.webp' }, { id: 'child', novelId: 'n1', name: 'Child', parentIds: ['source'], journey: { beats: [{ id: 'b', linkedCharacterId: 'source' }] } }]))
    localStorage.setItem('nf_loreEntries', JSON.stringify([{ id: 'l', novelId: 'n1', characterIds: ['source'] }]))
    vi.mocked(deleteItem).mockClear()
    vi.mocked(deleteUserMedia).mockClear()
    const { result } = renderHook(() => useStore('character-user', { cloudSyncEnabled: true }))
    act(() => { expect(result.current.deleteCharacter('source', { scope: 'current' })).toBe(true) })
    expect(result.current.characters.find(character => character.id === 'source')).toBeUndefined()
    const raw = JSON.parse(localStorage.getItem('nf_characters'))
    expect(raw.find(character => character.id === 'source')).toMatchObject({ novelId: 'n1', syncHiddenInIds: ['n2'], image: 'yow-media:u/characters/portrait.webp' })
    expect(raw.find(character => character.id === 'child')).toMatchObject({ parentIds: ['source'], journey: { beats: [{ id: 'b', linkedCharacterId: 'source' }] } })
    expect(JSON.parse(localStorage.getItem('nf_loreEntries'))[0].characterIds).toEqual(['source'])
    expect(deleteItem).not.toHaveBeenCalled()
    expect(deleteUserMedia).not.toHaveBeenCalled()
  })

  it('only deletes a replaced portrait after a successful save and when no saved record still uses it', () => {
    const { result } = renderHook(() => useStore(null))
    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    let first, second
    const image = 'yow-media:u/characters/shared.webp'
    act(() => { first = result.current.saveCharacter({ name: 'First', image }) })
    act(() => { second = result.current.saveCharacter({ name: 'Second', image }) })
    vi.mocked(deleteUserMedia).mockClear()
    act(() => { result.current.saveCharacter({ image: '' }, 'missing') })
    expect(deleteUserMedia).not.toHaveBeenCalled()
    act(() => { result.current.saveCharacter({ image: '' }, first) })
    expect(deleteUserMedia).not.toHaveBeenCalled()
    act(() => { result.current.saveCharacter({ image: '' }, second) })
    expect(deleteUserMedia).toHaveBeenCalledExactlyOnceWith(image)
  })

  it('retains portraits used by another entity even when private and legacy references differ', () => {
    const { result } = renderHook(() => useStore(null))
    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    let id
    act(() => { id = result.current.saveCharacter({ name: 'Character', image: 'yow-media:u/characters/shared.webp' }) })
    act(() => { result.current.saveLocation({ name: 'Gallery', image: 'https://x/storage/v1/object/public/user-media/u/characters/shared.webp' }) })
    vi.mocked(deleteUserMedia).mockClear()
    act(() => { result.current.deleteCharacter(id) })
    expect(deleteUserMedia).not.toHaveBeenCalled()
  })

  it('cleans affected references on physical deletion without rewriting unrelated records or missing targets', () => {
    localStorage.setItem('nf_novels', JSON.stringify([{ id: 'n', title: 'World', type: 'novel' }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n'))
    localStorage.setItem('nf_characters', JSON.stringify([{ id: 'c', novelId: 'n', name: 'Target' }, { id: 'kept', novelId: 'n', name: 'Kept' }]))
    const collections = [['nf_loreEntries', 'characterIds'], ['nf_timeline', 'linkedCharacters'], ['nf_worldHistory', 'linkedCharacters'], ['nf_storySchedule', 'linkedCharacters'], ['nf_comicPages', 'characterIds'], ['nf_comicPanels', 'characterIds']]
    collections.forEach(([key, field]) => localStorage.setItem(key, JSON.stringify([{ id: key, novelId: 'n', [field]: ['c', 'kept'] }])))
    const { result } = renderHook(() => useStore(null))
    const kept = result.current.characters.find(character => character.id === 'kept')
    act(() => { expect(result.current.deleteCharacter('c')).toBe(true) })
    expect(result.current.characters[0]).toBe(kept)
    collections.forEach(([key, field]) => expect(JSON.parse(localStorage.getItem(key))[0][field]).toEqual(['kept']))
    const before = localStorage.getItem('nf_characters')
    act(() => { expect(result.current.deleteCharacter('missing')).toBe(false) })
    expect(localStorage.getItem('nf_characters')).toBe(before)
  })

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
    act(() => { result.current.saveCharacter({ name: 'Gandalf', role: 'wizard', pronouns: 'he/him' }) })
    const id = result.current.characters[0].id

    act(() => { result.current.saveCharacter({ name: 'Gandalf', role: 'guide', pronouns: 'they/them' }, id) })

    expect(result.current.characters).toHaveLength(1)
    expect(result.current.characters[0].role).toBe('guide')
    expect(result.current.characters[0].pronouns).toBe('they/them')
  })

  it('deleteCharacter strips the deleted character out of other characters\' relationships', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    act(() => { result.current.saveCharacter({ name: 'Frodo' }) })
    const frodoId = result.current.characters[0].id
    act(() => { result.current.saveCharacter({ name: 'Sam', relationships: [{ targetId: frodoId, type: 'friend' }] }) })

    act(() => { result.current.deleteCharacter(frodoId) })

    const sam = result.current.characters.find(c => c.name === 'Sam')
    expect(sam.relationships).toEqual([])
  })

  it('preserves reciprocal family fields during partial character and family-link saves', () => {
    const { result } = renderHook(() => useStore(null))
    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    const ids = {}
    for (const name of ['Parent', 'Child', 'Partner', 'Focus']) {
      act(() => { ids[name] = result.current.saveCharacter({ name }) })
    }
    act(() => { result.current.saveCharacter({ parentIds: [ids.Parent], childIds: [ids.Child], spouseIds: [ids.Partner] }, ids.Focus) })
    const fact = { id: 'guardian-fact', sourceCharacterId: ids.Focus, targetCharacterId: ids.Child, kind: 'guardian', type: 'chosen' }
    act(() => { result.current.saveCharacter({ familyLinks: [fact] }, ids.Focus) })
    act(() => { result.current.saveCharacter({ bio: 'Updated biography' }, ids.Focus) })
    const byName = Object.fromEntries(result.current.characters.map(character => [character.name, character]))
    expect(byName.Parent.childIds).toEqual([ids.Focus])
    expect(byName.Child.parentIds).toEqual([ids.Focus])
    expect(byName.Partner.spouseIds).toEqual([ids.Focus])
    expect(byName.Focus.familyLinks).toEqual([fact])

    // An explicitly emptied field must still remove its reciprocal link only.
    act(() => { result.current.saveCharacter({ spouseIds: [] }, ids.Focus) })
    expect(result.current.characters.find(character => character.id === ids.Partner).spouseIds).toEqual([])
    expect(result.current.characters.find(character => character.id === ids.Parent).childIds).toEqual([ids.Focus])
    expect(result.current.characters.find(character => character.id === ids.Child).parentIds).toEqual([ids.Focus])
  })

  it('deletion removes structured facts from either endpoint and preserves unrelated facts', () => {
    const { result } = renderHook(() => useStore(null))
    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    const ids = []
    for (const name of ['Deleted', 'Kept', 'Other']) {
      act(() => { ids.push(result.current.saveCharacter({ name })) })
    }
    const link = (id, source, target) => ({ id, sourceCharacterId: source, targetCharacterId: target, kind: 'sibling' })
    const unrelated = link('kept', ids[1], ids[2])
    act(() => { result.current.saveCharacter({ familyLinks: [link('outgoing', ids[0], ids[1]), link('incoming', ids[1], ids[0]), unrelated] }, ids[1]) })
    act(() => { result.current.deleteCharacter(ids[0]) })
    expect(result.current.characters.find(character => character.id === ids[1]).familyLinks).toEqual([unrelated])
    expect(JSON.parse(localStorage.getItem('nf_characters')).find(character => character.id === ids[1]).familyLinks).toEqual([unrelated])
  })

  it('deleteCharacter cleans up the character\'s uploaded Storage portrait', () => {
    vi.mocked(deleteUserMedia).mockClear()
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    act(() => { result.current.saveCharacter({ name: 'Frodo', image: 'https://x/storage/v1/object/public/user-media/u1/characters/frodo.webp' }) })
    const frodoId = result.current.characters[0].id

    act(() => { result.current.deleteCharacter(frodoId) })

    expect(deleteUserMedia).toHaveBeenCalledWith('https://x/storage/v1/object/public/user-media/u1/characters/frodo.webp')
  })
})

// Manuscript.jsx derives entityMap/characterNames/locationNames from `characters`/
// `locations` via useMemo, and SceneEditor.jsx's React.memo comparator relies on those
// staying referentially stable across renders that don't actually touch character/location
// data — otherwise every scene's memo is invalidated on every such render (see the "Typing
// lag" ROADMAP row). `characters`/`locations` used to be rebuilt via an unmemoized
// seriesScope() call inline in the `api` object on every render of whatever component
// calls useStore(), so any unrelated state update (e.g. selecting a different scene, or the
// periodic local-storage-warning poll) handed out a brand-new array reference for both.
describe('characters/locations reference stability', () => {
  it('keeps the same characters/locations array reference across a re-render triggered by unrelated state', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    act(() => { result.current.saveCharacter({ name: 'Frodo' }) })
    act(() => { result.current.saveLocation({ name: 'The Shire' }) })

    const charactersBefore = result.current.characters
    const locationsBefore = result.current.locations

    // Trigger a re-render via state completely unrelated to characters/locations.
    act(() => { result.current.setSelectedSceneId('some-scene-id') })

    expect(result.current.characters).toBe(charactersBefore)
    expect(result.current.locations).toBe(locationsBefore)
  })

  it('produces a new characters/locations reference only when the underlying data actually changes', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    act(() => { result.current.saveCharacter({ name: 'Frodo' }) })

    const charactersBefore = result.current.characters

    act(() => { result.current.saveCharacter({ name: 'Sam' }) })

    expect(result.current.characters).not.toBe(charactersBefore)
    expect(result.current.characters).toHaveLength(2)
  })

  // Manuscript.jsx's entityMap useMemo also depends on `loreEntries`/`worldHistory`/
  // `timeline` (not just characters/locations) — these went through the exact same
  // unmemoized seriesScope()-in-`api` pattern, so entityMap could still churn on every
  // render via this path even after characters/locations were fixed on their own.
  it('keeps the same loreEntries array reference across a re-render triggered by unrelated state', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    act(() => { result.current.addLoreEntry({ title: 'The Old Wars' }) })

    const loreEntriesBefore = result.current.loreEntries

    act(() => { result.current.setSelectedSceneId('some-scene-id') })

    expect(result.current.loreEntries).toBe(loreEntriesBefore)
  })
})

describe('lore CRUD', () => {
  it('preserves omitted references during partial edits and honors explicit clearing', () => {
    const { result } = renderHook(() => useStore(null))
    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    let entry
    act(() => { entry = result.current.addLoreEntry({ title: 'Lore', characterIds: ['c'], locationIds: ['l'], loreIds: ['other'], tags: ['Magic'] }) })
    act(() => { result.current.updateLoreEntry(entry.id, { content: 'Changed' }) })
    expect(result.current.loreEntries[0]).toMatchObject({ characterIds: ['c'], locationIds: ['l'], loreIds: ['other'], tags: ['Magic'], content: 'Changed' })
    act(() => { result.current.updateLoreEntry(entry.id, { loreIds: [] }) })
    expect(JSON.parse(localStorage.getItem('nf_loreEntries'))[0]).toMatchObject({ loreIds: [], characterIds: ['c'], locationIds: ['l'] })
    act(() => { expect(result.current.updateLoreEntry('missing', { title: 'No' })).toBeNull() })
  })

  it('hides inherited lore only in the current project, keeping the earlier record and incoming references', () => {
    localStorage.setItem('nf_localOwner', 'lore-user')
    localStorage.setItem('nf_novels', JSON.stringify(['n1', 'n2'].map(id => ({ id, title: id, type: 'novel', seriesId: 's' }))))
    localStorage.setItem('nf_series', JSON.stringify([{ id: 's', projectOrder: ['n1', 'n2'], syncCategories: ['lore'] }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n2'))
    localStorage.setItem('nf_loreEntries', JSON.stringify([{ id: 'source', novelId: 'n1', title: 'Earlier' }, { id: 'ref', novelId: 'n1', title: 'Reference', loreIds: ['source'] }]))
    vi.mocked(deleteItem).mockClear()
    const { result } = renderHook(() => useStore('lore-user', { cloudSyncEnabled: true }))
    act(() => { expect(result.current.deleteLoreEntry('source', { scope: 'current' })).toBe(true) })
    expect(result.current.loreEntries.find(entry => entry.id === 'source')).toBeUndefined()
    const raw = JSON.parse(localStorage.getItem('nf_loreEntries'))
    expect(raw.find(entry => entry.id === 'source')).toMatchObject({ novelId: 'n1', title: 'Earlier', syncHiddenInIds: ['n2'] })
    expect(raw.find(entry => entry.id === 'ref').loreIds).toEqual(['source'])
    expect(deleteItem).not.toHaveBeenCalled()
  })

  it('preserves unrelated records when physically deleting lore and ignores missing targets', () => {
    const { result } = renderHook(() => useStore(null))
    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    let source, unrelated
    act(() => { source = result.current.addLoreEntry({ title: 'Source' }) })
    act(() => { unrelated = result.current.addLoreEntry({ title: 'Unrelated', loreIds: ['kept'] }) })
    act(() => { expect(result.current.deleteLoreEntry(source.id)).toBe(true) })
    expect(result.current.loreEntries.find(entry => entry.id === unrelated.id)).toBe(unrelated)
    const before = localStorage.getItem('nf_loreEntries')
    act(() => { expect(result.current.deleteLoreEntry('missing')).toBe(false) })
    expect(localStorage.getItem('nf_loreEntries')).toBe(before)
  })

  it('deleteLoreEntry strips the deleted entry out of other entries\' loreIds', () => {
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    act(() => { result.current.addLoreEntry({ title: 'The Old War' }) })
    const oldWarId = result.current.loreEntries[0].id
    act(() => { result.current.addLoreEntry({ title: 'The Treaty', loreIds: [oldWarId] }) })

    act(() => { result.current.deleteLoreEntry(oldWarId) })

    const treaty = result.current.loreEntries.find(e => e.title === 'The Treaty')
    expect(treaty.loreIds).toEqual([])
  })
})

// Two tabs on the same account share one localStorage. Before this fix, two
// separate bugs both caused the same symptom: (1) debouncedSaveItems
// re-pushed a table's ENTIRE in-memory array to the cloud on every change,
// so a tab with a stale copy of unrelated records would silently overwrite
// whatever another tab had just saved for those records there; (2)
// independent of cloud sync, commitLocal's local-storage write did the same
// thing to the shared localStorage/vault blob itself — writing this tab's
// whole (possibly stale) array clobbered any record another tab had changed
// locally, even with cloud sync off entirely (see the 2026-08-02
// "structured-record-conflict" QA fail in docs/ROADMAP.md's Bugs table).
// These tests cover both: per-record diffed cloud sync, the local-storage
// rebase, and conflict detection/resolution for genuine same-record races.
describe('multi-tab structured record sync', () => {
  beforeEach(() => {
    vi.mocked(upsertItems).mockClear()
    vi.mocked(upsertItems).mockResolvedValue({})
  })

  it('only pushes the record(s) that actually changed, not the whole collection', async () => {
    const { result } = renderHook(() => useStore('user-diff', { cloudSyncEnabled: true }))
    act(() => { result.current.finishRemoteLoad(true) })
    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    act(() => { result.current.saveCharacter({ name: 'Frodo' }) })
    act(() => { result.current.saveCharacter({ name: 'Sam' }) })
    await waitFor(() => expect(upsertItems).toHaveBeenCalledWith('characters', 'user-diff', expect.arrayContaining([
      expect.objectContaining({ name: 'Frodo' }), expect.objectContaining({ name: 'Sam' }),
    ])), { timeout: 3000 })
    const frodoId = result.current.characters.find(c => c.name === 'Frodo').id

    vi.mocked(upsertItems).mockClear()
    act(() => { result.current.saveCharacter({ name: 'Frodo', role: 'ring bearer' }, frodoId) })

    await waitFor(() => {
      const call = vi.mocked(upsertItems).mock.calls.find(c => c[0] === 'characters')
      expect(call).toBeTruthy()
      expect(call[2]).toEqual([expect.objectContaining({ name: 'Frodo', role: 'ring bearer' })])
    }, { timeout: 3000 })
  })

  it('a stale second tab saving an unrelated character no longer reverts the first tab\'s edit', async () => {
    const owner = 'user-multitab'
    const seed = [
      { id: 'char-A', novelId: 'novel-1', name: 'Alice', notes: 'original' },
      { id: 'char-B', novelId: 'novel-1', name: 'Bob', notes: 'original' },
    ]
    const novels = [{ id: 'novel-1', title: 'World', type: 'novel' }]

    const tabA = renderHook(() => useStore(owner, { cloudSyncEnabled: true }))
    const tabB = renderHook(() => useStore(owner, { cloudSyncEnabled: true }))
    act(() => { tabA.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })
    act(() => { tabA.result.current.finishRemoteLoad(true) })
    act(() => { tabB.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })
    act(() => { tabB.result.current.finishRemoteLoad(true) })

    act(() => { tabA.result.current.saveCharacter({ name: 'Alice', notes: 'edited by tab A' }, 'char-A') })
    await waitFor(() => {
      const call = vi.mocked(upsertItems).mock.calls.find(c => c[0] === 'characters' && c[2].some(i => i.id === 'char-A'))
      expect(call?.[2]).toEqual([expect.objectContaining({ id: 'char-A', notes: 'edited by tab A' })])
    }, { timeout: 3000 })

    vi.mocked(upsertItems).mockClear()
    act(() => { tabB.result.current.saveCharacter({ name: 'Bob', notes: 'edited by tab B' }, 'char-B') })

    // Tab B's own commitLocal must adopt Tab A's edit for the record it
    // never touched, rather than writing back its own stale copy — this is
    // the local-storage-layer half of the fix (independent of cloud sync).
    expect(tabB.result.current.characters.find(c => c.id === 'char-A').notes).toBe('edited by tab A')
    expect(tabB.result.current.characters.find(c => c.id === 'char-B').notes).toBe('edited by tab B')
    const storedAfterTabB = JSON.parse(localStorage.getItem('nf_characters'))
    expect(storedAfterTabB.find(c => c.id === 'char-A').notes).toBe('edited by tab A')

    await waitFor(() => {
      const call = vi.mocked(upsertItems).mock.calls.find(c => c[0] === 'characters')
      expect(call).toBeTruthy()
    }, { timeout: 3000 })

    // Whatever Tab B pushes to the cloud (it may legitimately re-affirm
    // char-A, since its local copy of char-A changed too) must never carry
    // reverted content for either record.
    const calls = vi.mocked(upsertItems).mock.calls.filter(c => c[0] === 'characters')
    calls.forEach(call => {
      const charA = call[2].find(item => item.id === 'char-A')
      if (charA) expect(charA.notes).toBe('edited by tab A')
      const charB = call[2].find(item => item.id === 'char-B')
      if (charB) expect(charB.notes).toBe('edited by tab B')
    })
  })

  it('protects unrelated records from a stale second tab even with cloud sync entirely off (pure local-storage layer)', () => {
    const owner = 'user-multitab-local'
    const seed = [
      { id: 'char-A', novelId: 'novel-1', name: 'Alice', notes: 'original' },
      { id: 'char-B', novelId: 'novel-1', name: 'Bob', notes: 'original' },
    ]
    const novels = [{ id: 'novel-1', title: 'World', type: 'novel' }]

    const tabA = renderHook(() => useStore(owner, { cloudSyncEnabled: false }))
    const tabB = renderHook(() => useStore(owner, { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })
    act(() => { tabB.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })

    act(() => { tabA.result.current.saveCharacter({ name: 'Alice', notes: 'edited by tab A' }, 'char-A') })
    expect(JSON.parse(localStorage.getItem('nf_characters')).find(c => c.id === 'char-A').notes).toBe('edited by tab A')

    // Tab B, unaware of Tab A's edit, saves an unrelated character. Without
    // the commitLocal rebase, this write would blow away char-A in the
    // shared localStorage blob — this is exactly what the original bug
    // report reproduced, and it has nothing to do with cloud sync at all.
    act(() => { tabB.result.current.saveCharacter({ name: 'Bob', notes: 'edited by tab B' }, 'char-B') })

    const stored = JSON.parse(localStorage.getItem('nf_characters'))
    expect(stored.find(c => c.id === 'char-A').notes).toBe('edited by tab A')
    expect(stored.find(c => c.id === 'char-B').notes).toBe('edited by tab B')
    expect(tabB.result.current.characters.find(c => c.id === 'char-A').notes).toBe('edited by tab A')
  })

  // commitLocal caches the raw string it last wrote per key (see useStore.js) so a
  // *later* commit for the same key can skip the expensive re-read/re-merge when
  // nothing else has touched storage since — but only once a tab has actually
  // written that key at least once, establishing its own cache. This test makes
  // sure that cache doesn't go stale: a tab that already wrote (and cached) a key
  // must still notice a genuinely external write that lands in between two of its
  // own commits, not just on its very first write ever (already covered above).
  it('a cached tab still picks up another tab\'s edit that lands between two of its own commits', () => {
    const owner = 'user-multitab-cache-invalidation'
    const seed = [
      { id: 'char-A', novelId: 'novel-1', name: 'Alice', notes: 'original' },
      { id: 'char-B', novelId: 'novel-1', name: 'Bob', notes: 'original' },
    ]
    const novels = [{ id: 'novel-1', title: 'World', type: 'novel' }]

    const tabA = renderHook(() => useStore(owner, { cloudSyncEnabled: false }))
    const tabB = renderHook(() => useStore(owner, { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })
    act(() => { tabB.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })

    // Tab B writes once first — this establishes tab B's own "last raw I wrote"
    // cache for nf_characters, the exact state that lets a later commit take the
    // fast skip path.
    act(() => { tabB.result.current.saveCharacter({ name: 'Bob', notes: 'first edit by tab B' }, 'char-B') })
    expect(tabB.result.current.characters.find(c => c.id === 'char-B').notes).toBe('first edit by tab B')

    // Tab A, entirely independently, now edits the OTHER record — tab B has no
    // way to know this happened yet.
    act(() => { tabA.result.current.saveCharacter({ name: 'Alice', notes: 'edited by tab A' }, 'char-A') })

    // Tab B commits again. Storage now differs from what tab B itself last wrote
    // (tab A's write landed in between), so this must NOT take the skip path —
    // it has to notice and adopt tab A's edit, not silently overwrite it with
    // tab B's stale cached copy of char-A.
    act(() => { tabB.result.current.saveCharacter({ name: 'Bob', notes: 'second edit by tab B' }, 'char-B') })

    const stored = JSON.parse(localStorage.getItem('nf_characters'))
    expect(stored.find(c => c.id === 'char-A').notes).toBe('edited by tab A')
    expect(stored.find(c => c.id === 'char-B').notes).toBe('second edit by tab B')
    expect(tabB.result.current.characters.find(c => c.id === 'char-A').notes).toBe('edited by tab A')
  })

  it('two tabs editing DIFFERENT fields on the SAME record both survive via a field-level merge (no conflict, no loss)', async () => {
    const owner = 'user-samerecord-fields'
    const seed = [{ id: 'char-A', novelId: 'novel-1', name: 'Alice', role: 'Original role', bio: 'Original bio' }]
    const novels = [{ id: 'novel-1', title: 'World', type: 'novel' }]

    const tabA = renderHook(() => useStore(owner, { cloudSyncEnabled: false }))
    const tabB = renderHook(() => useStore(owner, { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })
    act(() => { tabB.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })

    // Tab A only changes `role`; its form still submits the full record,
    // including its own (unrelated) stale `bio`.
    act(() => { tabA.result.current.saveCharacter({ name: 'Alice', role: 'Tab A role', bio: 'Original bio' }, 'char-A') })
    // Tab B, unaware of Tab A's edit, only changes `bio`.
    act(() => { tabB.result.current.saveCharacter({ name: 'Alice', role: 'Original role', bio: 'Tab B bio' }, 'char-A') })

    // Both edits must survive — this is the actual shape of the QA report:
    // saving one field must not silently revert a field another tab changed.
    const stored = JSON.parse(localStorage.getItem('nf_characters')).find(c => c.id === 'char-A')
    expect(stored.role).toBe('Tab A role')
    expect(stored.bio).toBe('Tab B bio')
    expect(tabB.result.current.characters.find(c => c.id === 'char-A').role).toBe('Tab A role')
    expect(tabB.result.current.characters.find(c => c.id === 'char-A').bio).toBe('Tab B bio')
    // Not a real conflict — different fields, nothing for the user to review.
    expect(tabB.result.current.recordConflicts).toHaveLength(0)
  })

  it('flags a recordConflicts entry when two tabs edit the SAME record concurrently, and restore/discard resolve it', async () => {
    const owner = 'user-conflict'
    const seed = [{ id: 'char-A', novelId: 'novel-1', name: 'Alice', notes: 'original' }]
    const novels = [{ id: 'novel-1', title: 'World', type: 'novel' }]

    const tabA = renderHook(() => useStore(owner, { cloudSyncEnabled: true }))
    const tabB = renderHook(() => useStore(owner, { cloudSyncEnabled: true }))
    act(() => { tabA.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })
    act(() => { tabA.result.current.finishRemoteLoad(true) })
    act(() => { tabB.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })
    act(() => { tabB.result.current.finishRemoteLoad(true) })

    act(() => { tabA.result.current.saveCharacter({ name: 'Alice', notes: 'from tab A' }, 'char-A') })
    await waitFor(() => {
      const call = vi.mocked(upsertItems).mock.calls.find(c => c[0] === 'characters')
      expect(call?.[2]).toEqual([expect.objectContaining({ notes: 'from tab A' })])
    }, { timeout: 3000 })

    act(() => { tabB.result.current.saveCharacter({ name: 'Alice', notes: 'from tab B' }, 'char-A') })
    await waitFor(() => expect(tabB.result.current.recordConflicts).toHaveLength(1), { timeout: 3000 })

    const conflict = tabB.result.current.recordConflicts[0]
    expect(conflict.table).toBe('characters')
    expect(conflict.recordId).toBe('char-A')
    expect(conflict.mine.notes).toBe('from tab B')
    expect(conflict.theirs.notes).toBe('from tab A')

    // Tab B kept its own edit — that's what should already be saved.
    expect(tabB.result.current.characters.find(c => c.id === 'char-A').notes).toBe('from tab B')

    act(() => { tabB.result.current.restoreRecordConflict(conflict.id) })
    expect(tabB.result.current.recordConflicts).toHaveLength(0)
    expect(tabB.result.current.characters.find(c => c.id === 'char-A').notes).toBe('from tab A')
  })

  it('discardRecordConflict keeps the current (mine) version and just dismisses the warning', async () => {
    const owner = 'user-conflict-discard'
    const seed = [{ id: 'char-A', novelId: 'novel-1', name: 'Alice', notes: 'original' }]
    const novels = [{ id: 'novel-1', title: 'World', type: 'novel' }]

    const tabA = renderHook(() => useStore(owner, { cloudSyncEnabled: true }))
    const tabB = renderHook(() => useStore(owner, { cloudSyncEnabled: true }))
    act(() => { tabA.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })
    act(() => { tabA.result.current.finishRemoteLoad(true) })
    act(() => { tabB.result.current.importData({ novels, characters: seed, _savedAt: 1 }) })
    act(() => { tabB.result.current.finishRemoteLoad(true) })

    act(() => { tabA.result.current.saveCharacter({ name: 'Alice', notes: 'from tab A' }, 'char-A') })
    await waitFor(() => {
      const call = vi.mocked(upsertItems).mock.calls.find(c => c[0] === 'characters')
      expect(call?.[2]).toEqual([expect.objectContaining({ notes: 'from tab A' })])
    }, { timeout: 3000 })

    act(() => { tabB.result.current.saveCharacter({ name: 'Alice', notes: 'from tab B' }, 'char-A') })
    await waitFor(() => expect(tabB.result.current.recordConflicts).toHaveLength(1), { timeout: 3000 })

    act(() => { tabB.result.current.discardRecordConflict(tabB.result.current.recordConflicts[0].id) })
    expect(tabB.result.current.recordConflicts).toHaveLength(0)
    expect(tabB.result.current.characters.find(c => c.id === 'char-A').notes).toBe('from tab B')
  })
})

describe('outline structure integrity', () => {
  const setup = () => {
    localStorage.setItem('nf_novels', JSON.stringify([{ id: 'n', title: 'Outline', type: 'novel' }, { id: 'other', title: 'Other', type: 'novel' }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n'))
    return renderHook(() => useStore(null))
  }

  it('requires active-project parents and starts ordering within each parent', () => {
    const { result } = setup()
    expect(result.current.addChapter('missing', 'Lost')).toBeNull()
    expect(result.current.addScene('missing', 'Lost')).toBeNull()
    let firstAct, secondAct, firstChapter, secondChapter
    act(() => { firstAct = result.current.addAct('Act One'); secondAct = result.current.addAct('Act Two') })
    act(() => { firstChapter = result.current.addChapter(firstAct.id, 'One'); secondChapter = result.current.addChapter(secondAct.id, 'Two') })
    expect(firstChapter.order).toBe(0)
    expect(secondChapter.order).toBe(0)
    expect(result.current.moveChapter(firstChapter.id, 'missing', 0)).toBeNull()
    expect(result.current.moveScene('missing', secondChapter.id, 0)).toBeNull()
  })

  it('refuses stale expected fields, foreign records, and callbacks from a previous project', () => {
    const { result } = setup()
    let outlineAct, outlineChapter, outlineScene
    act(() => { outlineAct = result.current.addAct('Original') })
    act(() => { outlineChapter = result.current.addChapter(outlineAct.id, 'Chapter') })
    act(() => { outlineScene = result.current.addScene(outlineChapter.id, 'Scene') })
    const oldUpdateAct = result.current.updateAct
    const oldMoveChapter = result.current.moveChapter
    const oldDeleteScene = result.current.deleteScene
    const oldUpdateContent = result.current.updateSceneContent

    act(() => {
      expect(result.current.updateAct(outlineAct.id, { title: 'Stale' }, { expected: { title: 'Different' } })).toBeNull()
      expect(result.current.updateChapter('missing', { title: 'No' })).toBeNull()
    })
    act(() => { result.current.setActiveNovelId('other') })
    act(() => {
      expect(oldUpdateAct(outlineAct.id, { title: 'Wrong project' })).toBeNull()
      expect(oldMoveChapter(outlineChapter.id, outlineAct.id, 0)).toBeNull()
      expect(oldDeleteScene(outlineScene.id)).toBe(false)
      expect(oldUpdateContent(outlineScene.id, 'Wrong project')).toBeNull()
    })
    const storedAct = JSON.parse(localStorage.getItem('nf_acts')).find(item => item.id === outlineAct.id)
    expect(storedAct.title).toBe('Original')
    expect(localStorage.getItem(`nf_scene_content:${outlineScene.id}`)).toBe('')
  })

  it('returns saved records, normalizes metadata, and rebalances duplicate positions', () => {
    const { result } = setup()
    let firstAct, secondAct, chapter, scene
    act(() => { firstAct = result.current.addAct(1); secondAct = result.current.addAct(2) })
    act(() => { chapter = result.current.addChapter(firstAct.id, 3, { synopsis: 4, sessionPlan: { hooks: 5 } }) })
    act(() => { scene = result.current.addScene(chapter.id, 6) })
    act(() => {
      expect(result.current.updateAct(firstAct.id, { synopsis: 7 })).toMatchObject({ synopsis: '7' })
      expect(result.current.updateChapter(chapter.id, { sessionRecap: { summary: 8 } })).toMatchObject({ sessionRecap: { summary: '8' } })
      expect(result.current.updateScene(scene.id, { synopsis: 9 })).toMatchObject({ synopsis: '9' })
      expect(result.current.moveAct(secondAct.id, 0)).toMatchObject({ id: secondAct.id, order: 0 })
    })
    expect(result.current.acts.map(item => item.order).sort()).toEqual([0, 1])
  })

  it('deletes only the active hierarchy and clears affected journey links and selection', () => {
    const { result } = setup()
    let outlineAct, outlineChapter, outlineScene, characterId
    act(() => { outlineAct = result.current.addAct('Act') })
    act(() => { outlineChapter = result.current.addChapter(outlineAct.id, 'Chapter') })
    act(() => { outlineScene = result.current.addScene(outlineChapter.id, 'Scene') })
    act(() => { characterId = result.current.saveCharacter({ name: 'Hero', journey: { beats: [{ id: 'b', chapterId: outlineChapter.id, sceneId: outlineScene.id }] } }) })
    act(() => { result.current.setWritingSceneId(outlineScene.id); result.current.setSelectedSceneId(outlineScene.id) })
    act(() => { expect(result.current.deleteChapter(outlineChapter.id)).toBe(true) })
    expect(result.current.scenes).toHaveLength(0)
    expect(result.current.characters.find(item => item.id === characterId).journey.beats[0]).toMatchObject({ chapterId: '', sceneId: '' })
    expect(result.current.writingSceneId).toBeNull()
    expect(result.current.selectedSceneId).toBeNull()
    expect(result.current.deleteChapter(outlineChapter.id)).toBe(false)
  })
})

describe('scene reorder/move cloud sync', () => {
  it('reorderScene pushes both swapped scenes to the cloud', async () => {
    vi.mocked(saveSceneDoc).mockClear()
    const { result } = renderHook(() => useStore('user-structure', { cloudSyncEnabled: true }))

    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    const novelId = result.current.novels[0].id
    act(() => { result.current.setActiveNovelId(novelId) })
    act(() => { result.current.addAct('Act One') })
    const actId = result.current.acts[0].id
    act(() => { result.current.addChapter(actId, 'Chapter One') })
    const chapterId = result.current.chapters[0].id
    act(() => { result.current.addScene(chapterId, 'Scene A') })
    act(() => { result.current.addScene(chapterId, 'Scene B') })
    const [sceneA, sceneB] = result.current.scenes

    vi.mocked(saveSceneDoc).mockClear()
    act(() => { result.current.reorderScene(sceneB.id, 'up') })

    await waitFor(() => {
      expect(saveSceneDoc).toHaveBeenCalledWith('user-structure', expect.objectContaining({ id: sceneA.id, order: 1 }))
      expect(saveSceneDoc).toHaveBeenCalledWith('user-structure', expect.objectContaining({ id: sceneB.id, order: 0 }))
    }, { timeout: 3000 })
  })

  it('moveScene pushes the moved scene to the cloud under its new chapter', async () => {
    vi.mocked(saveSceneDoc).mockClear()
    const { result } = renderHook(() => useStore('user-structure-2', { cloudSyncEnabled: true }))

    act(() => { result.current.addNovel({ title: 'World', type: 'novel' }) })
    const novelId = result.current.novels[0].id
    act(() => { result.current.setActiveNovelId(novelId) })
    act(() => { result.current.addAct('Act One') })
    const actId = result.current.acts[0].id
    act(() => { result.current.addChapter(actId, 'Chapter One') })
    act(() => { result.current.addChapter(actId, 'Chapter Two') })
    const [chapterOne, chapterTwo] = result.current.chapters
    act(() => { result.current.addScene(chapterOne.id, 'Scene A') })
    const scene = result.current.scenes[0]

    vi.mocked(saveSceneDoc).mockClear()
    act(() => { result.current.moveScene(scene.id, chapterTwo.id, 0) })

    await waitFor(() => {
      expect(saveSceneDoc).toHaveBeenCalledWith('user-structure-2', expect.objectContaining({ id: scene.id, chapterId: chapterTwo.id }))
    }, { timeout: 3000 })
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

    // Scene prose is persisted under its own `nf_scene_content:<id>` key
    // (see src/storage/sceneContentStore.js) rather than inline inside
    // `nf_scenes` — read metadata from one and content from the other.
    const storedScenes = JSON.parse(localStorage.getItem('nf_scenes'))
    const conflict = storedScenes.find(scene => scene.conflictOf === sceneId)

    expect(localStorage.getItem(`nf_scene_content:${sceneId}`)).toBe('Tab B stale text')
    expect(conflict).toBeTruthy()
    expect(localStorage.getItem(`nf_scene_content:${conflict.id}`)).toBe('Tab A newer text')
    expect(conflict.title).toContain('conflict copy')
  })

  it('a stale second tab editing a different scene does not revert another scene\'s content (local-storage layer)', () => {
    const tabA = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.addNovel({ title: 'Two Tabs', type: 'novel' }) })
    const chapterId = tabA.result.current.chapters[0].id
    const sceneOneId = tabA.result.current.scenes[0].id
    act(() => { tabA.result.current.addScene(chapterId, 'Scene Two') })
    const sceneTwoId = tabA.result.current.scenes.find(s => s.id !== sceneOneId).id

    // Tab B loads before Tab A's edit, so its own in-memory copy of scene one is stale.
    const tabB = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))

    act(() => { tabA.result.current.updateSceneContent(sceneOneId, 'Scene one edited by tab A') })
    // Tab B edits the OTHER scene — no conflict on scene one, so no conflict-copy
    // safety net kicks in for it; only the generic commitLocal rebase protects it.
    act(() => { tabB.result.current.updateSceneContent(sceneTwoId, 'Scene two edited by tab B') })

    // Scene prose lives under its own `nf_scene_content:<id>` key — see the
    // sceneContentKey comment on the previous test above.
    expect(localStorage.getItem(`nf_scene_content:${sceneOneId}`)).toBe('Scene one edited by tab A')
    expect(localStorage.getItem(`nf_scene_content:${sceneTwoId}`)).toBe('Scene two edited by tab B')
  })

  // Regression test for a real data-loss incident (2026-08-09, see
  // docs/ROADMAP.md): an earlier version of the scene-content storage split
  // stripped every scene's content from the `nf_scenes` metadata blob on
  // every write, but only ever wrote a content key for the one scene that
  // specific commit actually touched. On a real account loaded via
  // importData/hydration — i.e. every scene already has real content that
  // was never individually written by *this* commit's own updater — the
  // very first edit to any single scene silently discarded every other
  // scene's only copy of its content, both locally and (once that damaged
  // state reached a later commit) in cloud sync too. This test reproduces
  // that exact shape: many scenes with real pre-existing content loaded in
  // one shot (not built up via individual updateSceneContent calls, which
  // would have already exercised the one-time migration path scene by
  // scene), then a single edit to just one of them.
  it('does not discard other scenes\' content the first time any single scene is edited on an imported account', () => {
    const { result } = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))
    const novel = { id: 'novel-1', title: 'Heavy Account', type: 'novel' }
    const scenes = Array.from({ length: 12 }, (_, i) => ({
      id: `scene-${i}`,
      novelId: novel.id,
      chapterId: 'chapter-1',
      title: `Scene ${i}`,
      content: `Original untouched content for scene ${i}.`,
      order: i,
    }))

    act(() => {
      result.current.importData({
        novels: [novel],
        activeNovelId: novel.id,
        chapters: [{ id: 'chapter-1', novelId: novel.id, actId: 'act-1', title: 'Chapter 1', order: 0 }],
        acts: [{ id: 'act-1', novelId: novel.id, title: 'Act 1', order: 0 }],
        scenes,
      })
    })

    // Sanity check: every scene actually loaded with its real content in
    // memory before the edit that triggers the first real commit.
    expect(result.current.scenes).toHaveLength(12)
    expect(result.current.scenes.every(s => s.content.startsWith('Original untouched content'))).toBe(true)

    // `importData` replaces `scenes` wholesale (not through commitLocal), so
    // it's the *other* `nf_scenes` write path — the per-collection effect —
    // that has to do this correctly on its own, before any edit ever
    // happens. Pin that directly: right after import, every scene's content
    // should already be split out to its own key, not still sitting
    // unsplit inside `nf_scenes` (which is what an earlier version of that
    // effect did, bypassing the split entirely).
    for (let i = 0; i < 12; i++) {
      expect(localStorage.getItem(`nf_scene_content:scene-${i}`)).toBe(`Original untouched content for scene ${i}.`)
    }
    const metaAfterImport = JSON.parse(localStorage.getItem('nf_scenes'))
    metaAfterImport.forEach(s => expect(s.content).toBeUndefined())

    // Edit exactly one scene — the first commitLocal-driven write to
    // `nf_scenes` since the import. This is the exact moment the original
    // bug destroyed every other scene's content.
    act(() => { result.current.updateSceneContent('scene-5', 'Edited scene 5 content') })

    expect(localStorage.getItem('nf_scene_content:scene-5')).toBe('Edited scene 5 content')
    for (let i = 0; i < 12; i++) {
      if (i === 5) continue
      expect(localStorage.getItem(`nf_scene_content:scene-${i}`)).toBe(`Original untouched content for scene ${i}.`)
    }

    // The metadata blob itself should have content stripped for all of
    // them (that's the whole point of the split) but never at the cost of
    // the content living nowhere at all.
    const meta = JSON.parse(localStorage.getItem('nf_scenes'))
    expect(meta).toHaveLength(12)
    meta.forEach(s => expect(s.content).toBeUndefined())

    // Also confirm the in-memory store (what the rest of the app actually
    // reads) still has every scene's real content — this should never have
    // regressed even under the original bug, since the split only ever
    // touched the storage layer, but worth locking in explicitly.
    expect(result.current.scenes.find(s => s.id === 'scene-5').content).toBe('Edited scene 5 content')
    for (let i = 0; i < 12; i++) {
      if (i === 5) continue
      expect(result.current.scenes.find(s => s.id === `scene-${i}`).content).toBe(`Original untouched content for scene ${i}.`)
    }
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

  // A scene conflict copy's push to the cloud (saveSceneDoc, inside
  // updateSceneContent) is a separate, immediate, un-debounced, no-retry
  // call that fails silently (.catch(console.error)) on a transient network
  // or auth error — real errors of exactly this shape (AbortError, auth
  // token refresh races) were observed live while testing this. If that
  // push never lands and a later refresh/login imports a cloud snapshot
  // that doesn't have the copy yet, a plain `setScenes(sourceData.scenes)`
  // replace would silently discard it — this is what made the manuscript
  // "silent overwrite" survive three earlier fixes: importData is a
  // completely different code path from commitLocal, which is where all
  // three earlier fixes were made.
  it('importData does not silently drop a local conflict copy the cloud fetch doesn\'t have yet (failed/slow saveSceneDoc push)', () => {
    const tabA = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.addNovel({ title: 'Two Tabs', type: 'novel' }) })
    const sceneId = tabA.result.current.scenes[0].id

    const tabB = renderHook(() => useStore('user-local', { cloudSyncEnabled: false }))
    act(() => { tabA.result.current.updateSceneContent(sceneId, 'Tab A newer text') })
    act(() => { tabB.result.current.updateSceneContent(sceneId, 'Tab B stale text') })

    // Local disk now has the main scene + a conflict copy (proven by the
    // existing tests above). Simulate a refresh whose cloud fetch reflects
    // only the main scene — as if the conflict copy's saveSceneDoc push
    // never made it to the server.
    const cloudWithoutConflictCopy = {
      novels: tabB.result.current.novels,
      acts: tabB.result.current.acts,
      chapters: tabB.result.current.chapters,
      scenes: tabB.result.current.scenes, // excludes conflict copies already (novelScenes filters them)
      _savedAt: Date.now(),
    }
    act(() => { tabB.result.current.importData(cloudWithoutConflictCopy) })

    expect(tabB.result.current.scenes.find(s => s.id === sceneId).content).toBe('Tab B stale text')
    const conflict = tabB.result.current.sceneConflicts.find(s => s.conflictOf === sceneId)
    expect(conflict?.content).toBe('Tab A newer text')
  })
})

describe('Schedule event persistence', () => {
  it('normalizes valid creates and rejects incomplete or impossible dates', () => {
    const { result } = renderHook(() => useStore('schedule-user', { cloudSyncEnabled: false }))
    act(() => { result.current.addNovel({ title: 'Calendar', type: 'novel', scheduleCalendar: { months: [{ name: 'Short', days: 3 }], weekLength: 2 } }) })
    let saved
    act(() => { saved = result.current.addScheduleEvent({ title: 42, description: '', notes: 'STALE', year: '2', month: '1', day: '3', tags: [' #Plot ', 'plot'], linkedCharacters: ['c', 'c'] }) })
    expect(saved).toMatchObject({ title: '42', description: '', year: 2, month: 1, day: 3, tags: ['plot'], linkedCharacters: ['c'] })
    let invalid
    act(() => { invalid = result.current.addScheduleEvent({ title: 'Outside', month: 2, day: 1 }) })
    expect(invalid).toBeNull()
    expect(result.current.storySchedule).toHaveLength(1)
  })

  it('refuses stale field expectations without overwriting newer event data', () => {
    const { result } = renderHook(() => useStore('schedule-user', { cloudSyncEnabled: false }))
    act(() => { result.current.addNovel({ title: 'Calendar', type: 'novel' }) })
    let created
    act(() => { created = result.current.addScheduleEvent({ title: 'Original', description: 'First' }) })
    let firstSave
    act(() => { firstSave = result.current.updateScheduleEvent(created.id, { description: 'Second' }, { expected: { description: 'First' } }) })
    expect(firstSave.description).toBe('Second')
    let refused
    act(() => { refused = result.current.updateScheduleEvent(created.id, { title: 'Stale overwrite' }, { expected: { description: 'First' } }) })
    expect(refused).toBeNull()
    expect(result.current.storySchedule[0]).toMatchObject({ title: 'Original', description: 'Second' })
  })

  it('blocks old-project callbacks and foreign deletes', () => {
    const { result } = renderHook(() => useStore('schedule-user', { cloudSyncEnabled: false }))
    act(() => { result.current.addNovel({ title: 'First', type: 'novel' }) })
    let firstEvent
    act(() => { firstEvent = result.current.addScheduleEvent({ title: 'First event' }) })
    const staleAdd = result.current.addScheduleEvent
    act(() => { result.current.addNovel({ title: 'Second', type: 'novel' }) })
    let staleResult
    act(() => { staleResult = staleAdd({ title: 'Wrong project' }) })
    expect(staleResult).toBeNull()
    let deleted
    act(() => { deleted = result.current.deleteScheduleEvent(firstEvent.id) })
    expect(deleted).toBe(false)
    expect(JSON.parse(localStorage.getItem('nf_storySchedule')).some(item => item.id === firstEvent.id)).toBe(true)
  })

  it('cleans Schedule links only when a location is physically deleted', () => {
    const { result } = renderHook(() => useStore('schedule-user', { cloudSyncEnabled: false }))
    act(() => { result.current.addNovel({ title: 'Calendar', type: 'novel' }) })
    let location
    act(() => { location = result.current.saveLocation({ name: 'Old Keep' }) })
    act(() => { result.current.addScheduleEvent({ title: 'Arrival', linkedLocations: [location.id] }) })
    expect(result.current.storySchedule[0].linkedLocations).toEqual([location.id])
    let deleted
    act(() => { deleted = result.current.deleteLocation(location.id) })
    expect(deleted).toBe(true)
    expect(result.current.storySchedule[0].linkedLocations).toEqual([])
    expect(result.current.deleteLocation('missing')).toBe(false)
  })

  it('keeps schedule mutations inert in read-only mode', () => {
    localStorage.setItem('nf_novels', JSON.stringify([{ id: 'n', title: 'Locked' }]))
    localStorage.setItem('nf_activeNovel', JSON.stringify('n'))
    localStorage.setItem('nf_localOwner', 'schedule-user')
    const { result } = renderHook(() => useStore('schedule-user', { cloudSyncEnabled: false, readOnly: true }))
    expect(result.current.addScheduleEvent({ title: 'Blocked' })).toBeNull()
    expect(result.current.updateScheduleEvent('missing', { title: 'Blocked' })).toBeUndefined()
    expect(result.current.deleteScheduleEvent('missing')).toBeUndefined()
    expect(result.current.storySchedule).toEqual([])
  })
})

// ─── storage quota enforcement ───────────────────────────────────────────────
// A full-quota account could still type indefinitely into an existing scene —
// storageExceededCheck only ever gated the add* actions (new scene/chapter/
// character/etc.), never edits to a scene already on the page. updateSceneContent
// now blocks growing a scene's content once usage is at/over quota, while still
// allowing edits that shrink or merely rewrite existing content.

describe('storage quota enforcement', () => {
  // The estimateStoreSize mock (module-level, always 0) only feeds storageUsedBytes
  // through a useMemo keyed on the store's data arrays, so bumping its return value
  // alone doesn't retroactively change already-rendered storageUsedBytes — a
  // dependency (e.g. `scenes`) has to actually change reference first. A shrinking
  // content edit is perfect for that: it's never blocked by the quota gate itself,
  // so it reliably forces the recompute that then reflects the new (over-quota)
  // estimate on the next render.
  const goOverQuota = (result, overQuotaBytes, sceneId, shrunkContent) => {
    vi.mocked(estimateStoreSize).mockReturnValue(overQuotaBytes)
    act(() => { result.current.updateSceneContent(sceneId, shrunkContent) })
  }

  afterEach(() => {
    vi.mocked(estimateStoreSize).mockReturnValue(0)
  })

  it('blocks growing a scene\'s content once storage is full, without touching stored content', () => {
    const { result } = renderHook(() => useStore('user-local', { cloudSyncEnabled: false, storageQuotaBytes: 1000 }))
    act(() => { result.current.addNovel({ title: 'Full Account', type: 'novel' }) })
    const sceneId = result.current.scenes[0].id
    act(() => { result.current.updateSceneContent(sceneId, 'Some starting text that is reasonably long.') })

    goOverQuota(result, 2000, sceneId, 'Shorter.')
    expect(result.current.storageUsedBytes).toBeGreaterThan(result.current.storageQuotaBytes)

    const onReadOnly = vi.fn()
    window.addEventListener('membership-read-only', onReadOnly)

    act(() => { result.current.updateSceneContent(sceneId, 'Shorter. And now much more appended text.') })

    expect(result.current.scenes.find(s => s.id === sceneId).content).toBe('Shorter.')
    expect(onReadOnly).toHaveBeenCalledTimes(1)
    expect(onReadOnly.mock.calls[0][0].detail.reason).toBe('storage-exceeded')

    window.removeEventListener('membership-read-only', onReadOnly)
  })

  it('still allows shrinking or rewriting existing content once storage is full', () => {
    const { result } = renderHook(() => useStore('user-local', { cloudSyncEnabled: false, storageQuotaBytes: 1000 }))
    act(() => { result.current.addNovel({ title: 'Full Account', type: 'novel' }) })
    const sceneId = result.current.scenes[0].id
    act(() => { result.current.updateSceneContent(sceneId, 'Some starting text that is reasonably long.') })

    goOverQuota(result, 2000, sceneId, 'Shorter.')
    expect(result.current.storageUsedBytes).toBeGreaterThan(result.current.storageQuotaBytes)

    act(() => { result.current.updateSceneContent(sceneId, 'Tiny.') })

    expect(result.current.scenes.find(s => s.id === sceneId).content).toBe('Tiny.')
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
    act(() => { result.current.addNovel({ title: 'Campaign', type: 'dnd_campaign' }) })
    vi.mocked(upsertItems).mockClear()
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
