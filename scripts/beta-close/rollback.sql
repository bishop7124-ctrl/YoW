-- Beta close, step 3 of 3 (ONLY IF NEEDED): UNDO stamp.sql.
-- Put the SAME timestamp you used in stamp.sql on the line marked EDIT.
-- Only accounts stamped with exactly that timestamp are cleared; every other account is untouched.
update auth.users
set raw_app_meta_data = raw_app_meta_data - 'beta_notice_started_at'
where raw_app_meta_data->>'beta_notice_started_at' = '2026-11-01T09:00:00.000Z'; -- EDIT: same launch timestamp
