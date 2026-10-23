// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MaintenancePayButton } from './AccountSettings'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@example.com' }, refreshUser: vi.fn(), getAccessToken: async () => 'tok' }),
}))
vi.mock('../../utils/externalLinks', () => ({ navigateToExternalUrl: vi.fn().mockResolvedValue('same-window') }))
vi.mock('./BetaInterestModal', () => ({ default: ({ open }) => (open ? <div>interest modal</div> : null) }))

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Cloud renewal button launch switch', () => {
  it('registers interest while the switch is off', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<MaintenancePayButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Register interest in Cloud Mode renewal' }))
    expect(screen.getByText('interest modal')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('starts the GBP 6 renewal checkout when the switch is on', async () => {
    vi.stubEnv('VITE_CHECKOUT_LIVE', 'true')
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ url: 'https://checkout.example/session' }) }))
    vi.stubGlobal('fetch', fetchMock)
    render(<MaintenancePayButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Renew Cloud Mode (£6/year)' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('create-checkout-session')
    expect(JSON.parse(init.body)).toMatchObject({ plan: 'hosting_renewal' })
    expect(screen.queryByText('interest modal')).toBeNull()
  })
})
