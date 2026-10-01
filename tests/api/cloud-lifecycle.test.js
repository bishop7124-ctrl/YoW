import { beforeEach, describe, expect, it, vi } from 'vitest'

const listUsers = vi.fn()
const from = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { listUsers } }, from }),
}))

const makeRes = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() })
const makeReq = (overrides = {}) => ({ method: 'GET', headers: {}, ...overrides })
const DAY = 24 * 60 * 60 * 1000
const iso = offsetDays => new Date(Date.now() + offsetDays * DAY).toISOString()

describe('cloud-lifecycle planner', () => {
  let handler
  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'
    process.env.CRON_SECRET = 'real-secret'
    listUsers.mockReset()
    from.mockClear()
    vi.resetModules()
    handler = (await import('../../api/cloud-lifecycle.js')).default
  })

  it('fails closed without CRON_SECRET and rejects bad tokens', async () => {
    delete process.env.CRON_SECRET
    let res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(500)
    process.env.CRON_SECRET = 'real-secret'
    res = makeRes()
    await handler(makeReq({ headers: { authorization: 'Bearer nope' } }), res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('classifies accounts, skips Founder/paid/beta, never writes, and reports a dry run', async () => {
    listUsers.mockResolvedValue({ error: null, data: { users: [
      { id: 'founder', created_at: iso(-4000), app_metadata: { subscription_plan: 'founder' } },
      { id: 'lifetime-warning', created_at: iso(-1000), app_metadata: { subscription_plan: 'premium_plus_lifetime', lifetime_purchased_at: iso(-3 * 365 + 10) } },
      { id: 'lifetime-archived', created_at: iso(-4000), app_metadata: { subscription_plan: 'premium_plus_lifetime', lifetime_purchased_at: iso(-4 * 365) } },
      { id: 'monthly', created_at: iso(-900), last_sign_in_at: iso(-800), app_metadata: { subscription_plan: 'premium_monthly', subscription_status: 'active' } },
      { id: 'beta', created_at: iso(-900), last_sign_in_at: iso(-800), app_metadata: { beta_tester: true } },
      { id: 'free-recent', created_at: iso(-900), last_sign_in_at: iso(-5), app_metadata: {} },
      { id: 'free-deleteable', created_at: iso(-1500), last_sign_in_at: iso(-18 * 31 - 100), app_metadata: {} },
    ] } })
    const res = makeRes()
    await handler(makeReq({ headers: { authorization: 'Bearer real-secret' } }), res)
    expect(res.status).toHaveBeenCalledWith(200)
    const body = res.json.mock.calls[0][0]
    expect(body.dryRun).toBe(true)
    const byId = Object.fromEntries(body.due.map(d => [d.user_id, d]))
    expect(byId['lifetime-warning']).toMatchObject({ phase: 'warning', action: 'notify' })
    expect(byId['lifetime-archived']).toMatchObject({ phase: 'archived', action: 'archive' })
    expect(byId['free-deleteable']).toMatchObject({ phase: 'delete_due', action: 'delete' })
    expect(byId.founder).toBeUndefined()
    expect(byId.monthly).toBeUndefined()
    expect(byId.beta).toBeUndefined()
    expect(byId['free-recent']).toBeUndefined()
    expect(from).not.toHaveBeenCalled()
  })
})
