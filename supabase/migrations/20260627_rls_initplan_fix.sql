-- RLS performance pass
--
-- 1. Wrap auth.uid() / auth.jwt() in (select ...) on every policy so Postgres
--    evaluates the auth function once per query rather than once per row.
-- 2. Fix roadmap_items multiple-permissive-SELECT: change "Admin write roadmap"
--    from FOR ALL to FOR INSERT, UPDATE, DELETE so it no longer overlaps with
--    the "Public read roadmap" SELECT policy.

-- ── feedback ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can read own feedback" ON public.feedback;
CREATE POLICY "Users can read own feedback"
  ON public.feedback FOR SELECT
  USING ((select auth.uid()) = user_id);

-- ── roadmap_items ─────────────────────────────────────────────────────────────
-- Drop both, then recreate write-only admin policy (fixes multiple_permissive_policies too)
DROP POLICY IF EXISTS "Admin write roadmap" ON public.roadmap_items;
DROP POLICY IF EXISTS "Public read roadmap"  ON public.roadmap_items;

CREATE POLICY "Public read roadmap" ON public.roadmap_items
  FOR SELECT USING (true);

CREATE POLICY "Admin write roadmap" ON public.roadmap_items
  FOR INSERT
  WITH CHECK (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean, false));

CREATE POLICY "Admin update roadmap" ON public.roadmap_items
  FOR UPDATE
  USING      (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean, false))
  WITH CHECK (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean, false));

CREATE POLICY "Admin delete roadmap" ON public.roadmap_items
  FOR DELETE
  USING      (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean, false));

-- ── user_profiles ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own profile" ON public.user_profiles;
CREATE POLICY "Users read own profile"
  ON public.user_profiles FOR SELECT
  USING ((select auth.uid()) = user_id);

-- ── ai_findings ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own findings" ON public.ai_findings;
CREATE POLICY "Users manage own findings"
  ON public.ai_findings
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── character_interviews ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own interviews" ON public.character_interviews;
CREATE POLICY "Users manage own interviews"
  ON public.character_interviews
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── user_data (pre-migration table) ──────────────────────────────────────────
DROP POLICY IF EXISTS "Users can access own data" ON public.user_data;
CREATE POLICY "Users can access own data"
  ON public.user_data
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── scenes (pre-migration table) ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can access own scenes" ON public.scenes;
CREATE POLICY "Users can access own scenes"
  ON public.scenes
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── project_data (pre-migration table) ───────────────────────────────────────
DROP POLICY IF EXISTS "Users can read own project data"   ON public.project_data;
DROP POLICY IF EXISTS "Users can insert own project data" ON public.project_data;
DROP POLICY IF EXISTS "Users can update own project data" ON public.project_data;
DROP POLICY IF EXISTS "Users can delete own project data" ON public.project_data;

CREATE POLICY "Users can read own project data"
  ON public.project_data FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own project data"
  ON public.project_data FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own project data"
  ON public.project_data FOR UPDATE
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own project data"
  ON public.project_data FOR DELETE
  USING ((select auth.uid()) = user_id);

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

DROP POLICY IF EXISTS "Users manage own scenes" ON public.scenes;
CREATE POLICY "Users manage own scenes" ON public.scenes
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

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
