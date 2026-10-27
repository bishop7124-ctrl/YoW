import { describe, expect, it, vi } from 'vitest'
import { fetchPublicAvailability, isCheckoutOpen } from './checkoutAvailability'

const ok = body => vi.fn().mockResolvedValue({ ok: true, json: async () => body })

describe('checkout availability', () => {
  it('is open only when the server says checkoutOpen is exactly true', () => {
    expect(isCheckoutOpen({ checkoutOpen: true })).toBe(true)
    for (const value of [false, 'true', 1, null, undefined]) expect(isCheckoutOpen({ checkoutOpen: value })).toBe(false)
    expect(isCheckoutOpen(null)).toBe(false)
    expect(isCheckoutOpen(undefined)).toBe(false)
  })

  it('returns the server body, including when slot counts are missing', async () => {
    const body = { total: null, taken: null, remaining: null, checkoutOpen: true }
    expect(await fetchPublicAvailability(ok(body))).toEqual(body)
  })

  it('fails closed on HTTP errors, network errors and bad bodies', async () => {
    expect(await fetchPublicAvailability(vi.fn().mockResolvedValue({ ok: false, json: async () => ({ checkoutOpen: true }) }))).toBeNull()
    expect(await fetchPublicAvailability(vi.fn().mockRejectedValue(new Error('offline')))).toBeNull()
    expect(await fetchPublicAvailability(vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('bad json') } }))).toBeNull()
    expect(await fetchPublicAvailability(ok('nope'))).toBeNull()
    expect(isCheckoutOpen(await fetchPublicAvailability(vi.fn().mockRejectedValue(new Error('offline'))))).toBe(false)
  })
})
