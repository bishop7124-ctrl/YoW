// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAiRunControls } from './useAiRunControls'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useAiRunControls', () => {
  it('tracks elapsed time while a run is in progress', () => {
    const { result } = renderHook(() => useAiRunControls())

    act(() => { result.current.begin(() => {}) })
    expect(result.current.elapsedMs).toBe(0)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(1000)
  })

  it('resets elapsed time and char count on a new begin() call', () => {
    const { result } = renderHook(() => useAiRunControls())

    let ctl
    act(() => { ctl = result.current.begin(() => {}) })
    act(() => { ctl.onChunkLength(500); vi.advanceTimersByTime(2000) })
    expect(result.current.progressChars).toBe(500)
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(2000)

    act(() => { result.current.begin(() => {}) })
    expect(result.current.progressChars).toBe(0)
    expect(result.current.elapsedMs).toBe(0)
  })

  it('stops the elapsed-time interval after finish() so it does not keep ticking', () => {
    const { result } = renderHook(() => useAiRunControls())

    let ctl
    act(() => { ctl = result.current.begin(() => {}) })
    act(() => { vi.advanceTimersByTime(1000) })
    const elapsedAtFinish = result.current.elapsedMs

    act(() => { ctl.finish() })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.elapsedMs).toBe(elapsedAtFinish)
  })

  it('calls onStall and stops if no chunk arrives within the stall window', () => {
    const onStall = vi.fn()
    const { result } = renderHook(() => useAiRunControls())

    act(() => { result.current.begin(onStall) })
    act(() => { vi.advanceTimersByTime(90000) })

    expect(onStall).toHaveBeenCalledTimes(1)
  })

  it('cancel() stops the elapsed-time interval', () => {
    const { result } = renderHook(() => useAiRunControls())

    act(() => { result.current.begin(() => {}) })
    act(() => { vi.advanceTimersByTime(1000) })
    const elapsedAtCancel = result.current.elapsedMs

    act(() => { result.current.cancel() })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.elapsedMs).toBe(elapsedAtCancel)
  })
})
