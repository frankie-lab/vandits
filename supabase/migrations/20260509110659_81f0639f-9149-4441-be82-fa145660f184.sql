
-- =============================================================
-- Geo health unified model
-- Single source of truth for "does this location need reprocessing?"
-- =============================================================

-- 1. Helper SQL function: classify health of a location given its row + joined
--    admin_areas (country, region, zone). Returns one of:
--    'empty' | 'broken' | 'partial' | 'stale_name' | 'ok'
CREATE OR REPLACE FUNCTION public._compute_location_geo_health(
  _lat double precision,
  _lng double precision,
  _continent_id uuid,
  _country_id uuid,
  _region_id uuid,
  _zone_id uuid,
  _country_str text,
  _region_str text,
  _zone_str text,
  _country_code text,
  _c_name text,
  _c_parent uuid,
  _c_iso text,
  _r_name text,
  _r_parent uuid,
  _z_name text,
  _z_parent uuid
)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    -- empty: no coordinates OR no admin FK at all
    WHEN _lat IS NULL OR _lng IS NULL THEN 'empty'
    WHEN _continent_id IS NULL AND _country_id IS NULL
         AND _region_id IS NULL AND _zone_id IS NULL THEN 'empty'

    -- broken: structural FK mismatches (parent chain or iso)
    WHEN (_region_id IS NOT NULL AND _country_id IS NOT NULL
          AND _r_parent IS DISTINCT FROM _country_id) THEN 'broken'
    WHEN (_zone_id IS NOT NULL AND _region_id IS NOT NULL
          AND _z_parent IS DISTINCT FROM _region_id) THEN 'broken'
    WHEN (_country_id IS NOT NULL AND _continent_id IS NOT NULL
          AND _c_parent IS DISTINCT FROM _continent_id) THEN 'broken'
    WHEN (_country_id IS NOT NULL AND _country_code IS NOT NULL
          AND _c_iso IS NOT NULL
          AND upper(_country_code) <> upper(_c_iso)) THEN 'broken'

    -- partial: string filled in but FK missing (the silent bucket)
    WHEN (_country_str IS NOT NULL AND _country_str <> ''
          AND _country_id IS NULL) THEN 'partial'
    WHEN (_region_str IS NOT NULL AND _region_str <> ''
          AND _region_id IS NULL) THEN 'partial'
    WHEN (_zone_str IS NOT NULL AND _zone_str <> ''
          AND _zone_id IS NULL) THEN 'partial'

    -- stale_name: FK present but cached string differs from canonical name
    WHEN (_country_id IS NOT NULL AND _country_str IS NOT NULL AND _c_name IS NOT NULL
          AND lower(_country_str) <> lower(_c_name)) THEN 'stale_name'
    WHEN (_region_id IS NOT NULL AND _region_str IS NOT NULL AND _r_name IS NOT NULL
          AND lower(_region_str) <> lower(_r_name)) THEN 'stale_name'
    WHEN (_zone_id IS NOT NULL AND _zone_str IS NOT NULL AND _z_name IS NOT NULL
          AND lower(_zone_str) <> lower(_z_name)) THEN 'stale_name'

    ELSE 'ok'
  END;
$$;

-- 2. View that materializes the health column per location.
DROP VIEW IF EXISTS public.v_location_geo_health;
CREATE VIEW public.v_location_geo_health
WITH (security_invoker = on) AS
SELECT
  l.id,
  l.owner_user_id,
  l.document_id,
  l.name,
  l.latitude,
  l.longitude,
  l.continent,
  l.country,
  l.region,
  l.zone,
  l.continent_id,
  l.country_id,
  l.region_id,
  l.zone_id,
  l.country_code,
  l.place_type,
  public._compute_location_geo_health(
    l.latitude, l.longitude,
    l.continent_id, l.country_id, l.region_id, l.zone_id,
    l.country, l.region, l.zone, l.country_code,
    c.name, c.parent_id, c.iso_code,
    r.name, r.parent_id,
    z.name, z.parent_id
  ) AS health
FROM public.locations l
LEFT JOIN public.admin_areas c ON c.id = l.country_id
LEFT JOIN public.admin_areas r ON r.id = l.region_id
LEFT JOIN public.admin_areas z ON z.id = l.zone_id
WHERE l.deleted_at IS NULL;

GRANT SELECT ON public.v_location_geo_health TO authenticated;

