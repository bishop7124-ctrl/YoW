-- LAUNCH DAY, step 2 of 2 for closing Beta (step 1 is setting YOW_BETA_ENROLLMENT_CLOSED=true in Vercel).
-- Starts the 30-day Beta notice for every existing Beta tester by stamping the SAME timestamp on all of them.
-- Run in the Supabase SQL editor AFTER taking a backup. Run the blocks one at a time, in order.
-- Edit the timestamp in BOTH blocks (and in scripts/launch/undo-beta-notice.sql) if launch time changes.
-- Beta ends 30 days after this timestamp: 2026-11-01 09:00 UTC -> access ends 2026-12-01 09:00 UTC.

-- BLOCK 1: PREVIEW (read-only). "will_stamp" is how many accounts change; the others are left alone.
select
  count(*) filter (where is_beta and not already_stamped and not is_paid)  as will_stamp,
  count(*) filter (where is_beta and already_stamped)                      as already_stamped,
  count(*) filter (where is_beta and is_paid)                              as beta_but_paid_skipped,
  count(*) filter (where not is_beta)                                      as not_beta_untouched
from (
  select
    coalesce(raw_app_meta_data->>'beta_tester' = 'true' or raw_app_meta_data->>'subscription_plan' = 'beta_tester', false) as is_beta,
    (raw_app_meta_data->>'beta_notice_started_at') is not null                                             as already_stamped,
    (raw_app_meta_data->>'stripe_customer_id') is not null
      or coalesce(raw_app_meta_data->>'subscription_plan', '') in ('premium_monthly', 'premium_plus_lifetime', 'founding_lifetime')
      or coalesce(raw_app_meta_data->>'subscription_status', '') in ('active', 'trialing')                  as is_paid
  from auth.users
) u;

-- BLOCK 2: STAMP. Only Beta testers who are not paid and not already stamped. Safe to run twice (second run changes nothing).
update auth.users
set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('beta_notice_started_at', '2026-11-01T09:00:00.000Z')
where (raw_app_meta_data->>'beta_tester' = 'true' or raw_app_meta_data->>'subscription_plan' = 'beta_tester')
  and (raw_app_meta_data->>'beta_notice_started_at') is null
  and (raw_app_meta_data->>'stripe_customer_id') is null
  and coalesce(raw_app_meta_data->>'subscription_plan', '') not in ('premium_monthly', 'premium_plus_lifetime', 'founding_lifetime')
  and coalesce(raw_app_meta_data->>'subscription_status', '') not in ('active', 'trialing');

-- BLOCK 3: VERIFY (read-only). Expect stamped = the "will_stamp" number from block 1, and one single timestamp.
select count(*) as stamped, min(raw_app_meta_data->>'beta_notice_started_at') as earliest, max(raw_app_meta_data->>'beta_notice_started_at') as latest
from auth.users
where raw_app_meta_data->>'beta_notice_started_at' = '2026-11-01T09:00:00.000Z';
