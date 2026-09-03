import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { applyCors } from './_lib/cors.js'

// Vercel API route — replaces supabase/functions/create-customer-portal
// Called by AccountSettings.jsx when a paid user clicks
// "Manage subscription & billing" / "Billing history & receipts" / "Downgrade to Free".
//
// Accounts upgraded through a real Stripe checkout always have
// `stripe_customer_id` set on app_metadata by the webhook (see
// api/stripe-webhook.js). Accounts whose plan was instead set directly via
// SQL (support/manual comps) have no real Stripe subscription for the
// billing portal to act on — routing them through Stripe 404s before ever
// reaching it, leaving the account stuck on its higher plan with no way to
// downgrade. Since there's nothing real for Stripe to cancel, we downgrade
// the account's local plan state directly instead of failing.

// Stripe throws a StripeInvalidRequestError with code 'resource_missing'
// (param 'customer') when a stored customer id no longer exists in Stripe.
export function isMissingStripeCustomerError(err) {
  if (!err) return false
  if (err.code === 'resource_missing' && (!err.param || err.param === 'customer')) return true
  if (err.type === 'StripeInvalidRequestError' && /no such customer/i.test(err.message || '')) return true
  return false
}

// A real Stripe-driven upgrade always sets these via the webhook (see
// updateSubscriptionMembership/activateLifetimePlan in api/stripe-webhook.js)
// alongside stripe_customer_id. Their total absence is what actually
// identifies an account whose plan was set directly via SQL rather than
// through a real Stripe purchase — used to gate the resource_missing
// fallback below so a genuine subscriber's stale/deleted Stripe customer
// can never be silently downgraded.
function looksLikeManualUpgrade(appMetadata = {}) {
  return !appMetadata.stripe_subscription_id
    && !appMetadata.subscription_current_period_end
    && !appMetadata.lifetime_purchased_at
}

// Resets local plan/entitlement state to Free in one atomic update. Used
// only when there is no real Stripe subscription to cancel — a real
// subscription must still go through Stripe (webhook-driven), never this
// direct path.
export async function downgradeToFreeLocally(supabaseAdmin, user) {
  const existingApp = user.app_metadata || {}
  const wasMonthly = existingApp.subscription_plan === 'premium_monthly'

  const attributes = {
    app_metadata: {
      ...existingApp,
      subscription_status: 'none',
      subscription_plan: null,
      ...(wasMonthly ? { was_monthly: true } : {}),
    },
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, attributes)
  if (error) throw error

  return { downgraded: true }
}

export default async function handler(req, res) {
  applyCors(req, res, { methods: 'POST, OPTIONS', headers: 'authorization, content-type' })

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    // Uses the service role key so we can read/write app_metadata (stripe_customer_id, subscription_*)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' })

    const customerId = user.app_metadata?.stripe_customer_id
    if (!customerId) {
      // No real Stripe record for this account (e.g. plan set directly via
      // SQL) — downgrade locally rather than failing.
      const result = await downgradeToFreeLocally(supabase, user)
      return res.status(200).json(result)
    }
    const siteUrl = process.env.SITE_URL || 'http://localhost:5173'
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer:   customerId,
        return_url: `${siteUrl}/`,
      })
      return res.status(200).json({ url: session.url })
    } catch (stripeErr) {
      if (isMissingStripeCustomerError(stripeErr) && looksLikeManualUpgrade(user.app_metadata)) {
        // The stored customer id doesn't exist in Stripe, AND nothing else on
        // this account indicates a real Stripe-driven purchase ever happened
        // — this is the manual-SQL case (or an equally fake stored id).
        // Downgrade locally instead of failing.
        const result = await downgradeToFreeLocally(supabase, user)
        return res.status(200).json(result)
      }
      if (isMissingStripeCustomerError(stripeErr)) {
        // Stripe doesn't recognize this customer id, but this account has
        // real subscription/purchase fields — likely a genuine subscriber
        // whose Stripe customer was deleted/migrated, not a fake account.
        // Do NOT silently destroy their entitlement; this needs human review.
        console.error('[create-customer-portal] stripe_customer_id missing in Stripe for an account with real purchase history — needs manual review', user.id, stripeErr.message)
        return res.status(409).json({ error: 'Your billing record could not be found. Please contact support so we can fix this without affecting your plan.' })
      }
      throw stripeErr
    }
  } catch (err) {
    console.error('[create-customer-portal]', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
