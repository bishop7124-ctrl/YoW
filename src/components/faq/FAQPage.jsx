import { useState } from 'react'
import MarketingNav from '../marketing/MarketingNav'
import MarketingFooter from '../marketing/MarketingFooter'
import { usePageMeta } from '../../utils/usePageMeta'

import { useSiteContent } from '../../utils/siteContent'
import { FAQ_DEFAULTS } from '../../content/faq'

const FAQ_ICONS = {
  pricing: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
      <path d="M4 9h16" />
      <path d="M7 15h4" />
      <path d="M15.5 14.5h1.5" />
    </svg>
  ),
  features: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5 13.9 9l5.6.1-4.5 3.3 1.6 5.6-4.6-3.2L7.4 18l1.6-5.6-4.5-3.3L10.1 9 12 3.5Z" />
      <path d="M19 4v3" />
      <path d="M20.5 5.5h-3" />
    </svg>
  ),
  storage: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  ),
  local: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5v13A2.5 2.5 0 0 1 15.5 21h-7A2.5 2.5 0 0 1 6 18.5v-13Z" />
      <path d="M10 17h4" />
      <path d="M9 7h6" />
      <path d="M9 10h6" />
    </svg>
  ),
  started: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19c3.2-5.8 7.8-10.4 14-14" />
      <path d="M14 5h5v5" />
      <path d="M6 9.5 4.5 8" />
      <path d="M9.5 6 8 4.5" />
      <path d="M5.5 13H3.5" />
    </svg>
  ),
}

function FAQSectionIcon({ name }) {
  return (
    <span style={{
      width: 44,
      height: 44,
      borderRadius: 12,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--accent)',
      background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
      border: '1px solid color-mix(in srgb, var(--accent) 22%, var(--border))',
      flexShrink: 0,
    }}>
      <span style={{ width: 23, height: 23, display: 'inline-flex' }}>
        {FAQ_ICONS[name]}
      </span>
    </span>
  )
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          padding: '18px 0', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 16, fontSize: 15, fontWeight: 600, color: 'var(--text-main)',
        }}
        aria-expanded={open}
      >
        <span style={{ minWidth: 0 }}>{q}</span>
        <span style={{
          flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
          border: '1.5px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, transition: 'transform 0.2s',
          transform: open ? 'rotate(45deg)' : 'none',
          color: 'var(--text-muted)',
        }}>
          +
        </span>
      </button>
      {open && (
        <p style={{
          margin: '0 0 18px', lineHeight: 1.7, fontSize: 15,
          color: 'var(--text-muted)', paddingRight: 36,
        }}>
          {a}
        </p>
      )}
    </div>
  )
}

export default function FAQPage({ onGetStarted, onLogin, user, preview = false }) {
  const c = useSiteContent('faq', FAQ_DEFAULTS, { preview })
  usePageMeta({
    path: '/faq/',
    title: 'FAQ — Your Own World | Worldbuilding & Writing Software',
    description: 'Answers to common questions about Your Own World: plans and pricing, storage, Cloud Mode, Founder slots, AI features, exports, and data ownership.',
  })

  return (
    <div className="yow-home min-h-screen text-[var(--text-main)]">
      <MarketingNav activePath="/faq/" onLogin={onLogin} onGetStarted={onGetStarted} user={user} />

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '0 24px 96px' }}>

        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '80px 0 44px' }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>{c.hero.eyebrow}</p>
          <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)', fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
            {c.hero.title}
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto' }}>
            {c.hero.intro}
          </p>
        </section>

        {/* Overview */}
        <nav
          aria-label="FAQ sections"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
            gap: 14,
            margin: '0 0 64px',
          }}
        >
          {c.sections.map(section => (
            <a
              key={section._id}
              href={`#${section._id}`}
              style={{
                minHeight: 176,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                padding: 18,
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--bg-card)',
                color: 'inherit',
                textDecoration: 'none',
                boxShadow: '0 14px 30px rgba(15, 23, 42, 0.06)',
              }}
            >
              <FAQSectionIcon name={section._icon} />
              <span>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: 'var(--text-main)', marginBottom: 6 }}>
                  {section.heading}
                </span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {section.summary}
                </span>
              </span>
            </a>
          ))}
        </nav>

        {/* Sections */}
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          {c.sections.map(section => (
            <section
              key={section._id}
              id={section._id}
              style={{
                marginBottom: 56,
                scrollMarginTop: 96,
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginBottom: 10,
                paddingBottom: 14,
                borderBottom: '1px solid var(--border)',
              }}>
                <FAQSectionIcon name={section._icon} />
                <div>
                  <h2 style={{
                    fontSize: 'clamp(1.1rem, 2vw, 1.35rem)',
                    fontWeight: 800,
                    lineHeight: 1.25,
                    margin: '0 0 4px',
                    color: 'var(--text-main)',
                  }}>
                    {section.heading}
                  </h2>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {section.summary}
                  </p>
                </div>
              </div>
              {section.items.map((item, i) => (
                <FAQItem key={i} q={item.q} a={item.a} />
              ))}
            </section>
          ))}

          {/* Still have questions */}
          <section style={{
            textAlign: 'center', padding: '40px 32px',
            border: '1px solid var(--border)', borderRadius: 8,
            background: 'var(--bg-card)',
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{c.contact.title}</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 15 }}>
              {c.contact.intro}
            </p>
            <a
              href="https://help.yourownworld.co.uk/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ textDecoration: 'none', marginRight: 10 }}
            >
              {c.contact.helpCentreLabel}
            </a>
            <a
              href="mailto:support@yourownworld.co.uk"
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}
            >
              {c.contact.supportLabel}
            </a>
          </section>
        </div>

      </main>
      <MarketingFooter />
    </div>
  )
}
