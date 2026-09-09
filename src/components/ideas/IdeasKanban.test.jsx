// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IdeasKanban from './IdeasKanban.jsx'
import ConvertModal from './ConvertModal.jsx'
import QuickCapture from './QuickCapture.jsx'
import { streamMessage } from '../../utils/aiApi'
import { loadAiSettings } from '../../utils/aiSettings'

vi.mock('../../utils/aiApi', () => ({ streamMessage: vi.fn() }))
vi.mock('../../utils/aiSettings', () => ({ loadAiSettings: vi.fn() }))
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.mocked(loadAiSettings).mockReturnValue({ activeProvider: 'google', google: { apiKey: 'test-only', model: 'test' } })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks() })
const entries = [{ id: 'a', title: 'Idea A', description: 'Saved body', status: 'raw', tags: ['first'] }, { id: 'b', title: 'Idea B', status: 'developing' }]
const makeStore = (overrides = {}) => ({
  activeNovelId: 'n', activeNovel: { id: 'n', type: 'novel' }, ideaEntries: entries,
  addIdeaEntry: vi.fn(data => ({ id: 'new', ...data })),
  updateIdeaEntry: vi.fn((id, data) => ({ ...entries.find(idea => idea.id === id), id, ...data })),
  moveIdeaEntry: vi.fn(), deleteIdeaEntry: vi.fn().mockReturnValue(true), ...overrides,
})
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const openA = () => fireEvent.click(screen.getByRole('button', { name: 'Idea A', exact: true }))

