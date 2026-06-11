import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Maps plan keys to Stripe price IDs and checkout mode.
// Each price ID must be set as an env var on Vercel.
// STRIPE_PRICE_ID is kept as the legacy fallback for premium_monthly.
const PLAN_CONFIG = {
  premium_monthly:       { priceEnv: 'STRIPE_PRICE_ID_PREMIUM_MONTHLY',       mode: 'subscription' },
  premium_plus_lifetime: { priceEnv: 'STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME', mode: 'payment' },
  founder:               { priceEnv: 'STRIPE_PRICE_ID_FOUNDER',               mode: 'payment' },
  maintenance:           { priceEnv: 'STRIPE_PRICE_ID_MAINTENANCE',           mode: 'subscription' },
}

async function getRemainingFounderSlots(supabase) {
  const { data, error } = await supabase.rpc('get_founder_slot_info')
  if (error || !data) return null
  return typeof data.remaining === 'number' ? data.remaining : null
}

export default async function handler(req, res) {
  const origin = req.headers.origin || process.env.SITE_URL || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    )

    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' })

    const { plan = 'premium_monthly', currency = 'gbp' } = req.body || {}
    const planConfig = PLAN_CONFIG[plan]
    if (!planConfig) return res.status(400).json({ error: `Unknown plan: ${plan}` })

    // Block founder checkout if all slots are sold out.
    if (plan === 'founder') {
      const remaining = await getRemainingFounderSlots(supabase)
      if (remaining !== null && remaining <= 0) {
        return res.status(409).json({
          error: 'Founder slots are sold out. Join the waitlist to be notified if a slot opens.',
          code: 'founder_sold_out',
        })
      }
    }

    // Prevent double-purchase: if the user already holds this plan, block the checkout.
    const existingPlan = user.app_metadata?.subscription_plan
    if (existingPlan && existingPlan === plan && plan !== 'premium_monthly') {
      return res.status(409).json({
        error: `You already have the ${plan} plan.`,
        code: 'already_purchased',
      })
    }

    // Fall back to the legacy STRIPE_PRICE_ID for premium_monthly
    const priceId = process.env[planConfig.priceEnv]
      || (plan === 'premium_monthly' ? process.env.STRIPE_PRICE_ID : null)
    if (!priceId) return res.status(500).json({ error: `Price not configured for plan: ${plan}` })

    const siteUrl = process.env.SITE_URL || 'http://localhost:5173'

    const sessionParams = {
      mode: planConfig.mode,
      customer:            user.app_metadata?.stripe_customer_id || undefined,
      customer_email:      user.app_metadata?.stripe_customer_id ? undefined : user.email || undefined,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: user.id, plan },
      success_url: `${siteUrl}/?billing=success`,
      cancel_url:  `${siteUrl}/?billing=cancelled`,
    }

    if (planConfig.mode === 'subscription') {
      sessionParams.subscription_data = { metadata: { user_id: user.id, plan } }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[create-checkout-session]', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
