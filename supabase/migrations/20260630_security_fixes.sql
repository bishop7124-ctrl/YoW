-- Security hardening round 2 — addresses Supabase linter warnings
--
-- Intentional exceptions (not fixed here):
--   get_founder_slot_info — anon+auth access is intentional (landing page slot counter)
--   delete_user           — authenticated access is intentional (in-app account deletion)

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. feedback — drop the always-true INSERT policy
--    Submissions go through /api/submit-feedback which uses the service role key
--    and bypasses RLS entirely. The open policy is dead code and triggers the
--    linter warning — remove it so anon clients can't write directly to the table.
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. handle_new_user — trigger-only, should not be callable via RPC
-- ──────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. trigger_welcome_email — trigger-only, should not be callable via RPC.
--    Also harden search_path (was SET search_path = public, should be '').
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  supabase_url text := current_setting('app.supabase_url',  true);
  service_key  text := current_setting('app.service_role_key', true);
BEGIN
  PERFORM extensions.http_post(
    url     := supabase_url || '/functions/v1/send-welcome-email',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := jsonb_build_object('record', jsonb_build_object('user_id', NEW.user_id))
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_welcome_email() FROM anon, authenticated, public;
