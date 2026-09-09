/* global process, Buffer */
import { createClient } from '@supabase/supabase-js'
import { buildOpenAiTokenLimit } from '../src/utils/aiTokenParams.js'
import { getMembership } from '../src/utils/membership.js'
import { allowedOrigins, applyCors } from './_lib/cors.js'

// Re-exported for tests/api/ai-proxy.test.js, which imports this symbol
// directly from this file. The real definition now lives in
// api/_lib/cors.js so every other route can share the same allowlist.
export { allowedOrigins }

const PROVIDER_IDS = new Set(['google', 'anthropic', 'openrouter', 'openai'])
const MAX_BODY_BYTES = 2_000_000
const ALLOWED_OPENAI_BASE_URLS = new Set([
  'https://api.openai.com/v1',
  'https://api.groq.com/openai/v1',
  'https://api.mistral.ai/v1',
  'https://api.together.xyz/v1',
])

// Ceiling on requested output tokens, regardless of what the caller asks
// for — bounds per-request cost. 8192 matches the highest value any real
// caller in this codebase currently requests (AIImportModal.jsx); requests
// above this are clamped down rather than rejected, since the caller's
// own logic already picked a smaller number for its use case.
const MAX_OUTPUT_TOKENS = 8192

// Durable per-user rate limit (see supabase/migrations/20260901_ai_proxy_rate_limits.sql).
// Deliberately generous for legitimate interactive use (AI chat, per-scene
// tools) while bounding sustained abuse. Configurable via env so ops can
// tune without a code change if real usage patterns need it.
const RATE_LIMIT_MAX = Number(process.env.AI_PROXY_RATE_LIMIT_MAX) || 30
const RATE_LIMIT_WINDOW_MINUTES = Number(process.env.AI_PROXY_RATE_LIMIT_WINDOW_MINUTES) || 10

function sendCors(req, res) {
  applyCors(req, res, { methods: 'POST, OPTIONS', headers: 'authorization, content-type' })
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value || {}), 'utf8')
}

function normalizeBaseUrl(baseUrl) {
  try {
    const url = new URL(baseUrl || 'https://api.openai.com/v1')
    url.hash = ''
    url.search = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function safeError(status, fallback, data) {
  const error = data?.error || {}
  return {
    error: {
      code: Number(error.code) || status,
      message: redactSensitiveText(error.message || fallback || `HTTP ${status}`),
      metadata: error.metadata || {},
    },
  }
}

function redactSensitiveText(value = '') {
  return String(value)
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted API key]')
    .replace(/sk-(?:or|ant|proj)?-[0-9A-Za-z_-]{12,}/g, '[redacted API key]')
    .replace(/(api[_-]?key=)[^&\s)]+/gi, '$1[redacted]')
    .slice(0, 1000)
}

async function readJsonSafe(response) {
  try { return await response.json() } catch { return null }
}

async function proxyJson(res, upstream) {
  const data = await readJsonSafe(upstream)
  res.status(upstream.status).json(upstream.ok ? data : safeError(upstream.status, `HTTP ${upstream.status}`, data))
}

async function pipeSse(res, upstream) {
  res.status(upstream.status)
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) res.setHeader('Retry-After', retryAfter)
  if (!upstream.body) return res.end()
  await upstream.body.pipeTo(new WritableStream({
    write(chunk) {
      res.write(Buffer.from(chunk))
    },
    close() {
      res.end()
    },
    abort() {
      res.end()
    },
  })).catch(() => res.end())
}

