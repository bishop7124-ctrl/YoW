-- Follow-up to 20261109120000_scene_versions.sql (roadmap A2). Additive: one new function and a
-- replacement of purge_expired_scene_versions(). NOT applied automatically.
--
--   * mark_scenes_versions_deleted(text[]): one round trip when an act or chapter with many
--     scenes is deleted (the client used to send one request per scene).
--   * purge_expired_scene_versions() now also marks "orphaned" versions as recently deleted:
--     versions whose scene no longer exists in public.scenes AND whose newest version is more
--     than 14 days old. This covers scenes deleted on another device, or while the feature flag
--     was off, so their history does not live forever. Marking is recoverable: the versions
--     show under "Recently deleted scenes" for 30 days before they are purged.
--   * Scenes still present in public.scenes, or edited in the last 14 days (so a snapshot pushed
--     just before its scene reached the cloud is never swept), are never touched.
--
-- Rollback: drop function public.mark_scenes_versions_deleted(text[]); then re-run the
-- purge_expired_scene_versions() definition from the first migration.

CREATE OR REPLACE FUNCTION public.mark_scenes_versions_deleted(p_scene_ids text[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid()); n integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  IF p_scene_ids IS NULL OR coalesce(array_length(p_scene_ids, 1), 0) > 1000 THEN
    RAISE EXCEPTION 'too many scenes' USING ERRCODE = '54000';
  END IF;
  UPDATE public.scene_versions SET deleted_at = now()
  WHERE user_id = uid AND scene_id = ANY (p_scene_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_scene_versions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid()); n integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;

  -- Orphans: scene gone from the cloud and quiet for 14+ days -> recently deleted.
  UPDATE public.scene_versions v SET deleted_at = now()
  WHERE v.user_id = uid AND v.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.scenes s WHERE s.user_id = uid::text AND s.scene_id = v.scene_id)
    AND NOT EXISTS (SELECT 1 FROM public.scene_versions r
                    WHERE r.user_id = uid AND r.scene_id = v.scene_id
                      AND r.created_at > now() - interval '14 days');

  DELETE FROM public.scene_versions
  WHERE user_id = uid AND deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_scenes_versions_deleted(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_scenes_versions_deleted(text[]) TO authenticated;
