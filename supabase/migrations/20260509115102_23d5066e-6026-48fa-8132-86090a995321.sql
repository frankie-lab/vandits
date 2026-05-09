CREATE OR REPLACE FUNCTION public.admin_users_geo_universe(_health_filter text[] DEFAULT NULL)
RETURNS TABLE(
  user_id uuid,
  username text,
  display_name text,
  universe_count integer,
  total_locations integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_admin_or_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH universe AS (
    SELECT l.owner_user_id AS uid, COUNT(*)::int AS cnt
    FROM public.locations l
    WHERE l.deleted_at IS NULL
      AND l.owner_user_id IS NOT NULL
      AND (_health_filter IS NULL OR l.geo_health = ANY(_health_filter))
    GROUP BY l.owner_user_id
  ),
  totals AS (
    SELECT l.owner_user_id AS uid, COUNT(*)::int AS total
    FROM public.locations l
    WHERE l.deleted_at IS NULL
      AND l.owner_user_id IS NOT NULL
    GROUP BY l.owner_user_id
  )
  SELECT
    u.uid,
    p.username,
    p.display_name,
    u.cnt,
    COALESCE(t.total, 0)
  FROM universe u
  LEFT JOIN public.profiles p ON p.id = u.uid
  LEFT JOIN totals t ON t.uid = u.uid
  WHERE u.cnt > 0
  ORDER BY u.cnt DESC, p.username NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_users_geo_universe(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_users_geo_universe(text[]) TO authenticated;