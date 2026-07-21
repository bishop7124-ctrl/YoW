import { useCallback, useEffect, useRef } from 'react'
import { useTextareaCaretRect } from './useTextareaCaretRect.js'

export function getCaretScrollDelta({ caretTop, caretHeight, containerTop, containerHeight }) {
  const topBoundary = containerTop + containerHeight * 0.35
  const bottomBoundary = containerTop + containerHeight * 0.65
  const caretBottom = caretTop + caretHeight
  if (caretTop < topBoundary) return caretTop - topBoundary
  if (caretBottom > bottomBoundary) return caretBottom - bottomBoundary
  return 0
}

export function useCaretComfortScroll({ textareaRef, scrollContainerRef, enabled, scale = 1 }) {
  const measureCaret = useTextareaCaretRect(textareaRef, scale)
  const frameRef = useRef(null)
  const composingRef = useRef(false)
  const selectingRef = useRef(false)

  const schedule = useCallback(() => {
    if (!enabled || composingRef.current || selectingRef.current) return
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
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
        })

        if (Math.abs(delta) > 1) {
          container.scrollTo({ top: Math.max(0, container.scrollTop + delta), behavior: 'auto' })
        }
      })
    })
  }, [enabled, measureCaret, scrollContainerRef, textareaRef])

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

  return schedule
}
