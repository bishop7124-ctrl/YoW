import { beforeEach, describe, expect, it, vi } from 'vitest'

const listUsers = vi.fn()
const from = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { listUsers } }, from }),
}))

const makeRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn(),
})

const makeReq = (overrides = {}) => ({
  method: 'GET',
  headers: {},
  ...overrides,
})

describe('send-reengagement-emails handler', () => {
  let handler

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'
    listUsers.mockReset()
    listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    from.mockClear()
    vi.resetModules()
    const mod = await import('../../api/send-reengagement-emails.js')
    handler = mod.default
  })

  it('fails closed (500) when CRON_SECRET is not configured, instead of allowing the request through', async () => {
    // Regression test for audit finding P0-03: the old check
    // (`cronSecret && ...`) silently skipped auth entirely when the secret
    // itself was unset, making this bulk-send route public.
    delete process.env.CRON_SECRET
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('rejects a request with the wrong bearer token once CRON_SECRET is configured', async () => {
    process.env.CRON_SECRET = 'real-secret'
    const res = makeRes()
    await handler(makeReq({ headers: { authorization: 'Bearer wrong' } }), res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('rejects a request with no Authorization header at all once CRON_SECRET is configured', async () => {
    process.env.CRON_SECRET = 'real-secret'
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('proceeds past auth with the correct bearer token', async () => {
    process.env.CRON_SECRET = 'real-secret'
    const res = makeRes()
    await handler(makeReq({ headers: { authorization: 'Bearer real-secret' } }), res)
    expect(listUsers).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })
})
