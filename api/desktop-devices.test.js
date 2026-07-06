import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chainable Supabase table mock: every method returns the builder, and the
// builder is awaitable, resolving with the next queued result.
const tableResults = []
const queueResult = (result) => tableResults.push(result)
const makeBuilder = () => {
  const builder = {}
  for (const method of ['select', 'eq', 'is', 'update', 'upsert']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.then = (resolve, reject) => {
    const result = tableResults.shift() || { data: null, error: null }
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

const lifetimeUser = { id: 'user-1', app_metadata: { subscription_plan: 'premium_plus_lifetime' } }

const makeReq = (overrides = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer test-token' },
  body: { deviceId: 'device-aaaa-1111', deviceName: 'Test Mac', platform: 'macos' },
  ...overrides,
})

describe('desktop-devices handler', () => {
  let handler, buildEntitlementRecord, signEntitlementRecord

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'
    process.env.ENTITLEMENT_SIGNING_SECRET = 'test-secret'
    delete process.env.DESKTOP_DEVICE_CAP
    getUser.mockReset()
    from.mockClear()
    tableResults.length = 0
    vi.resetModules()
    const mod = await import('./desktop-devices.js')
    handler = mod.default
    buildEntitlementRecord = mod.buildEntitlementRecord
    signEntitlementRecord = mod.signEntitlementRecord
  })

  it('rejects unauthenticated requests', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad token') })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('rejects non-lifetime plans with 403', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u', app_metadata: { subscription_plan: 'premium_monthly' } } }, error: null })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('activates a device and returns a signed entitlement record', async () => {
    getUser.mockResolvedValue({ data: { user: lifetimeUser }, error: null })
    queueResult({ data: [], error: null })        // existing devices
    queueResult({ data: null, error: null })       // upsert
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(200)
    const payload = res.json.mock.calls[0][0]
    expect(payload.record).toMatchObject({
      version: 1,
      userId: 'user-1',
      deviceId: 'device-aaaa-1111',
      plan: 'premium_plus_lifetime',
    })
    expect(payload.signature).toBe(signEntitlementRecord(payload.record, 'test-secret'))
    expect(payload.cap).toBe(3)
  })

  it('re-verifies an already-active device even at the cap', async () => {
    getUser.mockResolvedValue({ data: { user: lifetimeUser }, error: null })
    queueResult({
      data: [
        { device_id: 'device-aaaa-1111', deactivated_at: null },
        { device_id: 'device-bbbb-2222', deactivated_at: null },
        { device_id: 'device-cccc-3333', deactivated_at: null },
      ],
      error: null,
    })
    queueResult({ data: null, error: null }) // upsert
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('refuses a new device beyond the cap with the active device list', async () => {
    getUser.mockResolvedValue({ data: { user: lifetimeUser }, error: null })
    queueResult({
      data: [
        { device_id: 'device-bbbb-2222', device_name: 'Mac 1', platform: 'macos', last_seen_at: 't', deactivated_at: null },
        { device_id: 'device-cccc-3333', device_name: 'Mac 2', platform: 'macos', last_seen_at: 't', deactivated_at: null },
        { device_id: 'device-dddd-4444', device_name: 'PC', platform: 'windows', last_seen_at: 't', deactivated_at: null },
      ],
      error: null,
    })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(409)
    const payload = res.json.mock.calls[0][0]
    expect(payload.devices).toHaveLength(3)
  })

  it('rejects malformed device ids', async () => {
    getUser.mockResolvedValue({ data: { user: lifetimeUser }, error: null })
    const res = makeRes()
    await handler(makeReq({ body: { deviceId: 'bad id!' } }), res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('lists active devices on GET', async () => {
    getUser.mockResolvedValue({ data: { user: lifetimeUser }, error: null })
    queueResult({ data: [{ device_id: 'device-aaaa-1111', device_name: 'Test Mac' }], error: null })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', body: undefined }), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json.mock.calls[0][0].devices).toHaveLength(1)
  })

  it('deactivates a device on DELETE', async () => {
    getUser.mockResolvedValue({ data: { user: lifetimeUser }, error: null })
    queueResult({ data: null, error: null })
    const res = makeRes()
    await handler(makeReq({ method: 'DELETE' }), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ deactivated: 'device-aaaa-1111' })
  })

  it('signs deterministically and returns null without a secret', () => {
    const record = buildEntitlementRecord('u', 'd', 'founder')
    expect(signEntitlementRecord(record, 'secret-a')).toBe(signEntitlementRecord(record, 'secret-a'))
    expect(signEntitlementRecord(record, 'secret-a')).not.toBe(signEntitlementRecord(record, 'secret-b'))
    expect(signEntitlementRecord(record, undefined)).toBeNull()
  })
})
