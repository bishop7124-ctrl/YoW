-- ============================================================
-- Migration: per-entity normalized storage
-- Replaces user_data / project_data blobs with one row per item.
-- Each entity table: id TEXT PK, user_id UUID, novel_id TEXT, data JSONB
-- user_settings stores user-level scalars (activeNovelId, etc.)
-- ============================================================

-- Helper macro: create an entity table + RLS in one shot
-- We expand it manually below since PL/pgSQL DDL loops are awkward.

-- ── novels ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.novels (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.novels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own novels" ON public.novels;
CREATE POLICY "Users manage own novels" ON public.novels
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── series_items ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.series_items (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.series_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own series_items" ON public.series_items;
CREATE POLICY "Users manage own series_items" ON public.series_items
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── characters ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.characters (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own characters" ON public.characters;
CREATE POLICY "Users manage own characters" ON public.characters
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── factions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.factions (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.factions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own factions" ON public.factions;
CREATE POLICY "Users manage own factions" ON public.factions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── locations ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.locations (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own locations" ON public.locations;
CREATE POLICY "Users manage own locations" ON public.locations
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── timeline_events ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.timeline_events (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own timeline_events" ON public.timeline_events;
CREATE POLICY "Users manage own timeline_events" ON public.timeline_events
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── world_history ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_history (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.world_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own world_history" ON public.world_history;
CREATE POLICY "Users manage own world_history" ON public.world_history
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── acts ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acts (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.acts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own acts" ON public.acts;
CREATE POLICY "Users manage own acts" ON public.acts
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── chapters ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chapters (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own chapters" ON public.chapters;
CREATE POLICY "Users manage own chapters" ON public.chapters
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── lore_entries ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lore_entries (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.lore_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own lore_entries" ON public.lore_entries;
CREATE POLICY "Users manage own lore_entries" ON public.lore_entries
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── idea_entries ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.idea_entries (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.idea_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own idea_entries" ON public.idea_entries;
CREATE POLICY "Users manage own idea_entries" ON public.idea_entries
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── maps_data ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maps_data (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.maps_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own maps_data" ON public.maps_data;
CREATE POLICY "Users manage own maps_data" ON public.maps_data
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── whiteboards_data ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whiteboards_data (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.whiteboards_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own whiteboards_data" ON public.whiteboards_data;
CREATE POLICY "Users manage own whiteboards_data" ON public.whiteboards_data
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── story_schedule ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.story_schedule (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.story_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own story_schedule" ON public.story_schedule;
CREATE POLICY "Users manage own story_schedule" ON public.story_schedule
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── rpg_characters ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rpg_characters (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.rpg_characters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own rpg_characters" ON public.rpg_characters;
CREATE POLICY "Users manage own rpg_characters" ON public.rpg_characters
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── comic_pages ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comic_pages (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.comic_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own comic_pages" ON public.comic_pages;
CREATE POLICY "Users manage own comic_pages" ON public.comic_pages
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── comic_panels ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comic_panels (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.comic_panels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own comic_panels" ON public.comic_panels;
CREATE POLICY "Users manage own comic_panels" ON public.comic_panels
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── eras ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eras (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.eras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own eras" ON public.eras;
CREATE POLICY "Users manage own eras" ON public.eras
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── user_settings ─────────────────────────────────────────────────────────────
-- Stores user-level scalars: activeNovelId, currentYear, activeMapByNovel
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own settings" ON public.user_settings;
CREATE POLICY "Users manage own settings" ON public.user_settings
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
