#!/usr/bin/env node
// Guards the one failure this script exists because of: `.github/workflows/qa.yml`
// lists its Playwright smoke jobs as a hand-maintained matrix, so a spec file can
// sit in tests/e2e/ and simply never run. `focused-writing.spec.js` did exactly
// that — present from the start, never listed, and by 2026-08-28 failing 4 of its
// 4 tests against the redesigned editor with nothing to notice. The matrix covered
// 13 of the directory's 14 spec files and no signal existed for the gap.
//
// Fails on drift in either direction: a spec that no job runs, or a job pointing
// at a spec that no longer exists.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflowPath = join(repoRoot, '.github/workflows/qa.yml')
const specDir = join(repoRoot, 'tests/e2e')

const workflow = readFileSync(workflowPath, 'utf8')

// Deliberately a regex over `spec: tests/e2e/<file>.spec.js` rather than a YAML
// parse: it needs no dependency, and the thing being checked is precisely the
// literal list of spec paths in the matrix.
const listed = new Set(
  [...workflow.matchAll(/^\s*spec:\s*(tests\/e2e\/[\w.-]+\.spec\.js)\s*$/gm)].map(match => match[1]),
)

const present = new Set(
  readdirSync(specDir)
    .filter(name => name.endsWith('.spec.js'))
    .map(name => `tests/e2e/${name}`),
)

const missing = [...present].filter(spec => !listed.has(spec)).sort()
const stale = [...listed].filter(spec => !present.has(spec)).sort()

if (missing.length || stale.length) {
  console.error('E2E smoke matrix is out of sync with tests/e2e/.\n')
  if (missing.length) {
    console.error('  Spec files that CI never runs (add them to the matrix in .github/workflows/qa.yml):')
    for (const spec of missing) console.error(`    - ${spec}`)
    console.error('')
  }
  if (stale.length) {
    console.error('  Matrix entries with no such spec file (remove them from .github/workflows/qa.yml):')
    for (const spec of stale) console.error(`    - ${spec}`)
    console.error('')
  }
  process.exit(1)
}

console.log(`E2E matrix check passed: all ${present.size} spec files in tests/e2e/ are covered by the CI matrix.`)
