import { useEffect, useState } from 'react'
import { HOSTING_INCLUDED_YEARS, HOSTING_RENEWAL_FEE_GBP, PLANS, FOUNDER_SLOTS_TOTAL } from '../../utils/membership'
import BetaInterestModal from '../account/BetaInterestModal'
import MarketingNav from '../marketing/MarketingNav'
import MarketingFooter from '../marketing/MarketingFooter'
import SupportDevelopmentLink from '../marketing/SupportDevelopmentLink'
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
  { label: 'Desktop app (Mac & Windows)', free: '—', monthly: '—', lifetime: 'Planned for paid launch', founder: 'Planned for paid launch' },
  { label: 'Cloud sync',               free: 'Free-tier limits', monthly: 'While subscribed', lifetime: `${HOSTING_INCLUDED_YEARS} yrs included, then £${HOSTING_RENEWAL_FEE_GBP}/yr`, founder: 'Life of YOW service, no renewal fee' },
  { label: 'Founder badge & recognition', free: '—', monthly: '—', lifetime: '—', founder: '✓' },
  { label: 'Support target',          free: 'Within 1 week', monthly: 'Within 1 week', lifetime: 'Within 1 week', founder: 'Within 1 week' },
  { label: 'Payment',                 free: 'Free, no time limit', monthly: 'Monthly, cancel anytime', lifetime: 'One-time payment', founder: 'One-time payment' },
]

