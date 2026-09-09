import { describe, expect, it } from 'vitest'
import { estimatePromptTokens, fitMessagesToInputBudget, summarizeOlderConversation } from './aiConversation'

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