describe('Ideas Board', () => {
  it('keeps failed captures and pending tags, then clears them only after a successful save', () => {
    const onAdd = vi.fn().mockReturnValueOnce(null).mockReturnValue({ id: 'new' })
    render(<QuickCapture onAdd={onAdd} allTags={[]} />)
    change('Capture an idea', 'Keep me')
    fireEvent.click(screen.getByTitle('Add tags'))
    change('Capture tags', '# Pending Tag ')
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }))
    expect(onAdd).toHaveBeenLastCalledWith('Keep me', ['pending-tag'])
    expect(screen.getByRole('alert').textContent).toContain('still here')
    expect(screen.getByLabelText('Capture an idea').value).toBe('Keep me')
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }))
    expect(screen.getByLabelText('Capture an idea').value).toBe('')
  })

  it('creates in the chosen column and retains refused drafts behind the discard guard', () => {
    const store = makeStore({ addIdeaEntry: vi.fn().mockReturnValue(null) })
    render(<IdeasKanban store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add idea to Developing' }))
    change('Title', 'New development')
    change('Add tag', 'pending')
    fireEvent.click(screen.getByRole('button', { name: 'Save idea' }))
    expect(store.addIdeaEntry).toHaveBeenCalledWith(expect.objectContaining({ title: 'New development', status: 'developing', tags: ['pending'] }))
    expect(screen.getByLabelText('Title').value).toBe('New development')
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save', exact: true }))
    expect(screen.getByRole('alert').textContent).toContain('still here')
  })

  it('does not replace drafts on background updates, saves only changed fields and resets on project switch', () => {
    const store = makeStore()
    const view = render(<IdeasKanban store={store} />)
    openA()
    change('Description', 'My unsaved words')
    view.rerender(<IdeasKanban store={{ ...store, ideaEntries: [{ ...entries[0], title: 'Remote title', description: 'Remote body' }, entries[1]] }} />)
    expect(screen.getByLabelText('Description').value).toBe('My unsaved words')
    fireEvent.click(screen.getByRole('button', { name: 'Save idea' }))
    expect(store.updateIdeaEntry).toHaveBeenCalledWith('a', { description: 'My unsaved words' }, { expected: { description: 'Saved body' } })
    view.rerender(<IdeasKanban store={{ ...store, activeNovelId: 'other' }} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Capture an idea').value).toBe('')
  })

  it('keeps typed links with colliding IDs independent and saves button-only changes', () => {
    const store = makeStore({ characters: [{ id: 'x', name: 'Shared' }], locations: [{ id: 'x', name: 'Shared' }] })
    render(<IdeasKanban store={store} />)
    openA()
    change('Search links', 'Shared')
    fireEvent.click(screen.getByRole('button', { name: 'character: Shared' }))
    change('Search links', 'Shared')
    fireEvent.click(screen.getByRole('button', { name: 'location: Shared' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove character link Shared' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save', exact: true }))
    expect(store.updateIdeaEntry).toHaveBeenCalledWith('a', { linkedEntities: [{ id: 'x', type: 'location', name: 'Shared' }] }, { expected: { linkedEntities: [] } })
  })

  it('makes Cancel a genuine deletion cancellation and retains refused deletion', () => {
    const store = makeStore({ deleteIdeaEntry: vi.fn().mockReturnValue(false) })
    render(<IdeasKanban store={store} />)
    const card = screen.getByRole('button', { name: 'Idea A', exact: true }).closest('article')
    fireEvent.click(within(card).getByRole('button', { name: 'Delete', exact: true }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(store.deleteIdeaEntry).not.toHaveBeenCalled()
    fireEvent.click(within(card).getByRole('button', { name: 'Delete', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete from this project' }))
    expect(store.deleteIdeaEntry).toHaveBeenCalledExactlyOnceWith('a', { scope: 'current' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('could not be deleted')
  })

  it('shows numeric/unknown-status imports, all tag options, and recovers a removed tag filter', () => {
    const store = makeStore({ ideaEntries: [{ id: 'n', title: 42, status: '__proto__', tags: Array.from({ length: 12 }, (_, i) => `tag${i}`) }] })
    const view = render(<IdeasKanban store={store} />)
    expect(screen.getByRole('button', { name: '42', exact: true })).toBeTruthy()
    expect(within(screen.getByLabelText('Filter ideas by tag')).getAllByRole('option')).toHaveLength(13)
    change('Filter ideas by tag', 'tag11')
    view.rerender(<IdeasKanban store={{ ...store, ideaEntries: [{ id: 'n', title: 42, status: '__proto__', tags: [] }] }} />)
    expect(screen.getByLabelText('Filter ideas by tag').value).toBe('')
    change('Sort ideas', 'newest')
    expect(screen.getByRole('button', { name: 'Drag 42' }).disabled).toBe(true)
  })

  it('disables every write in read-only mode but still opens full idea details', () => {
    const store = makeStore({ readOnly: true })
    render(<IdeasKanban store={store} />)
    expect(screen.getByLabelText('Capture an idea').disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Add favourite Idea A' }).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Delete', exact: true })).toBeNull()
    openA()
    expect(screen.getByLabelText('Description').readOnly).toBe(true)
    expect(screen.queryByRole('button', { name: 'Save idea' })).toBeNull()
    expect(store.updateIdeaEntry).not.toHaveBeenCalled()
  })

  it('does not replace an open draft when AI completes and requires explicit preview acceptance', async () => {
    let callbacks
    vi.mocked(streamMessage).mockImplementation(async options => { callbacks = options })
    const store = makeStore()
    render(<IdeasKanban store={store} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'AI expand', exact: true })[0])
    openA()
    change('Description', 'Unsaved draft')
    await act(async () => { callbacks.onChunk('Suggested text'); callbacks.onDone() })
    expect(screen.getByLabelText('Description').value).toBe('Unsaved draft')
    expect(screen.getByRole('button', { name: 'Review suggestion' }).disabled).toBe(true)
    expect(store.updateIdeaEntry).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Review suggestion' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace', exact: true }))
    expect(store.updateIdeaEntry).toHaveBeenCalledWith('a', { description: 'Suggested text', aiExpanded: true }, { expected: { title: 'Idea A', description: 'Saved body' } })
  })

  it('aborts AI on project switch and ignores all late completions', async () => {
    let callbacks
    vi.mocked(streamMessage).mockImplementation(async options => { callbacks = options })
    const store = makeStore()
    const view = render(<IdeasKanban store={store} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'AI expand', exact: true })[0])
    view.rerender(<IdeasKanban store={{ ...store, activeNovelId: 'other' }} />)
    expect(callbacks.signal.aborted).toBe(true)
    await act(async () => { callbacks.onChunk('Late result'); callbacks.onDone() })
    expect(screen.queryByText('AI suggestion ready.')).toBeNull()
    expect(store.updateIdeaEntry).not.toHaveBeenCalled()
  })

  it('clears the preview dialog when its suggestion is dismissed', async () => {
    vi.mocked(streamMessage).mockImplementationOnce(async options => { options.onChunk('Suggestion'); options.onDone() })
    render(<IdeasKanban store={makeStore()} />)
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'AI expand', exact: true })[0]) })
    fireEvent.click(screen.getByRole('button', { name: 'Review suggestion' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss suggestion' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    openA()
    expect(screen.getByLabelText('Description').value).toBe('Saved body')
  })

  it('retains refused AI suggestions and handles empty responses and thrown requests', async () => {
    vi.mocked(streamMessage).mockImplementationOnce(async options => { options.onChunk('Suggestion'); options.onDone() })
    const store = makeStore({ updateIdeaEntry: vi.fn().mockReturnValue(null) })
    render(<IdeasKanban store={store} />)
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'AI expand', exact: true })[0]) })
    fireEvent.click(screen.getByRole('button', { name: 'Review suggestion' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace', exact: true }))
    expect(screen.getByText('Suggestion')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('changed')
    fireEvent.click(screen.getByRole('button', { name: 'Reject', exact: true }))
    vi.mocked(streamMessage).mockImplementationOnce(async options => options.onDone())
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'AI expand', exact: true })[0]) })
    expect(screen.getByRole('alert').textContent).toContain('no suggestion')
    vi.mocked(streamMessage).mockRejectedValueOnce(new Error('test'))
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'AI expand', exact: true })[0]) })
    expect(screen.getByRole('alert').textContent).toContain('failed')
  })
})