// ── Auth / entitlement / rate limiting ──────────────────────────────────────

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Deliberately reads ONLY server-controlled fields — app_metadata (writable
// only by the service role, e.g. the Stripe webhook) and created_at (set by
// Supabase at signup, never client-writable) — never user_metadata.
// getMembership() in src/utils/membership.js falls back to user_metadata for
// display-layer convenience, which is fine for UI but NOT safe as a
// server-side security gate: every Free user has no app_metadata
// entitlement fields by default, so that fallback is live for exactly the
// population this check exists to reject, and audit finding P0-01
// (docs/YOW_CODE_AUDIT_2026-09-01.md) confirms user_metadata is editable by
// the signed-in user via the client SDK (supabase.auth.updateUser()) —
// without this, a Free user could self-grant AI access with one console
// call. Reuses getMembership()'s tested plan/trial logic by passing it a
// copy of the user with user_metadata stripped, rather than duplicating it.
export function hasAiEntitlement(user) {
  const membership = getMembership({ ...user, user_metadata: {} })
  return !membership.isFree
}

async function authenticate(req, supabase) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { user: null }
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return { user: null }
  return { user: data.user }
}

// Best-effort bound on the rate-limit log table's growth — no cron job
// exists for this yet, so opportunistically trim old rows inline rather
// than letting the table grow unbounded. Cheap (indexed) and idempotent;
// safe to skip most of the time.
async function maybeCleanupRateLimitLog(supabase) {
  if (Math.random() >= 0.02) return
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('ai_proxy_requests').delete().lt('created_at', cutoff).then(() => {}, () => {})
}

// Note: this is check-then-insert, not atomic — two requests from the same
// user arriving concurrently can both read a count under the limit before
// either has inserted, letting a tight burst exceed RATE_LIMIT_MAX by
// roughly the number of in-flight requests. Accepted tradeoff for a simple,
// durable log-table implementation; an atomic Postgres RPC (row lock or
// upsert-and-check) would close this if real abuse patterns ever need it.
async function checkAndRecordRateLimit(supabase, userId) {
  await maybeCleanupRateLimitLog(supabase)
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
  const { count, error: countError } = await supabase
    .from('ai_proxy_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart)
  // Fail open on a rate-limit infrastructure error (e.g. table unreachable)
  // rather than blocking every legitimate AI request on a durability blip —
  // auth + entitlement checks still gate access either way.
  if (countError) {
    console.error('[ai-proxy] rate limit check failed', countError?.code || 'unknown')
    return { allowed: true }
  }
  if ((count || 0) >= RATE_LIMIT_MAX) return { allowed: false }
  const { error: insertError } = await supabase.from('ai_proxy_requests').insert({ user_id: userId })
  if (insertError) console.error('[ai-proxy] rate limit record failed', insertError?.code || 'unknown')
  return { allowed: true }
}

export function clampMaxTokens(value) {
  const requested = Number(value)
  if (!Number.isFinite(requested) || requested <= 0) return 4096
  return Math.min(requested, MAX_OUTPUT_TOKENS)
}

// ── Provider calls ───────────────────────────────────────────────────────────

async function handleModels(req, res, body) {
  const { provider, apiKey, baseUrl } = body
  if (provider === 'openrouter') {
    const upstream = await fetch('https://openrouter.ai/api/v1/models')
    return proxyJson(res, upstream)
  }
  if (!apiKey) return res.status(400).json({ error: { code: 400, message: 'An API key is required.' } })

  if (provider === 'google') {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
      headers: { 'x-goog-api-key': apiKey },
    })
    return proxyJson(res, upstream)
  }
  if (provider === 'anthropic') {
    const upstream = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    })
    return proxyJson(res, upstream)
  }
  if (provider === 'openai') {
    const normalized = normalizeBaseUrl(baseUrl)
    if (!ALLOWED_OPENAI_BASE_URLS.has(normalized)) {
      return res.status(400).json({ error: { code: 400, message: 'This OpenAI-compatible base URL is not available through the YOW proxy.' } })
    }
    const upstream = await fetch(`${normalized}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    return proxyJson(res, upstream)
  }

  return res.status(400).json({ error: { code: 400, message: 'Unknown AI provider.' } })
}

function anthropicSystemPrompt(systemPrompt, cacheControl) {
  const text = String(systemPrompt || '')
  if (!text || cacheControl?.behavior !== 'anthropic_ephemeral' || !cacheControl?.eligible) return text
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }]
}

async function handleStream(req, res, body) {
  const { provider, apiKey, model, baseUrl, systemPrompt, messages = [], jsonMode, cacheControl } = body
  const maxTokens = clampMaxTokens(body.maxTokens)
  if (!apiKey) return res.status(400).json({ error: { code: 400, message: 'An API key is required.' } })
  if (!model) return res.status(400).json({ error: { code: 400, message: 'A model is required.' } })

  let upstream
  if (provider === 'google') {
    const contents = messages.map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(message.content || '') }],
    }))
    const generationConfig = { maxOutputTokens: maxTokens }
    if (jsonMode) generationConfig.response_mime_type = 'application/json'
    const payload = { contents, generationConfig }
    if (systemPrompt) payload.systemInstruction = { parts: [{ text: String(systemPrompt) }] }

    upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    })
  } else if (provider === 'anthropic') {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, stream: true, system: anthropicSystemPrompt(systemPrompt, cacheControl), messages }),
    })
  } else if (provider === 'openrouter' || provider === 'openai') {
    const normalized = provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : normalizeBaseUrl(baseUrl)
    if (provider === 'openai' && !ALLOWED_OPENAI_BASE_URLS.has(normalized)) {
      return res.status(400).json({ error: { code: 400, message: 'This OpenAI-compatible base URL is not available through the YOW proxy.' } })
    }
    upstream = await fetch(`${normalized}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://www.yourownworld.co.uk', 'X-Title': 'Your Own World' } : {}),
      },
      body: JSON.stringify({ model, ...buildOpenAiTokenLimit(provider, model, maxTokens), stream: true, stream_options: { include_usage: true }, messages: [{ role: 'system', content: systemPrompt || '' }, ...messages] }),
    })
  } else {
    return res.status(400).json({ error: { code: 400, message: 'Unknown AI provider.' } })
  }

  if (!upstream.ok) {
    const data = await readJsonSafe(upstream)
    const retryAfter = upstream.headers.get('retry-after')
    if (retryAfter) res.setHeader('Retry-After', retryAfter)
    return res.status(upstream.status).json(safeError(upstream.status, `HTTP ${upstream.status}`, data))
  }
  return pipeSse(res, upstream)
}

