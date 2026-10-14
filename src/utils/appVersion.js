// Build identity shown in Account Settings. Injected at build time by vite.config.mjs
// (package.json version; commit from GITHUB_SHA or VERCEL_GIT_COMMIT_SHA when present).
export function formatVersionLabel({ version, build, desktop } = {}) {
  const parts = [`Version ${version || 'dev'}`]
  if (desktop) parts.push('desktop app')
  if (build) parts.push(`build ${build}`)
  return parts.join(' \u00b7 ')
}

export function getAppVersionLabel(desktop = false) {
  return formatVersionLabel({
    version: import.meta.env.VITE_APP_VERSION,
    build: import.meta.env.VITE_BUILD_SHA,
    desktop,
  })
}
