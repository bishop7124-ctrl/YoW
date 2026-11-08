import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const sql = await readFile(
  new URL('../../supabase/migrations/20261108120000_site_content_editor.sql', import.meta.url),
  'utf8',
)

describe('site content editor migration', () => {
  it('keeps the editor allowlist unreachable from the API roles', () => {
    expect(sql).toMatch(/ALTER TABLE public\.site_editors ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON public\.site_editors FROM PUBLIC, anon, authenticated/)
    expect(sql).not.toMatch(/CREATE POLICY[^;]*ON public\.site_editors/)
  })

  it('enables RLS on every content table', () => {
    for (const table of ['site_content_published', 'site_content_draft', 'site_content_history']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`))
    }
  })

  it('lets anonymous visitors read only published copy', () => {
    expect(sql).toMatch(/GRANT SELECT ON public\.site_content_published TO anon, authenticated/)
    expect(sql).not.toMatch(/GRANT[^;]*public\.site_content_draft[^;]*TO[^;]*anon/)
    expect(sql).not.toMatch(/GRANT[^;]*public\.site_content_history[^;]*TO[^;]*anon/)
  })

  it('gates every write path on private.is_site_editor()', () => {
    for (const name of [
      'Editors write published site content', 'Editors manage site drafts', 'Editors read site history',
      'Editors add site history', 'Editors prune site history', 'Editors upload site-media',
      'Editors update site-media', 'Editors delete site-media',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE POLICY "${name}"[\\s\\S]*?private\\.is_site_editor\\(\\)`))
    }
  })

  it('publishes through an invoker function that re-checks the editor', () => {
    expect(sql).toMatch(/FUNCTION public\.publish_site_content\(p_page text\)[\s\S]*?SECURITY INVOKER/)
    expect(sql).toMatch(/NOT private\.is_site_editor\(\)[\s\S]*?RAISE EXCEPTION/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.publish_site_content\(text\) FROM PUBLIC, anon/)
  })

  it('limits the media bucket to small images', () => {
    expect(sql).toMatch(/file_size_limit/)
    expect(sql).toMatch(/allowed_mime_types/)
    expect(sql).not.toMatch(/image\/svg/)
  })
})
