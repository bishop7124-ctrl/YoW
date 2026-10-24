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

const LIFETIME_PLANS = new Set(['premium_plus_lifetime', 'founder'])
const CLOUD_RENEWAL_PLANS = new Set(['maintenance', 'hosting_renewal'])

// Every Supabase call that changes what a paying customer can do must fail the handler when it reports
// an error, so the event is retried instead of being acknowledged with nothing applied (audit YOW-09).
async function loadAppMetadata(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !data?.user) throw new Error(`could not load account ${userId}: ${error?.message || 'not found'}`)
  return data.user.app_metadata || {}
}

export async function writeAppMetadata(supabaseAdmin, userId, existing, appMetadata, invoiceId = null) {
  // Compare and update under the auth.users row lock. An independent worker
  // may have purchased Lifetime since our read; stale decisions must retry.
  const { data, error } = await supabaseAdmin.rpc('apply_billing_metadata', {
    p_user_id: userId, p_expected: existing, p_next: appMetadata, p_invoice_id: invoiceId,
  })
  if (error || data !== true) throw new Error(`could not update entitlement for ${userId}: ${error?.message || 'account changed; retry event'}`)
}

// Judged by the plan the account holds NOW. A refunded Founder purchase clears subscription_plan but
// keeps lifetime_purchased_at, and that account must still be able to subscribe to Monthly.
const holdsLifetimeLicence = (metadata = {}) => LIFETIME_PLANS.has(metadata.subscription_plan)

// The subscription as Stripe holds it now. Event payloads can arrive late or out of order, and Stripe
// does not guarantee ordering, so an event snapshot must never overwrite newer state.
async function retrieveCurrentSubscription(stripe, subscription) {
  try {
    const fresh = await stripe.subscriptions.retrieve(subscription.id, { expand: ['latest_invoice'] })
    return fresh ? { ...fresh, metadata: { ...subscription.metadata, ...fresh.metadata } } : subscription
  } catch (error) {
    if (error?.code === 'resource_missing' || error?.statusCode === 404) return subscription
    throw error
  }
}

export function getCurrentPeriodEnd(subscription) {
  const ends = subscription.items.data
    .map(item => item.current_period_end)
    .filter(v => typeof v === 'number')
  if (ends.length > 0) return Math.max(...ends)
  return subscription.cancel_at || subscription.trial_end || subscription.ended_at
}

