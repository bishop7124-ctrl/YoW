import { supabase } from '../supabase'
import { isDesktopAppRuntime } from './runtime.js'
import { OFFLINE_MODE } from './offlineMock'
import { loadAiSettings, saveAiSettings } from './aiSettings.js'

export const AI_SETTINGS_SYNC_ENABLED_KEY = 'nf_aiSettingsSyncEnabled'

const apiEndpoint = () => {
  const base = import.meta.env.VITE_DESKTOP_API_BASE_URL
    || (isDesktopAppRuntime() ? 'https://www.yourownworld.co.uk' : '')
  return `${base}/api/ai-settings`
}

export function loadAiSettingsSyncEnabled() {
  try { return localStorage.getItem(AI_SETTINGS_SYNC_ENABLED_KEY) !== '0' } catch { return true }
}

export function saveAiSettingsSyncEnabled(enabled) {
  try { localStorage.setItem(AI_SETTINGS_SYNC_ENABLED_KEY, enabled ? '1' : '0') } catch { /* storage unavailable */ }
}

async function authorizedRequest(method, body) {
  if (OFFLINE_MODE) return { ok: false, offline: true, status: 0, payload: null }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return { ok: false, offline: true, status: 0, payload: null }

  let response
  try {
    response = await fetch(apiEndpoint(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    return { ok: false, offline: true, status: 0, payload: null }
  }

  const payload = await response.json().catch(() => ({}))
  return { ok: response.ok, offline: false, status: response.status, payload }
}

export async function hydrateSyncedAiSettings(userId) {
  if (!userId || !loadAiSettingsSyncEnabled()) return { loaded: false }
  const result = await authorizedRequest('GET')
  if (!result.ok || !result.payload?.exists) return { loaded: false, ...result }

  saveAiSettings(result.payload.settings, userId)
  return { loaded: true, updatedAt: result.payload.updatedAt }
}

export async function saveSyncedAiSettings(settings, userId) {
  if (!userId) return { saved: false }
  saveAiSettings(settings, userId)

  const result = await authorizedRequest('POST', { settings: loadAiSettings(userId) })
  if (!result.ok) {
    throw new Error(result.payload?.error || 'Could not sync AI settings across devices.')
  }
  return { saved: true }
}

export async function deleteSyncedAiSettings() {
  const result = await authorizedRequest('DELETE')
  if (!result.ok) {
    throw new Error(result.payload?.error || 'Could not remove synced AI settings. Check your connection and try again.')
  }
  return result
}
