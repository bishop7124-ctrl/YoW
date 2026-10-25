-- UNDO for stamp-beta-notice.sql: removes the Beta notice date again, but ONLY where it equals the launch timestamp
-- that script wrote, so accounts stamped by anything else are untouched. Keep this timestamp identical to the stamp script.
-- Run in the Supabase SQL editor. Testers go back to open-ended Beta access immediately.
update auth.users
set raw_app_meta_data = raw_app_meta_data - 'beta_notice_started_at'
where raw_app_meta_data->>'beta_notice_started_at' = '2026-11-01T09:00:00.000Z';

-- Check (read-only): expect 0.
select count(*) as still_stamped from auth.users where raw_app_meta_data->>'beta_notice_started_at' = '2026-11-01T09:00:00.000Z';
