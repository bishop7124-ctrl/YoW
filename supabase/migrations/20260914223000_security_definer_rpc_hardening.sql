-- Harden the privileged RPC surface reported by Supabase Security Advisor
-- checks 0028/0029. User-owned data operations can rely on the existing RLS
-- policies, while the two operations that genuinely need elevated privileges
-- are kept outside the exposed public schema behind narrow invoker wrappers.

-- Postgres grants EXECUTE on new functions to PUBLIC by default. Make future
-- public-schema functions opt-in for the role that applies this migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- These operations already constrain every statement to auth.uid(). Their
-- target tables have owner-only RLS policies, so definer rights are unnecessary.
ALTER FUNCTION public.delete_project_data_atomic(TEXT) SECURITY INVOKER;
ALTER FUNCTION public.replace_user_data_atomic(JSONB) SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.delete_project_data_atomic(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_project_data_atomic(TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.replace_user_data_atomic(JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_user_data_atomic(JSONB)
  TO authenticated;

-- Founder allocation and release are webhook-only operations. The original
-- migration granted service_role but did not revoke Postgres' default PUBLIC
-- grant, which made both functions callable as anon/authenticated as well.
REVOKE ALL ON FUNCTION public.claim_founder_slot(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_founder_slot(UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.release_founder_slot(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_founder_slot(UUID)
  TO service_role;

-- Account deletion must delete auth.users and the public Founder counter must
-- aggregate rows hidden by RLS. Move those elevated implementations out of the
-- exposed API schema, then preserve the existing RPC contracts with invoker
-- wrappers. The private schema is not listed in Supabase's exposed schemas.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

ALTER FUNCTION public.delete_user() SET SCHEMA private;
ALTER FUNCTION public.get_founder_slot_info() SET SCHEMA private;

REVOKE ALL ON FUNCTION private.delete_user()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_founder_slot_info()
  FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.delete_user() TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_founder_slot_info() TO anon, authenticated;

CREATE FUNCTION public.delete_user()
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.delete_user();
$$;

REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;

CREATE FUNCTION public.get_founder_slot_info()
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.get_founder_slot_info();
$$;

REVOKE ALL ON FUNCTION public.get_founder_slot_info() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_founder_slot_info() TO anon, authenticated;
