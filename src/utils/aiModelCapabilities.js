export const UNKNOWN_CONTEXT_WINDOW = null

export const AI_CONTEXT_RESERVES = {
  systemTokens: 1200,
  userPromptTokens: 1200,
  outputTokens: 4096,
  safetyMargin: 1200,
}

export const AI_CACHE_BEHAVIOR = {
  automaticPrefix: 'automatic_prefix',
  anthropicEphemeral: 'anthropic_ephemeral',
  geminiImplicit: 'gemini_implicit',
  geminiExplicit: 'gemini_explicit',
  none: 'none',
}

export const MODEL_CAPABILITIES = {
  google: {
    provider: 'google',
    defaultContextWindow: 1048576,
    defaultMaxOutputTokens: 8192,
    supportsPromptCaching: true,
    cacheBehavior: AI_CACHE_BEHAVIOR.geminiImplicit,
    cacheMinTokens: 4096,
    labels: ['Large context'],
    models: {
      'gemini-3.6-flash': { displayName: 'Gemini 3.6 Flash', contextWindow: 1048576, maxOutputTokens: 8192, labels: ['Large context', 'Fast'], longContextThreshold: 200000, longContextPriceMultiplier: 2, pricing: { input: 2, cachedInput: 0.2, output: 12 } },
      'gemini-3.5-flash': { displayName: 'Gemini 3.5 Flash', contextWindow: 1048576, maxOutputTokens: 8192, labels: ['Large context', 'Fast'] },
      'gemini-2.5-pro': { displayName: 'Gemini 2.5 Pro', contextWindow: 1048576, maxOutputTokens: 8192, labels: ['Large context', 'Premium'] },
      'gemini-2.5-flash': { displayName: 'Gemini 2.5 Flash', contextWindow: 1048576, maxOutputTokens: 8192, labels: ['Large context', 'Fast'] },
      'gemini-2.5-flash-lite': { displayName: 'Gemini 2.5 Flash Lite', contextWindow: 1048576, maxOutputTokens: 8192, labels: ['Large context', 'Best value'] },
      'gemma-3-27b-it': { displayName: 'Gemma 3 27B', contextWindow: 131072, maxOutputTokens: 8192 },
      'gemma-3-12b-it': { displayName: 'Gemma 3 12B', contextWindow: 131072, maxOutputTokens: 8192 },
      'gemma-3-4b-it': { displayName: 'Gemma 3 4B', contextWindow: 131072, maxOutputTokens: 8192 },
    },
  },
  openrouter: {
    provider: 'openrouter',
    defaultContextWindow: 131072,
    defaultMaxOutputTokens: 4096,
    supportsPromptCaching: false,
    cacheBehavior: AI_CACHE_BEHAVIOR.none,
    models: {
      'google/gemma-3-27b-it': { displayName: 'Gemma 3 27B', contextWindow: 131072, maxOutputTokens: 4096 },
      'google/gemma-3-12b-it': { displayName: 'Gemma 3 12B', contextWindow: 131072, maxOutputTokens: 4096 },
      'google/gemma-3-4b-it': { displayName: 'Gemma 3 4B', contextWindow: 131072, maxOutputTokens: 4096 },
      'meta-llama/llama-3.3-70b-instruct': { displayName: 'Llama 3.3 70B', contextWindow: 131072, maxOutputTokens: 4096 },
      'mistralai/mistral-large': { displayName: 'Mistral Large', contextWindow: 131072, maxOutputTokens: 4096 },
      'deepseek/deepseek-r1': { displayName: 'DeepSeek R1', contextWindow: 65536, maxOutputTokens: 4096 },
      'openai/gpt-4o': { displayName: 'GPT-4o', contextWindow: 128000, maxOutputTokens: 4096, labels: ['Premium'] },
      'anthropic/claude-sonnet-4-5': { displayName: 'Claude Sonnet 4.5', contextWindow: 200000, maxOutputTokens: 8192, labels: ['Premium'] },
    },
  },
  anthropic: {
    provider: 'anthropic',
    defaultContextWindow: 200000,
    defaultMaxOutputTokens: 8192,
    supportsPromptCaching: true,
    cacheBehavior: AI_CACHE_BEHAVIOR.anthropicEphemeral,
    cacheMinTokens: 1024,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    models: {
      'claude-sonnet-4-6': { displayName: 'Claude Sonnet 4.6', contextWindow: 200000, maxOutputTokens: 8192, labels: ['Recommended'], pricing: { input: 3, cachedInput: 0.3, output: 15 } },
      'claude-opus-4-7': { displayName: 'Claude Opus 4.7', contextWindow: 200000, maxOutputTokens: 8192, labels: ['Premium'], pricing: { input: 2.5, cachedInput: 0.25, output: 12.5 } },
      'claude-haiku-4-5-20251001': { displayName: 'Claude Haiku 4.5', contextWindow: 200000, maxOutputTokens: 8192, labels: ['Fast'] },
    },
  },
  openai: {
    provider: 'openai',
    defaultContextWindow: UNKNOWN_CONTEXT_WINDOW,
    defaultMaxOutputTokens: 4096,
    supportsPromptCaching: true,
    cacheBehavior: AI_CACHE_BEHAVIOR.automaticPrefix,
    cacheMinTokens: 1024,
    models: {
      'gpt-4o': { displayName: 'GPT-4o', contextWindow: 128000, maxOutputTokens: 4096, labels: ['Premium'], pricing: { input: 2.5, cachedInput: 1.25, output: 10 } },
      'gpt-4o-mini': { displayName: 'GPT-4o mini', contextWindow: 128000, maxOutputTokens: 4096, labels: ['Best value'], pricing: { input: 0.15, cachedInput: 0.075, output: 0.6 } },
      'mistral-large-latest': { displayName: 'Mistral Large', contextWindow: 131072, maxOutputTokens: 4096 },
      'llama-3.3-70b-versatile': { displayName: 'Llama 3.3 70B (Groq)', contextWindow: 131072, maxOutputTokens: 4096, labels: ['Fast'] },
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
  const livePricing = liveModel?.pricing
  const pricing = normalizePricing(modelConfig.pricing || livePricing)
  const contextWindow = Number.isFinite(liveContext) && liveContext > 0
    ? liveContext
    : modelConfig.contextWindow ?? providerConfig.defaultContextWindow ?? UNKNOWN_CONTEXT_WINDOW
  const maxOutputTokens = modelConfig.maxOutputTokens ?? providerConfig.defaultMaxOutputTokens ?? AI_CONTEXT_RESERVES.outputTokens
  return {
    provider,
    model,
    displayName: modelConfig.displayName || liveModel?.label || liveModel?.name || model,
    contextWindow,
    maxOutputTokens,
    limitsKnown: Number.isFinite(contextWindow) && contextWindow > 0,
    supportsPromptCaching: modelConfig.supportsPromptCaching ?? providerConfig.supportsPromptCaching ?? false,
    cacheBehavior: modelConfig.cacheBehavior || providerConfig.cacheBehavior || AI_CACHE_BEHAVIOR.none,
    cacheMinTokens: modelConfig.cacheMinTokens || providerConfig.cacheMinTokens || 0,
    cacheReadMultiplier: modelConfig.cacheReadMultiplier || providerConfig.cacheReadMultiplier || 1,
    cacheWriteMultiplier: modelConfig.cacheWriteMultiplier || providerConfig.cacheWriteMultiplier || 1,
    supportsLargeContext: Number.isFinite(contextWindow) && contextWindow >= 128000,
    longContextThreshold: modelConfig.longContextThreshold || providerConfig.longContextThreshold || null,
    longContextPriceMultiplier: modelConfig.longContextPriceMultiplier || providerConfig.longContextPriceMultiplier || 1,
    contextLimitNotes: modelConfig.contextLimitNotes || providerConfig.contextLimitNotes || '',
    labels: [...new Set([...(providerConfig.labels || []), ...(modelConfig.labels || [])])],
    pricing,
    pricingKnown: Boolean(pricing),
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

function normalizePricing(pricing) {
  if (!pricing) return null
  const input = Number(pricing.input ?? pricing.prompt ?? pricing.inputPricePerMillion)
  const output = Number(pricing.output ?? pricing.completion ?? pricing.outputPricePerMillion)
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null
  const cachedInput = Number(pricing.cachedInput ?? pricing.cached_input ?? pricing.cachedInputPricePerMillion)
  return {
    currency: pricing.currency || 'USD',
    input,
    cachedInput: Number.isFinite(cachedInput) ? cachedInput : null,
    output,
    updatedAt: pricing.updatedAt || null,
  }
}

export function estimateInputCost({ provider, model, inputTokens = 0, cachedInputTokens = 0, liveModel = null } = {}) {
  const capabilities = getModelCapabilities(provider, model, liveModel)
  if (!capabilities.pricingKnown) return null
  const pricing = capabilities.pricing
  const cached = Math.max(0, Math.min(Number(cachedInputTokens) || 0, Number(inputTokens) || 0))
  const uncached = Math.max(0, (Number(inputTokens) || 0) - cached)
  const cachedRate = pricing.cachedInput ?? pricing.input
  const multiplier = capabilities.longContextThreshold && inputTokens > capabilities.longContextThreshold
    ? capabilities.longContextPriceMultiplier
    : 1
  const amount = ((uncached * pricing.input) + (cached * cachedRate)) / 1_000_000 * multiplier
  return { amount, currency: pricing.currency, inputOnly: true, pricingKnown: true }
}

export function estimateActualCost({ provider, model, inputTokens = 0, cachedInputTokens = 0, outputTokens = 0, liveModel = null } = {}) {
  const inputCost = estimateInputCost({ provider, model, inputTokens, cachedInputTokens, liveModel })
  if (!inputCost) return null
  const capabilities = getModelCapabilities(provider, model, liveModel)
  const outputAmount = ((Number(outputTokens) || 0) * capabilities.pricing.output) / 1_000_000
  return { amount: inputCost.amount + outputAmount, currency: inputCost.currency, inputOnly: false, pricingKnown: true }
}

export function getContextUsageLevel(inputTokens, contextWindow) {
  if (!Number.isFinite(inputTokens) || inputTokens <= 0) return { level: 'low', label: 'Low context' }
  const ratio = Number.isFinite(contextWindow) && contextWindow > 0 ? inputTokens / contextWindow : inputTokens / 48000
  if (ratio >= 0.75) return { level: 'very_high', label: 'Very high context' }
  if (ratio >= 0.5) return { level: 'high', label: 'High context' }
  if (ratio >= 0.18 || inputTokens > 24000) return { level: 'moderate', label: 'Moderate context' }
  return { level: 'low', label: 'Low context' }
}
