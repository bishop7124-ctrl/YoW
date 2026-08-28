import { createClient } from '@supabase/supabase-js'

// Vercel API route — direct plan reset to Free for accounts that have no
// real Stripe subscription to cancel (e.g. a plan granted manually via
// direct SQL rather than a real checkout). Real paid accounts — anyone with
// a stripe_customer_id or stripe_subscription_id on file — are refused here
// and must go through api/create-customer-portal.js's Stripe-hosted
// cancellation instead, so this route can never be used to self-serve out
// of an actual paid subscription without Stripe's own proration/webhook
// handling.
//
// Called by AccountSettings.jsx's "Cancel plan" button as a fallback when
// create-customer-portal.js reports { code: 'no_stripe_customer' }.

export default async function handler(req, res) {
  const origin = req.headers.origin || process.env.SITE_URL || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' })

    const appMeta = user.app_metadata || {}
    if (appMeta.stripe_customer_id || appMeta.stripe_subscription_id) {
      return res.status(400).json({
        error: 'This account has a real Stripe subscription — use "Manage membership" to cancel it through Stripe.',
        code: 'has_stripe_subscription',
      })
    }

    if (!appMeta.subscription_plan && appMeta.subscription_status !== 'active') {
      return res.status(200).json({ ok: true, alreadyFree: true })
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
      console.error('[downgrade-to-free] metadata update failed:', updateError)
      return res.status(500).json({ error: 'Could not downgrade this account. Please try again.' })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[downgrade-to-free]', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
