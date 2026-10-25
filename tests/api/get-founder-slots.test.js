import { afterEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc }) }))

const res = () => {
  const r = { headers: {}, setHeader: (k, v) => { r.headers[k] = v }, status: vi.fn(() => r), json: vi.fn(() => r), end: vi.fn(() => r) }
  return r
}

describe('get-founder-slots reports the launch switch', () => {
  afterEach(() => { delete process.env.YOW_CHECKOUT_OPEN; rpc.mockReset() })

  it('adds checkoutOpen=false by default and true only when YOW_CHECKOUT_OPEN is exactly "true"', async () => {
    const { default: handler } = await import('../../api/get-founder-slots.js')
    rpc.mockResolvedValue({ data: { total: 100, taken: 3, remaining: 97 }, error: null })
    let r = res()
    await handler({ method: 'GET', headers: {} }, r)
    expect(r.json).toHaveBeenCalledWith({ total: 100, taken: 3, remaining: 97, checkoutOpen: false })
    process.env.YOW_CHECKOUT_OPEN = 'true'
    r = res()
    await handler({ method: 'GET', headers: {} }, r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ checkoutOpen: true }))
  })

  it('still reports the switch when the Founder count cannot be read', async () => {
    const { default: handler } = await import('../../api/get-founder-slots.js')
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    process.env.YOW_CHECKOUT_OPEN = 'true'
    const r = res()
    await handler({ method: 'GET', headers: {} }, r)
    expect(r.json).toHaveBeenCalledWith({ total: null, taken: null, remaining: null, checkoutOpen: true })
  })
})
