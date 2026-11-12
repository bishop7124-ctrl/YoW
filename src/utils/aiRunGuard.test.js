import { describe, expect, it } from 'vitest'
import { createRunGuard } from './aiRunGuard'

describe('createRunGuard', () => {
  it('gives each request its own signal and marks only the newest as current', () => {
    const guard = createRunGuard()
    const first = guard.start()
    expect(first.isCurrent()).toBe(true)
    expect(guard.active).toBe(true)
    const second = guard.start()
    expect(first.isCurrent()).toBe(false)
    expect(first.signal.aborted).toBe(true) // the old request is cancelled, not just ignored
    expect(second.isCurrent()).toBe(true)
    expect(second.signal.aborted).toBe(false)
  })

  it('stop cancels the live request and makes it stale', () => {
    const guard = createRunGuard()
    const run = guard.start()
    guard.stop()
    expect(run.signal.aborted).toBe(true)
    expect(run.isCurrent()).toBe(false)
    expect(guard.active).toBe(false)
    guard.stop() // harmless when nothing is running
  })

  it('a request started after a stop is current and independent of the stopped one', () => {
    const guard = createRunGuard()
    const old = guard.start()
    guard.stop()
    const fresh = guard.start()
    expect(old.isCurrent()).toBe(false)
    expect(fresh.isCurrent()).toBe(true)
    expect(fresh.signal.aborted).toBe(false)
  })
})
