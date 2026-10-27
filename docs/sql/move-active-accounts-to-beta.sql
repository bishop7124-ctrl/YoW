-- Move currently active Free/trial accounts onto the Beta plan.
-- Run in the Supabase SQL editor (production). Owner-run; review step 1 before step 3.
--
-- Beta is stored in auth.users.raw_app_meta_data (same fields api/register-paid-interest.js writes):
--   subscription_plan = 'beta_tester', beta_tester = true, subscription_status = 'active'.
-- The selection mirrors canGrantBetaAccess() and lifecycleTrackFor(), so it never touches:
--   paid / Lifetime / Founder / Monthly accounts, Stripe customers, admins, lifecycle holds,
--   accounts with access revoked, accounts already on beta, banned or deleted users.
-- It does NOT stamp beta_notice_started_at. Without it, beta access has no end date.
-- Step 5 stamps the launch time (30 days later = Wednesday 2 December 2026).

-- 1. PREVIEW: who would move. Check the count and eyeball the list.
select count(*) as accounts_to_move
from auth.users u
where u.deleted_at is null
  and (u.banned_until is null or u.banned_until < now())
  and u.email_confirmed_at is not null
  and coalesce(u.raw_app_meta_data->>'subscription_plan', 'free') in ('free', '')
  and coalesce(u.raw_app_meta_data->>'subscription_status', '') not in ('active', 'trialing')
  and coalesce(u.raw_app_meta_data->>'beta_tester', 'false') <> 'true'
  and u.raw_app_meta_data->>'beta_notice_started_at' is null
  and u.raw_app_meta_data->>'access_revoked_at' is null
  and u.raw_app_meta_data->>'stripe_customer_id' is null
  and coalesce(u.raw_app_meta_data->>'has_stripe_customer', 'false') <> 'true'
  and coalesce(u.raw_app_meta_data->>'is_admin', 'false') <> 'true'
  and coalesce(u.raw_app_meta_data->>'role', '') <> 'admin'
  and coalesce(u.raw_app_meta_data->>'lifecycle_hold', 'false') <> 'true'
  and coalesce(u.raw_user_meta_data->>'lifecycle_hold', 'false') <> 'true';

-- 2. BACKUP: keep the old metadata so this can be reversed.
create table if not exists public.beta_migration_backup_20261102 as
select u.id, u.email, u.raw_app_meta_data as old_app_meta, now() as backed_up_at
from auth.users u
where false;

insert into public.beta_migration_backup_20261102 (id, email, old_app_meta)
select u.id, u.email, u.raw_app_meta_data
from auth.users u
where u.deleted_at is null
  and (u.banned_until is null or u.banned_until < now())
  and u.email_confirmed_at is not null
  and coalesce(u.raw_app_meta_data->>'subscription_plan', 'free') in ('free', '')
  and coalesce(u.raw_app_meta_data->>'subscription_status', '') not in ('active', 'trialing')
  and coalesce(u.raw_app_meta_data->>'beta_tester', 'false') <> 'true'
  and u.raw_app_meta_data->>'beta_notice_started_at' is null
  and u.raw_app_meta_data->>'access_revoked_at' is null
  and u.raw_app_meta_data->>'stripe_customer_id' is null
  and coalesce(u.raw_app_meta_data->>'has_stripe_customer', 'false') <> 'true'
  and coalesce(u.raw_app_meta_data->>'is_admin', 'false') <> 'true'
  and coalesce(u.raw_app_meta_data->>'role', '') <> 'admin'
  and coalesce(u.raw_app_meta_data->>'lifecycle_hold', 'false') <> 'true'
  and coalesce(u.raw_user_meta_data->>'lifecycle_hold', 'false') <> 'true';

alter table public.beta_migration_backup_20261102 enable row level security;  -- no policies: service role only

-- 3. MOVE: merge beta fields into app metadata (keeps every other key).
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
      'subscription_plan', 'beta_tester',
      'subscription_status', 'active',
      'beta_tester', true,
      'beta_tester_started_at', coalesce(u.raw_app_meta_data->>'beta_tester_started_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
      'beta_tester_source', 'launch_migration'
    )
where u.id in (select id from public.beta_migration_backup_20261102);

-- 4. VERIFY: should equal the step 1 count.
select count(*) as now_on_beta
from auth.users
where id in (select id from public.beta_migration_backup_20261102)
  and raw_app_meta_data->>'subscription_plan' = 'beta_tester';

-- 5. LAUNCH DAY ONLY (Monday 2 November 2026): start the 30-day notice for ALL beta accounts,
--    with one shared timestamp, so beta ends Wednesday 2 December 00:00 UTC. Do not run earlier.
-- update auth.users u
-- set raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('beta_notice_started_at', '2026-11-02T00:00:00Z')
-- where u.raw_app_meta_data->>'subscription_plan' = 'beta_tester'
--   and u.raw_app_meta_data->>'beta_notice_started_at' is null
--   and coalesce(u.raw_app_meta_data->>'beta_tester', 'false') = 'true';

-- ROLLBACK (if needed):
-- update auth.users u set raw_app_meta_data = b.old_app_meta
-- from public.beta_migration_backup_20261102 b where b.id = u.id;
