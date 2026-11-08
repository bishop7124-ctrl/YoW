import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluateFlags, isFlagOn, loadFeatureFlags, resetFeatureFlagCache } from './featureFlags'

const flag = (over = {}) => ({ key: 'story_check', enabled: true, rollout_percent: 0, allow_user_ids: [], ...over })

describe('isFlagOn (fail closed)', () => {
  it('is off for missing flag, disabled flag, or no user', () => {
    expect(isFlagOn(undefined, 'u1')).toBe(false)
    expect(isFlagOn(flag({ enabled: false, rollout_percent: 100 }), 'u1')).toBe(false)
    expect(isFlagOn(flag({ rollout_percent: 100 }), null)).toBe(false)
  })
  it('is off for malformed values', () => {
    expect(isFlagOn(flag({ enabled: 'true', rollout_percent: 100 }), 'u1')).toBe(false)
    expect(isFlagOn(flag({ rollout_percent: 'abc' }), 'u1')).toBe(false)
    expect(isFlagOn(flag({ allow_user_ids: null }), 'u1')).toBe(false)
  })
  it('allow list wins at 0%', () => {
    expect(isFlagOn(flag({ allow_user_ids: ['u1'] }), 'u1')).toBe(true)
    expect(isFlagOn(flag({ allow_user_ids: ['u1'] }), 'u2')).toBe(false)
  })
  it('server-side allowed flag turns it on at 0%', () => {
    expect(isFlagOn(flag({ allowed: true }), 'u1')).toBe(true)
    expect(isFlagOn(flag({ allowed: false }), 'u1')).toBe(false)
  })
  it('100% is on for everyone, 0% for nobody', () => {
    expect(isFlagOn(flag({ rollout_percent: 100 }), 'anyone')).toBe(true)
    expect(isFlagOn(flag({ rollout_percent: 0 }), 'anyone')).toBe(false)
  })
  it('percentage rollout is stable and only grows', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `user-${i}`)
    const at10 = ids.filter(id => isFlagOn(flag({ rollout_percent: 10 }), id))
    const at50 = ids.filter(id => isFlagOn(flag({ rollout_percent: 50 }), id))
    expect(at10.length).toBeGreaterThan(15)
    expect(at10.length).toBeLessThan(70)
    at10.forEach(id => expect(at50).toContain(id))
    expect(ids.filter(id => isFlagOn(flag({ rollout_percent: 10 }), id))).toEqual(at10)
  })
})

describe('evaluateFlags / loadFeatureFlags', () => {
  beforeEach(() => resetFeatureFlagCache())

  it('ignores bad rows', () => {
    expect(evaluateFlags(null, 'u')).toEqual({})
    expect(evaluateFlags([null, { enabled: true }, flag({ rollout_percent: 100 })], 'u')).toEqual({ story_check: true })
  })

  it('returns {} when the query errors or throws', async () => {
    const errClient = { rpc: async () => ({ data: null, error: { message: 'x' } }) }
    expect(await loadFeatureFlags(errClient, 'u')).toEqual({})
    resetFeatureFlagCache()
    const throwClient = { rpc: () => { throw new Error('offline') } }
    expect(await loadFeatureFlags(throwClient, 'u')).toEqual({})
    expect(await loadFeatureFlags(null, 'u')).toEqual({})
    expect(await loadFeatureFlags(errClient, null)).toEqual({})
  })

  it('backs off after a failed load, then retries after five minutes', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-11-08T12:00:00Z'))
      const rpc = vi.fn()
        .mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
        .mockResolvedValueOnce({ data: [flag({ rollout_percent: 100 })], error: null })
      const client = { rpc }
      expect(await loadFeatureFlags(client, 'u1')).toEqual({})
      expect(await loadFeatureFlags(client, 'u1')).toEqual({})
      expect(rpc).toHaveBeenCalledTimes(1)
      vi.setSystemTime(new Date('2026-11-08T12:06:00Z'))
      expect(await loadFeatureFlags(client, 'u1')).toEqual({ story_check: true })
      expect(rpc).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fetches once per user and caches', async () => {
    const select = vi.fn(async () => ({ data: [flag({ rollout_percent: 100 })], error: null }))
    const client = { rpc: select }
    expect(await loadFeatureFlags(client, 'u1')).toEqual({ story_check: true })
    await loadFeatureFlags(client, 'u1')
    expect(select).toHaveBeenCalledTimes(1)
    await loadFeatureFlags(client, 'u2')
    expect(select).toHaveBeenCalledTimes(2)
  })
})

describe('account switching', () => {
  beforeEach(() => resetFeatureFlagCache())
  it('a late response for a previous user does not affect the next user', async () => {
    let releaseA
    const rpc = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { releaseA = () => resolve({ data: [flag({ rollout_percent: 100 })], error: null }) }))
      .mockResolvedValueOnce({ data: [], error: null })
    const client = { rpc }
    const pendingA = loadFeatureFlags(client, 'userA')
    const flagsB = await loadFeatureFlags(client, 'userB')
    releaseA()
    expect(await pendingA).toEqual({ story_check: true })
    expect(flagsB).toEqual({})
    expect(await loadFeatureFlags(client, 'userB')).toEqual({})
  })
})
