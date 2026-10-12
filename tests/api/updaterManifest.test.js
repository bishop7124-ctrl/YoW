import { describe, expect, it } from 'vitest'
import { buildManifest, validateManifestInput } from '../../scripts/updaterManifest.mjs'

const sig = 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQ=='
const good = {
  version: '0.2.0-beta.1',
  expectedVersion: '0.2.0-beta.1',
  platforms: {
    'darwin-aarch64': { url: 'https://github.com/o/r/releases/download/v1/YOW.app.tar.gz', signature: sig },
    'windows-x86_64': { url: 'https://github.com/o/r/releases/download/v1/YOW-setup.exe', signature: sig },
  },
}

describe('updater manifest rules', () => {
  it('accepts a complete manifest', () => {
    expect(validateManifestInput({ ...good, requiredPlatforms: ['darwin-aarch64', 'windows-x86_64'] })).toEqual([])
  })
  it('fails when a required platform is missing', () => {
    const errors = validateManifestInput({ ...good, requiredPlatforms: ['darwin-x86_64'] })
    expect(errors.join()).toContain('darwin-x86_64')
  })
  it('rejects a version that differs from the app version', () => {
    expect(validateManifestInput({ ...good, version: '0.2.1' }).join()).toContain('does not match')
  })
  it('rejects bad or empty signatures and non-https urls', () => {
    const bad = { ...good, platforms: { 'darwin-aarch64': { url: 'http://x/y', signature: 'not a sig!' } } }
    const errors = validateManifestInput(bad).join()
    expect(errors).toContain('url must be https')
    expect(errors).toContain('signature')
    expect(validateManifestInput({ ...good, platforms: { 'darwin-aarch64': { url: good.platforms['darwin-aarch64'].url, signature: '' } } }).join()).toContain('signature')
  })
  it('rejects unknown platform keys and empty platform lists', () => {
    expect(validateManifestInput({ ...good, platforms: { 'macos-arm': good.platforms['darwin-aarch64'] } }).join()).toContain('unknown platform')
    expect(validateManifestInput({ ...good, platforms: {} }).join()).toContain('no platforms')
  })
  it('builds the Tauri manifest shape', () => {
    const m = buildManifest({ version: '1.0.0', notes: 'n', platforms: good.platforms, pubDate: '2026-10-12T00:00:00.000Z' })
    expect(Object.keys(m)).toEqual(['version', 'notes', 'pub_date', 'platforms'])
  })
})
