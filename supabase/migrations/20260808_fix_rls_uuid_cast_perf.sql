-- Fix RLS performance regression introduced by 20260629_rls_initplan_fix.sql.
--
-- That migration correctly wrapped auth.uid() in (select ...) to avoid
-- per-row re-evaluation, but it also cast both sides of every comparison to
-- ::text — e.g. (select auth.uid())::text = user_id::text. user_id is UUID
-- on every table below (verified against information_schema — the one
-- exception, scenes.user_id, is genuinely TEXT and is left untouched), so
-- casting it to text wraps the indexed column in a function call, which
-- stops Postgres from using the plain idx_<table>_user_id btree index for
-- the RLS check. Every RLS-filtered query on these tables was silently
-- falling back to a full sequential scan. Small tables/accounts never
-- noticed; on larger tables (characters in particular) this got slow enough
-- to hit Postgres's own statement_timeout (error 57014), which surfaced to
-- users as a data-load failure ("connection hiccup") on login.
--
-- Fix: compare (select auth.uid()) directly against user_id (both UUID),
-- keeping the initplan optimization but dropping the ::text casts so the
-- existing user_id indexes can be used again.

DROP POLICY IF EXISTS "Users can read own feedback" ON public.feedback;
CREATE POLICY "Users can read own feedback"
  ON public.feedback FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users read own profile" ON public.user_profiles;
CREATE POLICY "Users read own profile"
  ON public.user_profiles FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own findings" ON public.ai_findings;
CREATE POLICY "Users manage own findings"
  ON public.ai_findings
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own interviews" ON public.character_interviews;
CREATE POLICY "Users manage own interviews"
  ON public.character_interviews
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── normalized_storage tables ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users manage own novels" ON public.novels;
CREATE POLICY "Users manage own novels" ON public.novels
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own series_items" ON public.series_items;
CREATE POLICY "Users manage own series_items" ON public.series_items
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own characters" ON public.characters;
CREATE POLICY "Users manage own characters" ON public.characters
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own factions" ON public.factions;
CREATE POLICY "Users manage own factions" ON public.factions
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own locations" ON public.locations;
CREATE POLICY "Users manage own locations" ON public.locations
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own timeline_events" ON public.timeline_events;
CREATE POLICY "Users manage own timeline_events" ON public.timeline_events
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own world_history" ON public.world_history;
CREATE POLICY "Users manage own world_history" ON public.world_history
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own acts" ON public.acts;
CREATE POLICY "Users manage own acts" ON public.acts
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own chapters" ON public.chapters;
CREATE POLICY "Users manage own chapters" ON public.chapters
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- scenes.user_id is TEXT (legacy, pre-dates the UUID-based normalized_storage
-- tables) — its existing ::text cast is a no-op there, not a perf bug, so it
-- is intentionally left untouched by this migration.

DROP POLICY IF EXISTS "Users manage own lore_entries" ON public.lore_entries;
CREATE POLICY "Users manage own lore_entries" ON public.lore_entries
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own idea_entries" ON public.idea_entries;
CREATE POLICY "Users manage own idea_entries" ON public.idea_entries
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own maps_data" ON public.maps_data;
CREATE POLICY "Users manage own maps_data" ON public.maps_data
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own whiteboards_data" ON public.whiteboards_data;
CREATE POLICY "Users manage own whiteboards_data" ON public.whiteboards_data
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own story_schedule" ON public.story_schedule;
CREATE POLICY "Users manage own story_schedule" ON public.story_schedule
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own rpg_characters" ON public.rpg_characters;
CREATE POLICY "Users manage own rpg_characters" ON public.rpg_characters
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own comic_pages" ON public.comic_pages;
CREATE POLICY "Users manage own comic_pages" ON public.comic_pages
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own comic_panels" ON public.comic_panels;
CREATE POLICY "Users manage own comic_panels" ON public.comic_panels
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own eras" ON public.eras;
CREATE POLICY "Users manage own eras" ON public.eras
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own settings" ON public.user_settings;
CREATE POLICY "Users manage own settings" ON public.user_settings
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
