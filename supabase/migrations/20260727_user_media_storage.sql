-- ============================================================
-- Migration: user-media storage bucket
-- Purpose:
--   • Real object storage for user-uploaded images (cover photos,
--     character portraits, faction logos, comic reference images),
--     replacing inline base64 data URLs embedded in project JSON.
--     Base64-in-JSON was written straight through to the browser's
--     localStorage-backed local cache, whose real per-origin quota
--     (~5-10MB, browser-enforced) sits far below what paid plans
--     promise (1-15GB, PLAN_STORAGE_BYTES) — this bucket is the fix.
--   • Wires up the previously-unused user_profiles.storage_used_bytes
--     column (added 20260523_profiles_storage.sql) via a trigger, so
--     it becomes the authoritative "how much has this user actually
--     uploaded" number instead of dead schema.
--
-- Path convention: user-media/{user_id}/{category}/{uuid}.{ext}
-- Bucket is public-read (product decision 2026-07-27): images are
-- non-sensitive cover art, so a plain <img src> is used rather than
-- signed/expiring URLs. Only the owning user may insert/update/delete
-- objects under their own {user_id}/ prefix.
-- ============================================================

-- ── bucket ────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-media', 'user-media', true)
ON CONFLICT (id) DO NOTHING;

-- ── storage.objects RLS ──────────────────────────────────────────────────────
-- storage.objects already has RLS enabled by Supabase; we only add policies.

DROP POLICY IF EXISTS "Public read user-media" ON storage.objects;
CREATE POLICY "Public read user-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-media');

DROP POLICY IF EXISTS "Users upload own user-media" ON storage.objects;
CREATE POLICY "Users upload own user-media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user-media'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users update own user-media" ON storage.objects;
CREATE POLICY "Users update own user-media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'user-media'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'user-media'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own user-media" ON storage.objects;
CREATE POLICY "Users delete own user-media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user-media'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- ── storage_used_bytes bookkeeping ───────────────────────────────────────────
-- Keeps user_profiles.storage_used_bytes in sync with actual user-media bucket
-- usage. Runs as SECURITY DEFINER so it can write user_profiles even though
-- that table has no direct authenticated-write policy (writes are meant to go
-- through a trusted path — this trigger is that trusted path for storage usage).
CREATE OR REPLACE FUNCTION public.handle_user_media_storage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bucket   text := COALESCE(NEW.bucket_id, OLD.bucket_id);
  owner_id uuid;
  old_size bigint := 0;
  new_size bigint := 0;
  delta    bigint := 0;
BEGIN
  IF bucket IS DISTINCT FROM 'user-media' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    owner_id := NULLIF((storage.foldername(COALESCE(NEW.name, OLD.name)))[1], '')::uuid;
  EXCEPTION WHEN others THEN
    owner_id := NULL;
  END;

  IF owner_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    old_size := COALESCE((OLD.metadata->>'size')::bigint, 0);
    delta := -old_size;
  ELSIF TG_OP = 'INSERT' THEN
    new_size := COALESCE((NEW.metadata->>'size')::bigint, 0);
    delta := new_size;
  ELSIF TG_OP = 'UPDATE' THEN
    old_size := COALESCE((OLD.metadata->>'size')::bigint, 0);
    new_size := COALESCE((NEW.metadata->>'size')::bigint, 0);
    delta := new_size - old_size;
  END IF;

  IF delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.user_profiles (user_id, storage_used_bytes)
  VALUES (owner_id, GREATEST(0, delta))
  ON CONFLICT (user_id) DO UPDATE
    SET storage_used_bytes = GREATEST(0, public.user_profiles.storage_used_bytes + delta);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS user_media_storage_change ON storage.objects;
CREATE TRIGGER user_media_storage_change
  AFTER INSERT OR UPDATE OR DELETE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_media_storage_change();
