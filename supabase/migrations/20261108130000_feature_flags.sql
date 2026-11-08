-- Feature flags for staged rollout of new features (roadmap A0).
--
-- Additive: one new table, no existing table touched. Not applied automatically;
-- the owner applies it from the Supabase SQL editor (or `supabase db push`).
--
--   * Signed-in users read flags only through public.get_feature_flags(), which
--     never returns the allow list. The table itself has RLS on, no policies and
--     no grants, so it is writable/readable only via the service role / SQL editor.
--   * A missing row, a failed read, or enabled = false all mean "feature off".
--     The client fails closed.
--
-- Turn a feature on for yourself first:
--   insert into public.feature_flags (key, enabled, allow_user_ids)
--   values ('story_check', true, array['<your-user-uuid>']::uuid[]);
-- Then widen: set rollout_percent = 10, then 100. Roll back with enabled = false.

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key             text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  enabled         boolean NOT NULL DEFAULT false,
  rollout_percent integer NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  allow_user_ids  uuid[] NOT NULL DEFAULT '{}',
  description     text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- No direct table access for app users at all (no grants, no policies): the
-- allow list holds user ids and must not be readable by other users. The app
-- reads flags through the function below, which reports only whether the
-- CURRENT user is on the allow list.
REVOKE ALL ON public.feature_flags FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_feature_flags()
RETURNS TABLE (key text, enabled boolean, rollout_percent integer, allowed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.key,
         f.enabled,
         f.rollout_percent,
         (SELECT auth.uid()) = ANY (f.allow_user_ids) AS allowed
  FROM public.feature_flags f
  WHERE (SELECT auth.uid()) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_feature_flags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feature_flags() TO authenticated;
