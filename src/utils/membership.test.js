import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getMembership, PLAN_STORAGE_BYTES } from './membership'

const now = new Date('2026-07-20T12:00:00Z')

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
})

afterAll(() => {
  vi.useRealTimers()
})

const makeUser = (overrides = {}) => ({
  id: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
  ...overrides,
})

describe('membership plan limits', () => {
  it('uses a 250 MB quota for Free cloud accounts', () => {
    const membership = getMembership(makeUser())

    expect(PLAN_STORAGE_BYTES.free).toBe(250 * 1024 * 1024)
    expect(membership.isFree).toBe(true)
    expect(membership.storageQuotaBytes).toBe(250 * 1024 * 1024)
    expect(membership.usesFreeCloudLimits).toBe(true)
  })

  it('falls lapsed Lifetime cloud hosting back to Free cloud limits without losing Lifetime identity', () => {
    const membership = getMembership(makeUser({
      app_metadata: {
        subscription_plan: 'premium_plus_lifetime',
        lifetime_purchased_at: '2020-01-01T00:00:00Z',
      },
      user_metadata: {
        free_project_id: 'project-1',
      },
    }))

    expect(membership.isLifetime).toBe(true)
    expect(membership.isMaintenanceLapsed).toBe(true)
    expect(membership.isCloudFreeFallback).toBe(true)
    expect(membership.usesFreeCloudLimits).toBe(true)
    expect(membership.freeProjectId).toBe('project-1')
    expect(membership.storageQuotaBytes).toBe(PLAN_STORAGE_BYTES.free)
  })

  it('flags accounts with a real Stripe customer id', () => {
    const withCustomer = getMembership(makeUser({
      app_metadata: { subscription_plan: 'premium_monthly', subscription_status: 'active', stripe_customer_id: 'cus_123' },
    }))
    expect(withCustomer.hasStripeCustomer).toBe(true)

    // A plan set directly via SQL (not a real Stripe checkout) is paid
    // locally but has no Stripe customer to manage billing for.
    const withoutCustomer = getMembership(makeUser({
      app_metadata: { subscription_plan: 'premium_monthly', subscription_status: 'active' },
    }))
    expect(withoutCustomer.isPaid).toBe(true)
    expect(withoutCustomer.hasStripeCustomer).toBe(false)
  })

  it('treats beta tester accounts as temporary full-access members', () => {
    const membership = getMembership(makeUser({
      app_metadata: {
        subscription_plan: 'beta_tester',
        subscription_status: 'active',
        beta_tester: true,
      },
    }))

    expect(membership.isBetaTester).toBe(true)
    expect(membership.isPaid).toBe(true)
    expect(membership.isFree).toBe(false)
    expect(membership.activePlanKey).toBe('beta_tester')
    expect(membership.activePlanDef.label).toBe('Beta Tester')
    expect(membership.freeProjectId).toBe(null)
    expect(membership.isDesktopEntitled).toBe(true)
    expect(membership.storageQuotaBytes).toBe(PLAN_STORAGE_BYTES.beta_tester)
  })
})
