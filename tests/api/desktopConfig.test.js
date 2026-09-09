import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '../..')

describe('desktop release config (audit findings #27/#28/#30)', () => {
  it('tauri updater endpoint points at the current repo, not the legacy StoryAtlas name', () => {
    const conf = JSON.parse(readFileSync(join(repoRoot, 'src-tauri/tauri.conf.json'), 'utf8'))
    const endpoints = conf.plugins.updater.endpoints
    expect(endpoints).toEqual(['https://github.com/bishop7124-ctrl/YoW/releases/latest/download/latest.json'])
    for (const endpoint of endpoints) {
      expect(endpoint).not.toMatch(/StoryAtlas/i)
    }
  })

  it('package.json version is not the unset scaffold placeholder', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
    expect(pkg.version).not.toBe('0.0.0')
  })

  it('Cargo.toml has non-empty license/repository metadata', () => {
    const cargoToml = readFileSync(join(repoRoot, 'src-tauri/Cargo.toml'), 'utf8')
    expect(cargoToml).toMatch(/^license = ".+"$/m)
    expect(cargoToml).toMatch(/^repository = ".+"$/m)
    expect(cargoToml).not.toMatch(/StoryAtlas/i)
  })
})
