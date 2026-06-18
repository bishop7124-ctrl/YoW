import { useState, useEffect, useRef } from 'react'
import { getCookieConsent, setCookieConsent } from '../../utils/cookieConsent'

// ─── Legal content ─────────────────────────────────────────────────────────────

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 28 }}>
    <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-main)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</h3>
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.75 }}>{children}</div>
  </div>
)

const P = ({ children }) => <p style={{ marginBottom: 10 }}>{children}</p>
const Li = ({ children }) => <li style={{ marginBottom: 5, paddingLeft: 4 }}>{children}</li>
const Ul = ({ children }) => <ul style={{ paddingLeft: 18, marginBottom: 10 }}>{children}</ul>
const Accent = ({ children }) => <strong style={{ color: 'var(--text-main)' }}>{children}</strong>

const CONTENT = {
  privacy: {
    title: 'Privacy Policy',
    sub: 'Last updated May 2026',
    body: (
      <>
        <Section title="Who we are">
          <P>Your Own World ("we", "our", "the Service") is a creative writing platform operated by YourOwnWorld. Questions about this policy can be directed to <Accent>privacy@yourownworld.co.uk</Accent>.</P>
        </Section>
        <Section title="What we collect">
          <Ul>
            <Li><Accent>Account data</Accent> — your email address, password hash (managed by Supabase Auth), and optional profile fields (name, alias, bio, website, avatar URL).</Li>
            <Li><Accent>Creative content</Accent> — stories, characters, world notes, manuscripts, and all other project data you create. This is stored in your personal account and synced to our database.</Li>
            <Li><Accent>Usage preferences</Accent> — theme, font, and UI settings stored locally in your browser and optionally in your account profile.</Li>
            <Li><Accent>Session tokens</Accent> — authentication cookies managed by Supabase to keep you signed in.</Li>
          </Ul>
        </Section>
        <Section title="How we use it">
          <Ul>
            <Li>To operate Your Own World and sync your projects across devices.</Li>
            <Li>To manage your account and subscription.</Li>
            <Li>To send transactional emails (account confirmation, password reset).</Li>
          </Ul>
          <P>We do <Accent>not</Accent> sell your data, share it with advertisers, or use it to train AI models.</P>
        </Section>
        <Section title="Your rights">
          <Ul>
            <Li>Access, correct, or delete your data via Account Settings at any time.</Li>
            <Li>Request a full data export — email <Accent>privacy@yourownworld.co.uk</Accent>.</Li>
            <Li>Close your account at any time; your data will be deleted within 30 days.</Li>
          </Ul>
        </Section>
        <Section title="Data storage">
          <P>Your data is stored via Supabase infrastructure (supabase.com). Payments are processed by Stripe — we never store your card details. Neither Supabase nor Stripe is permitted to use your data beyond what is necessary to provide their service to us.</P>
        </Section>
        <Section title="Cookies">
          <P>See our Cookie Policy for details on how we use browser storage and cookies.</P>
        </Section>
      </>
    ),
  },
  terms: {
    title: 'Terms of Service',
    sub: 'Last updated May 2026',
    body: (
      <>
        <Section title="Using the service">
          <P>By creating an account you agree to these terms. The Service is provided for lawful creative writing purposes. You agree not to use it to create, store, or distribute content that is illegal, harmful, or abusive.</P>
        </Section>
        <Section title="Your content">
          <P>Everything you write <Accent>remains yours</Accent>. Your Own World claims no ownership of your stories, characters, world notes, or manuscripts. You grant us a limited, non-exclusive licence to store and deliver your content as part of providing the Service to you.</P>
        </Section>
        <Section title="Subscriptions and billing">
          <Ul>
            <Li>New accounts receive a free trial period to explore the platform.</Li>
            <Li>Free, Monthly, Lifetime, and Founder plans have different app access, cloud hosting, storage, and support limits. Current plan details are shown before checkout.</Li>
            <Li>Lifetime app access means permanent access to the YOW app and Local Mode. It does not mean indefinite hosted cloud storage unless your Cloud Mode entitlement is active.</Li>
            <Li>If Lifetime cloud hosting lapses, your lifetime licence remains active and you can continue in Local Mode, import backups, and export your work. Cloud sync, hosted backups, and uploads pause until Cloud Mode is renewed.</Li>
            <Li>Founder includes lifetime Cloud Mode within the published storage and fair-use cap.</Li>
            <Li>Billing is processed by Stripe. We never store payment details.</Li>
            <Li>You may cancel at any time from Account Settings. Access continues until the current billing period ends. No refunds are issued for partial periods.</Li>
          </Ul>
        </Section>
        <Section title="Availability">
          <P>We aim for high availability but do not guarantee uninterrupted service. We are not liable for losses arising from downtime, though we take reasonable precautions to prevent data loss and service interruption.</P>
        </Section>
        <Section title="Termination">
          <P>We reserve the right to suspend accounts that violate these terms. You may close your account at any time from Account Settings.</P>
        </Section>
        <Section title="Governing law">
          <P>These terms are governed by the laws of <Accent>England and Wales</Accent>.</P>
        </Section>
      </>
    ),
  },
  ethics: {
    title: 'Ethics Statement',
    sub: 'Our principles and commitments',
    body: (
      <>
        <Section title="Your story belongs to you">
          <P>We will never claim ownership of, publish, monetise, or use your creative work for any purpose beyond operating the Service. Your stories are yours alone.</P>
        </Section>
        <Section title="AI assistance, not replacement">
          <P>The AI tools in Your Own World are designed to <Accent>assist</Accent> your creative process — generating ideas, suggesting options, helping with research. AI does not replace your voice or authorship. We will always be transparent about where AI is involved and will never present AI output as your own work without your direction.</P>
        </Section>
        <Section title="Your data is not training data">
          <P>Your writing content is <Accent>never</Accent> used to train AI models — ours or anyone else's — without your explicit opt-in consent. This is a hard commitment, not a legal hedge.</P>
        </Section>
        <Section title="No dark patterns">
          <P>We will never use manipulative design to confuse you about pricing, make cancellation difficult, obscure your data rights, or create false urgency. If something costs money, we'll say so clearly before you pay.</P>
        </Section>
        <Section title="Accessibility">
          <P>We are committed to building a writing tool accessible to everyone, including users with visual, motor, or cognitive differences. Feature requests related to accessibility are treated with high priority.</P>
        </Section>
        <Section title="Honest roadmap">
          <P>We publish a real roadmap and take feature requests seriously. We will not promise features we have no intention of building, and we will communicate honestly when plans change.</P>
        </Section>
        <Section title="Contact">
          <P>Questions, concerns, or reports of ethical issues: <Accent>ethics@yourownworld.co.uk</Accent></P>
        </Section>
      </>
    ),
  },
  beta: {
    title: 'Beta Disclaimer',
    sub: 'Beta service notice',
    body: (
      <>
        <Section title="Beta status">
          <P>Your Own World is currently provided as a <Accent>beta service</Accent>. Features, interface details, pricing, limits, and availability may change as we improve the platform.</P>
        </Section>
        <Section title="Service availability">
          <P>During beta, some features may be incomplete, experimental, temporarily unavailable, or changed without prior notice. We work to keep the Service stable, but beta access is provided without a guarantee of uninterrupted operation.</P>
        </Section>
        <Section title="Your content">
          <P>Your creative work remains yours. We take reasonable steps to protect and preserve project data, but you should keep your own backup exports of important writing while the platform is in beta.</P>
        </Section>
        <Section title="AI and experimental tools">
          <P>AI-assisted and experimental features may produce inaccurate, incomplete, or unexpected results. You are responsible for reviewing, editing, and deciding how to use any generated or suggested content.</P>
        </Section>
        <Section title="Feedback">
          <P>Beta feedback helps shape the product. By sending feedback, bug reports, or feature ideas, you allow us to use that feedback to improve Your Own World without creating any obligation to compensate you or implement a specific request.</P>
        </Section>
      </>
    ),
  },
  cookies: {
    title: 'Cookie Policy',
    sub: 'How we use browser storage',
    body: (
      <>
        <Section title="What are cookies?">
          <P>Cookies are small files stored in your browser. We also use <Accent>localStorage</Accent> (a similar browser mechanism) to store settings locally on your device.</P>
        </Section>
        <Section title="Essential (always active)">
          <Ul>
            <Li><Accent>yow_consent</Accent> — records your cookie preference so we don't ask again.</Li>
            <Li>Supabase authentication tokens — keep you signed in securely. These are required for the app to function.</Li>
          </Ul>
        </Section>
        <Section title="Preference cookies">
          <P>With your consent, we store your chosen theme, font, corner radius, and other interface settings between sessions. This uses <Accent>localStorage</Accent> keys prefixed with <Accent>nf-</Accent>.</P>
          <P>Without preference cookies, you will need to re-select your theme each visit.</P>
        </Section>
        <Section title="Analytics cookies">
          <P>With your consent, we may collect anonymous, aggregated usage data (e.g. which sections are used most often) to help us improve the product. This data is <Accent>never</Accent> linked to your personal identity.</P>
        </Section>
        <Section title="Third-party cookies">
          <P>Stripe may set cookies during checkout for fraud prevention. These are subject to Stripe's own privacy policy.</P>
        </Section>
        <Section title="Managing your preferences">
          <P>You can change your cookie preferences at any time using the button below, or from the Preferences section in Account Settings.</P>
        </Section>
      </>
    ),
  },
}

