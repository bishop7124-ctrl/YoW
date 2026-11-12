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

  describe('claiming and sending (audit AUD-24)', () => {
    const DAY = 24 * 60 * 60 * 1000
    const user = { id: 'u1', email: 'a@example.test', created_at: new Date(Date.now() - 1.5 * DAY).toISOString(), last_sign_in_at: null, user_metadata: {} }
    const calls = []
    let insertResult, sentRows, readError, fetchImpl

    const tableApi = table => ({
      select: () => ({ in: async () => (table === 'reengagement_emails' ? { data: sentRows, error: readError } : { data: [], error: null }) }),
      insert: async row => { calls.push(['insert', table, row]); return insertResult },
      delete: () => ({ eq: () => ({ eq: async () => { calls.push(['delete', table]); return { error: null } } }) }),
    })

    beforeEach(() => {
      calls.length = 0
      insertResult = { error: null }
      sentRows = []
      readError = null
      process.env.CRON_SECRET = 'real-secret'
      listUsers.mockResolvedValue({ data: { users: [user] }, error: null })
      from.mockImplementation(tableApi)
      fetchImpl = vi.fn(async () => ({ ok: true, text: async () => '' }))
      vi.stubGlobal('fetch', fetchImpl)
    })
    const run = async () => {
      const res = makeRes()
      await handler(makeReq({ headers: { authorization: 'Bearer real-secret' } }), res)
      return res
    }

    it('claims the reminder first, then sends it once', async () => {
      const res = await run()
      expect(calls[0]).toEqual(['insert', 'reengagement_emails', { user_id: 'u1', stage: 'day1' }])
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sent: 1 }))
    })

    it('sends nothing when another run already claimed it (unique key conflict)', async () => {
      insertResult = { error: { code: '23505' } }
      const res = await run()
      expect(fetchImpl).not.toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sent: 0 }))
    })

    it('sends nothing when the claim cannot be recorded for another reason', async () => {
      insertResult = { error: { code: '57014', message: 'timeout' } }
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await run()
      expect(fetchImpl).not.toHaveBeenCalled()
      spy.mockRestore()
    })

    it('stops without sending when the send log cannot be read', async () => {
      readError = { message: 'database unavailable' }
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const res = await run()
      expect(res.status).toHaveBeenCalledWith(500)
      expect(fetchImpl).not.toHaveBeenCalled()
      spy.mockRestore()
    })

    it('releases the claim when delivery fails or the network drops, so the next run can retry', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      fetchImpl.mockResolvedValueOnce({ ok: false, text: async () => 'provider down' })
      await run()
      expect(calls.filter(call => call[0] === 'delete')).toHaveLength(1)
      calls.length = 0
      fetchImpl.mockRejectedValueOnce(new Error('network down'))
      const res = await run()
      expect(calls.filter(call => call[0] === 'delete')).toHaveLength(1)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sent: 0 }))
      spy.mockRestore()
    })
  })
})

