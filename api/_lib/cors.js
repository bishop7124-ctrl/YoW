/* global process */

// Shared CORS allowlist/header helper for Vercel API routes under api/.
//
// Every route that authenticates a caller via a bearer token (rather than a
// browser cookie) previously reflected the request's Origin header verbatim
// (`req.headers.origin || SITE_URL || '*'`) instead of checking it against
// an allowlist. That defeats the entire point of CORS: any third-party site
// can drive a fetch() against these endpoints from a visitor's browser, and
// the browser will happily hand the response back to the attacker's page
// because the server told it to. api/ai-proxy.js was fixed to a real
// allowlist as part of the P0-02 remediation (see
// docs/YOW_CODE_AUDIT_2026-09-01.md) — this module is that same allowlist,
// extracted so every other route can share it instead of each carrying its
// own copy-pasted reflection. See finding #21 in the same audit for the
// remaining routes this closes.
//
// NOTE: this file is imported with an explicit `.js` extension by every
// caller. Vercel's Node runtime executes api/*.js with Node's native ESM
// loader, which — unlike Vite/webpack — does not resolve extensionless
// relative imports. An extensionless import here previously took down
// api/ai-proxy.js in production (see docs/ROADMAP.md Bugs table,
// 2026-09-02 "FUNCTION_INVOCATION_FAILED" row) — do not drop the extension
// on any import of this file.

export function allowedOrigins() {
  const origins = new Set([
    'http://localhost:3000', // vercel dev
    'http://localhost:5173', // npm run dev (Vite)
    'tauri://localhost', // desktop app (macOS/Linux Tauri webview)
    'http://tauri.localhost', // desktop app (Windows Tauri webview)
    'https://tauri.localhost',
  ])
  if (process.env.SITE_URL) origins.add(process.env.SITE_URL)
  // VERCEL_URL is auto-populated by Vercel on every deployment (production
  // and preview alike) with that deployment's own hostname, no config
  // needed. Without this, a Vercel preview deployment's frontend calling
  // its own preview API would be blocked, since preview URLs are dynamic
  // per-branch/per-PR and can't be listed as static entries above.
  if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`)
  return origins
}

// Sets CORS response headers for `req`/`res`, only ever echoing back an
// Origin that's in allowedOrigins() (never reflecting an arbitrary one). A
// request with no Origin header (server-to-server, some non-browser desktop
// contexts) isn't subject to browser CORS enforcement anyway, so there's
// nothing to set in that case — the route still runs, it just won't carry
// an Access-Control-Allow-Origin header, which only matters to a browser.
export function applyCors(req, res, { methods = 'GET, OPTIONS', headers = 'authorization, content-type' } = {}) {
  const origin = req.headers.origin
  if (origin && allowedOrigins().has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', headers)
}