export const LEGAL_PAGES = Object.keys(CONTENT)
export const LEGAL_LABELS = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  ethics: 'Ethics Statement',
  beta: 'Beta Disclaimer',
  cookies: 'Cookie Policy',
}

// ─── Cookie prefs inline in the cookies page ──────────────────────────────────

function CookiePrefInline() {
  const current = getCookieConsent()
  const [prefs, setPrefs] = useState({
    preferences: current !== 'essential' && current !== null,
    analytics: current === 'all',
  })
  const [saved, setSaved] = useState(false)

  const save = () => {
    let level = 'essential'
    if (prefs.analytics) level = 'all'
    else if (prefs.preferences) level = 'preferences'
    setCookieConsent(level)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  const Toggle = ({ checked, onChange, disabled }) => (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      style={{
        flexShrink: 0, width: 36, height: 20, borderRadius: 10,
        background: checked ? 'var(--accent)' : 'var(--border)',
        border: 'none', cursor: disabled ? 'default' : 'pointer',
        position: 'relative', transition: 'background .15s',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: checked ? 19 : 3,
        width: 14, height: 14, borderRadius: '50%',
        background: 'var(--bg-main)', transition: 'left .15s',
        pointerEvents: 'none',
      }} />
    </button>
  )

  const Row = ({ label, desc, checked, onChange, disabled }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )

  return (
    <div style={{ marginTop: 24, padding: 16, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-main)' }}>
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Your current preferences</p>
      <Row label="Essential" desc="Required for authentication. Always active." checked disabled />
      <Row
        label="Preferences"
        desc="Theme, font, and interface settings."
        checked={prefs.preferences}
        onChange={() => setPrefs(p => ({ ...p, preferences: !p.preferences }))}
      />
      <Row
        label="Analytics"
        desc="Anonymous usage data. Never linked to your identity."
        checked={prefs.analytics}
        onChange={() => setPrefs(p => ({ ...p, analytics: !p.analytics }))}
      />
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
        {saved && <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>Saved</span>}
        <button
          type="button"
          onClick={save}
          style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--bg-main)', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Save preferences
        </button>
      </div>
    </div>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

export default function LegalModal({ page, onClose, onNavigate }) {
  const dialogRef = useRef(null)
  useEffect(() => { dialogRef.current?.focus() }, [page])
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!page) return null

  const entry = CONTENT[page]
  if (!entry) return null

  const navPages = LEGAL_PAGES.filter(p => p !== page)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        tabIndex={-1}
        style={{
          background: 'var(--bg-nav)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: 'min(680px, 100%)',
          maxHeight: 'min(780px, calc(100vh - 48px))',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3 }}>{entry.sub}</p>
            <h2 id="legal-modal-title" style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>{entry.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '2px 4px', marginLeft: 12, flexShrink: 0 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {entry.body}
          {page === 'cookies' && <CookiePrefInline />}
        </div>

        {/* Footer nav */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {navPages.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => onNavigate?.(p)}
                style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {LEGAL_LABELS[p]}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>© 2026 YourOwnWorld</p>
        </div>
      </div>
    </div>
  )
}
