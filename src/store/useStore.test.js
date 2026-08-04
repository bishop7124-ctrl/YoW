// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useStore } from './useStore.js'
import { loadLocalFirstSnapshot, saveStorageMode, STORAGE_MODES } from '../utils/storageMode.js'
import { upsertItems, saveSceneDoc } from '../utils/firestoreSync.js'
import { familyRelationshipMapEdges } from '../utils/familyRelationships.js'
import { deleteUserMedia } from '../utils/uploadUserMedia.js'

// Mock Supabase-backed modules so tests run without network
vi.mock('../utils/firestoreSync', () => ({
  upsertItems:        vi.fn().mockResolvedValue({}),
  deleteItem:         vi.fn().mockResolvedValue({}),
  deleteItemsByNovel: vi.fn().mockResolvedValue({}),
  saveUserSettings:   vi.fn().mockResolvedValue({}),
  saveSceneDoc:       vi.fn().mockResolvedValue({}),
  deleteSceneDoc:     vi.fn().mockResolvedValue({}),
  getUserStorageUsage: vi.fn().mockResolvedValue(0),
}))
vi.mock('../utils/projectStats', () => ({
  buildProjectStats: vi.fn().mockReturnValue({}),
}))
vi.mock('../utils/storageQuota', () => ({
  estimateStoreSize: vi.fn().mockReturnValue(0),
}))
vi.mock('../utils/uploadUserMedia', () => ({
  deleteUserMedia: vi.fn().mockResolvedValue(undefined),
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

  it('deleteNovel cleans up uploaded Storage images for the novel and its characters/factions', () => {
    vi.mocked(deleteUserMedia).mockClear()
    const { result } = renderHook(() => useStore(null))

    act(() => { result.current.addNovel({ title: 'To Delete', type: 'novel', coverPhoto: 'https://x/storage/v1/object/public/user-media/u1/covers/a.webp', bannerImage: 'https://x/storage/v1/object/public/user-media/u1/banners/b.webp' }) })
    const id = result.current.novels[0].id
    act(() => { result.current.saveCharacter({ name: 'Frodo', novelId: id, image: 'https://x/storage/v1/object/public/user-media/u1/characters/c.webp' }) })
    act(() => { result.current.saveFaction({ name: 'Fellowship', novelId: id, logo: { source: 'image', image: 'https://x/storage/v1/object/public/user-media/u1/factions/f.webp' } }) })

    act(() => { result.current.deleteNovel(id) })

    const deletedUrls = vi.mocked(deleteUserMedia).mock.calls.map(call => call[0])
    expect(deletedUrls).toEqual(expect.arrayContaining([
      'https://x/storage/v1/object/public/user-media/u1/covers/a.webp',
      'https://x/storage/v1/object/public/user-media/u1/banners/b.webp',
      'https://x/storage/v1/object/public/user-media/u1/characters/c.webp',
      'https://x/storage/v1/object/public/user-media/u1/factions/f.webp',
    ]))
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
    expect(data.timeline).toHaveLength(47)
    expect(data.timeline.every(event => event.date)).toBe(true)
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
    act(() => { result.current.addComicPage('issue-1') })

    const data = result.current.getProjectExportData(id)
    expect(data.comicPages).toHaveLength(1)
    expect(data.comicPanels).toEqual([])
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

describe('lore CRUD', () => {
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

    const storedScenes = JSON.parse(localStorage.getItem('nf_scenes'))
    const original = storedScenes.find(scene => scene.id === sceneId)
    const conflict = storedScenes.find(scene => scene.conflictOf === sceneId)

    expect(original.content).toBe('Tab B stale text')
    expect(conflict).toBeTruthy()
    expect(conflict.content).toBe('Tab A newer text')
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

    const storedScenes = JSON.parse(localStorage.getItem('nf_scenes'))
    expect(storedScenes.find(s => s.id === sceneOneId).content).toBe('Scene one edited by tab A')
    expect(storedScenes.find(s => s.id === sceneTwoId).content).toBe('Scene two edited by tab B')
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
