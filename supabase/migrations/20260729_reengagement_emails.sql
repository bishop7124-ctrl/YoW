-- ============================================================
-- Migration: reengagement_emails
-- Date:      2026-07-29
-- Purpose:
--   • reengagement_emails — dedup/audit log for the day-1/3/7
--     "come back" email sequence (api/send-reengagement-emails.js,
--     invoked daily by Vercel Cron). One row per (user, stage) once
--     that stage's email has actually been sent, so the daily sweep
--     never sends the same stage twice. Written only by the cron job
--     via the service role — no client ever touches this table.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reengagement_emails (
  user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage   TEXT         NOT NULL,
  sent_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, stage)
);

-- RLS enabled with no policies at all: this table has no legitimate
-- client-side reader or writer, only the service role (which bypasses
-- RLS entirely).
ALTER TABLE public.reengagement_emails ENABLE ROW LEVEL SECURITY;
