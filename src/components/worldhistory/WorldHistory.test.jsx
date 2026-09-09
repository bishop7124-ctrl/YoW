// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import WorldHistory from './WorldHistory'

vi.mock('../shared/Modal', () => ({ default: ({ children }) => <div role="dialog">{children}</div> }))
afterEach(cleanup)

const makeStore = overrides => ({
  timeline: [
    { id: 'orphan', title: 'Orphaned era entry', eraId: 'deleted', date: 0 },
    { id: 'named', title: 'Legacy named entry', era: 'Old', dateRange: '5 BCE' },
  ],
  eras: [{ id: 'era', name: 'Old', startYear: -10, endYear: 0 }],
  characters: [], locations: [], setSelectedTimelineEventId: vi.fn(), setSelectedHistoryEntryId: vi.fn(),
  addHistoryEntry: vi.fn(), updateHistoryEntry: vi.fn(), deleteHistoryEntry: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(), ...overrides,
})

describe('History chronology integration', () => {
  it('keeps orphaned entries visible and safely searches numeric and legacy dates', () => {
    render(<WorldHistory store={makeStore()} />)
    expect(screen.getByText('Orphaned era entry')).toBeTruthy()
    expect(screen.getByText('Legacy named entry')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: ' BCE ' } })
    expect(screen.queryByText('Orphaned era entry')).toBeNull()
    expect(screen.getByText('Legacy named entry')).toBeTruthy()
  })

  it('retains refused edits instead of closing the shared editor', () => {
    render(<WorldHistory store={makeStore({ selectedTimelineEventId: 'orphan', updateEvent: vi.fn().mockReturnValue(null) })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Unsaved edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('could not be saved')
    expect(screen.getByLabelText('Title *').value).toBe('Unsaved edit')
  })

  it('shows standalone history and edits the actual history record', () => {
    const store = makeStore({ timeline: [], worldHistory: [{ id: 'h', title: 'Before time', content: 'Original text' }], selectedHistoryEntryId: 'h', updateHistoryEntry: vi.fn().mockReturnValue({ id: 'h' }) })
    render(<WorldHistory store={store} />)
    expect(screen.getByText('Original text')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    fireEvent.change(screen.getByLabelText('Content'), { target: { value: 'Changed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    expect(store.updateHistoryEntry).toHaveBeenCalledWith('h', expect.objectContaining({ content: 'Changed', startYear: null, date: '' }))
    expect(store.updateEvent).not.toHaveBeenCalled()
    expect(store.setSelectedHistoryEntryId).toHaveBeenCalledWith('h')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a linked pair once and resolves selection from the timeline side', () => {
    const store = makeStore({ timeline: [{ id: 't', title: 'Outdated timeline title', worldHistoryEntryId: 'h' }], worldHistory: [{ id: 'h', title: 'History title', timelineEventId: 't', content: 'History text' }], selectedTimelineEventId: 't' })
    render(<WorldHistory store={store} />)
    expect(screen.queryByText('Outdated timeline title')).toBeNull()
    expect(screen.getByText('History text')).toBeTruthy()
    expect(screen.getByRole('button', { name: /History title/ }).getAttribute('aria-current')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /History title/ }))
    expect(store.setSelectedHistoryEntryId).toHaveBeenCalledWith('h')
  })

  it('creates a history record with its timeline mirror and selects its history identity', () => {
    const store = makeStore({ addHistoryEntry: vi.fn().mockReturnValue({ id: 'created-history', timelineEventId: 'created-event' }) })
    render(<WorldHistory store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'New', exact: true }))
    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Myth' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    expect(store.addHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({ title: 'Myth', date: '', startYear: null }), { createTimeline: true })
    expect(store.setSelectedHistoryEntryId).toHaveBeenCalledWith('created-history')
  })

  it('keeps the timeline counterpart on an explicitly explained history-only deletion', () => {
    const store = makeStore({ timeline: [{ id: 't', worldHistoryEntryId: 'h' }], worldHistory: [{ id: 'h', title: 'Myth', timelineEventId: 't' }], selectedHistoryEntryId: 'h', deleteHistoryEntry: vi.fn().mockReturnValue(true) })
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false)
    render(<WorldHistory store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
    expect(confirmation.mock.calls[0][0]).toContain('Timeline event will be kept')
    expect(store.deleteHistoryEntry).toHaveBeenCalledWith('h', { scope: 'current' })
    expect(store.deleteEvent).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toContain('Timeline event was kept')
    confirmation.mockRestore()
  })

  it('does not replace an open draft or stack another modal on quick-add', () => {
    render(<WorldHistory store={makeStore({ selectedTimelineEventId: 'orphan' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Draft' } })
    fireEvent(window, new Event('open-history-form'))
    expect(screen.getByLabelText('Title *').value).toBe('Draft')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eras' }))
    fireEvent(window, new Event('open-history-form'))
    expect(screen.queryByLabelText('Title *')).toBeNull()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('clears project-local drafts and search on a project switch', () => {
    const { rerender } = render(<WorldHistory store={makeStore({ activeNovelId: 'one' })} />)
    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'missing' } })
    fireEvent.click(screen.getByRole('button', { name: 'New', exact: true }))
    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Wrong project' } })
    rerender(<WorldHistory store={makeStore({ activeNovelId: 'two' })} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Search history').value).toBe('')
  })

  it('prevents read-only edits and quick-add, and lets a no-match search recover', () => {
    render(<WorldHistory store={makeStore({ readOnly: true, selectedTimelineEventId: 'orphan' })} />)
    expect(screen.getByRole('button', { name: 'Edit', exact: true }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Delete', exact: true }).disabled).toBe(true)
    fireEvent(window, new Event('open-history-form'))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'missing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByLabelText('Search history').value).toBe('')
  })
})
