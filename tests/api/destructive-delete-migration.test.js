import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../supabase/migrations/20260911130000_fix_destructive_delete_iteration.sql',
  import.meta.url,
)

describe('destructive-delete migration', () => {
  it('iterates relation names as individual query rows', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toContain('FOR table_name IN\n    SELECT unnest(ARRAY[')
    expect(sql).not.toContain('FOREACH table_name IN ARRAY ARRAY[')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.delete_project_data_atomic')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.delete_user()')
  })
})
