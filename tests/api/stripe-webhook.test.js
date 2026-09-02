import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────
// Chainable Supabase table mock, following the pattern already established
// in tests/api/desktop-devices.test.js: every builder method returns the
// builder, and the builder is awaitable, resolving with the next queued
// result. rpc() and auth.admin.* are mocked separately since they aren't
// part of the .from() chain.

const tableResults = []
const queueResult = (result) => tableResults.push(result)
const fromCalls = []
const makeBuilder = (table) => {
  const builder = {}
  for (const method of ['select', 'eq', 'insert', 'update', 'upsert', 'delete']) {
    builder[method] = vi.fn((...args) => {
      fromCalls.push({ table, method, args })
      return builder
    })
  }
  builder.then = (resolve, reject) => {
    const result = tableResults.shift() || { data: null, error: null }
    return Promise.resolve(result).then(resolve, reject)
  }
  return builder
}
const from = vi.fn((table) => makeBuilder(table))

const rpc = vi.fn(() => Promise.resolve({ data: true, error: null }))
const getUserById = vi.fn(() => Promise.resolve({ data: { user: { app_metadata: {} } }, error: null }))
const updateUserById = vi.fn(() => Promise.resolve({ data: { user: {} }, error: null }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from,
    rpc,
    auth: { admin: { getUserById, updateUserById } },
  }),
}))

const constructEvent = vi.fn()
const subscriptionsRetrieve = vi.fn()
const paymentIntentsRetrieve = vi.fn()

vi.mock('stripe', () => ({
  // Must be a real constructor (the module does `new Stripe(key)`) — an
  // arrow function can't be `new`-ed.
  default: vi.fn().mockImplementation(function StripeMock() {
    return {
      webhooks: { constructEvent },
      subscriptions: { retrieve: subscriptionsRetrieve },
      paymentIntents: { retrieve: paymentIntentsRetrieve },
    }
  }),
}))

// ─── Test helpers ────────────────────────────────────────────────────────

function makeReq() {
  return {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test' },
    on(event, cb) {
      if (event === 'end') queueMicrotask(() => cb())
      return this
    },
  }
}

function makeRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() }
}

/** Metadata updates the mock recorded for a given user_id via updateUserById. */
function metadataWritesFor(userId) {
  return updateUserById.mock.calls
    .filter(([id]) => id === userId)
    .map(([, patch]) => patch.app_metadata)
    .filter(Boolean)
}

// ─── getCurrentPeriodEnd ─────────────────────────────────────────────────────

describe('getCurrentPeriodEnd', () => {
  it('returns the max period_end across all items', async () => {
    const { getCurrentPeriodEnd } = await import('../../api/stripe-webhook.js')
    const sub = {
      items: { data: [
        { current_period_end: 1000 },
        { current_period_end: 3000 },
        { current_period_end: 2000 },
      ]},
    }
    expect(getCurrentPeriodEnd(sub)).toBe(3000)
  })

  it('ignores non-numeric item period_ends', async () => {
    const { getCurrentPeriodEnd } = await import('../../api/stripe-webhook.js')
    const sub = {
      items: { data: [
        { current_period_end: null },
        { current_period_end: 5000 },
        { current_period_end: undefined },
      ]},
    }
    expect(getCurrentPeriodEnd(sub)).toBe(5000)
  })

  it('falls back to cancel_at when no numeric item period_ends', async () => {
    const { getCurrentPeriodEnd } = await import('../../api/stripe-webhook.js')
    const sub = {
      items: { data: [] },
      cancel_at: 9999,
      trial_end: 1111,
    }
    expect(getCurrentPeriodEnd(sub)).toBe(9999)
  })

  it('falls back to trial_end when cancel_at is falsy', async () => {
    const { getCurrentPeriodEnd } = await import('../../api/stripe-webhook.js')
    const sub = {
      items: { data: [] },
      cancel_at: null,
      trial_end: 7777,
      ended_at: 1234,
    }
    expect(getCurrentPeriodEnd(sub)).toBe(7777)
  })

  it('falls back to ended_at as last resort', async () => {
    const { getCurrentPeriodEnd } = await import('../../api/stripe-webhook.js')
    const sub = {
      items: { data: [] },
      cancel_at: null,
      trial_end: null,
      ended_at: 4321,
    }
    expect(getCurrentPeriodEnd(sub)).toBe(4321)
  })

  it('returns undefined when all fallbacks are null', async () => {
    const { getCurrentPeriodEnd } = await import('../../api/stripe-webhook.js')
    const sub = {
      items: { data: [] },
      cancel_at: null,
      trial_end: null,
      ended_at: null,
    }
    expect(getCurrentPeriodEnd(sub)).toBeNull()
  })
})

