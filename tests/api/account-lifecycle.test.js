import { readFile } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildNotice,
  classifyLifecycle,
  DAY_MS,
  FREE_INACTIVITY_DAYS,
  GRACE_DAYS,
  graceEndsAt,
  hostingEndsAt,
  lifecycleTrackFor,
  mayExecuteIrreversible,
  NOTICE_SCHEDULE,
  STAGES,
  TRACKS,
} from '../../api/_lib/accountLifecycle.js'
import { getMembership } from '../../src/utils/membership.js'

const anchor = new Date('2026-01-01T00:00:00Z')
const at = (offsetDays, base = anchor) => new Date(base.getTime() + offsetDays * DAY_MS)
const hosting = (offset, sent = [], extra = {}) =>
  classifyLifecycle({ track: TRACKS.HOSTING_LAPSED, anchor, now: at(offset), sentNoticeKeys: sent, ...extra })
const free = (offset, sent = [], extra = {}) =>
  classifyLifecycle({ track: TRACKS.FREE_INACTIVE, anchor, now: at(FREE_INACTIVITY_DAYS + offset), sentNoticeKeys: sent, ...extra })

describe('account lifecycle: hosting_lapsed track', () => {
  it('stays active until 30 days before hosting ends, then warns', () => {
    expect(hosting(-31).stage).toBe(STAGES.ACTIVE)
    expect(hosting(-31).dueNotice).toBeNull()
    expect(hosting(-30).stage).toBe(STAGES.PRE_EXPIRY)
    expect(hosting(-30).dueNotice).toBe('pre_30')
    expect(hosting(-30, ['pre_30']).dueNotice).toBeNull()
    expect(hosting(-14, ['pre_30']).dueNotice).toBe('pre_14')
    expect(hosting(-1, ['pre_30', 'pre_14', 'pre_7']).dueNotice).toBe('pre_1')
  })

  it('opens a 90-day grace on expiry with cloud writes, reading and export still allowed', () => {
    const c = hosting(0)
    expect(c.stage).toBe(STAGES.GRACE)
    expect(c.cloudWritesAllowed).toBe(true)
    expect(c.exportAllowed).toBe(true)
    expect(hosting(GRACE_DAYS - 1).stage).toBe(STAGES.GRACE)
  })

  it('catches up missed notices one at a time, oldest first', () => {
    expect(hosting(65, ['pre_30', 'pre_14', 'pre_7', 'pre_1', 'grace_0']).dueNotice).toBe('grace_30')
    expect(hosting(65, ['pre_30', 'pre_14', 'pre_7', 'pre_1', 'grace_0', 'grace_30']).dueNotice).toBe('grace_60')
  })

  it('sends the final notice (the one with the export button) 7 days before grace ends', () => {
    const final = NOTICE_SCHEDULE[TRACKS.HOSTING_LAPSED].find((n) => n.final)
    expect(final.key).toBe('grace_83')
    expect(final.day).toBe(GRACE_DAYS - 7)
    const notice = buildNotice({ track: TRACKS.HOSTING_LAPSED, noticeKey: 'grace_83', daysLeft: 7 })
    expect(notice.final).toBe(true)
    expect(notice.text).toContain('How to export all your data')
    expect(notice.text).toContain('archived, not deleted')
  })

  it('archives only after grace AND a recorded final notice; never deletes', () => {
    const held = hosting(GRACE_DAYS)
    expect(held.stage).toBe(STAGES.ARCHIVE_DUE)
    expect(held.action).toBe('send_final_notice_first')
    expect(held.cloudWritesAllowed).toBe(false)
    expect(held.exportAllowed).toBe(true)

    const ready = hosting(GRACE_DAYS, ['grace_83'])
    expect(ready.action).toBe('archive')
    expect(['archive', 'send_final_notice_first', 'none']).toContain(ready.action)
  })

  it('treats an archived account as terminal with writes off and export on', () => {
    const c = hosting(400, ['grace_83'], { archivedAt: at(95) })
    expect(c.stage).toBe(STAGES.ARCHIVED)
    expect(c.action).toBe('none')
    expect(c.cloudWritesAllowed).toBe(false)
    expect(c.exportAllowed).toBe(true)
  })
})

