import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isMissingStripeCustomerError } from '../../api/create-customer-portal.js'

// ─── isMissingStripeCustomerError ───────────────────────────────────────────

describe('isMissingStripeCustomerError', () => {
  it('recognizes Stripe resource_missing errors for the customer param', () => {
    expect(isMissingStripeCustomerError({ code: 'resource_missing', param: 'customer' })).toBe(true)
    expect(isMissingStripeCustomerError({ code: 'resource_missing' })).toBe(true) // no param given at all
  })

  it('does not misclassify resource_missing for an unrelated param (e.g. a stale portal configuration id)', () => {
    expect(isMissingStripeCustomerError({ code: 'resource_missing', param: 'configuration' })).toBe(false)
  })

  it('recognizes a "No such customer" message even without the code', () => {
    expect(isMissingStripeCustomerError({
      type: 'StripeInvalidRequestError',
      message: "No such customer: 'cus_deleted123'",
    })).toBe(true)
  })

  it('does not flag unrelated Stripe errors', () => {
    expect(isMissingStripeCustomerError({ code: 'rate_limit' })).toBe(false)
    expect(isMissingStripeCustomerError({ type: 'StripeInvalidRequestError', message: 'Invalid return_url' })).toBe(false)
  })

  it('handles null/undefined safely', () => {
    expect(isMissingStripeCustomerError(null)).toBe(false)
    expect(isMissingStripeCustomerError(undefined)).toBe(false)
  })
})

// ─── handler ─────────────────────────────────────────────────────────────────
// Mock both the Supabase admin client and the Stripe SDK so the handler can
// be exercised end to end without real credentials or network calls.

const getUser = vi.fn()
const updateUserById = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser,
      admin: { updateUserById },
    },
  }),
}))

const billingPortalSessionsCreate = vi.fn()
vi.mock('stripe', () => ({
  default: class StripeMock {
    billingPortal = { sessions: { create: billingPortalSessionsCreate } }
  },
}))

const makeRes = () => ({
  setHeader: vi.fn(),
  status: vi.fn().mockReturnThis(),
  json: vi.fn(),
  end: vi.fn(),
})

const makeReq = (overrides = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer test-token', origin: 'https://app.example.com' },
  ...overrides,
})

