import { describe, expect, it } from 'vitest'
import { emailCorsHeaders, emailPreflightResponse, jsonResponse } from '../../supabase/functions/_shared/cors.ts'

describe('email Edge Function CORS', () => {
  it('allows the production site and varies caches by Origin', () => {
    const req = new Request('https://project.supabase.co/functions/v1/send-reset-email', {
      headers: { Origin: 'https://www.yourownworld.co.uk' },
    })

    expect(emailCorsHeaders(req)).toMatchObject({
      'Access-Control-Allow-Origin': 'https://www.yourownworld.co.uk',
      Vary: 'Origin',
    })
  })

  it('does not grant an attacker origin access to preflight or JSON responses', async () => {
    const req = new Request('https://project.supabase.co/functions/v1/send-reset-email', {
      method: 'OPTIONS',
      headers: { Origin: 'https://attacker.invalid' },
    })

    const preflight = emailPreflightResponse(req)
    const json = jsonResponse({ error: 'Unauthorized' }, 401, emailCorsHeaders(req))

    expect(preflight.status).toBe(200)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(json.status).toBe(401)
    expect(json.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(await json.json()).toEqual({ error: 'Unauthorized' })
  })

  it.each([
    'http://localhost:3000',
    'http://localhost:5173',
    'tauri://localhost',
    'https://tauri.localhost',
  ])('keeps the supported app origin %s working', origin => {
    const req = new Request('https://project.supabase.co/functions/v1/send-welcome-email', {
      headers: { Origin: origin },
    })

    expect(emailCorsHeaders(req)['Access-Control-Allow-Origin']).toBe(origin)
  })
})
