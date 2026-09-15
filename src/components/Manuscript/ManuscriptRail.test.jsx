// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ManuscriptRail from './ManuscriptRail.jsx'

const noop = vi.fn()

const renderRail = (overrides = {}) => render(
  <ManuscriptRail
    acts={[
      { id: 'act-2', title: 'The Return', synopsis: 'The survivors come home.', order: 1 },
      { id: 'act-1', title: 'The Departure', synopsis: 'The journey begins.', order: 0 },
    ]}
    chapters={[
      { id: 'chapter-2', actId: 'act-2', title: 'Homecoming', synopsis: 'A difficult reunion.', order: 0 },
      { id: 'chapter-1', actId: 'act-1', title: 'First Steps', synopsis: 'They cross the old bridge.', order: 0 },
    ]}
    scenes={[
      { id: 'scene-2', chapterId: 'chapter-2', title: 'At the Gate', synopsis: 'The gate remains closed.', content: '', order: 0 },
      { id: 'scene-1', chapterId: 'chapter-1', title: 'Into the Rain', synopsis: 'Mara chooses to leave.', content: '', order: 0 },
    ]}
    addAct={noop}
    addChapter={noop}
    addScene={vi.fn(() => ({ id: 'new-scene' }))}
    updateAct={noop}
    updateChapter={noop}
    updateScene={noop}
    deleteAct={noop}
    deleteChapter={noop}
    deleteScene={noop}
    moveAct={noop}
    moveChapter={noop}
    moveScene={noop}
    activeSceneId="scene-1"
    onSelectScene={noop}
    onSelectChapter={noop}
    labels={{ level1: 'Act', level2: 'Chapter', level3: 'Scene' }}
    totalWordCount={0}
    collapsed={false}
    onToggleCollapsed={noop}
    {...overrides}
  />
)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ManuscriptRail outline parity', () => {
  it('shows the canonical outline order, numbering, titles, and saved synopses', () => {
    renderRail()

    expect(screen.getByText('Outline')).toBeTruthy()
    expect(document.querySelectorAll('.ms-rail-chapter-title')[0].textContent).toBe('Chapter 1: First Steps')
    expect(document.querySelectorAll('.ms-rail-chapter-title')[1].textContent).toBe('Chapter 2: Homecoming')
    expect(screen.getAllByText('Scene 1')).toHaveLength(2)
    expect(screen.getByText('Into the Rain')).toBeTruthy()
    expect(screen.getByText('The journey begins.')).toBeTruthy()
    expect(screen.getByText('They cross the old bridge.')).toBeTruthy()
    expect(screen.getByText('Mara chooses to leave.')).toBeTruthy()

    const actTitles = [...document.querySelectorAll('.ms-rail-act-btn')].map(element => element.textContent)
    expect(actTitles).toEqual(['The Departure', 'The Return'])
  })

  it('shows one add-scene control per expanded chapter without scene chapter dropdowns', () => {
    const addScene = vi.fn(() => ({ id: 'new-scene' }))
    renderRail({ addScene })

    const addButtons = screen.getAllByRole('button', { name: /^scene$/i })
    expect(addButtons).toHaveLength(2)
    expect(document.querySelectorAll('.ms-rail-add-scene')).toHaveLength(2)
    expect(document.querySelectorAll('.ms-rail-addrow')).toHaveLength(0)
    expect(screen.queryByLabelText('Move scene to chapter')).toBeNull()

    fireEvent.click(addButtons[0])
    expect(addScene).toHaveBeenCalledWith('chapter-1', 'Scene')
  })

  it('adds chapters to the act containing the active scene', () => {
    const addChapter = vi.fn()
    renderRail({ addChapter })

    const addChapterButton = screen.getByRole('button', { name: '+ Chapter' })
    expect(addChapterButton.title).toBe('Add a chapter to The Departure')
    fireEvent.click(addChapterButton)

    expect(addChapter).toHaveBeenCalledWith('act-1', 'Chapter')
  })

  it('updates the chapter target when another act is selected', () => {
    const addChapter = vi.fn()
    renderRail({ addChapter })

    fireEvent.click(screen.getByRole('button', { name: 'The Return' }))
    const addChapterButton = screen.getByRole('button', { name: '+ Chapter' })
    expect(addChapterButton.title).toBe('Add a chapter to The Return')
    fireEvent.click(addChapterButton)

    expect(addChapter).toHaveBeenCalledWith('act-2', 'Chapter')
  })

  it('makes a newly added act the current chapter target', () => {
    const addAct = vi.fn(() => ({ id: 'act-3', title: 'Act 3', order: 2 }))
    const addChapter = vi.fn()
    const { rerender } = renderRail({ addAct, addChapter })

    fireEvent.click(screen.getByRole('button', { name: '+ Act' }))
    expect(addAct).toHaveBeenCalledWith('Act 3')

    rerender(
      <ManuscriptRail
        acts={[
          { id: 'act-1', title: 'The Departure', order: 0 },
          { id: 'act-2', title: 'The Return', order: 1 },
          { id: 'act-3', title: 'Act 3', order: 2 },
        ]}
        chapters={[
          { id: 'chapter-1', actId: 'act-1', title: 'First Steps', order: 0 },
          { id: 'chapter-2', actId: 'act-2', title: 'Homecoming', order: 0 },
        ]}
        scenes={[
          { id: 'scene-1', chapterId: 'chapter-1', title: 'Into the Rain', content: '', order: 0 },
          { id: 'scene-2', chapterId: 'chapter-2', title: 'At the Gate', content: '', order: 0 },
        ]}
        addAct={addAct}
        addChapter={addChapter}
        addScene={noop}
        updateAct={noop}
        updateChapter={noop}
        updateScene={noop}
        deleteAct={noop}
        deleteChapter={noop}
        deleteScene={noop}
        moveAct={noop}
        moveChapter={noop}
        moveScene={noop}
        activeSceneId="scene-1"
        onSelectScene={noop}
        onSelectChapter={noop}
        labels={{ level1: 'Act', level2: 'Chapter', level3: 'Scene' }}
        totalWordCount={0}
        collapsed={false}
        onToggleCollapsed={noop}
      />
    )

    const addChapterButton = screen.getByRole('button', { name: '+ Chapter' })
    expect(addChapterButton.title).toBe('Add a chapter to Act 3')
    fireEvent.click(addChapterButton)
    expect(addChapter).toHaveBeenCalledWith('act-3', 'Chapter')
  })

  it('still moves a scene between populated chapters by drag and drop', () => {
    const moveScene = vi.fn()
    renderRail({ moveScene })

    const sceneRows = document.querySelectorAll('.ms-rail-scene')
    fireEvent.dragStart(sceneRows[0], { dataTransfer: { effectAllowed: '' } })
    fireEvent.dragOver(sceneRows[1], { clientY: 1 })
    fireEvent.drop(sceneRows[1])

    expect(moveScene).toHaveBeenCalledWith('scene-1', 'chapter-2', expect.any(Number))
  })
})
