import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const getUser = vi.fn()
const from = vi.fn(() => makeBuilder())
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser }, from }),
}))

const makeRes = () => ({
  setHeader: vi.fn(),
  status: vi.fn().mockReturnThis(),
  json: vi.fn(),
  end: vi.fn(),
})

const makeReq = (overrides = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer test-token', origin: 'http://localhost:5173' },
  body: { provider: 'openrouter', action: 'models' },
  ...overrides,
})

// created_at far enough in the past that the 28-day trial window has
// elapsed — a fixture with no created_at at all reads as "just signed up",
// i.e. an active trial, not a Free-plan user.
const freeUser = { id: 'user-free', created_at: '2020-01-01T00:00:00Z', app_metadata: {}, user_metadata: {} }
const paidUser = { id: 'user-paid', app_metadata: { subscription_status: 'active', subscription_plan: 'premium_monthly' }, user_metadata: {} }

describe('ai-proxy handler', () => {
  let handler

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'
    delete process.env.AI_PROXY_RATE_LIMIT_MAX
    delete process.env.AI_PROXY_RATE_LIMIT_WINDOW_MINUTES
    getUser.mockReset()
    from.mockClear()
    tableResults.length = 0
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })))
    const mod = await import('../../api/ai-proxy.js')
    handler = mod.default
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects requests with no session token', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad token') })
    const res = makeRes()
    await handler(makeReq({ headers: { origin: 'http://localhost:5173' } }), res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('rejects an invalid/expired token', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad token') })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('rejects a Free-plan user before calling any provider', async () => {
    getUser.mockResolvedValue({ data: { user: freeUser }, error: null })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a Free user even if user_metadata is tampered to claim a paid plan', async () => {
    // Regression test for a security-review finding: user_metadata is
    // writable by the signed-in user themselves via the Supabase client SDK
    // (audit finding P0-01), unlike app_metadata which only the service
    // role can write. The entitlement check must ignore user_metadata
    // entirely, not just prefer app_metadata.
    const tamperedFreeUser = {
      ...freeUser,
      user_metadata: { subscription_status: 'active', subscription_plan: 'premium_monthly' },
    }
    getUser.mockResolvedValue({ data: { user: tamperedFreeUser }, error: null })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('allows a paid user under the rate limit through to the provider', async () => {
    getUser.mockResolvedValue({ data: { user: paidUser }, error: null })
    queueResult({ data: { id: 'r1' }, error: null }) // rate-limit insert
    queueResult({ data: null, error: null, count: 1 }) // rate-limit count (includes this request)
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).not.toHaveBeenCalledWith(401)
    expect(res.status).not.toHaveBeenCalledWith(403)
    expect(res.status).not.toHaveBeenCalledWith(429)
    expect(fetch).toHaveBeenCalled()
  })

  it('rejects once the durable rate limit is exceeded', async () => {
    getUser.mockResolvedValue({ data: { user: paidUser }, error: null })
    queueResult({ data: { id: 'r1' }, error: null }) // rate-limit insert
    queueResult({ data: null, error: null, count: 31 }) // over the default cap of 30 (includes this request)
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(429)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails open (does not block) when the rate-limit table itself errors', async () => {
    getUser.mockResolvedValue({ data: { user: paidUser }, error: null })
    queueResult({ data: null, error: { code: '42P01', message: 'relation missing' } }) // insert fails
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).not.toHaveBeenCalledWith(429)
    expect(fetch).toHaveBeenCalled()
  })

  it('only reflects an allowlisted Origin in CORS headers', async () => {
    getUser.mockResolvedValue({ data: { user: freeUser }, error: null })
    const res = makeRes()
    await handler(makeReq({ headers: { authorization: 'Bearer x', origin: 'https://evil.example.com' } }), res)
    expect(res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://evil.example.com')
  })

  it('sets CORS headers for an allowlisted local dev origin', async () => {
    getUser.mockResolvedValue({ data: { user: freeUser }, error: null })
    const res = makeRes()
    await handler(makeReq({ headers: { authorization: 'Bearer x', origin: 'http://localhost:5173' } }), res)
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:5173')
  })
})

