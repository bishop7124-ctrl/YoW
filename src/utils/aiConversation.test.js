import { describe, expect, it } from 'vitest'
import { promptTooLarge, estimatePromptTokens, fitMessagesToInputBudget, summarizeOlderConversation } from './aiConversation'

describe('AI conversation budgeting', () => {
  it('summarizes older conversation and keeps recent messages verbatim', () => {
    const messages = Array.from({ length: 16 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `Message ${index}`,
    }))
    const summarized = summarizeOlderConversation(messages, 4)
    expect(summarized).toHaveLength(5)
    expect(summarized[0].content).toContain('Earlier conversation summary')
    expect(summarized.at(-1).content).toBe('Message 15')
  })

  it('prevents conversation history from pushing a request over budget', () => {
    const systemPrompt = 'System instructions and stable context.'
    const messages = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `Turn ${index} ${'long text '.repeat(500)}`,
    }))
    const fitted = fitMessagesToInputBudget(messages, systemPrompt, 2500)
    expect(estimatePromptTokens(systemPrompt, fitted)).toBeLessThanOrEqual(2500)
    expect(fitted.at(-1).content).toContain('Turn 19')
  })
})


describe('promptTooLarge (audit AUD-11)', () => {
  const small = [{ role: 'user', content: 'Hello' }]
  it('is quiet when the whole request fits, or when the model limits are not known', () => {
    expect(promptTooLarge('system', small, { contextWindow: 128000, limitsKnown: true })).toBeNull()
    expect(promptTooLarge('x'.repeat(2_000_000), small, { contextWindow: 1000, limitsKnown: false })).toBeNull()
    expect(promptTooLarge('x', small, {})).toBeNull()
  })
  it('explains, without sending, when system prompt plus messages exceed the window', () => {
    const reason = promptTooLarge('x'.repeat(900_000), small, { contextWindow: 128000, limitsKnown: true })
    expect(reason).toMatch(/too large for the selected model/)
    expect(reason).toMatch(/Nothing was sent/)
    expect(promptTooLarge('system', [{ role: 'user', content: 'y'.repeat(900_000) }], { contextWindow: 128000, limitsKnown: true })).toMatch(/too large/)
  })
})
