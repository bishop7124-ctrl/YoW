import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'

function MenuIcon({ name }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  const paths = {
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.8 2.8 0 0 1 5.1 1.6c0 2.1-2.6 2.3-2.6 4" /><path d="M12 18h.01" /></>,
    about: <><circle cx="12" cy="12" r="9" /><path d="M12 10v6" /><path d="M12 7h.01" /></>,
    legal: <><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4" /><path d="M9 12h6" /><path d="M9 16h4" /></>,
    back: <><path d="M15 18l-6-6 6-6" /></>,
    signout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 5v14" /></>,
  }
  return <svg {...common}>{paths[name] || paths.account}</svg>
}

export default function UserMenu({ onOpenAccount, onOpenHelp, onOpenLegal, onOpenAbout }) {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState('main')
  const [coords, setCoords] = useState(null)
  const rootRef = useRef(null)
  const popoverRef = useRef(null)

  // Popover is portaled to <body> and positioned via fixed coords, because the
  // in-project header (.studio-spine) clips overflow to keep the app chrome
  // compact on mobile — an absolutely-positioned descendant would get clipped
  // to that 72-96px-tall header instead of floating above the page.
  const updateCoords = () => {
    const rect = rootRef.current?.querySelector('.user-menu-trigger')?.getBoundingClientRect()
    if (!rect) return
    setCoords({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) })
  }

  useEffect(() => {
    if (!open) return undefined
    updateCoords()
    window.addEventListener('resize', updateCoords)
    window.addEventListener('scroll', updateCoords, true)
    return () => {
      window.removeEventListener('resize', updateCoords)
      window.removeEventListener('scroll', updateCoords, true)
    }
  }, [open])

  useEffect(() => {
    const handler = (e) => {
      if (rootRef.current?.contains(e.target)) return
      if (popoverRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open) setPanel('main')
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  if (!user) return null

  const metadata = user.user_metadata || {}
  const displayName = metadata.full_name || metadata.name || metadata.alias || metadata.writer_alias || user.displayName || user.email
  const avatarUrl = metadata.avatar_url || user.photoURL
  const initial = (displayName || '?')[0].toUpperCase()
  const legalItems = [
    ['privacy', 'Privacy'],
    ['terms', 'Terms'],
    ['ethics', 'AI ethics'],
    ['beta', 'Beta notice'],
    ['cookies', 'Cookie settings'],
  ]

  return (
    <div className="user-menu-root" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="user-menu-trigger"
        title={displayName || user.email}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="user-menu-avatar" referrerPolicy="no-referrer" />
        ) : (
          <span className="user-menu-avatar user-menu-avatar-fallback">
            {initial}
          </span>
        )}
        <span className="user-menu-trigger-name">
          {displayName || user.email}
        </span>
        <span className="user-menu-trigger-caret" aria-hidden="true" />
      </button>

      {open && coords && createPortal(
        <div
          className="user-menu-popover user-menu-popover-portal"
          ref={popoverRef}
          role="menu"
          aria-label="Account menu"
          style={{ top: coords.top, right: coords.right }}
        >
          {panel === 'main' ? (
            <>
              <div className="user-menu-profile">
                <span className="user-menu-profile-name">{displayName || 'Account'}</span>
                <span className="user-menu-profile-email">{user.email}</span>
              </div>
              <div className="user-menu-section">
                {onOpenAccount && (
                  <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenAccount() }} className="user-menu-item">
                    <MenuIcon name="account" />
                    <span>Account settings</span>
                  </button>
                )}
                {onOpenHelp && (
                  <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenHelp() }} className="user-menu-item">
                    <MenuIcon name="help" />
                    <span>Help and support</span>
                  </button>
                )}
                {onOpenAbout && (
                  <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenAbout() }} className="user-menu-item">
                    <MenuIcon name="about" />
                    <span>About YOW</span>
                  </button>
                )}
                {onOpenLegal && (
                  <button type="button" role="menuitem" onClick={() => setPanel('legal')} className="user-menu-item">
                    <MenuIcon name="legal" />
                    <span>Legal and privacy</span>
                    <span className="user-menu-item-caret" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="user-menu-section user-menu-section-bottom">
                <button type="button" role="menuitem" onClick={() => { setOpen(false); signOut() }} className="user-menu-item user-menu-item-danger">
                  <MenuIcon name="signout" />
                  <span>Sign out</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="user-menu-panel-head">
                <button type="button" className="user-menu-back" onClick={() => setPanel('main')} aria-label="Back to account menu">
                  <MenuIcon name="back" />
                </button>
                <span>Legal and privacy</span>
              </div>
              <div className="user-menu-section">
                {legalItems.map(([key, label]) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={key}
                    onClick={() => { setOpen(false); onOpenLegal(key) }}
                    className="user-menu-item"
                  >
                    <MenuIcon name="legal" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
