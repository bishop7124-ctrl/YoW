import { buildProjectTypePromptContext } from './aiToolPrompts'

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
    // Starter/fallback list only — Google retires Gemini model IDs on a few
    // months' notice (2.0 Flash and Flash-Lite were shut down June 2026; the
    // 2.5 line is slated for October 2026) and ships new ones just as fast.
    // fetchGoogleModels() below pulls the real, current, key-scoped catalog;
    // this list is what renders before that resolves or if it fails.
    models: [
      { id: 'gemini-3.5-flash',           label: 'Gemini 3.5 Flash' },
      { id: 'gemini-2.5-pro',             label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash',           label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite',      label: 'Gemini 2.5 Flash Lite' },
      { id: 'gemma-3-27b-it',             label: 'Gemma 3 27B' },
      { id: 'gemma-3-12b-it',             label: 'Gemma 3 12B' },
      { id: 'gemma-3-4b-it',              label: 'Gemma 3 4B' },
    ],
    defaultModel: 'gemini-2.5-flash',
  },
  openrouter: {
    name: 'OpenRouter',
    keyPlaceholder: 'sk-or-...',
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
    const res = await fetch('https://openrouter.ai/api/v1/models')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
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
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return (data?.models || [])
      .filter(m => m.supportedGenerationMethods?.some(g => g === 'generateContent' || g === 'streamGenerateContent'))
      .map(m => ({ id: (m.name || '').replace(/^models\//, ''), label: m.displayName || m.name, contextLength: m.inputTokenLimit }))
      .filter(m => m.id)
      .sort((a, b) => a.label.localeCompare(b.label))
  })
}

// Anthropic: /v1/models needs the same direct-browser-access header the
// streaming call below uses; cache per key since access varies by account.
export function fetchAnthropicModels(apiKey) {
  if (!apiKey) return Promise.reject(new Error('An API key is required to load Anthropic\'s live model list.'))
  return cachedModelFetch(`anthropic:${apiKey}`, async () => {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
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

export function friendlyErrorMessage(status, rawMessage) {
  if (status === 401 || status === 403) {
    return `Your API key looks invalid or doesn't have permission for this model. Check it in AI Settings. (${rawMessage})`
  }
  if (status === 429) {
    return `The AI provider is rate-limiting requests — wait a moment and try again. (${rawMessage})`
  }
  if (status >= 500) {
    return `The AI provider is having issues right now — this isn't something you can fix, try again shortly. (${rawMessage})`
  }
  return rawMessage
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

async function streamAnthropic({ apiKey, model, systemPrompt, messages, onChunk, onDone, onError, maxTokens = 4096, signal }) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, stream: true, system: systemPrompt, messages }),
      signal,
    })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try { const d = await res.json(); msg = d.error?.message || msg } catch { /* ignore */ }
      return onError(friendlyErrorMessage(res.status, msg))
    }
    let done = false
    const onceDone = () => { if (!done) { done = true; onDone() } }
    await readSSE(res.body, (parsed) => {
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') onChunk(parsed.delta.text)
      if (parsed.type === 'message_stop') { onceDone(); return true }
    })
    onceDone()
  } catch (e) { if (e.name !== 'AbortError') onError(`Couldn't reach the AI provider — check your connection and try again. (${e.message || 'Network error'})`) }
}

async function streamGoogle({ apiKey, model, systemPrompt, messages, onChunk, onDone, onError, jsonMode, maxTokens = 4096, signal }) {
  try {
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const generationConfig = { maxOutputTokens: maxTokens }
    if (jsonMode) generationConfig.response_mime_type = 'application/json'
    const body = { contents, generationConfig }
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try { const d = await res.json(); msg = d.error?.message || msg } catch { /* ignore */ }
      return onError(friendlyErrorMessage(res.status, msg))
    }
    let done = false
    const onceDone = () => { if (!done) { done = true; onDone() } }
    await readSSE(res.body, (parsed) => {
      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) onChunk(text)
      if (parsed.candidates?.[0]?.finishReason === 'STOP') { onceDone(); return true }
    })
    onceDone()
  } catch (e) { if (e.name !== 'AbortError') onError(`Couldn't reach the AI provider — check your connection and try again. (${e.message || 'Network error'})`) }
}

async function streamOpenAI({ apiKey, model, baseUrl, extraHeaders, systemPrompt, messages, onChunk, onDone, onError, maxTokens = 4096, signal }) {
  try {
    const url        = `${(baseUrl || PROVIDERS.openai.defaultBaseUrl).replace(/\/$/, '')}/chat/completions`
    const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages]
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...extraHeaders },
      body: JSON.stringify({ model, max_tokens: maxTokens, stream: true, messages: apiMessages }),
      signal,
    })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try { const d = await res.json(); msg = d.error?.message || msg } catch { /* ignore */ }
      return onError(friendlyErrorMessage(res.status, msg))
    }
    let done = false
    const onceDone = () => { if (!done) { done = true; onDone() } }
    await readSSE(res.body, (parsed) => {
      const text = parsed.choices?.[0]?.delta?.content
      if (text) onChunk(text)
      if (parsed.choices?.[0]?.finish_reason === 'stop') { onceDone(); return true }
    })
    onceDone()
  } catch (e) { if (e.name !== 'AbortError') onError(`Couldn't reach the AI provider — check your connection and try again. (${e.message || 'Network error'})`) }
}

// ── Public API ────────────────────────────────────────────────────────────────

import { OFFLINE_MODE, mockStreamMessage } from './offlineMock'

export function streamMessage({ provider, apiKey, model, baseUrl, systemPrompt, messages, onChunk, onDone, onError, jsonMode, maxTokens, signal }) {
  if (OFFLINE_MODE)         return mockStreamMessage({ onChunk, onDone, onError })
  if (!apiKey)              return onError('No API key configured.')
  if (provider === 'anthropic')   return streamAnthropic({ apiKey, model, systemPrompt, messages, onChunk, onDone, onError, maxTokens, signal })
  if (provider === 'google')      return streamGoogle({ apiKey, model, systemPrompt, messages, onChunk, onDone, onError, jsonMode, maxTokens, signal })
  if (provider === 'openrouter')  return streamOpenAI({
    apiKey, model, systemPrompt, messages, onChunk, onDone, onError, maxTokens, signal,
    baseUrl: 'https://openrouter.ai/api/v1',
    extraHeaders: { 'HTTP-Referer': 'https://yow.app', 'X-Title': 'Your Own World' },
  })
  if (provider === 'openai')      return streamOpenAI({ apiKey, model, baseUrl, systemPrompt, messages, onChunk, onDone, onError, maxTokens, signal })
  onError(`Unknown provider: ${provider}`)
}

export function buildSystemPrompt(novel, context, store, agentDirective) {
  const lines = [
    'You are a creative writing assistant embedded in Your Own World.',
    buildProjectTypePromptContext(novel),
    agentDirective?.trim() || DEFAULT_CREATIVE_CHAT_DIRECTIVE,
  ].filter(Boolean)

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
