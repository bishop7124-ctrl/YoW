import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Vercel API route — replaces supabase/functions/create-customer-portal
// Called by AccountSettings.jsx when a paid user clicks "Manage membership"

export default async function handler(req, res) {
  const origin = req.headers.origin || process.env.SITE_URL || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    // Uses the service role key so we can read app_metadata (stripe_customer_id)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' })

    const customerId = user.app_metadata?.stripe_customer_id
    if (!customerId) {
      // No real Stripe customer on this account — most commonly a plan that
      // was granted manually (e.g. via direct SQL) rather than through a
      // real checkout. The Stripe billing portal has nothing to manage for
      // this account; callers should fall back to api/downgrade-to-free.js.
      return res.status(404).json({
        error: 'No Stripe customer found. Complete a checkout first.',
        code: 'no_stripe_customer',
      })
    }

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
