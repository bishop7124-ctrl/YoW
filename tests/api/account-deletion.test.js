import { readFile } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HOLD_DAYS, runDeletions } from '../../api/_accountDeletion.js'
import { DAY_MS, FREE_INACTIVITY_DAYS } from '../../api/_accountLifecycle.js'

const UID = '00000000-0000-4000-8000-000000000001'
const NOW = new Date('2027-01-01T00:00:00Z')
const ago = (d) => new Date(NOW.getTime() - d * DAY_MS).toISOString()
const LAST = ago(FREE_INACTIVITY_DAYS + 95)

// In-memory fake of just what the deletion module uses, with per-call fault injection.
function makeFake({ journal = [], user } = {}) {
  const state = {
    journal: journal.map((r) => ({ ...r })),
    user: user === undefined ? { id: UID, last_sign_in_at: LAST, app_metadata: {}, user_metadata: {}, banned_until: null } : user,
    media: [`${UID}/a.png`, `${UID}/p/b.png`],
    scenes: 3,
    calls: [],
    fail: {},
  }
  const hit = (name) => { state.calls.push(name); const f = state.fail[name]; if (f && f.n-- > 0) return { message: `${name} failed` }; return null }
  const query = (table, rows) => {
    const filters = []
    let op = null; let patch = null
    const matches = () => rows().filter((r) => filters.every(([k, v]) => r[k] === v || (Array.isArray(v) && v.includes(r[k]))))
    const chain = {
      select: () => { if (!op) op = 'select'; return chain },
      eq: (k, v) => { filters.push([k, v]); return chain },
      in: (k, v) => { filters.push([k, v]); return chain },
      update: (p) => { op = 'update'; patch = p; return chain },
      delete: () => { op = 'delete'; return chain },
      insert: async (row) => {
        const err = hit(`insert:${table}`); if (err) return { error: err }
        if (rows().some((r) => r.user_id === row.user_id)) return { error: { code: '23505', message: 'dup' } }
        rows().push({ attempts: 0, ...row }); return { error: null }
      },
      then: (resolve) => {
        let out
        if (op === 'update') {
          const err = hit(`update:${table}`)
          if (err) out = { data: null, error: err }
          else { const m = matches(); m.forEach((r) => Object.assign(r, patch)); out = { data: m, error: null } }
        } else if (op === 'delete') {
          const err = hit(`delete:${table}`)
          if (err) out = { error: err }
          else {
            if (table === 'scenes') state.scenes = 0
            else { const m = matches(); m.forEach((r) => rows().splice(rows().indexOf(r), 1)) }
            out = { error: null }
          }
        } else out = { data: matches(), error: null }
        return Promise.resolve(out).then(resolve)
      },
    }
    return chain
  }
  const supabase = {
    from: (table) => query(table, () => (table === 'account_lifecycle_deletions' ? state.journal : [])),
    auth: { admin: {
      getUserById: async () => ({ data: { user: state.user }, error: null }),
      updateUserById: async (id, attrs) => {
        const err = hit('ban'); if (err) return { error: err }
        if ('ban_duration' in attrs) state.user = { ...state.user, banned_until: attrs.ban_duration === 'none' ? null : '2099-01-01T00:00:00Z' }
        return { error: null }
      },
      deleteUser: async () => { const err = hit('deleteUser'); if (err) return { error: err }; state.user = null; return { error: null } },
    } },
    storage: { from: () => ({
      list: async (prefix) => ({ data: state.media.filter((p) => p.startsWith(prefix + '/') && !p.slice(prefix.length + 1).includes('/')).map((p) => ({ name: p.slice(prefix.length + 1), id: 'x' })).concat(state.media.some((p) => p.startsWith(prefix + '/p/')) && prefix === UID ? [{ name: 'p', id: null }] : []), error: null }),
      remove: async (paths) => { const err = hit('storageRemove'); if (err) return { error: err }; state.media = state.media.filter((p) => !paths.includes(p)); return { error: null } },
    }) },
  }
  state.supabase = supabase
  return state
}

const item = (state) => ({ user: state.user, track: 'free_inactive', anchor: new Date(LAST), finalNoticeSentAt: ago(10), lastActivity: new Date(LAST) })
const run = (state, now = NOW, q) => runDeletions(state.supabase, q ?? (state.user ? [item(state)] : []), { now, maxPerRun: 10 })
const later = new Date(NOW.getTime() + (HOLD_DAYS + 1) * DAY_MS)
const phase = (s) => s.journal[0]?.phase

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

