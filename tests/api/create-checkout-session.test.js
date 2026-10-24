import { beforeEach, describe, expect, it, vi } from 'vitest'

const pricesRetrieve = vi.fn()
const sessionsCreate = vi.fn()
const sessionsExpire = vi.fn()
const getUser = vi.fn()
const rpc = vi.fn()

vi.mock('stripe', () => ({
  default: vi.fn(function StripeMock() {
    this.prices = { retrieve: pricesRetrieve }
    this.checkout = { sessions: { create: sessionsCreate, expire: sessionsExpire } }
  }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser }, rpc })),
}))

const req = (plan = 'premium_plus_lifetime') => ({
  method: 'POST',
  headers: { authorization: 'Bearer token' },
  body: { plan },
})
const res = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() })

// A Lifetime account in the last 30 days of its Cloud period: the only kind that may buy a renewal.
const dueLifetimeUser = () => ({
  id: 'user-1', email: 'writer@example.test', created_at: '2024-01-01T00:00:00Z',
  app_metadata: {
    subscription_plan: 'premium_plus_lifetime', subscription_status: 'active',
    lifetime_purchased_at: '2024-02-01T00:00:00Z',
    hosting_included_until: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
})

describe('create-checkout-session Founding Price selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
    process.env.STRIPE_PRICE_ID_FOUNDING_LIFETIME = 'price_founding'
    process.env.STRIPE_PRICE_ID_PREMIUM_PLUS_LIFETIME = 'price_standard'
    process.env.STRIPE_PRICE_ID_PREMIUM_MONTHLY = 'price_monthly'
    process.env.STRIPE_PRICE_ID_MAINTENANCE = 'price_cloud'
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'writer@example.test', app_metadata: {} } }, error: null })
    pricesRetrieve.mockImplementation(async id => ({
      id, active: true, currency: 'gbp', livemode: true,
      unit_amount: id === 'price_founding' ? 5000 : id === 'price_standard' ? 7500 : 1000,
      recurring: null,
    }))
    sessionsCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.test/cs_1' })
    rpc.mockImplementation(async name => {
      if (name === 'reserve_founder_checkout') return { data: { eligible: true, reservation_id: 'reservation-100' }, error: null }
      if (name === 'bind_founder_checkout') return { data: true, error: null }
      return { data: null, error: null }
    })
  })

  it('uses £50 and a bound reservation while a live Founder place exists', async () => {
    const { default: handler } = await import('../../api/create-checkout-session.js')
    const response = res()
    await handler(req(), response)

    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: 'price_founding', quantity: 1 }],
      metadata: expect.objectContaining({
        plan: 'premium_plus_lifetime', lifetime_offer: 'founding',
        lifetime_cloud_years: '2', founder_reservation_id: 'reservation-100',
      }),
    }))
    expect(rpc).toHaveBeenCalledWith('bind_founder_checkout', expect.objectContaining({ p_checkout_session_id: 'cs_1' }))
    expect(response.status).toHaveBeenCalledWith(200)
  })

  it('automatically uses £75 with one Cloud year when all positions are held or claimed', async () => {
    rpc.mockResolvedValueOnce({ data: { eligible: false, reason: 'sold_out' }, error: null })
    const { default: handler } = await import('../../api/create-checkout-session.js')
    await handler(req(), res())
    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: 'price_standard', quantity: 1 }],
      metadata: expect.objectContaining({ lifetime_offer: 'standard', lifetime_cloud_years: '1' }),
    }))
  })

  it('uses the test Founding Price without reserving a production place', async () => {
    pricesRetrieve.mockImplementation(async id => ({ id, active: true, currency: 'gbp', livemode: false, unit_amount: id === 'price_founding' ? 5000 : 7500, recurring: null }))
    const { default: handler } = await import('../../api/create-checkout-session.js')
    await handler(req(), res())
    expect(rpc).not.toHaveBeenCalledWith('reserve_founder_checkout', expect.anything())
    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: 'price_founding', quantity: 1 }],
      metadata: expect.objectContaining({ lifetime_offer: 'founding_test', lifetime_cloud_years: '2' }),
    }))
  })

  it('makes the private Founding test request use £50 without a Standard fallback', async () => {
    pricesRetrieve.mockImplementation(async id => ({ id, active: true, currency: 'gbp', livemode: false, unit_amount: id === 'price_founding' ? 5000 : 7500, recurring: null }))
    const { default: handler } = await import('../../api/create-checkout-session.js')
    const response = res()
    await handler(req('founding_lifetime_test'), response)

    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: 'price_founding', quantity: 1 }],
      metadata: expect.objectContaining({
        plan: 'premium_plus_lifetime', lifetime_offer: 'founding_test', lifetime_cloud_years: '2',
      }),
    }))
    expect(response.status).toHaveBeenCalledWith(200)
  })

  it('rejects the private Founding test request if the configured Price is live', async () => {
    const { default: handler } = await import('../../api/create-checkout-session.js')
    const response = res()
    await handler(req('founding_lifetime_test'), response)

    expect(response.status).toHaveBeenCalledWith(400)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('rejects the retired Founder plan', async () => {
    const { default: handler } = await import('../../api/create-checkout-session.js')
    const response = res()
    await handler(req('founder'), response)
    expect(response.status).toHaveBeenCalledWith(400)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it.each(['hosting_renewal', 'maintenance'])('%s renews Cloud hosting at the GBP 6 yearly price', async plan => {
    pricesRetrieve.mockImplementation(async id => ({
      id, active: true, currency: 'gbp', livemode: true, unit_amount: 600, recurring: { interval: 'year' },
    }))
    getUser.mockResolvedValue({ data: { user: dueLifetimeUser() }, error: null })
    const { default: handler } = await import('../../api/create-checkout-session.js')
    const response = res()
    await handler(req(plan), response)

    expect(response.status).toHaveBeenCalledWith(200)
    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      line_items: [{ price: 'price_cloud', quantity: 1 }],
    }))
  })

  it('refuses hosting renewal if the configured Price is not GBP 6 per year', async () => {
    pricesRetrieve.mockImplementation(async id => ({
      id, active: true, currency: 'gbp', livemode: true, unit_amount: 600, recurring: { interval: 'month' },
    }))
    getUser.mockResolvedValue({ data: { user: dueLifetimeUser() }, error: null })
    const { default: handler } = await import('../../api/create-checkout-session.js')
    const response = res()
    await handler(req('hosting_renewal'), response)

    expect(sessionsCreate).not.toHaveBeenCalled()
    expect(response.status).not.toHaveBeenCalledWith(200)
  })
})

