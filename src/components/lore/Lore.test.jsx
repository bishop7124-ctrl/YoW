// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Lore from './Lore'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const makeStore = overrides => ({
  activeNovelId: 'n',
  loreEntries: [{ id: 'a', title: 'Alpha', category: 'Magic', content: 'Original', tags: ['Magic'] }, { id: 'b', title: 'Beta', category: 'All', content: 'Other' }],
  characters: [{ id: 'c', name: 'Character' }], locations: [{ id: 'l', name: 'Location' }],
  selectedLoreEntryId: null, setSelectedLoreEntryId: vi.fn(),
  setSelectedCharacterId: vi.fn(), setSelectedLocationId: vi.fn(), setSelectedIdeaEntryId: vi.fn(), setSelectedHistoryEntryId: vi.fn(), setSelectedTimelineEventId: vi.fn(),
  addLoreEntry: vi.fn(), updateLoreEntry: vi.fn(), deleteLoreEntry: vi.fn(), ...overrides,
})
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('Lore workspace', () => {
  it('renders and searches numeric fields and dangerous-looking category names safely', () => {
    const entries = ['__proto__', 'constructor', 'toString'].map((category, index) => ({ id: `${index}`, title: index, category, tags: [index, index], content: index }))
    render(<Lore store={makeStore({ loreEntries: entries })} />)
    const category = screen.getByRole('button', { name: /__proto__ \(1\)/ })
    expect(category.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(category)
    expect(category.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(category)
    change('Search lore', ' 0 ')
    expect(screen.getByRole('button', { name: /0 1 tag/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /constructor \(1\)/ })).toBeNull()
  })

  it('distinguishes the All category from all categories and recovers obsolete filters', () => {
    const store = makeStore()
    const { rerender } = render(<Lore store={store} />)
    change('Filter by category', 'All')
    expect(screen.queryByText('Alpha')).toBeNull()
    expect(screen.getByText('Beta')).toBeTruthy()
    rerender(<Lore store={{ ...store, loreEntries: [store.loreEntries[0]] }} />)
    expect(screen.getByLabelText('Filter by category').value).toBe('')
    expect(screen.getByText('Alpha')).toBeTruthy()
  })

  it('limits filter options to lore tags but suggests tags from the wider project in the editor', () => {
    render(<Lore store={makeStore({ ideaEntries: [{ id: 'i', tags: ['IdeaOnly', '#magic'] }] })} />)
    expect(within(screen.getByLabelText('Filter by tag')).queryByText('#IdeaOnly')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'New', exact: true }))
    const list = document.getElementById(screen.getByLabelText('Tags').getAttribute('list'))
    expect([...list.options].map(option => option.value)).toEqual(['IdeaOnly', 'Magic'])
  })

  it.each(['create', 'edit'])('retains refused %s drafts and still asks before discarding', mode => {
    const store = makeStore({ selectedLoreEntryId: mode === 'edit' ? 'a' : null, addLoreEntry: vi.fn().mockReturnValue(null), updateLoreEntry: vi.fn().mockReturnValue(null) })
    render(<Lore store={store} />)
    fireEvent.click(screen.getByRole('button', { name: mode === 'edit' ? 'Edit' : 'New', exact: true }))
    change('Title', 'Unsaved')
    fireEvent.click(screen.getByRole('button', { name: 'Save Entry' }))
    expect(screen.getByRole('alert').textContent).toContain('could not be saved')
    expect(screen.getByLabelText('Title').value).toBe('Unsaved')
    expect(store.setSelectedLoreEntryId).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('rejects whitespace-only titles and saves a pending normalized tag', () => {
    const store = makeStore({ addLoreEntry: vi.fn().mockReturnValue({ id: 'new' }) })
    render(<Lore store={store} />)
    change('Search lore', 'no match')
    fireEvent.click(screen.getByRole('button', { name: 'New', exact: true }))
    change('Title', '  ')
    fireEvent.click(screen.getByRole('button', { name: 'Save Entry' }))
    expect(store.addLoreEntry).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Enter a title')
    change('Title', '  New lore  ')
    change('Tags', ' #Magic ')
    fireEvent.click(screen.getByRole('button', { name: 'Save Entry' }))
    expect(store.addLoreEntry).toHaveBeenCalledWith(expect.objectContaining({ title: 'New lore', tags: ['Magic'] }))
    expect(store.setSelectedLoreEntryId).toHaveBeenCalledWith('new')
    expect(screen.getByLabelText('Search lore').value).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('protects link-only changes and prevents switching to another entry mid-draft', () => {
    render(<Lore store={makeStore({ selectedLoreEntryId: 'a' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    const picker = within(screen.getByRole('group', { name: 'Linked Characters' }))
    const character = picker.getByRole('button', { name: 'Character' })
    fireEvent.click(character)
    expect(character.getAttribute('aria-pressed')).toBe('true')
    expect(within(screen.getByRole('complementary')).getByRole('button', { name: 'Beta', exact: true }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('does not create duplicate tags with Enter and saves explicit tag removal', () => {
    const store = makeStore({ selectedLoreEntryId: 'a', updateLoreEntry: vi.fn().mockReturnValue({ id: 'a' }) })
    render(<Lore store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    change('Tags', '#MAGIC')
    fireEvent.keyDown(screen.getByLabelText('Tags'), { key: 'Enter' })
    expect(screen.getAllByRole('button', { name: 'Remove tag Magic' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag Magic' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Entry' }))
    expect(store.updateLoreEntry).toHaveBeenCalledWith('a', expect.objectContaining({ tags: [] }))
  })

  it('resolves History and Timeline tag links with their separate selection IDs', () => {
    const store = makeStore({ selectedLoreEntryId: 'a', worldHistory: [{ id: 'h', title: 'History match', tags: ['MAGIC'] }], timeline: [{ id: 't', title: 'Timeline match', tags: ['#magic'] }] })
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    render(<Lore store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'History: History match' }))
    expect(store.setSelectedHistoryEntryId).toHaveBeenCalledWith('h')
    expect(dispatch.mock.lastCall[0].detail.section).toBe('worldhistory')
    fireEvent.click(screen.getByRole('button', { name: 'Timeline: Timeline match' }))
    expect(store.setSelectedTimelineEventId).toHaveBeenCalledWith('t')
    expect(dispatch.mock.lastCall[0].detail.section).toBe('timeline')
  })

  it('keeps incoming lore references type-safe and makes filtered related entries reachable', () => {
    const store = makeStore({ selectedLoreEntryId: 'a', loreEntries: [
      { id: 'a', title: 'Alpha', category: 'Magic', loreIds: ['b', 'b'] },
      { id: 'b', title: 'Beta', category: 'Other', loreIds: ['a'] },
      { id: 'incoming', title: 'Incoming', loreIds: ['a'] },
      { id: 'unrelated', title: 'Not incoming', characterIds: ['a'] },
    ] })
    const { container } = render(<Lore store={store} />)
    change('Filter by category', 'Magic')
    const detail = within(container.querySelector('.studio-detail'))
    expect(detail.queryByRole('button', { name: /Not incoming/ })).toBeNull()
    expect(detail.getByRole('button', { name: '← Incoming' })).toBeTruthy()
    expect(detail.getAllByRole('button', { name: 'Beta', exact: true })).toHaveLength(1)
    fireEvent.click(detail.getByRole('button', { name: 'Beta', exact: true }))
    expect(store.setSelectedLoreEntryId).toHaveBeenCalledWith('b')
    expect(screen.getByLabelText('Filter by category').value).toBe('')
  })

  it('hides stale filtered details and resets drafts on project changes', () => {
    const store = makeStore({ selectedLoreEntryId: 'a' })
    const { rerender } = render(<Lore store={store} />)
    change('Search lore', 'Beta')
    expect(screen.queryByRole('button', { name: 'Edit', exact: true })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    change('Title', 'Old project draft')
    rerender(<Lore store={{ ...store, activeNovelId: 'new-project' }} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Search lore').value).toBe('')
  })

  it('disables read-only actions and does not claim a refused deletion succeeded', () => {
    const store = makeStore({ selectedLoreEntryId: 'a', readOnly: true })
    const { rerender } = render(<Lore store={store} />)
    expect(screen.getByRole('button', { name: 'New', exact: true }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Edit', exact: true }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Delete', exact: true }).disabled).toBe(true)
    rerender(<Lore store={{ ...store, readOnly: false }} />)
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
    expect(store.deleteLoreEntry).toHaveBeenCalledWith('a', { scope: 'current' })
    expect(screen.getByRole('status').textContent).toContain('could not be deleted')
    expect(store.setSelectedLoreEntryId).not.toHaveBeenCalled()
  })
})
