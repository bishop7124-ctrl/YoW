import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { OFFLINE_MODE, OFFLINE_USER } from '../utils/offlineMock'
import { deleteAllUserData } from '../utils/firestoreSync'

const AuthContext = createContext({ user: null, loading: false, recoveryMode: false, signUp: () => {}, signIn: () => {}, signOut: () => {}, updateProfile: () => {}, refreshUser: () => null, getAccessToken: () => null, resetPassword: () => {}, updatePassword: () => {}, clearRecoveryMode: () => {} })

// Read the cached Supabase session from localStorage synchronously so the app
// renders immediately on return visits without waiting for a network round-trip.
function readCachedUser() {
  try {
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
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    if (OFFLINE_MODE) return

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    }).catch(console.warn)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true)
        setUser(session?.user ?? null)
      } else {
        setRecoveryMode(false)
        setUser(session?.user ?? null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = OFFLINE_MODE
    ? () => { setUser(OFFLINE_USER); return Promise.resolve({ data: { user: OFFLINE_USER }, error: null }) }
    : (email, password) => supabase.auth.signUp({ email, password })

  const signIn = OFFLINE_MODE
    ? () => { setUser(OFFLINE_USER); return Promise.resolve({ data: { user: OFFLINE_USER }, error: null }) }
    : (email, password) => supabase.auth.signInWithPassword({ email, password })

  const signOut = OFFLINE_MODE
    ? () => { setUser(null); return Promise.resolve() }
    : () => supabase.auth.signOut()

  const resetPassword = OFFLINE_MODE
    ? () => Promise.resolve({ data: null, error: null })
    : (email) => supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      })

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
        // Attempt server-side auth deletion via RPC (requires a delete_user Postgres function)
        try { await supabase.rpc('delete_user') } catch { /* no-op if function not installed */ }
        await supabase.auth.signOut()
        setUser(null)
      }

  const isAdmin = user?.app_metadata?.is_admin === true

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, recoveryMode, signUp, signIn, signOut, updateProfile, refreshUser, getAccessToken, resetPassword, updatePassword, clearRecoveryMode, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