describe('account lifecycle: free_inactive track', () => {
  it('does nothing before 18 months of inactivity', () => {
    expect(free(-1).stage).toBe(STAGES.ACTIVE)
    expect(free(-1).dueNotice).toBeNull()
  })

  it('starts the 90-day warning flow at 18 months', () => {
    expect(free(0).stage).toBe(STAGES.GRACE)
    expect(free(0).dueNotice).toBe('inactive_0')
    expect(free(GRACE_DAYS - 7, ['inactive_0', 'inactive_30', 'inactive_60']).dueNotice).toBe('inactive_83')
  })

  it('may only delete after grace AND the final notice; otherwise holds and asks for the notice', () => {
    expect(free(GRACE_DAYS).stage).toBe(STAGES.DELETE_DUE)
    expect(free(GRACE_DAYS).action).toBe('send_final_notice_first')
    expect(free(GRACE_DAYS, ['inactive_83']).action).toBe('delete')
  })

  it('a sign-in resets the clock (newer anchor puts the account back to active)', () => {
    const c = classifyLifecycle({
      track: TRACKS.FREE_INACTIVE,
      anchor: at(FREE_INACTIVITY_DAYS + 80),
      now: at(FREE_INACTIVITY_DAYS + 100),
      sentNoticeKeys: ['inactive_83'],
    })
    expect(c.stage).toBe(STAGES.ACTIVE)
    expect(c.action).toBe('none')
  })
})

describe('account lifecycle: irreversible-step guard', () => {
  const del = free(GRACE_DAYS, ['inactive_83'])
  const base = {
    classification: del,
    finalNoticeSentAt: at(FREE_INACTIVITY_DAYS + 83),
    lastActivity: anchor,
    anchorSeenAtNotice: anchor,
    now: at(FREE_INACTIVITY_DAYS + GRACE_DAYS),
  }

  it('allows delete only when the final notice was sent at least 7 days ago and nothing changed', () => {
    expect(mayExecuteIrreversible(base)).toBe(true)
    expect(mayExecuteIrreversible({ ...base, finalNoticeSentAt: at(FREE_INACTIVITY_DAYS + 87) })).toBe(false)
    expect(mayExecuteIrreversible({ ...base, finalNoticeSentAt: null })).toBe(false)
  })

  it('refuses when the user signed in after the first warning', () => {
    expect(mayExecuteIrreversible({ ...base, lastActivity: at(FREE_INACTIVITY_DAYS + 40) })).toBe(false)
  })

  it('refuses anything that is not an archive/delete decision', () => {
    expect(mayExecuteIrreversible({ ...base, classification: free(10) })).toBe(false)
    expect(mayExecuteIrreversible({ ...base, classification: free(GRACE_DAYS) })).toBe(false)
  })
})

describe('account lifecycle: who can ever be swept', () => {
  it('routes Lifetime to hosting_lapsed and plain Free to free_inactive', () => {
    expect(lifecycleTrackFor({ app_metadata: { subscription_plan: 'premium_plus_lifetime', subscription_status: 'active' } })).toBe(TRACKS.HOSTING_LAPSED)
    expect(lifecycleTrackFor({ app_metadata: {} })).toBe(TRACKS.FREE_INACTIVE)
    expect(lifecycleTrackFor({ app_metadata: { subscription_plan: 'free' } })).toBe(TRACKS.FREE_INACTIVE)
  })

  it.each([
    ['founder', { subscription_plan: 'founder', subscription_status: 'active' }],
    ['monthly', { subscription_plan: 'premium_monthly', subscription_status: 'active' }],
    ['trialing', { subscription_status: 'trialing' }],
    ['beta tester', { beta_tester: true, subscription_plan: 'beta_tester' }],
    ['cancelled monthly', { subscription_plan: 'premium_monthly', subscription_status: 'canceled' }],
    ['stripe customer', { stripe_customer_id: 'cus_x' }],
    ['admin', { is_admin: true }],
    ['held', { lifecycle_hold: true }],
  ])('never sweeps %s', (_label, app_metadata) => {
    expect(lifecycleTrackFor({ app_metadata })).toBeNull()
  })

  it('honours a user_metadata hold and tolerates a missing user', () => {
    expect(lifecycleTrackFor({ app_metadata: {}, user_metadata: { lifecycle_hold: true } })).toBeNull()
    expect(lifecycleTrackFor(null)).toBeNull()
  })

  it('derives the hosting end from the renewal date, else purchase + 3 years', () => {
    expect(hostingEndsAt({ app_metadata: { cloud_hosting_expires_at: '2027-05-01T00:00:00Z' } }).toISOString()).toBe('2027-05-01T00:00:00.000Z')
    const end = hostingEndsAt({ app_metadata: { lifetime_purchased_at: '2026-01-01T00:00:00Z' } })
    expect(Math.round((end - new Date('2026-01-01T00:00:00Z')) / DAY_MS)).toBe(3 * 365)
  })

  it('returns a harmless result for invalid input instead of throwing', () => {
    expect(classifyLifecycle({ track: 'nope', anchor, now: new Date() }).action).toBe('none')
    expect(classifyLifecycle({ track: TRACKS.HOSTING_LAPSED, anchor: 'garbage', now: new Date() }).stage).toBe(STAGES.NONE)
  })
})

