import { useState } from 'react'
import MarketingNav from '../marketing/MarketingNav'

const FAQ_SECTIONS = [
  {
    heading: 'Plans & Pricing',
    items: [
      {
        q: 'What does "Creator Lifetime" actually cover?',
        a: "Creator Lifetime gives you permanent access to Your Own World — unlimited projects, premium exports, and all current features. It includes 3 years of cloud hosting, storage, backups and sync. After those 3 years, a small annual Cloud Hosting & Storage Renewal of £6/year keeps your data hosted and the app running. This fee is intended only to cover hosting costs, not to generate profit, and may change if provider costs materially change.",
      },
      {
        q: 'What is the Cloud Hosting & Storage Renewal?',
        a: "The Cloud Hosting & Storage Renewal is £6/year, due after your included 3-year hosting period ends. It covers the actual cost of storing and serving your data — not new features or development. If you choose not to renew, you can still log in and export all your projects at no charge. Founder members have lifetime cloud hosting included with no renewal fee ever.",
      },
      {
        q: 'What happens if I don\'t renew cloud hosting?',
        a: "You'll receive 30 days notice before your included hosting period or renewal expires. If you don't renew, your account moves to a restricted screen where you can still log in and export all your data — no payment required. Your data is never deleted. Renew any time to restore full access instantly.",
      },
      {
        q: 'Do monthly subscribers pay a Cloud Hosting & Storage Renewal?',
        a: 'No. Monthly subscribers pay £10/month which covers everything including cloud hosting, storage, backups and sync. The annual renewal only applies to Lifetime plan holders after their included 3-year period.',
      },
      {
        q: 'How many Founder slots are there?',
        a: "Founder membership is limited to a small number of slots globally. Once they're gone, they're gone — the Founder tier will not be sold again. Founders have lifetime cloud hosting included with no annual renewal fee, ever.",
      },
      {
        q: 'What happens to my data if I downgrade to Free?',
        a: "Your projects, characters, lore, and maps are always yours. If you downgrade to Free, all your data remains intact and readable. You'll just designate one active project to edit — everything else becomes view-only until you upgrade again.",
      },
      {
        q: 'Can I cancel my Monthly Creator subscription?',
        a: "Yes. Cancel any time from your account settings via the billing portal. You'll retain full access until the end of your current billing period.",
      },
      {
        q: 'What payment methods do you accept?',
        a: 'Payments are processed securely by Stripe. All major credit and debit cards are accepted, including Visa, Mastercard, and American Express.',
      },
    ],
  },
  {
    heading: 'Features & AI',
    items: [
      {
        q: 'What is bring-your-own-key AI?',
        a: 'Your Own World supports connecting your own API keys from providers like OpenRouter, Google AI, or Anthropic. This means you pay your AI provider directly — YOW never marks up AI usage. All plans include this.',
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
    heading: 'Data & Storage',
    items: [
      {
        q: 'Is my storage quota shared across projects?',
        a: 'Yes — your storage quota covers everything in your account: all projects, cover images, maps, and uploaded assets combined.',
      },
      {
        q: 'Where is my data stored?',
        a: "Your data is stored securely in the cloud and syncs across all your devices. You own your work — you can export your manuscript and project data at any time.",
      },
      {
        q: 'Can I export my manuscript?',
        a: 'Yes. All plans support exporting your manuscript as DOCX, PDF, or ZIP. Premium plans unlock advanced export formats and options.',
      },
    ],
  },
  {
    heading: 'Getting Started',
    items: [
      {
        q: 'Is there a free plan?',
        a: "Yes. The Free plan lets you run one active project with all studio rooms and bring-your-own-key AI included. No credit card required to start.",
      },
      {
        q: 'Does YOW work on mobile?',
        a: 'Yes — YOW is a web app that works on any modern browser, including mobile. The interface adapts to smaller screens so you can write and plan on the go.',
      },
      {
        q: 'Can I import an existing manuscript?',
        a: 'You can paste or type your existing content directly into the manuscript editor. Structured imports (e.g. from DOCX) are on the roadmap.',
      },
    ],
  },
]

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
        <span>{q}</span>
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
  return (
    <div className="yow-home min-h-screen text-[var(--text-main)]">
      <MarketingNav activePath="/faq/" onLogin={onLogin} onGetStarted={onGetStarted} user={user} />

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 96px' }}>

        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '80px 0 56px' }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>FAQ</p>
          <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)', fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
            Frequently asked questions
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto' }}>
            Everything you need to know about Your Own World — plans, features, and getting started.
          </p>
        </section>

        {/* Sections */}
        {FAQ_SECTIONS.map(section => (
          <section key={section.heading} style={{ marginBottom: 48 }}>
            <h2 style={{
              fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.07em', color: 'var(--text-muted)',
              marginBottom: 4, paddingBottom: 12,
              borderBottom: '1px solid var(--border)',
            }}>
              {section.heading}
            </h2>
            {section.items.map(item => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </section>
        ))}

        {/* Still have questions */}
        <section style={{
          textAlign: 'center', padding: '40px 32px',
          border: '1px solid var(--border)', borderRadius: 16,
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

      </main>
    </div>
  )
}
