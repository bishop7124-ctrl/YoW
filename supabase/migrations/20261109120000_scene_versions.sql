-- Cloud scene version history (roadmap A2). See
-- docs/planning/future-release/09_A2_CLOUD_SCENE_HISTORY_DESIGN.md.
--
-- Additive: one new table and a handful of functions. No existing table, column,
-- policy or function is changed. NOT applied automatically: review it, then apply
-- it from the Supabase SQL editor (or `supabase db push`).
--
-- Model
--   * Append-only snapshots of a scene (title + full text). Users can READ their own
--     rows through RLS; every write goes through the functions below, which enforce
--     ownership, the size limit, de-duplication and retention. Nobody can insert,
--     update or delete rows directly.
--   * Retention (applied on every save, for that scene only): keep the newest 20
--     versions, plus the newest version of each UTC day for the last 30 days.
--   * Per-user safety cap: at most 2000 rows per user. When exceeded, the oldest
--     rows go first, but the newest version of every scene is always kept.
--   * "Recently deleted": deleting a scene or project marks its versions with
--     deleted_at instead of removing them; they are purged 30 days later.
--   * Account deletion: user_id references auth.users ON DELETE CASCADE.
--
-- Rollback: nothing else depends on this. Turn the `cloud_scene_history` feature
-- flag off (the app stops reading and writing). To remove entirely:
--   drop function public.save_scene_version(text, text, text, text, text);
--   drop function public.mark_scene_versions_deleted(text);
--   drop function public.mark_novel_versions_deleted(text);
--   drop function public.unmark_scene_versions_deleted(text);
--   drop function public.delete_scene_version(uuid);
--   drop function public.clear_scene_versions(text);
--   drop function public.purge_expired_scene_versions();
--   drop table public.scene_versions;

CREATE TABLE IF NOT EXISTS public.scene_versions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_id     text        NOT NULL CHECK (char_length(scene_id) BETWEEN 1 AND 200),
  novel_id     text        CHECK (novel_id IS NULL OR char_length(novel_id) <= 200),
  title        text        NOT NULL DEFAULT '',
  content      text        NOT NULL,
  word_count   integer     NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  content_hash text        NOT NULL,
  source       text        NOT NULL CHECK (source IN ('auto', 'restore', 'replace')),
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scene_versions_user_scene_hash_key UNIQUE (user_id, scene_id, content_hash)
);

