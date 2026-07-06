import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase so we can control auth.getUser per test
const getUser = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser } }),
}))

const makeRes = () => ({
  setHeader: vi.fn(),
  status: vi.fn().mockReturnThis(),
  json: vi.fn(),
  end: vi.fn(),
})

const makeReq = (overrides = {}) => ({
  method: 'GET',
  headers: { authorization: 'Bearer test-token' },
  ...overrides,
})

describe('get-download-links handler', () => {
  let handler

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'
    process.env.DESKTOP_DOWNLOAD_URL_MACOS = 'https://downloads.test/yow.dmg'
    process.env.DESKTOP_DOWNLOAD_URL_WINDOWS = 'https://downloads.test/yow-setup.exe'
    process.env.DESKTOP_APP_VERSION = '0.1.0'
    getUser.mockReset()
    vi.resetModules()
    const mod = await import('./get-download-links.js')
    handler = mod.default
  })

  it('rejects non-GET requests with 405', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST' }), res)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('returns 401 when the token is invalid', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad token') })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('returns 403 for users without a lifetime plan', async () => {
    getUser.mockResolvedValue({
      data: { user: { app_metadata: { subscription_plan: 'premium_monthly', subscription_status: 'active' } } },
      error: null,
    })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 403 for free users with no plan', async () => {
    getUser.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it.each(['premium_lifetime', 'premium_plus_lifetime', 'founder'])(
    'returns download links for %s members',
    async (plan) => {
      getUser.mockResolvedValue({ data: { user: { app_metadata: { subscription_plan: plan } } }, error: null })
      const res = makeRes()
      await handler(makeReq(), res)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        version: '0.1.0',
        platforms: [
          { key: 'macos', label: 'macOS', url: 'https://downloads.test/yow.dmg' },
          { key: 'windows', label: 'Windows', url: 'https://downloads.test/yow-setup.exe' },
        ],
      })
    }
  )

  it('omits platforms whose download URL is not configured', async () => {
    delete process.env.DESKTOP_DOWNLOAD_URL_WINDOWS
    vi.resetModules()
    handler = (await import('./get-download-links.js')).default
    getUser.mockResolvedValue({ data: { user: { app_metadata: { subscription_plan: 'founder' } } }, error: null })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(200)
    const payload = res.json.mock.calls[0][0]
    expect(payload.platforms).toEqual([
      { key: 'macos', label: 'macOS', url: 'https://downloads.test/yow.dmg' },
    ])
  })
})
