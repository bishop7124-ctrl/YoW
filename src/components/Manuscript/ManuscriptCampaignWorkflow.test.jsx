// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Manuscript from './Manuscript.jsx'

const noop = vi.fn()
const defaultInnerWidth = window.innerWidth
if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = vi.fn()

const baseStore = (overrides = {}) => ({
  activeNovel: {
    id: 'campaign-1',
    title: 'The Ember Road',
    type: 'dnd_campaign',
    writingGoals: {},
  },
  acts: [{ id: 'arc-1', novelId: 'campaign-1', title: 'Opening Arc', order: 0 }],
  chapters: [{ id: 'session-1', novelId: 'campaign-1', actId: 'arc-1', title: 'Session 1', order: 0 }],
  scenes: [{ id: 'encounter-1', novelId: 'campaign-1', chapterId: 'session-1', title: 'Road Ambush', content: '', order: 0 }],
  characters: [],
  locations: [],
  addAct: noop,
  addChapter: noop,
  addScene: vi.fn(() => ({ id: 'new-scene' })),
  updateAct: noop,
  updateChapter: vi.fn(),
  updateScene: noop,
  updateSceneContent: noop,
  deleteAct: noop,
  deleteChapter: noop,
  deleteScene: noop,
  moveAct: noop,
  moveChapter: noop,
  moveScene: noop,
  setSelectedCharacterId: noop,
  setSelectedLocationId: noop,
  writingSceneId: null,
  setWritingSceneId: vi.fn(),
  updateNovel: noop,
  sceneConflicts: [],
  restoreSceneConflict: noop,
  discardSceneConflict: noop,
  writingSceneId: null,
  setWritingSceneId: noop,
  ...overrides,
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: defaultInnerWidth })
})

