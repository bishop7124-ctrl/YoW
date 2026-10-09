import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REQUIRED_UPDATER_PLATFORMS,
  buildUpdaterManifest,
  looksLikeMinisignSignature,
  validateUpdaterManifest,
} from '../../scripts/lib/updaterManifest.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const conf = JSON.parse(readFileSync(join(repoRoot, 'src-tauri/tauri.conf.json'), 'utf8'))
const VERSION = conf.version
const SIG = Buffer.from('untrusted comment: signature from tauri secret key\nRWSAw+Rjr/gIu6av/I6AbAsayDdM1Hzz/JOguX0m3d3YX4TlfnNtt1yz\n', 'utf8').toString('base64')
const OPTIONS = { expectedVersion: VERSION, repo: 'bishop7124-ctrl/YoW' }

const asset = name => `https://github.com/bishop7124-ctrl/YoW/releases/download/v${VERSION}/${name}`
const good = () => buildUpdaterManifest({
  version: VERSION,
  platforms: {
    'darwin-aarch64': { signature: SIG, url: asset(`YOW_${VERSION}_aarch64.app.tar.gz`) },
    'windows-x86_64': { signature: SIG, url: asset(`YOW_${VERSION}_x64-setup.exe`) },
  },
})

describe('updater manifest release checks (9 Oct)', () => {
  it('accepts a complete manifest', () => {
    expect(validateUpdaterManifest(good(), OPTIONS)).toEqual([])
  })

  it('requires every shipped platform: a missing one is a hard error', () => {
    for (const key of REQUIRED_UPDATER_PLATFORMS) {
      const manifest = good()
      delete manifest.platforms[key]
      expect(validateUpdaterManifest(manifest, OPTIONS).join(' ')).toMatch(new RegExp(`Missing platform ${key}`))
    }
  })

  it('rejects bad, empty or tampered signatures', () => {
    for (const signature of ['', 'not-a-signature', 'A'.repeat(120), Buffer.from('x'.repeat(100)).toString('base64')]) {
      const manifest = good()
      manifest.platforms['windows-x86_64'].signature = signature
      expect(validateUpdaterManifest(manifest, OPTIONS).join(' ')).toMatch(/windows-x86_64: signature/)
    }
    expect(looksLikeMinisignSignature(SIG)).toBe(true)
  })

  it('rejects http, foreign-repo and stale-version URLs', () => {
    const insecure = good()
    insecure.platforms['darwin-aarch64'].url = insecure.platforms['darwin-aarch64'].url.replace('https:', 'http:')
    expect(validateUpdaterManifest(insecure, OPTIONS).join(' ')).toMatch(/must be https/)
    const foreign = good()
    foreign.platforms['darwin-aarch64'].url = 'https://example.com/releases/download/v1/YOW.app.tar.gz'
    expect(validateUpdaterManifest(foreign, OPTIONS).join(' ')).toMatch(/release asset of bishop7124-ctrl\/YoW/)
    const stale = good()
    stale.platforms['windows-x86_64'].url = 'https://github.com/bishop7124-ctrl/YoW/releases/download/v0.1.0/YOW_0.1.0_x64-setup.exe'
    expect(validateUpdaterManifest(stale, OPTIONS).join(' ')).toMatch(/stale asset/)
  })

  it('rejects a version that does not match the app being released', () => {
    const manifest = { ...good(), version: '9.9.9' }
    expect(validateUpdaterManifest(manifest, OPTIONS).join(' ')).toMatch(/does not match the app version/)
  })

  it('every platform the manifest requires has a matching CI build workflow', () => {
    const mac = readFileSync(join(repoRoot, '.github/workflows/desktop-build-macos.yml'), 'utf8')
    const win = readFileSync(join(repoRoot, '.github/workflows/desktop-build-windows.yml'), 'utf8')
    expect(mac).toMatch(/aarch64|arm64/)
    expect(win).toMatch(/windows/i)
    expect(REQUIRED_UPDATER_PLATFORMS).toEqual(['darwin-aarch64', 'windows-x86_64'])
  })
})

describe('unsigned-app disclosure before purchase', () => {
  const read = file => readFileSync(join(repoRoot, file), 'utf8')
  it('appears on Pricing, Download, FAQ and in checkout', () => {
    expect(read('src/components/pricing/PricingPage.jsx')).toMatch(/UnsignedAppNotice/)
    expect(read('src/components/pricing/PricingPage.jsx')).toMatch(/not yet signed by Apple or Microsoft|notarized by Apple/)
    expect(read('src/components/download/DownloadPage.jsx')).toMatch(/UnsignedAppNotice/)
    expect(read('src/components/faq/FAQPage.jsx')).toMatch(/Is the desktop app signed by Apple and Microsoft/)
    expect(read('api/create-checkout-session.js')).toMatch(/UNSIGNED_APP_CHECKOUT_MESSAGE/)
  })
  it('Download page keeps the Gatekeeper and SmartScreen bypass steps', () => {
    const download = read('src/components/download/DownloadPage.jsx')
    expect(download).toMatch(/Open Anyway/)
    expect(download).toMatch(/Run anyway/)
  })
})
