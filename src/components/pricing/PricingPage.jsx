import { useEffect, useState } from 'react'
import { HOSTING_INCLUDED_YEARS, HOSTING_RENEWAL_FEE_GBP, PLANS, FOUNDER_SLOTS_TOTAL } from '../../utils/membership'
import BetaInterestModal from '../account/BetaInterestModal'
import MarketingNav from '../marketing/MarketingNav'
import MarketingFooter from '../marketing/MarketingFooter'
import { usePageMeta } from '../../utils/usePageMeta'
import './PricingPage.css'

const freePlanDef = PLANS.find(p => p.key === 'free')
const monthlyPlanDef = PLANS.find(p => p.key === 'premium_monthly')
const lifetimePlanDef = PLANS.find(p => p.key === 'premium_plus_lifetime')
const founderPlanDef = PLANS.find(p => p.key === 'founder')

// --------------------------------------------------------------------------
// Structured data helpers (injected into <head> while the page is mounted)
// --------------------------------------------------------------------------
function injectSchema(id, schema) {
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('script')
    el.id   = id
    el.type = 'application/ld+json'
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(schema)
}

function removeSchema(id) {
  document.getElementById(id)?.remove()
}

// --------------------------------------------------------------------------
// Feature comparison table data — only real differentiators, in plain
// language. Column order matches the card order: Free, Monthly, Lifetime, Founder.
// --------------------------------------------------------------------------
const FEATURE_ROWS = [
  { label: 'Projects',                free: '1',       monthly: 'Unlimited', lifetime: 'Unlimited', founder: 'Unlimited' },
  { label: 'Cloud storage',           free: freePlanDef?.storageLabelShort, monthly: monthlyPlanDef?.storageLabelShort, lifetime: lifetimePlanDef?.storageLabelShort, founder: founderPlanDef?.storageLabelShort },
  { label: 'Full writing & worldbuilding toolkit', free: '✓ in your 1 project', monthly: '✓', lifetime: '✓', founder: '✓' },
  { label: 'Connect your own AI provider', free: '—', monthly: '✓', lifetime: '✓', founder: '✓' },
  { label: 'Desktop app (Mac & Windows)', free: '—', monthly: '—', lifetime: '✓', founder: '✓' },
  { label: 'Cloud sync',               free: 'Free-tier limits', monthly: 'While subscribed', lifetime: `${HOSTING_INCLUDED_YEARS} yrs included, then £${HOSTING_RENEWAL_FEE_GBP}/yr`, founder: 'Lifetime, no renewal' },
  { label: 'Founder badge & recognition', free: '—', monthly: '—', lifetime: '—', founder: '✓' },
  { label: 'Support',                 free: 'Community', monthly: 'Priority', lifetime: 'Priority', founder: 'Priority' },
  { label: 'Payment',                 free: 'Free, forever', monthly: 'Monthly, cancel anytime', lifetime: 'One-time payment', founder: 'One-time payment' },
]

