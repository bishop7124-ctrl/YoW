-- ============================================================
-- Migration: welcome email webhook
-- Date:      2026-06-13
-- Purpose:   Fire send-welcome-email Edge Function whenever a
--            new row is inserted into user_profiles (i.e. on signup).
-- ============================================================

-- Enable the pg_net extension if not already enabled (needed for HTTP calls)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function: calls the Edge Function via HTTP POST
CREATE OR REPLACE FUNCTION public.trigger_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url  text := current_setting('app.supabase_url',  true);
  service_key   text := current_setting('app.service_role_key', true);
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

DROP TRIGGER IF EXISTS on_user_profile_created ON public.user_profiles;
CREATE TRIGGER on_user_profile_created
  AFTER INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_welcome_email();
