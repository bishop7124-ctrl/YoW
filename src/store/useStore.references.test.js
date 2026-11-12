// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStore } from './useStore.js'
import { resetStorageBackend } from '../storage/projectStorage.js'

vi.mock('../utils/firestoreSync', () => ({
  upsertItems: vi.fn().mockResolvedValue({}), mergeItems: vi.fn().mockResolvedValue({ results: [], fallback: false }),
  deleteItem: vi.fn().mockResolvedValue({}), saveUserSettings: vi.fn().mockResolvedValue({}), saveSceneDoc: vi.fn().mockResolvedValue({}),
  deleteSceneDoc: vi.fn().mockResolvedValue({}), deleteProjectData: vi.fn().mockResolvedValue({}), replaceUserData: vi.fn().mockResolvedValue({}),
  getUserStorageUsage: vi.fn().mockResolvedValue(0), fetchPlotThreads: vi.fn().mockResolvedValue({ ok: true, threads: [] }),
}))
vi.mock('../utils/cloudSceneVersions', () => ({ markCloudScenesDeleted: vi.fn(), markCloudNovelDeleted: vi.fn() }))
vi.mock('../utils/storageQuota', () => ({ estimateStoreSize: vi.fn().mockReturnValue(0) }))

beforeEach(() => { resetStorageBackend(); localStorage.clear() })

function setup() {
  const hook = renderHook(() => useStore(null))
  let novel, world, ref
  act(() => { novel = hook.result.current.addNovel({ title: 'World', type: 'novel' }) })
  act(() => { world = hook.result.current.addLoreEntry({ title: 'The Long Winter' }) })
  act(() => { ref = hook.result.current.addReference({ title: 'Medieval grain storage', sourceUrl: 'example.com/grain', citation: 'Smith 2001', content: 'notes', id: 'evil', novelId: 'evil', kind: 'lore' }) })
  return { hook, novel, world, ref }
}

describe('references in the store', () => {
  it('stores a reference as a marked lore entry for the active project and cleans what the form sent', () => {
    const { hook, novel, ref } = setup()
    expect(ref).toMatchObject({ title: 'Medieval grain storage', kind: 'reference', sourceUrl: 'https://example.com/grain', citation: 'Smith 2001', novelId: novel.id })
    expect(ref.id).not.toBe('evil')
    expect(hook.result.current.referenceEntries.map(e => e.id)).toEqual([ref.id])
  })

  it('keeps references out of the in-world lore the rest of the app sees', () => {
    const { hook, world, ref } = setup()
    expect(hook.result.current.loreEntries.map(e => e.id)).toEqual([world.id])
    expect(hook.result.current.getProjectContextData(hook.result.current.activeNovelId).loreEntries.map(e => e.id)).toEqual([world.id])
    expect(hook.result.current.getProjectStatsData?.(hook.result.current.activeNovelId)?.loreEntries?.map(e => e.id) ?? [world.id]).toEqual([world.id])
    expect(hook.result.current.loreEntries.some(e => e.id === ref.id)).toBe(false)
  })

  it('still includes references in a project backup, so a restore does not lose them', () => {
    const { hook, novel, ref } = setup()
    const exported = hook.result.current.getProjectExportData(novel.id)
    expect(exported.loreEntries.map(e => e.id)).toContain(ref.id)
    act(() => { hook.result.current.importProjectFromData(JSON.parse(JSON.stringify(exported))) })
    const restored = hook.result.current.getLocalSnapshot().loreEntries.find(e => e.kind === 'reference' && e.id !== ref.id)
    expect(restored).toMatchObject({ title: 'Medieval grain storage', sourceUrl: 'https://example.com/grain' })
  })

  it('updates only references, and ignores fields a form must not set', () => {
    const { hook, world, ref } = setup()
    act(() => { hook.result.current.updateReference(ref.id, { citation: 'Jones 2010', kind: 'lore', id: 'x' }) })
    expect(hook.result.current.referenceEntries[0]).toMatchObject({ id: ref.id, citation: 'Jones 2010', kind: 'reference', title: 'Medieval grain storage' })
    expect(hook.result.current.updateReference(world.id, { title: 'Hijacked' })).toBeNull()
    expect(hook.result.current.loreEntries.find(e => e.id === world.id).title).toBe('The Long Winter')
  })

  it('converts a reference into world lore, and only a reference', () => {
    const { hook, world, ref } = setup()
    expect(hook.result.current.convertReferenceToLore(world.id)).toBeNull()
    act(() => { hook.result.current.convertReferenceToLore(ref.id) })
    expect(hook.result.current.referenceEntries).toEqual([])
    expect(hook.result.current.loreEntries.map(e => e.id).sort()).toEqual([world.id, ref.id].sort())
  })

  it('deletes a reference like any lore entry', () => {
    const { hook, ref } = setup()
    act(() => { hook.result.current.deleteLoreEntry(ref.id) })
    expect(hook.result.current.referenceEntries).toEqual([])
  })
})
