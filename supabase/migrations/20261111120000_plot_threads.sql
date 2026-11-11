-- Plot threads (roadmap Release B, step B0). See
-- docs/planning/future-release/10_RELEASE_B_PLOT_THREADS_DESIGN.md.
--
-- Additive: one new table, one trigger function and one trigger. No existing table, column, policy or
-- function is changed (in particular the shared project-delete / replace-all / record-merge functions are
-- NOT rewritten). NOT applied automatically: review it, then apply it from the Supabase SQL editor.
--
-- Model
--   * One row per thread, same shape as the other entity tables: (id, user_id, novel_id, data jsonb).
--   * Owner-only RLS, same policy style as the rest of the entity tables.
--   * Deleting a project removes its threads: delete_project_data_atomic() and replace_user_data_atomic()
--     both DELETE from public.novels, and the trigger below removes the matching threads in the same
--     transaction. (The client re-sends threads after a restore, so a restore never resurrects stale rows.)
--   * Account deletion: user_id references auth.users ON DELETE CASCADE.
--   * Row size is capped at 256 KB so one malformed client cannot store huge rows.
--
-- Rollback: nothing else depends on this. Turn the `plot_threads` feature flag off (the app stops reading
-- and writing). To remove entirely:
--   drop trigger plot_threads_cleanup_on_novel_delete on public.novels;
--   drop function public.delete_plot_threads_for_novel();
--   drop table public.plot_threads;

CREATE TABLE IF NOT EXISTS public.plot_threads (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plot_threads_data_size CHECK (pg_column_size(data) <= 262144)
);

CREATE INDEX IF NOT EXISTS idx_plot_threads_user_id ON public.plot_threads (user_id);
CREATE INDEX IF NOT EXISTS idx_plot_threads_user_novel ON public.plot_threads (user_id, novel_id);

ALTER TABLE public.plot_threads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.plot_threads FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plot_threads TO authenticated;

DROP POLICY IF EXISTS "Users manage own plot_threads" ON public.plot_threads;
CREATE POLICY "Users manage own plot_threads" ON public.plot_threads
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- A project's threads go when the project goes. Runs as the caller, so RLS still applies.
CREATE OR REPLACE FUNCTION public.delete_plot_threads_for_novel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.plot_threads
  WHERE user_id = OLD.user_id AND novel_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_plot_threads_for_novel() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS plot_threads_cleanup_on_novel_delete ON public.novels;
CREATE TRIGGER plot_threads_cleanup_on_novel_delete
  AFTER DELETE ON public.novels
  FOR EACH ROW EXECUTE FUNCTION public.delete_plot_threads_for_novel();