describe('create-checkout-session Cloud renewal is only sold when it is due', () => {
  const DAY = 24 * 60 * 60 * 1000
  const lifetimeUser = (extra = {}) => ({
    id: 'user-1', email: 'writer@example.test', created_at: '2024-01-01T00:00:00Z',
    app_metadata: {
      subscription_plan: 'premium_plus_lifetime', subscription_status: 'active',
      lifetime_purchased_at: new Date(Date.now() - 30 * DAY).toISOString(),
      hosting_included_until: new Date(Date.now() + 700 * DAY).toISOString(),
      ...extra,
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
    process.env.STRIPE_PRICE_ID_MAINTENANCE = 'price_cloud'
    pricesRetrieve.mockImplementation(async id => ({
      id, active: true, currency: 'gbp', livemode: false, unit_amount: 600, recurring: { interval: 'year' },
    }))
    sessionsCreate.mockResolvedValue({ id: 'cs_cloud', url: 'https://checkout.test/cs_cloud' })
  })

  const attempt = async (user, plan = 'hosting_renewal') => {
    getUser.mockResolvedValue({ data: { user }, error: null })
    const { default: handler } = await import('../../api/create-checkout-session.js')
    const response = res()
    await handler(req(plan), response)
    return response
  }

  it('refuses a renewal while the included Cloud period still has months left (no paying years ahead)', async () => {
    const response = await attempt(lifetimeUser())
    expect(response.status).toHaveBeenCalledWith(409)
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'renewal_not_due' }))
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('refuses a renewal for an account that is not Lifetime', async () => {
    const response = await attempt({ id: 'user-2', email: 'x@example.test', created_at: '2020-01-01T00:00:00Z', app_metadata: {} })
    expect(response.status).toHaveBeenCalledWith(409)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('allows a renewal in the last 30 days of the Cloud period', async () => {
    const response = await attempt(lifetimeUser({ hosting_included_until: new Date(Date.now() + 20 * DAY).toISOString() }))
    expect(response.status).not.toHaveBeenCalledWith(409)
    expect(sessionsCreate).toHaveBeenCalled()
  })

  it('allows a renewal once the Cloud period has lapsed', async () => {
    const response = await attempt(lifetimeUser({ hosting_included_until: new Date(Date.now() - 10 * DAY).toISOString() }))
    expect(sessionsCreate).toHaveBeenCalled()
    expect(response.status).not.toHaveBeenCalledWith(409)
  })

  it('refuses a second renewal while one is already set to renew automatically', async () => {
    const response = await attempt(lifetimeUser({
      hosting_included_until: new Date(Date.now() + 10 * DAY).toISOString(),
      cloud_renewal_subscription_status: 'active',
    }))
    expect(response.status).toHaveBeenCalledWith(409)
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'already_renewing' }))
  })

  it('works for the legacy maintenance plan key too', async () => {
    const response = await attempt(lifetimeUser(), 'maintenance')
    expect(response.status).toHaveBeenCalledWith(409)
  })
})
