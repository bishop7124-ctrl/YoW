import { useDialogFocus } from '../../utils/useDialogFocus'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'

// Some panels (the mobile manuscript structure rail, off-canvas sheets
// elsewhere) stay mounted and correctly sized while closed, moved off the
// visible page with a CSS transform (e.g. `translateX(-101%)`) rather than
// `display: none`. That's invisible to the display/visibility/size checks
// below, and `Element.scrollIntoView()` cannot bring a transformed-away
// element into a viewport it was never laid out in — the browser has
// nothing to scroll. Left unfiltered, `getRect` would confidently return a
// real-looking box that sits almost entirely off-screen (observed live: the
// mobile manuscript rail's own rect at `translateX(-101%)`, width 268, sat
// at x=-270 — only a sliver away from a positive `right`), which is the same
// "spotlight targets blank space" failure mode this file's other visibility
// checks exist to prevent. A plain zero-intersection test isn't enough on
// its own: an element that's 95% off-screen still has a technically-nonzero
// sliver of overlap and would pass it. Require at least half of the
// element's own width *and* height to actually be within the viewport, so a
// bare edge no longer counts as "on screen" — anything short of that falls
// back to the tour's existing no-target behavior (a centered tip, no
// spotlight) instead of a spotlight pointing mostly off-screen.
function isOnScreen(rect) {
  const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0)
  const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)
  return visibleWidth >= rect.width / 2 && visibleHeight >= rect.height / 2
}

function findTourEl(selector, { requireOnScreen = false } = {}) {
  if (!selector) return null
  const selectors = Array.isArray(selector) ? selector : [selector]
  return selectors
    .flatMap(item => [...document.querySelectorAll(`[data-tour="${item}"]`)])
    .find(node => {
      const style = window.getComputedStyle(node)
      const r = node.getBoundingClientRect()
      if (style.display === 'none' || style.visibility === 'hidden') return false
      if (r.width <= 4 || r.height <= 4) return false
      if (requireOnScreen && !isOnScreen(r)) return false
      return true
    })
}

function getRect(selector) {
  const el = findTourEl(selector, { requireOnScreen: true })
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right }
}

const PAD = 14
const TIP_W = 320
const TIP_H_EST = 200

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function placeTip(vpW, vpH, rect) {
  if (!rect) {
    return {
      top: vpH / 2 - TIP_H_EST / 2,
      left: vpW / 2 - TIP_W / 2,
    }
  }
  const gap = 18
  const rightSpace = vpW - rect.right
  const leftSpace = rect.left
  const belowSpace = vpH - rect.bottom
  if (rightSpace >= TIP_W + gap) return { top: clamp(rect.top, PAD, vpH - TIP_H_EST - PAD), left: rect.right + gap }
  if (leftSpace >= TIP_W + gap) return { top: clamp(rect.top, PAD, vpH - TIP_H_EST - PAD), left: rect.left - TIP_W - gap }
  if (belowSpace >= TIP_H_EST + gap) return { top: rect.bottom + gap, left: clamp(rect.left, PAD, vpW - TIP_W - PAD) }
  return {
    top: clamp(rect.top - TIP_H_EST - gap, PAD, vpH - TIP_H_EST - PAD),
    left: clamp(rect.left, PAD, vpW - TIP_W - PAD),
  }
}

export default function OnboardingTour({ steps, onFinish, onSkip, onDisableTours }) {
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState(null)
  const [vpW, setVpW] = useState(window.innerWidth)
  const [vpH, setVpH] = useState(window.innerHeight)
  const step = steps[idx]
  const isLast = idx === steps.length - 1
  const tipRef = useRef(null)

  useLayoutEffect(() => {
    const update = () => {
      setVpW(window.innerWidth)
      setVpH(window.innerHeight)
      setRect(getRect(step.target))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [step.target])

  useEffect(() => {
    if (!step.target) return
    // No `requireOnScreen` here: this effect's whole job is finding a
    // legitimately-off-screen-but-scrollable target and bringing it into
    // view, unlike getRect's spotlight placement above.
    const el = findTourEl(step.target)
    el?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [step.target])

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return
      if (e.key === 'ArrowRight' && !isLast) setIdx(i => i + 1)
      if (e.key === 'ArrowLeft' && idx > 0) setIdx(i => i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isLast, idx, onSkip])

  const dialogRef = useRef(null)
  useDialogFocus(dialogRef, onSkip)

  const tip = placeTip(vpW, vpH, rect)

  return (
    <div ref={dialogRef} tabIndex={-1} className="tour-root" role="dialog" aria-modal="true" aria-label={`Tour: ${step.title}`}>
      {/* Backdrop stays light enough that users can keep their spatial context. */}
      <div className="tour-backdrop" />

      {/* Spotlight cutout with pulsing ring */}
      {rect && (
        <>
          <div
            className="tour-spotlight"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }}
          />
          <div
            className="tour-spotlight-ring"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }}
          />
        </>
      )}

      {/* Tooltip */}
      <div
        ref={tipRef}
        className="tour-tip"
        style={{ top: tip.top, left: tip.left, width: TIP_W }}
        onClick={e => e.stopPropagation()}
      >
        <div className="tour-tip-header">
          <span className="tour-step-count">{idx + 1} / {steps.length}</span>
          <button className="tour-skip" onClick={onSkip} aria-label="Skip tour">Skip tour</button>
        </div>
        <h3 className="tour-tip-title">{step.title}</h3>
        <p className="tour-tip-body">{step.body}</p>
        {onDisableTours && (
          <button className="tour-disable" type="button" onClick={onDisableTours}>
            Turn off all tours
          </button>
        )}
        <div className="tour-tip-footer">
          <div className="tour-dots">
            {steps.map((_, i) => (
              <button
                key={i}
                className={`tour-dot${i === idx ? ' tour-dot--active' : ''}`}
                onClick={() => setIdx(i)}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
          <div className="tour-nav">
            {idx > 0 && (
              <button className="tour-btn tour-btn--ghost" onClick={() => setIdx(i => i - 1)}>Back</button>
            )}
            <button
              className="tour-btn tour-btn--primary"
              onClick={() => isLast ? onFinish?.() : setIdx(i => i + 1)}
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
