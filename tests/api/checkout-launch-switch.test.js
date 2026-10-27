import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pricesRetrieve = vi.fn()
const sessionsCreate = vi.fn()
const getUser = vi.fn()
const rpc = vi.fn()
const stripeConstructor = vi.fn()

vi.mock('stripe', () => ({
  default: vi.fn(function StripeMock() {
    stripeConstructor()
    this.prices = { retrieve: pricesRetrieve }
    this.checkout = { sessions: { create: sessionsCreate, expire: vi.fn() } }
  }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser }, rpc })),
}))

const res = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() })
const postReq = plan => ({ method: 'POST', headers: { authorization: 'Bearer token' }, body: { plan } })
const getReq = () => ({ method: 'GET', headers: {} })

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SUPABASE_URL = 'https://stub.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'anon'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  process.env.STRIPE_PRICE_ID_PREMIUM_MONTHLY = 'price_monthly'
  delete process.env.CHECKOUT_OPEN
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'writer@example.test', app_metadata: {} } }, error: null })
  pricesRetrieve.mockResolvedValue({ id: 'price_monthly', active: true, currency: 'gbp', livemode: true, unit_amount: 1000, recurring: { interval: 'month' } })
  sessionsCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.test/cs_1' })
  rpc.mockResolvedValue({ data: { total: 100, taken: 10, remaining: 90 }, error: null })
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('checkout launch switch helpers', () => {
  it('opens only when CHECKOUT_OPEN is exactly "true"', async () => {
    const { isCheckoutOpen } = await import('../../api/_checkoutSwitch.js')
    expect(isCheckoutOpen({})).toBe(false)
    for (const value of ['', 'false', 'TRUE', 'True', '1', 'yes', ' true']) {
      expect(isCheckoutOpen({ CHECKOUT_OPEN: value })).toBe(false)
    }
    expect(isCheckoutOpen({ CHECKOUT_OPEN: 'true' })).toBe(true)
  })

  it('allows test-mode keys while closed but holds live keys back', async () => {
    const { checkoutAllowed } = await import('../../api/_checkoutSwitch.js')
    expect(checkoutAllowed({ STRIPE_SECRET_KEY: 'sk_test_abc' })).toBe(true)
    expect(checkoutAllowed({ STRIPE_SECRET_KEY: 'sk_live_abc' })).toBe(false)
    expect(checkoutAllowed({ STRIPE_SECRET_KEY: 'rk_live_abc' })).toBe(false)
    expect(checkoutAllowed({})).toBe(false)
    expect(checkoutAllowed({ STRIPE_SECRET_KEY: 'sk_live_abc', CHECKOUT_OPEN: 'true' })).toBe(true)
  })
})

describe('create-checkout-session launch switch', () => {
  it('refuses a live-key request while closed, before touching Stripe or the account', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_stub'
    const { default: handler } = await import('../../api/create-checkout-session.js')
    const response = res()
    await handler(postReq('premium_monthly'), response)

    expect(response.status).toHaveBeenCalledWith(403)
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'checkout_closed' }))
    expect(stripeConstructor).not.toHaveBeenCalled()
    expect(getUser).not.toHaveBeenCalled()
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('refuses when CHECKOUT_OPEN is set to anything other than "true"', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_stub'
    process.env.CHECKOUT_OPEN = 'yes'
    const { default: handler } = await import('../../api/create-checkout-session.js')
    const response = res()
    await handler(postReq('premium_monthly'), response)
    expect(response.status).toHaveBeenCalledWith(403)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('creates a live checkout once CHECKOUT_OPEN=true', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_stub'
    process.env.CHECKOUT_OPEN = 'true'
    const { default: handler } = await import('../../api/create-checkout-session.js')
    const response = res()
    await handler(postReq('premium_monthly'), response)

    expect(response.status).toHaveBeenCalledWith(200)
    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({ line_items: [{ price: 'price_monthly', quantity: 1 }] }))
  })

  it('keeps the private test-mode checkout working while closed', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    pricesRetrieve.mockResolvedValue({ id: 'price_monthly', active: true, currency: 'gbp', livemode: false, unit_amount: 1000, recurring: { interval: 'month' } })
    const { default: handler } = await import('../../api/create-checkout-session.js')
    const response = res()
    await handler(postReq('premium_monthly'), response)
    expect(response.status).toHaveBeenCalledWith(200)
  })

  it('still answers CORS preflight and wrong methods while closed', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_stub'
    const { default: handler } = await import('../../api/create-checkout-session.js')
    const preflight = res()
    await handler({ method: 'OPTIONS', headers: {} }, preflight)
    expect(preflight.status).toHaveBeenCalledWith(200)
    const wrong = res()
    await handler({ method: 'GET', headers: {} }, wrong)
    expect(wrong.status).toHaveBeenCalledWith(405)
  })
})

describe('get-founder-slots reports the launch switch', () => {
  it('reports checkoutOpen false by default and keeps the slot counts', async () => {
    const { default: handler } = await import('../../api/get-founder-slots.js')
    const response = res()
    await handler(getReq(), response)
    expect(response.json).toHaveBeenCalledWith({ total: 100, taken: 10, remaining: 90, checkoutOpen: false })
  })

  it('reports checkoutOpen true only when the switch is on', async () => {
    process.env.CHECKOUT_OPEN = 'true'
    const { default: handler } = await import('../../api/get-founder-slots.js')
    const response = res()
    await handler(getReq(), response)
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ checkoutOpen: true }))
  })

  it('still reports the switch when the slot lookup fails, so the page can open checkout', async () => {
    process.env.CHECKOUT_OPEN = 'true'
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { default: handler } = await import('../../api/get-founder-slots.js')
    const response = res()
    await handler(getReq(), response)
    expect(response.json).toHaveBeenCalledWith({ total: null, taken: null, remaining: null, checkoutOpen: true })
  })

  it('reports closed when the lookup throws and the switch is off', async () => {
    rpc.mockRejectedValue(new Error('network'))
    const { default: handler } = await import('../../api/get-founder-slots.js')
    const response = res()
    await handler(getReq(), response)
    expect(response.json).toHaveBeenCalledWith({ total: null, taken: null, remaining: null, checkoutOpen: false })
  })
})
