import { useState, useEffect, useLayoutEffect, useRef } from 'react'

function getRect(selector) {
  if (!selector) return null
  const selectors = Array.isArray(selector) ? selector : [selector]
  const el = selectors
    .flatMap(item => [...document.querySelectorAll(`[data-tour="${item}"]`)])
    .find(node => {
      const style = window.getComputedStyle(node)
      const r = node.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 4 && r.height > 4
    })
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
    const selectors = Array.isArray(step.target) ? step.target : [step.target]
    const el = selectors
      .flatMap(item => [...document.querySelectorAll(`[data-tour="${item}"]`)])
      .find(node => {
        const r = node.getBoundingClientRect()
        return r.width > 4 && r.height > 4
      })
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [step.target])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onSkip?.()
      if (e.key === 'ArrowRight' && !isLast) setIdx(i => i + 1)
      if (e.key === 'ArrowLeft' && idx > 0) setIdx(i => i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isLast, idx, onSkip])

  const tip = placeTip(vpW, vpH, rect)

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label={`Tour: ${step.title}`}>
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
