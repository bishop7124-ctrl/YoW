// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearLastWebActivity,
  isWebSessionIdleExpired,
  readLastWebActivity,
  WEB_IDLE_LOGOUT_MS,
  WEB_LAST_ACTIVITY_KEY,
  writeLastWebActivity,
} from './sessionActivity'

describe('session activity helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('treats a missing timestamp as active now', () => {
    expect(readLastWebActivity(1000)).toBe(1000)
    expect(isWebSessionIdleExpired(1000)).toBe(false)
  })

  it('detects a web session that has been idle for at least 24 hours', () => {
    localStorage.setItem(WEB_LAST_ACTIVITY_KEY, String(5000))
    expect(isWebSessionIdleExpired(5000 + WEB_IDLE_LOGOUT_MS - 1)).toBe(false)
    expect(isWebSessionIdleExpired(5000 + WEB_IDLE_LOGOUT_MS)).toBe(true)
  })

  it('writes and clears the last activity timestamp', () => {
    writeLastWebActivity(1234)
    expect(localStorage.getItem(WEB_LAST_ACTIVITY_KEY)).toBe('1234')
    clearLastWebActivity()
    expect(localStorage.getItem(WEB_LAST_ACTIVITY_KEY)).toBe(null)
  })
})
