import { useEffect, useState } from 'react'
import { BILLING } from '../../utils/billingConfig'
import { HOSTING_RENEWAL_FEE_GBP, PLANS } from '../../utils/membership'
import { supabase } from '../../supabase'
import BetaInterestModal from '../account/BetaInterestModal'
import MarketingNav from '../marketing/MarketingNav'
import MarketingFooter from '../marketing/MarketingFooter'
import SupportDevelopmentLink from '../marketing/SupportDevelopmentLink'
import { usePageMeta } from '../../utils/usePageMeta'
import './PricingPage.css'

const freePlan = PLANS.find(plan => plan.key === 'free')
const monthlyPlan = PLANS.find(plan => plan.key === 'premium_monthly')
const lifetimePlan = PLANS.find(plan => plan.key === 'premium_plus_lifetime')
const DISPLAY_PLANS = [freePlan, monthlyPlan, lifetimePlan].filter(Boolean)
const PRIVATE_BILLING_TEST_KEY = 'aa89da09f1e82b6c1645732759eef068409979cec453eefe'
const CHECKOUT_ENDPOINT = import.meta.env.VITE_CREATE_CHECKOUT_SESSION_URL || '/api/create-checkout-session'

function isPrivateBillingTestLink() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('billing_test') === PRIVATE_BILLING_TEST_KEY
}

const FEATURES = [
  { label: 'Editable projects', free: '1', monthly: 'Unlimited', lifetime: 'Unlimited' },
  { label: 'Writing & worldbuilding toolkit', free: 'Included', monthly: 'Included', lifetime: 'Included' },
  { label: 'Cloud storage', free: freePlan?.storageLabelShort, monthly: monthlyPlan?.storageLabelShort, lifetime: lifetimePlan?.storageLabelShort },
  { label: 'Cloud sync', free: 'Free limits', monthly: 'While subscribed', lifetime: `Included, then £${HOSTING_RENEWAL_FEE_GBP}/year optional` },
  { label: 'Desktop & offline access', free: '—', monthly: 'While subscribed', lifetime: 'Permanent' },
  { label: 'Connect your own AI provider', free: '—', monthly: 'Included', lifetime: 'Included' },
  { label: 'Payment', free: 'No card required', monthly: 'Cancel any time', lifetime: 'One payment' },
]

const FAQ = [
  { q: 'What does Lifetime mean?', a: 'Lifetime is permanent access to the YOW application you purchase, including desktop and offline use. It is separate from optional hosted Cloud access and does not promise that every future feature or service will be provided indefinitely.' },
  { q: 'What is the Founding Price?', a: `The first 100 genuine Lifetime customers pay £${BILLING.foundingLifetimePrice} once, receive permanent Founder status and two included years of YOW Cloud. After those 100 successful purchases, Lifetime is £${BILLING.lifetimePrice} once with one included Cloud year.` },
  { q: 'What happens after my included Cloud period?', a: `You can renew YOW Cloud for £${HOSTING_RENEWAL_FEE_GBP} per year. If you decline, your Lifetime licence and Founder status remain active and you can keep working locally and offline. Cloud sync and hosted storage fall back to the applicable Free limits until you renew.` },
  { q: 'What happens if I cancel Monthly?', a: 'Your account falls back to Free limits after the paid period ends. Your work is not deleted: you choose one project to keep editable and can continue to view and export retained projects.' },
  { q: 'Can I use the desktop app on Monthly?', a: 'Yes. Monthly includes desktop and offline access while the subscription is active. Lifetime keeps desktop and offline access permanently.' },
  { q: 'Does Lifetime guarantee future updates?', a: 'Buy YOW for what it is today. Enjoy what we add tomorrow. Lifetime is permanent product access, not a promise of a particular roadmap or an indefinite schedule of new features.' },
]

function injectSchema(id, value) {
  let node = document.getElementById(id)
  if (!node) {
    node = document.createElement('script')
    node.id = id
    node.type = 'application/ld+json'
    document.head.appendChild(node)
  }
  node.textContent = JSON.stringify(value)
}