// --------------------------------------------------------------------------
// FAQ data
// --------------------------------------------------------------------------
const FAQ_ITEMS = [
  {
    q: 'What does Lifetime actually cover?',
    a: `Lifetime gives you everything in Monthly — unlimited projects, the full toolkit, and 8 GB of cloud storage — plus the desktop app for Mac and Windows, and every future update for free. It includes ${HOSTING_INCLUDED_YEARS} years of cloud sync. After that, the desktop app keeps working in Local Mode forever, and you can either renew cloud sync for £${HOSTING_RENEWAL_FEE_GBP}/year or keep writing locally at no cost.`,
  },
  {
    q: 'Why isn\'t the desktop app included in Monthly?',
    a: 'The desktop app is a one-time-purchase perk reserved for Lifetime and Founder — it\'s how we can keep Monthly\'s price low. Monthly gives you the complete web app, unlimited projects, and cloud sync; if you later decide you want to own the app outright, you can upgrade to Lifetime at any time.',
  },
  {
    q: 'Can I switch from Monthly to Lifetime later?',
    a: 'Yes. Open Account Settings → Membership and choose Lifetime — checkout walks you through it, and your projects and data carry straight over. Cancel the Monthly subscription from the same screen once you\'re switched.',
  },
  {
    q: 'What is the cloud hosting renewal?',
    a: `The cloud hosting renewal is £${HOSTING_RENEWAL_FEE_GBP}/year, and it only applies to Lifetime after the included ${HOSTING_INCLUDED_YEARS}-year period ends. It covers hosted sync, storage, and backups. If you'd rather not renew, your desktop app licence stays active forever and you keep writing in Local Mode at no cost — nothing is taken away, you just sync manually instead of automatically.`,
  },
  {
    q: 'What happens if I don\'t renew cloud hosting?',
    a: `You keep full access to the desktop app in Local Mode — your work stays safely on your device and you can keep editing, importing, and exporting. Web/cloud access falls back to the Free plan's one-project, ${freePlanDef?.storageLabelShort} allowance until you renew.`,
  },
  {
    q: 'How many Founder slots are there?',
    a: `Founder membership is limited to ${FOUNDER_SLOTS_TOTAL} slots, ever. Once they're gone, they're gone. Founders get lifetime cloud sync included, with no renewal, within the published fair-use cap.`,
  },
  {
    q: 'Do Monthly subscribers pay a cloud hosting renewal?',
    a: `No. Monthly is ${monthlyPlanDef?.priceLabel}/month, and that includes cloud sync for as long as you're subscribed. The renewal fee only applies to Lifetime plan holders once their included hosting period ends.`,
  },
  {
    q: 'What happens to my data if I downgrade to Free?',
    a: `Your projects, characters, lore, and maps are always yours. If you downgrade, you'll pick one project to keep as your active workspace — it keeps the full toolkit, including Map Builder, within the Free plan's ${freePlanDef?.storageLabelShort} allowance. Every other project becomes view-only and stays fully exportable. AI tools lock until you upgrade again.`,
  },
  {
    q: 'Can I cancel my Monthly subscription?',
    a: 'Yes, any time, from Account Settings → Membership. You keep full access until the end of your current billing period — no penalty, no retention calls.',
  },
  {
    q: 'What does "connect your own AI provider" mean?',
    a: 'On any paid plan, you link your own account from a provider like ChatGPT, Claude, or OpenRouter, right from Account Settings. You pay that provider directly for what you use — YOW never marks up or resells AI usage. The Free plan doesn\'t include AI features.',
  },
  {
    q: 'Is my storage quota shared across projects?',
    a: 'Yes — your storage quota covers everything in your account: all projects, cover images, maps, and uploaded assets combined.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'Payments are processed securely by Stripe. All major credit and debit cards are accepted, including Visa, Mastercard, and American Express.',
  },
]

// --------------------------------------------------------------------------
// Founder slot hook
// --------------------------------------------------------------------------
function useFounderSlots() {
  const [slots, setSlots] = useState(null) // null = loading

  useEffect(() => {
    const endpoint = import.meta.env.VITE_GET_FOUNDER_SLOTS_URL || '/api/get-founder-slots'
    fetch(endpoint)
      .then(r => r.ok ? r.json() : null)
      .then(data => setSlots(data))
      .catch(() => setSlots(null))
  }, [])

  return slots
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="7" fill="var(--accent)" fillOpacity=".15" />
      <path d="M4 7l2 2 4-4" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FounderSlotsCounter({ slots }) {
  if (!slots || slots.remaining === null) return null
  const pct = slots.total ? Math.round((slots.remaining / slots.total) * 100) : 0

  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: '50%',
      transform: 'translateX(-50%)', marginBottom: 12,
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: 'var(--accent-fade)', border: '1px solid var(--accent)',
      borderRadius: 99, padding: '6px 14px', whiteSpace: 'nowrap',
      fontSize: 12, fontWeight: 700, color: 'var(--text-main)',
    }} role="status" aria-live="polite">
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: pct > 30 ? 'var(--accent)' : '#ef4444',
        flexShrink: 0,
        boxShadow: `0 0 6px ${pct > 30 ? 'var(--accent)' : '#ef4444'}`,
      }} />
      <span>
        {slots.remaining > 0
          ? <>{slots.remaining} of {slots.total} slots remaining</>
          : 'All Founder slots claimed'}
      </span>
    </div>
  )
}