describe('AUD-05 account deletion lifecycle', () => {
  it('first run only HOLDS: blocks sign-in, deletes nothing', async () => {
    const s = makeFake()
    const r = await run(s)
    expect(r).toMatchObject({ held: 1, purged: 0 })
    expect(phase(s)).toBe('held')
    expect(s.user.banned_until).toBeTruthy()
    expect(s.media).toHaveLength(2)
    expect(s.scenes).toBe(3)
  })

  it('waits during the hold, then purges: account first, then media and scenes', async () => {
    const s = makeFake()
    await run(s)
    expect(await run(s, new Date(NOW.getTime() + 10 * DAY_MS))).toMatchObject({ waiting: 1, purged: 0 })
    expect(s.user).not.toBeNull()
    const r = await run(s, later)
    expect(r).toMatchObject({ purged: 1, failed: 0 })
    expect(s.user).toBeNull()
    expect(s.media).toHaveLength(0)
    expect(s.scenes).toBe(0)
    expect(phase(s)).toBe('completed')
  })

  it('failed hold (ban error) leaves nothing claimed and nothing deleted', async () => {
    const s = makeFake(); s.fail.ban = { n: 1 }
    expect(await run(s)).toMatchObject({ held: 0, failed: 1 })
    expect(s.journal).toHaveLength(0)
    expect(s.user.banned_until).toBeFalsy()
  })

  it('Auth delete failure keeps the account intact, blocked and retryable; media untouched', async () => {
    const s = makeFake(); await run(s)
    s.fail.deleteUser = { n: 1 }
    expect(await run(s, later)).toMatchObject({ purged: 0, failed: 1 })
    expect(s.user).not.toBeNull()
    expect(s.media).toHaveLength(2)
    expect(s.scenes).toBe(3)
    expect(phase(s)).toBe('held')
    expect(await run(s, later)).toMatchObject({ purged: 1 })
    expect(phase(s)).toBe('completed')
  })

  it('cleanup failure after the account is gone is resumed next run (media fails after nothing deleted, then succeeds)', async () => {
    const s = makeFake(); await run(s)
    s.fail.storageRemove = { n: 1 }
    expect(await run(s, later)).toMatchObject({ purged: 1, failed: 1 })
    expect(s.user).toBeNull()
    expect(phase(s)).toBe('purging')
    expect(s.journal[0].last_error).toMatch(/storageRemove/)
    expect(await run(s, later, [])).toMatchObject({ swept: 1, failed: 0 })
    expect(s.media).toHaveLength(0)
    expect(s.scenes).toBe(0)
    expect(phase(s)).toBe('completed')
  })

  it('scenes failure also resumes', async () => {
    const s = makeFake(); await run(s)
    s.fail['delete:scenes'] = { n: 1 }
    await run(s, later)
    expect(phase(s)).toBe('purging')
    await run(s, later, [])
    expect(phase(s)).toBe('completed')
    expect(s.scenes).toBe(0)
  })

  it('a sign-in between hold and purge cancels: unblocks, deletes nothing', async () => {
    const s = makeFake(); await run(s)
    s.user = { ...s.user, last_sign_in_at: ago(1) }
    expect(await run(s, later)).toMatchObject({ cancelled: 1, purged: 0 })
    expect(s.user.banned_until).toBeNull()
    expect(s.media).toHaveLength(2)
    expect(phase(s)).toBe('cancelled')
  })

  it('an upgrade between hold and purge cancels', async () => {
    const s = makeFake(); await run(s)
    s.user = { ...s.user, app_metadata: { subscription_plan: 'premium_monthly' } }
    expect(await run(s, later)).toMatchObject({ cancelled: 1, purged: 0 })
    expect(s.user).not.toBeNull()
  })

  it('support restore (ban lifted) cancels and is not re-held the next day', async () => {
    const s = makeFake(); await run(s)
    s.user = { ...s.user, banned_until: null }
    expect(await run(s, later)).toMatchObject({ cancelled: 1, purged: 0 })
    expect(await run(s, new Date(later.getTime() + DAY_MS))).toMatchObject({ held: 0, skipped: 1 })
    expect(s.user.banned_until).toBeNull()
  })

  it('does not hold if the account returned since the sweep read it', async () => {
    const s = makeFake()
    const it1 = item(s); s.user = { ...s.user, last_sign_in_at: ago(0) }
    expect(await run(s, NOW, [it1])).toMatchObject({ held: 0, skipped: 1 })
    expect(s.journal).toHaveLength(0)
  })

  it('a second worker cannot double-claim', async () => {
    const s = makeFake()
    const [a, b] = await Promise.all([run(s), run(s)])
    expect(a.held + b.held).toBe(1)
  })

  it('respects the per-run cap', async () => {
    const s = makeFake()
    const r = await runDeletions(s.supabase, [item(s), item(s)], { now: NOW, maxPerRun: 1 })
    expect(r.remaining).toBe(1)
  })

  it('migration is additive and constrains phase', async () => {
    const sql = await readFile(new URL('../../supabase/migrations/20261112120000_account_deletion_phases.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS phase/)
    expect(sql).toMatch(/CHECK \(phase IN \('held', 'purging', 'completed', 'cancelled'\)\)/)
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN/i)
  })
})
