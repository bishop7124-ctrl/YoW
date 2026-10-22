import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  registerSyncFlush,
  unregisterSyncFlush,
  runSyncFlush,
  markUnsyncedSignOut,
  consumeUnsyncedSignOut,
} from './syncFlushRegistry'

afterEach(() => {
  vi.useRealTimers()
  consumeUnsyncedSignOut()
})

describe('runSyncFlush confirmation (audit YOW-03)', () => {
  it('confirms when nothing is registered or every flushed write settled', async () => {
    expect(await runSyncFlush()).toEqual({ confirmed: true })
    const fn = vi.fn(() => Promise.resolve([{ status: 'fulfilled' }]))
    registerSyncFlush(fn)
    expect(await runSyncFlush()).toEqual({ confirmed: true })
    unregisterSyncFlush(fn)
  })

  it('does not confirm when the flush rejects', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('offline')))
    registerSyncFlush(fn)
    expect((await runSyncFlush()).confirmed).toBe(false)
    unregisterSyncFlush(fn)
  })

  it('does not confirm when any flushed write was rejected', async () => {
    const fn = vi.fn(() => Promise.resolve([{ status: 'fulfilled' }, { status: 'rejected', reason: new Error('x') }]))
    registerSyncFlush(fn)
    expect((await runSyncFlush()).confirmed).toBe(false)
    unregisterSyncFlush(fn)
  })

  it('does not confirm when the flush times out', async () => {
    vi.useFakeTimers()
    const fn = vi.fn(() => new Promise(() => {}))
    registerSyncFlush(fn)
    const pending = runSyncFlush()
    await vi.advanceTimersByTimeAsync(5000)
    expect((await pending).confirmed).toBe(false)
    unregisterSyncFlush(fn)
  })

  it('remembers an unconfirmed sign-out exactly once', () => {
    expect(consumeUnsyncedSignOut()).toBe(false)
    markUnsyncedSignOut()
    expect(consumeUnsyncedSignOut()).toBe(true)
    expect(consumeUnsyncedSignOut()).toBe(false)
  })
})
