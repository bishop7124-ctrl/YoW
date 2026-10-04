import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 4 Oct data-safety matrix, item 2 (automated half): the durable limiter that backs the public
// feedback and paid-interest endpoints, run against a stateful in-memory stand-in for
// public.email_action_rate_limits so the whole cycle is exercised: N allowed, N+1 refused,
// other callers unaffected, and the block clears once the window has passed.
// The live production half (O05) is recorded in docs/QA_PLAN.md.

const rows = []
let failCount = false
const makeBuilder = () => {
  const filters = []
  let op = 'select'
  let payload = null
  const builder = {
    select: () => builder,
    eq: (col, val) => { filters.push(r => r[col] === val); return builder },
    gte: (col, val) => { filters.push(r => r[col] >= val); return builder },
    lt: (col, val) => { filters.push(r => r[col] < val); return builder },
    insert: (row) => { op = 'insert'; payload = row; return builder },
    delete: () => { op = 'delete'; return builder },
    then: (resolve, reject) => {
      let result
      if (op === 'insert') { rows.push({ ...payload, created_at: new Date().toISOString() }); result = { data: null, error: null } }
      else if (op === 'delete') { result = { data: null, error: null } }
      else if (failCount) result = { data: null, error: { message: 'db down' }, count: null }
      else result = { data: null, error: null, count: rows.filter(r => filters.every(f => f(r))).length }
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return builder
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => makeBuilder() }) }))

const ENV = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key-for-test' }

beforeEach(() => {
  rows.length = 0
  failCount = false
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-04T10:00:00Z'))
  vi.spyOn(Math, 'random').mockReturnValue(0.99) // skip the opportunistic cleanup branch
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe.each([
  ['feedback', '../../api/submit-feedback.js', 5, 60],
  ['paid-interest', '../../api/register-paid-interest.js', 5, 60],
])('%s endpoint durable rate limit', (_name, modulePath, max, windowMinutes) => {
  it(`allows ${max} requests, refuses the next, isolates other callers, and clears after ${windowMinutes} minutes`, async () => {
    const { isRateLimited } = await import(modulePath)
    for (let i = 0; i < max; i += 1) expect(await isRateLimited('203.0.113.7', ENV), `request ${i + 1}`).toBe(false)
    expect(await isRateLimited('203.0.113.7', ENV)).toBe(true)          // the (max+1)th is refused
    expect(await isRateLimited('203.0.113.7', ENV)).toBe(true)          // and stays refused, without piling up rows
    expect(await isRateLimited('198.51.100.9', ENV)).toBe(false)        // a different connection is unaffected
    vi.setSystemTime(new Date('2026-10-04T10:00:00Z').getTime() + (windowMinutes - 1) * 60_000)
    expect(await isRateLimited('203.0.113.7', ENV)).toBe(true)          // still inside the window
    vi.setSystemTime(new Date('2026-10-04T10:00:00Z').getTime() + (windowMinutes + 1) * 60_000)
    expect(await isRateLimited('203.0.113.7', ENV)).toBe(false)         // block cleared
  })

  it('fails open on a database error (never blocks a real user because the log table is down)', async () => {
    const { isRateLimited } = await import(modulePath)
    failCount = true
    expect(await isRateLimited('203.0.113.7', ENV)).toBe(false)
  })

  it('falls back to the in-memory limiter when Supabase is not configured', async () => {
    const { isRateLimited } = await import(modulePath)
    for (let i = 0; i < max; i += 1) expect(await isRateLimited('192.0.2.55', {})).toBe(false)
    expect(await isRateLimited('192.0.2.55', {})).toBe(true)
  })
})
