-- ── Billing config migration ──────────────────────────────────────────────────
-- Stores admin-editable billing constants in app_config.
-- The authoritative source for amounts is Stripe; these values drive UI copy
-- and server-side validation defaults when env vars are not overridden.
--
-- app_metadata fields written by the webhook (no schema change needed — these
-- live in auth.users.app_metadata as JSONB):
--   hosting_included_until  TEXT   ISO date: when included cloud hosting ends (null = Founder / lifetime)
--   maintenance_expires_at  TEXT   ISO date: when the last annual renewal expires
--   lifetime_purchased_at   TEXT   ISO date: original one-time purchase date
--
-- This migration seeds / updates app_config with billing defaults.

INSERT INTO public.app_config (key, value)
VALUES (
  'billing',
  jsonb_build_object(
    'hosting_renewal_fee_gbp',        6,
    'hosting_included_years',         3,
    'hosting_renewal_warning_days',   30,
    'monthly_price_gbp',              10,
    'lifetime_price_gbp',             199,
    'founder_price_gbp',              499,
    'founder_slots_total',            100
  )
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value;
