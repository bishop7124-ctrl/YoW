-- Founder is a permanent recognition status for the first 100 successful
-- live Lifetime purchases. The Founding Price is protected by expiring,
-- server-only checkout reservations so no more than 100 can be sold.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS founder_number integer,
  ADD COLUMN IF NOT EXISTS founder_awarded_at timestamptz;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.user_profiles WHERE is_founder = true) > 100 THEN
    RAISE EXCEPTION 'More than 100 legacy Founder profiles exist; review them before applying numbered Founder status';
  END IF;
END;
$$;

WITH ranked AS (
  SELECT user_id, row_number() OVER (ORDER BY created_at, user_id) AS number
  FROM public.user_profiles
  WHERE is_founder = true
)
UPDATE public.user_profiles AS profile
SET founder_number = ranked.number,
    founder_awarded_at = COALESCE(profile.founder_awarded_at, profile.created_at)
FROM ranked
WHERE profile.user_id = ranked.user_id
  AND profile.founder_number IS NULL
  AND ranked.number <= 100;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_founder_number_unique
  ON public.user_profiles (founder_number) WHERE founder_number IS NOT NULL;

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_founder_number_range;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_founder_number_range
  CHECK (founder_number IS NULL OR founder_number BETWEEN 1 AND 100) NOT VALID;

CREATE TABLE IF NOT EXISTS public.founder_checkout_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'claimed', 'released')),
  checkout_session_id text UNIQUE,
  checkout_url text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.founder_checkout_reservations ENABLE ROW LEVEL SECURITY;
-- No browser policies: all reads and writes are service-role RPC operations.
CREATE INDEX IF NOT EXISTS founder_checkout_reservations_active_idx
  ON public.founder_checkout_reservations (expires_at)
  WHERE status IN ('active', 'pending');

