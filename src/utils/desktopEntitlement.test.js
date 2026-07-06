// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })) } },
}))

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('desktop entitlement', () => {
  it('creates a stable device id and reuses it', async () => {
    const { getOrCreateDesktopDeviceId } = await import('./desktopEntitlement.js')
    const first = getOrCreateDesktopDeviceId()
    expect(first).toMatch(/^[a-zA-Z0-9-]{8,64}$/)
    expect(getOrCreateDesktopDeviceId()).toBe(first)
  })

  it('treats a lifetime account as entitled regardless of cache', async () => {
    const { evaluateDesktopEntitlement } = await import('./desktopEntitlement.js')
    const result = evaluateDesktopEntitlement({ membership: { isDesktopEntitled: true }, cached: null })
    expect(result).toMatchObject({ entitled: true, source: 'account', stale: false })
  })

  it('honours a cached record when the account is unavailable', async () => {
    const { evaluateDesktopEntitlement } = await import('./desktopEntitlement.js')
    const cached = { record: { plan: 'founder' }, verifiedAt: new Date().toISOString() }
    const result = evaluateDesktopEntitlement({ membership: null, cached })
    expect(result).toMatchObject({ entitled: true, source: 'cache', stale: false })
  })

  it('flags staleness past the grace window without revoking entitlement', async () => {
    const { evaluateDesktopEntitlement, DESKTOP_GRACE_DAYS } = await import('./desktopEntitlement.js')
    const verifiedAt = new Date(Date.now() - (DESKTOP_GRACE_DAYS + 5) * 24 * 60 * 60 * 1000)
    const cached = { record: { plan: 'premium_plus_lifetime' }, verifiedAt: verifiedAt.toISOString() }
    const result = evaluateDesktopEntitlement({ membership: null, cached })
    expect(result.entitled).toBe(true)
    expect(result.stale).toBe(true)
    expect(result.daysSinceVerified).toBeGreaterThan(DESKTOP_GRACE_DAYS)
  })

  it('reports not entitled with no account and no cache', async () => {
    const { evaluateDesktopEntitlement } = await import('./desktopEntitlement.js')
    expect(evaluateDesktopEntitlement({ membership: null, cached: null }).entitled).toBe(false)
  })

  it('verifyDesktopEntitlement caches the returned record', async () => {
    const record = { version: 1, userId: 'u', deviceId: 'd', plan: 'founder', issuedAt: 'now' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ record, signature: 'sig' }), { status: 200 })))
    const { verifyDesktopEntitlement, loadCachedDesktopEntitlement } = await import('./desktopEntitlement.js')
    const result = await verifyDesktopEntitlement({ deviceName: 'Test' })
    expect(result.ok).toBe(true)
    const cached = loadCachedDesktopEntitlement()
    expect(cached.record).toEqual(record)
    expect(cached.signature).toBe('sig')
    expect(cached.verifiedAt).toBeTruthy()
  })

  it('treats network failure as offline, not an error, and keeps the old cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down') }))
    const { verifyDesktopEntitlement, loadCachedDesktopEntitlement } = await import('./desktopEntitlement.js')
    localStorage.setItem('nf_desktop_entitlement', JSON.stringify({ record: { plan: 'founder' }, verifiedAt: 'earlier' }))
    const result = await verifyDesktopEntitlement()
    expect(result.ok).toBe(false)
    expect(result.offline).toBe(true)
    expect(loadCachedDesktopEntitlement()?.record?.plan).toBe('founder')
  })
})
