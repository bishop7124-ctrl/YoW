// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import RelationshipMap from './RelationshipMap.jsx'

afterEach(cleanup)

const renderMap = (store = {}) => render(<RelationshipMap store={{
  characters: [
    {
      id: 'kael',
      name: 'Kael Morven',
      relationships: [{ targetId: 'petra', type: 'friend' }],
    },
    {
      id: 'petra',
      name: 'Petra Solace',
      relationships: [],
    },
    {
      id: 'mira',
      name: 'Mira Morven',
      parentIds: ['kael'],
      relationships: [],
    },
  ],
  factions: [],
  selectedCharacterId: 'kael',
  setSelectedCharacterId: vi.fn(),
  saveCharacter: vi.fn(),
  saveRelationship: vi.fn().mockReturnValue('kael'),
  ...store,
}} />)

describe('RelationshipMap', () => {
  it('adds a social link to a family member with a single source operation', () => {
    const saveRelationship = vi.fn().mockReturnValue('fork')
    const setSelectedCharacterId = vi.fn()
    const saveCharacter = vi.fn()
    renderMap({ saveRelationship, setSelectedCharacterId, saveCharacter })
    fireEvent.change(screen.getByLabelText('Connection character'), { target: { value: 'mira' } })
    fireEvent.click(screen.getByText('Add Connection'))
    expect(saveRelationship).toHaveBeenCalledExactlyOnceWith('kael', 'mira', 'friend', { remove: false })
    expect(saveCharacter).not.toHaveBeenCalled()
    expect(setSelectedCharacterId).toHaveBeenCalledWith('fork')
    expect(screen.getByLabelText('Connection character').value).toBe('')
  })

  it('disables duplicate outgoing types but permits another type on the same pair', () => {
    const saveRelationship = vi.fn().mockReturnValue('kael')
    renderMap({ saveRelationship })
    fireEvent.change(screen.getByLabelText('Connection character'), { target: { value: 'petra' } })
    expect(screen.getByText('Add Connection').disabled).toBe(true)
    expect(screen.getByText('This outgoing connection already exists.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Connection type'), { target: { value: 'ally' } })
    fireEvent.click(screen.getByText('Add Connection'))
    expect(saveRelationship).toHaveBeenCalledExactlyOnceWith('kael', 'petra', 'ally', { remove: false })
  })

  it('removes only the chosen incoming type from its source without changing focus', () => {
    const saveRelationship = vi.fn().mockReturnValue('petra-fork')
    const setSelectedCharacterId = vi.fn()
    renderMap({ saveRelationship, setSelectedCharacterId, characters: [
      { id: 'kael', name: 'Kael', relationships: [{ targetId: 'petra', type: 'friend' }] },
      { id: 'petra', name: 'Petra', parentIds: ['kael'], relationships: [{ targetId: 'kael', type: 'friend' }, { targetId: 'kael', type: 'ally' }] },
    ] })
    expect(screen.getAllByRole('button', { name: /^Remove/ })).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Friend link from Petra to Kael' }))
    expect(saveRelationship).toHaveBeenCalledExactlyOnceWith('petra', 'kael', 'friend', { remove: true })
    expect(setSelectedCharacterId).not.toHaveBeenCalled()
    expect(screen.getByText('Family · read-only')).toBeTruthy()
  })

  it.each([null, 'throw'])('keeps a failed add selection (%s) and explains failure', failure => {
    const saveRelationship = vi.fn(() => { if (failure === 'throw') throw new Error('offline'); return null })
    renderMap({ saveRelationship })
    fireEvent.change(screen.getByLabelText('Connection character'), { target: { value: 'mira' } })
    fireEvent.change(screen.getByLabelText('Connection type'), { target: { value: 'ally' } })
    fireEvent.click(screen.getByText('Add Connection'))
    expect(screen.getByRole('alert').textContent).toContain('could not be saved')
    expect(screen.getByLabelText('Connection character').value).toBe('mira')
    expect(screen.getByLabelText('Connection type').value).toBe('ally')
  })

  it('keeps navigation available while preventing read-only edits', () => {
    const saveRelationship = vi.fn()
    const setSelectedCharacterId = vi.fn()
    renderMap({ readOnly: true, saveRelationship, setSelectedCharacterId })
    expect(screen.getByLabelText('Connection character').disabled).toBe(true)
    screen.getAllByRole('button', { name: /^Remove/ }).forEach(button => expect(button.disabled).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Focus on Petra Solace' }))
    expect(setSelectedCharacterId).toHaveBeenCalledWith('petra')
    expect(saveRelationship).not.toHaveBeenCalled()
  })

  it('resets draft selections on focal/project changes and disables a deleted target', () => {
    const store = { characters: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Ben' }], selectedCharacterId: 'a', setSelectedCharacterId: vi.fn(), saveRelationship: vi.fn() }
    const view = render(<RelationshipMap store={store} />)
    const choose = () => {
      fireEvent.change(screen.getByLabelText('Connection character'), { target: { value: 'b' } })
      fireEvent.change(screen.getByLabelText('Connection type'), { target: { value: 'ally' } })
    }
    choose()
    view.rerender(<RelationshipMap store={{ ...store, selectedCharacterId: 'b' }} />)
    expect(screen.getByLabelText('Connection type').value).toBe('friend')
    expect(screen.getByLabelText('Connection character').value).toBe('')
    view.rerender(<RelationshipMap store={store} />)
    choose()
    view.rerender(<RelationshipMap store={{ ...store, activeNovelId: 'other' }} />)
    expect(screen.getByLabelText('Connection type').value).toBe('friend')
    choose()
    view.rerender(<RelationshipMap store={{ ...store, activeNovelId: 'other', characters: [store.characters[0]] }} />)
    expect(screen.getByText('Add Connection').disabled).toBe(true)
    expect(screen.getByLabelText('Connection character').value).toBe('')
  })

  it('paginates dense casts and counts people rather than duplicate types in badges', () => {
    const characters = [{ id: 'root', name: 'Root', relationships: Array.from({ length: 9 }, (_, i) => ({ targetId: `c${i}`, type: 'friend' })) },
      ...Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `Companion ${i}`, relationships: i === 0 ? [{ targetId: 'c1', type: 'ally' }, { targetId: 'c1', type: 'friend' }] : [] })),
    ]
    renderMap({ characters, selectedCharacterId: 'root' })
    expect(screen.getAllByRole('button', { name: /^Focus on/ })).toHaveLength(8)
    expect(screen.queryByRole('button', { name: 'Focus on Companion 8' })).toBeNull()
    expect(screen.getAllByLabelText('1 other connected characters').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Next connections' }))
    expect(screen.getByRole('status').textContent).toBe('Page 2 of 2')
    expect(screen.getByRole('button', { name: 'Focus on Companion 8' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Focus on/ })).toHaveLength(1)
  })

  it('uses continuity aliases for a selected inherited character and opens the correct profile', () => {
    const setSelectedCharacterId = vi.fn()
    const onSwitch = vi.fn()
    window.addEventListener('switch-section', onSwitch)
    try {
      renderMap({ characters: [{ id: 'fork', name: 'Ada', syncRootId: 'original' }], selectedCharacterId: 'original', setSelectedCharacterId })
      expect(screen.getByLabelText('Focal character').value).toBe('fork')
      fireEvent.click(screen.getByRole('button', { name: 'Open Character Profile' }))
      expect(setSelectedCharacterId).toHaveBeenCalledWith('fork')
      expect(onSwitch.mock.calls[0][0].detail).toEqual({ section: 'characters' })
    } finally { window.removeEventListener('switch-section', onSwitch) }
  })

  it('handles an empty cast', () => {
    renderMap({ characters: [] })
    expect(screen.getByText('Add a character to begin')).toBeTruthy()
    expect(screen.queryByText('Add Connection')).toBeNull()
  })

  it('renders mixed social and read-only family connections without crashing', () => {
    renderMap()

    expect(screen.getAllByText('Kael Morven').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Petra Solace').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mira Morven').length).toBeGreaterThan(0)
    expect(screen.getByText('from family tree')).toBeTruthy()
  })
})
