// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import References from './References'
import ReferencesDrawer from './ReferencesDrawer'
import { ReferenceBody, ReferenceForm } from './ReferenceParts'

const entry = { id: 'r1', title: 'Medieval grain storage', kind: 'reference', sourceUrl: 'https://www.example.com/grain', citation: 'Smith, 2001', content: 'Granaries were raised on stones.', tags: ['farming'] }
const second = { id: 'r2', title: 'Longbows', kind: 'reference', sourceUrl: '', citation: '', content: '' }

const makeStore = (over = {}) => ({
  referenceEntries: [entry, second],
  addReference: vi.fn(data => ({ id: 'new', ...data })),
  updateReference: vi.fn((id, data) => ({ id, ...data })),
  convertReferenceToLore: vi.fn(() => ({ id: 'r1' })),
  deleteLoreEntry: vi.fn(() => true),
  readOnly: false,
  ...over,
})

beforeEach(() => { vi.stubGlobal('confirm', vi.fn(() => true)) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ReferenceBody', () => {
  it('shows the source host as a safe external link, the citation and the notes', () => {
    render(<ReferenceBody entry={entry} />)
    const link = screen.getByRole('link', { name: 'example.com' })
    expect(link.getAttribute('href')).toBe('https://www.example.com/grain')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByText(/Smith, 2001/)).toBeTruthy()
    expect(screen.getByText('Granaries were raised on stones.')).toBeTruthy()
  })
  it('never renders a stored address that is not http or https as a link', () => {
    render(<ReferenceBody entry={{ ...entry, sourceUrl: 'javascript:alert(1)' }} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('ReferenceForm', () => {
  it('requires a title and a valid web address, and saves cleaned values', () => {
    const onSave = vi.fn(() => true)
    render(<ReferenceForm onSave={onSave} />)
    fireEvent.submit(screen.getByRole('form', { name: 'New reference' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Enter a title/)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Tides' } })
    fireEvent.change(screen.getByLabelText('Source link'), { target: { value: 'javascript:alert(1)' } })
    fireEvent.submit(screen.getByRole('form', { name: 'New reference' }))
    expect(screen.getByRole('alert').textContent).toMatch(/web address/)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Source link'), { target: { value: 'example.org/tides' } })
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'sea, , moon' } })
    fireEvent.submit(screen.getByRole('form', { name: 'New reference' }))
    expect(onSave).toHaveBeenCalledWith({ title: 'Tides', sourceUrl: 'example.org/tides', citation: '', content: '', tags: ['sea', 'moon'] })
  })
  it('keeps the draft and says so when saving fails', () => {
    render(<ReferenceForm onSave={() => false} />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Tides' } })
    fireEvent.submit(screen.getByRole('form', { name: 'New reference' }))
    expect(screen.getByRole('alert').textContent).toMatch(/could not be saved/)
    expect(screen.getByLabelText('Title').value).toBe('Tides')
  })
})

describe('References room', () => {
  it('lists references, filters by search, and shows the selected one', () => {
    render(<References store={makeStore()} />)
    expect(screen.getByText('Longbows')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search references'), { target: { value: 'granaries' } })
    expect(screen.queryByText('Longbows')).toBeNull()
    fireEvent.click(screen.getByText('Medieval grain storage'))
    expect(screen.getByText(/not part of your world/)).toBeTruthy()
    expect(screen.getByText('Granaries were raised on stones.')).toBeTruthy()
  })
  it('moves a reference into lore and deletes one, after confirming', () => {
    const store = makeStore()
    render(<References store={store} initialEntryId="r1" />)
    fireEvent.click(screen.getByText('Move to Lore'))
    expect(store.convertReferenceToLore).toHaveBeenCalledWith('r1')
    expect(screen.getByText('Moved into Lore.')).toBeTruthy()
    cleanup()
    const other = makeStore()
    render(<References store={other} initialEntryId="r2" />)
    fireEvent.click(screen.getByText('Delete'))
    expect(other.deleteLoreEntry).toHaveBeenCalledWith('r2')
  })
  it('does nothing when the confirmation is declined', () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const store = makeStore()
    render(<References store={store} initialEntryId="r1" />)
    fireEvent.click(screen.getByText('Move to Lore'))
    fireEvent.click(screen.getByText('Delete'))
    expect(store.convertReferenceToLore).not.toHaveBeenCalled()
    expect(store.deleteLoreEntry).not.toHaveBeenCalled()
  })
  it('disables editing in a read-only project and invites the first reference when empty', () => {
    render(<References store={makeStore({ readOnly: true, referenceEntries: [] })} />)
    expect(screen.getByText('Keep your research here')).toBeTruthy()
    expect(screen.getAllByText('New').every(button => button.closest('button').disabled)).toBe(true)
  })
})

describe('References drawer', () => {
  it('opens a reference, goes back, and adds a new one without leaving the page', () => {
    const store = makeStore()
    render(<ReferencesDrawer store={store} onClose={vi.fn()} onOpenRoom={vi.fn()} />)
    fireEvent.click(screen.getByText('Medieval grain storage'))
    expect(screen.getByText('Granaries were raised on stones.')).toBeTruthy()
    fireEvent.click(screen.getByText('← All references'))
    fireEvent.click(screen.getByText('New'))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Rope making' } })
    fireEvent.submit(screen.getByRole('form', { name: 'New reference' }))
    expect(store.addReference).toHaveBeenCalledWith(expect.objectContaining({ title: 'Rope making' }))
  })
  it('closes on Escape and from the backdrop, and can open the room on the shown reference', () => {
    const onClose = vi.fn()
    const onOpenRoom = vi.fn()
    render(<ReferencesDrawer store={makeStore()} onClose={onClose} onOpenRoom={onOpenRoom} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getAllByLabelText('Close references')[0])
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByText('Medieval grain storage'))
    fireEvent.click(screen.getByText('Open in References'))
    expect(onOpenRoom).toHaveBeenCalledWith('r1')
  })
  it('is a modal dialog, moves focus in, keeps Tab inside, and returns focus to the opener on close', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { unmount } = render(<ReferencesDrawer store={makeStore()} onClose={vi.fn()} onOpenRoom={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'References' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(document.activeElement)).toBe(true)
    const last = [...dialog.querySelectorAll('button, input')].filter(el => !el.disabled && el.tabIndex >= 0).pop()
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
