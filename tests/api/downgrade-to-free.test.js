import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const updateUserById = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser, admin: { updateUserById } } }),
}))

const makeRes = () => ({
  setHeader: vi.fn(),
  status: vi.fn().mockReturnThis(),
  json: vi.fn(),
  end: vi.fn(),
})

const makeReq = (overrides = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer test-token' },
  body: { userId: 'user-1' },
  ...overrides,
})

describe('create-customer-portal downgrade_to_free action', () => {
  let handler

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'
    getUser.mockReset()
    updateUserById.mockReset()
    updateUserById.mockResolvedValue({ error: null })
    vi.resetModules()
    const mod = await import('../../api/create-customer-portal.js')
    handler = mod.default
  })

  it('rejects unauthenticated requests', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad token') })
    const res = makeRes()
    await handler(makeReq({ body: { action: 'downgrade_to_free' } }), res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('refuses an account with a real Stripe customer id, even if a subscription id is missing', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { subscription_plan: 'premium_plus_lifetime', stripe_customer_id: 'cus_123' } } },
      error: null,
    })
    const res = makeRes()
    await handler(makeReq({ body: { action: 'downgrade_to_free' } }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'has_stripe_subscription' }))
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('refuses an account with a real Stripe subscription id even without a customer id on file', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { subscription_plan: 'premium_monthly', stripe_subscription_id: 'sub_123' } } },
      error: null,
    })
    const res = makeRes()
    await handler(makeReq({ body: { action: 'downgrade_to_free' } }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('is a no-op for an account already on Free', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: {} } },
      error: null,
    })
    const res = makeRes()
    await handler(makeReq({ body: { action: 'downgrade_to_free' } }), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, alreadyFree: true }))
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('downgrades a plan that was manually granted via SQL (no Stripe customer or subscription id)', async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          app_metadata: { subscription_plan: 'premium_monthly', subscription_status: 'active' },
          user_metadata: { display_name: 'Test' },
        },
      },
      error: null,
    })
    const res = makeRes()
    await handler(makeReq({ body: { action: 'downgrade_to_free' } }), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true })
    expect(updateUserById).toHaveBeenCalledWith('user-1', {
      app_metadata: expect.objectContaining({ subscription_status: 'none', subscription_plan: null }),
      user_metadata: expect.objectContaining({ display_name: 'Test', was_monthly: true }),
    })
  })

  it('reports a 500 if the metadata update itself fails', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { subscription_plan: 'premium_monthly', subscription_status: 'active' } } },
      error: null,
    })
    updateUserById.mockResolvedValue({ error: new Error('db down') })
    const res = makeRes()
    await handler(makeReq({ body: { action: 'downgrade_to_free' } }), res)
    expect(res.status).toHaveBeenCalledWith(500)
  })
})
