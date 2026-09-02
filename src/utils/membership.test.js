import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getMembership, PLAN_STORAGE_BYTES, PROFILE_METADATA_ALLOWLIST, sanitizeProfileMetadata } from './membership'

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

// P0-01 (docs/YOW_CODE_AUDIT_2026-09-01.md): entitlement must come only from
// server-controlled app_metadata. A signed-in user can write user_metadata
// directly (via AuthContext.updateProfile() or the Supabase client SDK
// itself), so every one of these fields must be a no-op there.
describe('membership entitlement negative matrix (user_metadata is untrusted)', () => {
  it('ignores a self-written subscription_status/subscription_plan in user_metadata', () => {
    const membership = getMembership(makeUser({
      user_metadata: {
        subscription_status: 'active',
        subscription_plan: 'premium_plus_lifetime',
      },
    }))

    expect(membership.isPaid).toBe(false)
    expect(membership.isLifetime).toBe(false)
    expect(membership.isFree).toBe(true)
    expect(membership.subscriptionPlan).toBe(null)
  })

  it('ignores a self-written beta_tester flag in user_metadata', () => {
    const membership = getMembership(makeUser({
      user_metadata: { beta_tester: true },
    }))

    expect(membership.isBetaTester).toBe(false)
    expect(membership.isPaid).toBe(false)
    expect(membership.isDesktopEntitled).toBe(false)
  })

  it('ignores a self-written founder plan in user_metadata', () => {
    const membership = getMembership(makeUser({
      user_metadata: { subscription_plan: 'founder' },
    }))

    expect(membership.isFounder).toBe(false)
    expect(membership.isPaid).toBe(false)
  })

  it('ignores a self-written desktop-unlocking plan in user_metadata', () => {
    const membership = getMembership(makeUser({
      user_metadata: { subscription_plan: 'premium_plus_lifetime' },
    }))

    expect(membership.isDesktopEntitled).toBe(false)
  })

  it('ignores a self-written was_monthly in user_metadata (only app_metadata unlocks the free-tier project lock)', () => {
    const membership = getMembership(makeUser({
      user_metadata: { was_monthly: true },
    }))

    expect(membership.wasMonthly).toBe(false)
  })

  it('honors was_monthly only from app_metadata', () => {
    const membership = getMembership(makeUser({
      app_metadata: { was_monthly: true },
    }))

    expect(membership.wasMonthly).toBe(true)
  })

  it('cannot extend the trial by writing trial_started_at into user_metadata', () => {
    const freshMembership = getMembership(makeUser())
    const spoofedMembership = getMembership(makeUser({
      user_metadata: { trial_started_at: '2026-07-19T12:00:00Z' }, // "started" 1 day ago
    }))

    // Both fall back to the same server-controlled created_at, so the spoofed
    // value changes nothing about trial length.
    expect(spoofedMembership.trialEndsAt.getTime()).toBe(freshMembership.trialEndsAt.getTime())
    expect(spoofedMembership.daysRemaining).toBe(freshMembership.daysRemaining)
  })

  it('honors real paid entitlement from app_metadata unaffected by the negative matrix', () => {
    const membership = getMembership(makeUser({
      app_metadata: { subscription_status: 'active', subscription_plan: 'premium_monthly' },
    }))

    expect(membership.isPaid).toBe(true)
    expect(membership.isFree).toBe(false)
  })
})

describe('sanitizeProfileMetadata (P0-01 profile-update allowlist)', () => {
  it('keeps allowlisted cosmetic/preference fields', () => {
    const result = sanitizeProfileMetadata({
      full_name: 'Ada Lovelace',
      theme: 'quiet-slate',
      tour_progress: { dashboard: true },
      free_project_id: 'project-1',
    })

    expect(result).toEqual({
      full_name: 'Ada Lovelace',
      theme: 'quiet-slate',
      tour_progress: { dashboard: true },
      free_project_id: 'project-1',
    })
  })

  it('strips every entitlement-shaped field, even when spread in alongside a legitimate update', () => {
    const result = sanitizeProfileMetadata({
      // Simulates the real call shape: existing user_metadata spread back in
      // (which may include stale/attacker-written keys) plus one real change.
      subscription_status: 'active',
      subscription_plan: 'founder',
      beta_tester: true,
      was_monthly: false,
      trial_started_at: '2020-01-01T00:00:00Z',
      tour_progress: { dashboard: true },
    })

    expect(result).toEqual({ tour_progress: { dashboard: true } })
  })

  it('drops unknown keys not on the allowlist rather than passing them through', () => {
    const result = sanitizeProfileMetadata({ some_new_field_nobody_reviewed: 'x' })
    expect(result).toEqual({})
  })

  it('allowlist contains no entitlement-shaped field', () => {
    for (const key of PROFILE_METADATA_ALLOWLIST) {
      expect(key).not.toMatch(/subscription|beta_tester|was_monthly|trial_started_at|founder|lifetime/i)
    }
  })
})
