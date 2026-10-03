-- Conflict-safe record saves (3 Oct 2026).
--
-- Found by the owner's live two-tab test: every structured record (characters, locations, lore,
-- timeline, ...) was written to the cloud as a plain whole-record upsert, so when two tabs or
-- browsers edited the same record the last save silently overwrote the other's fields. Scenes
-- already had a revision guard (save_scene_if_current); this gives every other record table the
-- same protection, but as a per-field three-way merge instead of a refusal, so edits to
-- DIFFERENT fields from two browsers both survive.
--
--   base   = the version this browser last loaded or saved
--   mine   = the version it is saving now
--   theirs = what the database holds right now (locked FOR UPDATE for the duration)
--
-- A field only this browser changed keeps this browser's value; a field only the other side
-- changed keeps the other side's value; a field BOTH changed to different values keeps this
-- browser's value and is returned in `conflicts` together with the other side's whole record so
-- the app can show it for review instead of losing it. Runs as the caller (SECURITY INVOKER), so
-- the owner-only RLS policies still decide which rows can be touched.

CREATE OR REPLACE FUNCTION public.merge_record_json(p_base jsonb, p_mine jsonb, p_theirs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  -- Bookkeeping fields that differ on every save; this browser's value always wins.
  ignored text[] := ARRAY['lastModified', 'updatedAt', 'wordHistory'];
  k text;
  b jsonb;
  m jsonb;
  t jsonb;
  r jsonb;
  merged jsonb := '{}'::jsonb;
  conflicts jsonb := '[]'::jsonb;
BEGIN
  -- Without a usable base or a stored copy there is nothing to merge against: plain overwrite.
  IF p_base IS NULL OR p_theirs IS NULL
     OR jsonb_typeof(p_base) <> 'object' OR jsonb_typeof(p_mine) <> 'object' OR jsonb_typeof(p_theirs) <> 'object' THEN
    RETURN jsonb_build_object('merged', p_mine, 'conflicts', '[]'::jsonb);
  END IF;

  FOR k IN
    SELECT DISTINCT key FROM (
      SELECT jsonb_object_keys(p_base) AS key
      UNION ALL SELECT jsonb_object_keys(p_mine)
      UNION ALL SELECT jsonb_object_keys(p_theirs)
    ) keys
  LOOP
    b := p_base -> k;
    m := p_mine -> k;
    t := p_theirs -> k;
    IF k = ANY (ignored) THEN
      r := m;
    ELSIF (m IS DISTINCT FROM b) AND (t IS DISTINCT FROM b) THEN
      r := m;
      IF m IS DISTINCT FROM t THEN
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('field', k, 'mine', m, 'theirs', t));
      END IF;
    ELSIF m IS DISTINCT FROM b THEN
      r := m;
    ELSE
      r := t;
    END IF;
    IF r IS NOT NULL THEN
      merged := merged || jsonb_build_object(k, r);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('merged', merged, 'conflicts', conflicts);
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_records(p_table text, p_records jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  allowed text[] := ARRAY[
    'novels', 'series_items', 'characters', 'factions', 'locations', 'timeline_events',
    'world_history', 'acts', 'chapters', 'lore_entries', 'idea_entries', 'maps_data',
    'whiteboards_data', 'story_schedule', 'rpg_characters', 'comic_pages', 'comic_panels', 'eras'
  ];
  user_level text[] := ARRAY['novels', 'series_items'];
  caller uuid := auth.uid();
  rec jsonb;
  theirs jsonb;
  res jsonb;
  merged jsonb;
  conflicts jsonb;
  results jsonb := '[]'::jsonb;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_table IS NULL OR NOT (p_table = ANY (allowed)) THEN
    RAISE EXCEPTION 'Unsupported table %', p_table;
  END IF;
  IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' THEN
    RAISE EXCEPTION 'p_records must be a JSON array';
  END IF;
  IF jsonb_array_length(p_records) > 200 THEN
    RAISE EXCEPTION 'At most 200 records per call';
  END IF;

  FOR rec IN SELECT value FROM jsonb_array_elements(p_records) LOOP
    IF rec ->> 'id' IS NULL OR jsonb_typeof(rec -> 'mine') <> 'object' THEN
      RAISE EXCEPTION 'Each record needs an id and a mine object';
    END IF;

    EXECUTE format('SELECT data FROM public.%I WHERE id = $1 AND user_id = $2 FOR UPDATE', p_table)
      INTO theirs USING rec ->> 'id', caller;

    IF theirs IS NULL THEN
      -- Not in the cloud yet (or the owner's own earlier write never reached it): store it. Never
      -- treat "missing" as "deleted elsewhere" here: losing a user's edit is the worse error.
      IF p_table = ANY (user_level) THEN
        EXECUTE format('INSERT INTO public.%I (id, user_id, data, updated_at) VALUES ($1, $2, $3, now())', p_table)
          USING rec ->> 'id', caller, rec -> 'mine';
      ELSE
        EXECUTE format('INSERT INTO public.%I (id, user_id, novel_id, data, updated_at) VALUES ($1, $2, $3, $4, now())', p_table)
          USING rec ->> 'id', caller, rec ->> 'novel_id', rec -> 'mine';
      END IF;
      merged := rec -> 'mine';
      conflicts := '[]'::jsonb;
      theirs := NULL;
    ELSE
      res := public.merge_record_json(rec -> 'base', rec -> 'mine', theirs);
      merged := res -> 'merged';
      conflicts := res -> 'conflicts';
      IF merged IS DISTINCT FROM theirs THEN
        IF p_table = ANY (user_level) THEN
          EXECUTE format('UPDATE public.%I SET data = $3, updated_at = now() WHERE id = $1 AND user_id = $2', p_table)
            USING rec ->> 'id', caller, merged;
        ELSE
          EXECUTE format('UPDATE public.%I SET data = $3, novel_id = COALESCE($4, novel_id), updated_at = now() WHERE id = $1 AND user_id = $2', p_table)
            USING rec ->> 'id', caller, merged, rec ->> 'novel_id';
        END IF;
      END IF;
    END IF;

    results := results || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', rec ->> 'id',
      'merged', merged,
      'conflicts', conflicts,
      -- the other side's whole record, only needed when something genuinely conflicted
      'theirs', CASE WHEN jsonb_array_length(conflicts) > 0 THEN theirs ELSE NULL END
    )));
  END LOOP;

  RETURN results;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_record_json(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_record_json(jsonb, jsonb, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.merge_records(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_records(text, jsonb) TO authenticated;
