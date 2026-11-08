import { describe, expect, it } from 'vitest'
import { isStandalonePublicRoute, parsePublicRoute } from './appRoutes'

describe('public route parsing', () => {
  it.each([
    ['/pricing', 'pricing'],
    ['/pricing/', 'pricing'],
    ['/features', 'features'],
    ['/faq/', 'faq'],
    ['/founders', 'founders'],
    ['/download/', 'download'],
  ])('owns %s as the %s page', (path, page) => {
    expect(parsePublicRoute(path)).toEqual({ page, founderProfileSlug: null, authRouteMode: null })
  })

  it('keeps founder profiles mutually exclusive with the founders index', () => {
    expect(parsePublicRoute('/founders/morgan-bishop/')).toEqual({
      page: 'founder-profile',
      founderProfileSlug: 'morgan-bishop',
      authRouteMode: null,
    })
    expect(parsePublicRoute('/founders/morgan%20bishop').founderProfileSlug).toBe('morgan bishop')
  })

  it.each([
    ['/login', 'login'],
    ['/signup/', 'signup'],
  ])('recognises %s without treating it as a standalone marketing page', (path, authRouteMode) => {
    const route = parsePublicRoute(path)
    expect(route).toEqual({ page: 'auth', founderProfileSlug: null, authRouteMode })
    expect(isStandalonePublicRoute(route)).toBe(false)
  })

  it('clears every public field for application and unknown routes', () => {
    expect(parsePublicRoute('/dashboard')).toEqual({ page: null, founderProfileSlug: null, authRouteMode: null })
    expect(parsePublicRoute('/founders/morgan/notes')).toEqual({ page: null, founderProfileSlug: null, authRouteMode: null })
    expect(isStandalonePublicRoute(parsePublicRoute('/dashboard'))).toBe(false)
  })
})

describe('private site editor routes', () => {
  it('recognises the editor and preview routes as standalone pages', async () => {
    const { parsePublicRoute, isStandalonePublicRoute } = await import('./appRoutes')
    expect(parsePublicRoute('/site-editor').page).toBe('site-editor')
    expect(parsePublicRoute('/site-editor/').page).toBe('site-editor')
    expect(parsePublicRoute('/site-preview/home')).toMatchObject({ page: 'site-preview', previewPage: 'home' })
    expect(parsePublicRoute('/site-preview/faq').previewPage).toBe('faq')
    expect(parsePublicRoute('/site-preview/pricing').page).toBeNull()
    expect(isStandalonePublicRoute(parsePublicRoute('/site-editor'))).toBe(true)
  })
})
