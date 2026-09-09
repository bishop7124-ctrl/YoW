// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Characters from './Characters'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const createStore = overrides => ({
  characters: [{ id: 'c', name: 'Rowan', journey: { startingState: 'Guarded', beats: [{ title: 'Unnumbered beat', description: 'A beginning' }] } }, { id: 'other', name: 'Other' }],
  factions: [], selectedCharacterId: 'c', setSelectedCharacterId: vi.fn(),
  saveCharacter: vi.fn(), saveCharacterJourney: vi.fn(), deleteCharacter: vi.fn(),
  timeline: [], chapters: [], scenes: [], ...overrides,
})
const openJourney = store => { render(<Characters store={store} />); fireEvent.click(screen.getByRole('button', { name: 'Journey', exact: true })) }

describe('Character journey drafts', () => {
  it('retains a refused overview save, blocks competing editors and protects the draft', () => {
    const store = createStore()
    openJourney(store)
    fireEvent.click(screen.getByRole('button', { name: 'Edit overview' }))
    fireEvent.change(screen.getByLabelText('Starting state'), { target: { value: 'Unsaved start' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save journey' }))
    expect(screen.getByLabelText('Starting state').value).toBe('Unsaved start')
    expect(screen.getByRole('button', { name: 'Add beat' }).disabled).toBe(true)
    expect(within(screen.getByRole('complementary')).getByRole('button', { name: /Other Supporting/ }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('retains refused beat edits and selects the returned inherited fork after successful retry', () => {
    const store = createStore()
    openJourney(store)
    fireEvent.click(screen.getByRole('button', { name: 'Add beat' }))
    fireEvent.change(screen.getByLabelText(/^Beat title \*/), { target: { value: 'New beat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save beat' }))
    expect(screen.getByLabelText(/^Beat title \*/).value).toBe('New beat')
    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('draft is still here')
    store.saveCharacterJourney.mockReturnValue({ id: 'fork' })
    fireEvent.click(screen.getByRole('button', { name: 'Save beat' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(store.setSelectedCharacterId).toHaveBeenCalledWith('fork')
    const beats = store.saveCharacterJourney.mock.lastCall[1].beats
    expect(beats).toHaveLength(2)
    expect(beats[0].id).toBe('legacy-beat-0')
  })

  it('disables all journey mutations in read-only projects', () => {
    openJourney(createStore({ readOnly: true }))
    for (const name of ['Edit overview', 'Add beat', 'Move beat earlier', 'Move beat later']) expect(screen.getByRole('button', { name }).disabled).toBe(true)
    expect(screen.getAllByRole('button', { name: 'Edit', exact: true }).every(button => button.disabled)).toBe(true)
    expect(screen.getAllByRole('button', { name: 'Delete', exact: true }).every(button => button.disabled)).toBe(true)
  })
})
