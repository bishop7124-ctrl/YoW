// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PricingPage from './PricingPage'

vi.mock('../../supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
}))
vi.mock('../marketing/MarketingNav', () => ({ default: () => null }))
vi.mock('../marketing/MarketingFooter', () => ({ default: () => null }))
vi.mock('../marketing/SupportDevelopmentLink', () => ({ default: () => null }))
vi.mock('../account/BetaInterestModal', () => ({ default: ({ open }) => (open ? <div>interest modal</div> : null) }))

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const stubFetch = () => {
  const fetchMock = vi.fn(async url => (String(url).includes('founder-slots')
    ? { ok: true, json: async () => ({ remaining: 40, total: 100 }) }
    : { ok: true, json: async () => ({ url: 'about:blank#stripe' }) }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('pricing page launch switch', () => {
  it('registers interest and never calls checkout while the switch is off', async () => {
    const fetchMock = stubFetch()
    render(<PricingPage user={{ id: 'u1' }} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Register interest' })[0])
    expect(screen.getByText('interest modal')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('create-checkout-session'))).toBe(false)
  })

  it('opens real checkout with the chosen plan when the switch is on', async () => {
    vi.stubEnv('VITE_CHECKOUT_LIVE', 'true')
    const fetchMock = stubFetch()
    render(<PricingPage user={{ id: 'u1' }} />)
    expect(screen.queryByRole('button', { name: 'Register interest' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Choose Monthly' }))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('create-checkout-session'))
      expect(call).toBeTruthy()
      expect(JSON.parse(call[1].body)).toEqual({ plan: 'premium_monthly' })
      expect(call[1].headers.Authorization).toBe('Bearer tok')
    })
    expect(screen.queryByText('interest modal')).toBeNull()
  })

  it('asks a signed-out visitor to sign in instead of starting checkout', async () => {
    vi.stubEnv('VITE_CHECKOUT_LIVE', 'true')
    const fetchMock = stubFetch()
    const onSignIn = vi.fn()
    render(<PricingPage user={null} onSignIn={onSignIn} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose Lifetime' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Create a free account or sign in/))
    expect(onSignIn).toHaveBeenCalled()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('create-checkout-session'))).toBe(false)
  })
})
