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
