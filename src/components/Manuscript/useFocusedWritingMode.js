import { useCallback, useEffect, useMemo, useState } from 'react'

const DEFAULT_PREFERENCES = {
  enabled: false,
  caretFollow: true,
  uiDensity: 'minimal',
  pageZoom: 1,
}

function storageKey(userId) {
  return `nf-focused-writing:${userId || 'local'}`
}

function loadPreferences(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(userId)) || 'null')
    return { ...DEFAULT_PREFERENCES, ...(saved || {}) }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function useFocusedWritingMode(userId) {
  const key = storageKey(userId)
  const [stored, setStored] = useState(() => ({ key, preferences: loadPreferences(userId) }))
  if (stored.key !== key) {
    setStored({ key, preferences: loadPreferences(userId) })
  }
  const preferences = stored.key === key ? stored.preferences : loadPreferences(userId)

  useEffect(() => {
    localStorage.setItem(storageKey(userId), JSON.stringify(preferences))
  }, [preferences, userId])

  const setEnabled = useCallback((enabled) => {
    setStored(current => ({
      ...current,
      preferences: { ...current.preferences, enabled: Boolean(enabled) },
    }))
  }, [])

  const toggle = useCallback(() => {
    setStored(current => ({
      ...current,
      preferences: { ...current.preferences, enabled: !current.preferences.enabled },
    }))
  }, [])

  const setPageZoom = useCallback((pageZoom) => {
    const nextZoom = Math.min(1.5, Math.max(0.8, Number(pageZoom) || 1))
    setStored(current => ({
      ...current,
      preferences: { ...current.preferences, pageZoom: nextZoom },
    }))
  }, [])

  return useMemo(() => ({
    ...preferences,
    setEnabled,
    toggle,
    setPageZoom,
  }), [preferences, setEnabled, setPageZoom, toggle])
}
