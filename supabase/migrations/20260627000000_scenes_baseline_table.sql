-- scenes is a "pre-migration" table: it existed in the live production
-- database before this repo's normalized_storage migration
-- (20260626_normalized_storage.sql) introduced the rest of the per-entity
-- tables, so no migration in this repo ever created it. A fresh/from-zero
-- Supabase project built from just these migrations could not reconstruct
-- it, and every later migration that touches scenes (20260627_add_user_id_
-- indexes.sql, 20260629_rls_initplan_fix.sql, 20260801120000_scenes_add_
-- novel_id.sql, 20260808_fix_rls_uuid_cast_perf.sql) implicitly assumes it
-- already exists (audit finding P0-09, docs/YOW_CODE_AUDIT_2026-09-01.md).
--
-- This is a no-op against the existing production table (IF NOT EXISTS)
-- and only matters for building a new environment from scratch. Named/dated
-- to apply immediately after normalized_storage.sql and before the first
-- migration that assumes scenes exists.
--
-- Schema confirmed against actual application code, not guessed:
-- - user_id is TEXT, not UUID, unlike every other per-entity table in
--   20260626_normalized_storage.sql — confirmed against
--   information_schema by 20260808_fix_rls_uuid_cast_perf.sql's own
--   comment ("scenes.user_id is TEXT (legacy, pre-dates the UUID-based
--   normalized_storage tables)").
-- - scene_id (not id) is the primary key column — see
--   src/utils/firestoreSync.js's getTableRows()/saveSceneDoc()/
--   deleteSceneDoc(), which all key scenes by scene_id, and loadUserData(),
--   which selects `scene_id, data` for this table specifically instead of
--   the `id, data, updated_at` every sibling table uses.
-- - novel_id is nullable TEXT, added later by
--   20260801120000_scenes_add_novel_id.sql via `ADD COLUMN IF NOT EXISTS
--   novel_id TEXT` with no NOT NULL constraint — matched here so a
--   from-zero build ends in the same schema shape that migration's own
--   ADD COLUMN (a no-op once the column already exists) would produce.
-- - No updated_at column: never selected or written by any app code path
--   (loadUserData()'s explicit per-table column list omits it only for
--   scenes; getTableRows()'s scenes branch doesn't write it either).
CREATE TABLE IF NOT EXISTS public.scenes (
  scene_id TEXT  PRIMARY KEY,
  user_id  TEXT  NOT NULL,
  novel_id TEXT,
  data     JSONB NOT NULL DEFAULT '{}'
);
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
-- Row-level policy is intentionally left to 20260629_rls_initplan_fix.sql,
-- which already creates it (guarded by an IF EXISTS check that this
-- migration now satisfies on a from-zero build too) — not duplicated here
-- to avoid the two copies drifting apart over time.
