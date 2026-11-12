import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MIN_RETRY_AFTER_FAILURE_MS, backupKey, buildBackupEntry, normalizeRetention, readBackups, resetBackupFailuresForTests,
  runAutoBackupIfDue, shouldCreateAutoBackup, stripMediaFromBackup,
} from './projectBackups'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-12T12:00:00Z')
beforeEach(() => resetBackupFailuresForTests())

describe('shouldCreateAutoBackup', () => {
  it('never for manual or unknown frequencies', () => {
    expect(shouldCreateAutoBackup({ frequency: 'manual' }, null, NOW)).toBe(false)
    expect(shouldCreateAutoBackup({ frequency: 'hourly' }, null, NOW)).toBe(false)
    expect(shouldCreateAutoBackup(null, null, NOW)).toBe(false)
  })
  it('daily: due after a full day, or when there is none or the date is unreadable', () => {
    const daily = { frequency: 'daily' }
    expect(shouldCreateAutoBackup(daily, null, NOW)).toBe(true)
    expect(shouldCreateAutoBackup(daily, 'not a date', NOW)).toBe(true)
    expect(shouldCreateAutoBackup(daily, new Date(NOW - DAY + 60000).toISOString(), NOW)).toBe(false)
    expect(shouldCreateAutoBackup(daily, new Date(NOW - DAY).toISOString(), NOW)).toBe(true)
  })
  it('weekly: due after seven days', () => {
    const weekly = { frequency: 'weekly' }
    expect(shouldCreateAutoBackup(weekly, new Date(NOW - 6 * DAY).toISOString(), NOW)).toBe(false)
    expect(shouldCreateAutoBackup(weekly, new Date(NOW - 7 * DAY).toISOString(), NOW)).toBe(true)
  })
})

describe('helpers', () => {
  it('clamps retention to 1 to 20 with a default of 5', () => {
    expect([normalizeRetention(0), normalizeRetention('99'), normalizeRetention('7'), normalizeRetention('x')]).toEqual([5, 20, 7, 5])
  })
  it('strips media only when the writer chose to exclude it', () => {
    const data = { project: { title: 'T', coverPhoto: 'c', bannerImage: 'b' }, characters: [{ id: 'c1', image: 'i' }] }
    expect(buildBackupEntry(data, { includeMedia: true, includeCustomerData: true }).data.project.coverPhoto).toBe('c')
    const stripped = buildBackupEntry(data, { includeMedia: false, includeCustomerData: false }, 'auto', 'automatic', NOW)
    expect(stripped.data.project.coverPhoto).toBeNull()
    expect(stripped.data.characters[0].image).toBeNull()
    expect(stripped).toMatchObject({ kind: 'auto', title: 'T', createdAt: new Date(NOW).toISOString() })
    expect(stripped.data.backup.source).toBe('automatic')
    expect(buildBackupEntry(null, {})).toBeNull()
    expect(stripMediaFromBackup({}).characters).toEqual([])
  })
  it('reads a stored list defensively', () => {
    expect(readBackups(() => '[{"id":"a"}]', 'p1')).toEqual([{ id: 'a' }])
    expect(readBackups(() => 'garbage', 'p1')).toEqual([])
    expect(readBackups(() => '{"not":"a list"}', 'p1')).toEqual([])
    expect(readBackups(() => null, 'p1')).toEqual([])
  })
})

describe('runAutoBackupIfDue (no settings dialog involved)', () => {
  const makeEnv = (backupConfig, stored = []) => {
    const storage = new Map(stored.length ? [[backupKey('p1'), JSON.stringify(stored)]] : [])
    return {
      storage,
      novel: { id: 'p1', backupConfig },
      getProjectExportData: vi.fn(() => ({ project: { title: 'World' }, scenes: [{ id: 's1' }] })),
      readItem: key => storage.get(key) ?? null,
      writeItem: vi.fn((key, value) => { storage.set(key, value) }),
      updateNovel: vi.fn(),
      now: NOW,
    }
  }

  it('makes a snapshot when a day has passed, keeps the newest within the retention, and records the time on the project', () => {
    const old = Array.from({ length: 5 }, (_, i) => ({ id: `old${i}` }))
    const env = makeEnv({ frequency: 'daily', retention: 3, lastBackupAt: new Date(NOW - 2 * DAY).toISOString() }, old)
    expect(runAutoBackupIfDue(env)).toEqual({ created: true, reason: 'created' })
    const saved = JSON.parse(env.storage.get(backupKey('p1')))
    expect(saved).toHaveLength(3)
    expect(saved[0]).toMatchObject({ kind: 'auto', title: 'World' })
    expect(saved.slice(1).map(e => e.id)).toEqual(['old0', 'old1'])
    expect(env.updateNovel).toHaveBeenCalledWith('p1', { backupConfig: expect.objectContaining({ frequency: 'daily', lastBackupAt: saved[0].createdAt }) })
  })

  it('does nothing when not due, when manual, or without a project or data', () => {
    expect(runAutoBackupIfDue(makeEnv({ frequency: 'daily', lastBackupAt: new Date(NOW - 3600000).toISOString() })).reason).toBe('not-due')
    expect(runAutoBackupIfDue(makeEnv({ frequency: 'manual' })).reason).toBe('not-due')
    expect(runAutoBackupIfDue({ ...makeEnv({ frequency: 'daily' }), novel: null }).reason).toBe('no-project')
    const noData = { ...makeEnv({ frequency: 'daily' }), getProjectExportData: () => null }
    expect(runAutoBackupIfDue(noData)).toEqual({ created: false, reason: 'no-data' })
  })

  it('survives a full disk: leaves the project alone and waits an hour before trying again', () => {
    const env = makeEnv({ frequency: 'daily' })
    env.writeItem = vi.fn(() => { throw new Error('QuotaExceededError') })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(runAutoBackupIfDue(env).reason).toBe('failed')
    expect(env.updateNovel).not.toHaveBeenCalled()
    expect(runAutoBackupIfDue({ ...env, now: NOW + 60000 }).reason).toBe('cooling-down')
    expect(env.writeItem).toHaveBeenCalledTimes(1)
    env.writeItem = vi.fn((key, value) => { env.storage.set(key, value) })
    expect(runAutoBackupIfDue({ ...env, now: NOW + MIN_RETRY_AFTER_FAILURE_MS + 1 }).created).toBe(true)
    warn.mockRestore()
  })
})
