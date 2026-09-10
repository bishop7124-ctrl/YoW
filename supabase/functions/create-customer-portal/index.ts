import Stripe from 'npm:stripe@22.1.1'
import { createClient } from 'npm:@supabase/supabase-js@2.39.7'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

// Legacy edge function — superseded by api/create-customer-portal.js (the
// Vercel route VITE_CUSTOMER_PORTAL_URL actually points to). Kept in sync so
// it isn't a silent trap if anything ever points back at it. See that file's
// comments for why the no-customer / stale-customer fallback exists: an
// account whose plan was set directly via SQL (not a real Stripe checkout)
// has no real Stripe subscription for the billing portal to act on.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2026-04-22.dahlia' })
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
)

function isMissingStripeCustomerError(err: any): boolean {
  if (!err) return false
  if (err.code === 'resource_missing' && (!err.param || err.param === 'customer')) return true
  if (err.type === 'StripeInvalidRequestError' && /no such customer/i.test(err.message || '')) return true
  return false
}

// See api/create-customer-portal.js for why this gates the resource_missing
// fallback: a real Stripe-driven upgrade always sets these fields, so their
// total absence is what identifies a manually-SQL'd account rather than a
// genuine subscriber whose Stripe customer went missing.
function looksLikeManualUpgrade(appMetadata: any = {}): boolean {
  return !appMetadata.stripe_subscription_id
    && !appMetadata.subscription_current_period_end
    && !appMetadata.lifetime_purchased_at
}

async function downgradeToFreeLocally(user: any) {
  const existingApp = user.app_metadata || {}
  const wasMonthly = existingApp.subscription_plan === 'premium_monthly'

  const attributes: any = {
    app_metadata: {
      ...existingApp,
      subscription_status: 'none',
      subscription_plan: null,
    },
  }

  if (wasMonthly) {
    const existingUser = user.user_metadata || {}
    attributes.user_metadata = { ...existingUser, was_monthly: true }
  }

  await supabase.auth.admin.updateUserById(user.id, attributes)

  return { downgraded: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  const customerId = user.app_metadata?.stripe_customer_id
  if (!customerId) {
    const result = await downgradeToFreeLocally(user)
    return jsonResponse(result)
  }

  const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173'
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/`,
    })
    return jsonResponse({ url: session.url })
  } catch (stripeErr) {
    if (isMissingStripeCustomerError(stripeErr) && looksLikeManualUpgrade(user.app_metadata)) {
      const result = await downgradeToFreeLocally(user)
      return jsonResponse(result)
    }
    if (isMissingStripeCustomerError(stripeErr)) {
      console.error('[create-customer-portal] stripe_customer_id missing in Stripe for an account with real purchase history — needs manual review', user.id, (stripeErr as Error).message)
      return jsonResponse({ error: 'Your billing record could not be found. Please contact support so we can fix this without affecting your plan.' }, 409)
    }
    throw stripeErr
  }
})
