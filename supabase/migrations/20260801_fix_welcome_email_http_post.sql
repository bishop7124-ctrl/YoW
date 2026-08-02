-- Fix: trigger_welcome_email() called extensions.http_post(), but pg_net
-- always creates its functions in the fixed `net` schema regardless of the
-- `WITH SCHEMA extensions` clause used when the extension was created
-- (20260613_welcome_email_webhook.sql:9). The wrong schema qualification
-- meant the function never existed, so any INSERT into user_profiles that
-- fired this trigger failed with 42883 (undefined_function).
--
-- This surfaced as photo uploads failing: the storage-quota bookkeeping
-- trigger on storage.objects (20260727_user_media_storage.sql) does an
-- INSERT ... ON CONFLICT DO UPDATE into user_profiles. For a user with no
-- existing profile row, that's a genuine INSERT, which fired the signup-only
-- on_user_profile_created trigger -> trigger_welcome_email() -> the broken
-- http_post call -> error -> the whole storage.objects insert rolled back.
--
-- Also wraps the webhook call in an exception handler so a future failure
-- in the (non-critical, best-effort) welcome email can never again break an
-- unrelated write to user_profiles.

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
  BEGIN
    PERFORM net.http_post(
      url     := supabase_url || '/functions/v1/send-welcome-email',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body    := jsonb_build_object('record', jsonb_build_object('user_id', NEW.user_id))
    );
  EXCEPTION WHEN others THEN
    NULL; -- best-effort webhook; never block the user_profiles write
  END;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_welcome_email() FROM anon, authenticated, public;
