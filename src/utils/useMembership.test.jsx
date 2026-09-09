// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useMembership } from './useMembership'
afterEach(() => { cleanup(); vi.useRealTimers() })
it('moves an idle signed-in beta tab to Free at its notice deadline', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-31T11:59:59Z'))
  const user = { created_at: '2026-01-01', app_metadata: { subscription_plan: 'beta_tester', subscription_status: 'active', beta_notice_started_at: '2026-07-01T12:00:00Z' } }
  const { result } = renderHook(() => useMembership(user))
  expect(result.current.isPaid).toBe(true)
  act(() => vi.advanceTimersByTime(1001))
  expect(result.current.isFree).toBe(true)
})
