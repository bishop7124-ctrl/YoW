-- ============================================================
-- Migration: synced AI settings
-- Purpose:
--   Stores encrypted bring-your-own-key AI settings per user so signed-in
--   users can opt into using the same provider credentials across web and
--   desktop sessions. Encryption/decryption happens only in the server API.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.synced_ai_settings (
  user_id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_payload JSONB       NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS synced_ai_settings_updated_at ON public.synced_ai_settings;
CREATE TRIGGER synced_ai_settings_updated_at
  BEFORE UPDATE ON public.synced_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.synced_ai_settings ENABLE ROW LEVEL SECURITY;

-- No direct anon/authenticated policies by design: API keys are decrypted only
-- by the Vercel API route using the service-role key after verifying the user's
-- Supabase auth token.
