import { describe, expect, it } from 'vitest'
import { addAiUsage, emptyAiUsageTotals, normalizeAiUsage, sanitizeAiUsageLog } from './aiUsage'
import { estimateActualCost, estimateInputCost, getContextUsageLevel } from './aiModelCapabilities'

describe('AI usage and pricing helpers', () => {
  it('parses OpenAI cached token usage', () => {
    const usage = normalizeAiUsage('openai', {
      prompt_tokens: 2000,
      completion_tokens: 300,
      total_tokens: 2300,
      prompt_tokens_details: { cached_tokens: 1200 },
    }, { model: 'gpt-4o-mini', contextMode: 'smart' })
    expect(usage.inputTokens).toBe(2000)
    expect(usage.cachedInputTokens).toBe(1200)
    expect(usage.outputTokens).toBe(300)
    expect(usage.contextMode).toBe('smart')
  })

  it('parses Gemini usage metadata', () => {
    const usage = normalizeAiUsage('google', {
      promptTokenCount: 1800,
      cachedContentTokenCount: 1000,
      candidatesTokenCount: 250,
      totalTokenCount: 2050,
    }, { model: 'gemini-3.6-flash', contextMode: 'entire_project' })
    expect(usage.inputTokens).toBe(1800)
    expect(usage.cachedInputTokens).toBe(1000)
    expect(usage.outputTokens).toBe(250)
  })

  it('totals session usage once per request', () => {
    const totals = addAiUsage(emptyAiUsageTotals(), { inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, totalTokens: 120 })
    expect(totals.requests).toBe(1)
    expect(totals.inputTokens).toBe(100)
    expect(totals.cachedInputTokens).toBe(40)
    expect(totals.outputTokens).toBe(20)
  })

  it('uses central pricing metadata and hides unknown pricing', () => {
    expect(estimateInputCost({ provider: 'openai', model: 'gpt-4o-mini', inputTokens: 1000 })?.amount).toBeGreaterThan(0)
    expect(estimateInputCost({ provider: 'openrouter', model: 'unknown-model', inputTokens: 1000 })).toBeNull()
  })

  it('accounts for cached input and output in actual cost', () => {
    const uncached = estimateActualCost({ provider: 'openai', model: 'gpt-4o-mini', inputTokens: 2000, outputTokens: 500 })?.amount
    const cached = estimateActualCost({ provider: 'openai', model: 'gpt-4o-mini', inputTokens: 2000, cachedInputTokens: 1500, outputTokens: 500 })?.amount
    expect(cached).toBeLessThan(uncached)
  })

  it('respects long-context pricing multipliers when configured', () => {
    const below = estimateInputCost({ provider: 'google', model: 'gemini-3.6-flash', inputTokens: 100000 })?.amount
    const above = estimateInputCost({ provider: 'google', model: 'gemini-3.6-flash', inputTokens: 300000 })?.amount
    expect(above).toBeGreaterThan(below * 3)
  })

  it('classifies context pressure from model size', () => {
    expect(getContextUsageLevel(1000, 128000).level).toBe('low')
    expect(getContextUsageLevel(90000, 128000).level).toBe('high')
  })

  it('does not retain secrets in sanitized usage logs', () => {
    const clean = sanitizeAiUsageLog({ provider: 'openai', apiKey: 'sk-secret', inputTokens: 5 })
    expect(JSON.stringify(clean)).not.toContain('sk-secret')
    expect(clean.inputTokens).toBe(5)
  })
})
