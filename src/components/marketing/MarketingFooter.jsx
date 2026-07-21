import YOWLogo from '../brand/YOWLogo'

const PRODUCT_LINKS = [
  { href: '/features/', label: 'Features' },
  { href: '/pricing/', label: 'Pricing' },
  { href: '/founders/', label: 'Founders' },
  { href: '/ai-overview/', label: 'AI Assistant' },
  { href: '/about/', label: 'About' },
]

const USE_CASE_LINKS = [
  { href: '/worldbuilding-software/', label: 'Worldbuilding' },
  { href: '/novel-writing-software/', label: 'Novel Writing' },
  { href: '/dnd-campaign-manager/', label: 'D&D Campaigns' },
  { href: '/lore-management/', label: 'Lore Management' },
]

const TOOL_LINKS = [
  { href: '/timeline-tool-for-writers/', label: 'Timeline Builder' },
  { href: '/family-tree-builder/', label: 'Family Trees' },
  { href: '/map-builder-for-writers/', label: 'Map Builder' },
  { href: '/story-planning-software/', label: 'Story Planning' },
]

const linkStyle = { fontSize: '0.85rem', color: 'var(--text-muted)', textDecoration: 'none' }
const headingStyle = {
  fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12,
}

export default function MarketingFooter() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border)',
      padding: '48px 0 32px',
      marginTop: 'auto',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr repeat(3, 1fr)',
          gap: 32,
          marginBottom: 32,
        }}>
          <div>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit', marginBottom: 10 }}>
              <span style={{ width: 28, height: 28, flexShrink: 0 }}><YOWLogo /></span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Your Own World</span>
            </a>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              All-in-one worldbuilding and writing platform for novelists, fantasy writers, and worldbuilders.
            </p>
          </div>

          <div>
            <h4 style={headingStyle}>Product</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PRODUCT_LINKS.map(l => <li key={l.href}><a href={l.href} style={linkStyle}>{l.label}</a></li>)}
            </ul>
          </div>

          <div>
            <h4 style={headingStyle}>Use Cases</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {USE_CASE_LINKS.map(l => <li key={l.href}><a href={l.href} style={linkStyle}>{l.label}</a></li>)}
            </ul>
          </div>

          <div>
            <h4 style={headingStyle}>Tools</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TOOL_LINKS.map(l => <li key={l.href}><a href={l.href} style={linkStyle}>{l.label}</a></li>)}
            </ul>
          </div>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 8,
          paddingTop: 24, borderTop: '1px solid var(--border)',
          fontSize: '0.78rem', color: 'var(--text-muted)',
        }}>
          <span>© {new Date().getFullYear()} Your Own World. All rights reserved.</span>
          <span style={{ display: 'flex', gap: 12 }}>
            <a href="/faq/" style={linkStyle}>FAQ</a>
            <a href="/beta-disclaimer/" style={linkStyle}>Beta Disclaimer</a>
            <a href="mailto:support@yourownworld.co.uk" style={linkStyle}>Contact</a>
          </span>
        </div>
      </div>
    </footer>
  )
}