-- Atomically reserve a Founding Price before creating Checkout. Active
-- reservations count against availability but do not count as Founders.
CREATE OR REPLACE FUNCTION public.reserve_founder_checkout(
  p_user_id uuid,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  config jsonb;
  cap integer;
  reserved_count integer;
  founder_count integer;
  existing public.founder_checkout_reservations%ROWTYPE;
  reservation_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('founder_slot_claim'));
  UPDATE public.founder_checkout_reservations
  SET status = 'released', updated_at = now()
  WHERE status = 'active' AND expires_at <= now();

  SELECT * INTO existing
  FROM public.founder_checkout_reservations
  WHERE user_id = p_user_id AND status IN ('active', 'pending') AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'eligible', true, 'reservation_id', existing.id,
      'checkout_session_id', existing.checkout_session_id,
      'checkout_url', existing.checkout_url
    );
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = p_user_id AND is_founder = true) THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'already_founder');
  END IF;

  SELECT value INTO config FROM public.app_config WHERE key = 'founder_slots';
  cap := LEAST(100, COALESCE((config->>'total')::integer, 100))
    - GREATEST(0, COALESCE((config->>'reserved')::integer, 0));
  SELECT count(*) INTO founder_count FROM public.user_profiles WHERE founder_number IS NOT NULL;
  SELECT count(*) INTO reserved_count FROM public.founder_checkout_reservations
    WHERE status IN ('active', 'pending') AND expires_at > now();
  IF founder_count + reserved_count >= cap THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'sold_out');
  END IF;

  INSERT INTO public.founder_checkout_reservations (user_id, expires_at)
  VALUES (p_user_id, p_expires_at)
  RETURNING id INTO reservation_id;
  RETURN jsonb_build_object('eligible', true, 'reservation_id', reservation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.bind_founder_checkout(
  p_reservation_id uuid,
  p_user_id uuid,
  p_checkout_session_id text,
  p_checkout_url text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.founder_checkout_reservations
  SET checkout_session_id = p_checkout_session_id,
      checkout_url = p_checkout_url,
      updated_at = now()
  WHERE id = p_reservation_id AND user_id = p_user_id
    AND status = 'active' AND expires_at > now()
  RETURNING true;
$$;

CREATE OR REPLACE FUNCTION public.hold_founder_checkout(
  p_reservation_id uuid,
  p_user_id uuid,
  p_checkout_session_id text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.founder_checkout_reservations
  SET status = 'pending', expires_at = GREATEST(expires_at, now() + interval '30 days'), updated_at = now()
  WHERE id = p_reservation_id AND user_id = p_user_id
    AND checkout_session_id = p_checkout_session_id AND status = 'active'
  RETURNING true;
$$;

-- Successful payment converts the exact bound reservation into the next
-- immutable Founder number while holding the same advisory lock.
CREATE OR REPLACE FUNCTION public.finalize_founder_purchase(
  p_reservation_id uuid,
  p_user_id uuid,
  p_checkout_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reservation public.founder_checkout_reservations%ROWTYPE;
  existing public.user_profiles%ROWTYPE;
  next_number integer;
  awarded_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('founder_slot_claim'));
  SELECT * INTO reservation FROM public.founder_checkout_reservations
  WHERE id = p_reservation_id AND user_id = p_user_id
    AND checkout_session_id = p_checkout_session_id
    AND status IN ('active', 'pending', 'claimed') FOR UPDATE;
  IF reservation.id IS NULL THEN
    RAISE EXCEPTION 'Founder checkout reservation is missing or invalid';
  END IF;

  SELECT * INTO existing FROM public.user_profiles WHERE user_id = p_user_id;
  IF existing.is_founder AND existing.founder_number IS NOT NULL THEN
    UPDATE public.founder_checkout_reservations SET status = 'claimed', updated_at = now() WHERE id = reservation.id;
    RETURN jsonb_build_object('awarded', true, 'founder_number', existing.founder_number, 'founder_awarded_at', existing.founder_awarded_at);
  END IF;

  SELECT candidate INTO next_number
  FROM generate_series(1, 100) AS numbers(candidate)
  WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE founder_number = candidate)
  ORDER BY candidate LIMIT 1;
  IF next_number IS NULL THEN RAISE EXCEPTION 'Founder allocation cap reached'; END IF;

  awarded_at := now();
  INSERT INTO public.user_profiles (user_id, is_founder, founder_number, founder_awarded_at, updated_at)
  VALUES (p_user_id, true, next_number, awarded_at, awarded_at)
  ON CONFLICT (user_id) DO UPDATE SET
    is_founder = true,
    founder_number = EXCLUDED.founder_number,
    founder_awarded_at = COALESCE(public.user_profiles.founder_awarded_at, EXCLUDED.founder_awarded_at),
    updated_at = EXCLUDED.updated_at;
  UPDATE public.founder_checkout_reservations SET status = 'claimed', updated_at = now() WHERE id = reservation.id;
  RETURN jsonb_build_object('awarded', true, 'founder_number', next_number, 'founder_awarded_at', awarded_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_founder_checkout(p_reservation_id uuid, p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.founder_checkout_reservations SET status = 'released', updated_at = now()
  WHERE id = p_reservation_id AND user_id = p_user_id AND status IN ('active', 'pending');
$$;

-- Legacy function remains for historical Founder-plan webhook retries only.
-- New Lifetime purchases must use a bound checkout reservation.
REVOKE ALL ON FUNCTION public.reserve_founder_checkout(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bind_founder_checkout(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hold_founder_checkout(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_founder_purchase(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_founder_checkout(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_founder_checkout(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_founder_checkout(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hold_founder_checkout(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_founder_purchase(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_founder_checkout(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.get_founder_slot_info()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE config jsonb; v_total integer; v_reserved integer; v_taken integer; v_holds integer;
BEGIN
  SELECT value INTO config FROM public.app_config WHERE key = 'founder_slots';
  v_total := LEAST(100, COALESCE((config->>'total')::integer, 100));
  v_reserved := GREATEST(0, COALESCE((config->>'reserved')::integer, 0));
  SELECT count(*) INTO v_taken FROM public.user_profiles WHERE founder_number IS NOT NULL;
  SELECT count(*) INTO v_holds FROM public.founder_checkout_reservations WHERE status IN ('active', 'pending') AND expires_at > now();
  RETURN jsonb_build_object('total', v_total, 'taken', v_taken, 'held', v_holds,
    'remaining', GREATEST(0, v_total - v_reserved - v_taken - v_holds));
END;
$$;

INSERT INTO public.app_config (key, value)
VALUES ('billing', jsonb_build_object(
  'hosting_renewal_fee_gbp', 6, 'hosting_included_years', 1,
  'founding_hosting_included_years', 2, 'hosting_renewal_warning_days', 30,
  'monthly_price_gbp', 9.99, 'founding_lifetime_price_gbp', 49.99,
  'lifetime_price_gbp', 74.99, 'founder_slots_total', 100
)) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
