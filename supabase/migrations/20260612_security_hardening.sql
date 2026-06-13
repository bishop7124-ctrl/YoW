-- Security hardening — addresses Supabase linter warnings
-- Fixes: function_search_path_mutable, anon_security_definer_function_executable

-- ----------------------------------------------------------
-- 1. set_updated_at — fix mutable search_path
--    Adding SET search_path = '' prevents search-path injection
--    attacks where a malicious schema shadows built-in functions.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------
-- 2. delete_user — revoke anon execute, harden search_path
--    Unauthenticated users have no business calling account
--    deletion. Authenticated users retain access so the
--    in-app "delete my account" flow continues to work.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only allow authenticated users to delete their own account.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Revoke from anon; authenticated users keep access.
REVOKE EXECUTE ON FUNCTION public.delete_user() FROM anon;
GRANT  EXECUTE ON FUNCTION public.delete_user() TO authenticated;

-- ----------------------------------------------------------
-- 3. get_founder_slot_info — harden search_path
--    Anon access is intentional (landing page slot counter).
--    Already had SET search_path = public; switch to '' which
--    is stricter — qualify all identifiers explicitly.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_founder_slot_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  config    jsonb;
  v_total   int;
  v_reserved int;
  v_taken   int;
  v_remaining int;
BEGIN
  SELECT value INTO config FROM public.app_config WHERE key = 'founder_slots';
  v_total    := COALESCE((config->>'total')::int,    100);
  v_reserved := COALESCE((config->>'reserved')::int,   0);

  SELECT COUNT(*) INTO v_taken
  FROM public.user_profiles
  WHERE is_founder = true;

  v_remaining := GREATEST(0, v_total - v_reserved - v_taken);

  RETURN jsonb_build_object(
    'total',     v_total,
    'reserved',  v_reserved,
    'taken',     v_taken,
    'remaining', v_remaining
  );
END;
$$;

-- Anon + authenticated access is intentional — landing page slot display.
GRANT EXECUTE ON FUNCTION public.get_founder_slot_info() TO anon, authenticated;
