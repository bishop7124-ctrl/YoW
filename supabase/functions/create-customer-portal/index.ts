import Stripe from 'npm:stripe@22.1.1'
import { createClient } from 'npm:@supabase/supabase-js@2.39.7'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2026-04-22.dahlia' })
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  const customerId = user.app_metadata?.stripe_customer_id
  if (!customerId) {
    // No real Stripe customer on this account (e.g. a plan granted manually
    // via direct SQL rather than a real checkout) — nothing for the portal
    // to manage. Callers should fall back to the downgrade-to-free function.
    return jsonResponse({ error: 'No Stripe customer for this account yet.', code: 'no_stripe_customer' }, 404)
  }

  const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173'
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl}/`,
  })

  return jsonResponse({ url: session.url })
})
