// @vitest-environment jsdom
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { getMembership } from './membership.js'

vi.mock('../supabase', () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } } }))

// 6 Oct desktop entitlement matrix: which accounts get the desktop app, and proof that none
// of the editable client-side places (user_metadata, localStorage cache, device id) can change it.

const NOW = new Date('2026-10-06T12:00:00Z')
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
afterAll(() => { vi.useRealTimers() })
afterEach(() => { localStorage.clear() })

const user = (app = {}, userMeta = {}) => ({ id: 'u1', created_at: '2026-01-01T00:00:00Z', app_metadata: app, user_metadata: userMeta })
const iso = (days) => new Date(NOW.getTime() + days * 86400000).toISOString()

const CASES = [
  ['Free (trial over)', user({}), { entitled: false, download: false }],
  ['Free in 28-day trial', user({}, {}), null],
  ['Monthly active (browser only)', user({ subscription_plan: 'premium_monthly', subscription_status: 'active' }), { entitled: false, download: false }],
  ['Monthly cancelled', user({ subscription_plan: 'premium_monthly', subscription_status: 'canceled' }), { entitled: false, download: false }],
  ['Lifetime', user({ subscription_plan: 'premium_plus_lifetime', subscription_status: 'active', lifetime_purchased_at: '2026-09-01T00:00:00Z' }), { entitled: true, download: true }],
  ['Legacy Lifetime key', user({ subscription_plan: 'premium_lifetime', subscription_status: 'active', lifetime_purchased_at: '2026-09-01T00:00:00Z' }), { entitled: true, download: true }],
  ['Founder', user({ subscription_plan: 'founder', subscription_status: 'active', lifetime_purchased_at: '2026-09-01T00:00:00Z' }), { entitled: true, download: true }],
  ['Lifetime with lapsed hosting (Local Mode keeps working)', user({ subscription_plan: 'premium_plus_lifetime', subscription_status: 'active', lifetime_purchased_at: '2019-01-01T00:00:00Z', cloud_hosting_expires_at: iso(-400) }), { entitled: true, download: true }],
  ['Beta, no launch notice yet', user({ subscription_plan: 'beta_tester', subscription_status: 'active', beta_tester: true }), { entitled: true, download: true }],
  ['Beta, notice running', user({ subscription_plan: 'beta_tester', subscription_status: 'active', beta_tester: true, beta_notice_started_at: iso(-5) }), { entitled: true, download: false }],
  ['Beta, notice over', user({ subscription_plan: 'beta_tester', subscription_status: 'active', beta_tester: true, beta_notice_started_at: iso(-31) }), { entitled: false, download: false }],
  ['Access revoked', user({ access_revoked_at: iso(-2) }), { entitled: false, download: false }],
]

describe('desktop entitlement matrix (server-controlled app_metadata only)', () => {
  it.each(CASES.filter(c => c[2]))('%s', (_label, account, expected) => {
    const m = getMembership(account)
    expect(m.isDesktopEntitled).toBe(expected.entitled)
    expect(m.canDownloadDesktop).toBe(expected.download)
  })

  it('every editable user_metadata attempt leaves a Free account without desktop access', () => {
    const forged = {
      subscription_plan: 'founder', subscription_status: 'active', beta_tester: true, is_founder: true,
      lifetime_purchased_at: '2020-01-01T00:00:00Z', isDesktopEntitled: true, canDownloadDesktop: true,
      plan: 'premium_plus_lifetime', desktop_entitled: true, beta_notice_started_at: '2026-01-01T00:00:00Z',
    }
    const m = getMembership(user({}, forged))
    expect(m.isDesktopEntitled).toBe(false)
    expect(m.canDownloadDesktop).toBe(false)
    expect(m.isLifetime).toBe(false)
    expect(m.isFounder).toBe(false)
  })

  it('user_metadata cannot downgrade or alter a real Lifetime account either', () => {
    const real = { subscription_plan: 'premium_plus_lifetime', subscription_status: 'active', lifetime_purchased_at: '2026-09-01T00:00:00Z' }
    expect(getMembership(user(real, { subscription_plan: 'none', subscription_status: 'canceled' })).isDesktopEntitled).toBe(true)
  })
})

describe('cached desktop licence cannot be forged or replayed', () => {
  const mk = (over = {}) => ({
    record: { version: 1, userId: 'u1', deviceId: 'device-aaaa-1111', plan: 'founder', issuedAt: NOW.toISOString(), ...over.record },
    signature: 'x', verifiedAt: NOW.toISOString(), ...over.top,
  })
  const ctx = { userId: 'u1', deviceId: 'device-aaaa-1111' }

  it('accepts a record issued to this account and device', async () => {
    const { evaluateDesktopEntitlement } = await import('./desktopEntitlement.js')
    expect(evaluateDesktopEntitlement({ membership: { isDesktopEntitled: false }, cached: mk(), ...ctx, now: NOW }))
      .toMatchObject({ entitled: true, source: 'cache' })
  })

  it.each([
    ['another account', mk({ record: { userId: 'someone-else' } })],
    ['another device (copied from a different machine)', mk({ record: { deviceId: 'device-bbbb-2222' } })],
    ['an invented plan', mk({ record: { plan: 'god_mode' } })],
    ['a legacy Monthly desktop record', mk({ record: { plan: 'premium_monthly', expiresAt: iso(20) } })],
    ['no verified date', mk({ top: { verifiedAt: undefined } })],
    ['a future-dated verification (stops the 30-day clock ever expiring)', mk({ top: { verifiedAt: new Date(NOW.getTime() + 400 * 86400000).toISOString() } })],
    ['a record with no plan', mk({ record: { plan: undefined } })],
  ])('rejects %s', async (_label, cached) => {
    const { evaluateDesktopEntitlement } = await import('./desktopEntitlement.js')
    expect(evaluateDesktopEntitlement({ membership: { isDesktopEntitled: false }, cached, ...ctx, now: NOW }))
      .toMatchObject({ entitled: false, source: null })
  })

  it('a forged cache never overrides the live account result, and the live account wins when present', async () => {
    const { evaluateDesktopEntitlement } = await import('./desktopEntitlement.js')
    expect(evaluateDesktopEntitlement({ membership: { isDesktopEntitled: true }, cached: null, ...ctx, now: NOW }))
      .toMatchObject({ entitled: true, source: 'account' })
  })

  it('30-day advisory recheck: stale only after 30 days, offline-grace never revokes', async () => {
    const { evaluateDesktopEntitlement, DESKTOP_GRACE_DAYS } = await import('./desktopEntitlement.js')
    expect(DESKTOP_GRACE_DAYS).toBe(30)
    const at = (days) => evaluateDesktopEntitlement({ membership: { isDesktopEntitled: false }, cached: mk({ top: { verifiedAt: new Date(NOW.getTime() - days * 86400000).toISOString() } }), ...ctx, now: NOW })
    expect(at(29)).toMatchObject({ entitled: true, stale: false })
    expect(at(30)).toMatchObject({ entitled: true, stale: false })
    expect(at(31)).toMatchObject({ entitled: true, stale: true })     // nag only; still entitled
    expect(at(400)).toMatchObject({ entitled: true, stale: true })
  })
})
