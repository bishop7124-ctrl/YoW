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

export function getCurrentPeriodEnd(subscription) {
  const ends = subscription.items.data
    .map(item => item.current_period_end)
    .filter(v => typeof v === 'number')
  if (ends.length > 0) return Math.max(...ends)
  return subscription.cancel_at || subscription.trial_end || subscription.ended_at
}

export function buildSubscriptionAppMetadata(existing, subscription, customerId, plan) {
  return {
    ...existing,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    subscription_plan: plan,
    subscription_current_period_end: getCurrentPeriodEnd(subscription),
    subscription_cancel_at_period_end: subscription.cancel_at_period_end,
    ...(subscription.status === 'canceled' ? { was_monthly: true } : {}),
  }
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
// Naturally idempotent: it always fetches the subscription's *current*
// state from Stripe and overwrites app_metadata with it (no field is
// computed additively from the previous value), so replaying this for the
// same or an older event is a harmless no-op/overwrite-with-same-data.
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

  // Single write for the whole app_metadata object — the admin API replaces
  // app_metadata wholesale rather than merging, so every field that should
  // survive (including was_monthly below) has to be folded into the one
  // call. was_monthly is written to app_metadata, not user_metadata — the
  // account owner can write user_metadata directly via the client SDK, and
  // this flag gates real product behavior (which project stays editable), so
  // it must be server-controlled like every other entitlement field. See
  // docs/YOW_CODE_AUDIT_2026-09-01.md P0-01.
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: buildSubscriptionAppMetadata(existing, subscription, customerId, plan),
  })

  // Ensure a user_profiles row exists for storage tracking.
  await upsertUserProfile(supabaseAdmin, userId, {})
}

// --------------------------------------------------------------------------
// Write lifetime plan data to app_metadata after a one-time payment.
// Idempotent by construction: every field either short-circuits on an
// existing value (lifetime_purchased_at, hosting_included_until) or is set
// to the same fixed value on every call, so replaying this for the same
// event is a harmless no-op. Founder allocation is the one non-idempotent
// exception, which is why it goes through the atomic claim_founder_slot RPC
// rather than an unconditional upsert (audit P0-05 — see docs/YOW_CODE_AUDIT_2026-09-01.md).
// --------------------------------------------------------------------------
async function activateLifetimePlan(supabaseAdmin, session) {
  const userId = session.metadata?.user_id || session.client_reference_id
  let plan     = session.metadata?.plan

  if (!userId || !plan) {
    console.warn('[stripe-webhook] Missing user_id or plan for lifetime activation', session.id)
    return
  }

  let founderOverflow = false
  if (plan === 'founder') {
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_founder_slot', { p_user_id: userId })
    if (claimError) {
      // Fail the handler (not silently downgrade) so this event is retried
      // rather than a payment going unfulfilled because of a transient DB error.
      throw new Error(`claim_founder_slot failed: ${claimError.message}`)
    }
    if (!claimed) {
      // Lost the atomic race for the last slot(s) after already being
      // charged — never leave a paying customer with nothing. Grant
      // Lifetime (a real, valid entitlement they paid at least as much
      // for) and flag the account for the owner to manually resolve the
      // Founder/Lifetime price difference or comp a slot.
      console.error('[stripe-webhook] Founder slots exhausted at fulfillment time for', userId, '— granting Lifetime instead, needs manual review')
      plan = 'premium_plus_lifetime'
      founderOverflow = true
    }
  }

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id

  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  const existing = data?.user?.app_metadata || {}

  const purchasedAt = existing.lifetime_purchased_at || new Date().toISOString()
  // hosting_included_years mirrors the client-side HOSTING_INCLUDED_YEARS constant.
  // Founders get null (lifetime hosting — no expiry date needed).
  const HOSTING_INCLUDED_YEARS = 3
  const hostingIncludedUntil = plan === 'founder'
    ? null
    : new Date(new Date(purchasedAt).getTime() + HOSTING_INCLUDED_YEARS * 365 * 24 * 60 * 60 * 1000).toISOString()

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...existing,
      stripe_customer_id:      customerId,
      subscription_status:     'active',
      subscription_plan:       plan,
      lifetime_purchased_at:   purchasedAt,
      hosting_included_until:  existing.hosting_included_until || hostingIncludedUntil,
    },
  })

  // is_founder itself was already set (or not) by claim_founder_slot above;
  // this only records the overflow flag for the non-founder-plan case.
  if (founderOverflow) {
    await upsertUserProfile(supabaseAdmin, userId, { founder_overflow_at: new Date().toISOString() })
  } else if (plan !== 'founder') {
    // Ordinary (non-Founder, non-overflow) Lifetime purchase — ensure the
    // profile row exists for storage tracking, same as the subscription path.
    await upsertUserProfile(supabaseAdmin, userId, {})
  }
}

