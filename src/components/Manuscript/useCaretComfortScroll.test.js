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

  // 2026-08-2x: the regular editor uses a wide (8%/92%) "gentle zone" instead
  // of the tight 35/65 band Focused Writing uses — see GENTLE_ZONE's own
  // comment in useCaretComfortScroll.js for why a tight band there caused a
  // real, previously-shipped-then-reverted regression.
  it('supports a wider comfort band via topFraction/bottomFraction', () => {
    const wide = { topFraction: 0.08, bottomFraction: 0.92 }
    // Inside the tight 35–65% band but still inside the wide 8–92% one:
    // the wide band leaves it alone.
    expect(getCaretScrollDelta({ ...viewport, caretTop: 760, ...wide })).toBe(0)
    // Only once the caret passes the wide band's own boundary does it correct.
    expect(getCaretScrollDelta({ ...viewport, caretTop: 1050, ...wide })).toBe(54)
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

// A regression guard for the reopened 2026-08-07 ROADMAP row: passes 1-5 only
// ever gated the throttled per-keystroke listener setup (and the settle-timer
// that catches a delayed native scroll after a discrete action's `immediate`
// correction) on `enabled` — a Focused Writing-only preference. The regular
// editor therefore had *zero* comfort correction of any kind: nothing ever
// ran during ordinary typing ("cursor brought to the bottom"), and nothing
// caught a native scroll racing in after Enter's correction ("Enter doesn't
// recenter"). `focused` now gates the same effect in addition to `enabled`,
// using GENTLE_ZONE (see getCaretScrollDelta tests above) instead of the tight
// band so this doesn't repeat pass 4's "way, way worse — recentering on every
// keystroke during completely normal typing" regression.
describe('useCaretComfortScroll regular-editor (non-Focused-Writing) correction', () => {
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

  it('attaches the throttled correction listeners when focused, even with the Focused Writing preference off', () => {
    const spy = vi.spyOn(container, 'scrollTo')
    renderHook(() => useCaretComfortScroll({
      textareaRef: { current: textarea },
      scrollContainerRef: { current: container },
      enabled: false,
      focused: true,
    }))

    act(() => { textarea.dispatchEvent(new Event('input')) })
    flushRaf()

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not attach any listeners when neither enabled nor focused', () => {
    const spy = vi.spyOn(container, 'scrollTo')
    renderHook(() => useCaretComfortScroll({
      textareaRef: { current: textarea },
      scrollContainerRef: { current: container },
      enabled: false,
      focused: false,
    }))

    act(() => { textarea.dispatchEvent(new Event('input')) })
    flushRaf()

    expect(spy).not.toHaveBeenCalled()
  })

  // A regression guard raised in this fix's own code review: the container-
  // scroll settle-timer can't tell a native "scroll the selection into view"
  // apart from the user just scrolling the manuscript with the mouse wheel to
  // reread earlier text while the textarea stays focused. Widening it to
  // `focused` (like the rest of this effect) would yank the view back to the
  // caret 180ms after the user stops scrolling to read — exactly what pass 6
  // deliberately avoided (see the 2026-08-07 ROADMAP row). It must stay
  // scoped to `enabled` (Focused Writing) specifically.
  it('does NOT attach the container settle-timer when only focused, not enabled — avoids hijacking a manual reread scroll', () => {
    const spy = vi.spyOn(container, 'scrollTo')
    renderHook(() => useCaretComfortScroll({
      textareaRef: { current: textarea },
      scrollContainerRef: { current: container },
      enabled: false,
      focused: true,
    }))
    flushRaf()
    spy.mockClear()

    act(() => { container.dispatchEvent(new Event('scroll')) })
    act(() => { vi.advanceTimersByTime(180) })
    flushRaf()

    expect(spy).not.toHaveBeenCalled()
  })

  it('does attach the container settle-timer when enabled (Focused Writing)', () => {
    const spy = vi.spyOn(container, 'scrollTo')
    renderHook(() => useCaretComfortScroll({
      textareaRef: { current: textarea },
      scrollContainerRef: { current: container },
      enabled: true,
      focused: true,
    }))
    flushRaf()
    spy.mockClear()

    act(() => { container.dispatchEvent(new Event('scroll')) })
    act(() => { vi.advanceTimersByTime(180) })
    flushRaf()

    expect(spy).toHaveBeenCalledTimes(1)
  })
})
