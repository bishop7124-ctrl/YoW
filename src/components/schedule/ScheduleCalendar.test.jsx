// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ScheduleCalendar from './ScheduleCalendar.jsx'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const event = { id: 'e', title: 'Crossing', description: 'Saved description', year: 1, month: 1, day: 2, duration: 2, category: 'scene', tags: ['plot'], linkedCharacters: [], linkedLocations: [] }
const makeStore = (overrides = {}) => ({
  activeNovelId: 'n', activeNovel: { id: 'n', type: 'novel' }, storySchedule: [event], characters: [], locations: [],
  addScheduleEvent: vi.fn(data => ({ id: 'new', ...data })),
  updateScheduleEvent: vi.fn((id, data) => ({ ...event, id, ...data })),
  deleteScheduleEvent: vi.fn(() => true), updateNovel: vi.fn(), ...overrides,
})

describe('Schedule workspace', () => {
  it('retains a refused create draft and closes only after a successful save', () => {
    const store = makeStore({ addScheduleEvent: vi.fn().mockReturnValueOnce(null).mockReturnValueOnce({ id: 'new', title: 'New event', year: 1, month: 1, day: 3, duration: 1, category: 'scene', tags: ['new'], linkedCharacters: [], linkedLocations: [] }) })
    render(<ScheduleCalendar store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add event on First Month, day 3, year 1' }))
    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'New event' } })
    fireEvent.change(screen.getByLabelText('Tags (comma-separated)'), { target: { value: ' New, #new ' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add event', exact: true }))
    expect(screen.getByRole('alert').textContent).toContain('draft is still here')
    expect(screen.getByLabelText('Title *').value).toBe('New event')
    expect(store.addScheduleEvent).toHaveBeenLastCalledWith(expect.objectContaining({ day: 3, tags: ['new'] }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add event', exact: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('protects drafts from background changes and submits only changed fields with expected values', () => {
    const store = makeStore()
    const view = render(<ScheduleCalendar store={store} />)
    fireEvent.click(screen.getByTitle('Crossing'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Unsaved words' } })
    view.rerender(<ScheduleCalendar store={{ ...store, storySchedule: [{ ...event, title: 'Remote title', description: 'Remote words' }] }} />)
    expect(screen.getByLabelText('Description').value).toBe('Unsaved words')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(store.updateScheduleEvent).toHaveBeenCalledWith('e', { description: 'Unsaved words' }, { expected: { description: 'Saved description' } })
  })

  it('uses a real deletion confirmation and retains a failed delete', () => {
    const store = makeStore({ deleteScheduleEvent: vi.fn(() => false) })
    render(<ScheduleCalendar store={store} />)
    fireEvent.click(screen.getByTitle('Crossing'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Confirm event deletion' })).getByRole('button', { name: 'Cancel deletion' }))
    expect(store.deleteScheduleEvent).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete event' }))
    expect(store.deleteScheduleEvent).toHaveBeenCalledWith('e')
    expect(screen.getByRole('alert').textContent).toContain('could not be deleted')
  })

  it('guards Cancel and Escape instead of discarding a changed event', () => {
    render(<ScheduleCalendar store={makeStore()} />)
    fireEvent.click(screen.getByTitle('Crossing'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Draft title' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel', exact: true }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByLabelText('Title *').value).toBe('Draft title')
  })

  it('keeps malformed and unknown-category records accessible in List view', () => {
    const store = makeStore({ storySchedule: [{ id: 'bad', title: 42, year: 'x', month: 99, day: null, category: '__proto__', tags: 'bad' }] })
    render(<ScheduleCalendar store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'list' }))
    expect(screen.getByRole('button', { name: /42/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /42/ }))
    expect(within(screen.getByRole('dialog')).getByText('Proto', { exact: false })).toBeTruthy()
  })

  it('shows cross-year event ribbons and opens projects at their own saved view without a stale write', () => {
    const first = makeStore({
      activeNovel: { id: 'n', scheduleCalendar: { months: [{ name: 'Only', days: 3 }], weekLength: 2 }, scheduleViewSettings: { openMode: 'lastViewed', lastViewedYear: 2, lastViewedMonth: 1 } },
      storySchedule: [{ ...event, year: 1, month: 1, day: 3, duration: 2 }],
    })
    const view = render(<ScheduleCalendar store={first} />)
    expect(screen.getByLabelText('Schedule year').value).toBe('2')
    expect(screen.getByTitle('Crossing')).toBeTruthy()
    const second = makeStore({ activeNovelId: 'other', activeNovel: { id: 'other', scheduleViewSettings: { openMode: 'lastViewed', lastViewedYear: 9, lastViewedMonth: 1 } }, storySchedule: [] })
    view.rerender(<ScheduleCalendar store={second} />)
    expect(screen.getByLabelText('Schedule year').value).toBe('9')
    expect(second.updateNovel).not.toHaveBeenCalled()
  })

  it('keeps details readable while disabling every write in read-only mode', () => {
    const store = makeStore({ readOnly: true })
    render(<ScheduleCalendar store={store} />)
    expect(screen.getByRole('button', { name: 'Add event', exact: true }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Calendar settings' }).disabled).toBe(true)
    fireEvent.click(screen.getByTitle('Crossing'))
    expect(screen.getByText('Saved description')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('retains calendar-setting drafts when a conflicting background change arrives', () => {
    const store = makeStore()
    const view = render(<ScheduleCalendar store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Calendar settings' }))
    fireEvent.change(screen.getByLabelText('Month 1 name'), { target: { value: 'Draftmonth' } })
    view.rerender(<ScheduleCalendar store={{ ...store, activeNovel: { ...store.activeNovel, scheduleCalendar: { months: [{ name: 'Remote month', days: 30 }], weekLength: 7 } } }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save calendar' }))
    expect(screen.getByRole('alert').textContent).toContain('changed elsewhere')
    expect(screen.getByLabelText('Month 1 name').value).toBe('Draftmonth')
    expect(store.updateNovel).not.toHaveBeenCalled()
  })
})
