// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDesktopVaultBackend } from './desktopVaultBackend.js'
import { isSensitiveStorageKey, isMigratableLegacyKey } from './legacyLocalMigration.js'

// 7 Oct vault privacy audit (code half). The vault and every snapshot is plain SQLite on disk,
// so no Supabase session, AI provider key, entitlement secret or unrelated browser key may be
// stored in it. Three layers are asserted: (1) the app never routes those values through the
// storage backend, (2) the backend refuses credential-looking keys at write time, (3) the
// existing scrub-on-connect removes anything an older build left behind (tauriVaultAdapter tests).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

describe('layer 1: secrets never go through the storage backend', () => {
  it.each([
    ['utils/aiSettings.js', 'AI provider keys'],
    ['utils/desktopEntitlement.js', 'cached licence record and device id'],
    ['context/AuthContext.jsx', 'Supabase session'],
    ['supabase.js', 'Supabase client session storage'],
  ])('%s (%s) never writes through the project storage backend (reading the non-secret owner marker is fine)', (file) => {
    const source = fs.existsSync(path.join(ROOT, file)) ? read(file) : ''
    const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from ['"][^'"]*storage\/projectStorage(?:\.js)?['"]/g)].map(m => m[1]).join(',')
    expect(imports).not.toMatch(/\b(writeItem|removeItem|writeJson|saveValue|getStorageBackend|setStorageBackend)\b/)
  })

  it('no string-literal key written through the backend looks like a credential', () => {
    const files = []
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.(js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(full)
    })
    walk(ROOT)
    const offenders = []
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8')
      if (!/projectStorage/.test(text)) continue
      for (const m of text.matchAll(/(?:writeItem|writeJson|saveValue)\(\s*['"`]([^'"`$]+)['"`]/g)) {
        if (isSensitiveStorageKey(m[1])) offenders.push(`${path.relative(ROOT, file)}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('layer 2: the desktop vault refuses credential-like keys at write time', () => {
  const SECRET_KEYS = ['nf_aiSettings', 'nf-ai-settings', 'nf_aiSettingsOwner', 'sb-abcdefgh-auth-token',
    'nf_openaiApiKey', 'nf_api_key_backup', 'nf_refreshToken', 'nf_someSecret', 'nf_userPassword', 'nf_credentialCache']

  it('never persists or mirrors them, but stores ordinary project keys', async () => {
    const persisted = []
    const rejected = vi.fn()
    const backend = createDesktopVaultBackend({
      persistItem: async (key, value) => { persisted.push([key, value]) },
      replacePersistedItems: async (entries) => { entries.forEach((value, key) => persisted.push([key, value])) },
      isKeyAllowed: key => !isSensitiveStorageKey(key),
      onKeyRejected: rejected,
    })
    SECRET_KEYS.forEach(key => backend.setItem(key, 'sk-live-SECRET'))
    backend.setItem('nf_novels', '[{"id":"n1"}]')
    await backend.replaceItems({ nf_scenes: '[]', nf_refreshToken: 'tok' }, [])
    await backend.flush()

    expect(persisted.map(([key]) => key).sort()).toEqual(['nf_novels', 'nf_scenes'])
    expect(JSON.stringify(backend.snapshot())).not.toContain('SECRET')
    expect(backend.keys()).not.toContain('nf_aiSettings')
    expect(rejected).toHaveBeenCalledTimes(SECRET_KEYS.length + 1)
  })

  it('the predicate agrees across the browser and desktop vaults', () => {
    for (const key of SECRET_KEYS) {
      expect(isSensitiveStorageKey(key), key).toBe(true)
      expect(isMigratableLegacyKey(key), key).toBe(false)
    }
    for (const key of ['nf_novels', 'nf_scene_content:abc', 'nf_characters', 'nf_scene_versions:s1', 'nf_activeNovel']) {
      expect(isSensitiveStorageKey(key), key).toBe(false)
    }
  })
})

describe('layer 3: pre-fix residue is scrubbed on connect and in snapshots', () => {
  it('is covered by tauriVaultAdapter.test.js (live vault, snapshots, VACUUM residue) and the shared predicate is imported, not copied', () => {
    const adapter = read('storage/tauriVaultAdapter.js')
    expect(adapter).toMatch(/import \{ isSensitiveStorageKey \} from '\.\/legacyLocalMigration\.js'/)
    expect(adapter).not.toMatch(/const SENSITIVE_KEY_SUBSTRINGS/)
  })
})
