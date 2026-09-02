-- ============================================================
-- Migration: durable rate limiting for public email-triggering actions
-- Purpose:
--   Audit finding P0-03 (docs/YOW_CODE_AUDIT_2026-09-01.md) — send-reset-email
--   has no durable rate limit, so it could be hammered to spam a victim's
--   inbox with password-reset emails. Generic append-only log table, shared
--   across any public email-triggering action that needs a durable per-key
--   rate limit (currently: password reset requests, keyed by the requested
--   email address). Same append-only-log shape as
--   20260901_ai_proxy_rate_limits.sql, for the same reason: avoids a
--   check-then-update race on a single counter row.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_action_rate_limits (
  id         BIGSERIAL   PRIMARY KEY,
  bucket     TEXT        NOT NULL, -- e.g. 'password-reset'
  rate_key   TEXT        NOT NULL, -- e.g. the requested email address, lowercased
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_action_rate_limits_bucket_key_created_at_idx
  ON public.email_action_rate_limits (bucket, rate_key, created_at DESC);

ALTER TABLE public.email_action_rate_limits ENABLE ROW LEVEL SECURITY;

-- No direct anon/authenticated policies by design: only Edge Functions,
-- using the service-role key, read/write this table.