function PricingCard({ plan, onSelect, onFreeStart, busy, founderSlots }) {
  const isFounder = plan.isFounder
  const isFree = plan.key === 'free'
  const soldOut = isFounder && founderSlots !== null && founderSlots?.remaining === 0

  return (
    <article
      className={`pricing-card${plan.highlight ? ' pricing-card--highlight' : ''}`}
      aria-label={`${plan.label} plan — ${plan.priceLabel}`}
    >
      {isFounder && <FounderSlotsCounter slots={founderSlots} />}

      {/* Badge / ribbon */}
      {plan.badge && (
        plan.highlight
          ? <div className="pricing-card-ribbon">{plan.badge}</div>
          : <div className="pricing-card-badge">{plan.badge}</div>
      )}

      {/* Plan name */}
      <h3 style={{
        fontSize: 18, fontWeight: 900, color: 'var(--text-main)',
        margin: '0 0 6px',
        letterSpacing: '-.01em',
      }}>
        {plan.label}
      </h3>

      {/* Price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '4px 0 10px' }}>
        <span style={{
          fontSize: plan.key === 'free' ? 26 : plan.highlight ? 38 : 34,
          fontWeight: 900, color: 'var(--text-main)',
          letterSpacing: '-.02em',
        }}>
          {plan.priceLabel}
        </span>
        {plan.priceSuffix && (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
            {plan.priceSuffix}
          </span>
        )}
      </div>

      {plan.valueNote && (
        <p className="pricing-card-valuenote">{plan.valueNote}</p>
      )}

      {/* Description */}
      <p style={{
        fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)',
        margin: '0 0 16px',
      }}>
        {plan.longDescription || plan.description}
      </p>

      {/* Key benefit callout — the one thing this plan should be known for */}
      {plan.keyBenefit && (
        <div className="pricing-card-keybenefit">
          <span className="pricing-card-keybenefit-icon" aria-hidden="true">{plan.keyBenefit.icon}</span>
          <span>{plan.keyBenefit.label}</span>
        </div>
      )}

      {/* Features list */}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, flexGrow: 1 }}>
        {plan.features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ marginTop: 2, flexShrink: 0 }}><CheckIcon /></span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{f}</span>
          </li>
        ))}
      </ul>

      {plan.disclaimer && (
        <p style={{
          marginTop: 16, fontSize: 11.5, color: 'var(--text-muted)',
          lineHeight: 1.5, fontStyle: 'italic',
        }}>
          {plan.disclaimer}
        </p>
      )}

      {/* CTA */}
      {!isFree && (
        <button
          type="button"
          className={`pricing-card-cta${plan.highlight ? ' pricing-card-cta--solid' : ''}`}
          onClick={() => onSelect && !soldOut && onSelect(plan.key)}
          disabled={busy || soldOut}
        >
          {busy
            ? 'Opening…'
            : soldOut
              ? 'Sold out'
              : 'Register interest'}
        </button>
      )}

      {isFree && (
        <button
          type="button"
          className="pricing-card-cta"
          onClick={onFreeStart}
        >
          Start for free
        </button>
      )}
      {isFree && (
        <p style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
          No card required
        </p>
      )}
    </article>
  )
}

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
    }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 16, textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.4 }}>{q}</span>
        <span style={{
          flexShrink: 0, fontSize: 18, color: 'var(--text-muted)',
          transform: open ? 'rotate(45deg)' : 'none',
          transition: 'transform .2s',
          lineHeight: 1,
          marginTop: 2,
        }}>+</span>
      </button>
      {open && (
        <p style={{
          margin: '0 0 18px',
          fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)',
        }}>
          {a}
        </p>
      )}
    </div>
  )
}

function cellClass(val) {
  if (val === '✓') return 'is-check'
  if (val === '—') return 'is-dash'
  return ''
}

