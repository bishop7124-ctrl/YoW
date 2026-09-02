// Applies the saved theme to <html> before first paint, so the page never
// flashes the default theme before switching to the user's actual choice.
// Mirrors applyThemeToDocument in src/utils/theme.js, but must run
// synchronously here since that module only executes after React mounts.
//
// Extracted from an inline <script> in index.html (was previously inline)
// so the site's Content-Security-Policy script-src can require 'self'
// instead of 'unsafe-inline' — see vercel.json.
;(function () {
  try {
    var root = document.documentElement
    var theme = localStorage.getItem('nf-theme') || 'system'
    var builtIn = ['dark-refined', 'light-refined', 'tropical', 'pearl-minimal']
    var themeColors = {
      'dark-refined': '#0e1a18',
      'light-refined': '#e8f3ec',
      tropical: '#0d282e',
      'pearl-minimal': '#fafaf9'
    }
    var systemTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark-refined' : 'light-refined'
    var resolvedTheme = theme === 'system' ? systemTheme : theme
    if (theme === 'custom') {
      root.setAttribute('data-theme', 'custom')
      root.setAttribute('data-theme-choice', 'custom')
      var tokens = JSON.parse(localStorage.getItem('nf-custom-computed') || 'null')
      if (tokens) {
        for (var prop in tokens) root.style.setProperty(prop, tokens[prop])
      }
    } else if (theme === 'system') {
      root.setAttribute('data-theme', systemTheme)
      root.setAttribute('data-theme-choice', 'system')
    } else if (builtIn.indexOf(theme) !== -1) {
      root.setAttribute('data-theme', theme)
      root.setAttribute('data-theme-choice', theme)
    }
    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta && themeColors[resolvedTheme]) meta.setAttribute('content', themeColors[resolvedTheme])
  } catch (e) { /* localStorage unavailable — fall back to default theme */ }
})()
