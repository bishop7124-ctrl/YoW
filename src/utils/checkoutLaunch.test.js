import { describe, expect, it } from 'vitest'
import { isCheckoutLaunched } from './checkoutLaunch'

describe('isCheckoutLaunched', () => {
  it('is off unless the switch is exactly "true"', () => {
    expect(isCheckoutLaunched({})).toBe(false)
    expect(isCheckoutLaunched(undefined)).toBe(false)
    expect(isCheckoutLaunched({ VITE_CHECKOUT_LAUNCHED: 'false' })).toBe(false)
    expect(isCheckoutLaunched({ VITE_CHECKOUT_LAUNCHED: '1' })).toBe(false)
    expect(isCheckoutLaunched({ VITE_CHECKOUT_LAUNCHED: 'true' })).toBe(true)
  })
})
