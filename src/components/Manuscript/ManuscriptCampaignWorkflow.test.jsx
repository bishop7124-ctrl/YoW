// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Manuscript from './Manuscript.jsx'

const noop = vi.fn()
const defaultInnerWidth = window.innerWidth

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
  updateNovel: noop,
  sceneConflicts: [],
  restoreSceneConflict: noop,
  discardSceneConflict: noop,
  ...overrides,
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: defaultInnerWidth })
})

describe('Manuscript campaign workflow', () => {
  it('surfaces campaign session prep and recap fields on session headings', () => {
    const store = baseStore()
    render(<Manuscript store={store} userId={null} />)

    expect(screen.getByText('Session prep & recap')).toBeTruthy()
    expect(screen.getByText(/DM planning fields/)).toBeTruthy()

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
})
