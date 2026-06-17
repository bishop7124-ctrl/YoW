import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCurrentPeriodEnd } from './stripe-webhook.js'

// ─── getCurrentPeriodEnd ─────────────────────────────────────────────────────

describe('getCurrentPeriodEnd', () => {
  it('returns the max period_end across all items', () => {
    const sub = {
      items: { data: [
        { current_period_end: 1000 },
        { current_period_end: 3000 },
        { current_period_end: 2000 },
      ]},
    }
    expect(getCurrentPeriodEnd(sub)).toBe(3000)
  })

  it('ignores non-numeric item period_ends', () => {
    const sub = {
      items: { data: [
        { current_period_end: null },
        { current_period_end: 5000 },
        { current_period_end: undefined },
      ]},
    }
    expect(getCurrentPeriodEnd(sub)).toBe(5000)
  })

  it('falls back to cancel_at when no numeric item period_ends', () => {
    const sub = {
      items: { data: [] },
      cancel_at: 9999,
      trial_end: 1111,
    }
    expect(getCurrentPeriodEnd(sub)).toBe(9999)
  })

  it('falls back to trial_end when cancel_at is falsy', () => {
    const sub = {
      items: { data: [] },
      cancel_at: null,
      trial_end: 7777,
      ended_at: 1234,
    }
    expect(getCurrentPeriodEnd(sub)).toBe(7777)
  })

  it('falls back to ended_at as last resort', () => {
    const sub = {
      items: { data: [] },
      cancel_at: null,
      trial_end: null,
      ended_at: 4321,
    }
    expect(getCurrentPeriodEnd(sub)).toBe(4321)
  })

  it('returns undefined when all fallbacks are null', () => {
    const sub = {
      items: { data: [] },
      cancel_at: null,
      trial_end: null,
      ended_at: null,
    }
    expect(getCurrentPeriodEnd(sub)).toBeNull()
  })
})

// ─── handler routing ─────────────────────────────────────────────────────────
// These tests verify that the handler rejects bad requests early,
// without needing real Stripe or Supabase credentials.

describe('handler — early rejection', () => {
  let handler

  beforeEach(async () => {
    // Stub env vars so the module loads without crashing
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'

    // Re-import fresh each test (vi.resetModules clears the module registry)
    vi.resetModules()
    const mod = await import('./stripe-webhook.js')
    handler = mod.default
  })

  it('rejects non-POST requests with 405', async () => {
    const req = { method: 'GET', headers: {} }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('rejects POST with missing stripe-signature with 400', async () => {
    const req = { method: 'POST', headers: {} }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('STRIPE_WEBHOOK_SECRET') })
    )
  })
})
