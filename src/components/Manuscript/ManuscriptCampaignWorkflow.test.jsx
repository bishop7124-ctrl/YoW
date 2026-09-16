// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Manuscript from './Manuscript.jsx'

const noop = vi.fn()
const defaultInnerWidth = window.innerWidth

const baseStore = () => ({
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
    fireEvent.click(within(modeSwitcher).getByRole('button', { name: 'Write' }))

    expect(within(modeSwitcher).getByRole('button', { name: 'Write' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.ms-rail.is-collapsed')).toBeTruthy()
    expect(document.querySelector('.ms-insp')).toBeNull()
  })
})
