-- ============================================================
-- Migration: atomic desktop device activation (device cap)
-- Date:      2026-10-04
-- Why:       api/desktop-devices.js counted active devices and then upserted, in two
--            separate statements. Two new devices activating at the same moment could
--            both read "2 of 3 used" and both succeed, ending at 4 of 3. The cap is
--            now checked and written inside one transaction, serialised per user.
-- Only the service role (the Vercel API) may call it; the API falls back to the old
-- two-step path until this migration is applied.
-- ============================================================
CREATE OR REPLACE FUNCTION public.activate_desktop_device(
  p_user     uuid,
  p_device   text,
  p_name     text,
  p_platform text,
  p_cap      int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count int;
  already      boolean;
  devices      jsonb;
BEGIN
  IF p_user IS NULL OR p_device IS NULL OR p_cap IS NULL OR p_cap < 1 THEN
    RAISE EXCEPTION 'activate_desktop_device: invalid arguments';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('desktop_devices:' || p_user::text, 0));

  SELECT EXISTS (SELECT 1 FROM public.desktop_devices
                 WHERE user_id = p_user AND device_id = p_device AND deactivated_at IS NULL)
    INTO already;
  SELECT count(*) INTO active_count
    FROM public.desktop_devices WHERE user_id = p_user AND deactivated_at IS NULL;

  IF NOT already AND active_count >= p_cap THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'device_id', device_id, 'device_name', device_name,
             'platform', platform, 'last_seen_at', last_seen_at)), '[]'::jsonb)
      INTO devices
      FROM public.desktop_devices WHERE user_id = p_user AND deactivated_at IS NULL;
    RETURN jsonb_build_object('ok', false, 'reason', 'cap', 'devices', devices, 'cap', p_cap);
  END IF;

  INSERT INTO public.desktop_devices (user_id, device_id, device_name, platform, last_seen_at, deactivated_at)
  VALUES (p_user, p_device, left(coalesce(p_name, ''), 120), left(coalesce(p_platform, ''), 40), now(), NULL)
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET device_name = EXCLUDED.device_name,
        platform = EXCLUDED.platform,
        last_seen_at = now(),
        deactivated_at = NULL;

  RETURN jsonb_build_object('ok', true, 'cap', p_cap);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.activate_desktop_device(uuid, text, text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_desktop_device(uuid, text, text, text, int) TO service_role;