// --------------------------------------------------------------------------
// Main page
// --------------------------------------------------------------------------
export default function PricingPage({ onGetStarted, onSignIn, user }) {
  const founderSlots = useFounderSlots()
  const [openFaq, setOpenFaq]   = useState(null)
  const [billingError, setBillingError] = useState('')
  const [interestPlan, setInterestPlan] = useState(null)

  usePageMeta({
    path: '/pricing/',
    title: 'Pricing — Your Own World | Worldbuilding & Writing Software',
    description: `Affordable, honest pricing for Your Own World — Free, Monthly at ${monthlyPlanDef?.priceLabel}/month, Lifetime at ${lifetimePlanDef?.priceLabel} (includes the desktop app), and Founder.`,
  })

  // Inject / remove JSON-LD schemas while this page is mounted.
  useEffect(() => {
    injectSchema('ld-pricing-page', {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Pricing — Your Own World',
      description: 'Affordable, honest pricing for worldbuilding and writing software. A genuinely useful free plan, a low-cost monthly subscription, and a lifetime option that includes the desktop app.',
      url: 'https://www.yourownworld.co.uk/pricing',
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: PLANS.filter(p => p.key !== 'free').map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'Offer',
            name: p.label,
            description: p.description,
            price: p.price,
            priceCurrency: 'GBP',
            availability: 'https://schema.org/InStock',
          },
        })),
      },
    })

    injectSchema('ld-pricing-product', {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Your Own World — Worldbuilding & Writing Software',
      description: 'All-in-one worldbuilding and writing platform for novelists and fantasy writers.',
      brand: { '@type': 'Brand', name: 'Your Own World' },
      offers: PLANS.map(p => ({
        '@type': 'Offer',
        name: p.label,
        price: p.price,
        priceCurrency: 'GBP',
        availability: 'https://schema.org/InStock',
        priceValidUntil: '2027-12-31',
        url: 'https://www.yourownworld.co.uk/pricing',
      })),
    })

    injectSchema('ld-pricing-faq', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    })

    return () => {
      removeSchema('ld-pricing-page')
      removeSchema('ld-pricing-product')
      removeSchema('ld-pricing-faq')
    }
  }, [])

  const handleSelect = async (planKey) => {
    if (!planKey) return
    setBillingError('')
    setInterestPlan(PLANS.find(plan => plan.key === planKey) || { key: planKey, label: 'Paid plan' })
  }

  const displayPlans = [freePlanDef, monthlyPlanDef, lifetimePlanDef, founderPlanDef].filter(Boolean)

  const pageBg = 'var(--bg-main)'

  return (
    <div className="marketing-shell" style={{ minHeight: '100vh', background: pageBg, color: 'var(--text-main)' }}>
      <MarketingNav activePath="/pricing/" user={user} onLogin={onSignIn} onGetStarted={onGetStarted} />

      <main>
        {/* ── Hero ── */}
        <section
          aria-labelledby="pricing-hero-heading"
          style={{
            textAlign: 'center',
            padding: 'clamp(48px, 8vw, 96px) 24px clamp(32px, 5vw, 56px)',
            maxWidth: 720, margin: '0 auto',
          }}
        >
          <p style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '.12em',
            textTransform: 'uppercase', color: 'var(--accent)',
            marginBottom: 18,
          }}>
            Pricing
          </p>
          <h1
            id="pricing-hero-heading"
            style={{
              fontSize: 'clamp(32px, 6vw, 56px)',
              fontWeight: 900, lineHeight: 1.1,
              letterSpacing: '-.025em',
              color: 'var(--text-main)',
              margin: '0 0 20px',
            }}
          >
            Your world, your terms.
          </h1>
          <p style={{
            fontSize: 'clamp(15px, 2.5vw, 18px)',
            color: 'var(--text-muted)', lineHeight: 1.7,
            maxWidth: 580, margin: '0 auto 32px',
          }}>
            Every plan runs on the same powerful toolkit. The only question is how many worlds
            you're building, and whether you'd rather own the app outright or pay as you go.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onGetStarted}
              style={{
                background: 'var(--accent)', border: 'none',
                color: 'var(--accent-contrast)', borderRadius: 9,
                padding: '13px 28px', fontSize: 15, fontWeight: 800, cursor: 'pointer',
              }}
            >
              Start for free
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('comparison')?.scrollIntoView({ behavior: 'smooth' })}
              style={{
                display: 'inline-flex', alignItems: 'center',
                border: '1px solid var(--border)', borderRadius: 9,
                padding: '13px 28px', fontSize: 15, fontWeight: 700,
                color: 'var(--text-muted)', background: 'none', cursor: 'pointer',
              }}
            >
              Compare plans
            </button>
          </div>

          <div className="pricing-trust-row">
            <span className="pricing-trust-chip"><CheckIcon /> No card required for Free</span>
            <span className="pricing-trust-chip"><CheckIcon /> Cancel Monthly any time</span>
            <span className="pricing-trust-chip"><CheckIcon /> Built solo, by a working novelist</span>
          </div>

          <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text-muted)', opacity: 0.7 }}>
            Prices shown in GBP. VAT may apply depending on your location and is calculated at checkout.
          </p>
        </section>

        {/* ── Plan cards ── */}
        <section aria-label="Pricing plans" className="pricing-cards">
          {displayPlans.map(plan => (
            <PricingCard
              key={plan.key}
              plan={plan}
              onSelect={handleSelect}
              onFreeStart={onGetStarted}
              busy={false}
              founderSlots={founderSlots}
            />
          ))}
        </section>

        {billingError && (
          <p style={{
            textAlign: 'center', color: '#ef4444', fontSize: 13,
            fontWeight: 600, maxWidth: 480, margin: '24px auto 0',
          }}>
            {billingError}
          </p>
        )}

        {/* ── Why so affordable ── */}
        <section
          aria-labelledby="affordable-heading"
          style={{ padding: 'clamp(56px, 8vw, 96px) 24px' }}
        >
          <div className="pricing-founder-note">
            <div className="pricing-founder-note-mark" aria-hidden="true">“</div>
            <h2
              id="affordable-heading"
              style={{
                fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 900,
                letterSpacing: '-.015em', margin: '0 0 18px',
                color: 'var(--text-main)',
              }}
            >
              Why is YOW so affordable?
            </h2>
            <p style={{ fontSize: 15.5, lineHeight: 1.8, color: 'var(--text-muted)', margin: '0 0 14px' }}>
              I built Your Own World because I was tired of stitching together half a dozen
              separate writing tools — and paying full price for each one.
            </p>
            <p style={{ fontSize: 15.5, lineHeight: 1.8, color: 'var(--text-muted)', margin: '0 0 14px' }}>
              My goal was never to build the most expensive platform on the market. It's to build
              the tool I wish I'd had when I started — powerful enough for serious work, priced so
              it's an easy yes for as many writers as possible.
            </p>
            <p style={{ fontSize: 15.5, lineHeight: 1.8, color: 'var(--text-muted)', margin: 0 }}>
              I'd rather spend my time shipping features you'll actually use than dreaming up new
              ways to lock them behind higher tiers. That's the trade I've made, and it's why the
              pricing here looks the way it does.
            </p>
            <p style={{ marginTop: 24, fontSize: 12.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-muted)', opacity: 0.75 }}>
              — Founder's note
            </p>
          </div>
        </section>

        {/* ── Comparison table ── */}
        <section
          id="comparison"
          aria-labelledby="comparison-heading"
          style={{
            maxWidth: 1100, margin: '0 auto',
            padding: '0 24px 96px',
          }}
        >
          <h2
            id="comparison-heading"
            style={{
              fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 900,
              color: 'var(--text-main)', textAlign: 'center',
              margin: '0 0 40px', letterSpacing: '-.015em',
            }}
          >
            Everything side by side
          </h2>
          <div className="pricing-table-wrap">
            <table role="table" className="pricing-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Free</th>
                  <th>Monthly</th>
                  <th className="col-highlight">Lifetime</th>
                  <th>Founder</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map(row => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td data-label="Free" className={cellClass(row.free)}>{row.free}</td>
                    <td data-label="Monthly" className={cellClass(row.monthly)}>{row.monthly}</td>
                    <td data-label="Lifetime" className={`col-highlight ${cellClass(row.lifetime)}`}>{row.lifetime}</td>
                    <td data-label="Founder" className={cellClass(row.founder)}>{row.founder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Which plan explainer ── */}
        <section
          aria-labelledby="which-plan-heading"
          style={{
            maxWidth: 980, margin: '0 auto',
            padding: '0 24px 96px',
            textAlign: 'center',
          }}
        >
          <h2
            id="which-plan-heading"
            style={{
              fontSize: 'clamp(20px, 3.5vw, 28px)', fontWeight: 900,
              letterSpacing: '-.015em', margin: '0 0 16px',
              color: 'var(--text-main)',
            }}
          >
            Which plan is right for you?
          </h2>
          <p style={{
            fontSize: 15, lineHeight: 1.8, color: 'var(--text-muted)',
            margin: '0 auto 28px', maxWidth: 640,
          }}>
            Most writers land on Lifetime — one payment, and you own the app and the desktop
            experience outright. Here's the honest breakdown.
          </p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16, textAlign: 'left',
          }}>
            {[
              {
                heading: 'Choose Monthly if…',
                points: [
                  "You're exploring and not ready to commit",
                  "You're happy working entirely in the browser",
                  'You prefer to spread the cost over time',
                ],
              },
              {
                heading: 'Choose Lifetime if…',
                points: [
                  'You build worlds seriously and consistently',
                  'You want the desktop app and to own your software, not rent it',
                  `You want a single ${lifetimePlanDef?.priceLabel} payment instead of a bill every month`,
                ],
              },
              {
                heading: 'Choose Founder if…',
                points: [
                  'You want lifetime cloud sync locked in with zero renewal, ever',
                  'You want your name and debut work featured on YOW',
                  'You want to back this from day one and be recognised for it',
                ],
              },
            ].map(block => (
              <div key={block.heading} style={{
                borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--bg-nav)', padding: '20px 20px',
              }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-main)', marginBottom: 14 }}>
                  {block.heading}
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {block.points.map((pt, i) => (
                    <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ marginTop: 2, flexShrink: 0 }}><CheckIcon /></span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section
          aria-labelledby="faq-heading"
          style={{
            maxWidth: 720, margin: '0 auto',
            padding: '0 24px 96px',
          }}
        >
          <h2
            id="faq-heading"
            style={{
              fontSize: 'clamp(20px, 3.5vw, 28px)', fontWeight: 900,
              letterSpacing: '-.015em', margin: '0 0 8px',
              color: 'var(--text-main)',
            }}
          >
            Frequently asked questions
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 32px' }}>
            Still unsure? <a href="mailto:support@yourownworld.co.uk" style={{ color: 'var(--accent)' }}>Drop us a line</a> — we're happy to help.
          </p>

          <div>
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem
                key={i}
                q={item.q}
                a={item.a}
                open={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? null : i)}
              />
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section
          aria-label="Sign-up call to action"
          style={{
            textAlign: 'center',
            padding: 'clamp(48px, 8vw, 80px) 24px clamp(64px, 10vw, 120px)',
            maxWidth: 600, margin: '0 auto',
          }}
        >
          <h2 style={{
            fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 900,
            letterSpacing: '-.02em', margin: '0 0 16px',
            color: 'var(--text-main)',
          }}>
            Your world is waiting.
          </h2>
          <p style={{
            fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.7,
            margin: '0 auto 32px', maxWidth: 440,
          }}>
            Sign up free. Start building. Upgrade only when you're ready.
          </p>
          <button
            type="button"
            onClick={onGetStarted}
            style={{
              background: 'var(--accent)', border: 'none',
              color: 'var(--accent-contrast)', borderRadius: 9,
              padding: '14px 36px', fontSize: 16, fontWeight: 900, cursor: 'pointer',
            }}
          >
            Get started — it's free
          </button>
        </section>
      </main>

      <MarketingFooter />
      <BetaInterestModal
        open={!!interestPlan}
        user={user}
        planKey={interestPlan?.key}
        planLabel={interestPlan?.label}
        onClose={() => setInterestPlan(null)}
      />
    </div>
  )
}
