import { describe, it, expect } from 'vitest'
import { relativeTimeFromNow } from './relativeTime.js'

describe('relativeTimeFromNow', () => {
  const now = 1_700_000_000_000

  it('returns empty string for no timestamp', () => {
    expect(relativeTimeFromNow(null, now)).toBe('')
    expect(relativeTimeFromNow(undefined, now)).toBe('')
    expect(relativeTimeFromNow(0, now)).toBe('')
  })

  it('reports just now for sub-minute gaps', () => {
    expect(relativeTimeFromNow(now, now)).toBe('just now')
    expect(relativeTimeFromNow(now - 30_000, now)).toBe('just now')
  })

  it('reports minutes', () => {
    expect(relativeTimeFromNow(now - 60_000, now)).toBe('1 minute ago')
    expect(relativeTimeFromNow(now - 5 * 60_000, now)).toBe('5 minutes ago')
    expect(relativeTimeFromNow(now - 59 * 60_000, now)).toBe('59 minutes ago')
  })

  it('reports hours', () => {
    expect(relativeTimeFromNow(now - 60 * 60_000, now)).toBe('1 hour ago')
    expect(relativeTimeFromNow(now - 5 * 60 * 60_000, now)).toBe('5 hours ago')
    expect(relativeTimeFromNow(now - 23 * 60 * 60_000, now)).toBe('23 hours ago')
  })

  it('reports days', () => {
    expect(relativeTimeFromNow(now - 24 * 60 * 60_000, now)).toBe('1 day ago')
    expect(relativeTimeFromNow(now - 3 * 24 * 60 * 60_000, now)).toBe('3 days ago')
  })

  it('clamps future timestamps to just now instead of going negative', () => {
    expect(relativeTimeFromNow(now + 60_000, now)).toBe('just now')
  })
})
