-- One-off data cleanup — NOT a schema migration, do not check into supabase/migrations/.
--
-- Account 230bf216-b373-41e5-8886-d9dbc16b7554 has "Aurethos 1" as three separate
-- novel rows (a test import created two extra full copies on 2026-08-04). Only
-- crtbtixbw8omqvfhg25 (created 2026-06-26) carries seriesId sdkh1txk1zemqvfeyk0,
-- matching Aurethos 2 (0bkkcb8pntd8mqw4rzv5) and Aurethos 3 (p22zr8zn28mqwbhotc) —
-- that's the one confirmed as canonical. This removes the other two:
--   6xnzjuel95gmsf2jil4  (created 2026-08-04 19:46, seriesId null)
--   y684c60supmsf33207   (created 2026-08-04 20:01, seriesId null)
--
-- Row counts affected (verified via count(*) before writing this script):
--   characters 24, factions 8, locations 14, timeline_events 106, world_history 20,
--   acts 6, chapters 4, lore_entries 24, idea_entries 6, maps_data 6,
--   story_schedule 4, eras 14, scenes 4, novels 2.
-- (whiteboards_data, rpg_characters, comic_pages, comic_panels: 0, listed for
-- completeness/future-proofing in case that changes.)
--
-- This also deletes ~9.7MB of embedded base64 character portrait images that
-- were duplicated along with the test copies.
--
-- Review before running. Run with:
--   supabase db query --linked --file scripts/cleanup_aurethos1_test_import_duplicates.sql
--
-- Recommended: take a fresh backup/snapshot first (Supabase dashboard ->
-- Database -> Backups), since this is a permanent delete.

begin;

do $$
declare
  v_user_id uuid := '230bf216-b373-41e5-8886-d9dbc16b7554';
  v_novel_ids text[] := array['6xnzjuel95gmsf2jil4','y684c60supmsf33207'];
begin
  delete from public.characters      where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.factions        where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.locations       where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.timeline_events where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.world_history   where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.acts            where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.chapters        where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.lore_entries    where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.idea_entries    where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.maps_data       where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.whiteboards_data where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.story_schedule  where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.rpg_characters  where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.comic_pages     where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.comic_panels    where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);
  delete from public.eras            where user_id = v_user_id and data->>'novelId' = any(v_novel_ids);

  -- scenes.novel_id is a plain text column, not JSONB
  delete from public.scenes where user_id = v_user_id and novel_id = any(v_novel_ids);

  -- finally, the duplicate novel rows themselves
  delete from public.novels where user_id = v_user_id and id = any(v_novel_ids);
end $$;

commit;

-- Verification query to run afterward:
-- select id, data->>'title' as title, data->>'seriesId' as series_id
-- from public.novels where user_id = '230bf216-b373-41e5-8886-d9dbc16b7554';
-- Should return exactly 5 rows, one "Aurethos 1" (crtbtixbw8omqvfhg25).
