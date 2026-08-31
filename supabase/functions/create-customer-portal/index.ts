import Stripe from 'npm:stripe@22.1.1'
import { createClient } from 'npm:@supabase/supabase-js@2.39.7'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2026-04-22.dahlia' })
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
)

async function downgradeSqlOnlyAccountToFree(user) {
  const appMeta = user.app_metadata || {}
  if (appMeta.stripe_customer_id || appMeta.stripe_subscription_id) {
    return jsonResponse({
      error: 'This account has a real Stripe subscription — use "Manage membership" to cancel it through Stripe.',
      code: 'has_stripe_subscription',
    }, 400)
  }

  if (!appMeta.subscription_plan && appMeta.subscription_status !== 'active') {
    return jsonResponse({ ok: true, alreadyFree: true })
  }

  const userMeta = user.user_metadata || {}
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...appMeta,
      subscription_status: 'none',
      subscription_plan: null,
    },
    user_metadata: {
      ...userMeta,
      was_monthly: true,
    },
  })

  if (updateError) {
    console.error('[create-customer-portal] downgrade metadata update failed:', updateError)
    return jsonResponse({ error: 'Could not downgrade this account. Please try again.' }, 500)
  }

  return jsonResponse({ ok: true })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  if (body?.action === 'downgrade_to_free') return downgradeSqlOnlyAccountToFree(user)

  const customerId = user.app_metadata?.stripe_customer_id
  if (!customerId) {
    // No real Stripe customer on this account (e.g. a plan granted manually
    // via direct SQL rather than a real checkout) — nothing for the portal
    // to manage. Cancel callers should retry this same function with
    // { action: 'downgrade_to_free' }.
    return jsonResponse({ error: 'No Stripe customer for this account yet.', code: 'no_stripe_customer' }, 404)
  }

  const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173'
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl}/`,
  })

  return jsonResponse({ url: session.url })
})
