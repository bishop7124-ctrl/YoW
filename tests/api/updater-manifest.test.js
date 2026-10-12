import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateManifest, REQUIRED_PLATFORMS } from '../../scripts/verify-updater-manifest.mjs'

const sigText = 'untrusted comment: signature from tauri secret key\nRUQabc123\ntrusted comment: timestamp:1\nXYZsig=='
const sig = Buffer.from(sigText).toString('base64')
const base = 'https://github.com/bishop7124-ctrl/YoW/releases/download/v0.2.0/'
const good = () => ({
  version: '0.2.0',
  notes: 'x',
  pub_date: '2026-10-10T10:00:00.000Z',
  platforms: {
    'darwin-aarch64': { signature: sig, url: `${base}YOW_aarch64.app.tar.gz` },
    'windows-x86_64': { signature: sig, url: `${base}YOW_0.2.0_x64-setup.exe` },
  },
})

describe('updater manifest validation', () => {
  it('accepts a complete manifest', () => {
    expect(validateManifest(good(), { expectedVersion: '0.2.0' })).toEqual([])
  })
  it('rejects a missing platform', () => {
    const m = good(); delete m.platforms['windows-x86_64']
    expect(validateManifest(m).join(' ')).toMatch(/windows-x86_64.*missing/)
  })
  it('rejects a bad or empty signature', () => {
    const m = good(); m.platforms['darwin-aarch64'].signature = 'not-a-signature!'
    expect(validateManifest(m).join(' ')).toMatch(/darwin-aarch64: signature/)
    m.platforms['darwin-aarch64'].signature = ''
    expect(validateManifest(m).length).toBeGreaterThan(0)
  })
  it('rejects non-release or http URLs and wrong release tag', () => {
    const m = good(); m.platforms['darwin-aarch64'].url = 'http://example.com/a.tar.gz'
    expect(validateManifest(m).join(' ')).toMatch(/darwin-aarch64: url must be/)
    const n = good(); n.platforms['darwin-aarch64'].url = `${base.replace('v0.2.0', 'v0.1.0')}a.tar.gz`
    expect(validateManifest(n).join(' ')).toMatch(/does not point at the v0.2.0 release/)
  })
  it('rejects version mismatch and non-semver', () => {
    expect(validateManifest(good(), { expectedVersion: '0.3.0' }).join(' ')).toMatch(/does not match/)
    const m = good(); m.version = 'latest'
    expect(validateManifest(m).join(' ')).toMatch(/not semver/)
  })
  it('requires the platforms the desktop workflows build', () => {
    expect(REQUIRED_PLATFORMS).toEqual(['darwin-aarch64', 'windows-x86_64'])
  })
})

describe('unsigned-app disclosure (pre-purchase)', () => {
  const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
  it('is shown on Pricing, FAQ and Download', () => {
    expect(read('src/components/pricing/PricingPage.jsx')).toContain('DESKTOP_UNSIGNED_SHORT')
    expect(read('src/components/pricing/PricingPage.jsx')).toContain('DESKTOP_UNSIGNED_DETAIL')
    expect(read('src/components/faq/FAQPage.jsx')).toContain('DESKTOP_UNSIGNED_DETAIL')
    expect(read('src/components/download/DownloadPage.jsx')).toMatch(/Open Anyway/)
    expect(read('src/components/download/DownloadPage.jsx')).toMatch(/Run anyway/)
  })
})
