// Personal Monzo.me-style tip link — not part of the Stripe/billing system.
// One shared component so the link/label/styling stays consistent everywhere
// it's shown (footers, pricing page, info popups).
export const MONZO_SUPPORT_URL = 'https://monzo.com/pay/r/your-own-world_SoCBPDb76nMXgr'

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
        href={MONZO_SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...bannerStyle, ...style }}
      >
        <span style={{ fontSize: 28, flexShrink: 0 }} aria-hidden="true">💛</span>
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
          Tip on Monzo →
        </span>
      </a>
    )
  }

  return (
    <a
      href={MONZO_SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...pillStyle, ...style }}
    >
      <span aria-hidden="true">💛</span>
      {label || 'Support development'}
    </a>
  )
}
