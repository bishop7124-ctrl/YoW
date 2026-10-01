-- ============================================================
-- Migration: account_lifecycle_events
-- Date:      2026-10-01
-- Purpose:
--   Durable ledger for the cloud-expiry / inactive-account lifecycle
--   (api/_lib/accountLifecycle.js, api/run-account-lifecycle.js).
--   One row per (user, track, event) so a notice is sent at most once and
--   an archive/delete is only ever allowed after the final notice row exists.
--   Written and read only by the service role; no client policy at all.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.account_lifecycle_events (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track      TEXT        NOT NULL CHECK (track IN ('hosting_lapsed', 'free_inactive')),
  event_key  TEXT        NOT NULL,
  anchor_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, track, event_key)
);

ALTER TABLE public.account_lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_lifecycle_events FROM anon, authenticated;
