import { describe, expect, it } from 'vitest'
import { createAccountLoadGuard } from './accountLoadGuard'

describe('account load guard (audit YOW-05)', () => {
  it('keeps a load current while the same account stays signed in, across effect re-runs', () => {
    const guard = createAccountLoadGuard()
    const first = guard.begin('user-a')
    const rerun = guard.begin('user-a')
    expect(rerun).toBe(first)
    expect(guard.isCurrent(first)).toBe(true)
  })

  it('invalidates an in-flight load when the account signs out', () => {
    const guard = createAccountLoadGuard()
    const token = guard.begin('user-a')
    guard.invalidate()
    expect(guard.isCurrent(token)).toBe(false)
  })

  it('invalidates account A\'s load when account B signs in, even without a sign-out in between', () => {
    const guard = createAccountLoadGuard()
    const a = guard.begin('user-a')
    const b = guard.begin('user-b')
    expect(guard.isCurrent(a)).toBe(false)
    expect(guard.isCurrent(b)).toBe(true)
  })

  it('does not revive A\'s old load when A signs back in', () => {
    const guard = createAccountLoadGuard()
    const firstA = guard.begin('user-a')
    guard.invalidate()
    const secondA = guard.begin('user-a')
    expect(guard.isCurrent(firstA)).toBe(false)
    expect(guard.isCurrent(secondA)).toBe(true)
  })
})
