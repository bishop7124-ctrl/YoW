-- ============================================================
-- Migration: desktop_devices
-- Date:      2026-07-06
-- Purpose:
--   • desktop_devices — device activation registry for the Lifetime
--     desktop app (PRD: Desktop Lifetime App and Local Vault, Phase 4).
--     One row per (user, device); soft cap and self-service
--     deactivation are enforced by api/desktop-devices.js using the
--     service role. Clients never write this table directly.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.desktop_devices (
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id      TEXT        NOT NULL,
  device_name    TEXT        NOT NULL DEFAULT '',
  platform       TEXT        NOT NULL DEFAULT '',
  activated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS desktop_devices_user_idx
  ON public.desktop_devices (user_id)
  WHERE deactivated_at IS NULL;

-- RLS: users can read their own device rows; only the service role writes.
ALTER TABLE public.desktop_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS desktop_devices_select_own ON public.desktop_devices;
CREATE POLICY desktop_devices_select_own
  ON public.desktop_devices FOR SELECT
  USING ((SELECT auth.uid()) = user_id);
