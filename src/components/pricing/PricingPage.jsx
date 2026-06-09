import { useEffect, useState } from 'react'
import { PLANS, FOUNDER_SLOTS_TOTAL } from '../../utils/membership'
import { supabase } from '../../supabase'
import MarketingNav from '../marketing/MarketingNav'

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
// Feature comparison table data
// --------------------------------------------------------------------------
const FEATURE_ROWS = [
  { label: 'Active projects',        free: '1',       launch: 'Unlimited', plus: 'Unlimited', founder: 'Unlimited', monthly: 'Unlimited' },
  { label: 'Storage',                free: '250 MB',  launch: '5 GB',      plus: '10 GB',     founder: '25 GB',     monthly: '10 GB'    },
  { label: 'All studio rooms',       free: '✓',       launch: '✓',         plus: '✓',         founder: '✓',         monthly: '✓'        },
  { label: 'Premium exports',        free: '—',       launch: '✓',         plus: '✓',         founder: '✓',         monthly: '✓'        },
  { label: 'Advanced exports',       free: '—',       launch: '—',         plus: '✓',         founder: '✓',         monthly: '✓'        },
  { label: 'Bring-your-own-key AI',  free: '✓',       launch: '✓',         plus: '✓',         founder: '✓',         monthly: '✓'        },
  { label: 'Future platform updates',free: '—',       launch: '—',         plus: '✓',         founder: '✓',         monthly: '✓'        },
  { label: 'Early feature access',   free: '—',       launch: '—',         plus: '✓',         founder: '✓',         monthly: '—'        },
  { label: 'Founder badge',          free: '—',       launch: '—',         plus: '—',         founder: '✓',         monthly: '—'        },
  { label: 'Feature your debut work',free: '—',       launch: '—',         plus: '—',         founder: '✓',         monthly: '—'        },
  { label: 'Priority feature input', free: '—',       launch: '—',         plus: '—',         founder: '✓',         monthly: '—'        },
  { label: 'Support tier',           free: 'Community',launch: 'Priority', plus: 'Priority',  founder: 'Priority',  monthly: 'Priority' },
  { label: 'Recurring fee',          free: 'None',    launch: 'None',      plus: 'None',      founder: 'None',      monthly: '£10/mo'   },
]

