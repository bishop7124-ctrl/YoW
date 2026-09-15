-- Prevent a stale browser tab/device from silently replacing newer scene data.
-- Presence warnings are deliberately advisory; this revision check is the
-- authoritative, transactional protection at the cloud write boundary.
ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.save_scene_if_current(
  p_scene_id TEXT,
  p_novel_id TEXT,
  p_data JSONB,
  p_expected_revision BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  caller_id TEXT := auth.uid()::TEXT;
  current_row public.scenes%ROWTYPE;
  next_revision BIGINT;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO current_row
  FROM public.scenes
  WHERE scene_id = p_scene_id AND user_id = caller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- A brand-new local scene has no cloud revision yet. Refuse a non-zero
    -- expectation so an inaccessible/colliding row can never be overwritten.
    IF COALESCE(p_expected_revision, 0) <> 0 THEN
      RETURN jsonb_build_object('saved', false, 'reason', 'missing', 'revision', NULL, 'data', NULL);
    END IF;
    INSERT INTO public.scenes (scene_id, user_id, novel_id, data, revision)
    VALUES (p_scene_id, caller_id, p_novel_id, p_data, 1);
    RETURN jsonb_build_object('saved', true, 'revision', 1, 'data', p_data);
  END IF;

  IF current_row.revision <> COALESCE(p_expected_revision, 0) THEN
    RETURN jsonb_build_object(
      'saved', false,
      'reason', 'stale',
      'revision', current_row.revision,
      'data', current_row.data
    );
  END IF;

  next_revision := current_row.revision + 1;
  UPDATE public.scenes
  SET novel_id = p_novel_id, data = p_data, revision = next_revision
  WHERE scene_id = p_scene_id AND user_id = caller_id;

  RETURN jsonb_build_object('saved', true, 'revision', next_revision, 'data', p_data);
END;
$$;

REVOKE ALL ON FUNCTION public.save_scene_if_current(TEXT, TEXT, JSONB, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_scene_if_current(TEXT, TEXT, JSONB, BIGINT) TO authenticated;
