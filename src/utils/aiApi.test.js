import { describe, expect, it } from 'vitest'
import { friendlyErrorMessage } from './aiApi'

describe('friendlyErrorMessage', () => {
  it('flags a 401 as an invalid/unauthorized API key and points to Settings', () => {
    const msg = friendlyErrorMessage(401, 'Incorrect API key provided')
    expect(msg).toContain('API key')
    expect(msg).toContain('AI Settings')
    expect(msg).toContain('Incorrect API key provided')
  })

  it('flags a 403 the same way as a 401', () => {
    const msg = friendlyErrorMessage(403, 'Permission denied for this model')
    expect(msg).toContain('API key')
    expect(msg).toContain('Permission denied for this model')
  })

  it('flags a 429 as a rate limit, not a broken key', () => {
    const msg = friendlyErrorMessage(429, 'Rate limit exceeded')
    expect(msg).toContain('rate-limiting')
    expect(msg).not.toContain('API key')
    expect(msg).toContain('Rate limit exceeded')
  })

  it('flags a 5xx as a provider-side outage the user cannot fix', () => {
    const msg = friendlyErrorMessage(503, 'Service unavailable')
    expect(msg).toContain('having issues')
    expect(msg).toContain('Service unavailable')
  })

  it('passes through the raw message for other status codes unchanged', () => {
    expect(friendlyErrorMessage(400, 'Bad request: missing field')).toBe('Bad request: missing field')
  })
})
