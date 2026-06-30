// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AI_SETTINGS_KEY,
  AI_SETTINGS_OWNER_KEY,
  LEGACY_AI_SETTINGS_KEY,
  LOCAL_OWNER_KEY,
  DEFAULT_AI_SETTINGS,
  loadAiSettings,
  saveAiSettings,
} from './aiSettings.js'

const settingsWithKey = {
  ...DEFAULT_AI_SETTINGS,
  activeProvider: 'openrouter',
  openrouter: { ...DEFAULT_AI_SETTINGS.openrouter, apiKey: 'sk-or-private' },
}

beforeEach(() => {
  localStorage.clear()
})

describe('AI settings ownership', () => {
  it('loads AI keys for the account that saved them', () => {
    saveAiSettings(settingsWithKey, 'user-owner')

    expect(loadAiSettings('user-owner').openrouter.apiKey).toBe('sk-or-private')
  })

  it('does not expose saved AI keys to a different account', () => {
    saveAiSettings(settingsWithKey, 'user-owner')

    expect(loadAiSettings('user-new').openrouter.apiKey).toBe('')
  })

  it('does not expose ownerless legacy settings to a new signed-in account', () => {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settingsWithKey))

    expect(loadAiSettings('user-new').openrouter.apiKey).toBe('')
  })

  it('allows ownerless settings to migrate when the browser data owner matches', () => {
    localStorage.setItem(LEGACY_AI_SETTINGS_KEY, JSON.stringify(settingsWithKey))
    localStorage.setItem(LOCAL_OWNER_KEY, 'user-owner')

    expect(loadAiSettings('user-owner').openrouter.apiKey).toBe('sk-or-private')
  })

  it('clears the legacy key and stamps owner on save', () => {
    localStorage.setItem(LEGACY_AI_SETTINGS_KEY, JSON.stringify(settingsWithKey))

    saveAiSettings(settingsWithKey, 'user-owner')

    expect(localStorage.getItem(LEGACY_AI_SETTINGS_KEY)).toBeNull()
    expect(localStorage.getItem(AI_SETTINGS_OWNER_KEY)).toBe('user-owner')
  })
})