// --------------------------------------------------------------------------
// Extend maintenance_expires_at by 1 year on successful Cloud Hosting & Storage Renewal payment.
//
// Called only from invoice.paid — the single canonical fulfillment point for
// this product. Maintenance/hosting_renewal is Stripe subscription mode, so
// every period (the first one included) generates an invoice.paid event;
// checkout.session.completed intentionally does NOT also call this (it used
// to, which is exactly the audit P0-05 bug: checkout.session.completed and
// the corresponding first invoice.paid both fired for the same purchase,
// extending maintenance by 2 years for one payment).
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
// Release a Founder slot on a full refund. Only frees the slot counter
// (is_founder = false) so get_founder_slot_info/claim_founder_slot see it
// as available again — whether a refund also revokes the user's paid
// access/plan is a separate product decision this does not make.
// --------------------------------------------------------------------------
async function releaseFounderSlotForCharge(stripe, supabaseAdmin, charge) {
  if (!charge.refunded) return // partial refund — the charge isn't fully refunded yet
  if (charge.metadata?.plan && charge.metadata.plan !== 'founder') return

  let userId = charge.metadata?.user_id || null
  let plan = charge.metadata?.plan || null

  if (!userId && charge.payment_intent) {
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id
    const pi = await stripe.paymentIntents.retrieve(piId)
    userId = pi.metadata?.user_id || null
    plan = plan || pi.metadata?.plan || null
  }

  if (!userId || plan !== 'founder') return

  const { error } = await supabaseAdmin.rpc('release_founder_slot', { p_user_id: userId })
  if (error) console.error('[stripe-webhook] release_founder_slot failed for', userId, error.message)
  else console.log('[stripe-webhook] Released Founder slot on full refund for', userId)
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
    return res.status(400).json({ error: 'Invalid signature' })
  }

  // Claim this event id before doing any fulfillment work. A unique-key
  // violation means it's already been processed (an earlier delivery, or a
  // concurrent retry landing at the same instant) — skip straight to 200 so
  // Stripe stops retrying, without applying fulfillment a second time. This
  // is the fix for audit P0-05: there was previously no ledger at all, so a
  // Stripe retry of any event could re-apply its side effects.
  const { error: claimError } = await supabaseAdmin
    .from('stripe_processed_events')
    .insert({ id: event.id, type: event.type })
  if (claimError) {
    if (claimError.code === '23505') {
      console.log('[stripe-webhook] duplicate event, already processed:', event.id, event.type)
      return res.status(200).json({ received: true, duplicate: true })
    }
    console.error('[stripe-webhook] failed to claim event ledger row:', claimError.message)
    return res.status(500).json({ error: 'Internal server error' })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object

        if (session.metadata?.plan === 'maintenance' || session.metadata?.plan === 'hosting_renewal') {
          // Intentionally a no-op — see extendMaintenance's comment above.
          // The subscription's first invoice.paid is the sole fulfillment
          // point for this product.
        } else if (session.mode === 'payment') {
          // One-time lifetime/founder purchase. Some payment methods
          // (e.g. delayed bank debits) leave checkout.session.completed
          // firing before payment actually clears — only fulfill once
          // Stripe confirms payment_status is paid; the async_payment_*
          // events below cover the delayed-clearing case.
          if (session.payment_status === 'paid') {
            await activateLifetimePlan(supabaseAdmin, session)
          }
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

      // A delayed payment method (e.g. certain bank debits) clears after
      // checkout.session.completed already fired with payment_status
      // 'unpaid' — this is the actual fulfillment point for those. Session
      // shape is identical to checkout.session.completed.
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object
        if (session.mode === 'payment') await activateLifetimePlan(supabaseAdmin, session)
        break
      }

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object
        console.warn('[stripe-webhook] Delayed payment failed for session', session.id, session.metadata)
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

        // Maintenance subscription — first payment or renewal, extend access.
        // This is the single canonical fulfillment point for this product
        // (see extendMaintenance's comment).
        if ((latestSub.metadata?.plan === 'maintenance' || latestSub.metadata?.plan === 'hosting_renewal') && event.type === 'invoice.paid') {
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

      case 'charge.refunded':
        await releaseFounderSlotForCharge(stripe, supabaseAdmin, event.data.object)
        break

      default:
        break
    }
  } catch (err) {
    console.error('[stripe-webhook] Handler error for', event.type, err)
    // Release the claim so a legitimate Stripe retry can actually reprocess
    // this event — otherwise a transient failure here would permanently
    // mark a never-applied event as done and silently drop the fulfillment.
    const { error: releaseError } = await supabaseAdmin.from('stripe_processed_events').delete().eq('id', event.id)
    if (releaseError) console.error('[stripe-webhook] failed to release event ledger row after error:', releaseError.message)
    // Never forward raw exception detail to the client (audit P0-05) — log
    // it server-side above, where it's already captured for debugging.
    return res.status(500).json({ error: 'Internal server error' })
  }

  return res.status(200).json({ received: true })
}
