import { describe, expect, it } from 'vitest'
import {
  getAiModelGuidance,
  getAvailableOpenAiQuickChoices,
  isOfficialOpenAiEndpoint,
  OPENAI_QUICK_CHOICES,
} from './aiModelGuidance.js'

describe('AI model guidance', () => {
  it('recognizes the official OpenAI endpoint with or without a trailing slash', () => {
    expect(isOfficialOpenAiEndpoint('')).toBe(true)
    expect(isOfficialOpenAiEndpoint('https://api.openai.com/v1/')).toBe(true)
    expect(isOfficialOpenAiEndpoint('https://api.groq.com/openai/v1')).toBe(false)
  })

  it('only offers current quick choices that the live key can access', () => {
    expect(getAvailableOpenAiQuickChoices()).toEqual(OPENAI_QUICK_CHOICES)
    expect(getAvailableOpenAiQuickChoices([{ id: 'gpt-6-sol' }, { id: 'gpt-4o' }]))
      .toEqual([expect.objectContaining({ id: 'gpt-6-sol' })])
  })

  it('explains the main OpenAI tradeoffs in plain language', () => {
    expect(getAiModelGuidance({ provider: 'openai', model: 'gpt-6-astra' }).title).toBe('Best quality')
    expect(getAiModelGuidance({ provider: 'openai', model: 'gpt-6-sol' }).title).toBe('Best balance')
    expect(getAiModelGuidance({ provider: 'openai', model: 'gpt-6-luna' }).title).toBe('Lowest cost')
  })

  it('warns when a specialist model is selected for YOW text features', () => {
    const guidance = getAiModelGuidance({ provider: 'openai', model: 'text-embedding-3-large' })
    expect(guidance.kind).toBe('warning')
    expect(guidance.description).toContain('general-purpose text model')
  })
})
