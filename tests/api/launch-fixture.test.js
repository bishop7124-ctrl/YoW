import { describe, expect, it } from 'vitest'
import { buildFixtureMetadata } from '../../scripts/prepare-launch-fixture.mjs'
import { getMembership } from '../../src/utils/membership.js'
describe('disposable launch fixture preparation', () => {
  it('refuses other users and billing-linked accounts', () => {
    expect(() => buildFixtureMetadata('someone@example.com', 'free')).toThrow('disposable')
    expect(() => buildFixtureMetadata('test1@yourownworld.co.uk', 'free', { stripe_customer_id: 'cus_live' })).toThrow('real billing')
  })
  it.each(['free', 'monthly', 'lifetime', 'founder', 'beta'])('produces a usable %s state', plan => {
    const membership = getMembership({ created_at: new Date().toISOString(), app_metadata: buildFixtureMetadata('test1@yourownworld.co.uk', plan) })
    expect(membership.isFree).toBe(plan === 'free')
    expect(membership.isBetaTester).toBe(plan === 'beta')
    expect(membership.isFounder).toBe(plan === 'founder')
  })
})
