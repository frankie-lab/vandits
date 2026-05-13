
-- PR-SOCIAL-1: get_followed_user_stats RPC
-- Sharing-aware stats for the social panel.
-- Replaces client-side commonPointsCount full-table scans.
--
-- IMPORTANT: shared_pois MUST mirror exactly the frontend helper
-- `isShareablePoi` in src/domains/content/lib/is-shareable-poi.ts.
-- If that rule changes (geo_health, visibility, enriched_data.descripcion,
-- deleted_at) update both sides at once.

CREATE OR REPLACE FUNCTION public.get_followed_user_stats()
RETURNS TABLE (
  user_id              uuid,
  shared_pois          integer,
  total_pois           integer,    -- NULL if privacy hides it
  last_contribution_at timestamptz,
  contributions_7d     integer,
  followers_count      integer,
  following_count      integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  is_priv_admin boolean := false;
BEGIN
  IF caller IS NULL THEN
    RETURN;
  END IF;

  is_priv_admin := _is_admin_or_master(caller);

  RETURN QUERY
  WITH
  -- Universe: profiles with follow relation in either direction + self.
  related AS (
    SELECT p.id AS uid
    FROM profiles p
    WHERE p.id = caller
       OR EXISTS (SELECT 1 FROM follows f
                  WHERE f.status = 'accepted'::follow_status
                    AND ((f.follower_id = caller AND f.following_id = p.id)
                      OR (f.follower_id = p.id AND f.following_id = caller)))
  ),
  -- Mutual follow per uid
  mutual AS (
    SELECT r.uid,
      r.uid = caller
      OR is_priv_admin
      OR (
        EXISTS (SELECT 1 FROM follows f1
                WHERE f1.follower_id = caller AND f1.following_id = r.uid
                  AND f1.status = 'accepted'::follow_status)
        AND
        EXISTS (SELECT 1 FROM follows f2
                WHERE f2.follower_id = r.uid AND f2.following_id = caller
                  AND f2.status = 'accepted'::follow_status)
      ) AS can_see_total
    FROM related r
  ),
  shared AS (
    SELECT l.owner_user_id AS uid, COUNT(*)::int AS n
    FROM locations l
    WHERE l.deleted_at IS NULL
      AND l.owner_user_id IN (SELECT uid FROM related)
      AND l.visibility IN ('public','followers')
      AND COALESCE(l.enriched_data->>'descripcion', '') <> ''
      AND l.geo_health = 'ok'
    GROUP BY l.owner_user_id
  ),
  totals AS (
    SELECT l.owner_user_id AS uid,
           COUNT(*)::int AS n,
           MAX(l.created_at) AS last_at,
           COUNT(*) FILTER (WHERE l.created_at >= now() - interval '7 days')::int AS recent_n
    FROM locations l
    WHERE l.deleted_at IS NULL
      AND l.owner_user_id IN (SELECT uid FROM related)
    GROUP BY l.owner_user_id
  ),
  followers_c AS (
    SELECT f.following_id AS uid, COUNT(*)::int AS n
    FROM follows f
    WHERE f.status = 'accepted'::follow_status
      AND f.following_id IN (SELECT uid FROM related)
    GROUP BY f.following_id
  ),
  following_c AS (
    SELECT f.follower_id AS uid, COUNT(*)::int AS n
    FROM follows f
    WHERE f.status = 'accepted'::follow_status
      AND f.follower_id IN (SELECT uid FROM related)
    GROUP BY f.follower_id
  )
  SELECT
    m.uid,
    COALESCE(s.n, 0),
    CASE WHEN m.can_see_total THEN COALESCE(t.n, 0) ELSE NULL END,
    CASE WHEN m.can_see_total THEN t.last_at ELSE NULL END,
    CASE WHEN m.can_see_total THEN COALESCE(t.recent_n, 0) ELSE NULL END,
    COALESCE(fc.n, 0),
    COALESCE(gc.n, 0)
  FROM mutual m
  LEFT JOIN shared s     ON s.uid = m.uid
  LEFT JOIN totals t     ON t.uid = m.uid
  LEFT JOIN followers_c fc ON fc.uid = m.uid
  LEFT JOIN following_c gc ON gc.uid = m.uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_followed_user_stats() TO authenticated;
