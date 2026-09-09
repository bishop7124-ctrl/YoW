import { describe, expect, it, vi } from 'vitest'
import { checkDurableRateLimit, maybeCleanupRateLimitLog } from './durableRateLimit'

const makeSupabase = (results) => {
  const queue = [...results]
  const from = vi.fn(() => {
    const builder = {}
    for (const method of ['select', 'eq', 'gte', 'lt', 'insert', 'delete']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.then = (resolve, reject) => Promise.resolve(queue.shift() || { data: null, error: null, count: 0 }).then(resolve, reject)
    return builder
  })
  return { from }
}

describe('checkDurableRateLimit', () => {
  it('allows and records a request under the limit', async () => {
    const supabase = makeSupabase([{ count: 2, error: null }, { error: null }])
    const allowed = await checkDurableRateLimit(supabase, { bucket: 'test-bucket', rateKey: 'k1', max: 5, windowMinutes: 60 })
    expect(allowed).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('email_action_rate_limits')
  })

  it('blocks once the count reaches the limit, without inserting another row', async () => {
    const supabase = makeSupabase([{ count: 5, error: null }])
    const allowed = await checkDurableRateLimit(supabase, { bucket: 'test-bucket', rateKey: 'k1', max: 5, windowMinutes: 60 })
    expect(allowed).toBe(false)
    // Only one query (the count check) should have run — no insert follows a block.
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('fails open when the count query errors', async () => {
    const supabase = makeSupabase([{ count: null, error: new Error('down') }])
    const allowed = await checkDurableRateLimit(supabase, { bucket: 'test-bucket', rateKey: 'k1', max: 5, windowMinutes: 60 })
    expect(allowed).toBe(true)
  })

  it('still allows the request even if the insert itself fails', async () => {
    const supabase = makeSupabase([{ count: 0, error: null }, { error: new Error('insert failed') }])
    const allowed = await checkDurableRateLimit(supabase, { bucket: 'test-bucket', rateKey: 'k1', max: 5, windowMinutes: 60 })
    expect(allowed).toBe(true)
  })

  it('scopes the count by bucket and rate key', async () => {
    const supabase = makeSupabase([{ count: 0, error: null }, { error: null }])
    await checkDurableRateLimit(supabase, { bucket: 'submit-feedback', rateKey: '1.2.3.4', max: 5, windowMinutes: 60 })
    const builder = supabase.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('bucket', 'submit-feedback')
    expect(builder.eq).toHaveBeenCalledWith('rate_key', '1.2.3.4')
  })
})

describe('maybeCleanupRateLimitLog', () => {
  it('skips the cleanup sweep most of the time', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const supabase = makeSupabase([])
    await maybeCleanupRateLimitLog(supabase)
    expect(supabase.from).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('runs the cleanup sweep when the random draw lands inside the chance window', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const supabase = makeSupabase([{ error: null }])
    await maybeCleanupRateLimitLog(supabase)
    expect(supabase.from).toHaveBeenCalledWith('email_action_rate_limits')
    vi.restoreAllMocks()
  })

  it('never throws even if the delete itself errors', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const supabase = makeSupabase([{ error: new Error('delete failed') }])
    await expect(maybeCleanupRateLimitLog(supabase)).resolves.toBeUndefined()
    vi.restoreAllMocks()
  })
})
