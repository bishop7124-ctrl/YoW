import { useState } from 'react'
import YOWLogo from '../brand/YOWLogo'

const NAV_LINKS = [
  { href: '/features/', label: 'Features', match: '/features' },
  { href: '/pricing/', label: 'Pricing', match: '/pricing' },
  { href: '/faq/', label: 'FAQ', match: '/faq' },
  { href: '/founders/', label: 'Founders', match: '/founders' },
]

export default function MarketingNav({
  activePath = '/',
  onGetStarted,
  user,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isActive = (link) => activePath === link.href || activePath.startsWith(link.match)

  return (
    <header className="marketing-nav" role="banner">
      <div className="marketing-nav-wrap">
        <a href="/" className="marketing-nav-brand" aria-label="Your Own World home">
          <span className="marketing-nav-logo" aria-hidden="true">
            <YOWLogo />
          </span>
          <span className="marketing-nav-brand-full">Your Own World</span>
          <span className="marketing-nav-brand-short" aria-hidden="true">YOW</span>
        </a>

        <nav className={`marketing-nav-links${menuOpen ? ' is-open' : ''}`} aria-label="Main navigation">
          {NAV_LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              aria-current={isActive(link) ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}

          <div className="marketing-nav-actions-mobile">
            {user ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { setMenuOpen(false); onGetStarted?.() }}>
                Go to my workspace
              </button>
            ) : (
              <>
                <a href="/login" className="btn btn-secondary btn-sm" onClick={() => setMenuOpen(false)}>
                  Log in
                </a>
                <a href="/signup" className="btn btn-primary btn-sm" onClick={() => setMenuOpen(false)}>
                  Get started free
                </a>
              </>
            )}
          </div>
        </nav>

        <div className="marketing-nav-actions">
          {user ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onGetStarted}>
              Go to my workspace
            </button>
          ) : (
            <>
              <a href="/login" className="btn btn-secondary btn-sm">
                Log in
              </a>
              <a href="/signup" className="btn btn-primary btn-sm">
                Get started free
              </a>
            </>
          )}
        </div>

        <button
          type="button"
          className="marketing-nav-hamburger"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(v => !v)}
        >
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" /></svg>
          )}
        </button>
      </div>
    </header>
  )
}
