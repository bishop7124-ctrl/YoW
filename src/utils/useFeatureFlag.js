import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { loadFeatureFlags } from './featureFlags'

// Returns true only when the flag is confirmed on for the signed-in user.
// Off while loading, on error, when signed out, or when the flag is missing.
// Flags are tagged with the user they were loaded for, so a previous user's
// flags are never shown to the next one.
export function useFeatureFlag(key) {
  const { user } = useAuth()
  const userId = user?.id || null
  const [loaded, setLoaded] = useState({ userId: null, flags: {} })

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    loadFeatureFlags(supabase, userId).then(flags => {
      if (!cancelled) setLoaded({ userId, flags })
    })
    return () => { cancelled = true }
  }, [userId])

  return Boolean(userId) && loaded.userId === userId && loaded.flags[key] === true
}
