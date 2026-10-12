#!/usr/bin/env node
// Validates a Tauri updater manifest (latest.json) before it is attached to a
// GitHub release. Usage: node scripts/verify-updater-manifest.mjs latest.json [--version 0.2.0]
// Exits non-zero (and prints every problem) if the manifest would break or
// weaken updates: a supported platform is missing, a signature is not a
// Tauri/minisign signature, an installer URL is not HTTPS on the YOW repo's
// release path, or the version is not newer-comparable semver.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Platforms the desktop workflows build today (macOS Apple Silicon, Windows x64).
export const REQUIRED_PLATFORMS = ['darwin-aarch64', 'windows-x86_64']
export const ALLOWED_PLATFORMS = [
  'darwin-aarch64', 'darwin-x86_64', 'windows-x86_64', 'windows-i686', 'windows-aarch64', 'linux-x86_64',
]
const RELEASE_URL_PREFIX = 'https://github.com/bishop7124-ctrl/YoW/releases/download/'
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

// Tauri stores the .sig file base64-encoded; it decodes to a minisign signature
// whose first line is "untrusted comment: ...".
function isMinisignSignature(signature) {
  if (typeof signature !== 'string' || !signature.trim()) return false
  if (!/^[A-Za-z0-9+/=\s]+$/.test(signature)) return false
  const decoded = Buffer.from(signature.replace(/\s+/g, ''), 'base64').toString('utf8')
  return decoded.startsWith('untrusted comment:') && decoded.split('\n').filter(Boolean).length >= 4
}

export function validateManifest(manifest, { expectedVersion, requiredPlatforms = REQUIRED_PLATFORMS } = {}) {
  const problems = []
  if (!manifest || typeof manifest !== 'object') return ['Manifest is not a JSON object.']
  if (!SEMVER.test(String(manifest.version || ''))) problems.push(`version "${manifest.version}" is not semver (e.g. 0.2.0).`)
  if (expectedVersion && manifest.version !== expectedVersion) {
    problems.push(`version "${manifest.version}" does not match the release version "${expectedVersion}".`)
  }
  if (!manifest.pub_date || Number.isNaN(Date.parse(manifest.pub_date))) problems.push('pub_date is missing or not an ISO date.')
  const platforms = manifest.platforms
  if (!platforms || typeof platforms !== 'object') {
    problems.push('platforms is missing.')
    return problems
  }
  for (const key of requiredPlatforms) {
    if (!platforms[key]) problems.push(`Required platform "${key}" is missing, so those users would never be offered the update.`)
  }
  for (const [key, entry] of Object.entries(platforms)) {
    if (!ALLOWED_PLATFORMS.includes(key)) problems.push(`Unknown platform key "${key}".`)
    if (!isMinisignSignature(entry?.signature)) problems.push(`${key}: signature is missing or not a valid Tauri (minisign) signature.`)
    const url = entry?.url
    if (typeof url !== 'string' || !url.startsWith(RELEASE_URL_PREFIX)) {
      problems.push(`${key}: url must be an https GitHub release asset under ${RELEASE_URL_PREFIX}`)
    } else if (!url.includes(`/v${manifest.version}/`)) {
      problems.push(`${key}: url does not point at the v${manifest.version} release.`)
    }
  }
  return problems
}

function main() {
  const argv = process.argv.slice(2)
  const file = argv.find(a => !a.startsWith('--'))
  const vi = argv.indexOf('--version')
  const expectedVersion = vi >= 0 ? argv[vi + 1] : undefined
  if (!file) throw new Error('Usage: verify-updater-manifest.mjs latest.json [--version X.Y.Z]')
  const problems = validateManifest(JSON.parse(readFileSync(file, 'utf8')), { expectedVersion })
  if (problems.length) {
    for (const p of problems) console.error(`FAIL: ${p}`)
    process.exit(1)
  }
  console.log(`OK: ${file} is a valid updater manifest.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
