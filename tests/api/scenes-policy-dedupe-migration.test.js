import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase/migrations/20261003120000_dedupe_scenes_policies.sql', import.meta.url),
  'utf8',
)

describe('scenes duplicate-policy clean-up migration', () => {
  it('drops only the legacy duplicate and keeps an owner-only policy in place', () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Users can access own scenes" ON public\.scenes;/)
    expect(migration).not.toMatch(/DROP POLICY IF EXISTS "Users manage own scenes"/)
    expect(migration).toMatch(/CREATE POLICY "Users manage own scenes" ON public\.scenes/)
    expect(migration).toMatch(/\(select auth\.uid\(\)\)::text = user_id::text/)
  })

  it('never widens access', () => {
    expect(migration).not.toMatch(/\bUSING\s*\(\s*true\s*\)/i)
    expect(migration).not.toMatch(/\bTO\s+(anon|public)\b/i)
  })
})
