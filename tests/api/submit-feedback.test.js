import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkRateLimit, validateFeedbackBody } from '../../api/submit-feedback.js'

// Supabase mock for the `isRateLimited` durable-limiter tests below. Declared
// at true module top level (not nested in a describe block) because
// vi.mock() factories are hoisted above all other module code — a factory
// referencing a variable declared inside a describe callback would run
// before that callback (and thus the variable) exists.
const tableResults = []
const queueResult = (result) => tableResults.push(result)
const makeBuilder = () => {
  const builder = {}
  for (const method of ['select', 'eq', 'gte', 'lt', 'insert', 'delete']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.then = (resolve, reject) => {
    const result = tableResults.shift() || { data: null, error: null, count: 0 }
    return Promise.resolve(result).then(resolve, reject)
  }
  return builder
}
const from = vi.fn(() => makeBuilder())
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from }),
}))

const validBody = { type: 'support', title: 'Hello', message: 'Something broke.' }

describe('validateFeedbackBody', () => {
  it('accepts a normal submission', () => {
    expect(validateFeedbackBody(validBody)).toBeNull()
    expect(validateFeedbackBody({ ...validBody, email: 'a@b.co', name: 'Mo', category: 'Bug' })).toBeNull()
  })

  it('rejects missing required fields', () => {
    expect(validateFeedbackBody({})).toBe('Missing required fields.')
    expect(validateFeedbackBody({ ...validBody, title: '   ' })).toBe('Missing required fields.')
    expect(validateFeedbackBody(null)).toBe('Missing required fields.')
  })

  it('rejects over-length fields', () => {
    expect(validateFeedbackBody({ ...validBody, title: 'x'.repeat(201) })).toMatch(/"title" is too long/)
    expect(validateFeedbackBody({ ...validBody, message: 'x'.repeat(8001) })).toMatch(/"message" is too long/)
    expect(validateFeedbackBody({ ...validBody, email: 'x'.repeat(255) })).toMatch(/"email" is too long/)
    expect(validateFeedbackBody({ ...validBody, name: 'x'.repeat(121) })).toMatch(/"name" is too long/)
    expect(validateFeedbackBody({ ...validBody, category: 'x'.repeat(101) })).toMatch(/"category" is too long/)
  })

  it('accepts fields exactly at the limit', () => {
    expect(validateFeedbackBody({ ...validBody, title: 'x'.repeat(200), message: 'x'.repeat(8000) })).toBeNull()
  })
})

describe('checkRateLimit', () => {
  it('allows up to 5 submissions per hour per IP, then blocks', () => {
    const buckets = new Map()
    const now = 1_000_000_000
    for (let i = 0; i < 5; i++) expect(checkRateLimit('1.2.3.4', now + i, buckets)).toBe(true)
    expect(checkRateLimit('1.2.3.4', now + 10, buckets)).toBe(false)
    // different IP is unaffected
    expect(checkRateLimit('5.6.7.8', now + 10, buckets)).toBe(true)
  })

  it('frees the window after an hour', () => {
    const buckets = new Map()
    const now = 1_000_000_000
    for (let i = 0; i < 5; i++) checkRateLimit('1.2.3.4', now, buckets)
    expect(checkRateLimit('1.2.3.4', now + 1, buckets)).toBe(false)
    expect(checkRateLimit('1.2.3.4', now + 60 * 60 * 1000 + 1, buckets)).toBe(true)
  })
})

// Regression coverage for audit finding #23 (docs/YOW_CODE_AUDIT_2026-09-01.md,
// "Serverless rate limits are memory-only"): `isRateLimited` must use the
// durable Supabase-backed limiter whenever Supabase is configured, and only
// fall back to the in-memory `checkRateLimit` when it isn't.
describe('isRateLimited', () => {
  let isRateLimited

  beforeEach(async () => {
    from.mockClear()
    tableResults.length = 0
    // Deterministically skip the opportunistic cleanup sweep (~2% chance
    // per call in real usage) so it never eats a queued result meant for
    // the actual rate-limit check.
    vi.spyOn(Math, 'random').mockReturnValue(1)
    vi.resetModules()
    const mod = await import('../../api/submit-feedback.js')
    isRateLimited = mod.isRateLimited
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('falls back to the in-memory limiter when Supabase is not configured', async () => {
    const env = {}
    for (let i = 0; i < 5; i++) expect(await isRateLimited('9.9.9.9', env)).toBe(false)
    expect(await isRateLimited('9.9.9.9', env)).toBe(true)
    expect(from).not.toHaveBeenCalled()
  })

  it('uses the durable table when Supabase is configured, and blocks at the limit', async () => {
    const env = { SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'stub-key' }
    queueResult({ count: 4, error: null }) // count check: under the limit
    queueResult({ error: null }) // insert
    expect(await isRateLimited('1.1.1.1', env)).toBe(false)
    expect(from).toHaveBeenCalledWith('email_action_rate_limits')

    queueResult({ count: 5, error: null }) // count check: at the limit
    expect(await isRateLimited('1.1.1.1', env)).toBe(true)
  })

  it('fails open (allows the request) if the durable count query errors', async () => {
    const env = { SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'stub-key' }
    queueResult({ count: null, error: new Error('table unreachable') })
    expect(await isRateLimited('2.2.2.2', env)).toBe(false)
  })

  it('accepts VITE_SUPABASE_URL as a fallback for the URL env var', async () => {
    const env = { VITE_SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'stub-key' }
    queueResult({ count: 0, error: null })
    queueResult({ error: null })
    expect(await isRateLimited('3.3.3.3', env)).toBe(false)
    expect(from).toHaveBeenCalledWith('email_action_rate_limits')
  })
})
