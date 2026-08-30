import { buildProjectTypePromptContext } from './aiToolPrompts'
import { isDesktopAppRuntime } from './runtime.js'
import { OFFLINE_MODE, mockStreamMessage } from './offlineMock'
import { normalizeAiUsage } from './aiUsage'
import { buildOpenAiTokenLimit } from './aiTokenParams'

export const DEFAULT_CREATIVE_CHAT_DIRECTIVE = `Help with writing, plot, character development, world-building, and creative problem-solving.

Conversation style:
- Act like a collaborative story-room partner, not a worksheet generator.
- Start from the user's existing canon and name uncertainties instead of inventing over it.
- For open brainstorming, give 2-4 strong possibilities with tradeoffs, then ask one focused follow-up question.
- Keep suggestions coherent and readable: short sections or bullets are fine, but avoid large tables unless the user explicitly asks for a table.
- Do not output corrupted placeholder text, mixed-language fragments, random tokens, or malformed markdown.
- If context is thin, say what is missing and propose a useful next step rather than filling the gap with noise.
- Prefer concrete story beats, character motives, stakes, reversals, and cause/effect chains over generic advice.`

export const PROVIDERS = {
  google: {
    name: 'Google AI Studio',
    keyPlaceholder: 'AIza...',
    setupUrl: 'https://aistudio.google.com/app/apikey',
    bestFor: 'Fast drafting, brainstorming, and general-purpose creative help.',
    freeUsage: 'May offer free usage or allowances depending on Google pricing, region, and account configuration.',
    billing: 'Users in the UK, EEA, or Switzerland must use a key for a Google Cloud project with active billing where Google requires Paid Services.',
    limitations: 'Model access and quotas vary by account; Google may change or retire Gemini model IDs.',
    // Starter/fallback list only — Google retires Gemini model IDs on a few
    // months' notice, and has been cutting new-user access to old IDs even
    // faster than its own published shutdown dates (2.0 Flash/Flash-Lite:
    // shut down June 2026; 2.5 Pro/Flash/Flash-Lite: still listed by
    // ListModels but already 404ing for new keys as "no longer available to
    // new users", well ahead of their October 2026 shutdown date). Because
    // ListModels can say a model is available when generateContent will
    // reject it, the live catalog from fetchGoogleModels() below is
    // necessary but not sufficient — friendlyErrorMessage() below also
    // special-cases that rejection so switching models is a one-message fix
    // instead of a mystery. This list is what renders before the live
    // catalog resolves, or if it fails.
    models: [
      { id: 'gemini-3.6-flash',           label: 'Gemini 3.6 Flash' },
      { id: 'gemini-3.5-flash',           label: 'Gemini 3.5 Flash' },
      { id: 'gemini-2.5-pro',             label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash',           label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite',      label: 'Gemini 2.5 Flash Lite' },
      { id: 'gemma-3-27b-it',             label: 'Gemma 3 27B' },
      { id: 'gemma-3-12b-it',             label: 'Gemma 3 12B' },
      { id: 'gemma-3-4b-it',              label: 'Gemma 3 4B' },
    ],
    defaultModel: 'gemini-3.6-flash',
  },
  openrouter: {
    name: 'OpenRouter',
    keyPlaceholder: 'sk-or-...',
    setupUrl: 'https://openrouter.ai/keys',
    bestFor: 'Trying many model families from one account, including models with large context windows.',
    freeUsage: 'Offers some free or free-labelled models when available, usually with tighter rate limits and reliability limits.',
    billing: 'Paid credits may be required for higher reliability, larger models, or exhausted free quotas.',
    limitations: 'Availability, limits, and data handling can vary by the upstream model provider behind OpenRouter.',
    models: [
      { id: 'google/gemma-3-27b-it',              label: 'Gemma 3 27B' },
      { id: 'google/gemma-3-12b-it',              label: 'Gemma 3 12B' },
      { id: 'google/gemma-3-4b-it',               label: 'Gemma 3 4B' },
      { id: 'meta-llama/llama-3.3-70b-instruct',  label: 'Llama 3.3 70B' },
      { id: 'mistralai/mistral-large',             label: 'Mistral Large' },
      { id: 'deepseek/deepseek-r1',               label: 'DeepSeek R1' },
      { id: 'openai/gpt-4o',                      label: 'GPT-4o' },
      { id: 'anthropic/claude-sonnet-4-5',        label: 'Claude Sonnet 4.5' },
    ],
    defaultModel: 'google/gemma-3-27b-it',
    hasBaseUrl: false,
  },
  anthropic: {
    name: 'Anthropic',
    keyPlaceholder: 'sk-ant-...',
    setupUrl: 'https://console.anthropic.com/settings/keys',
    bestFor: 'Long-form story reasoning, editorial critique, and character/world consistency work.',
    freeUsage: 'API access usually requires an Anthropic Console account and may require credits or billing.',
    billing: 'Billing or prepaid credits may be required before some models can be used.',
    limitations: 'Model access, rate limits, and context limits vary by account and current Anthropic policy.',
    models: [
      { id: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-7',            label: 'Claude Opus 4.7' },
      { id: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5' },
    ],
    defaultModel: 'claude-sonnet-4-6',
  },
  openai: {
    name: 'OpenAI-compatible',
    keyPlaceholder: 'sk-...',
    hasBaseUrl: true,
    setupUrl: 'https://platform.openai.com/api-keys',
    bestFor: 'OpenAI API models, Groq, Mistral, Together, and other OpenAI-compatible endpoints.',
    freeUsage: 'Depends entirely on the selected endpoint; some providers offer trial credits or free tiers.',
    billing: 'Billing may be required by the selected endpoint before API requests or specific models work.',
    limitations: 'Custom endpoints may have different CORS support, model IDs, limits, pricing, and data practices.',
    models: [
      { id: 'gpt-4o',                    label: 'GPT-4o' },
      { id: 'gpt-4o-mini',               label: 'GPT-4o mini' },
      { id: 'mistral-large-latest',      label: 'Mistral Large' },
      { id: 'llama-3.3-70b-versatile',   label: 'Llama 3.3 70B (Groq)' },
    ],
    defaultModel: '',
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
}

// ── Live model catalogs ──────────────────────────────────────────────────────
// Every provider here retires and ships model IDs faster than this file gets
// edited (OpenRouter alone hosts 300+ and churns continuously; Google has
// shut down or renamed a whole model generation more than once this year).
// The PROVIDERS[...].models lists above are just curated starter/fallback
// sets — these functions fetch each provider's real, current catalog so the
// settings UI reflects what's actually callable right now. Results are
// cached per cache key (provider, plus API key/base URL for providers whose
// catalog depends on the account) so re-rendering the settings panel doesn't
// re-fetch on every keystroke.
const modelCatalogCache = new Map() // cacheKey -> models[] | Promise<models[]>
const PROXIED_OPENAI_BASE_URLS = new Set([
  'https://api.openai.com/v1',
  'https://api.groq.com/openai/v1',
  'https://api.mistral.ai/v1',
  'https://api.together.xyz/v1',
])

const aiProxyEndpoint = () => {
  const base = import.meta.env.VITE_DESKTOP_API_BASE_URL
    || (isDesktopAppRuntime() ? 'https://www.yourownworld.co.uk' : '')
  return `${base}/api/ai-proxy`
}

function normalizeBaseUrl(baseUrl) {
  try {
    const url = new URL(baseUrl || PROVIDERS.openai.defaultBaseUrl)
    url.hash = ''
    url.search = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function canProxyProvider(provider, baseUrl) {
  if (provider !== 'openai') return true
  return PROXIED_OPENAI_BASE_URLS.has(normalizeBaseUrl(baseUrl))
}

async function proxyJson(action, payload) {
  const res = await fetch(aiProxyEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = parseProviderError(res.status, data)
    throw new Error(friendlyErrorMessage(err.status, err.message, {
      provider: payload.provider,
      metadata: err.metadata,
      retryAfter: readRetryAfter(res),
    }))
  }
  return data
}

function cachedModelFetch(cacheKey, fetcher) {
  const cached = modelCatalogCache.get(cacheKey)
  if (cached) return Promise.resolve(cached)
  const promise = fetcher()
    .then(list => { modelCatalogCache.set(cacheKey, list); return list })
    .catch(err => { modelCatalogCache.delete(cacheKey); throw err })
  modelCatalogCache.set(cacheKey, promise)
  return promise
}

// OpenRouter: public, key-less, CORS-enabled — same catalog for everyone.
export function fetchOpenRouterModels() {
  return cachedModelFetch('openrouter', async () => {
    const data = await proxyJson('models', { provider: 'openrouter' })
    return (data?.data || [])
      .map(m => ({ id: m.id, label: m.name || m.id, contextLength: m.context_length }))
      .filter(m => m.id)
      .sort((a, b) => a.label.localeCompare(b.label))
  })
}

// Google AI Studio: ListModels requires the caller's own key and only
// returns models that key can actually use, so cache per key.
export function fetchGoogleModels(apiKey) {
  if (!apiKey) return Promise.reject(new Error('An API key is required to load Google\'s live model list.'))
  return cachedModelFetch(`google:${apiKey}`, async () => {
    const data = await proxyJson('models', { provider: 'google', apiKey })
    return (data?.models || [])
      .filter(m => m.supportedGenerationMethods?.some(g => g === 'generateContent' || g === 'streamGenerateContent'))
      .map(m => ({ id: (m.name || '').replace(/^models\//, ''), label: m.displayName || m.name, contextLength: m.inputTokenLimit }))
      .filter(m => m.id)
      .sort((a, b) => a.label.localeCompare(b.label))
  })
}

// Anthropic: model access varies by account, so cache per key.
export function fetchAnthropicModels(apiKey) {
  if (!apiKey) return Promise.reject(new Error('An API key is required to load Anthropic\'s live model list.'))
  return cachedModelFetch(`anthropic:${apiKey}`, async () => {
    const data = await proxyJson('models', { provider: 'anthropic', apiKey })
    return (data?.data || [])
      .map(m => ({ id: m.id, label: m.display_name || m.id }))
      .filter(m => m.id)
      .sort((a, b) => a.label.localeCompare(b.label))
  })
}

// OpenAI-compatible: the /models list endpoint is part of the OpenAI spec
// most compatible backends (Groq, Together, Mistral, Ollama, ...) implement,
// but not all do — callers should fall back to the curated list on failure.
export function fetchOpenAIModels(apiKey, baseUrl) {
  if (!apiKey) return Promise.reject(new Error('An API key is required to load the live model list.'))
  const url = `${(baseUrl || PROVIDERS.openai.defaultBaseUrl).replace(/\/$/, '')}/models`
  return cachedModelFetch(`openai:${url}:${apiKey}`, async () => {
    if (canProxyProvider('openai', baseUrl)) {
      const data = await proxyJson('models', { provider: 'openai', apiKey, baseUrl })
      return (data?.data || [])
        .map(m => ({ id: m.id, label: m.id }))
        .filter(m => m.id)
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return (data?.data || [])
      .map(m => ({ id: m.id, label: m.id }))
      .filter(m => m.id)
      .sort((a, b) => a.label.localeCompare(b.label))
  })
}

// Single entry point the settings UI calls regardless of which provider is
// active, so it doesn't need a per-provider branch for "how do I refresh
// this catalog".
export function fetchLiveModels(provider, { apiKey, baseUrl } = {}) {
  if (provider === 'openrouter') return fetchOpenRouterModels()
  if (provider === 'google')     return fetchGoogleModels(apiKey)
  if (provider === 'anthropic')  return fetchAnthropicModels(apiKey)
  if (provider === 'openai')     return fetchOpenAIModels(apiKey, baseUrl)
  return Promise.reject(new Error(`No live model catalog for provider: ${provider}`))
}

// ── Error messages ────────────────────────────────────────────────────────────
// All providers return an HTTP status plus their own error body; without this,
// a bad key, a rate limit, and a provider outage all rendered as the same
// generic red box with whatever raw string the provider happened to send.

export function friendlyErrorMessage(status, rawMessage, options = {}) {
  const { provider, metadata = {}, retryAfter } = options
  const message = redactSensitiveText(rawMessage || '')
  const errorType = metadata.error_type || metadata.errorType
  const providerCode = metadata.provider_code || metadata.providerCode
  const waitText = retryAfter ? ` Wait ${retryAfter} second${Number(retryAfter) === 1 ? '' : 's'} before retrying.` : ''
  const isOpenRouter = provider === 'openrouter'
  const openRouterSuffix = isOpenRouter
    ? ' For OpenRouter free models, try a different model ending in :free, wait for the quota window to reset, add OpenRouter credits, or switch to a paid model variant.'
    : ''

  // Providers retire model IDs faster than users update their settings —
  // and Google in particular has been cutting new-key access to a model
  // before its own published shutdown date, so this isn't even rare. Catch
  // it by phrasing rather than status code since providers don't agree on
  // one (Google: 404 "no longer available to new users"; others: 400/410).
  if (/no longer available|has been (deprecated|retired|removed|shut ?down)|model not found/i.test(message)) {
    return `This model isn't available anymore. Open AI Settings and pick another from the live model list. (${message})`
  }
  if (status === 401 || status === 403) {
    return `Your API key looks invalid or doesn't have permission for this model. Check it in AI Settings. (${message})`
  }
  if (status === 402 || errorType === 'payment_required') {
    return `Your AI provider account or API key is out of credits. Check the provider billing/limits page or choose a free model your key can use. (${message})`
  }
  if (status === 400 || status === 413 || /context|token|too (long|large)|maximum|exceeds/i.test(message)) {
    return `The request is too large or malformed for this model. Try a smaller context selection, a shorter excerpt, or a model with a larger context window. (${message})`
  }
  if (status === 429) {
    if (isOpenRouter && (providerCode || /provider returned error|upstream|provider/i.test(message))) {
      return `OpenRouter reached the selected model, but the upstream provider is rate-limiting or at capacity.${waitText}${openRouterSuffix} (${message})`
    }
    return `The AI provider is rate-limiting requests.${waitText || ' Wait a moment and try again.'}${openRouterSuffix} (${message})`
  }
  if (errorType === 'provider_overloaded' || errorType === 'provider_unavailable') {
    return `OpenRouter couldn't get a usable response from the selected model provider.${waitText} Try another model or a paid model variant if this keeps happening. (${message})`
  }
  if (status >= 500) {
    return `The AI provider is having issues right now — this isn't something you can fix, try again shortly. (${message})`
  }
  return message
}

function readRetryAfter(res) {
  const value = res.headers?.get?.('Retry-After')
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function redactSensitiveText(value = '') {
  return String(value)
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted API key]')
    .replace(/sk-(?:or|ant|proj)?-[0-9A-Za-z_-]{12,}/g, '[redacted API key]')
    .replace(/(api[_-]?key=)[^&\s)]+/gi, '$1[redacted]')
    .slice(0, 1000)
}

function parseProviderError(status, data) {
  const error = data?.error || {}
  return {
    status: Number(error.code) || status,
    message: redactSensitiveText(error.message || `HTTP ${status}`),
    metadata: error.metadata || {},
  }
}

// ── Shared SSE reader ─────────────────────────────────────────────────────────

async function readSSE(body, onEvent) {
  const reader  = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (!data || data === '[DONE]') continue
      try {
        const stop = onEvent(JSON.parse(data))
        if (stop) return
      } catch { /* ignore parse errors */ }
    }
  }
}

// ── Provider implementations ──────────────────────────────────────────────────

async function streamOpenAI({ apiKey, model, baseUrl, provider, extraHeaders, systemPrompt, messages, onChunk, onDone, onError, onUsage, maxTokens = 4096, signal, promptMetadata }) {
  try {
    const url        = `${(baseUrl || PROVIDERS.openai.defaultBaseUrl).replace(/\/$/, '')}/chat/completions`
    const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages]
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
    const includeUsage = normalizedBaseUrl === 'https://api.openai.com/v1' || normalizedBaseUrl === 'https://api.groq.com/openai/v1'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...extraHeaders },
      body: JSON.stringify({ model, ...buildOpenAiTokenLimit(provider, model, maxTokens), stream: true, ...(includeUsage ? { stream_options: { include_usage: true } } : {}), messages: apiMessages }),
      signal,
    })
    if (!res.ok) {
      let err = { status: res.status, message: `HTTP ${res.status}`, metadata: {} }
      try { err = parseProviderError(res.status, await res.json()) } catch { /* ignore */ }
      return onError(friendlyErrorMessage(err.status, err.message, { provider, metadata: err.metadata, retryAfter: readRetryAfter(res) }))
    }
    let done = false
    const onceDone = () => { if (!done) { done = true; onDone() } }
    await readSSE(res.body, (parsed) => {
      if (parsed.error) {
        const err = parseProviderError(parsed.error.code || 500, parsed)
        onError(friendlyErrorMessage(err.status, err.message, { provider, metadata: err.metadata }))
        done = true
        return true
      }
      if (parsed.usage) onUsage?.(normalizeAiUsage(provider, parsed.usage, { model, contextMode: promptMetadata?.contextMode }))
      const text = parsed.choices?.[0]?.delta?.content
      if (text) onChunk(text)
      if (parsed.choices?.[0]?.finish_reason === 'stop') { onceDone(); return true }
    })
    if (!done) onceDone()
  } catch (e) { if (e.name !== 'AbortError') onError(`Couldn't reach the AI provider — check your connection and try again. (${e.message || 'Network error'})`) }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function streamViaProxy({ provider, apiKey, model, baseUrl, systemPrompt, messages, onChunk, onDone, onError, onUsage, jsonMode, maxTokens = 4096, signal, promptMetadata, cacheControl }) {
  try {
    const makeRequest = (nextCacheControl) => fetch(aiProxyEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stream', provider, apiKey, model, baseUrl, systemPrompt, messages, jsonMode, maxTokens, promptMetadata, cacheControl: nextCacheControl }),
      signal,
    })
    let res = await makeRequest(cacheControl)
    if (!res.ok) {
      let err = { status: res.status, message: `HTTP ${res.status}`, metadata: {} }
      try { err = parseProviderError(res.status, await res.json()) } catch { /* ignore */ }
      if (cacheControl?.eligible && /cache|cached|cache_control|cacheControl/i.test(err.message)) {
        res = await makeRequest({ ...cacheControl, eligible: false, fallbackReason: err.message })
        if (res.ok) {
          // Continue with the normal stream reader below using the successful
          // uncached response. Do not issue a second provider request.
        } else {
        try { err = parseProviderError(res.status, await res.json()) } catch { err = { status: res.status, message: `HTTP ${res.status}`, metadata: {} } }
        }
      }
      if (!res.ok) return onError(friendlyErrorMessage(err.status, err.message, { provider, metadata: err.metadata, retryAfter: readRetryAfter(res) }))
    }
    let done = false
    const onceDone = () => { if (!done) { done = true; onDone() } }
    await readSSE(res.body, (parsed) => {
      if (provider === 'google') {
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) onChunk(text)
        if (parsed.usageMetadata) onUsage?.(normalizeAiUsage(provider, parsed.usageMetadata, { model, contextMode: promptMetadata?.contextMode }))
        if (parsed.candidates?.[0]?.finishReason === 'STOP') { onceDone(); return true }
        return false
      }
      if (provider === 'anthropic') {
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') onChunk(parsed.delta.text)
        if (parsed.usage) onUsage?.(normalizeAiUsage(provider, parsed.usage, { model, contextMode: promptMetadata?.contextMode }))
        if (parsed.type === 'message_delta' && parsed.usage) onUsage?.(normalizeAiUsage(provider, parsed.usage, { model, contextMode: promptMetadata?.contextMode }))
        if (parsed.type === 'message_stop') { onceDone(); return true }
        return false
      }
      if (parsed.error) {
        const err = parseProviderError(parsed.error.code || 500, parsed)
        onError(friendlyErrorMessage(err.status, err.message, { provider, metadata: err.metadata }))
        done = true
        return true
      }
      if (parsed.usage) onUsage?.(normalizeAiUsage(provider, parsed.usage, { model, contextMode: promptMetadata?.contextMode }))
      const text = parsed.choices?.[0]?.delta?.content
      if (text) onChunk(text)
      if (parsed.choices?.[0]?.finish_reason === 'stop') { onceDone(); return true }
      return false
    })
    if (!done) onceDone()
  } catch (e) {
    if (e.name !== 'AbortError') onError(`Couldn't reach the AI provider — check your connection and try again. (${e.message || 'Network error'})`)
  }
}

export function streamMessage({ provider, apiKey, model, baseUrl, systemPrompt, messages, onChunk, onDone, onError, onUsage, jsonMode, maxTokens, signal, promptMetadata, cacheControl }) {
  if (OFFLINE_MODE)         return mockStreamMessage({ onChunk, onDone, onError })
  if (!apiKey)              return onError('No API key configured.')
  if (canProxyProvider(provider, baseUrl)) return streamViaProxy({ provider, apiKey, model, baseUrl, systemPrompt, messages, onChunk, onDone, onError, onUsage, jsonMode, maxTokens, signal, promptMetadata, cacheControl })
  if (provider === 'openai')      return streamOpenAI({ apiKey, model, baseUrl, provider: 'openai', systemPrompt, messages, onChunk, onDone, onError, onUsage, maxTokens, signal, promptMetadata })
  onError(`Unknown provider: ${provider}`)
}

export function buildSystemPrompt(novel, context, store, agentDirective) {
  const lines = [
    'You are a creative writing assistant embedded in Your Own World.',
    buildProjectTypePromptContext(novel),
    agentDirective?.trim() || DEFAULT_CREATIVE_CHAT_DIRECTIVE,
  ].filter(Boolean)

  if (context?.builtContext || context?.stableContext || context?.requestContext) {
    if (context.stableContext) lines.push(`\n--- STABLE PROJECT CONTEXT ---\n${context.stableContext}`)
    if (context.requestContext) lines.push(`\n--- SELECTED REQUEST CONTEXT ---\n${context.requestContext}`)
    if (!context.stableContext && context.builtContext) lines.push(`\n--- PROJECT CONTEXT ---\n${context.builtContext}`)
    if (context.customInstruction?.trim()) {
      lines.push(`\n--- ADDITIONAL CONTEXT ---\n${context.customInstruction.trim()}`)
    }
    return lines.join('\n')
  }

  const { characterIds, locationIds, loreEntryIds, worldHistoryIds, chapterIds, ideaEntryIds, customInstruction } = context

  if (characterIds?.length) {
    const chars = (store.characters || []).filter(c => characterIds.includes(c.id))
    if (chars.length) {
      lines.push('\n--- CHARACTERS ---')
      chars.forEach(c => {
        lines.push(`\n${c.name}${c.role ? ` — ${c.role}` : ''}`)
        if (c.pronouns) lines.push(`Pronouns: ${c.pronouns}`)
        if (c.familyGroup) lines.push(`Family: ${c.familyGroup}`)
        if (c.bio) lines.push(c.bio)
        if (c.keywords?.length) lines.push(`Also known as: ${c.keywords.join(', ')}`)
      })
    }
  }

  if (locationIds?.length) {
    const locs = (store.locations || []).filter(l => locationIds.includes(l.id))
    if (locs.length) {
      lines.push('\n--- LOCATIONS ---')
      locs.forEach(l => {
        lines.push(`\n${l.name}${l.category ? ` (${l.category})` : ''}`)
        if (l.description) lines.push(l.description)
      })
    }
  }

  if (loreEntryIds?.length) {
    const entries = (store.loreEntries || []).filter(e => loreEntryIds.includes(e.id))
    if (entries.length) {
      lines.push('\n--- LORE ---')
      entries.forEach(e => {
        lines.push(`\n${e.title}${e.category ? ` (${e.category})` : ''}`)
        if (e.content) lines.push(e.content)
      })
    }
  }

  if (worldHistoryIds?.length) {
    const history = (store.worldHistory || []).filter(entry => worldHistoryIds.includes(entry.id))
    if (history.length) {
      lines.push('\n--- HISTORY ---')
      history.forEach(entry => {
        lines.push(`\n${entry.title}`)
        if (entry.era) lines.push(`Era: ${entry.era}`)
        if (entry.startYear || entry.endYear) lines.push(`Years: ${[entry.startYear, entry.endYear].filter(Boolean).join(' - ')}`)
        if (entry.dateRange) lines.push(`Date range: ${entry.dateRange}`)
        if (entry.content) lines.push(entry.content)
      })
    }
  }

  if (chapterIds?.length) {
    lines.push('\n--- MANUSCRIPT ---')
    chapterIds.forEach(chapId => {
      const chap = (store.chapters || []).find(c => c.id === chapId)
      if (!chap) return
      const num = (store.chapters || []).findIndex(c => c.id === chapId) + 1
      lines.push(`\n[Chapter ${num}${chap.title ? `: ${chap.title}` : ''}]`)
      ;(store.scenes || []).filter(s => s.chapterId === chapId).forEach(s => {
        if (s.content?.trim()) lines.push(s.content)
      })
    })
  }

  if (ideaEntryIds?.length) {
    const ideas = (store.ideaEntries || []).filter(i => ideaEntryIds.includes(i.id))
    if (ideas.length) {
      lines.push('\n--- IDEAS ---')
      ideas.forEach(i => {
        lines.push(`\n${i.title || '(untitled)'}${i.group ? ` (${i.group})` : ''}`)
        if (i.description) lines.push(i.description)
        if (i.body) lines.push(i.body)
      })
    }
  }

  if (customInstruction?.trim()) {
    lines.push(`\n--- ADDITIONAL CONTEXT ---\n${customInstruction.trim()}`)
  }

  return lines.join('\n')
}
