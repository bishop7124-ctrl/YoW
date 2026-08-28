import { createClient } from 'npm:@supabase/supabase-js@2.39.7'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

// Edge-function counterpart of api/downgrade-to-free.js — keep both in sync.
// Direct plan reset to Free for accounts with no real Stripe subscription to
// cancel (e.g. a plan granted manually via direct SQL). Accounts with a real
// stripe_customer_id or stripe_subscription_id are refused and must cancel
// through create-customer-portal's Stripe-hosted flow instead.

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
    console.error('[downgrade-to-free] metadata update failed:', updateError)
    return jsonResponse({ error: 'Could not downgrade this account. Please try again.' }, 500)
  }

  return jsonResponse({ ok: true })
})
