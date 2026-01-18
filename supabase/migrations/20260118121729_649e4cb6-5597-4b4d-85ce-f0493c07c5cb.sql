-- Public stats aggregation for UsersSidebar without exposing private follow rows or requiring document visibility

CREATE OR REPLACE FUNCTION public.get_public_profile_stats()
RETURNS TABLE (
  user_id uuid,
  public_locations_count integer,
  followers_count integer,
  following_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH public_locs AS (
    SELECT d.user_id, COUNT(l.id)::int AS cnt
    FROM public.locations l
    JOIN public.documents d ON d.id = l.document_id
    WHERE l.visibility = 'public'
    GROUP BY d.user_id
  ),
  followers AS (
    SELECT following_id AS user_id, COUNT(*)::int AS cnt
    FROM public.follows
    WHERE status = 'accepted'
    GROUP BY following_id
  ),
  following AS (
    SELECT follower_id AS user_id, COUNT(*)::int AS cnt
    FROM public.follows
    WHERE status = 'accepted'
    GROUP BY follower_id
  )
  SELECT
    p.id AS user_id,
    COALESCE(pl.cnt, 0) AS public_locations_count,
    COALESCE(fr.cnt, 0) AS followers_count,
    COALESCE(fg.cnt, 0) AS following_count
  FROM public.profiles p
  LEFT JOIN public_locs pl ON pl.user_id = p.id
  LEFT JOIN followers fr ON fr.user_id = p.id
  LEFT JOIN following fg ON fg.user_id = p.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile_stats() TO authenticated;