describe('account lifecycle: notice wording', () => {
  it('has a notice for every scheduled key on both tracks, none promising deletion of paid data', () => {
    for (const track of Object.values(TRACKS)) {
      for (const { key } of NOTICE_SCHEDULE[track]) {
        const n = buildNotice({ track, noticeKey: key, daysLeft: 30 })
        expect(n.subject.length).toBeGreaterThan(10)
        expect(n.text).toContain('support@yourownworld.co.uk')
        if (track === TRACKS.HOSTING_LAPSED) expect(n.text).not.toMatch(/permanently deleted/i)
      }
    }
    expect(buildNotice({ track: TRACKS.HOSTING_LAPSED, noticeKey: 'missing' })).toBeNull()
  })

  it('does not say the lifetime licence expires', () => {
    for (const { key } of NOTICE_SCHEDULE[TRACKS.HOSTING_LAPSED]) {
      const n = buildNotice({ track: TRACKS.HOSTING_LAPSED, noticeKey: key })
      expect(n.text).not.toMatch(/licen[cs]e (has )?expired/i)
    }
  })
})

describe('account lifecycle: free-account notice wording', () => {
  const deadline = new Date('2027-03-15T12:00:00Z')
  const notice = (noticeKey) => buildNotice({ track: TRACKS.FREE_INACTIVE, noticeKey, deadline })

  it('states the exact log-in-by / deleted-on date in every free notice', () => {
    for (const { key } of NOTICE_SCHEDULE[TRACKS.FREE_INACTIVE]) {
      expect(notice(key).text).toContain('Log in by 15 March 2027, or on 15 March 2027 your account and all its data will be deleted.')
    }
  })

  it('uses instructions, not a button, and offers Lifetime access to the app', () => {
    for (const { key } of NOTICE_SCHEDULE[TRACKS.FREE_INACTIVE]) {
      expect(notice(key).text).not.toMatch(/button/i)
      expect(notice(key).text).toContain('Upgrade to Lifetime for lifetime access to the YOW app.')
      expect(notice(key).text).toContain('Account Settings > Storage > Export all projects')
    }
  })

  it('does not mention renewal or the hosting price to free accounts', () => {
    expect(notice('inactive_83').text).not.toMatch(/£6|renew/i)
  })

  it('computes the deadline as 18 months + 90 days after last activity', () => {
    expect(graceEndsAt(TRACKS.FREE_INACTIVE, anchor).getTime()).toBe(anchor.getTime() + (FREE_INACTIVITY_DAYS + GRACE_DAYS) * DAY_MS)
    expect(graceEndsAt(TRACKS.HOSTING_LAPSED, anchor).getTime()).toBe(anchor.getTime() + GRACE_DAYS * DAY_MS)
  })
})

describe('account lifecycle: client entitlement agrees with the policy', () => {
  it('a lapsed Lifetime user is Local Mode with Free cloud limits, never a deletion candidate', () => {
    const now = new Date('2026-10-01T00:00:00Z')
    const user = {
      id: 'u', created_at: '2022-01-01T00:00:00Z',
      app_metadata: { subscription_plan: 'premium_plus_lifetime', subscription_status: 'active', lifetime_purchased_at: '2022-01-01T00:00:00Z' },
    }
    const m = getMembership(user, now)
    expect(m.isLocalMode).toBe(true)
    expect(m.usesFreeCloudLimits).toBe(true)
    expect(lifecycleTrackFor(user)).toBe(TRACKS.HOSTING_LAPSED)
  })
})

describe('account_lifecycle_events migration', () => {
  it('is service-role only with RLS on and no client grants', async () => {
    const sql = await readFile(new URL('../../supabase/migrations/20261001120000_account_lifecycle_events.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON public\.account_lifecycle_events FROM anon, authenticated/)
    expect(sql).not.toMatch(/CREATE POLICY/)
    expect(sql).toMatch(/PRIMARY KEY \(user_id, track, event_key\)/)
  })
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { listUsers: (...a) => listUsers(...a), deleteUser: (...a) => deleteSpy(...a), updateUserById: (...a) => deleteSpy(...a) } },
    from: () => ({ select: () => ({ in: () => eventRows() }), insert: (...a) => insertSpy(...a), upsert: (...a) => insertSpy(...a), delete: (...a) => deleteSpy(...a) }),
  }),
}))

