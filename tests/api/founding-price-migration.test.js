import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migration = new URL('../../supabase/migrations/20261005120000_lifetime_founder_status.sql', import.meta.url)

describe('Founding Price database migration', () => {
  it('serializes reservation and final allocation around the same advisory lock', async () => {
    const sql = await readFile(migration, 'utf8')
    expect(sql.match(/pg_advisory_xact_lock\(hashtext\('founder_slot_claim'\)\)/g)).toHaveLength(2)
    expect(sql).toContain("status IN ('active', 'pending')")
    expect(sql).toContain('founder_count + reserved_count >= cap')
  })

  it('enforces unique numbered Founders from 1 through 100', async () => {
    const sql = await readFile(migration, 'utf8')
    expect(sql).toContain('More than 100 legacy Founder profiles exist')
    expect(sql).toContain('user_profiles_founder_number_unique')
    expect(sql).toMatch(/founder_number BETWEEN 1 AND 100/)
    expect(sql).toContain('generate_series(1, 100)')
  })

  it('keeps all reservation RPCs server-only', async () => {
    const sql = await readFile(migration, 'utf8')
    for (const fn of ['reserve_founder_checkout', 'bind_founder_checkout', 'hold_founder_checkout', 'finalize_founder_purchase', 'release_founder_checkout']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn}`)
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]+\\) TO service_role;`))
    }
  })

  it('releases both ordinary and asynchronous-payment holds after failure', async () => {
    const sql = await readFile(migration, 'utf8')
    const releaseFunction = sql.split('CREATE OR REPLACE FUNCTION public.release_founder_checkout')[1]
      .split('-- Legacy function remains')[0]
    expect(releaseFunction).toContain("status IN ('active', 'pending')")
  })
})
