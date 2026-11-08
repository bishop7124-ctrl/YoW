-- Private public-site editor.
--
-- The owner edits marketing-page copy, section order and screenshots from
-- /site-editor. Nothing here is reachable by ordinary users:
--   * public.site_editors is the allowlist of editor accounts. It has RLS on
--     and NO policies, and all privileges are revoked, so it can only be
--     changed from the Supabase SQL editor / service role.
--   * private.is_site_editor() is the single gate used by every write policy.
--   * Anonymous visitors can only read the PUBLISHED copy of each page.
--     Drafts and history are editor-only.
--   * Images live in the public-read, editor-write `site-media` bucket.
--
-- Additive: pages keep their built-in copy as the fallback, so the public
-- site is unchanged until the owner publishes something.

CREATE SCHEMA IF NOT EXISTS private;

-- ── editor allowlist ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_editors (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_editors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_editors FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.is_site_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_editors WHERE user_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION private.is_site_editor() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_site_editor() TO authenticated;

-- Lets the editor UI ask "am I an editor?" without exposing the allowlist.
CREATE OR REPLACE FUNCTION public.is_site_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.is_site_editor();
$$;
REVOKE ALL ON FUNCTION public.is_site_editor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_site_editor() TO authenticated;

-- ── published copy (public read) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_content_published (
  page_key     text PRIMARY KEY CHECK (page_key IN ('home', 'features', 'faq')),
  content      jsonb NOT NULL CHECK (pg_column_size(content) < 400000),
  published_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_content_published ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_content_published FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.site_content_published TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_content_published TO authenticated;

DROP POLICY IF EXISTS "Anyone reads published site content" ON public.site_content_published;
CREATE POLICY "Anyone reads published site content"
  ON public.site_content_published FOR SELECT
  USING (true);
DROP POLICY IF EXISTS "Editors write published site content" ON public.site_content_published;
CREATE POLICY "Editors write published site content"
  ON public.site_content_published FOR ALL
  TO authenticated
  USING (private.is_site_editor())
  WITH CHECK (private.is_site_editor());

-- ── drafts (editor only) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_content_draft (
  page_key   text PRIMARY KEY CHECK (page_key IN ('home', 'features', 'faq')),
  content    jsonb NOT NULL CHECK (pg_column_size(content) < 400000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_content_draft ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_content_draft FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_content_draft TO authenticated;

DROP POLICY IF EXISTS "Editors manage site drafts" ON public.site_content_draft;
CREATE POLICY "Editors manage site drafts"
  ON public.site_content_draft FOR ALL
  TO authenticated
  USING (private.is_site_editor())
  WITH CHECK (private.is_site_editor());

-- ── history (editor only; one row per publish, powers "restore") ────────────
CREATE TABLE IF NOT EXISTS public.site_content_history (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_key     text NOT NULL,
  content      jsonb NOT NULL,
  published_at timestamptz NOT NULL,
  archived_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_content_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_content_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.site_content_history TO authenticated;

DROP POLICY IF EXISTS "Editors read site history" ON public.site_content_history;
CREATE POLICY "Editors read site history"
  ON public.site_content_history FOR SELECT
  TO authenticated
  USING (private.is_site_editor());
DROP POLICY IF EXISTS "Editors add site history" ON public.site_content_history;
CREATE POLICY "Editors add site history"
  ON public.site_content_history FOR INSERT
  TO authenticated
  WITH CHECK (private.is_site_editor());
DROP POLICY IF EXISTS "Editors prune site history" ON public.site_content_history;
CREATE POLICY "Editors prune site history"
  ON public.site_content_history FOR DELETE
  TO authenticated
  USING (private.is_site_editor());

-- ── publish: draft -> live, archiving whatever was live ─────────────────────
-- SECURITY INVOKER: every statement is still subject to the editor-only RLS
-- above, so a non-editor calling this gets nothing.
CREATE OR REPLACE FUNCTION public.publish_site_content(p_page text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_draft jsonb;
  v_now timestamptz := now();
BEGIN
  IF NOT private.is_site_editor() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT content INTO v_draft FROM public.site_content_draft WHERE page_key = p_page;
  IF v_draft IS NULL THEN
    RAISE EXCEPTION 'No draft to publish for %', p_page;
  END IF;

  INSERT INTO public.site_content_history (page_key, content, published_at)
    SELECT page_key, content, published_at
    FROM public.site_content_published WHERE page_key = p_page;

  -- Keep the 30 most recent snapshots per page.
  DELETE FROM public.site_content_history
  WHERE page_key = p_page
    AND id NOT IN (
      SELECT id FROM public.site_content_history
      WHERE page_key = p_page ORDER BY id DESC LIMIT 30
    );

  INSERT INTO public.site_content_published (page_key, content, published_at)
    VALUES (p_page, v_draft, v_now)
    ON CONFLICT (page_key) DO UPDATE
      SET content = EXCLUDED.content, published_at = EXCLUDED.published_at;

  RETURN v_now;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_site_content(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_site_content(text) TO authenticated;

-- ── image bucket: public read, editor-only write, images only, 5 MB max ─────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-media', 'site-media', true, 5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

DROP POLICY IF EXISTS "Public read site-media" ON storage.objects;
CREATE POLICY "Public read site-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-media');

DROP POLICY IF EXISTS "Editors upload site-media" ON storage.objects;
CREATE POLICY "Editors upload site-media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'site-media' AND private.is_site_editor());

DROP POLICY IF EXISTS "Editors update site-media" ON storage.objects;
CREATE POLICY "Editors update site-media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'site-media' AND private.is_site_editor())
  WITH CHECK (bucket_id = 'site-media' AND private.is_site_editor());

DROP POLICY IF EXISTS "Editors delete site-media" ON storage.objects;
CREATE POLICY "Editors delete site-media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'site-media' AND private.is_site_editor());
