import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const config = {
  api: { bodyParser: false },
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(Buffer.from(chunk)))
    req.on('end',  () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function getCurrentPeriodEnd(subscription) {
  const ends = subscription.items.data
    .map(item => item.current_period_end)
    .filter(v => typeof v === 'number')
  if (ends.length > 0) return Math.max(...ends)
  return subscription.cancel_at || subscription.trial_end || subscription.ended_at
}

// --------------------------------------------------------------------------
// Upsert user_profiles row (storage + founder tracking).
// Only called server-side with the service role key.
// --------------------------------------------------------------------------
async function upsertUserProfile(supabaseAdmin, userId, patch = {}) {
  const { error } = await supabaseAdmin
    .from('user_profiles')
    .upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  if (error) {
    console.warn('[stripe-webhook] user_profiles upsert failed:', error.message)
  }
}

// --------------------------------------------------------------------------
// Write subscription data to app_metadata for recurring plans.
// --------------------------------------------------------------------------
async function updateSubscriptionMembership(supabaseAdmin, subscription, fallbackUserId) {
  const userId = subscription.metadata?.user_id
    || (typeof subscription.latest_invoice !== 'string'
          ? subscription.latest_invoice?.metadata?.user_id
          : null)
    || fallbackUserId

  if (!userId) {
    console.warn('[stripe-webhook] Could not resolve user_id for subscription', subscription.id)
    return
  }

  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id

  const plan = subscription.metadata?.plan || 'premium_monthly'

  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  const existing = data?.user?.app_metadata || {}

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...existing,
      stripe_customer_id:                customerId,
      stripe_subscription_id:            subscription.id,
      subscription_status:               subscription.status,
      subscription_plan:                 plan,
      subscription_current_period_end:   getCurrentPeriodEnd(subscription),
      subscription_cancel_at_period_end: subscription.cancel_at_period_end,
    },
  })

  // Ensure a user_profiles row exists for storage tracking.
  await upsertUserProfile(supabaseAdmin, userId, {})

  // When a subscription is cancelled, record was_monthly so the free tier
  // knows to lock the active project selection.
  if (subscription.status === 'canceled') {
    const userMeta = data?.user?.user_metadata || {}
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...userMeta,
        was_monthly: true,
      },
    })
  }
}

// --------------------------------------------------------------------------
// Write lifetime plan data to app_metadata after a one-time payment.
// --------------------------------------------------------------------------
async function activateLifetimePlan(supabaseAdmin, session) {
  const userId = session.metadata?.user_id || session.client_reference_id
  const plan   = session.metadata?.plan

  if (!userId || !plan) {
    console.warn('[stripe-webhook] Missing user_id or plan for lifetime activation', session.id)
    return
  }

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id

  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  const existing = data?.user?.app_metadata || {}

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...existing,
      stripe_customer_id:    customerId,
      subscription_status:   'active',
      subscription_plan:     plan,
      lifetime_purchased_at: existing.lifetime_purchased_at || new Date().toISOString(),
    },
  })

  // Create/update user_profiles row. Set is_founder flag for Founder purchases.
  const profilePatch = { is_founder: plan === 'founder' }
  await upsertUserProfile(supabaseAdmin, userId, profilePatch)
}

// --------------------------------------------------------------------------
// Extend maintenance_expires_at by 1 year on successful maintenance payment.
// --------------------------------------------------------------------------
async function extendMaintenance(supabaseAdmin, userId) {
  if (!userId) {
    console.warn('[stripe-webhook] Missing user_id for maintenance extension')
    return
  }
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  const existing = data?.user?.app_metadata || {}
  const currentExpiry = existing.maintenance_expires_at
    ? new Date(existing.maintenance_expires_at)
    : new Date()
  const base = currentExpiry > new Date() ? currentExpiry : new Date()
  const newExpiry = new Date(base.getTime() + 365 * 24 * 60 * 60 * 1000)
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: { ...existing, maintenance_expires_at: newExpiry.toISOString() },
  })
}

// --------------------------------------------------------------------------
// Webhook handler
// --------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const signature    = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return res.status(400).json({ error: 'Webhook not configured — STRIPE_WEBHOOK_SECRET missing' })
  }

  let event
  try {
    const rawBody = await getRawBody(req)
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message)
    return res.status(400).json({ error: err.message || 'Invalid signature' })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object

        if (session.metadata?.plan === 'maintenance') {
          // First maintenance subscription checkout — extend immediately.
          const userId = session.metadata?.user_id || session.client_reference_id
          await extendMaintenance(supabaseAdmin, userId)
        } else if (session.mode === 'payment') {
          // One-time lifetime purchase — activate immediately.
          await activateLifetimePlan(supabaseAdmin, session)
        } else if (session.subscription) {
          // Recurring subscription — retrieve full subscription object to get status.
          const subId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id
          const sub = await stripe.subscriptions.retrieve(subId, { expand: ['latest_invoice'] })
          // Carry the plan key from session metadata into subscription metadata if missing.
          if (!sub.metadata?.plan && session.metadata?.plan) {
            sub.metadata = { ...sub.metadata, plan: session.metadata.plan }
          }
          await updateSubscriptionMembership(
            supabaseAdmin, sub,
            session.metadata?.user_id || session.client_reference_id
          )
        }
        break
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const subId = typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id
            || (typeof invoice.parent?.subscription_details?.subscription === 'string'
                ? invoice.parent.subscription_details.subscription
                : invoice.parent?.subscription_details?.subscription?.id)
        if (!subId) break
        const latestSub = await stripe.subscriptions.retrieve(subId, { expand: ['latest_invoice'] })

        // Maintenance subscription renewal — extend access rather than updating membership plan.
        if (latestSub.metadata?.plan === 'maintenance' && event.type === 'invoice.paid') {
          const userId = latestSub.metadata?.user_id
            || invoice.metadata?.user_id
            || invoice.parent?.subscription_details?.metadata?.user_id
          await extendMaintenance(supabaseAdmin, userId)
          break
        }

        await updateSubscriptionMembership(
          supabaseAdmin, latestSub,
          invoice.metadata?.user_id || invoice.parent?.subscription_details?.metadata?.user_id
        )
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await updateSubscriptionMembership(supabaseAdmin, event.data.object)
        break

      default:
        break
    }
  } catch (err) {
    console.error('[stripe-webhook] Handler error for', event.type, err)
    return res.status(500).json({ error: err.message })
  }

  return res.status(200).json({ received: true })
}
