export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_ALLOWED_ORIGINS = new Set([
  'https://www.yourownworld.co.uk',
  'https://yourownworld.co.uk',
  'http://localhost:3000',
  'http://localhost:5173',
  'tauri://localhost',
  'https://tauri.localhost',
])

// The browser-called email functions do not need the permissive wildcard
// used by older/superseded Edge Functions. Only return an Allow-Origin value
// for YOW's known web, local-development, and desktop origins. Requests from
// other origins can still receive an HTTP response, but browsers cannot read
// it or issue an authorized credentialed call through CORS.
export function emailCorsHeaders(req: Request) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  const origin = req.headers.get('Origin')
  if (origin && EMAIL_ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers.Vary = 'Origin'
  }
  return headers
}

export function emailPreflightResponse(req: Request) {
  return new Response('ok', { status: 200, headers: emailCorsHeaders(req) })
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
