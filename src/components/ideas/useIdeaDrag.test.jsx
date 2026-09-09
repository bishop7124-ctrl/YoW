// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IdeasKanban from './IdeasKanban.jsx'

beforeEach(() => {
  class Pointer extends MouseEvent {
    constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType || 'mouse' }
  }
  vi.stubGlobal('PointerEvent', Pointer)
  vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(77))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  document.body.style.userSelect = ''; document.body.style.webkitUserSelect = ''
})

const setup = () => {
  const moveIdeaEntry = vi.fn().mockReturnValue({ id: 'a' })
  const store = { activeNovelId: 'n', ideaEntries: [{ id: 'a', title: 'A', status: 'raw' }, { id: 'b', title: 'B', status: 'raw' }], moveIdeaEntry }
  const view = render(<IdeasKanban store={store} />)
  const column = view.container.querySelector('[data-column="raw"]')
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: vi.fn(() => [column]) })
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => column) })
  return { ...view, moveIdeaEntry, start: () => {
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Drag A' }), { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 30, clientY: 30 })
  } }
}

describe('idea drag lifecycle', () => {
  it('commits a same-column move to the end and restores prior selection styles', () => {
    const view = setup()
    document.body.style.userSelect = 'text'
    view.start()
    expect(document.body.style.userSelect).toBe('none')
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 30, clientY: 30 })
    expect(view.moveIdeaEntry).toHaveBeenCalledExactlyOnceWith('a', 'raw', null)
    expect(cancelAnimationFrame).toHaveBeenCalledWith(77)
    expect(document.body.style.userSelect).toBe('text')
  })
  it.each(['pointercancel', 'blur', 'Escape'])('cancels on %s and removes all pending listeners', action => {
    const view = setup()
    view.start()
    if (action === 'pointercancel') fireEvent.pointerCancel(window, { pointerId: 1 })
    else if (action === 'blur') fireEvent.blur(window)
    else fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 30, clientY: 30 })
    expect(view.moveIdeaEntry).not.toHaveBeenCalled()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(77)
    expect(document.body.style.userSelect).toBe('')
  })
  it('cancels on unmount/project departure and ignores subsequent pointer events', () => {
    const view = setup()
    view.start()
    view.unmount()
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 60, clientY: 60 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 60, clientY: 60 })
    expect(view.moveIdeaEntry).not.toHaveBeenCalled()
    expect(document.body.style.userSelect).toBe('')
  })
  it('does not accept pointer-up from another touch', () => {
    const view = setup()
    view.start()
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 30, clientY: 30 })
    expect(view.moveIdeaEntry).not.toHaveBeenCalled()
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 30, clientY: 30 })
    expect(view.moveIdeaEntry).toHaveBeenCalledTimes(1)
  })
})
