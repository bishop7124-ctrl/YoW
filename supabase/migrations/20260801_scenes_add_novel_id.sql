-- scenes is a pre-migration table (see 20260626_normalized_storage.sql) that
-- never got the novel_id column every other novel-scoped table has. As a
-- result, bulk cleanup on project delete (deleteItemsByNovel in
-- src/utils/firestoreSync.js), which filters `WHERE novel_id = ...`, silently
-- fails for scenes (column does not exist), leaving orphaned cloud rows if
-- the client's per-scene fallback delete ever misses a row.
--
-- Add novel_id, backfill it from the existing data->>'novelId' payload, and
-- index it the same way as every other NOVEL_TABLES entry.

ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS novel_id TEXT;

UPDATE public.scenes
SET novel_id = data->>'novelId'
WHERE novel_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_scenes_user_novel ON public.scenes (user_id, novel_id);
