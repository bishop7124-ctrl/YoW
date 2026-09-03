import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const apiDir = join(__dirname, '../../api')

function makeRes() {
  const headers = {}
  return {
    headers,
    setHeader(key, value) { headers[key] = value },
  }
}

describe('applyCors', () => {
  const originalSiteUrl = process.env.SITE_URL
  const originalVercelUrl = process.env.VERCEL_URL

  beforeEach(() => {
    delete process.env.SITE_URL
    delete process.env.VERCEL_URL
  })

  afterEach(() => {
    if (originalSiteUrl === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = originalSiteUrl
    if (originalVercelUrl === undefined) delete process.env.VERCEL_URL
    else process.env.VERCEL_URL = originalVercelUrl
  })

  it('echoes back an explicitly allowed origin and sets Vary', async () => {
    const { applyCors } = await import('../../api/_lib/cors.js')
    const req = { headers: { origin: 'http://localhost:5173' } }
    const res = makeRes()
    applyCors(req, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(res.headers['Vary']).toBe('Origin')
  })

  it('never reflects an arbitrary/unrecognized origin (the audit finding this closes)', async () => {
    const { applyCors } = await import('../../api/_lib/cors.js')
    const req = { headers: { origin: 'https://evil.example.com' } }
    const res = makeRes()
    applyCors(req, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(res.headers['Vary']).toBeUndefined()
  })

  it('sets no Allow-Origin header when the request has none (non-browser callers)', async () => {
    const { applyCors } = await import('../../api/_lib/cors.js')
    const req = { headers: {} }
    const res = makeRes()
    applyCors(req, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('allows the configured SITE_URL', async () => {
    process.env.SITE_URL = 'https://www.yourownworld.co.uk'
    const { applyCors } = await import('../../api/_lib/cors.js')
    const req = { headers: { origin: 'https://www.yourownworld.co.uk' } }
    const res = makeRes()
    applyCors(req, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://www.yourownworld.co.uk')
  })

  it('defaults to GET, OPTIONS / authorization, content-type and accepts overrides', async () => {
    const { applyCors } = await import('../../api/_lib/cors.js')
    const req = { headers: {} }
    const res = makeRes()
    applyCors(req, res)
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS')
    expect(res.headers['Access-Control-Allow-Headers']).toBe('authorization, content-type')

    const res2 = makeRes()
    applyCors(req, res2, { methods: 'POST, OPTIONS', headers: 'content-type' })
    expect(res2.headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS')
    expect(res2.headers['Access-Control-Allow-Headers']).toBe('content-type')
  })
})

describe('CORS regression guard', () => {
  it('no api/*.js route reflects req.headers.origin verbatim instead of using the shared allowlist', () => {
    // The exact class of bug this module fixes (audit finding #21): a route
    // setting `Access-Control-Allow-Origin` to the raw incoming Origin
    // header (or SITE_URL/'*' as a fallback) instead of checking it against
    // allowedOrigins() first. Every real route should go through
    // applyCors()/api/_lib/cors.js instead of open-coding this itself.
    const files = readdirSync(apiDir).filter(f => f.endsWith('.js'))
    const offenders = []
    for (const file of files) {
      const src = readFileSync(join(apiDir, file), 'utf8')
      if (/req\.headers\.origin\s*\|\|.*\n?\s*res\.setHeader\(\s*['"]Access-Control-Allow-Origin['"]/.test(src)) {
        offenders.push(file)
      }
      // Also catch the pattern split across the two lines this codebase used.
      if (/const origin = req\.headers\.origin \|\|/.test(src)) {
        offenders.push(file)
      }
    }
    expect([...new Set(offenders)]).toEqual([])
  })
})
