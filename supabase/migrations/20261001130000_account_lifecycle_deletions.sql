-- ============================================================
-- Migration: account_lifecycle_deletions
-- Date:      2026-10-01
-- Purpose:
--   Durable audit record for inactive Free-account deletions run by
--   api/_runAccountLifecycle.js. account_lifecycle_events rows cascade-delete
--   with the user, so this separate table (deliberately NO foreign key to
--   auth.users) is what remains afterwards. A row is written BEFORE anything is
--   deleted; completed_at is set once the account is gone. Holds no email or
--   name. Service role only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.account_lifecycle_deletions (
  user_id              UUID        PRIMARY KEY,
  track                TEXT        NOT NULL,
  anchor_at            TIMESTAMPTZ,
  final_notice_sent_at TIMESTAMPTZ,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ
);

ALTER TABLE public.account_lifecycle_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_lifecycle_deletions FROM anon, authenticated;
