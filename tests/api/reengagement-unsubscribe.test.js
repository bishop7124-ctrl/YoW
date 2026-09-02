import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserById = vi.fn()
const updateUserById = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { getUserById, updateUserById } } }),
}))

const makeRes = () => ({
  setHeader: vi.fn(),
  status: vi.fn().mockReturnThis(),
  json: vi.fn(),
  send: vi.fn(),
})

const makeReq = (query = {}) => ({ method: 'GET', query })

const SECRET = 'test-unsubscribe-secret'
const USER_ID = '11111111-2222-3333-4444-555555555555'

describe('reengagement-unsubscribe handler', () => {
  let handler, signUnsubscribeLink

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'
    process.env.REENGAGEMENT_UNSUBSCRIBE_SECRET = SECRET
    getUserById.mockReset()
    updateUserById.mockReset()
    vi.resetModules()
    const mod = await import('../../api/reengagement-unsubscribe.js')
    handler = mod.default
    signUnsubscribeLink = mod.signUnsubscribeLink
  })

  it('fails closed when the signing secret is not configured', async () => {
    delete process.env.REENGAGEMENT_UNSUBSCRIBE_SECRET
    vi.resetModules()
    const mod = await import('../../api/reengagement-unsubscribe.js')
    const res = makeRes()
    await mod.default(makeReq({ u: USER_ID, sig: 'anything' }), res)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(getUserById).not.toHaveBeenCalled()
  })

  it('rejects a malformed user id', async () => {
    const res = makeRes()
    await handler(makeReq({ u: 'not-a-uuid', sig: 'x' }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(getUserById).not.toHaveBeenCalled()
  })

  it('rejects a missing signature', async () => {
    const res = makeRes()
    await handler(makeReq({ u: USER_ID }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(getUserById).not.toHaveBeenCalled()
  })

  it('rejects a bare/unsigned user id — the exact P0-03 link-scanner scenario', async () => {
    const res = makeRes()
    await handler(makeReq({ u: USER_ID, sig: '' }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(getUserById).not.toHaveBeenCalled()
  })

  it('rejects a forged/incorrect signature', async () => {
    const res = makeRes()
    await handler(makeReq({ u: USER_ID, sig: 'deadbeef'.repeat(8) }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(getUserById).not.toHaveBeenCalled()
  })

  it('rejects a signature computed for a different user id', async () => {
    const res = makeRes()
    const wrongUserSig = signUnsubscribeLink('99999999-2222-3333-4444-555555555555', SECRET)
    await handler(makeReq({ u: USER_ID, sig: wrongUserSig }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(getUserById).not.toHaveBeenCalled()
  })

  it('accepts a correctly signed link and opts the user out', async () => {
    getUserById.mockResolvedValue({ data: { user: { id: USER_ID, user_metadata: {} } }, error: null })
    updateUserById.mockResolvedValue({ data: {}, error: null })
    const res = makeRes()
    const sig = signUnsubscribeLink(USER_ID, SECRET)
    await handler(makeReq({ u: USER_ID, sig }), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(updateUserById).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ user_metadata: expect.objectContaining({ reengagement_opt_out: true }) })
    )
  })

  it('signature verification is genuinely tied to this exact secret', () => {
    const sig = signUnsubscribeLink(USER_ID, SECRET)
    expect(signUnsubscribeLink(USER_ID, 'a-different-secret')).not.toBe(sig)
  })
})
