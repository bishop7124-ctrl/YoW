import { buildProjectTypePromptContext } from './aiToolPrompts'

export const PROVIDERS = {
  google: {
    name: 'Google AI Studio',
    keyPlaceholder: 'AIza...',
    models: [
      { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
      { id: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash' },
      { id: 'gemma-3-27b-it',        label: 'Gemma 3 27B' },
      { id: 'gemma-3-12b-it',        label: 'Gemma 3 12B' },
      { id: 'gemma-3-4b-it',         label: 'Gemma 3 4B' },
    ],
    defaultModel: 'gemini-2.0-flash',
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

export function buildSystemPrompt(novel, context, store) {
  const lines = [
    'You are a creative writing assistant embedded in Your Own World.',
    buildProjectTypePromptContext(novel),
    'Help with writing, plot, character development, world-building, and any creative task.',
  ].filter(Boolean)

  const { characterIds, locationIds, loreEntryIds, worldHistoryIds, chapterIds, customInstruction } = context

  if (characterIds?.length) {
    const chars = (store.characters || []).filter(c => characterIds.includes(c.id))
    if (chars.length) {
      lines.push('\n--- CHARACTERS ---')
      chars.forEach(c => {
        lines.push(`\n${c.name}${c.role ? ` — ${c.role}` : ''}`)
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

  if (customInstruction?.trim()) {
    lines.push(`\n--- ADDITIONAL CONTEXT ---\n${customInstruction.trim()}`)
  }

  return lines.join('\n')
}
