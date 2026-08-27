import { useCallback, useEffect, useRef } from 'react'
import { useTextareaCaretRect } from './useTextareaCaretRect.js'

export function getCaretScrollDelta({
  caretTop, caretHeight, containerTop, containerHeight,
  topFraction = 0.35, bottomFraction = 0.65,
}) {
  const topBoundary = containerTop + containerHeight * topFraction
  const bottomBoundary = containerTop + containerHeight * bottomFraction
  const caretBottom = caretTop + caretHeight
  if (caretTop < topBoundary) return caretTop - topBoundary
  if (caretBottom > bottomBoundary) return caretBottom - bottomBoundary
  return 0
}

// Used only by the regular (non-Focused-Writing) editor's `gentle` correction
// below — deliberately much wider than the 35/65 band above so it only fires
// when the caret is genuinely near/off the edge (a safety net for gaps in the
// browser's own native "scroll caret into view," see the effect below), never
// to recenter. Pass 4 (2026-08-07 ROADMAP row) regressed by turning on the
// *tight* band's continuous correction broadly — reusing that band here for
// every keystroke in the regular editor would be the same mistake again.
const GENTLE_TOP_FRACTION = 0.08
const GENTLE_BOTTOM_FRACTION = 0.92

// measureCaret (useTextareaCaretRect.js) mirrors every character before the
// caret into a hidden div and reads its layout back — the same full-document
// reflow that made typing laggy before it was debounced in this file's sibling
// caller (SceneEditor.jsx's syncFloatingNoteButton). This hook's `schedule` used
// to run that measurement on every 'input' event completely undebounced (just
// deferred two animation frames, which doesn't coalesce anything at normal
// typing speed since keystrokes land tens of ms apart, in different frames) —
// on a large scene that reintroduced the exact per-keystroke reflow cost.
// A trailing-only debounce (like syncFloatingNoteButton's) is wrong here
// though: the whole point of this hook is to keep the caret on screen *while*
// typing, so waiting for a pause before moving it would mean the caret drifts
// off screen for the length of a typing burst. Throttle instead — run the real
// measurement at most once per THROTTLE_MS (leading edge, so it still tracks
// in near real time) with one trailing catch-up so the final position is never
// stale once typing stops.
const THROTTLE_MS = 120

