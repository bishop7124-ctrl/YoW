// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const flag = { on: true }
vi.mock('../../utils/useFeatureFlag', () => ({ useFeatureFlag: () => flag.on }))
import ScenePlotThreads from './ScenePlotThreads.jsx'

afterEach(() => { cleanup(); flag.on = true })

const threads = [
  { id: 't1', name: 'The heir', status: 'open', color: '#3d85c6', characterIds: ['c1'] },
  { id: 't2', name: 'The romance', status: 'open', characterIds: [] },
  { id: 't3', name: 'Dead end', status: 'dropped', characterIds: ['c1'] },
]
const open = (scene = { id: 's1', characterIds: [] }, list = threads) => {
  const update = vi.fn()
  render(<ScenePlotThreads scene={scene} onUpdateScene={update} threads={list} />)
  return update
}

describe('ScenePlotThreads', () => {
  it('renders nothing when the flag is off or there is no scene', () => {
    flag.on = false
    const { container } = render(<ScenePlotThreads scene={{ id: 's' }} onUpdateScene={vi.fn()} threads={threads} />)
    expect(container.innerHTML).toBe('')
    flag.on = true
    const second = render(<ScenePlotThreads scene={null} onUpdateScene={vi.fn()} threads={threads} />)
    expect(second.container.innerHTML).toBe('')
  })

  it('points at the Outline room when there are no threads', () => {
    open({ id: 's1' }, [])
    expect(screen.getByText(/Create them in the Outline room/)).toBeTruthy()
  })

  it('attaches a thread as "develops", never offering dropped or attached threads', () => {
    const update = open()
    const add = screen.getByLabelText('Add a plot thread…')
    expect([...add.options].map(o => o.textContent)).toEqual(['Add a plot thread…', 'The heir', 'The romance'])
    fireEvent.change(add, { target: { value: 't2' } })
    expect(update).toHaveBeenCalledWith('s1', { threadLinks: [{ threadId: 't2', role: 'development' }] })
  })

  it('changes the role and removes a link', () => {
    const update = open({ id: 's1', threadLinks: [{ threadId: 't1', role: 'setup' }] })
    fireEvent.change(screen.getByLabelText('How this scene serves The heir'), { target: { value: 'payoff' } })
    expect(update).toHaveBeenCalledWith('s1', { threadLinks: [{ threadId: 't1', role: 'payoff' }] })
    fireEvent.click(screen.getByLabelText('Remove The heir from this scene'))
    expect(update).toHaveBeenLastCalledWith('s1', { threadLinks: [] })
  })

  it('shows a link to a thread that no longer exists so it can be removed', () => {
    const update = open({ id: 's1', threadLinks: [{ threadId: 'gone', role: 'mention' }] })
    expect(screen.getByText('Deleted thread')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Remove Deleted thread from this scene'))
    expect(update).toHaveBeenCalledWith('s1', { threadLinks: [] })
  })

  it('suggests threads that list a character in the scene, adds on confirm, and remembers a dismissal', () => {
    const update = open({ id: 's1', characterIds: ['c1'] })
    expect(screen.getByText('Nothing is added until you confirm it.')).toBeTruthy()
    expect(screen.queryByLabelText('Add Dead end')).toBeNull() // dropped threads are never suggested
    fireEvent.click(screen.getByLabelText('Add The heir'))
    expect(update).toHaveBeenCalledWith('s1', { threadLinks: [{ threadId: 't1', role: 'development' }] })
    fireEvent.click(screen.getByLabelText('Dismiss suggestion The heir'))
    expect(update).toHaveBeenLastCalledWith('s1', { dismissedLinks: ['thread:t1'] })
  })
})
