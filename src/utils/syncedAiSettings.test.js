// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_SETTINGS_KEY, DEFAULT_AI_SETTINGS, loadAiSettings } from './aiSettings.js'
import {
  deleteSyncedAiSettings,
  AI_SETTINGS_SYNC_ENABLED_KEY,
  hydrateSyncedAiSettings,
  loadAiSettingsSyncEnabled,
  saveAiSettingsSyncEnabled,
  saveSyncedAiSettings,
} from './syncedAiSettings.js'

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'token-1' } } })),
    },
  },
}))

const cloudSettings = {
  ...DEFAULT_AI_SETTINGS,
  activeProvider: 'openrouter',
  openrouter: { ...DEFAULT_AI_SETTINGS.openrouter, apiKey: 'sk-cloud' },
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
})

describe('synced AI settings client', () => {
  it('defaults sync on and persists the local preference', () => {
    expect(loadAiSettingsSyncEnabled()).toBe(true)
    saveAiSettingsSyncEnabled(false)
    expect(localStorage.getItem(AI_SETTINGS_SYNC_ENABLED_KEY)).toBe('0')
    expect(loadAiSettingsSyncEnabled()).toBe(false)
  })

  it('hydrates local AI settings from the cloud copy', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ exists: true, settings: cloudSettings, updatedAt: 't' }),
    })

    await hydrateSyncedAiSettings('user-1')

    expect(loadAiSettings('user-1').openrouter.apiKey).toBe('sk-cloud')
  })

  it('does not hydrate when sync is disabled locally', async () => {
    saveAiSettingsSyncEnabled(false)

    await hydrateSyncedAiSettings('user-1')

    expect(fetch).not.toHaveBeenCalled()
  })

  it('saves locally and posts the encrypted-sync payload through the API', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ saved: true }) })

    await saveSyncedAiSettings(cloudSettings, 'user-1')

    expect(JSON.parse(localStorage.getItem(AI_SETTINGS_KEY)).openrouter.apiKey).toBe('sk-cloud')
    expect(fetch).toHaveBeenCalledWith('/api/ai-settings', expect.objectContaining({ method: 'POST' }))
  })

  it('requires a successful delete before treating synced settings as removed', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'offline' }) })

    await expect(deleteSyncedAiSettings()).rejects.toThrow('offline')
  })
})
