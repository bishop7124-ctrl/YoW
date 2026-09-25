-- ============================================================
-- Migration: handle_new_user() signup trigger
-- Purpose:
--   Backfills a pre-migration gap: this function/trigger already existed
--   live in production (created directly, before this repo adopted
--   Supabase migration files) and every later migration assumed its
--   existence — 20260630_security_fixes.sql revokes EXECUTE on it
--   without ever having created it. Captured here, dated right after
--   20260523_profiles_storage.sql (the user_profiles table this trigger
--   populates), so a from-zero database rebuild actually gets a
--   user_profiles row on signup instead of relying on a manual step.
--   Definition pulled live from production via pg_get_functiondef/
--   pg_get_triggerdef 2026-09-25; not modified.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- EXECUTE is revoked from anon/authenticated/public by the later
-- 20260630_security_fixes.sql migration (trigger-only function, not an RPC).
