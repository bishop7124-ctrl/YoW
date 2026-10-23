-- Beta close, step 2 of 3: START THE 30-DAY NOTICE for existing Beta testers.
-- RUN ONLY AT LAUNCH, and only with the owner's go-ahead (see docs/QA_PLAN.md "Beta close runbook").
-- 1. Change the ONE timestamp on the line marked EDIT to the exact launch time (UTC), keeping the same format.
-- 2. Only Beta testers with no notice yet are stamped. Paid, revoked and already-stamped accounts are left alone.
-- 3. To undo, run rollback.sql with the SAME timestamp.
-- Existing testers keep full web access and their exports; the 30 days start counting from the stamp.
update auth.users
set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('beta_notice_started_at', '2026-11-01T09:00:00.000Z') -- EDIT: launch timestamp
where (raw_app_meta_data->>'subscription_plan' = 'beta_tester' or raw_app_meta_data->>'beta_tester' = 'true')
  and raw_app_meta_data->>'beta_notice_started_at' is null
  and raw_app_meta_data->>'access_revoked_at' is null
  and not coalesce(raw_app_meta_data->>'subscription_plan' in ('premium_lifetime', 'premium_plus_lifetime', 'founder')
           or (raw_app_meta_data->>'subscription_plan' = 'premium_monthly'
               and raw_app_meta_data->>'subscription_status' in ('active', 'trialing')), false);
