import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { OFFLINE_MODE, OFFLINE_USER } from '../utils/offlineMock'
import { deleteAllUserData } from '../utils/firestoreSync'
import { runSyncFlush } from '../store/syncFlushRegistry'
import { clearAiSettings, clearAiSettingsForOtherUser } from '../utils/aiSettings'
import { trackEvent, identifyUser } from '../utils/analytics'
import { isDesktopAppRuntime } from '../utils/runtime'
import { clearLastWebActivity, isWebSessionIdleExpired, writeLastWebActivity } from '../utils/sessionActivity'

const AuthContext = createContext({ user: null, loading: false, recoveryMode: false, signUp: () => {}, signIn: () => {}, signInWithGoogle: () => {}, signOut: () => {}, updateProfile: () => {}, refreshUser: () => null, getAccessToken: () => null, resetPassword: () => {}, updatePassword: () => {}, clearRecoveryMode: () => {} })

// Read the cached Supabase session from localStorage synchronously so the app
// renders immediately on return visits without waiting for a network round-trip.
function readCachedUser() {
  try {
    if (!isDesktopAppRuntime() && isWebSessionIdleExpired()) return null
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
    if (!key) return null
    const { user, expires_at } = JSON.parse(localStorage.getItem(key)) ?? {}
    if (expires_at && expires_at * 1000 < Date.now()) return null
    return user ?? null
  } catch { return null }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(OFFLINE_MODE ? OFFLINE_USER : readCachedUser)
  const [loading] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(
    () => typeof window !== 'undefined' && window.location.hash.includes('type=recovery')
  )

  useEffect(() => {
    if (OFFLINE_MODE) return
    const desktopApp = isDesktopAppRuntime()
    let idleSignOutStarted = false

    const idleSignOut = async () => {
      if (idleSignOutStarted) return
      idleSignOutStarted = true
      trackEvent('auto_logout_idle', { idle_hours: 24, platform: 'web' })
      clearAiSettings()
      clearLastWebActivity()
      setUser(null)
      await supabase.auth.signOut().catch(() => null)
    }

    // Exchange PKCE code from email confirmation/magic links before reading session
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(() => window.history.replaceState({}, '', window.location.pathname))
        .catch(console.warn)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !desktopApp && isWebSessionIdleExpired()) {
        idleSignOut()
        return
      }
      clearAiSettingsForOtherUser(session?.user?.id || null)
      identifyUser(session?.user?.id || null)
      setUser(session?.user ?? null)
      if (session?.user?.id) {
        if (!desktopApp) writeLastWebActivity()
        trackEvent('session_restored', { platform: desktopApp ? 'desktop' : 'web' })
        trackEvent('authenticated_app_open', { platform: desktopApp ? 'desktop' : 'web', auth_source: 'stored_session' })
      }
    }).catch(console.warn)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && !desktopApp && isWebSessionIdleExpired()) {
        idleSignOut()
        return
      }
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true)
        setUser(session?.user ?? null)
      } else if (event === 'SIGNED_OUT') {
        setRecoveryMode(false)
        clearAiSettings()
        setUser(null)
      } else {
        // Don't clear recoveryMode here — SIGNED_IN fires right after PASSWORD_RECOVERY
        clearAiSettingsForOtherUser(session?.user?.id || null)
        identifyUser(session?.user?.id || null)
        setUser(session?.user ?? null)
        if (session?.user?.id && !desktopApp) writeLastWebActivity()
        // Fire welcome email after email confirmation is complete (PKCE flow)
        if (event === 'SIGNED_IN' && session?.user?.email_confirmed_at && session.user.id) {
          const confirmedJustNow = new Date(session.user.email_confirmed_at) > new Date(Date.now() - 30_000)
          if (confirmedJustNow) sendWelcomeEmail(session.user.id, session.user.email, session.access_token)
        }
        if (event === 'SIGNED_IN' && session?.user?.id && sessionStorage.getItem('yow_oauth_login_pending') === 'google') {
          sessionStorage.removeItem('yow_oauth_login_pending')
          trackEvent('explicit_login', { method: 'google', platform: desktopApp ? 'desktop' : 'web' })
          trackEvent('login', { method: 'google' })
          trackEvent('authenticated_app_open', { platform: desktopApp ? 'desktop' : 'web', auth_source: 'explicit_login' })
        }
      }
    })

    if (desktopApp) return () => subscription.unsubscribe()

    let lastActivityWrite = 0
    const recordActivity = () => {
      const now = Date.now()
      if (now - lastActivityWrite < 60_000) return
      lastActivityWrite = writeLastWebActivity(now)
    }
    const checkIdleExpiry = () => {
      if (isWebSessionIdleExpired()) idleSignOut()
    }
    const handleVisibilityOrFocus = () => {
      if (isWebSessionIdleExpired()) {
        idleSignOut()
        return
      }
      recordActivity()
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    events.forEach(eventName => window.addEventListener(eventName, recordActivity, { passive: true }))
    window.addEventListener('focus', handleVisibilityOrFocus)
    document.addEventListener('visibilitychange', handleVisibilityOrFocus)
    const idleTimer = window.setInterval(checkIdleExpiry, 60_000)

    return () => {
      subscription.unsubscribe()
      events.forEach(eventName => window.removeEventListener(eventName, recordActivity))
      window.removeEventListener('focus', handleVisibilityOrFocus)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      window.clearInterval(idleTimer)
    }
  }, [])

  // Sends the caller's own session token, not the (public) anon key — the
  // Edge Function verifies it and derives the account's real user id/email
  // from the token itself rather than trusting anything in the request body
  // (audit finding P0-03: this previously let any caller with the public
  // anon key request a "welcome" email, with an arbitrary user_id/email of
  // their choosing, sent through YOW's Resend account).
  async function sendWelcomeEmail(userId, email, accessToken) {
    if (OFFLINE_MODE || !accessToken) return
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ record: { user_id: userId, email } }),
      })
      console.log('[welcome] response', res.status)
    } catch (e) { console.error('[welcome] error', e) }
  }

  const signUp = OFFLINE_MODE
    ? () => { setUser(OFFLINE_USER); return Promise.resolve({ data: { user: OFFLINE_USER }, error: null }) }
    : async (email, password) => {
        const result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/` } })
        if (!result.error) trackEvent('sign_up', { method: 'password' })
        return result
      }

  const resendConfirmation = OFFLINE_MODE
    ? () => Promise.resolve({ error: null })
    : async (email) => {
        const result = await supabase.auth.resend({ type: 'signup', email })
        return result
      }

  const signIn = OFFLINE_MODE
    ? () => { setUser(OFFLINE_USER); return Promise.resolve({ data: { user: OFFLINE_USER }, error: null }) }
    : async (email, password) => {
        sessionStorage.removeItem('yow_oauth_login_pending')
        const result = await supabase.auth.signInWithPassword({ email, password })
        if (!result.error && result.data?.user?.id) {
          if (!isDesktopAppRuntime()) writeLastWebActivity()
          trackEvent('explicit_login', { method: 'password', platform: isDesktopAppRuntime() ? 'desktop' : 'web' })
          trackEvent('login', { method: 'password' })
          trackEvent('authenticated_app_open', { platform: isDesktopAppRuntime() ? 'desktop' : 'web', auth_source: 'explicit_login' })
        }
        return result
      }

  const signInWithGoogle = OFFLINE_MODE
    ? () => { setUser(OFFLINE_USER); return Promise.resolve({ data: {}, error: null }) }
    : () => {
        sessionStorage.setItem('yow_oauth_login_pending', 'google')
        return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
          .then(result => {
            if (result.error) sessionStorage.removeItem('yow_oauth_login_pending')
            return result
          })
      }

  const signOut = OFFLINE_MODE
    ? () => { clearAiSettings(); setUser(null); return Promise.resolve() }
    : async () => {
        // Send any still-debounced cloud writes (e.g. a character created a
        // moment ago) while the session is still valid — once signed out,
        // the store wipes its local cache and the same writes would go out
        // unauthenticated and be silently dropped, losing the edit for good.
        await runSyncFlush()
        clearAiSettings()
        if (!isDesktopAppRuntime()) clearLastWebActivity()
        const { error } = await supabase.auth.signOut().catch(() => ({ error: true }))
        if (error) {
          // Network timeout or error — clear session locally so the UI still signs out
          const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
          if (storageKey) localStorage.removeItem(storageKey)
          setUser(null)
        }
        trackEvent('manual_logout', { platform: isDesktopAppRuntime() ? 'desktop' : 'web' })
      }

  const resetPassword = OFFLINE_MODE
    ? () => Promise.resolve({ data: null, error: null })
    : async (email) => {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reset-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ email, redirectTo: `${window.location.origin}/login` }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          return { data: null, error: { message: body.error || 'Failed to send reset email' } }
        }
        return { data: null, error: null }
      }

  const updatePassword = OFFLINE_MODE
    ? () => Promise.resolve({ data: null, error: null })
    : (password) => supabase.auth.updateUser({ password })

  const clearRecoveryMode = () => setRecoveryMode(false)

  const updateProfile = OFFLINE_MODE
    ? (profile) => {
        const updated = { ...user, user_metadata: { ...(user?.user_metadata ?? {}), ...profile } }
        setUser(updated)
        return Promise.resolve(updated)
      }
    : async (profile) => {
        const { data, error } = await supabase.auth.updateUser({ data: profile })
        if (error) throw error
        setUser(data.user ?? null)
        return data.user
      }

  const refreshUser = OFFLINE_MODE
    ? () => Promise.resolve(user)
    : async () => {
        const { data: { session }, error: sessionError } = await supabase.auth.refreshSession()
        if (sessionError) throw sessionError
        if (session?.user) {
          setUser(session.user)
          return session.user
        }
        const { data: { user: nextUser }, error } = await supabase.auth.getUser()
        if (error) throw error
        setUser(nextUser ?? null)
        return nextUser
      }

  const getAccessToken = OFFLINE_MODE
    ? () => Promise.resolve('offline-mock-token')
    : async () => {
        const { data: { session } } = await supabase.auth.getSession()
        return session?.access_token ?? null
      }

  const deleteAccount = OFFLINE_MODE
    ? async () => { setUser(null) }
    : async () => {
        const currentUser = user
        if (!currentUser) throw new Error('No user is signed in.')
        await deleteAllUserData(currentUser.id)
        // Attempt server-side auth deletion via RPC
        const { error: rpcError } = await supabase.rpc('delete_user')
        if (rpcError) throw new Error(`Account deletion failed: ${rpcError.message}`)
        await supabase.auth.signOut()
        setUser(null)
      }

  const isAdmin = user?.app_metadata?.is_admin === true

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, recoveryMode, signUp, resendConfirmation, sendWelcomeEmail, signIn, signInWithGoogle, signOut, updateProfile, refreshUser, getAccessToken, resetPassword, updatePassword, clearRecoveryMode, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
