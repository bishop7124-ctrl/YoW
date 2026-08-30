import { describe, expect, it } from 'vitest'
import { buildOpenAiTokenLimit, usesMaxCompletionTokens } from './aiTokenParams.js'

describe('AI token parameter selection', () => {
  it('uses max_completion_tokens for newer OpenAI model families', () => {
    expect(buildOpenAiTokenLimit('openai', 'gpt-5', 2048)).toEqual({ max_completion_tokens: 2048 })
    expect(buildOpenAiTokenLimit('openai', 'gpt-5-mini', 2048)).toEqual({ max_completion_tokens: 2048 })
    expect(buildOpenAiTokenLimit('openai', 'o3-mini', 2048)).toEqual({ max_completion_tokens: 2048 })
    expect(buildOpenAiTokenLimit('openai', 'o4-mini', 2048)).toEqual({ max_completion_tokens: 2048 })
  })

  it('uses max_completion_tokens for OpenRouter OpenAI model aliases', () => {
    expect(usesMaxCompletionTokens('openrouter', 'openai/gpt-5')).toBe(true)
    expect(buildOpenAiTokenLimit('openrouter', 'openai/o3-mini', 1024)).toEqual({ max_completion_tokens: 1024 })
  })

  it('keeps max_tokens for legacy and non-OpenAI provider models', () => {
    expect(buildOpenAiTokenLimit('openai', 'gpt-4o', 4096)).toEqual({ max_tokens: 4096 })
    expect(buildOpenAiTokenLimit('openrouter', 'google/gemma-3-27b-it', 4096)).toEqual({ max_tokens: 4096 })
    expect(buildOpenAiTokenLimit('openrouter', 'anthropic/claude-sonnet-4-5', 4096)).toEqual({ max_tokens: 4096 })
  })

  it('falls back to a sane token limit when the supplied value is malformed', () => {
    expect(buildOpenAiTokenLimit('openai', 'gpt-5', 'nope')).toEqual({ max_completion_tokens: 4096 })
  })
})
