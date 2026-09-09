// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Timeline from './Timeline'

// Exercise the timeline/form contract without unrelated sheet viewport hooks.
vi.mock('../shared/Modal', () => ({ default: ({ children, title }) => <div role="dialog" aria-label={title}>{children}</div> }))
beforeEach(() => { Element.prototype.scrollTo = vi.fn() })
afterEach(cleanup)

const makeStore = overrides => ({
  timeline: [
    { id: 'b', title: 'Later', date: 'Year 40, First Month', startYear: 40, eraId: 'new' },
    { id: 'a', title: 'Founding', date: 0, eraId: 'old', tags: ['tag', 'tag'], linkedCharacters: ['c', 'c'] },
    { id: 'orphan', title: 'Lost era', year: 4, eraId: 'missing' },
  ],
  eras: [{ id: 'old', name: 'Old', startYear: -10, endYear: 0 }, { id: 'new', name: 'New', startYear: 1, endYear: 99 }],
  characters: [{ id: 'c', name: 'Cara', birthDate: 0 }], locations: [], currentYear: 0,
  addEvent: vi.fn().mockReturnValue({ id: 'created' }), updateEvent: vi.fn().mockReturnValue({ id: 'a' }), deleteEvent: vi.fn(),
  setSelectedTimelineEventId: vi.fn(), setSelectedCharacterId: vi.fn(), setSelectedLocationId: vi.fn(),
  ...overrides,
})

describe('Timeline', () => {
  it('preserves precise dates and searches numeric dates without crashing', () => {
    render(<Timeline store={makeStore()} />)
    expect(screen.getByText('Year 0')).toBeTruthy()
    expect(screen.getByText('Year 40, First Month')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search events'), { target: { value: '  0  ' } })
    expect(screen.getByText('Founding')).toBeTruthy()
    expect(screen.getByText('Cara born · 0')).toBeTruthy()
  })

  it('shows only the selected era and its birthdays, then recovers if that era is deleted', () => {
    const store = makeStore()
    const { rerender } = render(<Timeline store={store} />)
    fireEvent.click(screen.getByRole('button', { name: /^Old/ }))
    expect(screen.queryByText('Later')).toBeNull()
    expect(screen.queryByText('No events in this era yet')).toBeNull()
    expect(screen.getByText('Cara born · 0')).toBeTruthy()
    rerender(<Timeline store={{ ...store, eras: store.eras.filter(era => era.id !== 'old') }} />)
    expect(screen.getByText('Later')).toBeTruthy()
    expect(screen.getByText('Founding')).toBeTruthy()
  })

  it('retains orphaned entries, deduplicates chips, and clears empty filters', () => {
    render(<Timeline store={makeStore()} />)
    expect(screen.getByText('Lost era')).toBeTruthy()
    expect(screen.getAllByText('tag')).toHaveLength(1)
    expect(screen.getAllByText('⊙ Cara')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Search events'), { target: { value: 'nothing matches' } })
    expect(screen.getByText('No matches.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('Founding')).toBeTruthy()
  })

  it.each(['create', 'edit'])('preserves a refused %s draft', mode => {
    const store = makeStore({ selectedTimelineEventId: mode === 'edit' ? 'a' : null })
    store.addEvent.mockReturnValue(null)
    store.updateEvent.mockReturnValue(null)
    render(<Timeline store={store} />)
    fireEvent.click(screen.getByRole('button', { name: mode === 'edit' ? 'Edit' : 'New Event', exact: true }))
    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Keep my draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('Title *').value).toBe('Keep my draft')
    expect(screen.getByRole('alert').textContent).toContain('could not be saved')
  })

  it('selects a created event without making an unwanted History duplicate', () => {
    const store = makeStore()
    render(<Timeline store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'New Event' }))
    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'New beat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    expect(store.addEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'New beat' }), { createHistory: false })
    expect(store.setSelectedTimelineEventId).toHaveBeenCalledWith('created')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not leave details visible for an event hidden by a filter', () => {
    render(<Timeline store={makeStore({ selectedTimelineEventId: 'a' })} />)
    expect(screen.getByRole('button', { name: 'Edit', exact: true })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^New\s?1/ }))
    expect(screen.queryByRole('button', { name: 'Edit', exact: true })).toBeNull()
  })
})
