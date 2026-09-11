-- ============================================================
-- Migration: Stripe webhook idempotency + atomic Founder allocation
-- Date:      2026-09-01
-- Purpose:   audit finding P0-05 (docs/YOW_CODE_AUDIT_2026-09-01.md) —
--            api/stripe-webhook.js had no processed-event ledger (a Stripe
--            retry, or the checkout.session.completed + first invoice.paid
--            pair for the same maintenance subscription, could apply
--            fulfillment more than once) and Founder slot allocation was
--            only checked before Checkout creation, not reserved atomically
--            at fulfillment — two concurrent purchases near the 100-slot
--            cap could both succeed.
-- ============================================================

-- ----------------------------------------------------------
-- 1.  stripe_processed_events — event-id ledger
--     api/stripe-webhook.js INSERTs the incoming event.id before doing any
--     fulfillment work. A unique-violation means this exact event was
--     already claimed (by an earlier delivery, or a concurrent retry
--     arriving at the same instant) and processing is skipped. On a
--     handler error the row is deleted so a legitimate later Stripe retry
--     can still be processed — a row only remains permanently once the
--     handler completes without throwing.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_processed_events (
  id           TEXT        PRIMARY KEY,  -- Stripe event id, e.g. evt_...
  type         TEXT        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated — this table is written and read only
-- by server code using the service role key, which bypasses RLS.

-- ----------------------------------------------------------
-- 2.  user_profiles.founder_overflow_at
--     Set when a paid Founder purchase loses the atomic slot race (see
--     claim_founder_slot below) — the buyer is granted Lifetime instead so
--     they are never left with nothing for a completed payment, and this
--     timestamp flags the account for manual owner follow-up (comp a slot,
--     or refund the Founder/Lifetime price difference).
-- ----------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS founder_overflow_at TIMESTAMPTZ;

-- ----------------------------------------------------------
-- 3.  claim_founder_slot — atomic check-and-reserve
--     Returns true and marks the user a Founder iff a slot was available;
--     returns false (and makes no change) if the cap was already reached.
--     pg_advisory_xact_lock serializes concurrent callers for the duration
--     of the transaction so two simultaneous claims cannot both observe
--     "slot available" before either writes — the actual race this exists
--     to close.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_founder_slot(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  config    jsonb;
  cap       int;
  reserved  int;
  taken     int;
  already   boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('founder_slot_claim'));

  -- Already a Founder (e.g. a Stripe retry after the first claim
  -- succeeded but the webhook response was lost) — idempotent no-op.
  SELECT is_founder INTO already FROM public.user_profiles WHERE user_id = p_user_id;
  IF already THEN
    RETURN true;
  END IF;

  SELECT value INTO config FROM public.app_config WHERE key = 'founder_slots';
  cap      := COALESCE((config->>'total')::int, 100);
  reserved := COALESCE((config->>'reserved')::int, 0);

  SELECT COUNT(*) INTO taken FROM public.user_profiles WHERE is_founder = true;

  IF taken >= (cap - reserved) THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_profiles (user_id, is_founder, updated_at)
  VALUES (p_user_id, true, NOW())
  ON CONFLICT (user_id) DO UPDATE SET is_founder = true, updated_at = NOW();

  RETURN true;
END;
$$;

-- Server-side only — called from api/stripe-webhook.js with the service
-- role key, never from the client.
GRANT EXECUTE ON FUNCTION public.claim_founder_slot(uuid) TO service_role;

-- ----------------------------------------------------------
-- 4.  release_founder_slot — refund path
--     Frees the slot counter (is_founder = false) so get_founder_slot_info
--     and claim_founder_slot both see it as available again. Does not
--     touch subscription_plan/app_metadata — whether a refund also revokes
--     the user's paid access is a separate product decision, not something
--     this migration decides.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_founder_slot(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET is_founder = false, updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_founder_slot(uuid) TO service_role;
