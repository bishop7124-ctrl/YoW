-- Paste this whole statement into the Supabase SQL Editor.
-- Retention uses auth.audit_log_entries. If retention_data_available is false,
-- enable Authentication > Audit Logs > Write audit logs to the database.
-- "Returned" means an authenticated event on a later calendar day after the
-- user's first authored manuscript content: days 1-7 or days 1-30.

WITH
params AS (
  SELECT
    'Europe/London'::text AS reporting_timezone,
    (now() AT TIME ZONE 'Europe/London')::date AS report_date
),
users AS (
  SELECT
    u.id AS user_id,
    u.created_at AS signup_at,
    (u.created_at AT TIME ZONE p.reporting_timezone)::date AS signup_date,
    date_trunc('week', u.created_at AT TIME ZONE p.reporting_timezone)::date AS cohort_week,
    u.email_confirmed_at,
    u.last_sign_in_at
  FROM auth.users u
  CROSS JOIN params p
  WHERE u.deleted_at IS NULL
    AND coalesce(lower(u.email), '') NOT LIKE '%@yourownworld.co.uk'
    AND coalesce(lower(u.email), '') NOT IN (
      'bishop7124@gmail.com',
      'mbishoptesting@gmail.com',
      'thesimsbishes@gmail.com',
      'yourownworld.admin@gmail.com',
      'sian.bishop@hotmail.com'
    )
),
audit_events AS (
  SELECT
    CASE
      WHEN coalesce(a.payload->>'actor_id', a.payload->>'user_id')
           ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN coalesce(a.payload->>'actor_id', a.payload->>'user_id')::uuid
    END AS user_id,
    a.created_at,
    a.payload->>'action' AS action
  FROM auth.audit_log_entries a
  WHERE a.payload->>'action' IN ('login', 'token_refreshed', 'mfa_code_login')
),
audit_facts AS (
  SELECT
    u.user_id,
    min(a.created_at) FILTER (WHERE a.created_at >= u.signup_at) AS first_authenticated_at
  FROM users u
  LEFT JOIN audit_events a ON a.user_id = u.user_id
  GROUP BY u.user_id
),
included_projects AS (
  SELECT n.id, n.user_id, n.data, n.updated_at
  FROM public.novels n
  WHERE coalesce((n.data->>'isSampleProject')::boolean, false) = false
    AND lower(trim(coalesce(n.data->>'title', n.data->>'name', ''))) <> 'the last ember'
),
entity_rows AS (
  SELECT 'project'::text AS event_type, n.user_id, n.data->>'createdAt' AS raw_created_at, n.updated_at AS fallback_at
  FROM included_projects n
  UNION ALL
  SELECT 'character', c.user_id, c.data->>'createdAt', c.updated_at
  FROM public.characters c
  JOIN included_projects n ON n.id = c.novel_id AND n.user_id = c.user_id
  WHERE coalesce((c.data->>'syncDeleted')::boolean, false) = false
  UNION ALL
  SELECT 'world', l.user_id, l.data->>'createdAt', l.updated_at
  FROM public.locations l
  JOIN included_projects n ON n.id = l.novel_id AND n.user_id = l.user_id
  WHERE coalesce((l.data->>'syncDeleted')::boolean, false) = false
  UNION ALL
  SELECT 'world', le.user_id, le.data->>'createdAt', le.updated_at
  FROM public.lore_entries le
  JOIN included_projects n ON n.id = le.novel_id AND n.user_id = le.user_id
  WHERE coalesce((le.data->>'syncDeleted')::boolean, false) = false
  UNION ALL
  SELECT 'world', te.user_id, te.data->>'createdAt', te.updated_at
  FROM public.timeline_events te
  JOIN included_projects n ON n.id = te.novel_id AND n.user_id = te.user_id
  WHERE coalesce((te.data->>'syncDeleted')::boolean, false) = false
),
entity_events AS (
  SELECT
    event_type,
    user_id,
    CASE
      WHEN raw_created_at ~ '^\d{13}$' THEN to_timestamp(raw_created_at::numeric / 1000)
      WHEN raw_created_at ~ '^\d{10}$' THEN to_timestamp(raw_created_at::numeric)
      WHEN raw_created_at ~ '^\d{4}-\d{2}-\d{2}' THEN raw_created_at::timestamptz
      ELSE fallback_at
    END AS happened_at
  FROM entity_rows
),
entity_facts AS (
  SELECT
    user_id,
    min(happened_at) FILTER (WHERE event_type = 'project') AS first_project_at,
    min(happened_at) FILTER (WHERE event_type = 'character') AS first_character_at,
    min(happened_at) FILTER (WHERE event_type = 'world') AS first_worldbuilding_at
  FROM entity_events
  GROUP BY user_id
),
scene_candidates AS (
  SELECT
    s.user_id::uuid AS user_id,
    min(
      CASE
        WHEN wh.item->>'timestamp' ~ '^\d{13}$' THEN to_timestamp((wh.item->>'timestamp')::numeric / 1000)
        WHEN wh.item->>'timestamp' ~ '^\d{10}$' THEN to_timestamp((wh.item->>'timestamp')::numeric)
      END
    ) FILTER (WHERE coalesce((wh.item->>'words')::numeric, 0) > 0) AS first_word_history_at,
    CASE
      WHEN length(trim(regexp_replace(coalesce(s.data->>'content', ''), '<[^>]*>|&nbsp;', '', 'gi'))) > 0
      THEN CASE
        WHEN s.data->>'lastModified' ~ '^\d{13}$' THEN to_timestamp((s.data->>'lastModified')::numeric / 1000)
        WHEN s.data->>'lastModified' ~ '^\d{10}$' THEN to_timestamp((s.data->>'lastModified')::numeric)
      END
    END AS current_content_at
  FROM public.scenes s
  JOIN included_projects n
    ON n.id = s.novel_id
   AND n.user_id::text = s.user_id
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(s.data->'wordHistory') = 'array'
         THEN s.data->'wordHistory' ELSE '[]'::jsonb END
  ) AS wh(item) ON true
  WHERE s.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  GROUP BY s.scene_id, s.user_id, s.data
),
writing_facts AS (
  SELECT user_id, min(coalesce(first_word_history_at, current_content_at)) AS activated_at
  FROM scene_candidates
  WHERE first_word_history_at IS NOT NULL OR current_content_at IS NOT NULL
  GROUP BY user_id
),
user_funnel AS (
  SELECT
    u.*,
    coalesce(a.first_authenticated_at, u.last_sign_in_at) AS first_authenticated_at,
    e.first_project_at,
    w.activated_at,
    e.first_character_at,
    e.first_worldbuilding_at
  FROM users u
  LEFT JOIN audit_facts a USING (user_id)
  LEFT JOIN entity_facts e USING (user_id)
  LEFT JOIN writing_facts w USING (user_id)
),
retention_facts AS (
  SELECT
    f.user_id,
    bool_or(
      (a.created_at AT TIME ZONE p.reporting_timezone)::date
        BETWEEN (f.activated_at AT TIME ZONE p.reporting_timezone)::date + 1
            AND (f.activated_at AT TIME ZONE p.reporting_timezone)::date + 7
    ) AS returned_within_7_days,
    bool_or(
      (a.created_at AT TIME ZONE p.reporting_timezone)::date
        BETWEEN (f.activated_at AT TIME ZONE p.reporting_timezone)::date + 1
            AND (f.activated_at AT TIME ZONE p.reporting_timezone)::date + 30
    ) AS returned_within_30_days
  FROM user_funnel f
  CROSS JOIN params p
  LEFT JOIN audit_events a
    ON a.user_id = f.user_id
   AND a.created_at > f.activated_at
  GROUP BY f.user_id
),
summary AS (
  SELECT
    count(*) AS genuine_users,
    count(*) FILTER (WHERE f.first_project_at IS NOT NULL) AS tried_it,
    count(*) FILTER (WHERE f.activated_at IS NOT NULL) AS meaningfully_entered_content,
    count(*) FILTER (
      WHERE f.activated_at IS NOT NULL
        AND coalesce(r.returned_within_7_days, false)
    ) AS returned_within_7_days,
    count(*) FILTER (
      WHERE f.activated_at IS NOT NULL
        AND coalesce(r.returned_within_30_days, false)
    ) AS returned_within_30_days,
    count(*) FILTER (
      WHERE f.activated_at IS NOT NULL
        AND (f.activated_at AT TIME ZONE p.reporting_timezone)::date <= p.report_date - 7
    ) AS eligible_for_7_day_measurement,
    count(*) FILTER (
      WHERE f.activated_at IS NOT NULL
        AND (f.activated_at AT TIME ZONE p.reporting_timezone)::date <= p.report_date - 30
    ) AS eligible_for_30_day_measurement,
    (SELECT count(*) > 0 FROM audit_events) AS retention_data_available
  FROM user_funnel f
  CROSS JOIN params p
  LEFT JOIN retention_facts r USING (user_id)
  GROUP BY p.report_date, p.reporting_timezone
)
SELECT
  genuine_users,
  tried_it,
  meaningfully_entered_content,
  CASE WHEN retention_data_available THEN returned_within_7_days END AS returned_within_7_days,
  CASE WHEN retention_data_available THEN returned_within_30_days END AS returned_within_30_days,
  eligible_for_7_day_measurement,
  eligible_for_30_day_measurement,
  retention_data_available
FROM summary;