// --------------------------------------------------------------------------
// FAQ data
// --------------------------------------------------------------------------
const FAQ_ITEMS = [
  {
    q: 'What does Lifetime actually cover?',
    a: `The planned Lifetime terms include everything in Monthly — unlimited projects, the full toolkit, and 8 GB of cloud storage — plus a permanent licence for the purchased desktop version and updates released for that version. It includes ${HOSTING_INCLUDED_YEARS} years of cloud sync. After that, renew sync for £${HOSTING_RENEWAL_FEE_GBP}/year or keep writing in desktop Local Mode without a hosting fee. The desktop workspace is still being completed and paid plans are not yet on sale.`,
  },
  {
    q: 'Why isn\'t the desktop app included in Monthly?',
    a: 'At paid launch, the desktop app is planned as a one-time-purchase benefit for Lifetime and Founder. Monthly covers the web app, unlimited projects, and cloud sync while subscribed.',
  },
  {
    q: 'Can I switch from Monthly to Lifetime later?',
    a: 'This upgrade path is planned for paid launch. It will be managed from Account Settings → Membership, with Monthly cancellation handled through the billing portal.',
  },
  {
    q: 'What is the cloud hosting renewal?',
    a: `The planned cloud hosting renewal is £${HOSTING_RENEWAL_FEE_GBP}/year. It applies to Lifetime after the included ${HOSTING_INCLUDED_YEARS}-year period and covers hosted sync, storage, and cloud backups. Without renewal, the desktop licence remains active and projects can be edited in Local Mode; web access falls back to Free limits. Cloud sync is unavailable while hosting is inactive.`,
  },
  {
    q: 'What happens if I don\'t renew cloud hosting?',
    a: `You keep access to the purchased desktop version in Local Mode and can continue editing, importing, and exporting projects stored on that device. Web access falls back to the Free plan's one-project, ${freePlanDef?.storageLabelShort} allowance until you renew.`,
  },
  {
    q: 'How many Founder slots are there?',
    a: `Founder membership is planned to be capped at ${FOUNDER_SLOTS_TOTAL} completed purchases. Availability will be confirmed at checkout. Founders receive cloud sync for the life of the YOW service without a renewal fee, within the published storage and fair-use limits.`,
  },
  {
    q: 'Do Monthly subscribers pay a cloud hosting renewal?',
    a: `No. Monthly is ${monthlyPlanDef?.priceLabel}/month, and that includes cloud sync for as long as you're subscribed. The renewal fee only applies to Lifetime plan holders once their included hosting period ends.`,
  },
  {
    q: 'What happens to my data if I downgrade to Free?',
    a: `You retain ownership of your work. If you downgrade, you'll pick one project to keep as your active workspace within the Free plan's ${freePlanDef?.storageLabelShort} allowance. Other retained projects become view-only and can be exported; AI tools lock until you upgrade again. We recommend exporting a ZIP backup before changing plans.`,
  },
  {
    q: 'Can I cancel my Monthly subscription?',
    a: 'Yes, any time, from Account Settings → Membership. You keep full access until the end of your current billing period — no penalty, no retention calls.',
  },
  {
    q: 'What does "connect your own AI provider" mean?',
    a: 'On a paid plan, you add an API key from a supported provider such as OpenRouter, Anthropic, Google AI, or another compatible service in Account Settings. A consumer ChatGPT Plus or Claude Pro subscription does not automatically include API access. You pay the provider directly for usage, and YOW does not add a markup. The Free plan does not include AI features.',
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

function PricingCard({ plan, onSelect, onFreeStart, busy }) {
  const isFree = plan.key === 'free'

  return (
    <article
      className={`pricing-card${plan.highlight ? ' pricing-card--highlight' : ''}`}
      aria-label={`${plan.label} plan — ${plan.priceLabel}`}
    >
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
          onClick={() => onSelect && onSelect(plan.key)}
          disabled={busy}
        >
          {busy
            ? 'Opening…'
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

function getInterestPlanFromLocation() {
  const params = new URLSearchParams(window.location.search)
  const requestedPlanKey = params.get('interest')
  if (!requestedPlanKey) return null
  return PLANS.find(plan => plan.key === requestedPlanKey && plan.key !== 'free') || null
}

// --------------------------------------------------------------------------
// Main page
// --------------------------------------------------------------------------
export default function PricingPage({ onGetStarted, onSignIn, user }) {
  const [openFaq, setOpenFaq]   = useState(null)
  const [billingError, setBillingError] = useState('')
  const [interestPlan, setInterestPlan] = useState(() => getInterestPlanFromLocation())

  usePageMeta({
    path: '/pricing/',
    title: 'Pricing — Your Own World | Worldbuilding & Writing Software',
    description: `Start Your Own World free. Review planned paid-launch terms for Monthly at ${monthlyPlanDef?.priceLabel}/month, Lifetime at ${lifetimePlanDef?.priceLabel}, and Founder.`,
  })

  // Inject / remove JSON-LD schemas while this page is mounted.
  useEffect(() => {
    injectSchema('ld-pricing-page', {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Pricing — Your Own World',
      description: 'Start free now and review the planned paid-launch terms for Monthly, Lifetime, and Founder membership.',
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
            availability: 'https://schema.org/PreOrder',
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
        availability: p.key === 'free' ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
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
    const params = new URLSearchParams(window.location.search)
    params.set('interest', planKey)
    const nextUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState(null, '', nextUrl)
    setInterestPlan(PLANS.find(plan => plan.key === planKey) || { key: planKey, label: 'Paid plan' })
  }

  const closeInterest = () => {
    setInterestPlan(null)
    const params = new URLSearchParams(window.location.search)
    if (!params.has('interest')) return
    params.delete('interest')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
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
            Start with one fully featured project for free. Paid plans add more projects, storage,
            AI connections, and the planned desktop option shown below.
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
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>
            Free is available now. Paid plans and the desktop workspace are coming soon; paid buttons register interest and do not start a purchase.
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
            Paid plans are still coming soon. Compare the planned terms and register interest
            in the option that best fits how you expect to work.
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
                  'You want the planned desktop app with a permanent licence for the purchased version',
                  `You want a single ${lifetimePlanDef?.priceLabel} payment instead of a bill every month`,
                ],
              },
              {
                heading: 'Choose Founder if…',
                points: [
                  'You want cloud sync for the life of the YOW service with no renewal fee',
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

        {/* ── Support development ── */}
        <section aria-label="Support development" style={{ maxWidth: 640, margin: '0 auto', padding: '0 24px 8px' }}>
          <SupportDevelopmentLink variant="banner" />
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
        onClose={closeInterest}
        onCreateAccount={!user ? (email) => { closeInterest(); onGetStarted?.(email) } : undefined}
      />
    </div>
  )
}
