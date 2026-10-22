// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { identifyUser, trackEvent } from './analytics'

afterEach(() => { delete window.gtag })

describe('analytics identity (audit YOW-18)', () => {
  it('never sends the account id to analytics, so usage data is not linked to an account', () => {
    window.gtag = vi.fn()
    identifyUser('3f6c1d52-aaaa-bbbb-cccc-1234567890ab')
    for (const call of window.gtag.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('3f6c1d52')
    }
  })

  it('clears any previously set user id on sign-in and sign-out', () => {
    window.gtag = vi.fn()
    identifyUser('user-1')
    identifyUser(null)
    expect(window.gtag).toHaveBeenCalledWith('set', { user_id: null })
  })

  it('still records events, and no-ops safely without gtag', () => {
    window.gtag = vi.fn()
    trackEvent('login', { method: 'password' })
    expect(window.gtag).toHaveBeenCalledWith('event', 'login', { method: 'password' })
    delete window.gtag
    expect(() => { trackEvent('x'); identifyUser('u') }).not.toThrow()
  })
})
