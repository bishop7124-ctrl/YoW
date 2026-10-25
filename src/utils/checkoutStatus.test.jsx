// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'

beforeEach(() => { vi.resetModules() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const load = async body => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: body !== null, json: async () => body })))
  const { useCheckoutOpen } = await import('./checkoutStatus.js')
  return renderHook(() => useCheckoutOpen())
}

it('stays closed until the server says checkoutOpen is exactly true', async () => {
  const { result } = await load({ remaining: 90, checkoutOpen: false })
  await waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(result.current).toBe(false)
})

it('opens when the launch switch is on', async () => {
  const { result } = await load({ remaining: 90, checkoutOpen: true })
  await waitFor(() => expect(result.current).toBe(true))
})

it('stays closed when the endpoint fails or omits the flag', async () => {
  const failed = await load(null)
  await waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(failed.result.current).toBe(false)
  cleanup(); vi.resetModules()
  const missing = await load({ remaining: 5 })
  await waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(missing.result.current).toBe(false)
})
