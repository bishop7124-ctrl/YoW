// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FamilyTree from './FamilyTree.jsx'

afterEach(cleanup)

const makeStore = (overrides = {}) => ({
  characters: [
    { id: 'grand', name: 'Grand', birthDate: -40, deathDate: '90' },
    { id: 'parent', name: 'Parent', parentIds: ['grand'] },
    { id: 'focus', name: 'Focus', parentIds: ['parent'], birthDate: 0 },
    { id: 'sibling', name: 'Sibling', parentIds: ['parent'] },
    { id: 'child', name: 'Child', parentIds: ['focus'] },
    { id: 'alone', name: 'Alone' },
  ],
  factions: [], selectedCharacterId: 'focus', currentYear: 100,
  setSelectedCharacterId: vi.fn(), saveCharacter: vi.fn().mockReturnValue('focus'),
  ...overrides,
})
const node = name => screen.queryByRole('button', { name: `Focus ${name}` })

describe('FamilyTree', () => {
  it('applies scope/deceased filters to nodes and preserves standalone access', () => {
    render(<FamilyTree store={makeStore()} />)
    expect(node('Grand')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('View'), { target: { value: 'immediate' } })
    expect(node('Grand')).toBeNull()
    expect(node('Sibling')).toBeTruthy()
    expect(node('Alone')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('View'), { target: { value: 'direct' } })
    expect(node('Sibling')).toBeNull()
    expect(node('Grand')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Deceased'))
    expect(node('Grand')).toBeNull()
    expect(node('Child')).toBeTruthy()
    expect(screen.getByText('Age: 100 yrs')).toBeTruthy()
  })

  it('prevents a reciprocal legacy fact from being added again', () => {
    const store = makeStore()
    render(<FamilyTree store={store} />)
    fireEvent.change(screen.getByLabelText('Relative'), { target: { value: 'parent' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to Family' }))
    expect(store.saveCharacter).not.toHaveBeenCalled()
    expect(screen.getByText('That family relationship is already recorded.')).toBeTruthy()
  })

  it('saves new facts as a partial character update and clears the saved draft', () => {
    const store = makeStore()
    render(<FamilyTree store={store} />)
    fireEvent.change(screen.getByLabelText('Relative'), { target: { value: 'alone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to Family' }))
    expect(store.saveCharacter).toHaveBeenCalledWith({ familyLinks: [expect.objectContaining({ sourceCharacterId: 'focus', targetCharacterId: 'alone', kind: 'parent_child', direction: 'target_is_parent' })] }, 'focus')
    expect(screen.getByLabelText('Relative').value).toBe('')
  })

  it('keeps the draft when saving is refused', () => {
    const store = makeStore({ saveCharacter: vi.fn().mockReturnValue(null) })
    render(<FamilyTree store={store} />)
    fireEvent.change(screen.getByLabelText('Relative'), { target: { value: 'alone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to Family' }))
    expect(screen.getByLabelText('Relative').value).toBe('alone')
    expect(screen.getByText('The relationship could not be saved. Your draft is still here.')).toBeTruthy()
  })

  it('does not reuse an unusual-structure override after changing the target', () => {
    const store = makeStore()
    store.characters.push({ id: 'grandchild', name: 'Grandchild', parentIds: ['child'] })
    render(<FamilyTree store={store} />)
    fireEvent.change(screen.getByLabelText('Relative'), { target: { value: 'child' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to Family' }))
    fireEvent.click(screen.getByLabelText('Allow unusual family structure'))
    fireEvent.change(screen.getByLabelText('Relative'), { target: { value: 'grandchild' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to Family' }))
    expect(store.saveCharacter).not.toHaveBeenCalled()
    expect(screen.getByText('This creates a biological or family-line loop.')).toBeTruthy()
  })

  it('clears stale form state after the focal character changes', () => {
    const store = makeStore()
    const { rerender } = render(<FamilyTree store={store} />)
    fireEvent.change(screen.getByLabelText('Relative'), { target: { value: 'alone' } })
    fireEvent.change(screen.getByLabelText('Relationship to Focus'), { target: { value: 'partner' } })
    rerender(<FamilyTree store={{ ...store, selectedCharacterId: 'child' }} />)
    expect(screen.getByLabelText('Relative').value).toBe('')
    expect(screen.getByLabelText('Relationship to Child').value).toBe('parent')
    expect(store.saveCharacter).not.toHaveBeenCalled()
  })

  it('falls back from a stale selection and supports keyboard node selection', () => {
    const store = makeStore({ selectedCharacterId: 'deleted' })
    render(<FamilyTree store={store} />)
    expect(screen.getByLabelText('Focus character').value).toBe('grand')
    fireEvent.keyDown(node('Parent'), { key: 'Enter' })
    expect(store.setSelectedCharacterId).toHaveBeenCalledWith('parent')
  })

  it('renders sibling and guardian facts as linked nodes with scrollable canvases', () => {
    const store = makeStore({ characters: [
      { id: 'focus', name: 'Focus', familyLinks: [
        { id: 's', sourceCharacterId: 'focus', targetCharacterId: 'sib', kind: 'sibling' },
        { id: 'g', sourceCharacterId: 'focus', targetCharacterId: 'ward', kind: 'guardian', type: 'chosen' },
      ] },
      { id: 'sib', name: 'Sib' }, { id: 'ward', name: 'Ward' },
    ] })
    const { container } = render(<FamilyTree store={store} />)
    expect(container.querySelectorAll('[data-family-kind]')).toHaveLength(2)
    expect(screen.queryByText('Unlinked Characters')).toBeNull()
    expect(container.querySelector('.tree-container').classList.contains('overflow-auto')).toBe(true)
  })

  it('shows an empty state without creating free-floating tree characters', () => {
    render(<FamilyTree store={makeStore({ characters: [] })} />)
    expect(screen.getByText('No characters yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Characters' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add to Family' })).toBeNull()
  })
})
