-- Add user_id indexes to all entity tables.
-- Without these every query filters by user_id via a full sequential table scan,
-- which is the primary cause of high Disk IO on the Supabase instance.

CREATE INDEX IF NOT EXISTS idx_novels_user_id           ON public.novels           (user_id);
CREATE INDEX IF NOT EXISTS idx_series_items_user_id     ON public.series_items     (user_id);
CREATE INDEX IF NOT EXISTS idx_characters_user_id       ON public.characters       (user_id);
CREATE INDEX IF NOT EXISTS idx_factions_user_id         ON public.factions         (user_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_id        ON public.locations        (user_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_user_id  ON public.timeline_events  (user_id);
CREATE INDEX IF NOT EXISTS idx_world_history_user_id    ON public.world_history    (user_id);
CREATE INDEX IF NOT EXISTS idx_acts_user_id             ON public.acts             (user_id);
CREATE INDEX IF NOT EXISTS idx_chapters_user_id         ON public.chapters         (user_id);
CREATE INDEX IF NOT EXISTS idx_scenes_user_id           ON public.scenes           (user_id);
CREATE INDEX IF NOT EXISTS idx_lore_entries_user_id     ON public.lore_entries     (user_id);
CREATE INDEX IF NOT EXISTS idx_idea_entries_user_id     ON public.idea_entries     (user_id);
CREATE INDEX IF NOT EXISTS idx_maps_data_user_id        ON public.maps_data        (user_id);
CREATE INDEX IF NOT EXISTS idx_whiteboards_data_user_id ON public.whiteboards_data (user_id);
CREATE INDEX IF NOT EXISTS idx_story_schedule_user_id   ON public.story_schedule   (user_id);
CREATE INDEX IF NOT EXISTS idx_rpg_characters_user_id   ON public.rpg_characters   (user_id);
CREATE INDEX IF NOT EXISTS idx_comic_pages_user_id      ON public.comic_pages      (user_id);
CREATE INDEX IF NOT EXISTS idx_comic_panels_user_id     ON public.comic_panels     (user_id);
CREATE INDEX IF NOT EXISTS idx_eras_user_id             ON public.eras             (user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id    ON public.user_settings    (user_id);

-- Composite indexes for novel-scoped tables (user_id + novel_id) —
-- used by deleteItemsByNovel and any future per-novel loads.
CREATE INDEX IF NOT EXISTS idx_characters_user_novel       ON public.characters       (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_factions_user_novel         ON public.factions         (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_novel        ON public.locations        (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_user_novel  ON public.timeline_events  (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_world_history_user_novel    ON public.world_history    (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_acts_user_novel             ON public.acts             (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_chapters_user_novel         ON public.chapters         (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_lore_entries_user_novel     ON public.lore_entries     (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_idea_entries_user_novel     ON public.idea_entries     (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_maps_data_user_novel        ON public.maps_data        (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_whiteboards_data_user_novel ON public.whiteboards_data (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_story_schedule_user_novel   ON public.story_schedule   (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_rpg_characters_user_novel   ON public.rpg_characters   (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_comic_pages_user_novel      ON public.comic_pages      (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_comic_panels_user_novel     ON public.comic_panels     (user_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_eras_user_novel             ON public.eras             (user_id, novel_id);
