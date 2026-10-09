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

  it('discloses the unsigned desktop app on the Lifetime checkout page', async () => {
    const { default: handler } = await import('../../api/create-checkout-session.js')
    await handler(req(), res())
    const params = sessionsCreate.mock.calls[0][0]
    expect(params.custom_text.submit.message).toMatch(/not yet signed by Apple or Microsoft/)
    expect(params.custom_text.submit.message.length).toBeLessThanOrEqual(1200)
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
})
