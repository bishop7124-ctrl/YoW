// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

const flag = { on: true }
vi.mock('../../utils/useFeatureFlag', () => ({ useFeatureFlag: () => flag.on }))
import ThreadsPanel from './ThreadsPanel.jsx'
import StoryOutline from './StoryOutline.jsx'

afterEach(() => { cleanup(); flag.on = true })

const makeStore = (overrides = {}) => ({
  activeNovel: { id: 'n1', type: 'novel' },
  acts: [], chapters: [], scenes: [],
  characters: [{ id: 'c1', name: 'Mira' }, { id: 'c2', name: 'Tomas' }],
  plotThreads: [],
  addPlotThread: vi.fn(data => ({ id: 't-new', ...data })),
  updatePlotThread: vi.fn(() => ({})),
  deletePlotThread: vi.fn(() => true),
  readOnly: false,
  ...overrides,
})
const thread = (extra = {}) => ({ id: 't1', novelId: 'n1', name: 'The heir', kind: 'mystery', status: 'open', color: '#3d85c6', description: 'Who took the crown?', characterIds: [], ...extra })

describe('ThreadsPanel', () => {
  it('shows an empty state and creates a thread with a colour when none is picked', () => {
    const store = makeStore()
    render(<ThreadsPanel store={store} />)
    expect(screen.getByText('No plot threads yet.')).toBeTruthy()
    fireEvent.click(screen.getByText('+ New thread'))
    const create = screen.getByText('Create thread')
    expect(create.disabled).toBe(true) // a name is required
    fireEvent.change(screen.getByPlaceholderText('e.g. The missing heir'), { target: { value: 'The heist' } })
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. Heist'), { target: { value: 'Caper' } })
    fireEvent.change(screen.getByLabelText('Add a character…'), { target: { value: 'c1' } })
    fireEvent.click(screen.getByText('Create thread'))
    expect(store.addPlotThread).toHaveBeenCalledWith(expect.objectContaining({ name: 'The heist', kind: 'custom', customLabel: 'Caper', characterIds: ['c1'], color: expect.stringMatching(/^#/) }))
  })

  it('lists threads with their kind, status and how scenes use them', () => {
    const store = makeStore({
      plotThreads: [thread(), thread({ id: 't2', name: 'Old grudge', status: 'dropped', kind: 'custom', customLabel: 'Feud' })],
      scenes: [{ id: 's1', threadLinks: [{ threadId: 't1', role: 'setup' }] }, { id: 's2', threadLinks: [{ threadId: 't1', role: 'payoff' }] }],
    })
    render(<ThreadsPanel store={store} />)
    expect(screen.getByText('The heir')).toBeTruthy()
    expect(screen.getByText('Mystery')).toBeTruthy()
    expect(screen.getByText('2 scenes: 1 sets up, 1 pays off')).toBeTruthy()
    expect(screen.getByText('Feud')).toBeTruthy()
    expect(screen.getByText('Dropped')).toBeTruthy()
    expect(screen.getByText('Not attached to any scene yet.')).toBeTruthy()
  })

  it('edits a thread and saves only on Save', () => {
    const store = makeStore({ plotThreads: [thread()] })
    render(<ThreadsPanel store={store} />)
    fireEvent.click(screen.getByLabelText('Edit The heir'))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'resolved' } })
    expect(store.updatePlotThread).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Save thread'))
    expect(store.updatePlotThread).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'The heir', status: 'resolved' }))
  })

  it('asks before deleting and says how many scenes lose the link', () => {
    const store = makeStore({ plotThreads: [thread()], scenes: [{ id: 's1', threadLinks: [{ threadId: 't1', role: 'setup' }] }] })
    render(<ThreadsPanel store={store} />)
    fireEvent.click(screen.getByLabelText('Delete The heir'))
    const group = screen.getByRole('group', { name: 'Delete The heir?' })
    expect(within(group).getByText(/removed from 1 scene/)).toBeTruthy()
    expect(store.deletePlotThread).not.toHaveBeenCalled()
    fireEvent.click(within(group).getByText('Cancel'))
    expect(store.deletePlotThread).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Delete The heir'))
    fireEvent.click(screen.getByText('Delete thread'))
    expect(store.deletePlotThread).toHaveBeenCalledWith('t1')
  })

  it('shows an error when the store refuses the change', () => {
    const store = makeStore({ addPlotThread: vi.fn(() => null) })
    render(<ThreadsPanel store={store} />)
    fireEvent.click(screen.getByText('+ New thread'))
    fireEvent.change(screen.getByPlaceholderText('e.g. The missing heir'), { target: { value: 'X' } })
    fireEvent.click(screen.getByText('Create thread'))
    expect(screen.getByRole('alert').textContent).toMatch(/could not be added/)
  })

  it('is read-only when the project is read-only', () => {
    render(<ThreadsPanel store={makeStore({ readOnly: true, plotThreads: [thread()] })} />)
    expect(screen.queryByText('+ New thread')).toBeNull()
    expect(screen.queryByLabelText('Edit The heir')).toBeNull()
    expect(screen.getByText('The heir')).toBeTruthy()
  })

  it('stops adding at the per-project limit', () => {
    const many = Array.from({ length: 100 }, (_, i) => thread({ id: `t${i}`, name: `T${i}` }))
    render(<ThreadsPanel store={makeStore({ plotThreads: many })} />)
    expect(screen.getByText('+ New thread').disabled).toBe(true)
    expect(screen.getByText(/limit of 100 threads/)).toBeTruthy()
  })
})

describe('StoryOutline Threads view', () => {
  const outlineStore = () => makeStore({ acts: [{ id: 'a1', title: 'Act 1', order: 0 }], moveAct: vi.fn(), addAct: vi.fn() })
  it('offers the Threads view only while the flag is on', () => {
    flag.on = false
    const { unmount } = render(<StoryOutline store={outlineStore()} />)
    expect(screen.queryByRole('tab', { name: 'Threads' })).toBeNull()
    unmount()
    flag.on = true
    render(<StoryOutline store={outlineStore()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Threads' }))
    expect(screen.getByTestId('threads-panel')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    expect(screen.queryByTestId('threads-panel')).toBeNull()
  })
})
