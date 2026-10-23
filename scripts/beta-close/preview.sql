-- Beta close, step 1 of 3: PREVIEW ONLY. Changes nothing. Safe to run any time.
-- Counts how many accounts the stamp step would touch and why others are skipped.
-- Counts only; no emails or names are shown.
with classified as (
  select
    id,
    raw_app_meta_data as m,
    coalesce(raw_app_meta_data->>'subscription_plan' = 'beta_tester' or raw_app_meta_data->>'beta_tester' = 'true', false) as is_beta,
    coalesce(raw_app_meta_data->>'subscription_plan' in ('premium_lifetime', 'premium_plus_lifetime', 'founder')
      or (raw_app_meta_data->>'subscription_plan' = 'premium_monthly'
          and raw_app_meta_data->>'subscription_status' in ('active', 'trialing')), false) as has_paid_plan
  from auth.users
)
select
  count(*) filter (where is_beta and not has_paid_plan and m->>'beta_notice_started_at' is null and m->>'access_revoked_at' is null) as will_be_stamped,
  count(*) filter (where is_beta and m->>'beta_notice_started_at' is not null) as already_stamped_left_alone,
  count(*) filter (where is_beta and has_paid_plan) as beta_flag_but_paid_left_alone,
  count(*) filter (where is_beta and m->>'access_revoked_at' is not null) as revoked_left_alone,
  count(*) filter (where not is_beta) as not_beta_left_alone
from classified;
