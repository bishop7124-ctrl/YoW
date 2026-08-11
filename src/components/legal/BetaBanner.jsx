import { useState, useEffect } from 'react'
import BetaInterestModal from '../account/BetaInterestModal'

// BETA: remove this entire file and its usages in App.jsx when out of beta
const STORAGE_KEY = 'yow_beta_acknowledged'

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 10000,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  card: {
    background: 'var(--bg-nav, #1a1c1b)',
    border: '1px solid var(--border, #2d302b)',
    borderRadius: 14,
    width: 'min(480px, 100%)',
    boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
    overflow: 'hidden',
  },
  header: {
    padding: '18px 22px 16px',
    borderBottom: '1px solid var(--border, #2d302b)',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  badge: {
    fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
    color: 'var(--bg-main, #101211)',
    background: 'var(--accent, #b8aa79)',
    borderRadius: 4, padding: '3px 7px', textTransform: 'uppercase',
  },
  title: {
    fontSize: 15, fontWeight: 700,
    color: 'var(--text-main, #e4dfd2)',
  },
  body: {
    padding: '20px 22px',
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  text: {
    fontSize: 13, color: 'var(--text-muted, #8f9288)', lineHeight: 1.65, margin: 0,
  },
  expandBtn: {
    background: 'none', border: 'none', padding: 0,
    color: 'var(--accent, #b8aa79)', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', textDecoration: 'underline', textAlign: 'left',
    fontFamily: 'inherit',
  },
  details: {
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid var(--border, #2d302b)',
    borderRadius: 8, padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  detailItem: {
    fontSize: 12, color: 'var(--text-muted, #8f9288)', lineHeight: 1.6, margin: 0,
  },
  detailLabel: {
    fontWeight: 700, color: 'var(--text-main, #e4dfd2)',
  },
  footer: {
    padding: '0 22px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
  },
  dismissBtn: {
    padding: '9px 16px', borderRadius: 7,
    border: '1px solid var(--border, #2d302b)',
    background: 'transparent',
    color: 'var(--text-muted, #8f9288)',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  acceptBtn: {
    padding: '9px 22px', borderRadius: 7, border: 'none',
    background: 'var(--accent, #b8aa79)',
    color: 'var(--bg-main, #101211)',
    fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
  },
}

export default function BetaBanner({ user, onGetStarted, onGranted }) {
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [interestOpen, setInterestOpen] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
  }, [])

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  const openInterest = () => {
    accept()
    setInterestOpen(true)
  }

  return (
    <>
      {visible && (
        <div style={s.overlay}>
          <div style={s.card} role="dialog" aria-modal="true" aria-label="Beta disclaimer">
            <div style={s.header}>
              <span style={s.badge}>Beta</span>
              <span style={s.title}>You're using an early version</span>
            </div>
            <div style={s.body}>
              <p style={s.text}>
                YOW is currently in beta. Features are being actively developed and some things may
                change, break, or behave unexpectedly. Your feedback during this period helps shape
                the product.
              </p>
              <p style={s.text}>
                Want in? Beta spots can be claimed by registering your interest for a paid plan
                and you'll get full access to every feature at no cost until launch.
              </p>
              {!expanded && (
                <button style={s.expandBtn} onClick={() => setExpanded(true)}>
                  What does beta mean for me?
                </button>
              )}
              {expanded && (
                <div style={s.details}>
                  <p style={s.detailItem}>
                    <span style={s.detailLabel}>Data & stability — </span>
                    Your work is saved, but you may encounter bugs or UI rough edges. We recommend
                    keeping your own backups of critical writing during this period.
                  </p>
                  <p style={s.detailItem}>
                    <span style={s.detailLabel}>Features — </span>
                    Some features are incomplete or subject to change. Pricing, plan limits, and
                    capabilities may shift before the full release.
                  </p>
                  <p style={s.detailItem}>
                    <span style={s.detailLabel}>Feedback — </span>
                    Found a bug or have a suggestion? Use the Help &amp; Feedback option in the app.
                    We read everything.
                  </p>
                </div>
              )}
            </div>
            <div style={s.footer}>
              <button style={s.dismissBtn} onClick={accept}>
                Got it, let me in
              </button>
              <button style={s.acceptBtn} onClick={openInterest}>
                Register interest and sign up
              </button>
            </div>
          </div>
        </div>
      )}
      <BetaInterestModal
        open={interestOpen}
        user={user}
        onClose={() => setInterestOpen(false)}
        onGranted={onGranted}
        onCreateAccount={!user ? (email) => { setInterestOpen(false); onGetStarted?.(email) } : undefined}
      />
    </>
  )
}