describe('buildSubscriptionAppMetadata', () => {
  it('records canceled-monthly downgrade state in server-controlled app metadata', async () => {
    const { buildSubscriptionAppMetadata } = await import('../../api/stripe-webhook.js')
    const subscription = {
      id: 'sub_123',
      status: 'canceled',
      cancel_at_period_end: false,
      cancel_at: 1234,
      items: { data: [] },
    }

    expect(buildSubscriptionAppMetadata(
      { existing_flag: true },
      subscription,
      'cus_123',
      'premium_monthly'
    )).toMatchObject({
      existing_flag: true,
      stripe_customer_id: 'cus_123',
      subscription_status: 'canceled',
      subscription_plan: 'premium_monthly',
      was_monthly: true,
    })
  })
})

// ─── handler routing ─────────────────────────────────────────────────────────

describe('handler — early rejection', () => {
  let handler

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'

    vi.resetModules()
    const mod = await import('../../api/stripe-webhook.js')
    handler = mod.default
  })

  it('rejects non-POST requests with 405', async () => {
    const req = { method: 'GET', headers: {} }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('rejects POST with missing stripe-signature with 400', async () => {
    const req = { method: 'POST', headers: {} }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('STRIPE_WEBHOOK_SECRET') })
    )
  })

  it('never forwards the raw signature-verification error message to the client', async () => {
    constructEvent.mockImplementation(() => { throw new Error('super secret internal detail') })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(400)
    const body = res.json.mock.calls[0][0]
    expect(JSON.stringify(body)).not.toContain('super secret internal detail')
  })
})

// ─── event ledger / idempotency (audit P0-05) ────────────────────────────────

describe('handler — event ledger idempotency', () => {
  let handler

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'

    vi.clearAllMocks()
    from.mockImplementation((table) => makeBuilder(table))
    rpc.mockResolvedValue({ data: true, error: null })
    getUserById.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
    updateUserById.mockResolvedValue({ data: { user: {} }, error: null })
    tableResults.length = 0
    fromCalls.length = 0
    constructEvent.mockReset()
    subscriptionsRetrieve.mockReset()
    paymentIntentsRetrieve.mockReset()

    vi.resetModules()
    const mod = await import('../../api/stripe-webhook.js')
    handler = mod.default
  })

  it('processes a new event and claims it in the ledger', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_1', type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'active', metadata: { user_id: 'user-1', plan: 'premium_monthly' }, customer: 'cus_1', items: { data: [{ current_period_end: 123 }] } } },
    })
    queueResult({ data: null, error: null }) // ledger insert succeeds

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(updateUserById).toHaveBeenCalledWith('user-1', expect.objectContaining({ app_metadata: expect.objectContaining({ subscription_status: 'active' }) }))
  })

  it('skips fulfillment entirely on a duplicate event id (Stripe retry)', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_dup', type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'active', metadata: { user_id: 'user-1', plan: 'premium_monthly' }, customer: 'cus_1', items: { data: [] } } },
    })
    // Ledger insert reports a unique-constraint violation — already claimed.
    queueResult({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } })

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ duplicate: true }))
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('releases the ledger claim on handler failure so a real retry can reprocess it', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_fail', type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'active', metadata: { user_id: 'user-1', plan: 'premium_monthly' }, customer: 'cus_1', items: { data: [] } } },
    })
    queueResult({ data: null, error: null }) // ledger insert succeeds (claimed)
    getUserById.mockRejectedValueOnce(new Error('db is on fire, exact internal detail'))

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(500)
    const body = res.json.mock.calls[0][0]
    expect(JSON.stringify(body)).not.toContain('db is on fire')

    const deleteCall = fromCalls.find(c => c.table === 'stripe_processed_events' && c.method === 'delete')
    expect(deleteCall).toBeTruthy()
  })
})

// ─── maintenance extension: single canonical fulfillment point (audit P0-05) ─

