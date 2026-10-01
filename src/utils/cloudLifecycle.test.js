import { describe, expect, it } from 'vitest'
import { computeCloudLifecycle, PHASES, DAY_MS, addMonths } from './cloudLifecycle'

const NOW = new Date('2026-10-01T12:00:00Z')
const days = n => new Date(NOW.getTime() + n * DAY_MS)

describe('paid hosting lifecycle', () => {
  const run = hostingEndsAt => computeCloudLifecycle({ kind: 'paid_hosting', now: NOW, hostingEndsAt })

  it('is active and writable well before expiry, with no notice', () => {
    const r = run(days(200))
    expect(r.phase).toBe(PHASES.ACTIVE)
    expect(r.cloudWritesAllowed).toBe(true)
    expect(r.notice).toBeNull()
  })
  it('warns in the final 30 days and sends the 7-day final notice', () => {
    expect(run(days(30)).phase).toBe(PHASES.WARNING)
    expect(run(days(30)).notice).toBe('expiry-30d')
    expect(run(days(7)).notice).toBe('expiry-7d')
    expect(run(days(7)).cloudWritesAllowed).toBe(true)
  })
  it('enters a 90-day grace on expiry: export allowed, writes still allowed until grace ends', () => {
    const r = run(days(-1))
    expect(r.phase).toBe(PHASES.GRACE)
    expect(r.exportAllowed).toBe(true)
    expect(r.cloudWritesAllowed).toBe(true)
    expect(r.graceDaysRemaining).toBe(89)
    expect(r.notice).toBe('grace-start')
  })
  it('sends the final grace notice in the last 7 days', () => {
    const r = run(days(-84))
    expect(r.phase).toBe(PHASES.GRACE)
    expect(r.notice).toBe('grace-final')
  })
  it('archives (never deletes) after grace', () => {
    const r = run(days(-91))
    expect(r.phase).toBe(PHASES.ARCHIVED)
    expect(r.action).toBe('archive')
    expect(r.exportAllowed).toBe(true)
    expect(r.cloudWritesAllowed).toBe(false)
  })
  it('treats a missing or invalid date as active (fail safe for user data)', () => {
    expect(run(null).phase).toBe(PHASES.ACTIVE)
    expect(run('not-a-date').phase).toBe(PHASES.ACTIVE)
  })
  it('renewal (new later expiry) returns to active immediately', () => {
    expect(run(days(365)).phase).toBe(PHASES.ACTIVE)
  })
})

describe('free inactive-account lifecycle', () => {
  const run = lastActivityAt => computeCloudLifecycle({ kind: 'free', now: NOW, lastActivityAt })

  it('is active before 18 months of inactivity', () => {
    expect(run(addMonths(NOW, -17)).phase).toBe(PHASES.ACTIVE)
  })
  it('starts the 90-day warning/export grace after 18 months', () => {
    const r = run(addMonths(NOW, -18))
    expect(r.phase).toBe(PHASES.GRACE)
    expect(r.exportAllowed).toBe(true)
    expect(r.action).toBe('notify')
  })
  it('flags deletion only after the 90-day grace with no response', () => {
    const last = new Date(addMonths(NOW, -18).getTime() - 91 * DAY_MS)
    const r = run(last)
    expect(r.phase).toBe(PHASES.DELETE_DUE)
    expect(r.action).toBe('delete')
  })
  it('a recent sign-in resets the clock', () => {
    expect(run(days(-1)).phase).toBe(PHASES.ACTIVE)
  })
  it('unknown activity is never treated as inactive', () => {
    expect(run(null).phase).toBe(PHASES.ACTIVE)
  })
})

describe('other plans', () => {
  it('Founder / Monthly / unknown are always active', () => {
    expect(computeCloudLifecycle({ kind: 'none', now: NOW }).phase).toBe(PHASES.ACTIVE)
  })
})
