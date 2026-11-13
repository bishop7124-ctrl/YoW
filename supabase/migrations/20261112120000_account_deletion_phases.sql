-- ============================================================
-- Migration: account_lifecycle_deletions phases (AUD-05)
-- Date:      2026-11-12
-- Purpose:
--   Make scheduled Free-account deletion resumable and recoverable.
--   phase: held       sign-in blocked, nothing deleted (30-day hold)
--          purging    hold passed and re-checked; Auth user deletion / orphan cleanup under way
--          completed  account and leftovers gone
--          cancelled  returned, upgraded or restored during the hold; nothing was deleted
--   Existing rows: finished ones become completed, unfinished ones cancelled (the new flow
--   starts fresh with a hold). Additive; service role only (RLS already on, no policies).
-- ============================================================

ALTER TABLE public.account_lifecycle_deletions
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

UPDATE public.account_lifecycle_deletions
   SET phase = CASE WHEN completed_at IS NOT NULL THEN 'completed' ELSE 'cancelled' END
 WHERE phase IS NULL;

ALTER TABLE public.account_lifecycle_deletions
  ALTER COLUMN phase SET NOT NULL,
  ALTER COLUMN phase SET DEFAULT 'held';

ALTER TABLE public.account_lifecycle_deletions
  DROP CONSTRAINT IF EXISTS account_lifecycle_deletions_phase_check;
ALTER TABLE public.account_lifecycle_deletions
  ADD CONSTRAINT account_lifecycle_deletions_phase_check
  CHECK (phase IN ('held', 'purging', 'completed', 'cancelled'));