describe('handler — maintenance extension is not double-applied', () => {
  let handler

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'

    vi.clearAllMocks()
    from.mockImplementation((table) => makeBuilder(table))
    rpc.mockResolvedValue({ data: true, error: null })
    getUserById.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
    updateUserById.mockResolvedValue({ data: { user: {} }, error: null })
    tableResults.length = 0
    fromCalls.length = 0
    constructEvent.mockReset()
    subscriptionsRetrieve.mockReset()

    vi.resetModules()
    const mod = await import('../../api/stripe-webhook.js')
    handler = mod.default
  })

  it('checkout.session.completed for a maintenance subscription does not itself extend maintenance', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_checkout', type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', mode: 'subscription', subscription: 'sub_maint', metadata: { user_id: 'user-1', plan: 'maintenance' }, client_reference_id: 'user-1' } },
    })
    queueResult({ data: null, error: null }) // ledger insert

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(updateUserById).not.toHaveBeenCalled()
    expect(subscriptionsRetrieve).not.toHaveBeenCalled()
  })

  it('a subsequent invoice.paid for the same maintenance subscription extends exactly once', async () => {
    getUserById.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
    subscriptionsRetrieve.mockResolvedValue({
      id: 'sub_maint', metadata: { user_id: 'user-1', plan: 'maintenance' },
    })
    constructEvent.mockReturnValue({
      id: 'evt_invoice', type: 'invoice.paid',
      data: { object: { id: 'in_1', subscription: 'sub_maint', metadata: {} } },
    })
    queueResult({ data: null, error: null }) // ledger insert

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(200)
    const writes = metadataWritesFor('user-1')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toHaveProperty('maintenance_expires_at')
  })

  it('checkout.session.completed + invoice.paid together (the real purchase flow) extend maintenance only once total', async () => {
    // First: checkout.session.completed — a no-op for maintenance.
    constructEvent.mockReturnValueOnce({
      id: 'evt_checkout_2', type: 'checkout.session.completed',
      data: { object: { id: 'cs_2', mode: 'subscription', subscription: 'sub_maint_2', metadata: { user_id: 'user-1', plan: 'maintenance' }, client_reference_id: 'user-1' } },
    })
    queueResult({ data: null, error: null }) // ledger insert #1

    const res1 = makeRes()
    await handler(makeReq(), res1)
    expect(res1.status).toHaveBeenCalledWith(200)

    // Then: the corresponding first invoice.paid — the real fulfillment point.
    getUserById.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
    subscriptionsRetrieve.mockResolvedValue({ id: 'sub_maint_2', metadata: { user_id: 'user-1', plan: 'maintenance' } })
    constructEvent.mockReturnValueOnce({
      id: 'evt_invoice_2', type: 'invoice.paid',
      data: { object: { id: 'in_2', subscription: 'sub_maint_2', metadata: {} } },
    })
    queueResult({ data: null, error: null }) // ledger insert #2

    const res2 = makeRes()
    await handler(makeReq(), res2)
    expect(res2.status).toHaveBeenCalledWith(200)

    // Exactly one maintenance_expires_at write across the whole purchase flow
    // — the audit P0-05 bug was this being written twice (one extra year).
    const writes = metadataWritesFor('user-1').filter(m => 'maintenance_expires_at' in m)
    expect(writes).toHaveLength(1)
  })
})

// ─── Founder atomic allocation + overflow handling (audit P0-05) ─────────────

