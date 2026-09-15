import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../supabase/migrations/20260914223000_security_definer_rpc_hardening.sql',
  import.meta.url,
)
const sceneMigrationUrl = new URL(
  '../../supabase/migrations/20260912193000_scene_optimistic_concurrency.sql',
  import.meta.url,
)

describe('security-definer RPC hardening migration', () => {
  it('removes unintended public and signed-in execution grants', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toContain('ALTER DEFAULT PRIVILEGES IN SCHEMA public')
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_founder_slot\(UUID\)\s+FROM PUBLIC, anon, authenticated;/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.release_founder_slot\(UUID\)\s+FROM PUBLIC, anon, authenticated;/,
    )
    expect(sql).toContain('TO service_role;')
  })

  it('uses RLS-backed invoker rights for user-owned atomic operations', async () => {
    const [sql, sceneSql] = await Promise.all([
      readFile(migrationUrl, 'utf8'),
      readFile(sceneMigrationUrl, 'utf8'),
    ])

    expect(sql).toContain(
      'ALTER FUNCTION public.delete_project_data_atomic(TEXT) SECURITY INVOKER;',
    )
    expect(sql).toContain(
      'ALTER FUNCTION public.replace_user_data_atomic(JSONB) SECURITY INVOKER;',
    )
    expect(sceneSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.save_scene_if_current\([\s\S]*?SECURITY INVOKER[\s\S]*?SET search_path = ''/,
    )
  })

  it('keeps elevated implementations private behind invoker wrappers', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toContain('ALTER FUNCTION public.delete_user() SET SCHEMA private;')
    expect(sql).toContain(
      'ALTER FUNCTION public.get_founder_slot_info() SET SCHEMA private;',
    )
    expect(sql).toMatch(
      /CREATE FUNCTION public\.delete_user\(\)[\s\S]*?SECURITY INVOKER/,
    )
    expect(sql).toMatch(
      /CREATE FUNCTION public\.get_founder_slot_info\(\)[\s\S]*?SECURITY INVOKER/,
    )
  })
})
