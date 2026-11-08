import { describe, expect, it } from 'vitest'
import { BILLING } from '../utils/billingConfig.js'
import { NOSCRIPT_PAGES, renderNoscript } from './noscriptContent.js'

describe('crawler fallback content', () => {
  it('states current prices from billing config', () => {
    const pricing = NOSCRIPT_PAGES.pricing.html
    expect(pricing).toContain(`£${BILLING.monthlyPrice} per month`)
    expect(pricing).toContain(`£${BILLING.lifetimePrice} one-time`)
    expect(pricing).toContain(`£${BILLING.foundingLifetimePrice}`)
    expect(pricing).toContain(`£${BILLING.hostingRenewalPrice} per year`)
  })

  it.each(Object.keys(NOSCRIPT_PAGES))('%s has exactly one h1 and no scripts', key => {
    const html = NOSCRIPT_PAGES[key].html
    expect(html.match(/<h1>/g)).toHaveLength(1)
    expect(html).not.toMatch(/<script|style=/i)
    expect(renderNoscript(key).startsWith('<noscript>')).toBe(true)
  })

  it('does not make claims the product contradicts', () => {
    const all = Object.values(NOSCRIPT_PAGES).map(p => p.html).join('\n')
    expect(all).not.toMatch(/any device|screenplay/i)
  })
})