function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="7" fill="var(--accent)" fillOpacity=".15" /><path d="M4 7l2 2 4-4" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function PricingCard({ plan, foundingAvailable, onSelect, onFreeStart, checkoutBusy = false }) {
  const free = plan.key === 'free'
  const lifetime = plan.key === 'premium_plus_lifetime'
  const founding = lifetime && foundingAvailable
  const price = founding ? `£${BILLING.foundingLifetimePrice}` : plan.priceLabel
  return (
    <article className={`pricing-card${plan.highlight ? ' pricing-card--highlight' : ''}`} aria-label={`${plan.label} plan — ${price}`}>
      {plan.badge && <div className="pricing-card-ribbon">{founding ? 'Founding price' : plan.badge}</div>}
      <h2 className="pricing-card-title">{plan.label}</h2>
      <div className="pricing-card-price"><span>{price}</span>{plan.priceSuffix && <small>{plan.priceSuffix}</small>}</div>
      {founding
        ? <p className="pricing-card-valuenote">First 100 Lifetime customers · normally £{BILLING.lifetimePrice}</p>
        : plan.valueNote && <p className="pricing-card-valuenote">{plan.valueNote}</p>}
      <p className="pricing-card-description">
        {founding
          ? `Be one of YOW’s first 100 owners and get Lifetime for £${BILLING.foundingLifetimePrice}, plus 2 years of YOW Cloud included.`
          : plan.longDescription || plan.description}
      </p>
      {plan.keyBenefit && <div className="pricing-card-keybenefit"><span aria-hidden="true">{plan.keyBenefit.icon}</span><span>{plan.keyBenefit.label}</span></div>}
      <ul className="pricing-card-features">
        {(founding ? [
          'Permanent YOW Lifetime licence', 'Unlimited projects', 'Permanent desktop and offline access',
          '2 years of YOW Cloud included', `Then £${HOSTING_RENEWAL_FEE_GBP}/year optional Cloud`, 'Permanent Founder status and number',
        ] : plan.features).map(feature => <li key={feature}><CheckIcon /><span>{feature}</span></li>)}
      </ul>
      {plan.disclaimer && !founding && <p className="pricing-card-disclaimer">{plan.disclaimer}</p>}
      <button type="button" className={`pricing-card-cta${plan.highlight ? ' pricing-card-cta--solid' : ''}`} disabled={!free && checkoutBusy} onClick={free ? onFreeStart : () => onSelect(plan.key)}>
        {!free && checkoutBusy ? 'Opening Stripe…' : free ? 'Start for free' : lifetime ? 'Choose Lifetime' : 'Choose Monthly'}
      </button>
      {free && <p className="pricing-card-caption">No card required</p>}
    </article>
  )
}

function FaqItem({ item, open, onToggle }) {
  return <div className="pricing-faq-item"><button type="button" onClick={onToggle} aria-expanded={open}><span>{item.q}</span><span aria-hidden="true">{open ? '−' : '+'}</span></button>{open && <p>{item.a}</p>}</div>
}

