-- Keep destructive multi-table operations inside Postgres transactions.

CREATE OR REPLACE FUNCTION public.delete_project_data_atomic(p_novel_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id UUID := (SELECT auth.uid());
  table_name TEXT;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_novel_id IS NULL OR btrim(p_novel_id) = '' THEN
    RAISE EXCEPTION 'Project id is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.novels
    WHERE user_id = caller_id AND id = p_novel_id
  ) THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  DELETE FROM public.scenes
  WHERE user_id = caller_id::TEXT AND novel_id = p_novel_id;

  FOREACH table_name IN ARRAY ARRAY[
    'characters', 'factions', 'locations', 'timeline_events', 'world_history',
    'acts', 'chapters', 'lore_entries', 'idea_entries', 'maps_data',
    'whiteboards_data', 'story_schedule', 'rpg_characters', 'comic_pages',
    'comic_panels', 'eras'
  ]
  LOOP
    EXECUTE format(
      'DELETE FROM public.%I WHERE user_id = $1 AND novel_id = $2',
      table_name
    ) USING caller_id, p_novel_id;
  END LOOP;

  UPDATE public.series_items
  SET data = jsonb_set(
    data,
    '{projectOrder}',
    COALESCE((
      SELECT jsonb_agg(project_id ORDER BY position)
      FROM jsonb_array_elements(COALESCE(data->'projectOrder', '[]'::JSONB))
        WITH ORDINALITY AS ordered(project_id, position)
      WHERE project_id #>> '{}' <> p_novel_id
    ), '[]'::JSONB),
    TRUE
  ), updated_at = NOW()
  WHERE user_id = caller_id
    AND COALESCE(data->'projectOrder', '[]'::JSONB) @> jsonb_build_array(p_novel_id);

  UPDATE public.user_settings
  SET data = jsonb_set(
    CASE WHEN data->>'activeNovelId' = p_novel_id
      THEN jsonb_set(data, '{activeNovelId}', 'null'::JSONB, TRUE)
      ELSE data
    END,
    '{activeMapByNovel}',
    COALESCE(data->'activeMapByNovel', '{}'::JSONB) - p_novel_id,
    TRUE
  ), updated_at = NOW()
  WHERE user_id = caller_id;

  DELETE FROM public.novels
  WHERE user_id = caller_id AND id = p_novel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_project_data_atomic(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_project_data_atomic(TEXT) TO authenticated;

-- auth.users is deleted last. Foreign-key cascades remove current normalized
-- tables, while the explicit dynamic pass also covers legacy tables and the
-- TEXT-typed scenes table. The function call itself is one transaction, so a
-- failure leaves both the account and its content in place.
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id UUID := (SELECT auth.uid());
  table_name TEXT;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'novels', 'series_items', 'characters', 'factions', 'locations',
    'timeline_events', 'world_history', 'acts', 'chapters', 'scenes',
    'lore_entries', 'idea_entries', 'maps_data', 'whiteboards_data',
    'story_schedule', 'rpg_characters', 'comic_pages', 'comic_panels', 'eras',
    'user_settings', 'user_profiles', 'synced_ai_settings', 'ai_findings',
    'character_interviews', 'feedback', 'project_data', 'user_data',
    'desktop_devices', 'reengagement_emails', 'ai_proxy_requests'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format(
        'DELETE FROM public.%I WHERE user_id::TEXT = $1',
        table_name
      ) USING caller_id::TEXT;
    END IF;
  END LOOP;

  DELETE FROM auth.users WHERE id = caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;