CREATE INDEX IF NOT EXISTS scene_versions_user_scene_created_idx
  ON public.scene_versions (user_id, scene_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scene_versions_user_novel_idx
  ON public.scene_versions (user_id, novel_id);
CREATE INDEX IF NOT EXISTS scene_versions_user_deleted_idx
  ON public.scene_versions (user_id, deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE public.scene_versions ENABLE ROW LEVEL SECURITY;

-- Read-only for signed-in users; all writes go through the functions below.
REVOKE ALL ON public.scene_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scene_versions TO authenticated;

DROP POLICY IF EXISTS "Users read own scene versions" ON public.scene_versions;
CREATE POLICY "Users read own scene versions" ON public.scene_versions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ── save + retention ─────────────────────────────────────────────────────────
-- Returns true when a version was stored (or an older identical one was moved to
-- "now"), false when it was a no-op duplicate of a version saved moments ago.
CREATE OR REPLACE FUNCTION public.save_scene_version(
  p_scene_id text,
  p_novel_id text,
  p_title    text,
  p_content  text,
  p_source   text DEFAULT 'auto'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid      uuid := (SELECT auth.uid());
  hash     text;
  changed  integer;
  cap      constant integer := 2000;
  total    integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_scene_id IS NULL OR char_length(p_scene_id) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid scene id' USING ERRCODE = '22023';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('auto', 'restore', 'replace') THEN
    RAISE EXCEPTION 'invalid source' USING ERRCODE = '22023';
  END IF;
  IF p_content IS NULL OR octet_length(p_content) > 2097152 THEN
    RAISE EXCEPTION 'scene text missing or over the 2 MB history limit' USING ERRCODE = '54000';
  END IF;

  hash := encode(sha256(convert_to(coalesce(p_title, '') || E'\n' || p_content, 'UTF8')), 'hex');

  INSERT INTO public.scene_versions AS v
    (user_id, scene_id, novel_id, title, content, word_count, content_hash, source)
  VALUES (
    uid, p_scene_id, p_novel_id, coalesce(p_title, ''), p_content,
    CASE WHEN btrim(p_content) = '' THEN 0
         ELSE array_length(regexp_split_to_array(btrim(p_content), '\s+'), 1) END,
    hash, p_source
  )
  ON CONFLICT (user_id, scene_id, content_hash) DO UPDATE
    SET created_at = now(), source = excluded.source, deleted_at = NULL
    WHERE v.created_at < now() - interval '1 minute';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 0 THEN
    RETURN false;
  END IF;

  -- Per-scene retention: newest 20, plus the newest of each UTC day for 30 days.
  DELETE FROM public.scene_versions d
  WHERE d.user_id = uid AND d.scene_id = p_scene_id
    AND d.id NOT IN (
      SELECT k.id FROM public.scene_versions k
      WHERE k.user_id = uid AND k.scene_id = p_scene_id
      ORDER BY k.created_at DESC LIMIT 20
    )
    AND d.id NOT IN (
      SELECT DISTINCT ON ((k.created_at AT TIME ZONE 'UTC')::date) k.id
      FROM public.scene_versions k
      WHERE k.user_id = uid AND k.scene_id = p_scene_id
        AND k.created_at >= now() - interval '30 days'
      ORDER BY (k.created_at AT TIME ZONE 'UTC')::date, k.created_at DESC
    );

  -- Per-user cap: drop the oldest rows, never a scene's newest version.
  SELECT count(*) INTO total FROM public.scene_versions WHERE user_id = uid;
  IF total > cap THEN
    DELETE FROM public.scene_versions d
    WHERE d.id IN (
      SELECT r.id FROM (
        SELECT s.id, s.created_at,
               row_number() OVER (PARTITION BY s.scene_id ORDER BY s.created_at DESC) AS rn
        FROM public.scene_versions s WHERE s.user_id = uid
      ) r
      WHERE r.rn > 1
      ORDER BY r.created_at ASC
      LIMIT total - cap
    );
  END IF;

  -- Opportunistic purge of this user's expired "recently deleted" rows.
  DELETE FROM public.scene_versions
  WHERE user_id = uid AND deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';

  RETURN true;
END;
$$;

-- ── recently deleted ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_scene_versions_deleted(p_scene_id text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid()); n integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  UPDATE public.scene_versions SET deleted_at = now()
  WHERE user_id = uid AND scene_id = p_scene_id AND deleted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_novel_versions_deleted(p_novel_id text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid()); n integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  UPDATE public.scene_versions SET deleted_at = now()
  WHERE user_id = uid AND novel_id = p_novel_id AND deleted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.unmark_scene_versions_deleted(p_scene_id text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid()); n integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  UPDATE public.scene_versions SET deleted_at = NULL
  WHERE user_id = uid AND scene_id = p_scene_id AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── explicit user deletes from the history panel ─────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_scene_version(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid()); n integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  DELETE FROM public.scene_versions WHERE id = p_id AND user_id = uid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_scene_versions(p_scene_id text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid()); n integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  DELETE FROM public.scene_versions WHERE user_id = uid AND scene_id = p_scene_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_scene_versions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid()); n integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  DELETE FROM public.scene_versions
  WHERE user_id = uid AND deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Signed-in users only; never anonymous or PUBLIC.
REVOKE ALL ON FUNCTION public.save_scene_version(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_scene_versions_deleted(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_novel_versions_deleted(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unmark_scene_versions_deleted(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_scene_version(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_scene_versions(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purge_expired_scene_versions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_scene_version(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_scene_versions_deleted(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_novel_versions_deleted(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmark_scene_versions_deleted(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_scene_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_scene_versions(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_scene_versions() TO authenticated;