export default function PricingPage({ onGetStarted, onSignIn, user }) {
  const [interestPlan, setInterestPlan] = useState(null)
  const [openFaq, setOpenFaq] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [checkoutPlan, setCheckoutPlan] = useState(null)
  const [checkoutError, setCheckoutError] = useState('')
  const billingTest = isPrivateBillingTestLink()
  // Stripe test mode deliberately exercises the Founding checkout without
  // consuming or depending on the live Founder inventory.
  const foundingAvailable = billingTest || (Number.isInteger(availability?.remaining) && availability.remaining > 0)

  usePageMeta({ path: '/pricing/', title: 'YOW Pricing — Free, Monthly or Lifetime', description: 'Own your writing software. The first 100 YOW Lifetime customers pay £49.99 once; standard Lifetime is £74.99, Monthly is £9.99, and Free includes one editable project.' })

  useEffect(() => {
    let active = true
    fetch(import.meta.env.VITE_GET_FOUNDER_SLOTS_URL || '/api/get-founder-slots')
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (active && Number.isInteger(data?.remaining)) setAvailability(data) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!billingTest) return undefined
    const existing = document.querySelector('meta[name="robots"]')
    const previous = existing?.getAttribute('content')
    const robots = existing || document.createElement('meta')
    robots.setAttribute('name', 'robots')
    robots.setAttribute('content', 'noindex, nofollow, noarchive')
    if (!existing) document.head.appendChild(robots)
    return () => {
      if (!existing) robots.remove()
      else if (previous == null) robots.removeAttribute('content')
      else robots.setAttribute('content', previous)
    }
  }, [billingTest])

  const startTestCheckout = async plan => {
    if (!user) {
      setCheckoutError('Sign in to a disposable YOW test account first, then open this private link again.')
      onSignIn?.()
      return
    }

    setCheckoutPlan(plan)
    setCheckoutError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Your sign-in has expired. Please sign in again, then reopen this link.')
      const response = await fetch(CHECKOUT_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.url) throw new Error(body.error || `Checkout could not be opened. (${response.status})`)
      window.location.assign(body.url)
    } catch (error) {
      setCheckoutError(error.message || 'Checkout could not be opened.')
      setCheckoutPlan(null)
    }
  }

  const selectPaidPlan = key => {
    if (billingTest) startTestCheckout(key)
    else setInterestPlan(PLANS.find(item => item.key === key))
  }

  useEffect(() => {
    injectSchema('ld-pricing-page', { '@context': 'https://schema.org', '@type': 'Product', name: 'Your Own World writing software', offers: DISPLAY_PLANS.map(plan => ({ '@type': 'Offer', name: plan.label, price: plan.price, priceCurrency: 'GBP', availability: plan.key === 'free' ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder', url: 'https://www.yourownworld.co.uk/pricing/' })) })
    injectSchema('ld-pricing-faq', { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(item => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })) })
    return () => { document.getElementById('ld-pricing-page')?.remove(); document.getElementById('ld-pricing-faq')?.remove() }
  }, [])

  return (
    <div className="marketing-shell pricing-page">
      <MarketingNav activePath="/pricing/" user={user} onGetStarted={onGetStarted} />
      <main>
        <section className="pricing-hero">
          <p className="eyebrow">Simple, honest pricing</p>
          <h1>Own your writing software.</h1>
          <p className="pricing-hero-lead">Lifetime access. One payment.</p>
          <p className="pricing-hero-copy">Choose Free to begin, Monthly for a smaller upfront cost, or Lifetime for permanent desktop and offline access. Cloud stays a separate, optional service after the included period.</p>
          <div className="pricing-trust-row"><span className="pricing-trust-chip"><CheckIcon /> One editable project free</span><span className="pricing-trust-chip"><CheckIcon /> Cancel Monthly any time</span><span className="pricing-trust-chip"><CheckIcon /> Lifetime works without Cloud</span></div>
          {billingTest ? (
            <aside className="pricing-test-panel" aria-label="Private Stripe test checkout">
              <strong>Private Stripe test checkout</strong>
              <p>This page uses Stripe test mode. No real money can be taken. Sign in with a disposable YOW account, choose Monthly or Lifetime below, then use Stripe card <code>4242 4242 4242 4242</code> with any future expiry and any CVC.</p>
              <button type="button" disabled={!!checkoutPlan} onClick={() => startTestCheckout('hosting_renewal')}>
                {checkoutPlan === 'hosting_renewal' ? 'Opening Stripe…' : 'Test £6/year Cloud renewal'}
              </button>
              {checkoutError && <p className="pricing-test-error" role="alert">{checkoutError}</p>}
            </aside>
          ) : (
            <p className="pricing-availability-note">Free is available now. Paid checkout remains closed while billing is being tested; paid buttons register interest and never create a charge.</p>
          )}
        </section>

        <section className="pricing-cards" aria-label="Pricing plans">
          {DISPLAY_PLANS.map(plan => <PricingCard key={plan.key} plan={plan} foundingAvailable={foundingAvailable} checkoutBusy={!!checkoutPlan} onSelect={selectPaidPlan} onFreeStart={onGetStarted} />)}
        </section>

        <aside className="pricing-first-100" aria-labelledby="first-100-heading">
          <p className="eyebrow">The first 100</p><h2 id="first-100-heading">A permanent little thank-you.</h2>
          <p>The first 100 writers to complete a YOW Lifetime purchase pay £{BILLING.foundingLifetimePrice}, receive two included Cloud years and become numbered YOW Founders. Their actual plan remains Lifetime.</p>
          {Number.isInteger(availability?.remaining) && <p className="pricing-first-100-count" aria-live="polite">{availability.remaining} of {availability.total} Founder spots currently available</p>}
        </aside>

        <section className="pricing-comparison" aria-labelledby="comparison-heading"><p className="eyebrow">Compare</p><h2 id="comparison-heading">Three plans. One complete workspace.</h2><div className="pricing-table-wrap"><table className="pricing-table"><thead><tr><th>Feature</th><th>Free</th><th>Monthly</th><th className="col-highlight">Lifetime</th></tr></thead><tbody>{FEATURES.map(row => <tr key={row.label}><td>{row.label}</td><td data-label="Free">{row.free}</td><td data-label="Monthly">{row.monthly}</td><td data-label="Lifetime" className="col-highlight">{row.lifetime}</td></tr>)}</tbody></table></div></section>

        <section className="pricing-philosophy" aria-labelledby="philosophy-heading"><p className="eyebrow">Built independently</p><h2 id="philosophy-heading">Buy YOW for what it is today. Enjoy what we add tomorrow.</h2><p>YOW was made because writing and worldbuilding became too complicated to keep scattered across documents, spreadsheets and apps. The aim is useful software writers can own—not another expensive subscription built on promises about a future roadmap.</p></section>
        <section className="pricing-faq" aria-labelledby="faq-heading"><p className="eyebrow">The details</p><h2 id="faq-heading">Frequently asked questions</h2>{FAQ.map((item, index) => <FaqItem key={item.q} item={item} open={openFaq === index} onToggle={() => setOpenFaq(openFaq === index ? null : index)} />)}</section>
        <section className="pricing-support"><SupportDevelopmentLink variant="banner" /></section>
        <section className="pricing-final-cta"><h2>Your world is waiting.</h2><p>Start free. Upgrade when the way you work makes it worthwhile.</p><button type="button" className="btn btn-primary" onClick={onGetStarted}>Get started free</button></section>
      </main>
      <MarketingFooter />
      <BetaInterestModal open={!!interestPlan} user={user} planKey={interestPlan?.key} planLabel={interestPlan?.label} onClose={() => setInterestPlan(null)} onCreateAccount={!user ? () => { setInterestPlan(null); onGetStarted?.() } : undefined} />
    </div>
  )
}