// --------------------------------------------------------------------------
// FAQ data
// --------------------------------------------------------------------------
const FAQ_ITEMS = [
  {
    q: 'What does "Lifetime Launch" actually cover?',
    a: 'Lifetime Launch gives you permanent access to the fully stacked launch version of Your Own World. You\'ll never be charged again, and the completed launch tool is yours to keep. It does not guarantee access to every future major platform update — that\'s what Premium Plus is for.',
  },
  {
    q: 'What\'s included in "future updates" on Premium Plus?',
    a: 'Premium Plus covers the ongoing evolution of the platform — new studio rooms, export formats, collaboration features, and anything else we ship. You pay once and your workspace grows with the product.',
  },
  {
    q: 'How many Founder slots are there?',
    a: `Founder membership is limited to ${FOUNDER_SLOTS_TOTAL} slots globally. Once they're gone, they're gone — the Founder tier will not be sold again. If you're considering it, don't wait.`,
  },
  {
    q: 'What happens to my data if I downgrade to Free?',
    a: 'Your projects, characters, lore, and maps are always yours. If you downgrade to Free, all your data remains intact and readable. You\'ll just designate one active project to edit — everything else becomes view-only until you upgrade again.',
  },
  {
    q: 'Can I cancel my Monthly Creator subscription?',
    a: 'Yes. Cancel any time from your account settings via the billing portal. You\'ll retain full access until the end of your current billing period.',
  },
  {
    q: 'What is bring-your-own-key AI?',
    a: 'Your Own World supports connecting your own API keys from providers like OpenRouter, Google AI, or Anthropic. This means you pay your AI provider directly — YOW never marks up AI usage. All plans include this.',
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
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: 'var(--accent-fade)', border: '1px solid var(--accent)',
      borderRadius: 99, padding: '6px 14px',
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

function PricingCard({ plan, onSelect, busy, founderSlots }) {
  const isFounder = plan.isFounder
  const soldOut   = isFounder && founderSlots !== null && founderSlots?.remaining === 0

  return (
    <article
      style={{
        position: 'relative',
        borderRadius: 14,
        border: `1.5px solid ${plan.highlight ? 'var(--accent)' : 'var(--border)'}`,
        background: plan.highlight ? 'var(--accent-fade)' : 'var(--bg-nav)',
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
      aria-label={`${plan.label} plan — ${plan.priceLabel}`}
    >
      {/* Badge */}
      {plan.badge && (
        <div style={{
          position: 'absolute', top: -12, left: 20,
          background: plan.highlight ? 'var(--accent)' : 'var(--bg-nav)',
          border: `1px solid ${plan.highlight ? 'var(--accent)' : 'var(--border)'}`,
          color: plan.highlight ? 'var(--bg-main)' : 'var(--text-muted)',
          fontSize: 10, fontWeight: 900, letterSpacing: '.08em',
          textTransform: 'uppercase', borderRadius: 99,
          padding: '3px 10px',
        }}>
          {plan.badge}
        </div>
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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '4px 0 14px' }}>
        <span style={{
          fontSize: plan.key === 'free' ? 26 : 34,
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

      {/* Description */}
      <p style={{
        fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)',
        margin: '0 0 20px',
      }}>
        {plan.longDescription || plan.description}
      </p>

      {/* CTA */}
      {plan.key !== 'free' && (
        <button
          type="button"
          onClick={() => onSelect && !soldOut && onSelect(plan.key)}
          disabled={busy || soldOut}
          style={{
            width: '100%',
            padding: '12px 0',
            borderRadius: 8,
            border: plan.highlight ? 'none' : `1.5px solid var(--accent)`,
            background: plan.highlight ? 'var(--accent)' : 'transparent',
            color: plan.highlight ? 'var(--bg-main)' : 'var(--accent)',
            fontSize: 14, fontWeight: 800,
            cursor: busy || soldOut ? 'not-allowed' : 'pointer',
            opacity: busy || soldOut ? 0.55 : 1,
            marginBottom: 20,
            transition: 'opacity .15s',
          }}
        >
          {busy
            ? 'Opening…'
            : soldOut
              ? 'Sold out'
              : isFounder
                ? 'Claim Founder status'
                : plan.interval === 'month'
                  ? 'Start monthly'
                  : 'Get lifetime access'}
        </button>
      )}

      {plan.key === 'free' && (
        <div style={{
          width: '100%', padding: '12px 0', marginBottom: 20,
          textAlign: 'center', fontSize: 13, fontWeight: 700,
          color: 'var(--text-muted)',
        }}>
          Free forever — no card required
        </div>
      )}

      {/* Features list */}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {plan.features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ marginTop: 2, flexShrink: 0 }}><CheckIcon /></span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{f}</span>
          </li>
        ))}
      </ul>

      {/* Disclaimer for Lifetime Launch */}
      {plan.disclaimer && (
        <p style={{
          marginTop: 16, fontSize: 11, color: 'var(--text-muted)',
          lineHeight: 1.5, fontStyle: 'italic',
        }}>
          {plan.disclaimer}
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

// --------------------------------------------------------------------------
// Main page
// --------------------------------------------------------------------------
export default function PricingPage({ onGetStarted, onSignIn, user }) {
  const founderSlots = useFounderSlots()
  const [openFaq, setOpenFaq]   = useState(null)
  const [busy, setBusy]         = useState('')
  const [billingError, setBillingError] = useState('')

  // Inject / remove JSON-LD schemas while this page is mounted.
  useEffect(() => {
    injectSchema('ld-pricing-page', {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Pricing — Your Own World',
      description: 'Simple, honest pricing for worldbuilding and writing software. Free plan, lifetime access, and monthly subscription options.',
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

    // Update page title and meta description for this route.
    const prevTitle = document.title
    const prevDesc  = document.querySelector('meta[name="description"]')?.content
    document.title  = 'Pricing — Your Own World | Worldbuilding & Writing Software'
    const descEl = document.querySelector('meta[name="description"]')
    if (descEl) descEl.setAttribute('content', 'Simple, honest pricing for Your Own World — the all-in-one worldbuilding and writing platform. Free plan, lifetime access from £149, or £10/month. No hidden fees.')

    return () => {
      removeSchema('ld-pricing-page')
      removeSchema('ld-pricing-product')
      removeSchema('ld-pricing-faq')
      document.title = prevTitle
      if (descEl && prevDesc) descEl.setAttribute('content', prevDesc)
    }
  }, [])

  const handleSelect = async (planKey) => {
    if (!planKey) return
    if (!user) {
      // Not logged in — send to sign-up / sign-in
      onGetStarted?.()
      return
    }
    // Logged-in user — initiate checkout
    const endpoint = import.meta.env.VITE_CREATE_CHECKOUT_SESSION_URL
    if (!endpoint) {
      setBillingError('Billing is not configured yet. Please try again later.')
      return
    }
    try {
      setBusy(planKey)
      setBillingError('')
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan: planKey, currency: 'gbp' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Could not open billing. Please try again.')
      }
      const { url } = await res.json()
      window.location.assign(url)
    } catch (err) {
      setBillingError(err.message || 'Something went wrong.')
    } finally {
      setBusy('')
    }
  }

  // Display plans in the order: Free, Lifetime Launch, Premium Plus, Founder, Monthly Creator
  const displayPlans = [
    PLANS.find(p => p.key === 'free'),
    PLANS.find(p => p.key === 'premium_lifetime'),
    PLANS.find(p => p.key === 'premium_plus_lifetime'),
    PLANS.find(p => p.key === 'founder'),
    PLANS.find(p => p.key === 'premium_monthly'),
  ].filter(Boolean)

  const pageBg = 'var(--bg-main)'

  return (
    <div style={{ minHeight: '100vh', background: pageBg, color: 'var(--text-main)' }}>
      <MarketingNav activePath="/pricing/" user={user} onLogin={onSignIn} onGetStarted={onGetStarted} />

      <main>
        {/* ── Hero ── */}
        <section
          aria-labelledby="pricing-hero-heading"
          style={{
            textAlign: 'center',
            padding: 'clamp(48px, 8vw, 96px) 24px clamp(40px, 6vw, 72px)',
            maxWidth: 700, margin: '0 auto',
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
            maxWidth: 560, margin: '0 auto 32px',
          }}>
            Start free. Upgrade when your world demands it. No subscriptions required — one payment unlocks
            the platform and keeps it yours.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onGetStarted}
              style={{
                background: 'var(--accent)', border: 'none',
                color: 'var(--bg-main)', borderRadius: 9,
                padding: '13px 28px', fontSize: 15, fontWeight: 800, cursor: 'pointer',
              }}
            >
              Start for free
            </button>
            <a
              href="#comparison"
              style={{
                display: 'inline-flex', alignItems: 'center',
                border: '1px solid var(--border)', borderRadius: 9,
                padding: '13px 28px', fontSize: 15, fontWeight: 700,
                color: 'var(--text-muted)', textDecoration: 'none',
              }}
            >
              Compare plans
            </a>
          </div>
        </section>

        {/* ── Founder counter (above cards) ── */}
        {founderSlots !== null && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32, padding: '0 24px' }}>
            <FounderSlotsCounter slots={founderSlots} />
          </div>
        )}

        {/* ── Plan cards ── */}
        <section
          aria-label="Pricing plans"
          style={{
            maxWidth: 1160, margin: '0 auto',
            padding: '0 24px 80px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 16,
          }}
        >
          {displayPlans.map(plan => (
            <PricingCard
              key={plan.key}
              plan={plan}
              onSelect={handleSelect}
              busy={busy === plan.key}
              founderSlots={founderSlots}
            />
          ))}
        </section>

        {billingError && (
          <p style={{
            textAlign: 'center', color: '#ef4444', fontSize: 13,
            fontWeight: 600, maxWidth: 480, margin: '-40px auto 48px',
          }}>
            {billingError}
          </p>
        )}

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
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table
              role="table"
              style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  <th style={{
                    textAlign: 'left', padding: '10px 12px',
                    color: 'var(--text-muted)', fontWeight: 700,
                    borderBottom: '1px solid var(--border)',
                    fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase',
                    width: '24%',
                  }}>
                    Feature
                  </th>
                  {['Free', 'Launch Ed.', 'Creator', 'Founder', 'Monthly'].map((h, i) => (
                    <th key={h} style={{
                      textAlign: 'center', padding: '10px 8px',
                      color: i === 2 ? 'var(--accent)' : 'var(--text-muted)',
                      fontWeight: i === 2 ? 900 : 700,
                      borderBottom: `2px solid ${i === 2 ? 'var(--accent)' : 'var(--border)'}`,
                      fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase',
                      minWidth: 80,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map((row, ri) => (
                  <tr key={row.label} style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--bg-nav)' }}>
                    <td style={{
                      padding: '12px 12px', color: 'var(--text-main)',
                      fontWeight: 600, borderRight: '1px solid var(--border)',
                    }}>
                      {row.label}
                    </td>
                    {[row.free, row.launch, row.plus, row.founder, row.monthly].map((val, ci) => (
                      <td key={ci} style={{
                        textAlign: 'center', padding: '12px 8px',
                        color: val === '✓' ? 'var(--accent)' : val === '—' ? 'var(--border)' : 'var(--text-muted)',
                        fontWeight: val === '✓' ? 900 : 500,
                        borderLeft: ci === 2 ? '1px solid var(--accent)' : undefined,
                        borderRight: ci === 2 ? '1px solid var(--accent)' : undefined,
                      }}>
                        {val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Lifetime vs Monthly explainer ── */}
        <section
          aria-labelledby="lifetime-explainer-heading"
          style={{
            maxWidth: 800, margin: '0 auto',
            padding: '0 24px 96px',
            textAlign: 'center',
          }}
        >
          <h2
            id="lifetime-explainer-heading"
            style={{
              fontSize: 'clamp(20px, 3.5vw, 28px)', fontWeight: 900,
              letterSpacing: '-.015em', margin: '0 0 16px',
              color: 'var(--text-main)',
            }}
          >
            Lifetime or monthly? Here's the honest answer.
          </h2>
          <p style={{
            fontSize: 15, lineHeight: 1.8, color: 'var(--text-muted)',
            margin: '0 auto 28px', maxWidth: 620,
          }}>
            If you're committed to building your world and want to own your tools outright,
            a lifetime plan is a better investment. If you're still exploring or your needs
            change, Monthly Creator gives you full access with no commitment.
          </p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16, textAlign: 'left',
          }}>
            {[
              {
                heading: 'Choose lifetime if…',
                points: [
                  'You build worlds seriously and consistently',
                  'You want to own your software, not rent it',
                  'You prefer a single payment and no billing cycle',
                ],
              },
              {
                heading: 'Choose monthly if…',
                points: [
                  "You're exploring and not ready to commit",
                  'You prefer to spread the cost over time',
                  'Flexibility and cancel-anytime matters most',
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
              color: 'var(--bg-main)', borderRadius: 9,
              padding: '14px 36px', fontSize: 16, fontWeight: 900, cursor: 'pointer',
            }}
          >
            Get started — it's free
          </button>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '24px',
        textAlign: 'center',
        fontSize: 12, color: 'var(--text-muted)',
        lineHeight: 1.7,
      }}>
        <p style={{ margin: 0 }}>
          © {new Date().getFullYear()} Your Own World.&nbsp;
          All prices in GBP. Payments processed by Stripe.&nbsp;
          <a href="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Back to app</a>
        </p>
      </footer>
    </div>
  )
}
