import { useState } from 'react'

// Personal Ko-fi tip page — open amount, card payment, not part of the
// Stripe/billing system. One shared component so the link/label/styling
// stays consistent everywhere it's shown (footers, pricing page, info popups).
export const KOFI_SUPPORT_URL = 'https://ko-fi.com/yourownworld'
export const FLOATING_SUPPORT_MINIMIZED_KEY = 'yow:floating-support-minimized'

const pillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 12px',
  borderRadius: 999,
  border: '1px solid var(--accent)',
  color: 'var(--accent)',
  background: 'transparent',
  fontSize: '0.78rem',
  fontWeight: 700,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

const bannerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '20px 24px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  textDecoration: 'none',
  color: 'inherit',
  flexWrap: 'wrap',
}

/**
 * @param {'pill'|'banner'} variant - 'pill' for footers/nav/popups, 'banner' for a
 *   standalone prominent call-out section (e.g. the pricing page).
 * @param {string} [label] - override the default link text.
 */
export default function SupportDevelopmentLink({ variant = 'pill', label, style }) {
  if (variant === 'banner') {
    return (
      <a
        href={KOFI_SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...bannerStyle, ...style }}
      >
        <span style={{ fontSize: 28, flexShrink: 0 }} aria-hidden="true">☕</span>
        <span style={{ flex: '1 1 260px' }}>
          <strong style={{ display: 'block', fontSize: 15, color: 'var(--text-main)', marginBottom: 4 }}>
            {label || 'Help support YOW development'}
          </strong>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            YOW is built and run independently — if it's helping your writing, a one-off tip goes straight toward keeping it growing.
          </span>
        </span>
        <span style={{
          flexShrink: 0, padding: '9px 18px', borderRadius: 8,
          border: '1px solid var(--accent)', color: 'var(--accent)',
          fontSize: '0.85rem', fontWeight: 700,
        }}>
          Buy me a coffee →
        </span>
      </a>
    )
  }

  return (
    <a
      href={KOFI_SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...pillStyle, ...style }}
    >
      <span aria-hidden="true">☕</span>
      {label || 'Support development'}
    </a>
  )
}

function loadMinimizedPreference() {
  try {
    return localStorage.getItem(FLOATING_SUPPORT_MINIMIZED_KEY) === '1'
  } catch {
    return false
  }
}

function CoffeeIcon() {
  return (
    <svg className="floating-support-coffee-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M5 8.5h11v5.25A4.25 4.25 0 0 1 11.75 18h-2.5A4.25 4.25 0 0 1 5 13.75V8.5Z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M4 20h14" />
      <path d="M8 5.5c0-1 1-1 1-2M12 5.5c0-1 1-1 1-2" />
    </svg>
  )
}

export function FloatingSupportLink() {
  const [minimized, setMinimized] = useState(loadMinimizedPreference)

  const updateMinimized = (nextValue) => {
    setMinimized(nextValue)
    try {
      localStorage.setItem(FLOATING_SUPPORT_MINIMIZED_KEY, nextValue ? '1' : '0')
    } catch {
      // The control still works for this visit when storage is unavailable.
    }
  }

  if (minimized) {
    return (
      <button
        type="button"
        className="floating-support-link is-minimized"
        onClick={() => updateMinimized(false)}
        aria-label="Expand Buy me a coffee link"
        title="Buy me a coffee"
      >
        <CoffeeIcon />
      </button>
    )
  }

  return (
    <div className="floating-support-link" role="group" aria-label="Support YOW development">
      <a href={KOFI_SUPPORT_URL} target="_blank" rel="noopener noreferrer">
        <CoffeeIcon />
        <span>Buy me a coffee</span>
      </a>
      <button
        type="button"
        onClick={() => updateMinimized(true)}
        aria-label="Minimise Buy me a coffee link"
        title="Minimise"
      >
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