describe('idea conversion', () => {
  it.each([
    { ideaEntries: [] },
    { ideaEntries: [{ ...entries[0], description: 'Updated elsewhere' }] },
    { ideaEntries: [{ ...entries[0], convertedTo: { type: 'character', id: 'existing' } }] },
  ])('does not create from a missing, changed or already-converted source ($ideaEntries)', ({ ideaEntries }) => {
    const store = makeStore({ saveCharacter: vi.fn() })
    const view = render(<ConvertModal idea={entries[0]} store={store} onConverted={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Character', exact: true }))
    view.rerender(<ConvertModal idea={entries[0]} store={{ ...store, ideaEntries }} onConverted={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Convert & Link' }))
    expect(screen.getByRole('alert').textContent).toContain('source idea changed')
    expect(store.saveCharacter).not.toHaveBeenCalled()
  })

  it('creates a chapter using the real ID and plain title, preserving the synopsis', () => {
    const store = makeStore({ acts: [{ id: 'later', order: 2 }, { id: 'first', order: 0 }], addChapter: vi.fn().mockReturnValue({ id: 'real-chapter' }) })
    const onConverted = vi.fn().mockReturnValue(true)
    render(<ConvertModal idea={entries[0]} store={store} onConverted={onConverted} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chapter', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Convert & Link' }))
    expect(store.addChapter).toHaveBeenCalledExactlyOnceWith('first', 'Idea A', { synopsis: 'Saved body' })
    expect(onConverted).toHaveBeenCalledExactlyOnceWith({ type: 'chapter', id: 'real-chapter', name: 'Idea A' })
  })
  it('retries only linking after partial failure and does not create a duplicate entity', () => {
    const store = makeStore({ saveCharacter: vi.fn().mockReturnValue('real-character') })
    const onConverted = vi.fn().mockReturnValueOnce(null).mockReturnValue(true)
    const onClose = vi.fn()
    render(<ConvertModal idea={entries[0]} store={store} onConverted={onConverted} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Character', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Convert & Link' }))
    expect(screen.getByRole('alert').textContent).toContain('without creating a duplicate')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry link' }))
    expect(store.saveCharacter).toHaveBeenCalledTimes(1)
    expect(onConverted).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('rejects chapter creation without an act and hides disabled destination sections', () => {
    const store = makeStore({ activeNovel: { id: 'n', enabledSections: ['outline'] }, acts: [], addChapter: vi.fn() })
    render(<ConvertModal idea={entries[0]} store={store} onConverted={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Character', exact: true })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Chapter', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Convert & Link' }))
    expect(screen.getByRole('alert').textContent).toContain('Create an act')
    expect(store.addChapter).not.toHaveBeenCalled()
  })
})
