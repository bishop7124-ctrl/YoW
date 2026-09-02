#!/usr/bin/env node
// Verifies every api/*.js route actually imports cleanly under Node's
// native ESM loader — the exact runtime Vercel uses to execute these files.
//
// Why this exists: `node --check` (used elsewhere in this repo's QA) only
// validates syntax — it never resolves imports. `npm run build` only builds
// the browser bundle via Vite, which silently tolerates extensionless
// relative imports (`from './billingConfig'`) because bundlers resolve
// those themselves. Node's native ESM loader does NOT — it requires the
// exact file extension on a relative import — so a route that transitively
// imports a `src/` file with an extensionless import passes every existing
// check in this repo, then crashes at cold start in production with an
// opaque Vercel FUNCTION_INVOCATION_FAILED and no other signal.
//
// This is exactly what happened to api/ai-proxy.js on 2026-09-02: its new
// `import { getMembership } from '../src/utils/membership.js'` (audit
// P0-02) pulled in membership.js's pre-existing `import { BILLING } from
// './billingConfig'` (no extension) — harmless until something under api/
// actually imported it. Every request to the route failed outright (even
// GET/OPTIONS, before any of the route's own logic ever ran) until this was
// caught by a live production check and fixed.
//
// Usage: node scripts/check-api-esm-resolution.mjs
// Exits non-zero (and lists every failure) if any route fails to import.

import { readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Stub the handful of env vars enough server modules read at import time
// (not call time) so a route doesn't fail here for an unrelated, expected
// reason (missing local secrets) — this check is purely about whether the
// module graph *resolves*, not whether the route is functionally correct.
for (const [key, value] of Object.entries({
  SUPABASE_URL: 'https://stub.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
  STRIPE_SECRET_KEY: 'sk_test_stub',
  STRIPE_WEBHOOK_SECRET: 'whsec_stub',
})) {
  if (!process.env[key]) process.env[key] = value
}

const apiDir = new URL('../api/', import.meta.url)
const files = readdirSync(apiDir).filter(f => f.endsWith('.js'))

let failed = 0
for (const file of files) {
  const fileUrl = pathToFileURL(path.join(new URL(apiDir).pathname, file)).href
  try {
    await import(fileUrl)
    console.log(`OK   ${file}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${file}: ${error.message}`)
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${files.length} api/ route(s) failed to import under Node's ESM loader.`)
  console.error('Usually the fix is adding a missing file extension to a relative import somewhere in the chain.')
  process.exit(1)
}
console.log(`\nAll ${files.length} api/ routes import cleanly.`)
