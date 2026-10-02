const OPENAI_MAX_COMPLETION_TOKEN_FAMILIES = [
  // GPT-5 introduced max_completion_tokens and subsequent GPT generations
  // retain it. Match the numeric generation rather than maintaining a list
  // that becomes stale each time OpenAI ships a new family (the previous
  // GPT-5-only match caused GPT-6 AI Import requests to send max_tokens).
  /^gpt-(?:[5-9]|[1-9]\d+)(?:$|[-.:/])/i,
  /^o\d+(?:$|[-.:/])/i,
]

function normalizeModelId(model = '') {
  return String(model || '').trim()
}

function normalizeOpenRouterModelId(model = '') {
  return normalizeModelId(model).replace(/^openai\//i, '')
}

export function usesMaxCompletionTokens(provider, model) {
  const normalized = normalizeModelId(model)
  const modelId = provider === 'openrouter'
    ? normalizeOpenRouterModelId(model)
    : normalized
  if (provider !== 'openai' && !(provider === 'openrouter' && /^openai\//i.test(normalized))) {
    return false
  }
  return OPENAI_MAX_COMPLETION_TOKEN_FAMILIES.some(pattern => pattern.test(modelId))
}

export function buildOpenAiTokenLimit(provider, model, maxTokens) {
  const tokenLimit = Number(maxTokens)
  const safeMaxTokens = Number.isFinite(tokenLimit) && tokenLimit > 0 ? tokenLimit : 4096
  return usesMaxCompletionTokens(provider, model)
    ? { max_completion_tokens: safeMaxTokens }
    : { max_tokens: safeMaxTokens }
}