describe('ai-proxy admission and cancellation (audit YOW-17)', () => {
  let handler

  const statefulFrom = (rows) => vi.fn(() => {
    let op = null
    const builder = {
      insert: vi.fn((row) => { op = { type: 'insert', row }; return builder }),
      select: vi.fn(() => builder),
      delete: vi.fn(() => { op = { type: 'delete' }; return builder }),
      eq: vi.fn((col, val) => { if (op?.type === 'delete') op.id = val; return builder }),
      gte: vi.fn(() => builder),
      lt: vi.fn(() => builder),
      then: (resolve, reject) => {
        let result
        if (op?.type === 'insert') {
          const id = `row-${rows.length + 1}`
          rows.push({ id, ...op.row })
          result = { data: { id }, error: null }
        } else if (op?.type === 'delete') {
          const index = rows.findIndex(row => row.id === op.id)
          if (index >= 0) rows.splice(index, 1)
          result = { data: null, error: null }
        } else {
          result = { data: null, error: null, count: rows.length }
        }
        return Promise.resolve(result).then(resolve, reject)
      },
    }
    return builder
  })

  const streamReq = (overrides = {}) => makeReq({ body: { provider: 'anthropic', action: 'stream', apiKey: 'k', model: 'm', messages: [{ role: 'user', content: 'hi' }] }, ...overrides })

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'
    delete process.env.AI_PROXY_RATE_LIMIT_WINDOW_MINUTES
    process.env.AI_PROXY_RATE_LIMIT_MAX = '3'
    getUser.mockReset().mockResolvedValue({ data: { user: paidUser }, error: null })
    from.mockReset()
    tableResults.length = 0
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })))
    handler = (await import('../../api/ai-proxy.js')).default
  })

  afterEach(() => {
    delete process.env.AI_PROXY_RATE_LIMIT_MAX
    delete process.env.AI_PROXY_UPSTREAM_TIMEOUT_MS
    vi.unstubAllGlobals()
  })

  it('never lets a burst of simultaneous requests through past the limit', async () => {
    const rows = []
    from.mockImplementation(statefulFrom(rows))
    const responses = await Promise.all(Array.from({ length: 10 }, async () => {
      const res = makeRes()
      await handler(makeReq(), res)
      return res
    }))
    const allowed = responses.filter(res => !res.status.mock.calls.some(([code]) => code === 429)).length
    expect(allowed).toBeLessThanOrEqual(3)
    expect(responses.some(res => res.status.mock.calls.some(([code]) => code === 429))).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(allowed)
  })

  it('still admits requests up to the limit when they arrive one at a time', async () => {
    const rows = []
    from.mockImplementation(statefulFrom(rows))
    const codes = []
    for (let i = 0; i < 5; i += 1) {
      const res = makeRes()
      await handler(makeReq(), res)
      codes.push(res.status.mock.calls.some(([code]) => code === 429) ? 429 : 200)
    }
    expect(codes).toEqual([200, 200, 200, 429, 429])
  })

  it('gives up on a provider that never answers and tells the writer it timed out', async () => {
    process.env.AI_PROXY_UPSTREAM_TIMEOUT_MS = '50'
    vi.resetModules()
    handler = (await import('../../api/ai-proxy.js')).default
    from.mockImplementation(statefulFrom([]))
    let seenSignal
    vi.stubGlobal('fetch', vi.fn((url, init) => new Promise((resolve, reject) => {
      seenSignal = init?.signal
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })))
    const res = makeRes()
    await handler(streamReq(), res)
    expect(seenSignal).toBeDefined()
    expect(res.status).toHaveBeenCalledWith(504)
  })

  it('stops the upstream call when the writer closes the connection', async () => {
    from.mockImplementation(statefulFrom([]))
    let seenSignal
    let closeHandler
    vi.stubGlobal('fetch', vi.fn((url, init) => new Promise((resolve, reject) => {
      seenSignal = init?.signal
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })))
    const res = makeRes()
    res.on = vi.fn((event, handlerFn) => { if (event === 'close') closeHandler = handlerFn })
    res.writableFinished = false
    const pending = handler(streamReq(), res)
    await vi.waitFor(() => expect(seenSignal).toBeDefined())
    closeHandler()
    await pending
    expect(seenSignal.aborted).toBe(true)
  })

  it('limits how many streams one account can hold open at once', async () => {
    process.env.AI_PROXY_RATE_LIMIT_MAX = '100'
    vi.resetModules()
    handler = (await import('../../api/ai-proxy.js')).default
    from.mockImplementation(statefulFrom([]))
    const releases = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { releases.push(() => resolve(new Response('', { status: 200 }))) })))
    const responses = Array.from({ length: 6 }, () => makeRes())
    const running = responses.map(res => handler(streamReq(), res))
    await vi.waitFor(() => expect(responses.filter(res => res.status.mock.calls.some(([code]) => code === 429)).length).toBe(2))
    expect(fetch).toHaveBeenCalledTimes(4)
    releases.forEach(release => release())
    await Promise.allSettled(running)
  })
})

