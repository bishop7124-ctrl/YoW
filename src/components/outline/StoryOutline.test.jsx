// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import StoryOutline from './StoryOutline.jsx'

const baseStore = {
  activeNovel: { id: 'novel-1', type: 'novel' },
  acts: [
    { id: 'act-1', title: 'Act 1', order: 0 },
    { id: 'act-2', title: 'Act 2', order: 1 },
  ],
  chapters: [
    { id: 'chapter-1', actId: 'act-1', title: 'Opening', synopsis: '', order: 0 },
    { id: 'chapter-2', actId: 'act-1', title: 'Crossroads', synopsis: '', order: 1 },
    { id: 'chapter-3', actId: 'act-2', title: 'Aftermath', synopsis: '', order: 0 },
  ],
  scenes: [
    { id: 'scene-1', chapterId: 'chapter-1', title: 'Arrival', synopsis: '', content: 'one two', order: 0 },
    { id: 'scene-2', chapterId: 'chapter-2', title: 'Choice', synopsis: '', content: '', order: 0 },
    { id: 'scene-3', chapterId: 'chapter-3', title: 'Fallout', synopsis: '', content: '', order: 0 },
  ],
  addAct: vi.fn(),
  updateAct: vi.fn(),
  deleteAct: vi.fn(),
  reorderAct: vi.fn(),
  moveAct: vi.fn(),
  addChapter: vi.fn(),
  updateChapter: vi.fn(),
  deleteChapter: vi.fn(),
  reorderChapter: vi.fn(),
  moveChapter: vi.fn(),
  addScene: vi.fn(),
  updateScene: vi.fn(),
  deleteScene: vi.fn(),
  reorderScene: vi.fn(),
  moveScene: vi.fn(),
}

const renderOutline = (overrides = {}) => {
  const store = { ...baseStore, ...overrides }
  render(<StoryOutline store={store} />)
  return store
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('StoryOutline', () => {
  it('moves a chapter to a different act from the outline', () => {
    const store = renderOutline()

    fireEvent.change(screen.getAllByLabelText('Move chapter to act')[0], {
      target: { value: 'act-2' },
    })

    expect(store.moveChapter).toHaveBeenCalledWith('chapter-1', 'act-2', 1)
  })

  it('moves a scene to a different chapter from the outline', () => {
    const store = renderOutline()

    fireEvent.change(screen.getAllByLabelText('Move scene to chapter')[0], {
      target: { value: 'chapter-3' },
    })

    expect(store.moveScene).toHaveBeenCalledWith('scene-1', 'chapter-3', 1)
  })

  it('reorders acts by dropping an act between outline drop zones', () => {
    const store = renderOutline()

    fireEvent.dragStart(screen.getAllByLabelText('Drag to reorder act')[0], {
      dataTransfer: { effectAllowed: '', setData: vi.fn() },
    })
    fireEvent.dragOver(screen.getByLabelText('Drop act after Act 2'))
    fireEvent.drop(screen.getByLabelText('Drop act after Act 2'), {
      dataTransfer: { dropEffect: '' },
    })

    expect(store.moveAct).toHaveBeenCalledWith('act-1', 2)
  })

  it('moves a chapter by dropping it into another act', () => {
    const store = renderOutline()

    fireEvent.dragStart(screen.getAllByLabelText('Drag to reorder chapter')[0], {
      dataTransfer: { effectAllowed: '', setData: vi.fn() },
    })
    fireEvent.dragOver(screen.getByLabelText('Drop chapter at start of Act 2'))
    fireEvent.drop(screen.getByLabelText('Drop chapter at start of Act 2'), {
      dataTransfer: { dropEffect: '' },
    })

    expect(store.moveChapter).toHaveBeenCalledWith('chapter-1', 'act-2', 0)
  })

  it('moves a scene by dropping it into another chapter', () => {
    const store = renderOutline()

    fireEvent.dragStart(screen.getAllByLabelText('Drag to reorder scene')[0], {
      dataTransfer: { effectAllowed: '', setData: vi.fn() },
    })
    fireEvent.dragOver(screen.getByLabelText('Drop scene at start of Chapter 2: Crossroads'))
    fireEvent.drop(screen.getByLabelText('Drop scene at start of Chapter 2: Crossroads'), {
      dataTransfer: { dropEffect: '' },
    })

    expect(store.moveScene).toHaveBeenCalledWith('scene-1', 'chapter-2', 0)
  })
})
