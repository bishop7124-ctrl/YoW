import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Vercel API route — replaces supabase/functions/create-customer-portal
// Called by AccountSettings.jsx when a paid user clicks "Manage membership"

async function downgradeSqlOnlyAccountToFree(supabase, user) {
  const appMeta = user.app_metadata || {}
  if (appMeta.stripe_customer_id || appMeta.stripe_subscription_id) {
    return {
      status: 400,
      body: {
        error: 'This account has a real Stripe subscription — use "Manage membership" to cancel it through Stripe.',
        code: 'has_stripe_subscription',
      },
    }
  }

  if (!appMeta.subscription_plan && appMeta.subscription_status !== 'active') {
    return { status: 200, body: { ok: true, alreadyFree: true } }
  }

  const userMeta = user.user_metadata || {}
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...appMeta,
      subscription_status: 'none',
      subscription_plan: null,
    },
    // Mirrors the stripe-webhook.js `customer.subscription.deleted` handler,
    // so a manually-granted plan downgrades to the same locked-free state
    // a real subscription cancellation would leave the account in.
    user_metadata: {
      ...userMeta,
      was_monthly: true,
    },
  })

  if (updateError) {
    console.error('[create-customer-portal] downgrade metadata update failed:', updateError)
    return { status: 500, body: { error: 'Could not downgrade this account. Please try again.' } }
  }

  return { status: 200, body: { ok: true } }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || process.env.SITE_URL || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Uses the service role key so we can read app_metadata (stripe_customer_id)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' })

    if (req.body?.action === 'downgrade_to_free') {
      const result = await downgradeSqlOnlyAccountToFree(supabase, user)
      return res.status(result.status).json(result.body)
    }

    const customerId = user.app_metadata?.stripe_customer_id
    if (!customerId) {
      // No real Stripe customer on this account — most commonly a plan that
      // was granted manually (e.g. via direct SQL) rather than through a
      // real checkout. The Stripe billing portal has nothing to manage for
      // this account; cancel callers should retry this same route with
      // { action: 'downgrade_to_free' }.
      return res.status(404).json({
        error: 'No Stripe customer found. Complete a checkout first.',
        code: 'no_stripe_customer',
      })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const siteUrl = process.env.SITE_URL || 'http://localhost:5173'
    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${siteUrl}/`,
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[create-customer-portal]', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