-- 3. Replace admin_users_with_broken_geo_chain to use the unified health model.
--    Keep the same RETURNS shape (broken_count) for backwards compat: the
--    column now means "unhealthy_count" (everything that isn't 'ok').
CREATE OR REPLACE FUNCTION public.admin_users_with_broken_geo_chain()
RETURNS TABLE(
  user_id uuid,
  username text,
  display_name text,
  broken_count integer,
  total_locations integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_admin_or_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH unhealthy AS (
    SELECT v.owner_user_id AS uid, COUNT(*)::int AS cnt
    FROM public.v_location_geo_health v
    WHERE v.owner_user_id IS NOT NULL
      AND v.health <> 'ok'
    GROUP BY v.owner_user_id
  ),
  totals AS (
    SELECT v.owner_user_id AS uid, COUNT(*)::int AS total
    FROM public.v_location_geo_health v
    WHERE v.owner_user_id IS NOT NULL
    GROUP BY v.owner_user_id
  )
  SELECT
    u.uid,
    p.username,
    p.display_name,
    u.cnt,
    COALESCE(t.total, 0)
  FROM unhealthy u
  LEFT JOIN public.profiles p ON p.id = u.uid
  LEFT JOIN totals t ON t.uid = u.uid
  ORDER BY u.cnt DESC, p.username NULLS LAST;
END;
$$;

-- 4. Per-user summary RPC: every counter the panel needs in one row.
CREATE OR REPLACE FUNCTION public.admin_user_geo_summary(_user_id uuid)
RETURNS TABLE(
  total       integer,
  empty       integer,
  broken      integer,
  partial     integer,
  stale_name  integer,
  ok          integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_admin_or_master(auth.uid()) AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE v.health = 'empty')::int,
    COUNT(*) FILTER (WHERE v.health = 'broken')::int,
    COUNT(*) FILTER (WHERE v.health = 'partial')::int,
    COUNT(*) FILTER (WHERE v.health = 'stale_name')::int,
    COUNT(*) FILTER (WHERE v.health = 'ok')::int
  FROM public.v_location_geo_health v
  WHERE v.owner_user_id = _user_id;
END;
$$;

-- 5. Aggregated tree RPC: one row per (continent, country, region, zone) with
--    counts per health. Tiny payload even for 50k+ locations.
CREATE OR REPLACE FUNCTION public.admin_user_geo_tree(
  _user_id uuid,
  _health_filter text[] DEFAULT NULL
)
RETURNS TABLE(
  continent  text,
  country    text,
  region     text,
  zone       text,
  total       integer,
  empty       integer,
  broken      integer,
  partial     integer,
  stale_name  integer,
  ok          integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_admin_or_master(auth.uid()) AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v.continent,
    v.country,
    v.region,
    v.zone,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE v.health = 'empty')::int,
    COUNT(*) FILTER (WHERE v.health = 'broken')::int,
    COUNT(*) FILTER (WHERE v.health = 'partial')::int,
    COUNT(*) FILTER (WHERE v.health = 'stale_name')::int,
    COUNT(*) FILTER (WHERE v.health = 'ok')::int
  FROM public.v_location_geo_health v
  WHERE v.owner_user_id = _user_id
    AND (_health_filter IS NULL OR v.health = ANY(_health_filter))
  GROUP BY v.continent, v.country, v.region, v.zone
  ORDER BY v.continent NULLS LAST, v.country NULLS LAST,
           v.region NULLS LAST, v.zone NULLS LAST;
END;
$$;

-- 6. Paginated leaf RPC: list individual points filtered by node + health.
--    Used when the user expands a leaf node in the UI tree.
CREATE OR REPLACE FUNCTION public.admin_user_geo_locations(
  _user_id uuid,
  _continent text DEFAULT NULL,
  _country text DEFAULT NULL,
  _region text DEFAULT NULL,
  _zone text DEFAULT NULL,
  _health_filter text[] DEFAULT NULL,
  _limit integer DEFAULT 500,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id          uuid,
  name        text,
  latitude    double precision,
  longitude   double precision,
  continent   text,
  country     text,
  region      text,
  zone        text,
  health      text,
  place_type  text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_admin_or_master(auth.uid()) AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v.id, v.name, v.latitude, v.longitude,
         v.continent, v.country, v.region, v.zone,
         v.health, v.place_type
  FROM public.v_location_geo_health v
  WHERE v.owner_user_id = _user_id
    AND (_health_filter IS NULL OR v.health = ANY(_health_filter))
    AND (_continent IS NULL OR v.continent IS NOT DISTINCT FROM _continent)
    AND (_country   IS NULL OR v.country   IS NOT DISTINCT FROM _country)
    AND (_region    IS NULL OR v.region    IS NOT DISTINCT FROM _region)
    AND (_zone      IS NULL OR v.zone      IS NOT DISTINCT FROM _zone)
  ORDER BY v.continent NULLS LAST, v.country NULLS LAST,
           v.region NULLS LAST, v.zone NULLS LAST, v.name NULLS LAST
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
END;
$$;

-- 7. Resolver used by backfill-admin-fks: given a user + scope, return the
--    target location IDs. Same source of truth as the UI counters → numbers
--    NEVER diverge.
CREATE OR REPLACE FUNCTION public.admin_user_geo_scope_ids(
  _user_id uuid,
  _health_filter text[] DEFAULT NULL,
  _continent text DEFAULT NULL,
  _country text DEFAULT NULL,
  _region text DEFAULT NULL,
  _zone text DEFAULT NULL,
  _limit integer DEFAULT 5000,
  _offset integer DEFAULT 0
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_admin_or_master(auth.uid()) AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v.id
  FROM public.v_location_geo_health v
  WHERE v.owner_user_id = _user_id
    AND (_health_filter IS NULL OR v.health = ANY(_health_filter))
    AND (_continent IS NULL OR v.continent IS NOT DISTINCT FROM _continent)
    AND (_country   IS NULL OR v.country   IS NOT DISTINCT FROM _country)
    AND (_region    IS NULL OR v.region    IS NOT DISTINCT FROM _region)
    AND (_zone      IS NULL OR v.zone      IS NOT DISTINCT FROM _zone)
  ORDER BY v.id
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
END;
$$;
