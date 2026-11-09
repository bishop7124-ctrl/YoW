// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../../utils/searchNavigation', () => ({ openRecord: vi.fn() }))
import GlobalSearch from './GlobalSearch'
import { openRecord } from '../../utils/searchNavigation'

const makeStore = () => ({
  activeNovelId: 'n1',
  characters: [
    { id: 'c1', novelId: 'n1', name: 'Mira Ashford', locationIds: ['l1', 'gone'], bio: 'A cartographer.' },
    { id: 'c2', novelId: 'n1', name: 'Tomas', bio: 'Brother of Mira.' },
  ],
  locations: [{ id: 'l1', novelId: 'n1', name: 'Red Tower', description: 'Mira lives here.' }],
  scenes: [{ id: 's1', novelId: 'n1', title: 'Gate', content: 'Mira waited at the gate.' }],
})

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

const input = () => screen.getByRole('combobox')
const type = (value) => fireEvent.change(input(), { target: { value } })

describe('GlobalSearch', () => {
  it('starts empty with a hint, and focuses the search box', () => {
    render(<GlobalSearch store={makeStore()} onClose={vi.fn()} />)
    expect(screen.getByText(/Searches everything in this project/)).toBeTruthy()
    expect(document.activeElement).toBe(input())
  })

  it('shows ranked results with type labels and filters by type', () => {
    render(<GlobalSearch store={makeStore()} onClose={vi.fn()} />)
    type('mira')
    const options = screen.getAllByRole('option')
    expect(options[0].textContent).toContain('Mira Ashford')
    expect(screen.getByText('All (4)')).toBeTruthy()
    fireEvent.click(screen.getByText('Locations (1)'))
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByText('Red Tower')).toBeTruthy()
  })

  it('moves with the arrow keys and opens the active result with Enter, then closes', () => {
    const onClose = vi.fn(), store = makeStore()
    render(<GlobalSearch store={store} onClose={onClose} />)
    type('mira')
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(openRecord).toHaveBeenCalledTimes(1)
    expect(openRecord.mock.calls[0][1].id).toBe('c2')
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking a result opens it', () => {
    const store = makeStore()
    render(<GlobalSearch store={store} onClose={vi.fn()} />)
    type('tomas')
    fireEvent.click(screen.getByText('Tomas'))
    expect(openRecord).toHaveBeenCalledWith(store, expect.objectContaining({ type: 'character', id: 'c2' }))
  })

  it('Escape closes the search', () => {
    const onClose = vi.fn()
    render(<GlobalSearch store={makeStore()} onClose={onClose} />)
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('says so when nothing matches', () => {
    render(<GlobalSearch store={makeStore()} onClose={vi.fn()} />)
    type('zzzz')
    expect(screen.getByText(/No matches for/)).toBeTruthy()
  })

  it('shows connections with a placeholder for a deleted link, and Escape goes back before closing', () => {
    const onClose = vi.fn()
    render(<GlobalSearch store={makeStore()} onClose={onClose} />)
    type('mira ashford')
    fireEvent.click(screen.getAllByText('Connections')[0])
    expect(screen.getByText('Connections for Mira Ashford')).toBeTruthy()
    expect(screen.getByText('Red Tower')).toBeTruthy()
    expect(screen.getByText(/this link points at a record that no longer exists/)).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(input()).toBeTruthy()
  })

  it('keeps Tab inside the dialog: it wraps between the reachable controls only', () => {
    render(<GlobalSearch store={makeStore()} onClose={vi.fn()} />)
    type('mira')
    const reachable = [...screen.getByRole('dialog').querySelectorAll('button, input')].filter(el => el.tabIndex >= 0)
    expect(reachable.length).toBeGreaterThan(2)
    const last = reachable[reachable.length - 1]
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(reachable[0])
    fireEvent.keyDown(reachable[0], { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('Shift+Enter opens connections for the active result', () => {
    render(<GlobalSearch store={makeStore()} onClose={vi.fn()} />)
    type('tomas')
    fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true })
    expect(screen.getByText('Connections for Tomas')).toBeTruthy()
    expect(screen.getByText(/Nothing is linked to this record yet/)).toBeTruthy()
  })
})
