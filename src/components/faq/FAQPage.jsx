import { useState } from 'react'
import MarketingNav from '../marketing/MarketingNav'
import MarketingFooter from '../marketing/MarketingFooter'
import { usePageMeta } from '../../utils/usePageMeta'

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

const FAQ_SECTIONS = [
  {
    id: 'plans-pricing',
    heading: 'Plans & Pricing',
    icon: 'pricing',
    summary: 'Costs, renewals, Founders, downgrades, and billing basics.',
    items: [
      {
        q: 'What does Lifetime actually cover?',
        a: "Lifetime gives you permanent access to the Your Own World app, Local Mode, unlimited local projects, premium exports, and all current features. It includes 3 years of Cloud Mode for hosted sync, storage, and backups. After that, the desktop app keeps working in Local Mode forever, and web cloud access falls back to Free limits unless you renew Cloud Mode for £6/year.",
      },
      {
        q: 'What is the cloud hosting renewal?',
        a: "The cloud hosting renewal is £6/year, due only after the included 3-year Cloud Mode period ends for Lifetime users. It covers hosted sync, storage, and backups above the Free allowance. If you choose not to renew, your lifetime desktop app licence remains active and web cloud access falls back to Free limits.",
      },
      {
        q: 'What happens if I don\'t renew cloud hosting?',
        a: "You keep access to the desktop app in Local Mode. Your projects are stored on this device, you can keep editing locally, and you can import or export backups. Web cloud access falls back to the Free one-project, 250 MB allowance unless you renew Cloud Mode.",
      },
      {
        q: 'Do monthly subscribers pay a cloud hosting renewal?',
        a: 'No. Monthly subscribers pay £10/month, which includes Cloud Mode while subscribed. The annual renewal only applies to Lifetime plan holders after their included hosting period.',
      },
      {
        q: 'How many Founder slots are there?',
        a: "Founder membership is limited to a small number of slots globally. Once they're gone, they're gone. Founders have lifetime Cloud Mode included within the published storage and fair-use cap.",
      },
      {
        q: 'What happens to my data if I downgrade to Free?',
        a: "Your projects, characters, lore, and maps are always yours. If you downgrade to Free, all your data remains intact and readable/exportable. You'll designate one active text-first project to edit. Everything else becomes view-only, and premium rooms such as Map Builder and AI Tools stay locked until you upgrade again.",
      },
      {
        q: 'Can I cancel my Monthly subscription?',
        a: "Yes. Cancel any time from your account settings via the billing portal. You'll retain full access until the end of your current billing period.",
      },
      {
        q: 'What payment methods do you accept?',
        a: 'Payments are processed securely by Stripe. All major credit and debit cards are accepted, including Visa, Mastercard, and American Express.',
      },
    ],
  },
  {
    id: 'features-ai',
    heading: 'Features & AI',
    icon: 'features',
    summary: 'Supported project types, campaign tools, and context-aware AI.',
    items: [
      {
        q: 'What does "connect your own AI provider" mean?',
        a: 'On any paid plan, you connect your own account from a provider like ChatGPT, Claude, or OpenRouter. You pay that provider directly for what you use — YOW never marks up AI usage or resells it to you. The Free plan doesn\'t include AI features.',
      },
      {
        q: 'Do the AI tools know about my specific world?',
        a: 'Yes. Every AI tool in YOW reads your project context — characters, lore, manuscript structure — before generating any output. You get story-aware analysis, not generic writing prompts.',
      },
      {
        q: 'What project types does YOW support?',
        a: 'YOW supports novels, novellas, short stories, comic/graphic novels, D&D campaigns, and system-neutral tabletop campaigns. Each project type has its own structure, terminology, and default workspace tailored to that format.',
      },
      {
        q: 'Can I use YOW for a D&D campaign?',
        a: "Yes — the D&D Campaign type gives you an NPC database, session and encounter structure, faction and location tracking, interactive maps, and a world codex with D&D-flavoured language. For other systems, the Tabletop Campaign type is fully system-neutral and works for any TTRPG ruleset.",
      },
    ],
  },
  {
    id: 'data-storage',
    heading: 'Data & Storage',
    icon: 'storage',
    summary: 'Storage quotas, cloud sync, exports, and ownership of your work.',
    items: [
      {
        q: 'Is my storage quota shared across projects?',
        a: 'Yes — your storage quota covers everything in your account: all projects, cover images, maps, and uploaded assets combined.',
      },
      {
        q: 'Where is my data stored?',
        a: "In Cloud Mode, your data is stored securely in the cloud and syncs across your devices. In Local Mode, projects are stored on your device. You own your work either way and can export your manuscript and project data at any time.",
      },
      {
        q: 'Can I export my manuscript?',
        a: 'Yes. All plans support exporting your manuscript as DOCX, PDF, or ZIP. Premium plans unlock advanced export formats and options.',
      },
    ],
  },
  {
    id: 'local-mode',
    heading: 'Local Mode',
    icon: 'local',
    summary: 'How Local Mode works, what stays on device, and switching modes.',
    items: [
      {
        q: 'How do I use Local Mode?',
        a: "Local Mode stores your projects on your device instead of the cloud. It activates automatically if your Cloud Mode period lapses, and you can also choose Local-first writing from Account Settings → Membership while Cloud Sync is available. Your data stays on this device, automatic cloud sync pauses, and you can keep writing without relying on an internet connection. To move projects between devices in Local Mode, use Export (ZIP) and Import.",
      },
      {
        q: 'What is the difference between Cloud Mode and Local Mode?',
        a: "In Cloud Mode, your data is stored securely in the cloud and syncs across your devices. In Local Mode, projects are stored on your device only. Both modes give you full access to the editor, all studio rooms, and exports — the only difference is where your data lives. You own your work either way.",
      },
      {
        q: 'Can I switch between Local Mode and Cloud Mode?',
        a: "You can turn Local-first writing on from Account Settings → Membership. While it is on, YOW keeps using the current browser copy and will not pull older cloud data over your local work. When you turn Cloud Sync back on, the current browser copy is uploaded. Export a ZIP backup before changing modes if you want an extra safety copy.",
      },
    ],
  },
  {
    id: 'getting-started',
    heading: 'Getting Started',
    icon: 'started',
    summary: 'Free plan details, mobile use, and bringing in existing work.',
    items: [
      {
        q: 'Is there a free plan?',
        a: "Yes. The Free plan gives you one project with the full writing and worldbuilding toolkit — including Map Builder — plus 250 MB storage. Only AI tools are paid-only. No credit card is required to start.",
      },
      {
        q: 'Does YOW work on mobile?',
        a: 'Yes — YOW is a web app that works on any modern browser, including mobile. The interface adapts to smaller screens so you can write and plan on the go.',
      },
      {
        q: 'Can I import an existing manuscript?',
        a: 'You can paste or type your existing content directly into the manuscript editor. DOCX import is also supported — use the import button in the manuscript toolbar.',
      },
    ],
  },
]

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

export default function FAQPage({ onGetStarted, onLogin, user }) {
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
          <p className="eyebrow" style={{ marginBottom: 12 }}>FAQ</p>
          <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)', fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
            Frequently asked questions
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto' }}>
            Everything you need to know about Your Own World — plans, features, and getting started.
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
          {FAQ_SECTIONS.map(section => (
            <a
              key={section.id}
              href={`#${section.id}`}
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
              <FAQSectionIcon name={section.icon} />
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
          {FAQ_SECTIONS.map(section => (
            <section
              key={section.id}
              id={section.id}
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
                <FAQSectionIcon name={section.icon} />
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
              {section.items.map(item => (
                <FAQItem key={item.q} q={item.q} a={item.a} />
              ))}
            </section>
          ))}

          {/* Still have questions */}
          <section style={{
            textAlign: 'center', padding: '40px 32px',
            border: '1px solid var(--border)', borderRadius: 8,
            background: 'var(--bg-card)',
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Still have a question?</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 15 }}>
              Drop us a line — we're happy to help.
            </p>
            <a
              href="mailto:support@yourownworld.co.uk"
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}
            >
              Contact support
            </a>
          </section>
        </div>

      </main>
      <MarketingFooter />
    </div>
  )
}
