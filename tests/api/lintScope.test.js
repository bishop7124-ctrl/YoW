import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '../..')

// Guards audit finding: package.json's lint script only ever targeted src,
// so api/, scripts/, and tests/ got zero lint coverage in CI even though
// npm run qa (and therefore CI) runs `npm run lint`. docs/YOW_CODE_AUDIT_2026-09-01.md
// Priority 2, "Static quality gates".
describe('lint scope (audit: static quality gates)', () => {
  it('npm run lint covers api/, scripts/, and tests/, not just src/', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
    const lintScript = pkg.scripts.lint
    for (const dir of ['src', 'api', 'scripts', 'tests']) {
      expect(lintScript).toMatch(new RegExp(`\\b${dir}\\b`))
    }
    expect(lintScript).toMatch(/\.mjs/)
  })

  it('eslint.config.js provides Node globals for api/, scripts/, and tests/', () => {
    const config = readFileSync(join(repoRoot, 'eslint.config.js'), 'utf8')
    expect(config).toMatch(/api\/\*\*/)
    expect(config).toMatch(/scripts\/\*\*/)
    expect(config).toMatch(/tests\/\*\*/)
    expect(config).toMatch(/globals\.node/)
  })

  it('eslint.config.js applies real lint rules (not just globals) to .mjs files', () => {
    // Regression guard: the base rules block originally only matched
    // **/*.{js,jsx}, so scripts/**/*.mjs got Node globals from the override
    // block below it but zero actual rules (js.configs.recommended,
    // no-unused-vars, etc.) — a real gap found by code review, not just
    // theoretical (confirmed live with a planted unused-var/undeclared-var
    // .mjs file before this test existed).
    const config = readFileSync(join(repoRoot, 'eslint.config.js'), 'utf8')
    const baseFilesMatch = config.match(/files:\s*\[['"]([^'"]+)['"]\]/)
    expect(baseFilesMatch).toBeTruthy()
    expect(baseFilesMatch[1]).toContain('mjs')
  })

  it('scripts/seed-test-data.mjs has no leftover content constants for retired project types', () => {
    // Play, Screenplay, TV Series, and Video Game were retired from active
    // scope (docs/ROADMAP.md); their large unused sample-content blocks in
    // this seed script were genuinely dead code, only surfaced once lint
    // actually ran against scripts/ for the first time.
    const seedScript = readFileSync(join(repoRoot, 'scripts/seed-test-data.mjs'), 'utf8')
    for (const name of ['PLAY_CONTENT', 'SCREENPLAY_CONTENT', 'TV_CONTENT', 'VIDEOGAME_CONTENT']) {
      expect(seedScript).not.toContain(name)
    }
    // The 6 active project types' content constants must still be present.
    for (const name of ['NOVELLA_CONTENT', 'SHORT_STORY_CONTENT', 'DND_CONTENT', 'TTRPG_CONTENT', 'COMIC_CONTENT']) {
      expect(seedScript).toContain(name)
    }
  })
})