export default async function handler(req, res) {
  sendCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 405, message: 'Method not allowed.' } })

  try {
    const supabase = getSupabase()
    const { user } = await authenticate(req, supabase)
    if (!user) return res.status(401).json({ error: { code: 401, message: 'Sign in required.' } })

    if (!hasAiEntitlement(user)) {
      return res.status(403).json({ error: { code: 403, message: 'AI tools require a paid plan.' } })
    }

    const { allowed } = await checkAndRecordRateLimit(supabase, user.id)
    if (!allowed) {
      res.setHeader('Retry-After', String(RATE_LIMIT_WINDOW_MINUTES * 60))
      return res.status(429).json({ error: { code: 429, message: 'Too many AI requests — please wait a moment and try again.' } })
    }

    const body = req.body || {}
    if (!PROVIDER_IDS.has(body.provider)) return res.status(400).json({ error: { code: 400, message: 'Unknown AI provider.' } })
    if (byteLength(body) > MAX_BODY_BYTES) return res.status(413).json({ error: { code: 413, message: 'AI request is too large.' } })
    if (body.action === 'models') return handleModels(req, res, body)
    if (body.action === 'stream') return handleStream(req, res, body)
    return res.status(400).json({ error: { code: 400, message: 'Unknown AI proxy action.' } })
  } catch (error) {
    console.error('[ai-proxy]', error?.name || 'Error', error?.message || 'AI proxy failed')
    return res.status(502).json({ error: { code: 502, message: 'YOW could not reach the selected AI provider.' } })
  }
}