const { listUsers, eventRows, insertSpy, deleteSpy } = vi.hoisted(() => ({
  listUsers: vi.fn(), eventRows: vi.fn(), insertSpy: vi.fn(), deleteSpy: vi.fn(),
}))

describe('run-account-lifecycle handler', () => {
  const makeRes = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() })
  let handler

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub'
    process.env.CRON_SECRET = 's3cret'
    listUsers.mockReset().mockResolvedValue({ data: { users: [] }, error: null })
    eventRows.mockReset().mockResolvedValue({ data: [], error: null })
    insertSpy.mockClear()
    deleteSpy.mockClear()
    vi.resetModules()
    handler = (await import('../../api/run-account-lifecycle.js')).default
  })

  it('fails closed without CRON_SECRET and rejects wrong tokens', async () => {
    delete process.env.CRON_SECRET
    let res = makeRes()
    await handler({ method: 'GET', headers: {} }, res)
    expect(res.status).toHaveBeenCalledWith(500)
    process.env.CRON_SECRET = 's3cret'
    res = makeRes()
    await handler({ method: 'GET', headers: { authorization: 'Bearer nope' } }, res)
    expect(res.status).toHaveBeenCalledWith(401)
    res = makeRes()
    await handler({ method: 'DELETE', headers: {} }, res)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('reports due notices and decision points without writing, emailing, archiving or deleting', async () => {
    const day = DAY_MS
    const ago = (d) => new Date(Date.now() - d * day).toISOString()
    listUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'inactive-grace', email: 'a@x.test', created_at: ago(900), last_sign_in_at: ago(FREE_INACTIVITY_DAYS + 5), app_metadata: {}, user_metadata: {} },
          { id: 'inactive-delete-held', email: 'b@x.test', created_at: ago(900), last_sign_in_at: ago(FREE_INACTIVITY_DAYS + 95), app_metadata: {}, user_metadata: {} },
          { id: 'lifetime-lapsed', email: 'c@x.test', created_at: ago(2000), app_metadata: { subscription_plan: 'premium_plus_lifetime', subscription_status: 'active', cloud_hosting_expires_at: ago(95) }, user_metadata: {} },
          { id: 'founder', email: 'd@x.test', created_at: ago(2000), app_metadata: { subscription_plan: 'founder' }, user_metadata: {} },
          { id: 'recent-free', email: 'e@x.test', created_at: ago(10), last_sign_in_at: ago(1), app_metadata: {}, user_metadata: {} },
        ],
      },
      error: null,
    })
    eventRows.mockResolvedValue({ data: [], error: null })
    const res = makeRes()
    await handler({ method: 'GET', headers: { authorization: 'Bearer s3cret' } }, res)
    expect(res.status).toHaveBeenCalledWith(200)
    const body = res.json.mock.calls[0][0]
    expect(body.mode).toBe('report-only')
    expect(body.swept).toBe(4)
    expect(body.noticesDue.map((r) => r.userId)).toEqual(['inactive-grace'])
    expect(body.blockedFinalNotice.map((r) => r.userId).sort()).toEqual(['inactive-delete-held', 'lifetime-lapsed'])
    expect(body.archiveDecisions).toEqual([])
    expect(body.deleteDecisions).toEqual([])
    expect(JSON.stringify(body)).not.toMatch(/@x\.test/)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('surfaces archive/delete decisions only once the final notice is recorded', async () => {
    const ago = (d) => new Date(Date.now() - d * DAY_MS).toISOString()
    listUsers.mockResolvedValue({
      data: { users: [
        { id: 'lifetime-lapsed', created_at: ago(2000), app_metadata: { subscription_plan: 'premium_plus_lifetime', cloud_hosting_expires_at: ago(95) }, user_metadata: {} },
        { id: 'inactive-old', created_at: ago(900), last_sign_in_at: ago(FREE_INACTIVITY_DAYS + 95), app_metadata: {}, user_metadata: {} },
      ] },
      error: null,
    })
    eventRows.mockResolvedValue({ data: [
      { user_id: 'lifetime-lapsed', track: 'hosting_lapsed', event_key: 'grace_83' },
      { user_id: 'inactive-old', track: 'free_inactive', event_key: 'inactive_83' },
    ], error: null })
    const res = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer s3cret' } }, res)
    const body = res.json.mock.calls[0][0]
    expect(body.archiveDecisions.map((r) => r.userId)).toEqual(['lifetime-lapsed'])
    expect(body.deleteDecisions.map((r) => r.userId)).toEqual(['inactive-old'])
    expect(deleteSpy).not.toHaveBeenCalled()
  })
})
