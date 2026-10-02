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
} from '../../api/_accountLifecycle.js'
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

describe('notice HTML email', () => {
  const deadline = new Date('2027-03-01T12:00:00Z')
  const every = []
  for (const [track, entries] of Object.entries(NOTICE_SCHEDULE)) {
    for (const entry of entries) every.push({ track, key: entry.key })
  }

  it.each(every)('renders $track / $key in the YOW email style with the same wording as the text part', ({ track, key }) => {
    const n = buildNotice({ track, noticeKey: key, daysLeft: 40, deadline })
    expect(n.html).toMatch(/^<!DOCTYPE html>/)
    // house style shared with the other YOW emails
    expect(n.html).toContain('#133840')
    expect(n.html).toContain('#0d282e')
    expect(n.html).toContain('#e8724e')
    expect(n.html).toContain('Your Own World')
    expect(n.html).toContain(n.exportUrl)
    expect(n.html).toContain('Export all projects')
    expect(n.html).toContain('support@yourownworld.co.uk')
    // every sentence of the approved text appears in the HTML (HTML-escaped)
    const esc = (v) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
    for (const line of n.text.split('\n').filter(Boolean)) {
      if (line.startsWith('How to export all your data: ')) {
        expect(n.html).toContain(esc(line.replace('How to export all your data: ', '')))
      } else {
        expect(n.html).toContain(esc(line))
      }
    }
    expect(n.html).toContain(esc(n.subject))
    expect(n.html).toContain(n.final ? 'Final notice' : 'Account notice')
  })

  it('never emits unescaped markup from dynamic values', () => {
    const n = buildNotice({ track: 'free_inactive', noticeKey: 'inactive_0', siteUrl: 'https://x.test/"><script>alert(1)</script>' })
    expect(n.html).not.toContain('<script>')
    expect(n.html).not.toMatch(/href="[^"]*"><script/)
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
    auth: { admin: { listUsers: (...a) => listUsers(...a), getUserById: (...a) => getUserById(...a), deleteUser: (...a) => deleteUserSpy(...a), updateUserById: (...a) => updateSpy(...a) } },
    storage: { from: () => ({ list: (...a) => storageList(...a), remove: (...a) => storageRemove(...a) }) },
    from: () => ({
      select: () => ({ in: () => eventRows() }),
      insert: (...a) => insertSpy(...a),
      upsert: (...a) => upsertSpy(...a),
      update: (...a) => { updateRowSpy(...a); return { eq: () => ({ error: null }) } },
      delete: () => {
        const chain = { eq: (...a) => { deleteSpy(...a); return chain } }
        return chain
      },
    }),
  }),
}))

