// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import StructureSidebar from './StructureSidebar.jsx'

const labels = { level1: 'Act', level2: 'Chapter', level3: 'Scene' }

const baseProps = {
  acts: [
    { id: 'act-1', title: 'Act 1', order: 0 },
    { id: 'act-empty', title: 'Act 2', order: 1 },
  ],
  chapters: [
    { id: 'chap-1', actId: 'act-1', title: 'Chapter Deleted', order: 0 },
    { id: 'chap-empty', actId: 'act-1', title: 'Chapter 2', order: 1 },
  ],
  scenes: [
    { id: 'scene-1', chapterId: 'chap-1', title: 'Opening', content: 'one two', order: 0, status: 'draft' },
  ],
  addAct: vi.fn(),
  addChapter: vi.fn(),
  addScene: vi.fn(),
  updateAct: vi.fn(),
  updateChapter: vi.fn(),
  updateScene: vi.fn(),
  deleteAct: vi.fn(),
  deleteChapter: vi.fn(),
  deleteScene: vi.fn(),
  moveAct: vi.fn(),
  moveChapter: vi.fn(),
  moveScene: vi.fn(),
  activeSceneId: 'scene-1',
  onSelectScene: vi.fn(),
  onSelectChapter: vi.fn(),
  labels,
  totalWordCount: 2,
}

const renderSidebar = (overrides = {}) => {
  const props = {
    ...baseProps,
    ...overrides,
  }
  render(<StructureSidebar {...props} />)
  return props
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('StructureSidebar', () => {
  it('shows custom chapter names even when they start with the structure label', () => {
    renderSidebar()

    expect(screen.getByText('Chapter 1: Chapter Deleted')).toBeTruthy()
  })

  it('renames a scene directly from the structure tree', () => {
    const props = renderSidebar()

    fireEvent.click(screen.getByLabelText('Rename scene'))
    const input = screen.getByDisplayValue('Opening')
    fireEvent.change(input, { target: { value: 'Ambush' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(props.updateScene).toHaveBeenCalledWith('scene-1', { title: 'Ambush' })
  })

  it('moves a scene into an empty chapter by dragging onto the empty chapter', () => {
    const props = renderSidebar()
    const dataTransfer = { effectAllowed: '' }
    const sceneRow = screen.getByText('Opening').closest('.ms-sidebar-scene')
    const emptyChapterDropzone = screen.getByText('Drop scene here')

    fireEvent.dragStart(sceneRow, { dataTransfer })
    fireEvent.dragOver(emptyChapterDropzone, { dataTransfer })
    fireEvent.drop(emptyChapterDropzone, { dataTransfer })

    expect(props.moveScene).toHaveBeenCalledWith('scene-1', 'chap-empty', 0)
  })

  it('moves a chapter into an empty act by dragging onto the empty act', () => {
    const props = renderSidebar()
    const dataTransfer = { effectAllowed: '' }
    const chapterRow = screen.getByText('Chapter 1: Chapter Deleted').closest('.ms-sidebar-chapter')
    const emptyActDropzone = screen.getByText('Drop chapter here')

    fireEvent.dragStart(chapterRow, { dataTransfer })
    fireEvent.dragOver(emptyActDropzone, { dataTransfer })
    fireEvent.drop(emptyActDropzone, { dataTransfer })

    expect(props.moveChapter).toHaveBeenCalledWith('chap-1', 'act-empty', 0)
  })
})