export function buildSubscriptionAppMetadata(existing, subscription, customerId, plan) {
  // Also used by the billing portal's explicit status refresh. Every caller
  // must preserve Lifetime when a leftover Monthly subscription is refreshed.
  if (CLOUD_RENEWAL_PLANS.has(plan) || (holdsLifetimeLicence(existing) && !LIFETIME_PLANS.has(plan))) {
    const prefix = CLOUD_RENEWAL_PLANS.has(plan) ? 'cloud_renewal' : 'monthly'
    return { ...existing, [`${prefix}_subscription_id`]: subscription.id, [`${prefix}_subscription_status`]: subscription.status }
  }
  return {
    ...existing,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    subscription_plan: plan,
    beta_tester: false,
    access_revoked_at: ['active', 'trialing'].includes(subscription.status) ? null : new Date().toISOString(),
    subscription_current_period_end: getCurrentPeriodEnd(subscription),
    subscription_cancel_at_period_end: subscription.cancel_at_period_end === true,
    subscription_cancel_at: subscription.cancel_at || null,
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
  if (error) throw new Error(`user_profiles upsert failed: ${error.message}`)
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

  const existing = await loadAppMetadata(supabaseAdmin, userId)

  await writeAppMetadata(supabaseAdmin, userId, existing, buildSubscriptionAppMetadata(existing, subscription, customerId, plan))

  // Ensure a user_profiles row exists for storage tracking.
  await upsertUserProfile(supabaseAdmin, userId, {})
}

// --------------------------------------------------------------------------
// Write lifetime plan data to app_metadata after a one-time payment.
// Founder recognition for the first 100 live Lifetime purchases is allocated
// by an advisory-locked database RPC. Stripe test-mode sessions never call the
// allocator, and Founder status never changes the purchased plan or Cloud
// entitlement.
// --------------------------------------------------------------------------
async function activateLifetimePlan(supabaseAdmin, session) {
  const userId = session.metadata?.user_id || session.client_reference_id
  let plan     = session.metadata?.plan

  if (!userId || !plan) {
    console.warn('[stripe-webhook] Missing user_id or plan for lifetime activation', session.id)
    return
  }

  const isLegacyFounderPurchase = plan === 'founder'
  const reservationId = session.metadata?.founder_reservation_id || null
  const shouldAwardFounder = isLegacyFounderPurchase || (reservationId && session.livemode === true)
  let founderAward = null
  let legacyFounderOverflow = false
  if (reservationId && session.livemode === true) {
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('finalize_founder_purchase', {
      p_reservation_id: reservationId,
      p_user_id: userId,
      p_checkout_session_id: session.id,
    })
    if (claimError) throw new Error(`finalize_founder_purchase failed: ${claimError.message}`)
    founderAward = claimed
  } else if (isLegacyFounderPurchase) {
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_founder_slot', { p_user_id: userId })
    if (claimError) {
      // Fail the handler (not silently downgrade) so this event is retried
      // rather than a payment going unfulfilled because of a transient DB error.
      throw new Error(`claim_founder_slot failed: ${claimError.message}`)
    }
    // Current RPC returns a structured result. Accept the older boolean shape
    // during a safe code/migration rollout; it still preserves the status in
    // user_profiles, though the numbered badge appears after the migration.
    founderAward = typeof claimed === 'object' && claimed !== null
      ? claimed
      : { awarded: claimed === true, founder_number: null, founder_awarded_at: null }
    if (!founderAward.awarded) {
      plan = 'premium_plus_lifetime'
      legacyFounderOverflow = true
    }
  }

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id

  const existing = await loadAppMetadata(supabaseAdmin, userId)

  const purchasedAt = existing.lifetime_purchased_at || new Date().toISOString()
  // New Lifetime purchases include one year of Cloud. Historical Founder-plan
  // purchases keep their original no-expiry hosting promise.
  const requestedCloudYears = Number(session.metadata?.lifetime_cloud_years)
  const HOSTING_INCLUDED_YEARS = legacyFounderOverflow
    ? 3
    : requestedCloudYears === 2 && (founderAward?.awarded || session.livemode === false) ? 2 : 1
  const hostingIncludedUntil = isLegacyFounderPurchase && !legacyFounderOverflow
    ? null
    : new Date(new Date(purchasedAt).getTime() + HOSTING_INCLUDED_YEARS * 365 * 24 * 60 * 60 * 1000).toISOString()

  await writeAppMetadata(supabaseAdmin, userId, existing, {
      ...existing,
      stripe_customer_id:      customerId,
      subscription_status:     'active',
      subscription_plan:       plan,
      beta_tester:             false,
      lifetime_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || existing.lifetime_payment_intent || null,
      lifetime_purchased_at:   purchasedAt,
      hosting_included_until:  existing.hosting_included_until || hostingIncludedUntil,
      ...(founderAward?.awarded ? {
        is_founder: true,
        founder_number: founderAward.founder_number || existing.founder_number || null,
        founder_awarded_at: founderAward.founder_awarded_at || existing.founder_awarded_at || new Date().toISOString(),
      } : {}),
  })

  if (legacyFounderOverflow) {
    await upsertUserProfile(supabaseAdmin, userId, { founder_overflow_at: new Date().toISOString() })
  } else if (!shouldAwardFounder) {
    // Test-mode or post-cap Lifetime purchase — ensure the profile row exists
    // for storage tracking without consuming a Founder number.
    await upsertUserProfile(supabaseAdmin, userId, {})
  }
}

async function holdFounderReservation(supabaseAdmin, session) {
  const reservationId = session.metadata?.founder_reservation_id
  const userId = session.metadata?.user_id || session.client_reference_id
  if (!reservationId || !userId || session.livemode !== true) return
  const { data, error } = await supabaseAdmin.rpc('hold_founder_checkout', {
    p_reservation_id: reservationId,
    p_user_id: userId,
    p_checkout_session_id: session.id,
  })
  if (error || !data) throw new Error(`hold_founder_checkout failed: ${error?.message || 'reservation not found'}`)
}

async function releaseFounderReservation(supabaseAdmin, session) {
  const reservationId = session.metadata?.founder_reservation_id
  const userId = session.metadata?.user_id || session.client_reference_id
  if (!reservationId || !userId || session.livemode !== true) return
  const { error } = await supabaseAdmin.rpc('release_founder_checkout', {
    p_reservation_id: reservationId,
    p_user_id: userId,
  })
  if (error) throw new Error(`release_founder_checkout failed: ${error.message}`)
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
async function extendMaintenance(supabaseAdmin, userId, invoiceId) {
  if (!userId) {
    console.warn('[stripe-webhook] Missing user_id for maintenance extension')
    return
  }
  const existing = await loadAppMetadata(supabaseAdmin, userId)
  // A reprocessed event (after a worker died between applying and recording it) must not extend twice.
  if (invoiceId && existing.maintenance_last_invoice_id === invoiceId) return
  // A renewal adds a year after the later of: the last renewal, the included Cloud period, and today.
  // (Starting from today alone would make an early renewal end before the included period does.)
  const candidates = [existing.maintenance_expires_at, existing.hosting_included_until]
    .map(value => (value ? new Date(value) : null))
    .filter(date => date && !Number.isNaN(date.getTime()))
  const base = new Date(Math.max(Date.now(), ...candidates.map(date => date.getTime())))
  const newExpiry = new Date(base.getTime() + 365 * 24 * 60 * 60 * 1000)
  await writeAppMetadata(supabaseAdmin, userId, existing, {
    ...existing,
    maintenance_expires_at: newExpiry.toISOString(),
    ...(invoiceId ? { maintenance_last_invoice_id: invoiceId } : {}),
  }, invoiceId)
}

// --------------------------------------------------------------------------
// Owner policy: revoke Founder access and release its slot on full refund
// or a lost chargeback. Preserve projects for reading and export.
// --------------------------------------------------------------------------
async function releaseFounderSlotForCharge(stripe, supabaseAdmin, charge) {
  if (!charge.refunded) return // partial refund — the charge isn't fully refunded yet
  if (charge.metadata?.plan && charge.metadata.plan !== 'founder') return

  let userId = charge.metadata?.user_id || null
  let plan = charge.metadata?.plan || null

  if ((!userId || !plan) && charge.payment_intent) {
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id
    const pi = await stripe.paymentIntents.retrieve(piId)
    userId = userId || pi.metadata?.user_id || null
    plan = plan || pi.metadata?.plan || null
  }

  if (!userId || plan !== 'founder') return

  const { data, error: readError } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (readError || !data?.user) throw readError || new Error('Founder account could not be loaded')
  const existing = data.user.app_metadata || {}
  const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  // An old refund must not revoke a newer purchase. A retry after metadata
  // succeeded may still need to release the slot.
  if (existing.lifetime_payment_intent && existing.lifetime_payment_intent !== paymentIntent) return
  if (existing.subscription_plan === 'founder') {
    await writeAppMetadata(supabaseAdmin, userId, existing, {
      ...existing, subscription_plan: null, subscription_status: 'none', beta_tester: false,
      access_revoked_at: new Date().toISOString(), founder_revoked_charge: charge.id,
    })
  } else if (existing.subscription_plan && existing.founder_revoked_charge !== charge.id) return

  const { error } = await supabaseAdmin.rpc('release_founder_slot', { p_user_id: userId })
  if (error) throw error
  else console.log('[stripe-webhook] Released Founder slot on full refund for', userId)
}

// --------------------------------------------------------------------------
// Event ledger claim (see handler). Resolves to { status: 'claimed' | 'duplicate' | 'in_progress' | 'error', claimedAt? }.
// Missing ledger schema fails closed. Apply migrations before deploying this handler.
const CLAIM_LEASE_MS = 5 * 60 * 1000

async function claimEvent(supabaseAdmin, event) {
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('stripe_processed_events')
    .insert({ id: event.id, type: event.type, status: 'processing', claimed_at: now })
  if (!error) return { status: 'claimed', claimedAt: now }
  if (error.code !== '23505') {
    console.error('[stripe-webhook] failed to claim event ledger row:', error.message)
    return { status: 'error' }
  }

  const { data, error: readError } = await supabaseAdmin.from('stripe_processed_events').select('status, claimed_at').eq('id', event.id)
  const row = Array.isArray(data) ? data[0] : data
  if (readError || !row) return { status: 'error' }
  if (row.status === 'done') return { status: 'duplicate' }
  if (row.status !== 'processing') return { status: 'error' }
  const claimedAt = Date.parse(row.claimed_at)
  if (Number.isFinite(claimedAt) && Date.now() - claimedAt < CLAIM_LEASE_MS) return { status: 'in_progress' }

  const { data: taken, error: takeoverError } = await supabaseAdmin
    .from('stripe_processed_events')
    .update({ claimed_at: now, status: 'processing' })
    .eq('id', event.id)
    .eq('claimed_at', row.claimed_at)
    .select('id')
  if (takeoverError) {
    console.error('[stripe-webhook] failed to take over stale event claim:', takeoverError.message)
    return { status: 'error' }
  }
  return Array.isArray(taken) && taken.length ? { status: 'claimed', claimedAt: now } : { status: 'in_progress' }
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

  // Claim this event id before doing any fulfillment work. A unique-key violation means another
  // delivery already holds it: if that one finished the event is a duplicate (200), if it is still
  // inside its lease Stripe is asked to retry later (503), and if its worker died mid-fulfilment the
  // stale claim is taken over so the payment is not stranded (audit YOW-09; P0-05 added the ledger).
  const claim = await claimEvent(supabaseAdmin, event)
  if (claim.status === 'duplicate') {
    console.log('[stripe-webhook] duplicate event, already processed:', event.id, event.type)
    return res.status(200).json({ received: true, duplicate: true })
  }
  if (claim.status === 'in_progress') {
    return res.status(503).json({ error: 'Event is being processed' })
  }
  if (claim.status === 'error') {
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
          } else {
            // Delayed payment began before Checkout expired. Keep its one
            // reserved Founding Price place until async success/failure.
            await holdFounderReservation(supabaseAdmin, session)
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
        await releaseFounderReservation(supabaseAdmin, session)
        console.warn('[stripe-webhook] Delayed payment failed for session', session.id, session.metadata)
        break
      }

      case 'checkout.session.expired':
        await releaseFounderReservation(supabaseAdmin, event.data.object)
        break

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
          await extendMaintenance(supabaseAdmin, userId, invoice.id)
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
        await updateSubscriptionMembership(supabaseAdmin, await retrieveCurrentSubscription(stripe, event.data.object))
        break

      case 'charge.dispute.closed': {
        const dispute = event.data.object
        if (dispute.status !== 'lost') break
        const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id
        if (!chargeId) throw new Error('Dispute has no charge')
        const charge = await stripe.charges.retrieve(chargeId)
        await releaseFounderSlotForCharge(stripe, supabaseAdmin, { ...charge, refunded: true })
        break
      }

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
    let release = supabaseAdmin.from('stripe_processed_events').delete().eq('id', event.id)
    if (claim.claimedAt) release = release.eq('claimed_at', claim.claimedAt)
    const { error: releaseError } = await release
    if (releaseError) console.error('[stripe-webhook] failed to release event ledger row after error:', releaseError.message)
    // Never forward raw exception detail to the client (audit P0-05) — log
    // it server-side above, where it's already captured for debugging.
    return res.status(500).json({ error: 'Internal server error' })
  }

  const { error: doneError } = await supabaseAdmin
    .from('stripe_processed_events')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', event.id)
    .eq('claimed_at', claim.claimedAt)
  // Ask Stripe to retry if completion could not be recorded. Fulfilment is
  // idempotent, so a later lease takeover can safely finish the ledger entry.
  if (doneError) {
    console.error('[stripe-webhook] failed to mark event done:', doneError.message)
    return res.status(500).json({ error: 'Internal server error' })
  }

  return res.status(200).json({ received: true })
}
