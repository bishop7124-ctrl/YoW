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

const makeReq = (query = {}, method = 'GET') => ({ method, query })

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

  it('a correctly signed GET (what a mail scanner does) only shows the confirmation page and changes nothing (AUD-25)', async () => {
    const res = makeRes()
    const sig = signUnsubscribeLink(USER_ID, SECRET)
    await handler(makeReq({ u: USER_ID, sig }), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(getUserById).not.toHaveBeenCalled()
    expect(updateUserById).not.toHaveBeenCalled()
    const page = res.send.mock.calls[0][0]
    expect(page).toContain('<form method="POST"')
    expect(page).toContain(`u=${USER_ID}`)
    expect(page).toContain(`sig=${sig}`)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  it('a signed POST opts the user out, and only then says Done', async () => {
    getUserById.mockResolvedValue({ data: { user: { id: USER_ID, user_metadata: { keep: 1 } } }, error: null })
    updateUserById.mockResolvedValue({ data: {}, error: null })
    const res = makeRes()
    const sig = signUnsubscribeLink(USER_ID, SECRET)
    await handler(makeReq({ u: USER_ID, sig }, 'POST'), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(updateUserById).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ user_metadata: expect.objectContaining({ keep: 1, reengagement_opt_out: true }) })
    )
    expect(res.send.mock.calls[0][0]).toContain('Done.')
  })

  it('does NOT say Done when the update comes back with an error (AUD-25)', async () => {
    getUserById.mockResolvedValue({ data: { user: { id: USER_ID, user_metadata: {} } }, error: null })
    updateUserById.mockResolvedValue({ data: null, error: { message: 'database unavailable' } })
    const res = makeRes()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await handler(makeReq({ u: USER_ID, sig: signUnsubscribeLink(USER_ID, SECRET) }, 'POST'), res)
    expect(res.status).toHaveBeenCalledWith(500)
    const page = res.send.mock.calls[0][0]
    expect(page).not.toContain('Done.')
    expect(page).toContain('you have not been unsubscribed')
    spy.mockRestore()
  })

  it('a POST with a bad signature changes nothing, and other methods are refused', async () => {
    const res = makeRes()
    await handler(makeReq({ u: USER_ID, sig: 'deadbeef'.repeat(8) }, 'POST'), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(updateUserById).not.toHaveBeenCalled()
    const put = makeRes()
    await handler(makeReq({ u: USER_ID }, 'PUT'), put)
    expect(put.status).toHaveBeenCalledWith(405)
  })

  it('signature verification is genuinely tied to this exact secret', () => {
    const sig = signUnsubscribeLink(USER_ID, SECRET)
    expect(signUnsubscribeLink(USER_ID, 'a-different-secret')).not.toBe(sig)
  })
})
