import { describe, it, expect } from 'vitest'
import { checkRateLimit, validateFeedbackBody } from './submit-feedback.js'

const validBody = { type: 'support', title: 'Hello', message: 'Something broke.' }

describe('validateFeedbackBody', () => {
  it('accepts a normal submission', () => {
    expect(validateFeedbackBody(validBody)).toBeNull()
    expect(validateFeedbackBody({ ...validBody, email: 'a@b.co', name: 'Mo', category: 'Bug' })).toBeNull()
  })

  it('rejects missing required fields', () => {
    expect(validateFeedbackBody({})).toBe('Missing required fields.')
    expect(validateFeedbackBody({ ...validBody, title: '   ' })).toBe('Missing required fields.')
    expect(validateFeedbackBody(null)).toBe('Missing required fields.')
  })

  it('rejects over-length fields', () => {
    expect(validateFeedbackBody({ ...validBody, title: 'x'.repeat(201) })).toMatch(/"title" is too long/)
    expect(validateFeedbackBody({ ...validBody, message: 'x'.repeat(8001) })).toMatch(/"message" is too long/)
    expect(validateFeedbackBody({ ...validBody, email: 'x'.repeat(255) })).toMatch(/"email" is too long/)
    expect(validateFeedbackBody({ ...validBody, name: 'x'.repeat(121) })).toMatch(/"name" is too long/)
    expect(validateFeedbackBody({ ...validBody, category: 'x'.repeat(101) })).toMatch(/"category" is too long/)
  })

  it('accepts fields exactly at the limit', () => {
    expect(validateFeedbackBody({ ...validBody, title: 'x'.repeat(200), message: 'x'.repeat(8000) })).toBeNull()
  })
})

describe('checkRateLimit', () => {
  it('allows up to 5 submissions per hour per IP, then blocks', () => {
    const buckets = new Map()
    const now = 1_000_000_000
    for (let i = 0; i < 5; i++) expect(checkRateLimit('1.2.3.4', now + i, buckets)).toBe(true)
    expect(checkRateLimit('1.2.3.4', now + 10, buckets)).toBe(false)
    // different IP is unaffected
    expect(checkRateLimit('5.6.7.8', now + 10, buckets)).toBe(true)
  })

  it('frees the window after an hour', () => {
    const buckets = new Map()
    const now = 1_000_000_000
    for (let i = 0; i < 5; i++) checkRateLimit('1.2.3.4', now, buckets)
    expect(checkRateLimit('1.2.3.4', now + 1, buckets)).toBe(false)
    expect(checkRateLimit('1.2.3.4', now + 60 * 60 * 1000 + 1, buckets)).toBe(true)
  })
})