export function useCaretComfortScroll({ textareaRef, scrollContainerRef, enabled, focused = false, scale = 1 }) {
  const measureCaret = useTextareaCaretRect(textareaRef, scale)
  const frameRef = useRef(null)
  const composingRef = useRef(false)
  const selectingRef = useRef(false)
  const lastRunAtRef = useRef(0)
  const trailingTimerRef = useRef(null)

  const applyCorrection = useCallback((options) => {
    lastRunAtRef.current = Date.now()
    const textarea = textareaRef.current
    const container = scrollContainerRef.current || textarea?.closest('.ms-scroll-container')
    if (!textarea || !container || document.activeElement !== textarea) return

    const caret = measureCaret()
    if (!caret) return
    const containerRect = container.getBoundingClientRect()
    const delta = getCaretScrollDelta({
      caretTop: caret.top,
      caretHeight: caret.height,
      containerTop: containerRect.top,
      containerHeight: container.clientHeight,
      ...(options?.gentle ? { topFraction: GENTLE_TOP_FRACTION, bottomFraction: GENTLE_BOTTOM_FRACTION } : {}),
    })

    if (Math.abs(delta) > 1) {
      // `behavior: 'auto'` means "defer to CSS," not "instant" — and the real
      // scroll container (`.ms-scroll-container` in Manuscript.jsx) carries
      // Tailwind's `scroll-smooth` class (`scroll-behavior: smooth`). So this
      // correction was never actually snapping into place: it was animating
      // there over a few hundred ms, during which the *wrong* (natively
      // jumped-to) position stayed fully visible before slowly sliding to the
      // right one — reads as an even jankier, slower version of the same
      // jump, not a fix. `behavior: 'instant'` explicitly overrides the CSS
      // and always snaps immediately, regardless of the container's own
      // scroll-behavior. Root-caused by logging every step of this function
      // live: the delta was always being computed correctly — this was the
      // one piece actually making it visible.
      container.scrollTo({ top: Math.max(0, container.scrollTop + delta), behavior: 'instant' })
    }
  }, [measureCaret, scrollContainerRef, textareaRef])

  const runDeferred = useCallback((options) => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        applyCorrection(options)
      })
    })
  }, [applyCorrection])

  // `immediate: true` skips both the throttle and the double-rAF defer, running
  // the correction synchronously right where it's called. Reserved for call
  // sites that just explicitly moved the caret via `textarea.setSelectionRange`
  // (SceneEditor.jsx's focusRange) — a programmatic selection change like that
  // can trigger the browser's own "scroll the selection into view" behavior
  // (see the native-scroll comment below), landing in whatever position the
  // browser picks. If our correction is deferred (rAF/throttle) that wrong
  // position gets painted first and our fix lands as a visible second jump a
  // frame or more later. Calling this synchronously, in the same task as the
  // `setSelectionRange` that likely triggered the native scroll, means only the
  // final, correct position ever gets painted. Not used for the general
  // 'input'-driven typing path — that stays throttled (see THROTTLE_MS above)
  // since it can't afford a synchronous reflow measurement on every keystroke.
  //
  // `immediate` deliberately bypasses `enabled` (unlike the throttled path
  // below). `enabled` gates the *continuous* per-keystroke centering, which is
  // a Focused Writing-only feature — turning it on for the regular editor to
  // get this correction made typing there constantly re-center and feel far
  // worse, not better (2026-08-07). This one-shot correction after a discrete,
  // already-infrequent action (a click, Enter, undo/redo, a note insert) isn't
  // that feature; it's a fix for a real browser glitch, so it needs to run in
  // *every* mode regardless of the caret-follow preference.
  // `gentle` (like `immediate`) deliberately bypasses `enabled` — it's the
  // regular editor's wide-comfort-zone correction (see the effect below), a
  // different feature from Focused Writing's continuous tight-band centering
  // that `enabled` gates, not a relaxation of that gate.
  const schedule = useCallback((options) => {
    if (composingRef.current || selectingRef.current) return
    if (!options?.immediate && !options?.gentle && !enabled) return
    clearTimeout(trailingTimerRef.current)
    if (options?.immediate) {
      if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = null }
      applyCorrection(options)
      return
    }
    const elapsed = Date.now() - lastRunAtRef.current
    if (elapsed >= THROTTLE_MS) {
      runDeferred(options)
    } else {
      trailingTimerRef.current = setTimeout(() => runDeferred(options), THROTTLE_MS - elapsed)
    }
  }, [enabled, runDeferred, applyCorrection])

  useEffect(() => {
    if (!enabled) return undefined
    const textarea = textareaRef.current
    if (!textarea) return undefined
    const container = scrollContainerRef.current || textarea.closest('.ms-scroll-container')

    const onCompositionStart = () => { composingRef.current = true }
    const onCompositionEnd = () => { composingRef.current = false; schedule() }
    const onPointerDown = () => { selectingRef.current = true }
    const onPointerUp = () => { selectingRef.current = false; schedule() }
    const onSelectionChange = () => {
      if (document.activeElement === textarea) schedule()
    }

    const events = ['input', 'keyup', 'click', 'mouseup', 'paste']
    events.forEach(event => textarea.addEventListener(event, schedule))
    textarea.addEventListener('compositionstart', onCompositionStart)
    textarea.addEventListener('compositionend', onCompositionEnd)
    textarea.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    document.addEventListener('selectionchange', onSelectionChange)

    // The browser natively scrolls a focused textarea's caret into view on
    // keyboard navigation (End/Home/arrows) with its own animation that
    // isn't governed by this container's `scroll-behavior` CSS, so it can
    // still run — and win — after `schedule()` has already centered the
    // caret. Once that native scroll settles, re-run the comfort-zone check
    // once to correct for it, rather than fighting it mid-animation.
    let settleTimer = null
    const onContainerScroll = () => {
      if (selectingRef.current) return
      clearTimeout(settleTimer)
      settleTimer = setTimeout(schedule, 180)
    }
    container?.addEventListener('scroll', onContainerScroll)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      clearTimeout(settleTimer)
      clearTimeout(trailingTimerRef.current)
      events.forEach(event => textarea.removeEventListener(event, schedule))
      textarea.removeEventListener('compositionstart', onCompositionStart)
      textarea.removeEventListener('compositionend', onCompositionEnd)
      textarea.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      document.removeEventListener('selectionchange', onSelectionChange)
      container?.removeEventListener('scroll', onContainerScroll)
    }
  }, [enabled, schedule, textareaRef, scrollContainerRef])

  // The regular (non-Focused-Writing) editor: everything above is gated
  // behind `enabled` (Focused Writing's continuous tight-band centering), so
  // historically the regular editor got *no* correction of any kind outside
  // the one-shot `immediate` calls `focusRange` already makes after a click,
  // Enter, undo/redo, or a note insert. The browser's own native "scroll the
  // caret into view" still runs on every keystroke and on keyboard
  // navigation (Home/End/PageUp/PageDown/arrows) regardless — confirmed live
  // (2026-08-27, this ROADMAP row's pass 8) that it pins the caret hard
  // against the bottom edge of the viewport while typing a burst near the
  // end of a long scene (~96% down, essentially the edge, not a comfortable
  // margin) and leaves it there for every subsequent keystroke since nothing
  // ever nudges it back — a real, distinct gap from the click/Enter jump
  // passes 1-5 already fixed, and a plausible root cause of "typing brings
  // the cursor to the bottom of the page."
  //
  // This is a separate, deliberately much narrower effect than the one
  // above rather than just widening that effect's own `enabled` gate — pass
  // 6 (2026-08-25, documented on this same ROADMAP row) tried exactly that
  // (attach the *same* full listener set — `selectionchange`, the
  // container-scroll settle-timer, `click`/`mouseup` — broadly to the
  // regular editor) and it measurably regressed: laggier typing and
  // "glitchy moments where the whole manuscript disappears." This effect
  // differs on purpose:
  //  - only 'input'/'keyup'/'paste' schedule a correction — those are the
  //    three actions that can trigger the browser's native scroll-into-view
  //    in the first place. No `selectionchange` (fires on essentially every
  //    caret move, including a plain click that's already on screen, and
  //    was very likely most of pass 6's added cost) and no container-scroll
  //    settle-timer (that one exists specifically to catch a native scroll
  //    racing *after* an `immediate` correction — reacting to it here too
  //    would fire on a user's own deliberate manual scroll-to-reread and
  //    silently yank them back to the caret, which is a real, separate
  //    complaint pass 6's own comments already flagged as a risk).
  //  - uses the wide `GENTLE_*` comfort band (see above) via `applyCorrection`'s
  //    `gentle` option, not the tight 35/65 band, so it only fires when the
  //    caret is genuinely near/past the edge — a safety net, not a
  //    recentering feature. Reusing the tight band broadly is exactly pass
  //    4's regression ("way, way worse" — recentering on every keystroke).
  //  - reuses the same accurate mirror-div `measureCaret` (via the shared
  //    `applyCorrection`) already proven correct for Focused Writing and for
  //    every `immediate` correction, not a cheap approximation — pass 7
  //    (2026-08-25) traced its own regression (the editor losing focus,
  //    `selectionEnd` resetting to 0, a jump to the end of the manuscript)
  //    back to exactly that kind of shortcut going wrong once a scene's
  //    textarea height was being grown via the cheap buffer path (see
  //    RESIZE_GROWTH_BUFFER_PX in SceneEditor.jsx) rather than measured
  //    precisely — `measureCaret` anchors off the textarea's own *top* and a
  //    separately-laid-out mirror, not its (possibly inflated) height, so it
  //    stays accurate regardless of that resize path.
  useEffect(() => {
    if (enabled || !focused) return undefined
    const textarea = textareaRef.current
    if (!textarea) return undefined

    const onCompositionStart = () => { composingRef.current = true }
    const onCompositionEnd = () => { composingRef.current = false; schedule({ gentle: true }) }
    const gentleSchedule = () => schedule({ gentle: true })

    const events = ['input', 'keyup', 'paste']
    events.forEach(event => textarea.addEventListener(event, gentleSchedule))
    textarea.addEventListener('compositionstart', onCompositionStart)
    textarea.addEventListener('compositionend', onCompositionEnd)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      clearTimeout(trailingTimerRef.current)
      events.forEach(event => textarea.removeEventListener(event, gentleSchedule))
      textarea.removeEventListener('compositionstart', onCompositionStart)
      textarea.removeEventListener('compositionend', onCompositionEnd)
    }
  }, [enabled, focused, schedule, textareaRef])

  return schedule
}
