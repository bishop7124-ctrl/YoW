-- Security Advisor "multiple permissive policies" clean-up (3 Oct 2026).
-- public.scenes carried two identical owner-only policies: the legacy
-- "Users can access own scenes" (pre-migration table) and "Users manage own
-- scenes" (the normalized_storage-era name, recreated by 20260629). Both used
-- (select auth.uid())::text = user_id::text, so dropping the legacy one changes
-- no access: scenes stay owner-only for every command. Idempotent.
DROP POLICY IF EXISTS "Users can access own scenes" ON public.scenes;

-- Safety net: if the surviving policy is somehow absent, recreate it so the
-- table can never be left with RLS enabled and no owner policy (or, worse,
-- be mistaken for open).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scenes' AND policyname = 'Users manage own scenes'
  ) THEN
    CREATE POLICY "Users manage own scenes" ON public.scenes
      USING ((select auth.uid())::text = user_id::text)
      WITH CHECK ((select auth.uid())::text = user_id::text);
  END IF;
END $$;
