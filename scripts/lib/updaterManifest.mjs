// Pure helpers behind scripts/generate-updater-manifest.mjs, split out so the
// release checks (every supported platform present, signatures look real, URLs
// point at the matching release asset, version matches the app) are unit
// tested instead of discovered by a failed update on a customer's machine.

// Platforms YOW ships. A release is incomplete unless all of them are present.
export const REQUIRED_UPDATER_PLATFORMS = ['darwin-aarch64', 'windows-x86_64']

// Every key the Tauri updater understands.
export const KNOWN_UPDATER_PLATFORMS = [
  'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'windows-aarch64', 'windows-i686', 'windows-x86_64',
]

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

// A Tauri updater .sig file is base64 of a minisign signature: it decodes to
// text starting "untrusted comment: ".
export function looksLikeMinisignSignature(signature) {
  if (typeof signature !== 'string' || signature.trim().length < 80) return false
  if (!/^[A-Za-z0-9+/=\s]+$/.test(signature)) return false
  try {
    return Buffer.from(signature.trim(), 'base64').toString('utf8').startsWith('untrusted comment:')
  } catch {
    return false
  }
}

export function validateUpdaterManifest(manifest, options = {}) {
  const required = options.requiredPlatforms ?? REQUIRED_UPDATER_PLATFORMS
  const errors = []
  if (!manifest || typeof manifest !== 'object') return ['Manifest is not an object.']

  if (!SEMVER.test(manifest.version || '')) errors.push(`version "${manifest.version}" is not semver.`)
  if (options.expectedVersion && manifest.version !== options.expectedVersion) {
    errors.push(`version ${manifest.version} does not match the app version ${options.expectedVersion}.`)
  }
  if (!manifest.pub_date || Number.isNaN(Date.parse(manifest.pub_date))) errors.push('pub_date is missing or not a date.')

  const platforms = manifest.platforms && typeof manifest.platforms === 'object' ? manifest.platforms : {}
  for (const key of required) {
    if (!platforms[key]) errors.push(`Missing platform ${key}: those users would silently never be offered this update.`)
  }
  for (const [key, entry] of Object.entries(platforms)) {
    if (!KNOWN_UPDATER_PLATFORMS.includes(key)) errors.push(`Unknown platform key ${key}.`)
    if (!entry || typeof entry !== 'object') { errors.push(`${key}: entry is not an object.`); continue }
    if (!looksLikeMinisignSignature(entry.signature)) errors.push(`${key}: signature is empty or not a minisign signature.`)
    let url
    try { url = new URL(entry.url) } catch { errors.push(`${key}: url is not a valid URL.`); continue }
    if (url.protocol !== 'https:') errors.push(`${key}: url must be https.`)
    if (options.repo && !url.pathname.startsWith(`/${options.repo}/releases/download/`)) {
      errors.push(`${key}: url must be a release asset of ${options.repo}.`)
    }
    if (options.expectedVersion && !url.pathname.includes(options.expectedVersion)) {
      errors.push(`${key}: url does not contain version ${options.expectedVersion} (stale asset?).`)
    }
  }
  return errors
}

export function buildUpdaterManifest({ version, notes = '', platforms, now = new Date() }) {
  return { version, notes, pub_date: now.toISOString(), platforms }
}
