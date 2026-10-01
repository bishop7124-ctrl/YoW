#!/usr/bin/env node
// Read-only production edge check: canonical-host redirect + security headers.
// Sends only unauthenticated GET requests (no cookies, no credentials, no writes).
//
//   node scripts/check-production-edge.mjs [https://www.yourownworld.co.uk]
//
// Exit code 0 = every check passed, 1 = at least one failed. Prints a JSON report so the
// result can be pasted into docs/QA_PLAN.md as evidence.

const CANONICAL = (process.argv[2] || 'https://www.yourownworld.co.uk').replace(/\/$/, '')
const canonicalHost = new URL(CANONICAL).hostname
const bareHost = canonicalHost.replace(/^www\./, '')

const results = []
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail })

const get = (url) => fetch(url, { redirect: 'manual', headers: { 'user-agent': 'yow-edge-check/1.0' } })

// 1. Bare domain -> www, permanent, path and query preserved.
for (const path of ['/', '/pricing?plan=lifetime&utm_source=check', '/features/ai?x=1#frag-ignored']) {
  const res = await get(`https://${bareHost}${path}`)
  const location = res.headers.get('location') || ''
  const expected = `${CANONICAL}${path.split('#')[0]}`
  check(`redirect ${path}`, [301, 308].includes(res.status) && location === expected, { status: res.status, location, expected })
}

// 2. Plain-HTTP is upgraded (HTTP request must never serve content).
try {
  const res = await get(`http://${canonicalHost}/`)
  const location = res.headers.get('location') || ''
  check('http upgrades to https', [301, 302, 307, 308].includes(res.status) && location.startsWith('https://'), { status: res.status, location })
} catch (err) {
  check('http upgrades to https', false, { error: String(err) })
}

// 3. Security headers on the home page, a deep link, and a 404-style path.
const REQUIRED = {
  'x-content-type-options': (v) => v === 'nosniff',
  'x-frame-options': (v) => v.toUpperCase() === 'DENY',
  'referrer-policy': (v) => v === 'strict-origin-when-cross-origin',
  'strict-transport-security': (v) => /max-age=(\d+)/.test(v) && Number(/max-age=(\d+)/.exec(v)[1]) >= 31536000 && /includeSubDomains/i.test(v),
  'content-security-policy': (v) =>
    /default-src 'self'/.test(v) && /frame-ancestors 'none'/.test(v) && /object-src 'none'/.test(v) &&
    /base-uri 'self'/.test(v) && !/script-src[^;]*'unsafe-(inline|eval)'/.test(v),
  'permissions-policy': (v) => /camera=\(\)/.test(v) && /microphone=\(\)/.test(v),
}
for (const path of ['/', '/pricing', '/this-page-does-not-exist-edge-check']) {
  const res = await get(`${CANONICAL}${path}`)
  for (const [header, ok] of Object.entries(REQUIRED)) {
    const value = res.headers.get(header)
    check(`${header} on ${path}`, value && ok(value), { status: res.status, value: value ? value.slice(0, 120) : null })
  }
}

const failed = results.filter((r) => !r.pass)
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), canonical: CANONICAL, total: results.length, failed: failed.length, results }, null, 2))
process.exit(failed.length ? 1 : 0)
