// Pure helpers for scripts/generate-updater-manifest.mjs so the release
// manifest rules can be unit-tested without touching the filesystem.

export const VALID_PLATFORM_KEYS = [
  'windows-x86_64',
  'windows-i686',
  'windows-aarch64',
  'darwin-x86_64',
  'darwin-aarch64',
  'linux-x86_64',
]

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
// A Tauri updater .sig file is a base64-encoded minisign signature.
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

export function validateManifestInput({ version, platforms, expectedVersion, requiredPlatforms = [] }) {
  const errors = []
  if (!SEMVER.test(version || '')) errors.push(`version "${version}" is not a valid semver version`)
  if (expectedVersion && version !== expectedVersion) {
    errors.push(`version ${version} does not match the app version ${expectedVersion} in src-tauri/tauri.conf.json`)
  }
  const keys = Object.keys(platforms || {})
  if (keys.length === 0) errors.push('no platforms given')
  for (const key of keys) {
    const { url, signature } = platforms[key]
    if (!VALID_PLATFORM_KEYS.includes(key)) errors.push(`unknown platform key "${key}"`)
    if (!/^https:\/\//.test(url || '')) errors.push(`${key}: url must be https`)
    if (!signature || !BASE64.test(signature.replace(/\s+/g, ''))) errors.push(`${key}: signature is missing or not a base64 minisign signature`)
  }
  for (const key of requiredPlatforms) {
    if (!keys.includes(key)) errors.push(`required platform "${key}" is missing from the manifest`)
  }
  return errors
}

export function buildManifest({ version, notes = '', platforms, pubDate = new Date().toISOString() }) {
  return { version, notes, pub_date: pubDate, platforms }
}
