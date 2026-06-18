import { useState, useEffect, useLayoutEffect, useRef } from 'react'

function getRect(selector) {
  if (!selector) return null
  const el = document.querySelector(`[data-tour="${selector}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right }
}

const PAD = 14
const TIP_W = 320
const TIP_H_EST = 200

function placeTip(vpW, vpH) {
  return {
    top: vpH / 2 - TIP_H_EST / 2,
    left: vpW / 2 - TIP_W / 2,
  }
}

export default function OnboardingTour({ steps, onFinish, onSkip }) {
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
    const el = document.querySelector(`[data-tour="${step.target}"]`)
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

  const tip = placeTip(vpW, vpH)

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label={`Tour: ${step.title}`}>
      {/* Dark backdrop — not clickable to dismiss; user must use Skip or Done */}
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
