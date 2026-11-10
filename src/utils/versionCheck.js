// "A new version is available" check. Each production build publishes /version.json with its commit id; the
// running app compares it with the id it was built from. Everything fails quiet: any problem means "no update".

export const isNewBuild = (current, remote) => Boolean(current && remote && current !== remote)

const BUILD_ID = /^[0-9a-f]{7,40}$/

export async function fetchRemoteBuild(fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response?.ok) return null
    if (!String(response.headers?.get?.('content-type') || '').includes('json')) return null // SPA fallback returns HTML
    const data = await response.json()
    return typeof data?.build === 'string' && BUILD_ID.test(data.build) ? data.build : null
  } catch {
    return null
  }
}
