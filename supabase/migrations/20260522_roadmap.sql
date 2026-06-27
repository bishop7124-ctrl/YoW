-- Roadmap items — editable by admin from within the app.
-- Apply in Supabase dashboard → SQL Editor.

create table if not exists public.roadmap_items (
  id           uuid        default gen_random_uuid() primary key,
  phase_key    text        not null,   -- 'live' | 'next' | 'planned' | 'exploring'
  phase_label  text        not null,   -- display label, e.g. 'Now — Live'
  phase_order  int         not null default 0,
  text         text        not null,
  item_order   int         not null default 0,
  created_at   timestamptz default now()
);

alter table public.roadmap_items enable row level security;

-- Anyone (including logged-out visitors) can read the roadmap
drop policy if exists "Public read roadmap" on public.roadmap_items;
create policy "Public read roadmap" on public.roadmap_items
  for select using (true);

-- Only users whose JWT app_metadata contains is_admin: true can write
drop policy if exists "Admin write roadmap" on public.roadmap_items;
create policy "Admin write roadmap" on public.roadmap_items
  for all using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)
  );

-- ─── Seed: initial roadmap items ─────────────────────────────────────────────
insert into public.roadmap_items (phase_key, phase_label, phase_order, text, item_order) values
  ('live', 'Now — Live', 0, 'Manuscript editor with chapters, scenes, and acts', 0),
  ('live', 'Now — Live', 0, 'Character profiles, relationship maps, family trees, and factions', 1),
  ('live', 'Now — Live', 0, 'World-building: locations, maps, lore, timeline, world history', 2),
  ('live', 'Now — Live', 0, 'Story outline and beat planning', 3),
  ('live', 'Now — Live', 0, 'Ideas board and writing schedule', 4),
  ('live', 'Now — Live', 0, 'Project dashboard with word counts and progress stats', 5),
  ('live', 'Now — Live', 0, 'AI assistant with context-aware creative suggestions', 6),
  ('live', 'Now — Live', 0, 'Themes, fonts, and full appearance customisation', 7),
  ('live', 'Now — Live', 0, 'Cookie consent, privacy controls, and account preferences', 8),

  ('next', 'Up Next — Q3 2026', 1, 'Export to PDF, ePub, and Final Draft formats', 0),
  ('next', 'Up Next — Q3 2026', 1, 'Image upload for character portraits and location art', 1),
  ('next', 'Up Next — Q3 2026', 1, 'Improved mobile layout and touch experience', 2),
  ('next', 'Up Next — Q3 2026', 1, 'Revision history and version snapshots for manuscripts', 3),

  ('planned', 'Later — Q4 2026', 2, 'Collaboration mode — invite co-authors to a project', 0),
  ('planned', 'Later — Q4 2026', 2, 'Series management and cross-project character/location references', 1),
  ('planned', 'Later — Q4 2026', 2, 'Writing sprints and community goals', 2),
  ('planned', 'Later — Q4 2026', 2, 'Template library for common story structures', 3),

  ('exploring', 'Exploring', 3, 'Voice dictation for manuscript drafting', 0),
  ('exploring', 'Exploring', 3, 'Integration with publishing platforms', 1),
  ('exploring', 'Exploring', 3, 'AI-assisted developmental editing feedback', 2),
  ('exploring', 'Exploring', 3, 'Native desktop app (Mac / Windows)', 3);
