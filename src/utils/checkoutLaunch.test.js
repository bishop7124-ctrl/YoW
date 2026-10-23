import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCheckoutLive } from './checkoutLaunch'

afterEach(() => vi.unstubAllEnvs())

describe('isCheckoutLive', () => {
  it('is off unless the switch is exactly "true"', () => {
    expect(isCheckoutLive()).toBe(false)
    for (const value of ['', 'false', '1', 'TRUE', 'yes']) {
      vi.stubEnv('VITE_CHECKOUT_LIVE', value)
      expect(isCheckoutLive()).toBe(false)
    }
    vi.stubEnv('VITE_CHECKOUT_LIVE', 'true')
    expect(isCheckoutLive()).toBe(true)
  })
})
