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

        <nav className="marketing-nav-links" aria-label="Main navigation">
          {NAV_LINKS.map(link => (
            <a key={link.href} href={link.href} aria-current={isActive(link) ? 'page' : undefined}>
              {link.label}
            </a>
          ))}
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
      </div>
    </header>
  )
}