const { listUsers, eventRows, insertSpy, deleteSpy, updateSpy, getUserById, deleteUserSpy, upsertSpy, updateRowSpy, storageList, storageRemove } = vi.hoisted(() => ({
  listUsers: vi.fn(), eventRows: vi.fn(), insertSpy: vi.fn(), deleteSpy: vi.fn(), updateSpy: vi.fn(),
  getUserById: vi.fn(), deleteUserSpy: vi.fn(), upsertSpy: vi.fn(), updateRowSpy: vi.fn(), storageList: vi.fn(), storageRemove: vi.fn(),
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
    insertSpy.mockReset().mockResolvedValue({ error: null })
    deleteSpy.mockReset()
    updateSpy.mockReset().mockResolvedValue({ error: null })
    getUserById.mockReset()
    deleteUserSpy.mockReset().mockResolvedValue({ error: null })
    upsertSpy.mockReset().mockResolvedValue({ error: null })
    updateRowSpy.mockReset()
    storageList.mockReset().mockResolvedValue({ data: [], error: null })
    storageRemove.mockReset().mockResolvedValue({ error: null })
    delete process.env.ACCOUNT_LIFECYCLE_DELETE_FREE
    delete process.env.ACCOUNT_LIFECYCLE_SEND_EMAILS
    delete process.env.ACCOUNT_LIFECYCLE_ARCHIVE
    delete process.env.RESEND_API_KEY
    process.env.ACCOUNT_LIFECYCLE_SEND_SPACING_MS = '0'
    vi.unstubAllGlobals()
    vi.resetModules()
    handler = (await import('../../api/_runAccountLifecycle.js')).default
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
    expect(updateSpy).not.toHaveBeenCalled()
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

describe('run-account-lifecycle send + archive (gated)', () => {
  const makeRes = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() })
  const T0 = Date.now() // fixed base so ledger anchors equal the users' dates exactly
  const ago = (d) => new Date(T0 - d * DAY_MS).toISOString()
  const auth = { authorization: 'Bearer s3cret' }
  const UID1 = '11111111-1111-4111-8111-111111111111'
  const UID2 = '22222222-2222-4222-8222-222222222222'
  const UID3 = '33333333-3333-4333-8333-333333333333'
  // Ledger rows for a Free account that has had its first warning and a final notice 10 days ago.
  const FREE_READY = (id) => [
    { user_id: id, track: 'free_inactive', event_key: 'inactive_0', created_at: ago(100), anchor_at: ago(FREE_INACTIVITY_DAYS + 95) },
    { user_id: id, track: 'free_inactive', event_key: 'inactive_83', created_at: ago(10), anchor_at: ago(FREE_INACTIVITY_DAYS + 95) },
  ]
  let handler
  let fetchMock

  const inactive = (id, daysPast = 5) => ({ id, email: `${id}@x.test`, created_at: ago(900), last_sign_in_at: ago(FREE_INACTIVITY_DAYS + daysPast), app_metadata: {}, user_metadata: {} })
  const lapsed = (id, extra = {}) => ({ id, email: `${id}@x.test`, created_at: ago(2000), app_metadata: { subscription_plan: 'premium_plus_lifetime', cloud_hosting_expires_at: ago(95), ...extra }, user_metadata: {} })

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub'
    process.env.CRON_SECRET = 's3cret'
    process.env.ACCOUNT_LIFECYCLE_SEND_SPACING_MS = '0'
    delete process.env.ACCOUNT_LIFECYCLE_SEND_EMAILS
    delete process.env.ACCOUNT_LIFECYCLE_ARCHIVE
    delete process.env.RESEND_API_KEY
    listUsers.mockReset().mockResolvedValue({ data: { users: [] }, error: null })
    eventRows.mockReset().mockResolvedValue({ data: [], error: null })
    insertSpy.mockReset().mockResolvedValue({ error: null })
    deleteSpy.mockReset()
    updateSpy.mockReset().mockResolvedValue({ error: null })
    getUserById.mockReset()
    deleteUserSpy.mockReset().mockResolvedValue({ error: null })
    upsertSpy.mockReset().mockResolvedValue({ error: null })
    updateRowSpy.mockReset()
    storageList.mockReset().mockResolvedValue({ data: [], error: null })
    storageRemove.mockReset().mockResolvedValue({ error: null })
    delete process.env.ACCOUNT_LIFECYCLE_DELETE_FREE
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    handler = (await import('../../api/_runAccountLifecycle.js')).default
  })

  const run = async (query) => {
    const res = makeRes()
    await handler({ method: 'GET', headers: auth, query }, res)
    return res.json.mock.calls[0][0]
  }

  it('never sends or archives without BOTH the setting and the request flag', async () => {
    listUsers.mockResolvedValue({ data: { users: [inactive('a')] }, error: null })
    process.env.RESEND_API_KEY = 're_test'
    // flag only
    let body = await run({ send: '1', archive: '1' })
    expect(body.mode).toBe('report-only')
    expect(body.sendSkipped).toMatch(/ACCOUNT_LIFECYCLE_SEND_EMAILS/)
    expect(body.archiveSkipped).toMatch(/ACCOUNT_LIFECYCLE_ARCHIVE/)
    // setting only
    process.env.ACCOUNT_LIFECYCLE_SEND_EMAILS = 'true'
    process.env.ACCOUNT_LIFECYCLE_ARCHIVE = 'true'
    body = await run({})
    expect(body.mode).toBe('report-only')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('logs a counts-only summary (no ids or emails) for the Vercel logs', async () => {
    listUsers.mockResolvedValue({ data: { users: [inactive('secret-id-1')] }, error: null })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await run({})
    const line = log.mock.calls.map((c) => c.join(' ')).find((l) => l.includes('[run-account-lifecycle] summary'))
    log.mockRestore()
    expect(line).toContain('"noticesDue":1')
    expect(line).not.toMatch(/secret-id-1|@x\.test/)
  })

  it('does nothing and records nothing when sending is on but RESEND_API_KEY is missing', async () => {
    listUsers.mockResolvedValue({ data: { users: [inactive('a')] }, error: null })
    process.env.ACCOUNT_LIFECYCLE_SEND_EMAILS = 'true'
    const body = await run({ send: '1' })
    expect(body.mode).toBe('report-only')
    expect(body.sendSkipped).toMatch(/RESEND_API_KEY/)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('records the ledger row BEFORE sending, then sends the approved notice via Resend', async () => {
    listUsers.mockResolvedValue({ data: { users: [inactive('a')] }, error: null })
    process.env.ACCOUNT_LIFECYCLE_SEND_EMAILS = 'true'
    process.env.RESEND_API_KEY = 're_test'
    const order = []
    insertSpy.mockImplementation(async () => { order.push('insert'); return { error: null } })
    fetchMock.mockImplementation(async () => { order.push('send'); return { ok: true, status: 200 } })
    const body = await run({ send: '1' })
    expect(order).toEqual(['insert', 'send'])
    expect(body.mode).toBe('send')
    expect(body.emails).toMatchObject({ sent: 1, failed: 0, uncertain: 0 })
    expect(insertSpy.mock.calls[0][0]).toMatchObject({ user_id: 'a', track: 'free_inactive', event_key: 'inactive_0' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer re_test')
    // the ledger row, not a Resend idempotency key, is the duplicate guard (a reused key 409s for 24h)
    expect(init.headers['Idempotency-Key']).toBeUndefined()
    const sent = JSON.parse(init.body)
    expect(sent.to).toEqual(['a@x.test'])
    expect(sent.subject).toBeTruthy()
    expect(sent.html).toMatch(/^<!DOCTYPE html>/)
    expect(sent.html).toContain('#e8724e')
    expect(sent.text).toContain('How to export all your data')
    expect(JSON.stringify(body)).not.toMatch(/@x\.test/)
  })

  it('skips a notice whose ledger row already exists (never sent twice)', async () => {
    listUsers.mockResolvedValue({ data: { users: [inactive('a')] }, error: null })
    process.env.ACCOUNT_LIFECYCLE_SEND_EMAILS = 'true'
    process.env.RESEND_API_KEY = 're_test'
    insertSpy.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    const body = await run({ send: '1' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(body.emails).toMatchObject({ sent: 0, alreadyRecorded: 1 })
  })

  it('does not re-send a notice the ledger already shows as sent', async () => {
    listUsers.mockResolvedValue({ data: { users: [inactive('a')] }, error: null })
    eventRows.mockResolvedValue({ data: [{ user_id: 'a', track: 'free_inactive', event_key: 'inactive_0', created_at: ago(1) }], error: null })
    process.env.ACCOUNT_LIFECYCLE_SEND_EMAILS = 'true'
    process.env.RESEND_API_KEY = 're_test'
    await run({ send: '1' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('frees the ledger row when Resend refuses (retry tomorrow) but keeps it on an unknown network outcome', async () => {
    listUsers.mockResolvedValue({ data: { users: [inactive('a'), inactive('b')] }, error: null })
    process.env.ACCOUNT_LIFECYCLE_SEND_EMAILS = 'true'
    process.env.RESEND_API_KEY = 're_test'
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockRejectedValueOnce(new Error('socket hang up'))
    const body = await run({ send: '1' })
    expect(body.emails).toMatchObject({ sent: 0, failed: 1, uncertain: 1 })
    // only the refused one (a) was removed from the ledger
    expect(deleteSpy.mock.calls.map((c) => c[1])).toEqual(['a', 'free_inactive', 'inactive_0'])
  })

  it('sends at most 20 emails per run', async () => {
    listUsers.mockResolvedValue({ data: { users: Array.from({ length: 25 }, (_, i) => inactive(`u${i}`)) }, error: null })
    process.env.ACCOUNT_LIFECYCLE_SEND_EMAILS = 'true'
    process.env.RESEND_API_KEY = 're_test'
    const body = await run({ send: '1' })
    expect(fetchMock).toHaveBeenCalledTimes(20)
    expect(insertSpy).toHaveBeenCalledTimes(20)
    expect(body.emails).toMatchObject({ sent: 20, remaining: 5, maxPerRun: 20 })
  })

  it('archives a Lifetime account after grace + a final notice recorded 7+ days ago, by stamping only', async () => {
    listUsers.mockResolvedValue({ data: { users: [lapsed('lt')] }, error: null })
    eventRows.mockResolvedValue({ data: [{ user_id: 'lt', track: 'hosting_lapsed', event_key: 'grace_83', created_at: ago(8) }], error: null })
    process.env.ACCOUNT_LIFECYCLE_ARCHIVE = 'true'
    const body = await run({ archive: '1' })
    expect(body.mode).toBe('archive')
    expect(body.archive).toMatchObject({ archived: 1, failed: 0 })
    expect(updateSpy).toHaveBeenCalledTimes(1)
    const [id, attrs] = updateSpy.mock.calls[0]
    expect(id).toBe('lt')
    expect(Object.keys(attrs)).toEqual(['app_metadata'])
    expect(Object.keys(attrs.app_metadata)).toEqual(['cloud_archived_at'])
    expect(new Date(attrs.app_metadata.cloud_archived_at).getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect(insertSpy.mock.calls[0][0]).toMatchObject({ user_id: 'lt', event_key: 'archived' })
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not archive when the final notice is missing, too recent, or the account is already archived', async () => {
    listUsers.mockResolvedValue({ data: { users: [lapsed('none'), lapsed('recent'), lapsed('done', { cloud_archived_at: ago(3) })] }, error: null })
    eventRows.mockResolvedValue({ data: [
      { user_id: 'recent', track: 'hosting_lapsed', event_key: 'grace_83', created_at: ago(2) },
      { user_id: 'done', track: 'hosting_lapsed', event_key: 'grace_83', created_at: ago(20) },
    ], error: null })
    process.env.ACCOUNT_LIFECYCLE_ARCHIVE = 'true'
    const body = await run({ archive: '1' })
    expect(body.archive).toMatchObject({ archived: 0 })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('caps archives at 20 per run', async () => {
    const users = Array.from({ length: 22 }, (_, i) => lapsed(`l${i}`))
    listUsers.mockResolvedValue({ data: { users }, error: null })
    eventRows.mockResolvedValue({ data: users.map((u) => ({ user_id: u.id, track: 'hosting_lapsed', event_key: 'grace_83', created_at: ago(8) })), error: null })
    process.env.ACCOUNT_LIFECYCLE_ARCHIVE = 'true'
    const body = await run({ archive: '1' })
    expect(updateSpy).toHaveBeenCalledTimes(20)
    expect(body.archive).toMatchObject({ archived: 20, remaining: 2 })
  })

  it('does not delete Free accounts unless BOTH the setting and ?delete=1 are present', async () => {
    listUsers.mockResolvedValue({ data: { users: [inactive(UID1, 95)] }, error: null })
    eventRows.mockResolvedValue({ data: FREE_READY(UID1), error: null })
    process.env.ACCOUNT_LIFECYCLE_SEND_EMAILS = 'true'
    process.env.ACCOUNT_LIFECYCLE_ARCHIVE = 'true'
    process.env.RESEND_API_KEY = 're_test'
    let body = await run({ send: '1', archive: '1', delete: '1' }) // flag only
    expect(body.deleteSkipped).toMatch(/ACCOUNT_LIFECYCLE_DELETE_FREE/)
    process.env.ACCOUNT_LIFECYCLE_DELETE_FREE = 'true'
    body = await run({ send: '1', archive: '1' }) // setting only
    expect(body.deleteDecisions.map((r) => r.userId)).toEqual([UID1])
    expect(deleteUserSpy).not.toHaveBeenCalled()
    expect(storageRemove).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('never deletes a Lifetime or other paid account, only archives Lifetime', async () => {
    listUsers.mockResolvedValue({ data: { users: [lapsed(UID2), { id: UID3, created_at: ago(2000), app_metadata: { subscription_plan: 'premium_monthly', subscription_status: 'active' }, user_metadata: {} }] }, error: null })
    eventRows.mockResolvedValue({ data: [{ user_id: UID2, track: 'hosting_lapsed', event_key: 'grace_83', created_at: ago(8) }], error: null })
    process.env.ACCOUNT_LIFECYCLE_ARCHIVE = 'true'
    process.env.ACCOUNT_LIFECYCLE_DELETE_FREE = 'true'
    const body = await run({ archive: '1', delete: '1' })
    expect(body.deleteDecisions).toEqual([])
    expect(deleteUserSpy).not.toHaveBeenCalled()
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })

  describe('returning accounts start a fresh cycle', () => {
    // An account that was warned, signed in again, and has gone quiet for 18 months once more.
    const OLD_ANCHOR = () => ago(FREE_INACTIVITY_DAYS + 400)
    const oldCycleRows = (id) => [
      { user_id: id, track: 'free_inactive', event_key: 'inactive_0', created_at: ago(380), anchor_at: OLD_ANCHOR() },
      { user_id: id, track: 'free_inactive', event_key: 'inactive_83', created_at: ago(300), anchor_at: OLD_ANCHOR() },
    ]

    it('ignores the old cycle, clears the stale row, and sends the first notice again', async () => {
      listUsers.mockResolvedValue({ data: { users: [inactive(UID1, 5)] }, error: null })
      eventRows.mockResolvedValue({ data: oldCycleRows(UID1), error: null })
      process.env.ACCOUNT_LIFECYCLE_SEND_EMAILS = 'true'
      process.env.RESEND_API_KEY = 're_test'
      const order = []
      deleteSpy.mockImplementation((col, val) => { if (col === 'event_key') order.push(`delete:${val}`) })
      insertSpy.mockImplementation(async (row) => { order.push(`insert:${row.event_key}`); return { error: null } })
      const body = await run({ send: '1' })
      expect(body.noticesDue.map((r) => r.notice)).toEqual(['inactive_0'])
      expect(order).toEqual(['delete:inactive_0', 'insert:inactive_0'])
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(body.emails).toMatchObject({ sent: 1 })
    })

    it('never deletes an account that came back, even though a final notice from the old cycle exists', async () => {
      listUsers.mockResolvedValue({ data: { users: [{ ...inactive(UID1, 5), last_sign_in_at: ago(2) }] }, error: null })
      eventRows.mockResolvedValue({ data: oldCycleRows(UID1), error: null })
      process.env.ACCOUNT_LIFECYCLE_DELETE_FREE = 'true'
      const body = await run({ delete: '1' })
      expect(body.deleteDecisions).toEqual([])
      expect(body.noticesDue).toEqual([])
      expect(deleteUserSpy).not.toHaveBeenCalled()
    })

    it('a Lifetime renewal followed by a new lapse also starts a fresh cycle', async () => {
      const u = lapsed(UID2) // hosting ended 95 days ago (the new anchor)
      listUsers.mockResolvedValue({ data: { users: [u] }, error: null })
      eventRows.mockResolvedValue({ data: [
        { user_id: UID2, track: 'hosting_lapsed', event_key: 'grace_83', created_at: ago(500), anchor_at: ago(600) },
      ], error: null })
      process.env.ACCOUNT_LIFECYCLE_ARCHIVE = 'true'
      const body = await run({ archive: '1' })
      expect(body.archive).toMatchObject({ archived: 0 }) // old final notice does not unlock archiving
      expect(updateSpy).not.toHaveBeenCalled()
    })
  })

  describe('free-account deletion', () => {
    const enable = () => { process.env.ACCOUNT_LIFECYCLE_DELETE_FREE = 'true' }

    it('records the audit row, removes stored media, then deletes the account, in that order', async () => {
      const u = inactive(UID1, 95)
      listUsers.mockResolvedValue({ data: { users: [u] }, error: null })
      getUserById.mockResolvedValue({ data: { user: u }, error: null })
      eventRows.mockResolvedValue({ data: FREE_READY(UID1), error: null })
      storageList
        .mockResolvedValueOnce({ data: [{ name: 'a.png', id: 'f1' }, { name: 'projects', id: null }], error: null })
        .mockResolvedValueOnce({ data: [{ name: 'b.png', id: 'f2' }], error: null })
      const order = []
      upsertSpy.mockImplementation(async () => { order.push('audit'); return { error: null } })
      storageRemove.mockImplementation(async () => { order.push('media'); return { error: null } })
      deleteUserSpy.mockImplementation(async () => { order.push('user'); return { error: null } })
      enable()
      const body = await run({ delete: '1' })
      expect(order).toEqual(['audit', 'media', 'user'])
      expect(body.mode).toBe('delete')
      expect(body.deletion).toMatchObject({ deleted: 1, failed: 0, skipped: 0, maxPerRun: 10 })
      expect(storageRemove).toHaveBeenCalledWith([`${UID1}/a.png`, `${UID1}/projects/b.png`])
      expect(storageList.mock.calls[0][0]).toBe(UID1)
      expect(deleteUserSpy).toHaveBeenCalledWith(UID1)
      expect(upsertSpy.mock.calls[0][0]).toMatchObject({ user_id: UID1, track: 'free_inactive' })
      expect(updateRowSpy.mock.calls[0][0]).toHaveProperty('completed_at')
      expect(JSON.stringify(body)).not.toMatch(/@x\.test/)
    })

    it('does not delete without a final notice recorded 7+ days ago', async () => {
      listUsers.mockResolvedValue({ data: { users: [inactive(UID1, 95), inactive(UID2, 95)] }, error: null })
      eventRows.mockResolvedValue({ data: [
        ...FREE_READY(UID2).map((r) => (r.event_key === 'inactive_83' ? { ...r, created_at: ago(2) } : r)),
      ], error: null })
      enable()
      const body = await run({ delete: '1' })
      expect(body.deletion).toMatchObject({ deleted: 0 })
      expect(deleteUserSpy).not.toHaveBeenCalled()
    })

    it('skips the account if it signed in after the sweep read it (live re-check)', async () => {
      listUsers.mockResolvedValue({ data: { users: [inactive(UID1, 95)] }, error: null })
      getUserById.mockResolvedValue({ data: { user: { ...inactive(UID1, 95), last_sign_in_at: ago(0) } }, error: null })
      eventRows.mockResolvedValue({ data: FREE_READY(UID1), error: null })
      enable()
      const body = await run({ delete: '1' })
      expect(body.deletion).toMatchObject({ deleted: 0, skipped: 1 })
      expect(deleteUserSpy).not.toHaveBeenCalled()
      expect(storageRemove).not.toHaveBeenCalled()
    })

    it('skips the account if it became protected (e.g. upgraded) before deletion', async () => {
      listUsers.mockResolvedValue({ data: { users: [inactive(UID1, 95)] }, error: null })
      getUserById.mockResolvedValue({ data: { user: { ...inactive(UID1, 95), app_metadata: { subscription_plan: 'premium_monthly' } } }, error: null })
      eventRows.mockResolvedValue({ data: FREE_READY(UID1), error: null })
      enable()
      const body = await run({ delete: '1' })
      expect(body.deletion).toMatchObject({ deleted: 0, skipped: 1 })
      expect(deleteUserSpy).not.toHaveBeenCalled()
    })

    it('does NOT delete the account if the audit write or media cleanup fails', async () => {
      const u = inactive(UID1, 95)
      listUsers.mockResolvedValue({ data: { users: [u] }, error: null })
      getUserById.mockResolvedValue({ data: { user: u }, error: null })
      eventRows.mockResolvedValue({ data: FREE_READY(UID1), error: null })
      enable()
      upsertSpy.mockResolvedValueOnce({ error: { message: 'db down' } })
      let body = await run({ delete: '1' })
      expect(body.deletion).toMatchObject({ deleted: 0, failed: 1 })
      storageRemove.mockResolvedValueOnce({ error: { message: 'storage down' } })
      storageList.mockResolvedValueOnce({ data: [{ name: 'a.png', id: 'f1' }], error: null })
      body = await run({ delete: '1' })
      expect(body.deletion).toMatchObject({ deleted: 0, failed: 1 })
      expect(deleteUserSpy).not.toHaveBeenCalled()
    })

    it('refuses media cleanup for a non-uuid id (would otherwise list the whole bucket)', async () => {
      const u = inactive('not-a-uuid', 95)
      listUsers.mockResolvedValue({ data: { users: [u] }, error: null })
      getUserById.mockResolvedValue({ data: { user: u }, error: null })
      eventRows.mockResolvedValue({ data: FREE_READY('not-a-uuid'), error: null })
      enable()
      const body = await run({ delete: '1' })
      expect(body.deletion).toMatchObject({ deleted: 0, failed: 1 })
      expect(storageList).not.toHaveBeenCalled()
      expect(deleteUserSpy).not.toHaveBeenCalled()
    })

    it('deletes at most 10 accounts per run', async () => {
      const users = Array.from({ length: 12 }, (_, i) => inactive(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, 95))
      listUsers.mockResolvedValue({ data: { users }, error: null })
      getUserById.mockImplementation(async (id) => ({ data: { user: users.find((x) => x.id === id) }, error: null }))
      eventRows.mockResolvedValue({ data: users.flatMap((x) => FREE_READY(x.id)), error: null })
      enable()
      const body = await run({ delete: '1' })
      expect(deleteUserSpy).toHaveBeenCalledTimes(10)
      expect(body.deletion).toMatchObject({ deleted: 10, remaining: 2 })
    })
  })

  it('is reached through send-reengagement-emails (?job=lifecycle) so it is not a 13th Function', async () => {
    process.env.ACCOUNT_LIFECYCLE_SEND_SPACING_MS = '0'
    const route = (await import('../../api/send-reengagement-emails.js')).default
    const res = makeRes()
    await route({ method: 'GET', headers: auth, query: { job: 'lifecycle' } }, res)
    expect(res.json.mock.calls[0][0]).toMatchObject({ mode: 'report-only', checked: 0 })
    const bad = makeRes()
    await route({ method: 'GET', headers: { authorization: 'Bearer nope' }, query: { job: 'lifecycle' } }, bad)
    expect(bad.status).toHaveBeenCalledWith(401)
  })

  it('is scheduled daily in vercel.json with both flags', async () => {
    const cfg = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'))
    expect(cfg.crons).toContainEqual({ path: '/api/send-reengagement-emails?job=lifecycle&send=1&archive=1&delete=1', schedule: '15 9 * * *' })
  })
})

describe('account_lifecycle_deletions migration', () => {
  it('is service-role only, has no FK to auth.users (so the audit survives deletion) and no policies or email column', async () => {
    const sql = await readFile(new URL('../../supabase/migrations/20261001130000_account_lifecycle_deletions.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON public\.account_lifecycle_deletions FROM anon, authenticated/)
    expect(sql).not.toMatch(/CREATE POLICY/)
    expect(sql).not.toMatch(/REFERENCES\s+auth\.users/i)
    expect(sql).not.toMatch(/\bemail\s+TEXT/i)
  })
})