describe('Manuscript campaign workflow', () => {
  it('flushes live prose before a mode change remounts the editor', async () => {
    const updateSceneContent = vi.fn()
    const store = baseStore({
      scenes: [{ id: 'encounter-1', novelId: 'campaign-1', chapterId: 'session-1', title: 'Road Ambush', content: 'Original text.', order: 0 }],
      updateSceneContent,
    })
    const { container } = render(<Manuscript store={store} userId={null} />)

    fireEvent.click(container.querySelector('.ms-preview'))
    const textarea = await waitFor(() => container.querySelector('textarea.ms-textarea'))
    fireEvent.change(textarea, { target: { value: 'Text typed just before switching.', selectionStart: 33, selectionEnd: 33 } })

    const modeSwitcher = screen.getByRole('group', { name: 'Editor mode' })
    fireEvent.click(within(modeSwitcher).getByRole('button', { name: 'Editing' }))

    expect(updateSceneContent).toHaveBeenCalledWith('encounter-1', 'Text typed just before switching.')
  })

  it('surfaces campaign session prep and recap fields on session headings', () => {
    const store = baseStore()
    render(<Manuscript store={store} userId={null} />)

    expect(screen.getByText('Session prep & recap')).toBeTruthy()
    expect(screen.getByText(/GM planning fields/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Hooks'), { target: { value: 'Missing caravan at the old bridge' } })
    fireEvent.change(screen.getByLabelText('Recap'), { target: { value: 'The party tracked wagon marks north.' } })

    expect(store.updateChapter).toHaveBeenCalledWith('session-1', {
      sessionPlan: { hooks: 'Missing caravan at the old bridge' },
    })
    expect(store.updateChapter).toHaveBeenCalledWith('session-1', {
      sessionRecap: { summary: 'The party tracked wagon marks north.' },
    })
  })

  it('collapses both side panels when entering Write mode', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    render(<Manuscript store={baseStore()} userId={null} />)

    expect(document.querySelector('.ms-rail.is-collapsed')).toBeNull()
    expect(document.querySelector('.ms-insp')).toBeTruthy()

    const modeSwitcher = screen.getByRole('group', { name: 'Editor mode' })
    fireEvent.click(within(modeSwitcher).getByRole('button', { name: 'Editing' }))
    fireEvent.click(within(modeSwitcher).getByRole('button', { name: 'Writing' }))

    expect(within(modeSwitcher).getByRole('button', { name: 'Writing' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.ms-rail.is-collapsed')).toBeTruthy()
    expect(document.querySelector('.ms-insp')).toBeNull()
  })

  it('opens a manuscript reference in the side panel without leaving Writing mode', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    const store = baseStore({
      scenes: [{ id: 'encounter-1', novelId: 'campaign-1', chapterId: 'session-1', title: 'Road Ambush', content: 'Cara crossed the bridge.', order: 0 }],
      characters: [{ id: 'cara', name: 'Cara', summary: 'A determined scout.' }],
    })
    render(<Manuscript store={store} userId={null} />)

    const modeSwitcher = screen.getByRole('group', { name: 'Editor mode' })
    fireEvent.click(within(modeSwitcher).getByRole('button', { name: 'Editing' }))
    fireEvent.click(within(modeSwitcher).getByRole('button', { name: 'Writing' }))
    expect(document.querySelector('.ms-insp')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open in side panel' }))

    expect(within(modeSwitcher).getByRole('button', { name: 'Writing' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('complementary', { name: 'Scene inspector' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Selected catalogue entry' }).textContent).toContain('Cara')
    expect(within(document.querySelector('.ms-topbar')).getByRole('button', { name: 'Inspector' })).toBeTruthy()

    // Re-selecting the current mode must not act like a panel-close command.
    fireEvent.click(within(modeSwitcher).getByRole('button', { name: 'Writing' }))
    expect(screen.getByRole('complementary', { name: 'Scene inspector' })).toBeTruthy()
  })

  it('jumps directly to a selected chapter and activates its first scene', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    const store = baseStore({
      chapters: [
        { id: 'session-1', novelId: 'campaign-1', actId: 'arc-1', title: 'Session 1', order: 0 },
        { id: 'session-2', novelId: 'campaign-1', actId: 'arc-1', title: 'The Deep Road', order: 1 },
      ],
      scenes: [
        { id: 'encounter-1', novelId: 'campaign-1', chapterId: 'session-1', title: 'Road Ambush', content: '', order: 0 },
        { id: 'encounter-3', novelId: 'campaign-1', chapterId: 'session-2', title: 'The Gate', content: '', order: 1 },
        { id: 'encounter-2', novelId: 'campaign-1', chapterId: 'session-2', title: 'The Descent', content: '', order: 0 },
      ],
    })
    render(<Manuscript store={store} userId={null} />)

    const target = document.getElementById('ms-chap-session-2')
    target.scrollIntoView = vi.fn()
    const chapterButtons = document.querySelectorAll('.ms-rail-chapter-btn')
    fireEvent.click(chapterButtons[1])

    expect(store.setWritingSceneId).toHaveBeenCalledWith('encounter-2')
    await waitFor(() => {
      expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    })
  })

  it('keeps the active scene when moving through Writing, Editing, and Finalised', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    const targetSceneId = 'scene-4'
    const store = baseStore({
      activeNovel: { id: 'novel-1', title: 'The Ember Road', type: 'novel', writingGoals: {} },
      acts: [{ id: 'act-1', novelId: 'novel-1', title: 'Act 1', order: 0 }],
      chapters: [
        { id: 'chapter-1', novelId: 'novel-1', actId: 'act-1', title: 'Chapter 1', order: 0 },
        { id: 'chapter-3', novelId: 'novel-1', actId: 'act-1', title: 'Chapter 3', order: 1 },
      ],
      scenes: [
        { id: 'scene-1', novelId: 'novel-1', chapterId: 'chapter-1', title: 'Opening', content: 'Opening prose.', order: 0 },
        { id: targetSceneId, novelId: 'novel-1', chapterId: 'chapter-3', title: 'Scene 4', content: 'The retained scene.', order: 0 },
      ],
      writingSceneId: targetSceneId,
    })
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    const scrollCalls = []
    HTMLElement.prototype.scrollIntoView = function scrollIntoView(options) {
      scrollCalls.push({ node: this, options })
    }

    try {
      render(<Manuscript store={store} userId={null} />)
      await waitFor(() => {
        expect(scrollCalls.some(call => call.node.id === `ms-scene-${targetSceneId}`)).toBe(true)
      })
      scrollCalls.length = 0

      let modeSwitcher = screen.getByRole('group', { name: 'Editor mode' })
      fireEvent.click(within(modeSwitcher).getByRole('button', { name: 'Editing' }))
      await waitFor(() => {
        expect(scrollCalls.some(call => call.node.id === `ms-scene-${targetSceneId}` && call.options.block === 'nearest')).toBe(true)
      })
      scrollCalls.length = 0

      modeSwitcher = screen.getByRole('group', { name: 'Editor mode' })
      fireEvent.click(within(modeSwitcher).getByRole('button', { name: 'Finalised' }))
      await waitFor(() => {
        expect(scrollCalls.some(call => call.node.dataset.finalizedSceneId === targetSceneId && call.options.block === 'center')).toBe(true)
      })
      scrollCalls.length = 0

      modeSwitcher = screen.getByRole('group', { name: 'Editor mode' })
      fireEvent.click(within(modeSwitcher).getByRole('button', { name: 'Writing' }))
      await waitFor(() => {
        expect(scrollCalls.some(call => call.node.id === `ms-scene-${targetSceneId}` && call.options.block === 'center')).toBe(true)
      })
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })
})
