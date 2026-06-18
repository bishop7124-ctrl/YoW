import Stripe from 'npm:stripe@22.1.1'
import { createClient } from 'npm:@supabase/supabase-js@2.39.7'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2026-04-22.dahlia' })
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
)

const HOSTING_RENEWAL_SECONDS = 365 * 24 * 60 * 60

function getCurrentPeriodEnd(subscription: Stripe.Subscription) {
  const itemPeriodEnds = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((periodEnd) => typeof periodEnd === 'number')

  if (itemPeriodEnds.length > 0) return Math.max(...itemPeriodEnds)
  return subscription.cancel_at || subscription.trial_end || subscription.ended_at
}

async function updateMembership(subscription: Stripe.Subscription, fallbackUserId?: string | null) {
  const userId = subscription.metadata?.user_id
    || (typeof subscription.latest_invoice !== 'string' ? subscription.latest_invoice?.metadata?.user_id : null)
    || fallbackUserId
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  if (!userId) return

  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  const existingMetadata = data.user?.app_metadata || {}

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...existingMetadata,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      subscription_plan: subscription.metadata?.plan || existingMetadata.subscription_plan || 'premium_monthly',
      subscription_current_period_end: getCurrentPeriodEnd(subscription),
      subscription_cancel_at_period_end: subscription.cancel_at_period_end,
    },
  })
}

async function updateMembershipFromCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.mode === 'payment') {
    await updateOneTimeMembership(session)
    return
  }

  if (!session.subscription) return

  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  })

  await updateMembership(subscription, session.metadata?.user_id || session.client_reference_id)
}

async function updateOneTimeMembership(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id || session.client_reference_id
  if (!userId) return

  const plan = session.metadata?.plan || ''
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  const existingMetadata = data.user?.app_metadata || {}
  const now = Math.floor(Date.now() / 1000)

  const nextMetadata: Record<string, unknown> = {
    ...existingMetadata,
    ...(customerId ? { stripe_customer_id: customerId } : {}),
  }

  if (plan === 'premium_plus_lifetime' || plan === 'founder') {
    nextMetadata.subscription_status = 'active'
    nextMetadata.subscription_plan = plan
    nextMetadata.lifetime_purchased_at = existingMetadata.lifetime_purchased_at || new Date().toISOString()
    if (plan === 'founder') {
      nextMetadata.cloud_hosting_status = 'active'
      nextMetadata.cloud_hosting_expires_at = null
      nextMetadata.maintenance_expires_at = null
    }
  }

  if (plan === 'hosting_renewal' || plan === 'maintenance') {
    const currentExpiry = existingMetadata.maintenance_expires_at
      ? Math.floor(new Date(String(existingMetadata.maintenance_expires_at)).getTime() / 1000)
      : 0
    const renewalStartsAt = Math.max(now, Number.isFinite(currentExpiry) ? currentExpiry : 0)
    const nextExpiry = new Date((renewalStartsAt + HOSTING_RENEWAL_SECONDS) * 1000).toISOString()
    nextMetadata.cloud_hosting_status = 'active'
    nextMetadata.cloud_hosting_expires_at = nextExpiry
    nextMetadata.maintenance_expires_at = nextExpiry
  }

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: nextMetadata,
  })
}

async function updateMembershipFromInvoice(invoice: Stripe.Invoice) {
  const subscription = invoice.parent?.subscription_details?.subscription
  const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id
  if (!subscriptionId) return

  const latestSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  })

  await updateMembership(latestSubscription, invoice.parent?.subscription_details?.metadata?.user_id || invoice.metadata?.user_id)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const signature = req.headers.get('stripe-signature')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!signature || !webhookSecret) return jsonResponse({ error: 'Webhook is not configured' }, 400)

  const body = await req.text()
  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid webhook signature' }, 400)
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await updateMembershipFromCheckoutSession(event.data.object as Stripe.Checkout.Session)
      break
    case 'invoice.paid':
    case 'invoice.payment_failed':
      await updateMembershipFromInvoice(event.data.object as Stripe.Invoice)
      break
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await updateMembership(event.data.object as Stripe.Subscription)
      break
    default:
      break
  }

  return jsonResponse({ received: true })
})
