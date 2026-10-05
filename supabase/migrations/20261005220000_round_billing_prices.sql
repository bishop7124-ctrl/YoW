-- Keep the informational billing configuration aligned with the approved
-- rounded GBP prices. Stripe Price objects and the checkout server remain the
-- authoritative source for actual charges.
UPDATE public.app_config
SET value = value || jsonb_build_object(
  'hosting_renewal_fee_gbp', 6,
  'monthly_price_gbp', 10,
  'founding_lifetime_price_gbp', 50,
  'lifetime_price_gbp', 75
), updated_at = now()
WHERE key = 'billing';
