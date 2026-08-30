import { estimateActualCost } from './aiModelCapabilities'

export const emptyAiUsageTotals = () => ({
  requests: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedCost: 0,
  costCurrency: 'USD',
  hasCost: false,
})

const number = value => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function normalizeAiUsage(provider, rawUsage = {}, metadata = {}) {
  const usage = rawUsage || {}
  const details = usage.prompt_tokens_details || usage.input_token_details || usage.cache_creation_input_tokens || {}
  const inputTokens = number(
    usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount ?? usage.totalTokenCount - usage.candidatesTokenCount
  )
  const cachedInputTokens = number(
    usage.cached_input_tokens
      ?? details.cached_tokens
      ?? details.cache_read_input_tokens
      ?? usage.cache_read_input_tokens
      ?? usage.cachedContentTokenCount
  )
  const outputTokens = number(
    usage.output_tokens ?? usage.completion_tokens ?? usage.candidatesTokenCount
  )
  const totalTokens = number(usage.total_tokens ?? usage.totalTokenCount) || inputTokens + outputTokens
  const cost = estimateActualCost({
    provider,
    model: metadata.model,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    liveModel: metadata.liveModel,
  })
  return {
    provider,
    model: metadata.model || '',
    contextMode: metadata.contextMode || 'smart',
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    estimatedCost: cost?.amount || 0,
    costCurrency: cost?.currency || 'USD',
    hasCost: Boolean(cost),
  }
}

export function addAiUsage(totals, usage) {
  const current = totals || emptyAiUsageTotals()
  if (!usage) return current
  const next = {
    requests: current.requests + 1,
    inputTokens: current.inputTokens + number(usage.inputTokens),
    cachedInputTokens: current.cachedInputTokens + number(usage.cachedInputTokens),
    outputTokens: current.outputTokens + number(usage.outputTokens),
    totalTokens: current.totalTokens + number(usage.totalTokens),
    estimatedCost: current.estimatedCost + number(usage.estimatedCost),
    costCurrency: usage.costCurrency || current.costCurrency || 'USD',
    hasCost: current.hasCost || usage.hasCost,
  }
  return next
}

export function sanitizeAiUsageLog(entry = {}) {
  return {
    provider: entry.provider || '',
    model: entry.model || '',
    contextMode: entry.contextMode || 'smart',
    inputTokens: number(entry.inputTokens),
    cachedInputTokens: number(entry.cachedInputTokens),
    outputTokens: number(entry.outputTokens),
    totalTokens: number(entry.totalTokens),
    estimatedCost: number(entry.estimatedCost),
    costCurrency: entry.costCurrency || 'USD',
    hasCost: Boolean(entry.hasCost),
  }
}
