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

// A regression guard for the 2026-08-27 ROADMAP row, pass 8: the regular
// (non-Focused-Writing) editor had zero correction of any kind outside the
// one-shot `immediate` calls focusRange already makes — confirmed live that
// typing a burst near the end of a long scene left the native browser
// "scroll caret into view" pinning the caret hard against the viewport edge,
// with nothing ever nudging it back. `focused` (separate from `enabled`)
// gates a much narrower effect that fixes this with a wide "gentle" comfort
// band, reusing the exact same throttled/accurate machinery already proven
// correct for Focused Writing — see the long comment above that effect in
// useCaretComfortScroll.js for why it's deliberately *not* the same broad
// listener set pass 6 tried (and regressed with).
describe('useCaretComfortScroll regular-editor gentle correction', () => {
  let textarea, container

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    container = document.createElement('div')
    container.className = 'ms-scroll-container'
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
    act(() => { vi.advanceTimersByTime(32) })
  }

  it('does nothing when focused but not enabled and no DOM event fires (no continuous polling)', () => {
    const spy = vi.spyOn(container, 'scrollTo')
    renderHook(() => useCaretComfortScroll({
      textareaRef: { current: textarea },
      scrollContainerRef: { current: container },
      enabled: false,
      focused: true,
    }))

    flushRaf()
    act(() => { vi.advanceTimersByTime(500) })

    expect(spy).not.toHaveBeenCalled()
  })

  it('corrects on a real "input" event when focused but not enabled, using the throttled path', () => {
    const spy = vi.spyOn(container, 'scrollTo')
    renderHook(() => useCaretComfortScroll({
      textareaRef: { current: textarea },
      scrollContainerRef: { current: container },
      enabled: false,
      focused: true,
    }))

    act(() => { textarea.dispatchEvent(new Event('input', { bubbles: true })) })
    flushRaf()

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('never attaches its listeners at all when not focused (no scene actively being edited)', () => {
    const spy = vi.spyOn(container, 'scrollTo')
    renderHook(() => useCaretComfortScroll({
      textareaRef: { current: textarea },
      scrollContainerRef: { current: container },
      enabled: false,
      focused: false,
    }))

    act(() => { textarea.dispatchEvent(new Event('input', { bubbles: true })) })
    flushRaf()

    expect(spy).not.toHaveBeenCalled()
  })

})

// getCaretScrollDelta's own topFraction/bottomFraction options (used by the
// regular editor's wide "gentle" band above) — a plain-function guard that a
// caret position outside the tight 35/65 default band, but inside a wider
// custom band, correctly does *not* trigger a correction.
describe('getCaretScrollDelta with a custom comfort-zone band', () => {
  const viewport = { containerTop: 100, containerHeight: 1000, caretHeight: 24 }

  it('does not scroll inside a wide 8%-92% band even where the default 35%-65% band would', () => {
    // caretTop at 80% down the container: outside the default band (would
    // return a nonzero delta) but inside an 8%-92% band.
    const caretTop = 100 + 1000 * 0.80
    expect(getCaretScrollDelta({ ...viewport, caretTop })).not.toBe(0)
    expect(getCaretScrollDelta({ ...viewport, caretTop, topFraction: 0.08, bottomFraction: 0.92 })).toBe(0)
  })

  it('still scrolls once the caret is genuinely past a wide band', () => {
    const caretTop = 100 + 1000 * 0.97
    expect(getCaretScrollDelta({ ...viewport, caretTop, topFraction: 0.08, bottomFraction: 0.92 })).not.toBe(0)
  })
})