describe('handler — Founder slot allocation', () => {
  let handler

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'

    vi.clearAllMocks()
    from.mockImplementation((table) => makeBuilder(table))
    getUserById.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
    updateUserById.mockResolvedValue({ data: { user: {} }, error: null })
    tableResults.length = 0
    fromCalls.length = 0
    constructEvent.mockReset()

    vi.resetModules()
    const mod = await import('../../api/stripe-webhook.js')
    handler = mod.default
  })

  it('grants Founder when the atomic claim succeeds', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    constructEvent.mockReturnValue({
      id: 'evt_founder_ok', type: 'checkout.session.completed',
      data: { object: { id: 'cs_f1', mode: 'payment', payment_status: 'paid', metadata: { user_id: 'user-1', plan: 'founder' }, client_reference_id: 'user-1', customer: 'cus_1' } },
    })
    queueResult({ data: null, error: null }) // ledger insert

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(rpc).toHaveBeenCalledWith('claim_founder_slot', { p_user_id: 'user-1' })
    const writes = metadataWritesFor('user-1')
    expect(writes[0].subscription_plan).toBe('founder')
  })

  it('falls back to Lifetime and flags the account when the atomic claim loses the race', async () => {
    rpc.mockResolvedValue({ data: false, error: null }) // cap already reached
    constructEvent.mockReturnValue({
      id: 'evt_founder_overflow', type: 'checkout.session.completed',
      data: { object: { id: 'cs_f2', mode: 'payment', payment_status: 'paid', metadata: { user_id: 'user-2', plan: 'founder' }, client_reference_id: 'user-2', customer: 'cus_2' } },
    })
    queueResult({ data: null, error: null }) // ledger insert
    queueResult({ data: null, error: null }) // user_profiles upsert (overflow flag)

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(200)
    const writes = metadataWritesFor('user-2')
    // Never left with nothing for a completed payment — downgraded to Lifetime, not left unset.
    expect(writes[0].subscription_plan).toBe('premium_plus_lifetime')

    const upsertCall = fromCalls.find(c => c.table === 'user_profiles' && c.method === 'upsert')
    expect(upsertCall.args[0]).toMatchObject({ user_id: 'user-2', founder_overflow_at: expect.any(String) })
  })

  it('releases the slot on a full refund of a Founder charge', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_refund', type: 'charge.refunded',
      data: { object: { id: 'ch_1', refunded: true, metadata: { user_id: 'user-3', plan: 'founder' } } },
    })
    queueResult({ data: null, error: null }) // ledger insert
    rpc.mockResolvedValue({ data: null, error: null }) // release_founder_slot

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(rpc).toHaveBeenCalledWith('release_founder_slot', { p_user_id: 'user-3' })
  })

  it('does not release a slot on a partial refund', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_partial_refund', type: 'charge.refunded',
      data: { object: { id: 'ch_2', refunded: false, amount_refunded: 100, metadata: { user_id: 'user-4', plan: 'founder' } } },
    })
    queueResult({ data: null, error: null }) // ledger insert

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(rpc).not.toHaveBeenCalledWith('release_founder_slot', expect.anything())
  })
})

// ─── one-time payment gating on payment_status (audit P0-05) ─────────────────

describe('handler — one-time purchase payment-state handling', () => {
  let handler

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'

    vi.clearAllMocks()
    from.mockImplementation((table) => makeBuilder(table))
    rpc.mockResolvedValue({ data: true, error: null })
    getUserById.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
    updateUserById.mockResolvedValue({ data: { user: {} }, error: null })
    tableResults.length = 0
    fromCalls.length = 0
    constructEvent.mockReset()

    vi.resetModules()
    const mod = await import('../../api/stripe-webhook.js')
    handler = mod.default
  })

  it('does not fulfill a one-time purchase whose payment has not cleared yet', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_unpaid', type: 'checkout.session.completed',
      data: { object: { id: 'cs_3', mode: 'payment', payment_status: 'unpaid', metadata: { user_id: 'user-5', plan: 'premium_plus_lifetime' }, client_reference_id: 'user-5', customer: 'cus_5' } },
    })
    queueResult({ data: null, error: null }) // ledger insert

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('fulfills once a delayed payment method clears via async_payment_succeeded', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_async_ok', type: 'checkout.session.async_payment_succeeded',
      data: { object: { id: 'cs_4', mode: 'payment', payment_status: 'paid', metadata: { user_id: 'user-6', plan: 'premium_plus_lifetime' }, client_reference_id: 'user-6', customer: 'cus_6' } },
    })
    queueResult({ data: null, error: null }) // ledger insert

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(200)
    const writes = metadataWritesFor('user-6')
    expect(writes[0].subscription_plan).toBe('premium_plus_lifetime')
  })

  it('does not fulfill anything on async_payment_failed', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_async_fail', type: 'checkout.session.async_payment_failed',
      data: { object: { id: 'cs_5', mode: 'payment', metadata: { user_id: 'user-7', plan: 'premium_plus_lifetime' } } },
    })
    queueResult({ data: null, error: null }) // ledger insert

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(updateUserById).not.toHaveBeenCalled()
  })
})
