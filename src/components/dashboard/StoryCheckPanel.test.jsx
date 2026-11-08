// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

const flag = { on: false }
vi.mock('../../utils/useFeatureFlag', () => ({ useFeatureFlag: () => flag.on }))
vi.mock('../../utils/aiFindingNav', () => ({ navigateToFindingRef: vi.fn() }))

import StoryCheckPanel from './StoryCheckPanel'
import { navigateToFindingRef } from '../../utils/aiFindingNav'

const makeStore = (project = {}) => ({
  updateNovel: vi.fn(),
  eras: [],
  activeProjectStats: {
    project: { id: 'p1', ...project },
    characters: [
      { id: 'a', name: 'Mira', birthDate: 'Year 50', deathDate: 'Year 40' },
      { id: 'b', name: 'Tomas', status: 'dead' },
    ],
    locations: [],
    timeline: [],
  },
})

describe('StoryCheckPanel', () => {
  beforeEach(() => { flag.on = false; vi.clearAllMocks() })
  afterEach(cleanup)

  it('renders nothing when the flag is off', () => {
    const { container } = render(<StoryCheckPanel store={makeStore()} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing without an active project', () => {
    flag.on = true
    const { container } = render(<StoryCheckPanel store={{ activeProjectStats: null }} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows findings grouped by kind with text labels when the flag is on', () => {
    flag.on = true
    render(<StoryCheckPanel store={makeStore()} />)
    expect(screen.getByText(/Confirmed \(1\)/)).toBeTruthy()
    expect(screen.getByText(/Missing information \(1\)/)).toBeTruthy()
    expect(screen.getByText('Dies before being born')).toBeTruthy()
    expect(screen.getByText(/works without any AI/i)).toBeTruthy()
  })

  it('opens the record behind a finding', () => {
    flag.on = true
    const store = makeStore()
    render(<StoryCheckPanel store={store} />)
    fireEvent.click(screen.getAllByText('Open Mira')[0])
    expect(navigateToFindingRef).toHaveBeenCalledWith(store, { type: 'character', id: 'a' })
  })

  it('marks a finding intentional by saving its fingerprint on the project', () => {
    flag.on = true
    const store = makeStore()
    render(<StoryCheckPanel store={store} />)
    fireEvent.click(screen.getAllByText('Mark intentional')[0])
    const [id, patch] = store.updateNovel.mock.calls[0]
    expect(id).toBe('p1')
    expect(Object.keys(patch.storyCheck.dismissed)[0]).toMatch(/^R1:a:/)
  })

  it('hides dismissed findings and lets them be restored', () => {
    flag.on = true
    const first = makeStore()
    const { rerender } = render(<StoryCheckPanel store={first} />)
    fireEvent.click(screen.getAllByText('Mark intentional')[0])
    const dismissed = first.updateNovel.mock.calls[0][1].storyCheck.dismissed
    const next = makeStore({ storyCheck: { dismissed } })
    rerender(<StoryCheckPanel store={next} />)
    expect(screen.queryByText('Dies before being born')).toBeNull()
    fireEvent.click(screen.getByText(/1 marked intentional/))
    fireEvent.click(screen.getByText('Show again'))
    expect(next.updateNovel.mock.calls[0][1].storyCheck.dismissed).toEqual({})
  })

  it('can mute a rule', () => {
    flag.on = true
    const store = makeStore()
    render(<StoryCheckPanel store={store} />)
    fireEvent.click(screen.getByText(/^Rules/))
    fireEvent.click(screen.getByLabelText('Death before birth'))
    expect(store.updateNovel.mock.calls[0][1].storyCheck.mutedRules).toEqual(['R1'])
  })

  it('says so plainly when there is nothing to report', () => {
    flag.on = true
    const store = makeStore()
    store.activeProjectStats.characters = []
    render(<StoryCheckPanel store={store} />)
    expect(screen.getByText(/Nothing to report/)).toBeTruthy()
  })
})
