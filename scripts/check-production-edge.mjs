#!/usr/bin/env node
// Read-only production edge check: canonical-host redirect + security headers.
// Usage: node scripts/check-production-edge.mjs [https://www.yourownworld.co.uk]
// Makes only GET/HEAD-style requests. No credentials, nothing is modified.

const origin = (process.argv[2] || 'https://www.yourownworld.co.uk').replace(/\/$/, '')
const host = new URL(origin).host
const bareHost = host.replace(/^www\./, '')
let failures = 0
const report = (ok, label, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`)
}

// 1. Canonical host redirect (bare -> www), path + query preserved.
const probe = '/pricing?utm_source=edge-check&x=1'
const redirect = await fetch(`https://${bareHost}${probe}`, { redirect: 'manual' })
const location = redirect.headers.get('location') || ''
report([301, 308].includes(redirect.status), `bare domain redirects permanently (${redirect.status})`)
report(location === `https://${host}${probe}`, 'redirect keeps path and query', location)

// 2. Security headers on the real document response.
const pages = ['/', '/pricing', '/login']
const required = {
  'content-security-policy': v => /default-src 'self'/.test(v) && /frame-ancestors 'none'/.test(v) && /object-src 'none'/.test(v),
  'strict-transport-security': v => /max-age=(\d+)/.test(v) && Number(v.match(/max-age=(\d+)/)[1]) >= 31536000,
  'x-content-type-options': v => v.toLowerCase() === 'nosniff',
  'x-frame-options': v => /^(deny|sameorigin)$/i.test(v),
  'referrer-policy': v => v.length > 0,
  'permissions-policy': v => v.length > 0,
}
for (const path of pages) {
  const res = await fetch(`${origin}${path}`, { redirect: 'follow' })
  report(res.ok, `GET ${path} responds ${res.status}`)
  for (const [name, test] of Object.entries(required)) {
    const value = res.headers.get(name)
    report(!!value && test(value), `${path} ${name}`, value ? '' : 'missing')
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll edge checks passed')
process.exit(failures ? 1 : 0)
