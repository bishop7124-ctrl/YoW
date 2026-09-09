const OPENAI_MAX_COMPLETION_TOKEN_FAMILIES = [
  /^gpt-5(?:$|[-.:/])/i,
  /^o[134](?:$|[-.:/])/i,
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
