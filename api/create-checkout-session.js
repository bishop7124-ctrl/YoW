import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { applyCors } from './_cors.js'

// Maps plan keys to Stripe price IDs and checkout mode.
// Each price ID must be set as an env var on Vercel.
// STRIPE_PRICE_ID is kept as the legacy fallback for premium_monthly.
const PLAN_CONFIG = {
  premium_monthly:       { priceEnv: 'STRIPE_PRICE_ID_PREMIUM_MONTHLY',       mode: 'subscription', amount: 999, interval: 'month' },
  premium_plus_lifetime: { priceEnv: 'STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME', mode: 'payment', amount: 7499 },
  maintenance:           { priceEnv: 'STRIPE_PRICE_ID_MAINTENANCE',           mode: 'subscription', amount: 600, interval: 'year' },
  // The Account Settings "Renew Cloud Mode" button (and the pre-expiry
  // popup) send `hosting_renewal` — kept as an alias for `maintenance` so
  // both names route to the same Stripe price. See api/stripe-webhook.js,
  // which also treats these two plan keys as equivalent.
  hosting_renewal:       { priceEnv: 'STRIPE_PRICE_ID_MAINTENANCE',           mode: 'subscription', amount: 600, interval: 'year' },
}

function validatePrice(price, { amount, interval }, label) {
  const recurringInterval = price.recurring?.interval || null
  if (!price.active || price.currency !== 'gbp' || price.unit_amount !== amount || recurringInterval !== (interval || null)) {
    throw new Error(`${label} Stripe Price is not configured with the expected GBP amount and interval.`)
  }
}

export default async function handler(req, res) {
  applyCors(req, res, { methods: 'POST, OPTIONS', headers: 'authorization, content-type' })

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    )
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' })

    const { plan = 'premium_monthly' } = req.body || {}
    const planConfig = PLAN_CONFIG[plan]
    if (!planConfig) return res.status(400).json({ error: `Unknown plan: ${plan}` })

    // Prevent double-purchase: if the user already holds this plan, block the checkout.
    const existingPlan = user.app_metadata?.subscription_plan
    if (existingPlan && existingPlan === plan && plan !== 'premium_monthly') {
      return res.status(409).json({
        error: `You already have the ${plan} plan.`,
        code: 'already_purchased',
      })
    }

    // Fall back to the legacy STRIPE_PRICE_ID for premium_monthly.
    let priceId = process.env[planConfig.priceEnv]
      || (plan === 'premium_monthly' ? process.env.STRIPE_PRICE_ID : null)
    if (!priceId) return res.status(500).json({ error: `Price not configured for plan: ${plan}` })

    let founderReservationId = null
    let lifetimeOffer = null
    let lifetimeCloudYears = null
    const checkoutExpiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60

    if (plan === 'premium_plus_lifetime') {
      const foundingPriceId = process.env.STRIPE_PRICE_ID_FOUNDING_LIFETIME
      if (!foundingPriceId) return res.status(500).json({ error: 'Founding Lifetime price is not configured.' })
      const foundingPrice = await stripe.prices.retrieve(foundingPriceId)

      if (foundingPrice.livemode) {
        // Keep the inventory hold beyond Stripe's own Checkout expiry. Stripe's
        // expired event normally releases it immediately, while this 24-hour
        // buffer prevents a delayed webhook from reallocating a place after a
        // customer has already paid near the session deadline.
        const reservationExpiry = new Date((checkoutExpiresAt + 24 * 60 * 60) * 1000).toISOString()
        const { data: reservation, error: reservationError } = await supabaseAdmin.rpc('reserve_founder_checkout', {
          p_user_id: user.id,
          p_expires_at: reservationExpiry,
        })
        if (reservationError) throw new Error(`Founder checkout reservation failed: ${reservationError.message}`)
        if (reservation?.eligible && reservation.checkout_url) {
          return res.status(200).json({ url: reservation.checkout_url })
        }
        if (reservation?.eligible) {
          founderReservationId = reservation.reservation_id
          priceId = foundingPriceId
          lifetimeOffer = 'founding'
          lifetimeCloudYears = 2
        }
      } else {
        // Test-mode checkouts exercise the Founding Price without touching the
        // production Founder counter or awarding status in the webhook.
        priceId = foundingPriceId
        lifetimeOffer = 'founding_test'
        lifetimeCloudYears = 2
      }

      if (!lifetimeOffer) {
        lifetimeOffer = 'standard'
        lifetimeCloudYears = 1
      }
    }

    const selectedPrice = await stripe.prices.retrieve(priceId)
    validatePrice(
      selectedPrice,
      plan === 'premium_plus_lifetime' && lifetimeOffer?.startsWith('founding')
        ? { amount: 4999 }
        : planConfig,
      plan
    )

    const siteUrl = process.env.SITE_URL || 'http://localhost:5173'

    const sessionParams = {
      mode: planConfig.mode,
      customer:            user.app_metadata?.stripe_customer_id || undefined,
      customer_email:      user.app_metadata?.stripe_customer_id ? undefined : user.email || undefined,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        user_id: user.id,
        plan,
        ...(lifetimeOffer ? { lifetime_offer: lifetimeOffer, lifetime_cloud_years: String(lifetimeCloudYears) } : {}),
        ...(founderReservationId ? { founder_reservation_id: founderReservationId } : {}),
      },
      success_url: `${siteUrl}/?billing=success`,
      cancel_url:  `${siteUrl}/?billing=cancelled`,
      expires_at: checkoutExpiresAt,
    }

    if (planConfig.mode === 'subscription') {
      sessionParams.subscription_data = { metadata: { user_id: user.id, plan } }
    }

    if (planConfig.mode === 'payment') {
      sessionParams.payment_intent_data = { metadata: { user_id: user.id, plan } }
    }

    let session
    try {
      session = await stripe.checkout.sessions.create(sessionParams)
      if (founderReservationId) {
        const { data: bound, error: bindError } = await supabaseAdmin.rpc('bind_founder_checkout', {
          p_reservation_id: founderReservationId,
          p_user_id: user.id,
          p_checkout_session_id: session.id,
          p_checkout_url: session.url,
        })
        if (bindError || !bound) {
          await stripe.checkout.sessions.expire(session.id).catch(() => {})
          throw new Error(`Founder checkout could not be bound to its reservation: ${bindError?.message || 'reservation expired'}`)
        }
      }
    } catch (error) {
      if (founderReservationId) {
        await supabaseAdmin.rpc('release_founder_checkout', {
          p_reservation_id: founderReservationId,
          p_user_id: user.id,
        }).catch(() => {})
      }
      throw error
    }
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[create-checkout-session]', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
