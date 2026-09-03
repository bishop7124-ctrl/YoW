import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMissingEnv, getSupabaseAdminConfig, validatePaidInterestBody } from '../../api/register-paid-interest.js'

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
  createClient: () => ({ from, auth: { getUser: vi.fn(), admin: { updateUserById: vi.fn() } } }),
}))

describe('validatePaidInterestBody', () => {
  it('accepts a normal interest submission', () => {
    expect(validatePaidInterestBody({
      email: 'writer@example.com',
      name: 'Writer',
      projectType: 'Novel',
      message: 'Tell me when Lifetime is ready.',
      plan: 'premium_plus_lifetime',
      planLabel: 'Lifetime',
      page: '/pricing',
    })).toBeNull()
  })

  it('rejects missing or invalid email addresses', () => {
    expect(validatePaidInterestBody({})).toBe('Email is required.')
    expect(validatePaidInterestBody({ email: 'not-an-email' })).toBe('Enter a valid email address.')
  })
})

describe('getSupabaseAdminConfig', () => {
  it('falls back to VITE_SUPABASE_URL for Vercel projects that only expose the client URL name', () => {
    expect(getSupabaseAdminConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    })).toEqual({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'service-role',
    })
  })

  it('prefers SUPABASE_URL when both names are available', () => {
    expect(getSupabaseAdminConfig({
      SUPABASE_URL: 'https://server.supabase.co',
      VITE_SUPABASE_URL: 'https://client.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    }).url).toBe('https://server.supabase.co')
  })
})

describe('getMissingEnv', () => {
  it('reports only unset environment keys', () => {
    expect(getMissingEnv(['FEEDBACK_EMAIL', 'FEEDBACK_EMAIL_PASSWORD'], {
      FEEDBACK_EMAIL: 'owner@example.com',
    })).toEqual(['FEEDBACK_EMAIL_PASSWORD'])
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
    const mod = await import('../../api/register-paid-interest.js')
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
    queueResult({ count: 4, error: null })
    queueResult({ error: null })
    expect(await isRateLimited('1.1.1.1', env)).toBe(false)
    expect(from).toHaveBeenCalledWith('email_action_rate_limits')

    queueResult({ count: 5, error: null })
    expect(await isRateLimited('1.1.1.1', env)).toBe(true)
  })

  it('fails open (allows the request) if the durable count query errors', async () => {
    const env = { SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'stub-key' }
    queueResult({ count: null, error: new Error('table unreachable') })
    expect(await isRateLimited('2.2.2.2', env)).toBe(false)
  })

  it('accepts VITE_SUPABASE_URL, matching getSupabaseAdminConfig', async () => {
    const env = { VITE_SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'stub-key' }
    queueResult({ count: 0, error: null })
    queueResult({ error: null })
    expect(await isRateLimited('3.3.3.3', env)).toBe(false)
    expect(from).toHaveBeenCalledWith('email_action_rate_limits')
  })
})
