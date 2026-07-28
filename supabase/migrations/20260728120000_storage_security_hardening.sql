-- Security hardening round 3 — addresses Supabase linter warnings from the
-- 20260727 user-media storage migration.
--
-- Intentional exceptions (not fixed here, see 20260630_security_fixes.sql):
--   get_founder_slot_info — anon+auth access is intentional (landing page slot counter)
--   delete_user           — authenticated access is intentional (in-app account deletion)

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. "Public read user-media" — drop the broad SELECT policy.
--    Public-bucket object GET (/object/public/user-media/...) is served off the
--    bucket's public flag alone and needs no storage.objects RLS policy. The
--    app never calls .list() or otherwise queries storage.objects directly
--    (see src/utils/uploadUserMedia.js — upload/remove/getPublicUrl only), so
--    this policy did nothing but let anon/authenticated clients enumerate
--    every user's files across the whole bucket.
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read user-media" ON storage.objects;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. handle_user_media_storage_change — trigger-only, should not be callable
--    via RPC. Same treatment as handle_new_user / trigger_welcome_email in
--    20260630_security_fixes.sql, missed when this function was added.
-- ──────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_user_media_storage_change() FROM anon, authenticated, public;
