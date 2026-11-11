// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const flag = { on: true }
vi.mock('../../utils/useFeatureFlag', () => ({ useFeatureFlag: () => flag.on }))
import SceneTensionPurpose from './SceneTensionPurpose.jsx'

afterEach(() => { cleanup(); flag.on = true })

const open = (scene = { id: 's1' }) => {
  const update = vi.fn()
  render(<SceneTensionPurpose scene={scene} onUpdateScene={update} />)
  return update
}

describe('SceneTensionPurpose', () => {
  it('renders nothing when the flag is off or there is no scene', () => {
    flag.on = false
    expect(render(<SceneTensionPurpose scene={{ id: 's' }} onUpdateScene={vi.fn()} />).container.innerHTML).toBe('')
    flag.on = true
    expect(render(<SceneTensionPurpose scene={null} onUpdateScene={vi.fn()} />).container.innerHTML).toBe('')
  })
  it('sets tension, shows the current one as pressed, and pressing it again clears it', () => {
    const update = open({ id: 's1', tension: 3 })
    expect(screen.getByLabelText('Tension 3, tense').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Tension 4, intense').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByLabelText('Tension 4, intense'))
    expect(update).toHaveBeenCalledWith('s1', { tension: 4 })
    fireEvent.click(screen.getByLabelText('Tension 3, tense'))
    expect(update).toHaveBeenLastCalledWith('s1', { tension: null })
    fireEvent.click(screen.getByText('Clear tension'))
    expect(update).toHaveBeenLastCalledWith('s1', { tension: null })
  })
  it('offers no clear button when nothing is rated', () => {
    open()
    expect(screen.queryByText('Clear tension')).toBeNull()
  })
  it('sets the purpose and its note', () => {
    const update = open({ id: 's1', purpose: 'reveal', purposeNote: 'old' })
    fireEvent.change(screen.getByLabelText('What is this scene for?'), { target: { value: 'escalate' } })
    expect(update).toHaveBeenCalledWith('s1', { purpose: 'escalate' })
    fireEvent.change(screen.getByLabelText('Note on its purpose'), { target: { value: 'Rowan learns the map lied' } })
    expect(update).toHaveBeenLastCalledWith('s1', { purposeNote: 'Rowan learns the map lied' })
    fireEvent.change(screen.getByLabelText('What is this scene for?'), { target: { value: '' } })
    expect(update).toHaveBeenLastCalledWith('s1', { purpose: '' })
  })
})
