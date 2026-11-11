import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const runner = readFileSync(new URL('../../scripts/db-replay/replay.sh', import.meta.url), 'utf8')
const fixtures = []

afterEach(() => {
  // Only remove directories this test allocated; the replay's rm command is a no-op stub.
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true })
})

function runReplay({ failures = {}, continueOnError = false } = {}) {
  const fixture = mkdtempSync(join(tmpdir(), 'yow-replay-runner-test-'))
  fixtures.push(fixture)
  const root = join(fixture, 'repo')
  const bin = join(fixture, 'bin')
  const data = join(fixture, 'data')
  const shared = join(fixture, 'share')
  const log = join(fixture, 'commands.jsonl')
  for (const directory of [bin, data, join(shared, 'extension'), join(root, 'scripts/db-replay'), join(root, 'supabase/migrations')]) {
    mkdirSync(directory, { recursive: true })
  }
  writeFileSync(join(root, 'scripts/db-replay/replay.sh'), runner)
  for (const file of ['bootstrap.sql', 'checks.sql']) writeFileSync(join(root, 'scripts/db-replay', file), '-- inert fixture')
  for (const file of ['001_first.sql', '002_second.sql', '003_third.sql']) writeFileSync(join(root, 'supabase/migrations', file), '-- inert fixture')
  // Prevent even the fixture runner's extension-install path; no real Postgres sharedir is consulted.
  writeFileSync(join(shared, 'extension/pg_net.control'), 'inert fixture')
  const marker = join(data, 'must-survive')
  writeFileSync(marker, 'The stubbed rm/initdb must not touch this.')
  writeFileSync(log, '')

  const stub = `#!${process.execPath}
const fs = require('node:fs')
const path = require('node:path')
const command = path.basename(process.argv[1])
const args = process.argv.slice(2)
fs.appendFileSync(process.env.REPLAY_TEST_LOG, JSON.stringify({ command, args }) + '\\n')
const fail = JSON.parse(process.env.REPLAY_TEST_FAILURES)
const stdin = () => fs.readFileSync(0, 'utf8')
switch (command) {
  case 'dirname': process.stdout.write(path.dirname(args[0]) + '\\n'); break
  case 'basename': process.stdout.write(path.basename(args[0]) + '\\n'); break
  case 'id': process.stdout.write('1000\\n'); break
  case 'pg_config': process.stdout.write(process.env.REPLAY_TEST_SHARED + '\\n'); break
  case 'ls': process.stdout.write(args.join('\\n') + '\\n'); break
  case 'sort': process.stdout.write(stdin().trimEnd().split('\\n').sort().join('\\n') + '\\n'); break
  case 'head': process.stdout.write(stdin().split('\\n').slice(0, 3).join('\\n')); break
  case 'tr': process.stdout.write(stdin().replace(/\\n/g, ' ')); break
  case 'rm': case 'mkdir': break // Recorded only, never modify the filesystem.
  case 'initdb': process.exit(fail.initdb || 0); break
  case 'pg_ctl': process.exit(args.includes('start') ? fail.start || 0 : 0); break
  case 'psql': {
    const file = path.basename(args[args.indexOf('-f') + 1])
    if (fail[file]) process.stderr.write('synthetic failure: ' + file + '\\n')
    process.exit(fail[file] || 0)
    break
  }
  default: process.stderr.write('Forbidden command: ' + command); process.exit(99)
}
`
  // PATH contains ONLY these stubs. No real destructive/service command is reachable.
  for (const command of ['dirname', 'basename', 'id', 'pg_config', 'ls', 'sort', 'head', 'tr', 'rm', 'mkdir', 'initdb', 'pg_ctl', 'psql', 'tee', 'sudo', 'runuser', 'chown']) {
    writeFileSync(join(bin, command), stub, { mode: 0o755 })
  }
  const result = spawnSync('/bin/bash', [join(root, 'scripts/db-replay/replay.sh')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
    env: {
      PATH: bin,
      PGBIN: bin,
      DATA: data,
      PGPORT: '55432',
      REPLAY_TEST_LOG: log,
      REPLAY_TEST_SHARED: shared,
      REPLAY_TEST_FAILURES: JSON.stringify(failures),
      ...(continueOnError ? { CONTINUE: '1' } : {}),
    },
  })
  expect(result.error).toBeUndefined()
  expect(readFileSync(marker, 'utf8')).toBe('The stubbed rm/initdb must not touch this.')
  const commands = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  expect(commands.some(({ command }) => ['tee', 'sudo', 'runuser', 'chown'].includes(command))).toBe(false)
  const sqlFiles = commands.filter(({ command }) => command === 'psql').map(({ args }) => args[args.indexOf('-f') + 1].split('/').pop())
  const stopped = commands.some(({ command, args }) => command === 'pg_ctl' && args.includes('stop'))
  return { ...result, commands, sqlFiles, stopped }
}

describe('database replay runner exit status (stubbed commands only)', () => {
  it('returns the failed post-check status and still stops the synthetic server', () => {
    const result = runReplay({ failures: { 'checks.sql': 3 } })
    expect(result.status).toBe(3)
    expect(result.sqlFiles).toEqual(['bootstrap.sql', '001_first.sql', '002_second.sql', '003_third.sql', 'checks.sql'])
    expect(result.stopped).toBe(true)
  })

  it('returns zero only when migrations and post-checks succeed', () => {
    const result = runReplay()
    expect(result.status).toBe(0)
    expect(result.sqlFiles.at(-1)).toBe('checks.sql')
    const check = result.commands.find(({ command, args }) => command === 'psql' && args.some(arg => arg.endsWith('/checks.sql')))
    expect(check.args).toContain('ON_ERROR_STOP=1')
    expect(result.stopped).toBe(true)
  })

  it('stops after a migration failure and skips post-checks by default', () => {
    const result = runReplay({ failures: { '002_second.sql': 3 } })
    expect(result.status).toBe(1)
    expect(result.sqlFiles).toEqual(['bootstrap.sql', '001_first.sql', '002_second.sql'])
    expect(result.stdout).toContain('replayed 2 migration files, 1 failed')
    expect(result.stopped).toBe(true)
  })

  it('CONTINUE runs remaining migrations but still fails and skips post-checks', () => {
    const result = runReplay({ failures: { '001_first.sql': 3, '003_third.sql': 3 }, continueOnError: true })
    expect(result.status).toBe(2)
    expect(result.sqlFiles).toEqual(['bootstrap.sql', '001_first.sql', '002_second.sql', '003_third.sql'])
    expect(result.stdout).toContain('replayed 3 migration files, 2 failed')
    expect(result.stopped).toBe(true)
  })

  it('bootstrap failure returns setup failure without running migrations', () => {
    const result = runReplay({ failures: { 'bootstrap.sql': 3 } })
    expect(result.status).toBe(2)
    expect(result.sqlFiles).toEqual(['bootstrap.sql'])
    expect(result.stopped).toBe(true)
  })
})
