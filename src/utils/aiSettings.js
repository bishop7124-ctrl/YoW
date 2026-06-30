export const AI_SETTINGS_KEY = 'nf_aiSettings'
export const AI_SETTINGS_OWNER_KEY = 'nf_aiSettingsOwner'
export const LEGACY_AI_SETTINGS_KEY = 'nf-ai-settings'
export const LOCAL_OWNER_KEY = 'nf_localOwner'

export const DEFAULT_AI_SETTINGS = {
  activeProvider: 'openrouter',
  google:     { apiKey: '', model: 'gemini-2.0-flash' },
  anthropic:  { apiKey: '', model: 'claude-sonnet-4-6' },
  openrouter: { apiKey: '', model: 'google/gemma-3-27b-it' },
  openai:     { apiKey: '', model: '', baseUrl: 'https://api.openai.com/v1' },
}

const readJson = (key, def) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? def } catch { return def }
}

export function mergeAiSettings(settings = {}, defaults = DEFAULT_AI_SETTINGS) {
  const merged = { ...defaults, ...settings }
  for (const provider of ['google', 'anthropic', 'openrouter', 'openai']) {
    merged[provider] = { ...(defaults[provider] || {}), ...(settings[provider] || {}) }
  }
  return merged
}

export function loadAiSettings(userId = null, defaults = DEFAULT_AI_SETTINGS) {
  const stored = readJson(AI_SETTINGS_KEY, null)
  const legacy = readJson(LEGACY_AI_SETTINGS_KEY, null)
  const settings = stored || legacy || {}

  if (!userId) return mergeAiSettings(settings, defaults)

  const settingsOwner = localStorage.getItem(AI_SETTINGS_OWNER_KEY)
  if (settingsOwner) {
    return settingsOwner === userId ? mergeAiSettings(settings, defaults) : mergeAiSettings({}, defaults)
  }

  const localOwner = localStorage.getItem(LOCAL_OWNER_KEY)
  if (localOwner === userId) return mergeAiSettings(settings, defaults)

  return mergeAiSettings({}, defaults)
}

export function saveAiSettings(settings, userId = null) {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings))
  localStorage.removeItem(LEGACY_AI_SETTINGS_KEY)
  if (userId) localStorage.setItem(AI_SETTINGS_OWNER_KEY, userId)
  else localStorage.removeItem(AI_SETTINGS_OWNER_KEY)
}

export function getActiveAiConfig(userId = null, defaults = DEFAULT_AI_SETTINGS) {
  const settings = loadAiSettings(userId, defaults)
  const provider = settings.activeProvider || defaults.activeProvider || 'google'
  const cfg = settings[provider] || {}
  return {
    provider,
    apiKey: cfg.apiKey || '',
    model: cfg.model || defaults[provider]?.model || '',
    baseUrl: cfg.baseUrl,
  }
}
