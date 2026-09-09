// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import Characters from './Characters.jsx'
import { uploadUserMedia, deleteUserMedia } from '../../utils/uploadUserMedia'

vi.mock('../../utils/uploadUserMedia', async importOriginal => ({
  ...(await importOriginal()), uploadUserMedia: vi.fn(), deleteUserMedia: vi.fn().mockResolvedValue(undefined),
}))
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks() })

const baseStore = (overrides = {}) => ({
  characters: [],
  saveCharacter: vi.fn(),
  saveCharacterJourney: vi.fn(),
  deleteCharacter: vi.fn(),
  selectedCharacterId: null,
  setSelectedCharacterId: vi.fn(),
  factions: [],
  currentYear: 0,
  loreEntries: [],
  timeline: [],
  chapters: [],
  scenes: [],
  setSelectedLoreEntryId: vi.fn(),
  setSelectedTimelineEventId: vi.fn(),
  setSelectedHistoryEntryId: vi.fn(),
  ...overrides,
})

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

describe('Characters', () => {
  it('keeps social links to forked characters visible and deduplicates continuity aliases without rewriting records', () => {
    const a = { id: 'a', name: 'Ada', relationships: [{ targetId: 'b', type: 'friend' }, { targetId: 'b2', type: 'friend' }] }
    const b = { id: 'b', name: 'Earlier Ben', syncRootId: 'b' }
    const b2 = { ...b, id: 'b2', syncSourceId: 'b' }
    const current = { ...b, id: 'b3', syncSourceId: 'b2', name: 'Current Ben' }
    const store = baseStore({ characters: [a, current], selectedCharacterId: 'a', continuityRecords: { characters: [a, b, b2, current] } })
    render(<Characters store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Relationships', exact: true }))
    const links = screen.getByText('Relationship Links').parentElement
    expect(within(links).getAllByText('Current Ben')).toHaveLength(1)
    expect(within(links).getByText('Friend')).toBeTruthy()
    expect(store.saveCharacter).not.toHaveBeenCalled()
    expect(a.relationships).toEqual([{ targetId: 'b', type: 'friend' }, { targetId: 'b2', type: 'friend' }])
  })

  const person = { id: 'c', name: 'Rowan', birthDate: 'Spring 3, Year 20', parentIds: ['p'], keywords: ['Raven'] }
  const editStore = overrides => baseStore({ characters: [person], selectedCharacterId: 'c', currentYear: 100, ...overrides })
  const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

  it.each(['Spring 3, Year 20', 'Before the dawn', 'Year 120', 0])('preserves an untouched birth date (%s) and leaves Family Tree fields out of a profile save', birthDate => {
    const store = editStore({ characters: [{ ...person, birthDate }], saveCharacter: vi.fn().mockReturnValue('c') })
    render(<Characters store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    change('Biography', 'New biography')
    change('Alias / Keywords', 'Nightwing')
    fireEvent.click(screen.getByRole('button', { name: 'Save Character' }))
    const data = store.saveCharacter.mock.calls[0][0]
    expect(data).toMatchObject({ bio: 'New biography', keywords: ['Raven', 'Nightwing'] })
    for (const field of ['birthDate', 'age', 'parentIds', 'childIds', 'spouseIds', 'familyLinks']) expect(data).not.toHaveProperty(field)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('changes birth year only for an explicit age edit and recalculates displayed age when death year changes', () => {
    const store = editStore({ characters: [{ ...person, status: 'dead', deathDate: 'Year 40' }], saveCharacter: vi.fn().mockReturnValue('c') })
    render(<Characters store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    change('Death Year (Optional)', 'Year 50')
    expect(screen.getByLabelText('Age').value).toBe('30')
    change('Age', '10')
    fireEvent.click(screen.getByRole('button', { name: 'Save Character' }))
    expect(store.saveCharacter).toHaveBeenCalledWith(expect.objectContaining({ birthDate: 'Year 40', deathDate: 'Year 50' }), 'c')
  })

  it('retains refused saves and button-only edits behind the discard guard', () => {
    const store = editStore()
    render(<Characters store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove alias Raven' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Character' }))
    expect(screen.getByRole('alert').textContent).toContain('draft is still here')
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save', exact: true }))
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('validates names on every editor tab and preserves a draft while filters change', () => {
    const store = editStore()
    render(<Characters store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    change('Name', '   ')
    fireEvent.click(screen.getByRole('button', { name: 'Character Traits', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Character' }))
    expect(store.saveCharacter).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Enter a name')
    change('Name', 'Draft name')
    change('Search characters', 'no matches')
    expect(screen.getByLabelText('Name').value).toBe('Draft name')
    expect(screen.getByRole('button', { name: 'New', exact: true }).disabled).toBe(true)
  })

  it('commits a custom combobox value on blur and closes only the open list on Escape', () => {
    const store = editStore({ saveCharacter: vi.fn().mockReturnValue('c') })
    render(<Characters store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    change('Role', 'Custom guide')
    fireEvent.blur(screen.getByLabelText('Role'))
    expect(screen.getByLabelText('Role').value).toBe('Custom guide')
    fireEvent.focus(screen.getByLabelText('Role'))
    fireEvent.keyDown(screen.getByLabelText('Role'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save Character' }))
    expect(store.saveCharacter).toHaveBeenCalledWith(expect.objectContaining({ role: 'Custom guide' }), 'c')
  })

  it('shows only correctly typed references and navigates to separate History and Timeline records', () => {
    const store = editStore({ loreEntries: [{ id: 'wrong', title: 'Wrong Lore', locationIds: ['c'] }, { id: 'l', title: 'Lore link', characterIds: ['c'] }], timeline: [{ id: 't', title: 'Timeline link', linkedCharacters: ['c'] }], worldHistory: [{ id: 'h', title: 'History link', linkedCharacters: ['c'] }] })
    render(<Characters store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Relationships', exact: true }))
    expect(screen.queryByText('Wrong Lore')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Timeline link' }))
    fireEvent.click(screen.getByRole('button', { name: 'History link' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lore link' }))
    expect(store.setSelectedTimelineEventId).toHaveBeenCalledWith('t')
    expect(store.setSelectedHistoryEntryId).toHaveBeenCalledWith('h')
    expect(store.setSelectedLoreEntryId).toHaveBeenCalledWith('l')
  })

  it('resets project-local drafts and disables read-only editing', () => {
    const store = editStore({ activeNovelId: 'one' })
    const { rerender } = render(<Characters store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    change('Name', 'Old project draft')
    rerender(<Characters store={{ ...store, activeNovelId: 'two', readOnly: true }} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    for (const name of ['Edit', 'Delete', 'New']) expect(screen.getByRole('button', { name, exact: true }).disabled).toBe(true)
  })

  it('retains selection after a refused delete', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const store = editStore()
    render(<Characters store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
    expect(store.setSelectedCharacterId).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toContain('could not be deleted')
  })

  it('does not delete a saved portrait before a refused save, and cleans up discarded uploads', async () => {
    vi.mocked(uploadUserMedia).mockResolvedValue('data:image/png;base64,new')
    const store = editStore({ characters: [{ ...person, image: 'data:image/png;base64,old' }] })
    render(<Characters store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    await act(async () => { fireEvent.change(screen.getByLabelText('Change Image'), { target: { files: [new File(['image'], 'portrait.png', { type: 'image/png' })] } }) })
    fireEvent.click(screen.getByRole('button', { name: 'Save Character' }))
    expect(deleteUserMedia).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard', exact: true }))
    expect(deleteUserMedia).toHaveBeenCalledWith('data:image/png;base64,new')
    expect(deleteUserMedia).not.toHaveBeenCalledWith('data:image/png;base64,old')
  })

  it('blocks save during upload and removes a late upload after the form was closed', async () => {
    let finishUpload
    vi.mocked(uploadUserMedia).mockImplementation(() => new Promise(resolve => { finishUpload = resolve }))
    const store = editStore()
    render(<Characters store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    fireEvent.change(screen.getByLabelText('Upload Image'), { target: { files: [new File(['image'], 'portrait.png')] } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Character' }))
    expect(store.saveCharacter).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard', exact: true }))
    await act(async () => { finishUpload('data:image/png;base64,late') })
    expect(deleteUserMedia).toHaveBeenCalledWith('data:image/png;base64,late')
  })

  it('keeps a successfully saved new portrait and closes only the top photo editor on Escape', async () => {
    vi.mocked(uploadUserMedia).mockResolvedValue('data:image/png;base64,new')
    const store = editStore({ saveCharacter: vi.fn().mockReturnValue('fork') })
    render(<Characters store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    await act(async () => { fireEvent.change(screen.getByLabelText('Upload Image'), { target: { files: [new File(['image'], 'portrait.png')] } }) })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Photo', exact: true }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save Character' }))
    expect(store.setSelectedCharacterId).toHaveBeenCalledWith('fork')
    expect(deleteUserMedia).not.toHaveBeenCalled()
  })

  it('applies portrait edits through the discard Save action without clearing the parent draft guard', () => {
    render(<Characters store={editStore({ characters: [{ ...person, image: 'data:image/png;base64,old' }] })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Photo', exact: true }))
    change('Portrait zoom', '2')
    const photo = screen.getByRole('dialog', { name: 'Edit Portrait' })
    fireEvent.click(within(photo).getByRole('button', { name: 'Close', exact: true }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save', exact: true }))
    expect(screen.queryByRole('dialog', { name: 'Edit Portrait' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('repairs a stale selected character id instead of leaving the profile blank', async () => {
    const setSelectedCharacterId = vi.fn()

    render(<Characters store={baseStore({
      characters: [
        { id: 'char-1', novelId: 'novel-1', name: 'Rowan Vale', role: 'Protagonist' },
        { id: 'char-2', novelId: 'novel-1', name: 'Elia Marent', role: 'Princess' },
      ],
      selectedCharacterId: 'missing-character',
      setSelectedCharacterId,
    })} />)

    await waitFor(() => {
      expect(setSelectedCharacterId).toHaveBeenCalledWith('char-2')
    })
  })
})
