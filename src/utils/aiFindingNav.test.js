// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { buildFindingNavIndex, resolveFindingRef, navigateToFindingRef } from './aiFindingNav'

function makeStore() {
  return {
    characters: [
      { id: 'char-1', novelId: 'n1', name: 'Gandalf' },
      { id: 'char-2', novelId: 'n1', name: 'Aragorn' },
      { id: 'char-3', novelId: 'n2', name: 'Other Novel Character' },
    ],
    locations: [{ id: 'loc-1', novelId: 'n1', name: 'Rivendell' }],
    loreEntries: [{ id: 'lore-1', novelId: 'n1', title: 'The One Ring' }],
    timeline: [{ id: 'tl-1', novelId: 'n1', title: 'The Council of Elrond' }],
    chapters: [{ id: 'chap-1', novelId: 'n1', title: 'A Long-Expected Party' }],
    scenes: [
      { id: 'scene-1', novelId: 'n1', chapterId: 'chap-1', title: 'The Ambush' },
      { id: 'scene-2', novelId: 'n1', chapterId: 'chap-1', title: 'Opening Scene' },
    ],
    setSelectedCharacterId: vi.fn(),
    setSelectedLocationId: vi.fn(),
    setSelectedLoreEntryId: vi.fn(),
    setSelectedTimelineEventId: vi.fn(),
    setSelectedSceneId: vi.fn(),
  }
}

describe('buildFindingNavIndex', () => {
  it('only includes entities for the given novel', () => {
    const index = buildFindingNavIndex(makeStore(), 'n1')
    expect(index.some(e => e.name === 'Other Novel Character')).toBe(false)
    expect(index.some(e => e.name === 'Gandalf')).toBe(true)
  })

  it('sorts longer names first for substring-match priority', () => {
    const index = buildFindingNavIndex(makeStore(), 'n1')
    expect(index[0].name.length).toBeGreaterThanOrEqual(index[index.length - 1].name.length)
  })
})

describe('resolveFindingRef', () => {
  const index = buildFindingNavIndex(makeStore(), 'n1')

  it('matches an exact name case-insensitively', () => {
    const match = resolveFindingRef(index, 'gandalf')
    expect(match).toMatchObject({ type: 'character', id: 'char-1' })
  })

  it('matches a name embedded in a longer phrase', () => {
    const match = resolveFindingRef(index, 'Chapter 1, Scene: The Ambush')
    expect(match).toMatchObject({ type: 'scene', id: 'scene-1' })
  })

  it('returns null when nothing matches', () => {
    expect(resolveFindingRef(index, 'Someone Not In The Story')).toBeNull()
  })

  it('returns null for empty/missing text', () => {
    expect(resolveFindingRef(index, '')).toBeNull()
    expect(resolveFindingRef(index, undefined)).toBeNull()
  })
})

describe('navigateToFindingRef', () => {
  it('selects the character and switches to the characters section', () => {
    const store = makeStore()
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    navigateToFindingRef(store, { type: 'character', id: 'char-1' })
    expect(store.setSelectedCharacterId).toHaveBeenCalledWith('char-1')
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ detail: { section: 'characters' } }))
    dispatchSpy.mockRestore()
  })

  it('selects the scene and switches to writing mode', () => {
    const store = makeStore()
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    navigateToFindingRef(store, { type: 'scene', id: 'scene-1' })
    expect(store.setSelectedSceneId).toHaveBeenCalledWith('scene-1')
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'switch-writing' }))
    dispatchSpy.mockRestore()
  })

  it('resolves a chapter reference to its first scene', () => {
    const store = makeStore()
    navigateToFindingRef(store, { type: 'chapter', id: 'chap-1' })
    expect(store.setSelectedSceneId).toHaveBeenCalledWith('scene-1')
  })

  it('does nothing for a null ref', () => {
    const store = makeStore()
    navigateToFindingRef(store, null)
    expect(store.setSelectedCharacterId).not.toHaveBeenCalled()
  })
})
