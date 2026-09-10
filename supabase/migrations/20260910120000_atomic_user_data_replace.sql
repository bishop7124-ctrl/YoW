-- Replace the normalized cloud copy in one Postgres transaction.
--
-- The previous client implementation issued 21 independent DELETE requests
-- followed by independent upserts. A network, auth, or statement failure at
-- any boundary could leave an account partly empty or retain a mixture of the
-- selected backup and stale rows. A Postgres function call is one transaction:
-- any failing delete/insert rolls the complete replacement back.

CREATE OR REPLACE FUNCTION public.replace_user_data_atomic(p_data JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id UUID := (SELECT auth.uid());
  table_name TEXT;
  data_key TEXT;
  has_novel_id BOOLEAN;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Replacement payload must be a JSON object';
  END IF;

  -- Scenes retain their legacy TEXT user_id and scene_id columns.
  DELETE FROM public.scenes WHERE user_id = caller_id::TEXT;

  FOR table_name, data_key, has_novel_id IN
    SELECT * FROM (VALUES
      ('novels',          'novels',         FALSE),
      ('series_items',    'series',         FALSE),
      ('characters',      'characters',     TRUE),
      ('factions',        'factions',       TRUE),
      ('locations',       'locations',      TRUE),
      ('timeline_events', 'timeline',       TRUE),
      ('world_history',   'worldHistory',   TRUE),
      ('acts',            'acts',           TRUE),
      ('chapters',        'chapters',       TRUE),
      ('lore_entries',    'loreEntries',    TRUE),
      ('idea_entries',    'ideaEntries',    TRUE),
      ('maps_data',       'maps',            TRUE),
      ('whiteboards_data','whiteboards',    TRUE),
      ('story_schedule',  'storySchedule',  TRUE),
      ('rpg_characters',  'rpgCharacters',  TRUE),
      ('comic_pages',     'comicPages',     TRUE),
      ('comic_panels',    'comicPanels',    TRUE),
      ('eras',            'eras',           TRUE)
    ) AS mapping(table_name, data_key, has_novel_id)
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', table_name)
      USING caller_id;

    IF has_novel_id THEN
      EXECUTE format(
        'INSERT INTO public.%I (id, user_id, novel_id, data, updated_at)
         SELECT item->>''id'', $1, item->>''novelId'', item, NOW()
         FROM jsonb_array_elements(COALESCE($2->%L, ''[]''::JSONB)) AS item',
        table_name,
        data_key
      ) USING caller_id, p_data;
    ELSE
      EXECUTE format(
        'INSERT INTO public.%I (id, user_id, data, updated_at)
         SELECT item->>''id'', $1, item, NOW()
         FROM jsonb_array_elements(COALESCE($2->%L, ''[]''::JSONB)) AS item',
        table_name,
        data_key
      ) USING caller_id, p_data;
    END IF;
  END LOOP;

  INSERT INTO public.scenes (scene_id, user_id, novel_id, data)
  SELECT item->>'id', caller_id::TEXT, item->>'novelId', item
  FROM jsonb_array_elements(COALESCE(p_data->'scenes', '[]'::JSONB)) AS item;

  DELETE FROM public.user_settings WHERE user_id = caller_id;
  INSERT INTO public.user_settings (user_id, data, updated_at)
  VALUES (
    caller_id,
    jsonb_build_object(
      'activeNovelId', p_data->'activeNovelId',
      'currentYear', COALESCE(p_data->'currentYear', '0'::JSONB),
      'activeMapByNovel', COALESCE(p_data->'activeMapByNovel', '{}'::JSONB)
    ),
    NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_user_data_atomic(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_user_data_atomic(JSONB) TO authenticated;
