import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const bucketMigrationUrl = new URL(
  '../../supabase/migrations/20260727_user_media_storage.sql',
  import.meta.url,
)
const hardeningMigrationUrl = new URL(
  '../../supabase/migrations/20260728120000_storage_security_hardening.sql',
  import.meta.url,
)
const privateMigrationUrl = new URL(
  '../../supabase/migrations/20260804_private_user_media.sql',
  import.meta.url,
)

describe('private user-media storage migrations', () => {
  it('keeps every object operation scoped to the authenticated owner prefix', async () => {
    const [bucketSql, privateSql] = await Promise.all([
      readFile(bucketMigrationUrl, 'utf8'),
      readFile(privateMigrationUrl, 'utf8'),
    ])
    const ownerCheck = String.raw`\(select auth\.uid\(\)\)::text\s*=\s*\(storage\.foldername\(name\)\)\[1\]`

    expect(bucketSql).toMatch(new RegExp(
      `CREATE POLICY "Users upload own user-media"[\\s\\S]*?FOR INSERT[\\s\\S]*?bucket_id = 'user-media'[\\s\\S]*?${ownerCheck}`,
    ))
    expect(bucketSql).toMatch(new RegExp(
      `CREATE POLICY "Users update own user-media"[\\s\\S]*?FOR UPDATE[\\s\\S]*?USING[\\s\\S]*?${ownerCheck}[\\s\\S]*?WITH CHECK[\\s\\S]*?${ownerCheck}`,
    ))
    expect(bucketSql).toMatch(new RegExp(
      `CREATE POLICY "Users delete own user-media"[\\s\\S]*?FOR DELETE[\\s\\S]*?${ownerCheck}`,
    ))
    expect(privateSql).toMatch(new RegExp(
      `CREATE POLICY "Users read own user-media"[\\s\\S]*?FOR SELECT[\\s\\S]*?bucket_id = 'user-media'[\\s\\S]*?${ownerCheck}`,
    ))
  })

  it('makes the bucket private and removes the historical public-read policy', async () => {
    const privateSql = await readFile(privateMigrationUrl, 'utf8')

    expect(privateSql).toMatch(/UPDATE storage\.buckets[\s\S]*?SET public = false[\s\S]*?WHERE id = 'user-media'/)
    expect(privateSql).toContain('DROP POLICY IF EXISTS "Public read user-media" ON storage.objects;')
  })

  it('accounts for insert, update, and delete deltas through a non-callable trigger', async () => {
    const [bucketSql, hardeningSql] = await Promise.all([
      readFile(bucketMigrationUrl, 'utf8'),
      readFile(hardeningMigrationUrl, 'utf8'),
    ])

    expect(bucketSql).toMatch(/IF TG_OP = 'DELETE'[\s\S]*?delta := -old_size/)
    expect(bucketSql).toMatch(/ELSIF TG_OP = 'INSERT'[\s\S]*?delta := new_size/)
    expect(bucketSql).toMatch(/ELSIF TG_OP = 'UPDATE'[\s\S]*?delta := new_size - old_size/)
    expect(bucketSql).toMatch(/storage_used_bytes = GREATEST\(0, public\.user_profiles\.storage_used_bytes \+ delta\)/)
    expect(bucketSql).toMatch(/AFTER INSERT OR UPDATE OR DELETE ON storage\.objects/)
    expect(hardeningSql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.handle_user_media_storage_change\(\) FROM anon, authenticated, public/,
    )
  })
})
