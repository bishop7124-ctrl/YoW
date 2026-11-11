const PUBLIC_PAGES = new Map([
  ['/pricing', 'pricing'],
  ['/features', 'features'],
  ['/faq', 'faq'],
  ['/founders', 'founders'],
  ['/download', 'download'],
])

const normalizePath = (path = '') => {
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1)
  return path || '/'
}

const decodeSegment = (segment) => {
  try { return decodeURIComponent(segment) }
  catch { return segment }
}

export function parsePublicRoute(path = '') {
  const normalized = normalizePath(path)
  const page = PUBLIC_PAGES.get(normalized)
  if (page) return { page, founderProfileSlug: null, authRouteMode: null }

  const founderMatch = normalized.match(/^\/founders\/([^/]+)$/)
  if (founderMatch) {
    return {
      page: 'founder-profile',
      founderProfileSlug: decodeSegment(founderMatch[1]),
      authRouteMode: null,
    }
  }

  // Private owner tools. Both routes still render for everyone; the editor
  // itself shows a plain "not found" unless the account is a site editor.
  if (normalized === '/site-editor') {
    return { page: 'site-editor', founderProfileSlug: null, authRouteMode: null, previewPage: null }
  }
  const previewMatch = normalized.match(/^\/site-preview\/(home|features|faq)$/)
  if (previewMatch) {
    return { page: 'site-preview', founderProfileSlug: null, authRouteMode: null, previewPage: previewMatch[1] }
  }

  if (normalized === '/login' || normalized === '/signup') {
    return {
      page: 'auth',
      founderProfileSlug: null,
      authRouteMode: normalized.slice(1),
    }
  }

  return { page: null, founderProfileSlug: null, authRouteMode: null }
}

export function isStandalonePublicRoute(route) {
  return Boolean(route?.page && route.page !== 'auth')
}

export const ACCOUNT_SETTINGS_TABS = new Set(['profile', 'appearance', 'preferences', 'storage', 'ai', 'membership'])

const decodeRouteId = value => {
  try { return decodeURIComponent(value) || null }
  catch { return null }
}

export function parseAppRoute(path = '/dashboard', search = '') {
  const params = new URLSearchParams(search)
  const accountTab = params.get('tab')
  const settings = params.get('settings')
  const overlay = {
    accountOpen: settings === 'account',
    accountTab: ACCOUNT_SETTINGS_TABS.has(accountTab) ? accountTab : 'profile',
    projectSettingsOpen: settings === 'project',
  }

  const fallback = { novelId: null, seriesId: null, section: 'dashboard', layoutViewMode: 'planning', sceneId: null, ...overlay, projectSettingsOpen: false }
  const seriesMatch = path.match(/^\/series\/([^/]+)(?:\/([^/]+))?$/)
  if (seriesMatch) {
    const seriesId = decodeRouteId(seriesMatch[1])
    if (!seriesId) return fallback
    return { novelId: null, seriesId, section: 'dashboard', layoutViewMode: 'planning', sceneId: null, ...overlay, projectSettingsOpen: false }
  }

  const m = path.match(/^\/project\/([^/]+)(?:\/(.+))?$/)
  if (!m) return fallback
  const novelId = decodeRouteId(m[1])
  if (!novelId) return fallback
  const sub = m[2]
  if (sub === 'writing' || sub?.startsWith('writing/')) {
    const sceneId = sub.startsWith('writing/') ? decodeRouteId(sub.slice('writing/'.length)) : null
    return { novelId, seriesId: null, section: 'dashboard', layoutViewMode: 'writing', sceneId, ...overlay }
  }
  return { novelId, seriesId: null, section: sub || 'dashboard', layoutViewMode: 'planning', sceneId: null, ...overlay }
}
