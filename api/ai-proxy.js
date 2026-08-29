const PROVIDER_IDS = new Set(['google', 'anthropic', 'openrouter', 'openai'])
const MAX_BODY_BYTES = 2_000_000
const ALLOWED_OPENAI_BASE_URLS = new Set([
  'https://api.openai.com/v1',
  'https://api.groq.com/openai/v1',
  'https://api.mistral.ai/v1',
  'https://api.together.xyz/v1',
])

function sendCors(req, res) {
  const origin = req.headers.origin || process.env.SITE_URL || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
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

async function handleStream(req, res, body) {
  const { provider, apiKey, model, baseUrl, systemPrompt, messages = [], jsonMode, maxTokens = 4096 } = body
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
      body: JSON.stringify({ model, max_tokens: maxTokens, stream: true, system: systemPrompt, messages }),
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
      body: JSON.stringify({ model, max_tokens: maxTokens, stream: true, messages: [{ role: 'system', content: systemPrompt || '' }, ...messages] }),
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