describe('create-customer-portal handler', () => {
  let handler

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'
    process.env.SITE_URL = 'https://app.example.com'

    getUser.mockReset()
    updateUserById.mockReset()
    updateUserById.mockResolvedValue({ data: {}, error: null })
    billingPortalSessionsCreate.mockReset()

    vi.resetModules()
    const mod = await import('../../api/create-customer-portal.js')
    handler = mod.default
  })

  it('rejects unauthenticated requests', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad token') })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('(a) real Stripe subscription: opens the billing portal and does not touch local plan state', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { stripe_customer_id: 'cus_real123', subscription_plan: 'premium_monthly', subscription_status: 'active' } } },
      error: null,
    })
    billingPortalSessionsCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session/abc' })

    const res = makeRes()
    await handler(makeReq(), res)

    expect(billingPortalSessionsCreate).toHaveBeenCalledWith({
      customer: 'cus_real123',
      return_url: 'https://app.example.com/',
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ url: 'https://billing.stripe.com/session/abc' })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('(b) no Stripe customer record (manual SQL upgrade): downgrades locally instead of failing', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-2', app_metadata: { subscription_plan: 'premium_monthly', subscription_status: 'active' }, user_metadata: {} } },
      error: null,
    })

    const res = makeRes()
    await handler(makeReq(), res)

    expect(billingPortalSessionsCreate).not.toHaveBeenCalled()
    expect(updateUserById).toHaveBeenCalledWith('user-2', expect.objectContaining({
      app_metadata: expect.objectContaining({ subscription_status: 'none', subscription_plan: null }),
    }))
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ downgraded: true })
  })

  it('(b) also downgrades a manually-SQL-upgraded Lifetime/Founder account, not just Monthly', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-3', app_metadata: { subscription_plan: 'founder', subscription_status: 'active' }, user_metadata: {} } },
      error: null,
    })

    const res = makeRes()
    await handler(makeReq(), res)

    expect(updateUserById).toHaveBeenCalledWith('user-3', {
      app_metadata: expect.objectContaining({ subscription_status: 'none', subscription_plan: null }),
    })
    // was_monthly should only be set for a former Monthly plan, not Founder.
    expect(updateUserById).toHaveBeenCalledTimes(1)
    expect(res.json).toHaveBeenCalledWith({ downgraded: true })
  })

  it('(b) marks was_monthly when downgrading a fake Monthly plan, mirroring the real cancellation webhook, in a single atomic update', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-4', app_metadata: { subscription_plan: 'premium_monthly', subscription_status: 'active' }, user_metadata: { theme: 'dark' } } },
      error: null,
    })

    const res = makeRes()
    await handler(makeReq(), res)

    // A single server-controlled app_metadata update — not a client-writable
    // user_metadata flag or two separate calls that could partially fail.
    expect(updateUserById).toHaveBeenCalledTimes(1)
    expect(updateUserById).toHaveBeenCalledWith('user-4', {
      app_metadata: expect.objectContaining({ subscription_status: 'none', subscription_plan: null, was_monthly: true }),
    })
  })

  it('(c) stripe_customer_id present but stale/invalid in Stripe on a manual-SQL-looking account: falls back to local downgrade', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-5', app_metadata: { stripe_customer_id: 'cus_deleted', subscription_plan: 'premium_monthly', subscription_status: 'active' }, user_metadata: {} } },
      error: null,
    })
    billingPortalSessionsCreate.mockRejectedValue(
      Object.assign(new Error("No such customer: 'cus_deleted'"), { type: 'StripeInvalidRequestError', code: 'resource_missing', param: 'customer' })
    )

    const res = makeRes()
    await handler(makeReq(), res)

    expect(billingPortalSessionsCreate).toHaveBeenCalled()
    expect(updateUserById).toHaveBeenCalledWith('user-5', expect.objectContaining({
      app_metadata: expect.objectContaining({ subscription_status: 'none', subscription_plan: null }),
    }))
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ downgraded: true })
  })

  it('(c) stripe_customer_id missing in Stripe for a REAL subscriber (has stripe_subscription_id) is NOT auto-downgraded — needs human review', async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-8',
          app_metadata: {
            stripe_customer_id: 'cus_real_but_deleted',
            stripe_subscription_id: 'sub_real123',
            subscription_plan: 'premium_monthly',
            subscription_status: 'active',
            subscription_current_period_end: 1999999999,
          },
          user_metadata: {},
        },
      },
      error: null,
    })
    billingPortalSessionsCreate.mockRejectedValue(
      Object.assign(new Error("No such customer: 'cus_real_but_deleted'"), { type: 'StripeInvalidRequestError', code: 'resource_missing', param: 'customer' })
    )

    const res = makeRes()
    await handler(makeReq(), res)

    // Must NOT touch the account's plan — a real subscriber's entitlement is
    // never silently destroyed just because Stripe temporarily/erroneously
    // can't find the customer.
    expect(updateUserById).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('contact support') })
    )
  })

  it('(c) a real, unrelated Stripe error (e.g. rate limit) still surfaces as a failure, not a silent downgrade', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-6', app_metadata: { stripe_customer_id: 'cus_real456', subscription_plan: 'premium_monthly', subscription_status: 'active' } } },
      error: null,
    })
    billingPortalSessionsCreate.mockRejectedValue(Object.assign(new Error('Rate limited'), { code: 'rate_limit' }))

    const res = makeRes()
    await handler(makeReq(), res)

    expect(updateUserById).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it('(c) stripe_customer_id present with no active subscription still opens the portal normally (e.g. Lifetime receipts)', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-7', app_metadata: { stripe_customer_id: 'cus_lifetime789', subscription_plan: 'premium_plus_lifetime', subscription_status: 'active' } } },
      error: null,
    })
    billingPortalSessionsCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session/lifetime' })

    const res = makeRes()
    await handler(makeReq(), res)

    expect(updateUserById).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ url: 'https://billing.stripe.com/session/lifetime' })
  })
})
