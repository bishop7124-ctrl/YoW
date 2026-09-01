// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { WEB_IDLE_LOGOUT_MS, WEB_LAST_ACTIVITY_KEY } from '../utils/sessionActivity'
import { supabase } from '../supabase'
import { trackEvent } from '../utils/analytics'

const mocks = vi.hoisted(() => ({
  desktop: false,
  session: null,
  authCallback: null,
}))

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: mocks.session }, error: null })),
      onAuthStateChange: vi.fn((callback) => {
        mocks.authCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signInWithPassword: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null })),
      signInWithOAuth: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      refreshSession: vi.fn(() => Promise.resolve({ data: { session: mocks.session }, error: null })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: mocks.session?.user ?? null }, error: null })),
      updateUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null })),
    },
    rpc: vi.fn(),
  },
}))

vi.mock('../utils/runtime', () => ({
  isDesktopAppRuntime: vi.fn(() => mocks.desktop),
}))

vi.mock('../utils/offlineMock', () => ({
  OFFLINE_MODE: false,
  OFFLINE_USER: { id: 'offline-user' },
}))

vi.mock('../utils/firestoreSync', () => ({
  deleteAllUserData: vi.fn(),
}))

vi.mock('../store/syncFlushRegistry', () => ({
  runSyncFlush: vi.fn(() => Promise.resolve()),
}))

vi.mock('../utils/aiSettings', () => ({
  clearAiSettings: vi.fn(),
  clearAiSettingsForOtherUser: vi.fn(),
}))

vi.mock('../utils/analytics', () => ({
  trackEvent: vi.fn(),
  identifyUser: vi.fn(),
}))

function Probe() {
  const { user, signIn, updateProfile } = useAuth()
  return (
    <>
      <div data-testid="user-id">{user?.id || 'signed-out'}</div>
      <button type="button" onClick={() => signIn('writer@example.com', 'password')}>Sign in</button>
      <button type="button" onClick={() => updateProfile({
        full_name: 'Writer',
        subscription_plan: 'founder',
        subscription_status: 'active',
        beta_tester: true,
      })}>Update profile</button>
    </>
  )
}

describe('AuthProvider session policy', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    mocks.desktop = false
    mocks.session = null
    mocks.authCallback = null
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('auto-logs out stale browser sessions', async () => {
    localStorage.setItem(WEB_LAST_ACTIVITY_KEY, String(Date.now() - WEB_IDLE_LOGOUT_MS - 1000))
    mocks.session = { user: { id: 'user-1' }, expires_at: Math.floor(Date.now() / 1000) + 3600 }

    render(<AuthProvider><Probe /></AuthProvider>)

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled())
    expect(screen.getByTestId('user-id').textContent).toBe('signed-out')
    expect(trackEvent).toHaveBeenCalledWith('auto_logout_idle', { idle_hours: 24, platform: 'web' })
  })

  it('does not auto-log out stale desktop sessions', async () => {
    mocks.desktop = true
    localStorage.setItem(WEB_LAST_ACTIVITY_KEY, String(Date.now() - WEB_IDLE_LOGOUT_MS - 1000))
    mocks.session = { user: { id: 'user-1' }, expires_at: Math.floor(Date.now() / 1000) + 3600 }

    render(<AuthProvider><Probe /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('user-1'))
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith('session_restored', { platform: 'desktop' })
  })

  it('tracks explicit password login separately from restored sessions', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)

    await act(async () => {
      screen.getByRole('button', { name: 'Sign in' }).click()
    })

    expect(trackEvent).toHaveBeenCalledWith('explicit_login', { method: 'password', platform: 'web' })
    expect(trackEvent).toHaveBeenCalledWith('login', { method: 'password' })
    expect(trackEvent).toHaveBeenCalledWith('authenticated_app_open', { platform: 'web', auth_source: 'explicit_login' })
  })

  it('does not send entitlement fields through the client profile update path', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)

    await act(async () => {
      screen.getByRole('button', { name: 'Update profile' }).click()
    })

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({
      data: { full_name: 'Writer' },
    })
  })
})
