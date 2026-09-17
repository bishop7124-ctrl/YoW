// @vitest-environment jsdom
import { useEffect, useRef } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { presenceHasPriority } from './useTabPresence.js'

describe('presenceHasPriority', () => {
  it('gives the scene lease to the editor that arrived first', () => {
    expect(presenceHasPriority(
      { id: 'later', startedAt: 200 },
      { id: 'earlier', startedAt: 100 },
    )).toBe(true)
    expect(presenceHasPriority(
      { id: 'earlier', startedAt: 100 },
      { id: 'later', startedAt: 200 },
    )).toBe(false)
  })

  it('uses the tab id as a deterministic tie-breaker', () => {
    expect(presenceHasPriority(
      { id: 'tab-b', startedAt: 100 },
      { id: 'tab-a', startedAt: 100 },
    )).toBe(true)
  })
})

// Regression coverage for the real `useTabPresence` hook's React lifecycle —
// SceneEditor.test.jsx deliberately mocks this hook out to a plain
// controllable number (`vi.mock('../../utils/useTabPresence.js', ...)`), so
// it can never exercise the hook's own state across repeated focus/blur
// "sittings" of the same mounted SceneEditor. Two independent module
// instances (via vi.resetModules + dynamic import) stand in for two real
// browser tabs, communicating over a real (Node-global) BroadcastChannel —
// the same mechanism two actual tabs use — rather than a mock.
async function loadIsolatedTabModule() {
  vi.resetModules()
  // getTabId() persists its random id in sessionStorage, which (unlike the
  // module registry) is a real jsdom `window` global shared across dynamic
  // re-imports within one test — without clearing it first, a second
  // simulated "tab" would read back the first tab's id and both would agree
  // they're the same tab, so the real module's own `id === tabId` self-check
  // would make each ignore the other's messages entirely.
  sessionStorage.removeItem('yow-tab-presence-id')
  return import('./useTabPresence.js')
}

// Mirrors the exact consumption pattern SceneEditor.jsx uses: read the
// hook's count, and in an effect that also watches `active`, latch a
// "blocked" callback once per active sitting (SceneEditor's own
// `warnedThisFocusRef`), resetting the latch when a sitting ends.
function useBlockedLatch(usePresence, key, active, onBlocked) {
  const otherEditorsCount = usePresence(key, active)
  const warnedRef = useRef(false)
  useEffect(() => {
    if (!active) { warnedRef.current = false; return }
    if (otherEditorsCount > 0 && !warnedRef.current) {
      warnedRef.current = true
      onBlocked()
    }
  }, [active, otherEditorsCount, onBlocked])
  return otherEditorsCount
}

describe('useTabPresence (real BroadcastChannel, two simulated tabs)', () => {
  it('does not re-block a later sitting with a stale count once the other tab has actually released the key', async () => {
    const key = `scene:regression-${Math.random()}`
    const { useTabPresence: useTabA } = await loadIsolatedTabModule()
    const { useTabPresence: useTabB } = await loadIsolatedTabModule()

    const onBlockedA = vi.fn()
    const onBlockedB = vi.fn()

    const tabA = renderHook(
      ({ active }) => useBlockedLatch(useTabA, key, active, onBlockedA),
      { initialProps: { active: false } },
    )
    const tabB = renderHook(
      ({ active }) => useBlockedLatch(useTabB, key, active, onBlockedB),
      { initialProps: { active: false } },
    )

    // Tab A focuses first.
    act(() => { tabA.rerender({ active: true }) })
    // Tab B focuses the same key shortly after and should be blocked once
    // A's heartbeat reply actually arrives (a real async BroadcastChannel
    // round trip, not a microtask — matches browserVaultAdapter.test.js's
    // own documented behavior for this channel).
    act(() => { tabB.rerender({ active: true }) })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    expect(onBlockedB).toHaveBeenCalledTimes(1)
    expect(onBlockedA).not.toHaveBeenCalled()

    // Tab B backs off (its own "Return to read-only").
    act(() => { tabB.rerender({ active: false } ) })
    onBlockedB.mockClear()

    // Tab A releases the key entirely (blurs the scene).
    act(() => { tabA.rerender({ active: false }) })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

    // Tab B focuses again in a brand-new sitting. Nobody is editing any
    // more, so this must NOT be blocked — asserted on the very next
    // synchronous render, before any fresh BroadcastChannel round trip could
    // possibly correct a stale value, which is exactly the gap the bug lived
    // in: SceneEditor's own conflict-detection effect reads the count on
    // that same first render, one render before the presence hook's own
    // `refresh()` call could ever update it.
    act(() => { tabB.rerender({ active: true }) })
    expect(onBlockedB).not.toHaveBeenCalled()

    // ...and stays unblocked once everything settles, too.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    expect(onBlockedB).not.toHaveBeenCalled()

    act(() => { tabA.rerender({ active: false }) })
    act(() => { tabB.rerender({ active: false }) })
    tabA.unmount()
    tabB.unmount()
  })
})
