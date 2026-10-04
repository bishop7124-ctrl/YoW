-- ============================================================
-- Migration: server-side limits for the private user-media bucket
-- Date:      2026-10-04
-- Why:       Storage quota, file size and MIME type were enforced only in the
--            browser (src/utils/storageQuota.js, uploadUserMedia.js). A signed-in
--            user calling the Storage API directly could bypass all three. The
--            existing accounting trigger only counted bytes, it never refused.
-- What:      1. Bucket-level file size and MIME allow-list (clean early rejection).
--            2. BEFORE INSERT/UPDATE trigger that re-checks size, MIME and the
--               plan quota inside the same transaction, serialised per user by a
--               lock on that user's user_profiles row (so concurrent uploads
--               cannot both squeeze under the cap).
-- Plan caps mirror PLAN_STORAGE_BYTES in src/utils/membership.js and read only
-- server-controlled auth app metadata. The server cap is deliberately the most
-- permissive plausible one: a lapsed Lifetime account keeps its paid cap here
-- while the app applies the stricter Free cap (the app never lets it exceed
-- the server cap, only the other way round).
-- ============================================================

UPDATE storage.buckets
SET file_size_limit = 15728640,                                   -- 15 MiB = MAX_UPLOAD_BYTES
    allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/gif']
WHERE id = 'user-media';

CREATE OR REPLACE FUNCTION public.user_media_plan_cap_bytes(p_user uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  md        jsonb;
  created   timestamptz;
  plan      text;
  status    text;
  beta_from timestamptz;
  trial_from timestamptz;
  gib       constant bigint := 1024::bigint * 1024 * 1024;
BEGIN
  SELECT COALESCE(raw_app_meta_data, '{}'::jsonb), created_at INTO md, created
  FROM auth.users WHERE id = p_user;
  IF NOT FOUND THEN RETURN 0; END IF;

  plan   := md->>'subscription_plan';
  status := md->>'subscription_status';

  IF plan = 'founder' THEN RETURN 15 * gib; END IF;
  IF plan IN ('premium_lifetime', 'premium_plus_lifetime') THEN RETURN 8 * gib; END IF;
  IF plan = 'premium_monthly' AND status IN ('active', 'trialing') AND COALESCE(md->>'beta_tester', 'false') <> 'true' THEN
    RETURN 8 * gib;
  END IF;

  IF plan = 'beta_tester' OR md->>'beta_tester' = 'true' THEN
    BEGIN
      beta_from := NULLIF(md->>'beta_notice_started_at', '')::timestamptz;
    EXCEPTION WHEN others THEN
      RETURN 250 * 1024 * 1024;                                     -- invalid notice date fails closed
    END;
    IF beta_from IS NULL OR now() < beta_from + interval '30 days' THEN RETURN 15 * gib; END IF;
    RETURN 250 * 1024 * 1024;                                       -- Beta notice period over
  END IF;

  IF md->>'access_revoked_at' IS NULL THEN
    BEGIN
      trial_from := COALESCE(NULLIF(md->>'trial_started_at', '')::timestamptz, created);
    EXCEPTION WHEN others THEN
      trial_from := created;
    END;
    IF now() < trial_from + interval '28 days' THEN RETURN 8 * gib; END IF;   -- TRIAL_DAYS
  END IF;

  RETURN 250 * 1024 * 1024;                                         -- Free
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_user_media_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  owner_id uuid;
  new_size bigint;
  old_size bigint := 0;
  delta    bigint;
  mime     text;
  used     bigint;
  addon    bigint;
BEGIN
  IF NEW.bucket_id IS DISTINCT FROM 'user-media' THEN RETURN NEW; END IF;

  BEGIN
    owner_id := NULLIF((storage.foldername(NEW.name))[1], '')::uuid;
  EXCEPTION WHEN others THEN
    owner_id := NULL;
  END;
  IF owner_id IS NULL THEN RETURN NEW; END IF;                      -- not a per-user path; RLS already scopes it

  new_size := COALESCE((NEW.metadata->>'size')::bigint, 0);
  IF TG_OP = 'UPDATE' THEN old_size := COALESCE((OLD.metadata->>'size')::bigint, 0); END IF;

  IF new_size > 15728640 THEN
    RAISE EXCEPTION 'user-media object exceeds the 15 MB per-file limit' USING ERRCODE = '53400';
  END IF;

  mime := NEW.metadata->>'mimetype';
  IF mime IS NOT NULL AND mime NOT IN ('image/webp', 'image/jpeg', 'image/png', 'image/gif') THEN
    RAISE EXCEPTION 'user-media only accepts image uploads (got %)', mime USING ERRCODE = '22023';
  END IF;

  delta := new_size - old_size;
  IF delta <= 0 THEN RETURN NEW; END IF;                            -- shrinking or unchanged never needs a quota check

  INSERT INTO public.user_profiles (user_id) VALUES (owner_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT storage_used_bytes, storage_add_on_bytes INTO used, addon
  FROM public.user_profiles WHERE user_id = owner_id FOR UPDATE;    -- serialise this user's concurrent uploads

  IF used + delta > public.user_media_plan_cap_bytes(owner_id) + COALESCE(addon, 0) THEN
    RAISE EXCEPTION 'storage quota exceeded for this plan' USING ERRCODE = '53100';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_media_enforce_limits ON storage.objects;
CREATE TRIGGER user_media_enforce_limits
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_media_limits();

REVOKE EXECUTE ON FUNCTION public.user_media_plan_cap_bytes(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_user_media_limits() FROM anon, authenticated, public;
