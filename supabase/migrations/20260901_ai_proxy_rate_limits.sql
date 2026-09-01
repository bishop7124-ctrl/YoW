-- ============================================================
-- Migration: AI proxy durable rate limiting
-- Purpose:
--   Audit finding P0-02 (docs/YOW_CODE_AUDIT_2026-09-01.md) — api/ai-proxy.js
--   had no durable rate limit, allowing sustained abuse across serverless
--   function instances (an in-memory counter, like api/submit-feedback.js
--   uses, resets per cold start and isn't shared across instances). This
--   table records one row per allowed AI proxy request; api/ai-proxy.js
--   counts rows in a rolling window per user to enforce the limit.
--
--   Deliberately append-only and log-shaped rather than a single
--   increment-and-check counter row, to avoid a check-then-update race
--   between concurrent requests from the same user.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_proxy_requests (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_proxy_requests_user_id_created_at_idx
  ON public.ai_proxy_requests (user_id, created_at DESC);

ALTER TABLE public.ai_proxy_requests ENABLE ROW LEVEL SECURITY;

-- No direct anon/authenticated policies by design: only the Vercel API
-- route reads/writes this table, using the service-role key after verifying
-- the caller's Supabase auth token — the same pattern as
-- 20260728_synced_ai_settings.sql.
