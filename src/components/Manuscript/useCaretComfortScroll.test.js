// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { getCaretScrollDelta, useCaretComfortScroll } from './useCaretComfortScroll.js'

describe('getCaretScrollDelta', () => {
  const viewport = { containerTop: 100, containerHeight: 1000, caretHeight: 24 }

  it('does not scroll while the caret is inside the 35–65% comfort zone', () => {
    expect(getCaretScrollDelta({ ...viewport, caretTop: 500 })).toBe(0)
  })

  it('moves upward only as far as the top boundary', () => {
    expect(getCaretScrollDelta({ ...viewport, caretTop: 400 })).toBe(-50)
  })

  it('moves downward only as far as the bottom boundary', () => {
    expect(getCaretScrollDelta({ ...viewport, caretTop: 760 })).toBe(34)
  })
})

// A regression guard for the 2026-08-07 ROADMAP row: `schedule()` used to run
// the full (expensive) caret measurement + scroll on every single 'input'
// event, undebounced — reintroducing the exact per-keystroke reflow cost this
// hook's sibling (syncFloatingNoteButton in SceneEditor.jsx) was already fixed
// for. It's throttled now (leading call + one trailing catch-up per burst,
// see the comment above THROTTLE_MS) instead of debounced, because debouncing
// would leave the caret off screen for the whole length of a typing burst.
describe('useCaretComfortScroll throttling', () => {
  let textarea, container

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    container = document.createElement('div')
    container.className = 'ms-scroll-container'
    // jsdom doesn't implement Element.scrollTo.
    container.scrollTo = () => {}
    textarea = document.createElement('textarea')
    container.appendChild(textarea)
    document.body.appendChild(container)
    textarea.focus()
  })

  afterEach(() => {
    document.body.removeChild(container)
    vi.useRealTimers()
  })

  function flushRaf() {
    // runNow defers two animation frames before doing the real work.
    act(() => { vi.advanceTimersByTime(32) })
  }

  it('runs immediately on the first call in a burst', () => {
    const spy = vi.spyOn(container, 'scrollTo')
    const { result } = renderHook(() => useCaretComfortScroll({
      textareaRef: { current: textarea },
      scrollContainerRef: { current: container },
      enabled: true,
    }))

    act(() => { result.current() })
    flushRaf()

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('coalesces a rapid typing burst into one trailing call instead of one per keystroke', () => {
    const spy = vi.spyOn(container, 'scrollTo')
    const { result } = renderHook(() => useCaretComfortScroll({
      textareaRef: { current: textarea },
      scrollContainerRef: { current: container },
      enabled: true,
    }))

    // Leading call for the burst.
    act(() => { result.current() })
    flushRaf()
    spy.mockClear()

    // 5 keystrokes, 20ms apart (~normal fast-typing cadence) — all land
    // inside the same THROTTLE_MS (120ms) window as the leading call above.
    for (let i = 0; i < 5; i++) {
      act(() => { result.current() })
      act(() => { vi.advanceTimersByTime(20) })
    }
    // Let the trailing catch-up (and its rAF defer) fire.
    act(() => { vi.advanceTimersByTime(150) })

    // Not 20 — the burst collapses to a single trailing measurement.
    expect(spy).toHaveBeenCalledTimes(1)
  })

  // A regression guard for the follow-up 2026-08-07 report ("jumping still
  // happening"): focusRange (SceneEditor.jsx) calls `schedule({ immediate: true })`
  // right after `textarea.setSelectionRange(...)` specifically so the correction
  // isn't deferred behind a rAF/throttle — see the comment on the `immediate`
  // option in useCaretComfortScroll.js.
  it('immediate mode corrects synchronously, without waiting for rAF or the throttle', () => {
    const spy = vi.spyOn(container, 'scrollTo')
    const { result } = renderHook(() => useCaretComfortScroll({
      textareaRef: { current: textarea },
      scrollContainerRef: { current: container },
      enabled: true,
    }))

    act(() => { result.current({ immediate: true }) })

    // No `flushRaf()` / timer advance at all — still applied.
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('immediate mode is not throttled by a preceding call', () => {
    const spy = vi.spyOn(container, 'scrollTo')
    const { result } = renderHook(() => useCaretComfortScroll({
      textareaRef: { current: textarea },
      scrollContainerRef: { current: container },
      enabled: true,
    }))

    act(() => { result.current() })
    flushRaf()
    spy.mockClear()

    // Well within THROTTLE_MS of the previous call — a regular schedule()
    // here would be deferred to a trailing timer, not run right away.
    act(() => { result.current({ immediate: true }) })

    expect(spy).toHaveBeenCalledTimes(1)
  })
})
