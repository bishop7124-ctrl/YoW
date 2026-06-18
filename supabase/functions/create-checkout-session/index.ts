import Stripe from 'npm:stripe@22.1.1'
import { createClient } from 'npm:@supabase/supabase-js@2.39.7'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2026-04-22.dahlia' })
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_ANON_KEY') || '',
)

const PRICE_ENV_BY_PLAN: Record<string, string> = {
  premium_monthly: 'STRIPE_PRICE_ID_PREMIUM_MONTHLY',
  premium_plus_lifetime: 'STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME',
  founder: 'STRIPE_PRICE_ID_FOUNDER',
  hosting_renewal: 'STRIPE_PRICE_ID_MAINTENANCE',
  maintenance: 'STRIPE_PRICE_ID_MAINTENANCE',
}

const ONE_TIME_PLANS = new Set(['premium_plus_lifetime', 'founder', 'hosting_renewal', 'maintenance'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') || ''
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (error || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  const payload = await req.json().catch(() => ({}))
  const plan = typeof payload.plan === 'string' ? payload.plan : 'premium_monthly'
  const priceEnv = PRICE_ENV_BY_PLAN[plan]
  if (!priceEnv) return jsonResponse({ error: 'Unknown billing plan' }, 400)

  const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173'
  const priceId = Deno.env.get(priceEnv)
  if (!priceId) return jsonResponse({ error: `Missing ${priceEnv}` }, 500)
  const mode: Stripe.Checkout.SessionCreateParams.Mode = ONE_TIME_PLANS.has(plan) ? 'payment' : 'subscription'

  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    mode,
    customer: user.app_metadata?.stripe_customer_id || undefined,
    customer_email: user.app_metadata?.stripe_customer_id ? undefined : user.email || undefined,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { user_id: user.id, plan },
    success_url: `${siteUrl}/?billing=success`,
    cancel_url: `${siteUrl}/?billing=cancelled`,
  }

  if (mode === 'subscription') {
    sessionConfig.subscription_data = {
      billing_mode: { type: 'flexible' },
      metadata: { user_id: user.id, plan },
    }
  } else if (!user.app_metadata?.stripe_customer_id) {
    sessionConfig.customer_creation = 'always'
  }

  const session = await stripe.checkout.sessions.create(sessionConfig)

  return jsonResponse({ url: session.url })
})
