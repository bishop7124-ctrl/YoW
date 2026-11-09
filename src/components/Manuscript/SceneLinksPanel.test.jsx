// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const flag = { on: true }
vi.mock('../../utils/useFeatureFlag', () => ({ useFeatureFlag: () => flag.on }))
import SceneLinksPanel from './SceneLinksPanel'

const characters = [{ id: 'c1', name: 'Mira Ashford' }, { id: 'c2', name: 'Tomas' }]
const locations = [{ id: 'l1', name: 'Red Tower' }]
const timeline = [{ id: 't1', title: 'The Fall of Northwatch', startYear: 40 }]
const baseScene = { id: 's1', title: 'Gate', content: 'Mira Ashford met Tomas at the Red Tower.' }

const open = (scene = baseScene, onUpdateScene = vi.fn()) => {
  render(<SceneLinksPanel scene={scene} onUpdateScene={onUpdateScene} characters={characters} locations={locations} timeline={timeline} />)
  return onUpdateScene
}

beforeEach(() => { flag.on = true })
afterEach(cleanup)

describe('SceneLinksPanel', () => {
  it('renders nothing when the scene_links flag is off or there is no scene', () => {
    flag.on = false
    const { container } = render(<SceneLinksPanel scene={baseScene} onUpdateScene={vi.fn()} characters={characters} />)
    expect(container.innerHTML).toBe('')
    flag.on = true
    const none = render(<SceneLinksPanel scene={null} onUpdateScene={vi.fn()} />)
    expect(none.container.innerHTML).toBe('')
  })

  it('suggests records named in the text and only applies them when confirmed', () => {
    const update = open()
    expect(screen.getByText('Nothing is added until you confirm it.')).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Add Tomas'))
    expect(update).toHaveBeenCalledWith('s1', { characterIds: ['c2'] })
  })

  it('dismissing a suggestion is remembered on the scene', () => {
    const update = open()
    fireEvent.click(screen.getByLabelText('Dismiss suggestion Red Tower'))
    expect(update).toHaveBeenCalledWith('s1', { dismissedLinks: ['location:l1'] })
  })

  it('"Add all suggestions" applies every suggestion in one update', () => {
    const update = open()
    fireEvent.click(screen.getByText('Add all suggestions'))
    expect(update).toHaveBeenCalledTimes(1)
    const patch = update.mock.calls[0][1]
    expect(patch.characterIds.sort()).toEqual(['c1', 'c2'])
    expect(patch.locationIds).toEqual(['l1'])
  })

  it('shows linked records as chips that can be removed, and flags deleted ones', () => {
    const update = open({ ...baseScene, content: '', characterIds: ['c1', 'gone'], povCharacterId: 'c1' })
    expect(screen.getByText('Mira Ashford', { selector: '.ms-link-chip' })).toBeTruthy()
    expect(screen.getByText('Deleted character')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Remove Mira Ashford from this scene'))
    expect(update).toHaveBeenCalledWith('s1', { characterIds: ['gone'], povCharacterId: null })
  })

  it('adds a record from the picker and sets point of view (which also links the character)', () => {
    const update = open({ ...baseScene, content: '' })
    fireEvent.change(screen.getByLabelText('Add a location…'), { target: { value: 'l1' } })
    expect(update).toHaveBeenCalledWith('s1', { locationIds: ['l1'] })
    fireEvent.change(screen.getByLabelText('Point-of-view character'), { target: { value: 'c2' } })
    expect(update).toHaveBeenLastCalledWith('s1', { povCharacterId: 'c2', characterIds: ['c2'] })
  })

  it('saves a story year on blur, rejects nonsense, and clears with an empty box', () => {
    const update = open({ ...baseScene, content: '' })
    const input = screen.getByLabelText('Story year')
    fireEvent.change(input, { target: { value: 'Year 40' } })
    fireEvent.blur(input)
    expect(update).toHaveBeenCalledWith('s1', { storyYear: 40 })
    update.mockClear()
    fireEvent.change(input, { target: { value: 'long ago' } })
    fireEvent.blur(input)
    expect(screen.getByRole('alert').textContent).toMatch(/Use a year/)
    expect(update).not.toHaveBeenCalled()
  })

  it('sets the order-in-story option', () => {
    const update = open({ ...baseScene, content: '' })
    fireEvent.change(screen.getByLabelText('Order in the story'), { target: { value: 'flashback' } })
    expect(update).toHaveBeenCalledWith('s1', { timeShift: 'flashback' })
    fireEvent.change(screen.getByLabelText('Order in the story'), { target: { value: '' } })
    expect(update).toHaveBeenLastCalledWith('s1', { timeShift: null })
  })

  it('turns the legacy point-of-view text into a one-click suggestion', () => {
    const update = open({ ...baseScene, content: '', pov: 'tomas' })
    fireEvent.click(screen.getByText('Use'))
    expect(update).toHaveBeenCalledWith('s1', { povCharacterId: 'c2', characterIds: ['c2'] })
  })

  it('waits for a pause in typing before re-scanning the text for suggestions', () => {
    vi.useFakeTimers()
    try {
      const props = { onUpdateScene: vi.fn(), characters, locations, timeline }
      const { rerender } = render(<SceneLinksPanel scene={{ ...baseScene, content: '' }} {...props} />)
      expect(screen.queryByLabelText('Add Tomas')).toBeNull()
      rerender(<SceneLinksPanel scene={{ ...baseScene, content: 'Tomas arrived.' }} {...props} />)
      expect(screen.queryByLabelText('Add Tomas')).toBeNull() // still typing: no scan yet
      act(() => { vi.advanceTimersByTime(1300) })
      expect(screen.getByLabelText('Add Tomas')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not write a stale year over the saved one when the box is focused and left untouched', () => {
    const update = vi.fn()
    const props = { onUpdateScene: update, characters, locations, timeline }
    const { rerender } = render(<SceneLinksPanel scene={{ ...baseScene, content: '', storyYear: 41 }} {...props} />)
    rerender(<SceneLinksPanel scene={{ ...baseScene, content: '', storyYear: 50 }} {...props} />) // changed elsewhere
    const input = screen.getByLabelText('Story year')
    expect(input.value).toBe('50')
    fireEvent.blur(input)
    expect(update).not.toHaveBeenCalled()
  })

  it('"Add all suggestions" leaves timeline events for the writer to add on purpose', () => {
    const update = vi.fn()
    render(<SceneLinksPanel scene={{ ...baseScene, content: 'Mira Ashford and Tomas watched The Fall of Northwatch.' }} onUpdateScene={update} characters={characters} locations={locations} timeline={timeline} />)
    fireEvent.click(screen.getByText('Add all suggestions'))
    expect(update.mock.calls[0][1].timelineEventIds).toBeUndefined()
    expect(screen.getByLabelText('Add The Fall of Northwatch')).toBeTruthy()
  })
})