describe('hasAiEntitlement', () => {
  it('grants access from app_metadata (service-role-only, e.g. the Stripe webhook)', async () => {
    const { hasAiEntitlement } = await import('../../api/ai-proxy.js')
    expect(hasAiEntitlement(paidUser)).toBe(true)
  })

  it('denies a genuinely free, post-trial user', async () => {
    const { hasAiEntitlement } = await import('../../api/ai-proxy.js')
    expect(hasAiEntitlement(freeUser)).toBe(false)
  })

  it('ignores a client-editable user_metadata claim entirely', async () => {
    const { hasAiEntitlement } = await import('../../api/ai-proxy.js')
    const tampered = {
      ...freeUser,
      user_metadata: { subscription_status: 'active', subscription_plan: 'premium_monthly' },
    }
    expect(hasAiEntitlement(tampered)).toBe(false)
  })

  it('still grants a genuinely new user their trial window (from created_at, not user-editable)', async () => {
    const { hasAiEntitlement } = await import('../../api/ai-proxy.js')
    const freshUser = { id: 'user-fresh', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} }
    expect(hasAiEntitlement(freshUser)).toBe(true)
  })
})

describe('clampMaxTokens', () => {
  it('clamps requests above the ceiling', async () => {
    const { clampMaxTokens } = await import('../../api/ai-proxy.js')
    expect(clampMaxTokens(100000)).toBe(8192)
  })

  it('falls back to a sane default for missing/invalid values', async () => {
    const { clampMaxTokens } = await import('../../api/ai-proxy.js')
    expect(clampMaxTokens(undefined)).toBe(4096)
    expect(clampMaxTokens(-5)).toBe(4096)
    expect(clampMaxTokens('not a number')).toBe(4096)
  })

  it('passes through a reasonable in-range value unchanged', async () => {
    const { clampMaxTokens } = await import('../../api/ai-proxy.js')
    expect(clampMaxTokens(2048)).toBe(2048)
  })
})

describe('allowedOrigins', () => {
  it('includes local dev origins and SITE_URL', async () => {
    process.env.SITE_URL = 'https://www.yourownworld.co.uk'
    const { allowedOrigins } = await import('../../api/ai-proxy.js')
    const origins = allowedOrigins()
    expect(origins.has('http://localhost:5173')).toBe(true)
    expect(origins.has('http://localhost:3000')).toBe(true)
    expect(origins.has('tauri://localhost')).toBe(true)
    expect(origins.has('https://www.yourownworld.co.uk')).toBe(true)
    expect(origins.has('https://evil.example.com')).toBe(false)
  })

  it('allows the current Vercel deployment origin (covers preview deployments)', async () => {
    process.env.VERCEL_URL = 'yow-git-my-branch-example.vercel.app'
    const { allowedOrigins } = await import('../../api/ai-proxy.js')
    expect(allowedOrigins().has('https://yow-git-my-branch-example.vercel.app')).toBe(true)
  })
})
