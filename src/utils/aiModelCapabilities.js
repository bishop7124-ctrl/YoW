export const UNKNOWN_CONTEXT_WINDOW = null

export const AI_CONTEXT_RESERVES = {
  systemTokens: 1200,
  userPromptTokens: 1200,
  outputTokens: 4096,
  safetyMargin: 1200,
}

const MODEL_CAPABILITIES = {
  google: {
    defaultContextWindow: 1048576,
    defaultMaxOutputTokens: 8192,
    models: {
      'gemini-3.6-flash': { contextWindow: 1048576, maxOutputTokens: 8192 },
      'gemini-3.5-flash': { contextWindow: 1048576, maxOutputTokens: 8192 },
      'gemini-2.5-pro': { contextWindow: 1048576, maxOutputTokens: 8192 },
      'gemini-2.5-flash': { contextWindow: 1048576, maxOutputTokens: 8192 },
      'gemini-2.5-flash-lite': { contextWindow: 1048576, maxOutputTokens: 8192 },
      'gemma-3-27b-it': { contextWindow: 131072, maxOutputTokens: 8192 },
      'gemma-3-12b-it': { contextWindow: 131072, maxOutputTokens: 8192 },
      'gemma-3-4b-it': { contextWindow: 131072, maxOutputTokens: 8192 },
    },
  },
  openrouter: {
    defaultContextWindow: 131072,
    defaultMaxOutputTokens: 4096,
    models: {
      'google/gemma-3-27b-it': { contextWindow: 131072, maxOutputTokens: 4096 },
      'google/gemma-3-12b-it': { contextWindow: 131072, maxOutputTokens: 4096 },
      'google/gemma-3-4b-it': { contextWindow: 131072, maxOutputTokens: 4096 },
      'meta-llama/llama-3.3-70b-instruct': { contextWindow: 131072, maxOutputTokens: 4096 },
      'mistralai/mistral-large': { contextWindow: 131072, maxOutputTokens: 4096 },
      'deepseek/deepseek-r1': { contextWindow: 65536, maxOutputTokens: 4096 },
      'openai/gpt-4o': { contextWindow: 128000, maxOutputTokens: 4096 },
      'anthropic/claude-sonnet-4-5': { contextWindow: 200000, maxOutputTokens: 8192 },
    },
  },
  anthropic: {
    defaultContextWindow: 200000,
    defaultMaxOutputTokens: 8192,
    models: {
      'claude-sonnet-4-6': { contextWindow: 200000, maxOutputTokens: 8192 },
      'claude-opus-4-7': { contextWindow: 200000, maxOutputTokens: 8192 },
      'claude-haiku-4-5-20251001': { contextWindow: 200000, maxOutputTokens: 8192 },
    },
  },
  openai: {
    defaultContextWindow: UNKNOWN_CONTEXT_WINDOW,
    defaultMaxOutputTokens: 4096,
    models: {
      'gpt-4o': { contextWindow: 128000, maxOutputTokens: 4096 },
      'gpt-4o-mini': { contextWindow: 128000, maxOutputTokens: 4096 },
      'mistral-large-latest': { contextWindow: 131072, maxOutputTokens: 4096 },
      'llama-3.3-70b-versatile': { contextWindow: 131072, maxOutputTokens: 4096 },
    },
  },
}

export function estimateTokens(value = '') {
  const text = String(value || '')
  if (!text.trim()) return 0
  const words = text.trim().split(/\s+/).length
  return Math.max(1, Math.ceil(Math.max(text.length / 4, words * 1.25)))
}

export function getModelCapabilities(provider, model, liveModel = null) {
  const providerConfig = MODEL_CAPABILITIES[provider] || {}
  const modelConfig = providerConfig.models?.[model] || {}
  const liveContext = Number(liveModel?.contextLength || liveModel?.context_length || liveModel?.inputTokenLimit)
  const contextWindow = Number.isFinite(liveContext) && liveContext > 0
    ? liveContext
    : modelConfig.contextWindow ?? providerConfig.defaultContextWindow ?? UNKNOWN_CONTEXT_WINDOW
  const maxOutputTokens = modelConfig.maxOutputTokens ?? providerConfig.defaultMaxOutputTokens ?? AI_CONTEXT_RESERVES.outputTokens
  return {
    provider,
    model,
    contextWindow,
    maxOutputTokens,
    limitsKnown: Number.isFinite(contextWindow) && contextWindow > 0,
  }
}

export function getSafeInputBudget(provider, model, options = {}) {
  const capabilities = getModelCapabilities(provider, model, options.liveModel)
  const reserves = { ...AI_CONTEXT_RESERVES, ...(options.reserves || {}) }
  const reservedOutputTokens = Math.min(
    reserves.outputTokens,
    capabilities.maxOutputTokens || reserves.outputTokens
  )
  if (!capabilities.limitsKnown) {
    return {
      ...capabilities,
      safeInputBudget: options.fallbackBudget || 48000,
      reservedTokens: reserves.systemTokens + reserves.userPromptTokens + reservedOutputTokens + reserves.safetyMargin,
    }
  }
  const reservedTokens = reserves.systemTokens + reserves.userPromptTokens + reservedOutputTokens + reserves.safetyMargin
  return {
    ...capabilities,
    safeInputBudget: Math.max(1000, capabilities.contextWindow - reservedTokens),
    reservedTokens,
  }
}
