// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import CharacterKnowledge from './CharacterKnowledge'
import { sceneChoices } from '../../utils/characterKnowledge'

const acts = [{ id: 'a1', order: 0 }]
const chapters = [{ id: 'ch2', actId: 'a1', order: 1, title: 'Chapter 2' }, { id: 'ch1', actId: 'a1', order: 0, title: 'Chapter 1' }]
const scenes = [{ id: 's3', chapterId: 'ch2', order: 0, title: 'The reveal' }, { id: 's1', chapterId: 'ch1', order: 0, title: 'The gate' }, { id: 's2', chapterId: 'ch1', order: 1, title: '' }, { id: 'loose', chapterId: 'none', order: 0, title: 'Loose' }]
const timeline = [{ id: 'e1', title: 'The siege' }]
const character = { id: 'c1', name: 'Mira', knowledge: [{ id: 'f1', text: 'The bridge is mined', learnedAtSceneId: 's3', learnedAtEventId: 'e1', usedInSceneIds: ['s1'], via: 'told', confidence: 'verified', note: 'Overheard' }] }

beforeEach(() => { vi.stubGlobal('confirm', vi.fn(() => true)) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('sceneChoices', () => {
  it('lists scenes in manuscript order with their chapter, unplaced scenes last', () => {
    expect(sceneChoices({ acts, chapters, scenes }).map(c => c.label)).toEqual(['Chapter 1 · The gate', 'Chapter 1 · Untitled scene', 'Chapter 2 · The reveal', 'Loose'])
  })
})

describe('CharacterKnowledge', () => {
  const open = (props = {}) => render(<CharacterKnowledge character={character} acts={acts} chapters={chapters} scenes={scenes} timeline={timeline} onSave={vi.fn(() => true)} {...props} />)

  it('shows each fact with where it is learned, how, and where it is acted on', () => {
    open()
    expect(screen.getByText('The bridge is mined')).toBeTruthy()
    expect(screen.getByText(/Learns it: Chapter 2 · The reveal, event "The siege"/)).toBeTruthy()
    expect(screen.getByText(/Told · Knows it is true/)).toBeTruthy()
    expect(screen.getByText(/Acts on it in: Chapter 1 · The gate/)).toBeTruthy()
  })

  it('invites the first fact when there are none', () => {
    open({ character: { id: 'c1', name: 'Mira' } })
    expect(screen.getByText('Nothing recorded yet')).toBeTruthy()
  })

  it('adds a fact with the chosen scenes and saves the whole list', () => {
    const onSave = vi.fn(() => true)
    open({ onSave, character: { id: 'c1', name: 'Mira' } })
    fireEvent.click(screen.getByText('Add'))
    fireEvent.submit(screen.getByRole('form', { name: 'Add what they know' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Write what the character knows/)
    fireEvent.change(screen.getByLabelText('What do they know?'), { target: { value: 'The heir lives' } })
    fireEvent.change(screen.getByLabelText('Learns it in scene'), { target: { value: 's3' } })
    fireEvent.click(screen.getByLabelText('Chapter 1 · The gate'))
    fireEvent.submit(screen.getByRole('form', { name: 'Add what they know' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toEqual([expect.objectContaining({ text: 'The heir lives', learnedAtSceneId: 's3', usedInSceneIds: ['s1'], confidence: 'believed' })])
  })

  it('edits and removes a fact, and tells the writer when saving fails', () => {
    const onSave = vi.fn(() => true)
    open({ onSave })
    fireEvent.click(screen.getByText('Remove'))
    expect(onSave).toHaveBeenLastCalledWith([])
    cleanup()
    const failing = vi.fn(() => false)
    open({ onSave: failing })
    fireEvent.click(screen.getByText('Remove'))
    expect(screen.getByRole('alert').textContent).toMatch(/Could not save/)
  })

  it('does not offer changes in a read-only project', () => {
    open({ readOnly: true })
    expect(screen.queryByText('Remove')).toBeNull()
    expect(screen.getByText('Add').closest('button').disabled).toBe(true)
  })
})
