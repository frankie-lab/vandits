-- ============================================================================
-- Geo-health rebuild: usa la cadena canónica completa de 7 niveles
-- (continent → country → region → zone → admin3 → locality → sublocality).
-- 
-- Antes: la salud y el árbol miraban solo 4 FKs y strings legacy. Ahora se
-- evalúan los 7 FKs contra admin_areas.path[] (materializado), con detección
-- real de huecos profundos y cadenas inconsistentes en cualquier nivel.
-- ============================================================================

-- Drop dependents first (signature/return shape changes).
DROP FUNCTION IF EXISTS public.admin_user_geo_summary(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_user_geo_tree(uuid, text[]) CASCADE;
DROP FUNCTION IF EXISTS public.admin_user_geo_locations(
  uuid, text, text, text, text, text[], integer, integer
) CASCADE;
DROP FUNCTION IF EXISTS public.admin_user_geo_scope_ids(
  uuid, text[], text, text, text, text, integer, integer
) CASCADE;
DROP FUNCTION IF EXISTS public.admin_users_geo_universe(text[]) CASCADE;
DROP FUNCTION IF EXISTS public.admin_users_with_broken_geo_chain() CASCADE;
DROP FUNCTION IF EXISTS public.locations_with_broken_geo_chain(uuid, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.count_locations_with_broken_geo_chain(uuid) CASCADE;
DROP VIEW IF EXISTS public.v_location_geo_health CASCADE;

-- ============================================================================
-- 1. View: clasifica salud usando los 7 niveles + admin_areas.path[]
-- ============================================================================
CREATE VIEW public.v_location_geo_health
WITH (security_invoker = on) AS
WITH base AS (
  SELECT
    l.id,
    l.owner_user_id,
    l.document_id,
    l.name,
    l.latitude,
    l.longitude,
    -- Legacy cached strings (todavía usados como cache)
    l.continent     AS legacy_continent,
    l.country       AS legacy_country,
    l.region        AS legacy_region,
    l.zone          AS legacy_zone,
    l.country_code,
    l.place_type,
    l.continent_id,
    l.country_id,
    l.region_id,
    l.zone_id,
    l.admin3_id,
    l.locality_id,
    l.sublocality_id,
    -- Canonical names (and paths) from admin_areas
    co.name      AS continent_name,
    co.path      AS continent_path,
    cu.name      AS country_name,
    cu.path      AS country_path,
    cu.iso_code  AS country_iso,
    rg.name      AS region_name,
    rg.path      AS region_path,
    zn.name      AS zone_name,
    zn.path      AS zone_path,
    a3.name      AS admin3_name,
    a3.path      AS admin3_path,
    lc.name      AS locality_name,
    lc.path      AS locality_path,
    sl.name      AS sublocality_name,
    sl.path      AS sublocality_path,
    -- Deepest path (most specific FK present)
    COALESCE(sl.path, lc.path, a3.path, zn.path, rg.path, cu.path, co.path)
                  AS deepest_path
  FROM public.locations l
  LEFT JOIN public.admin_areas co ON co.id = l.continent_id
  LEFT JOIN public.admin_areas cu ON cu.id = l.country_id
  LEFT JOIN public.admin_areas rg ON rg.id = l.region_id
  LEFT JOIN public.admin_areas zn ON zn.id = l.zone_id
  LEFT JOIN public.admin_areas a3 ON a3.id = l.admin3_id
  LEFT JOIN public.admin_areas lc ON lc.id = l.locality_id
  LEFT JOIN public.admin_areas sl ON sl.id = l.sublocality_id
  WHERE l.deleted_at IS NULL
)
SELECT
  b.id,
  b.owner_user_id,
  b.document_id,
  b.name,
  b.latitude,
  b.longitude,
  b.country_code,
  b.place_type,
  b.continent_id,
  b.country_id,
  b.region_id,
  b.zone_id,
  b.admin3_id,
  b.locality_id,
  b.sublocality_id,
  -- Canonical names exposed (NOT legacy strings)
  b.continent_name   AS continent,
  b.country_name     AS country,
  b.region_name      AS region,
  b.zone_name        AS zone,
  b.admin3_name      AS admin_level_3,
  b.locality_name    AS locality,
  b.sublocality_name AS sublocality,
  -- Health classification
  CASE
    -- empty
    WHEN b.latitude IS NULL OR b.longitude IS NULL THEN 'empty'
    WHEN b.continent_id IS NULL AND b.country_id IS NULL
         AND b.region_id IS NULL AND b.zone_id IS NULL
         AND b.admin3_id IS NULL AND b.locality_id IS NULL
         AND b.sublocality_id IS NULL THEN 'empty'

    -- broken: any set higher-level FK not present in deepest path
    WHEN b.deepest_path IS NOT NULL AND (
         (b.continent_id IS NOT NULL AND NOT (b.continent_id = ANY(b.deepest_path)))
      OR (b.country_id   IS NOT NULL AND NOT (b.country_id   = ANY(b.deepest_path)))
      OR (b.region_id    IS NOT NULL AND NOT (b.region_id    = ANY(b.deepest_path)))
      OR (b.zone_id      IS NOT NULL AND NOT (b.zone_id      = ANY(b.deepest_path)))
      OR (b.admin3_id    IS NOT NULL AND NOT (b.admin3_id    = ANY(b.deepest_path)))
      OR (b.locality_id  IS NOT NULL AND NOT (b.locality_id  = ANY(b.deepest_path)))
    ) THEN 'broken'
    -- broken: country_code mismatch with country.iso_code
    WHEN b.country_id IS NOT NULL AND b.country_code IS NOT NULL AND b.country_iso IS NOT NULL
         AND upper(b.country_code) <> upper(b.country_iso) THEN 'broken'

    -- partial: chain gaps (deeper FK set but higher missing)
    WHEN b.continent_id IS NULL AND b.country_id IS NOT NULL THEN 'partial'
    WHEN b.country_id IS NULL AND (
         b.region_id IS NOT NULL OR b.zone_id IS NOT NULL OR b.admin3_id IS NOT NULL
      OR b.locality_id IS NOT NULL OR b.sublocality_id IS NOT NULL
    ) THEN 'partial'
    WHEN b.region_id IS NULL AND (
         b.zone_id IS NOT NULL OR b.admin3_id IS NOT NULL
      OR b.locality_id IS NOT NULL OR b.sublocality_id IS NOT NULL
    ) THEN 'partial'
    WHEN b.zone_id IS NULL AND (
         b.admin3_id IS NOT NULL
      OR b.locality_id IS NOT NULL OR b.sublocality_id IS NOT NULL
    ) THEN 'partial'
    -- partial: legacy string filled but corresponding FK null
    WHEN b.legacy_country IS NOT NULL AND b.legacy_country <> '' AND b.country_id IS NULL THEN 'partial'
    WHEN b.legacy_region  IS NOT NULL AND b.legacy_region  <> '' AND b.region_id  IS NULL THEN 'partial'
    WHEN b.legacy_zone    IS NOT NULL AND b.legacy_zone    <> '' AND b.zone_id    IS NULL THEN 'partial'

    -- stale_name: cached string differs from canonical name
    WHEN b.country_id IS NOT NULL AND b.legacy_country IS NOT NULL AND b.country_name IS NOT NULL
         AND lower(b.legacy_country) <> lower(b.country_name) THEN 'stale_name'
    WHEN b.region_id IS NOT NULL AND b.legacy_region IS NOT NULL AND b.region_name IS NOT NULL
         AND lower(b.legacy_region) <> lower(b.region_name) THEN 'stale_name'
    WHEN b.zone_id IS NOT NULL AND b.legacy_zone IS NOT NULL AND b.zone_name IS NOT NULL
         AND lower(b.legacy_zone) <> lower(b.zone_name) THEN 'stale_name'

    ELSE 'ok'
  END AS health,
  -- Reason text for traceability in UI (Spanish)
  CASE
    WHEN b.latitude IS NULL OR b.longitude IS NULL
      THEN 'Sin coordenadas'
    WHEN b.continent_id IS NULL AND b.country_id IS NULL
         AND b.region_id IS NULL AND b.zone_id IS NULL
         AND b.admin3_id IS NULL AND b.locality_id IS NULL
         AND b.sublocality_id IS NULL
      THEN 'Sin jerarquía geográfica'
    WHEN b.deepest_path IS NOT NULL AND b.continent_id IS NOT NULL AND NOT (b.continent_id = ANY(b.deepest_path))
      THEN 'Continente no encaja en la cadena canónica'
    WHEN b.deepest_path IS NOT NULL AND b.country_id IS NOT NULL AND NOT (b.country_id = ANY(b.deepest_path))
      THEN 'País no encaja en la cadena canónica'
    WHEN b.deepest_path IS NOT NULL AND b.region_id IS NOT NULL AND NOT (b.region_id = ANY(b.deepest_path))
      THEN 'Región no encaja en la cadena canónica'
    WHEN b.deepest_path IS NOT NULL AND b.zone_id IS NOT NULL AND NOT (b.zone_id = ANY(b.deepest_path))
      THEN 'Provincia/zona no encaja en la cadena canónica'
    WHEN b.deepest_path IS NOT NULL AND b.admin3_id IS NOT NULL AND NOT (b.admin3_id = ANY(b.deepest_path))
      THEN 'Comarca no encaja en la cadena canónica'
    WHEN b.deepest_path IS NOT NULL AND b.locality_id IS NOT NULL AND NOT (b.locality_id = ANY(b.deepest_path))
      THEN 'Localidad no encaja en la cadena canónica'
    WHEN b.country_id IS NOT NULL AND b.country_code IS NOT NULL AND b.country_iso IS NOT NULL
         AND upper(b.country_code) <> upper(b.country_iso)
      THEN 'country_code distinto de iso_code del país'
    WHEN b.continent_id IS NULL AND b.country_id IS NOT NULL
      THEN 'Falta continente (hueco en la cadena)'
    WHEN b.country_id IS NULL AND (b.region_id IS NOT NULL OR b.zone_id IS NOT NULL
         OR b.admin3_id IS NOT NULL OR b.locality_id IS NOT NULL OR b.sublocality_id IS NOT NULL)
      THEN 'Falta país (hueco en la cadena)'
    WHEN b.region_id IS NULL AND (b.zone_id IS NOT NULL OR b.admin3_id IS NOT NULL
         OR b.locality_id IS NOT NULL OR b.sublocality_id IS NOT NULL)
      THEN 'Falta región (hueco en la cadena)'
    WHEN b.zone_id IS NULL AND (b.admin3_id IS NOT NULL OR b.locality_id IS NOT NULL OR b.sublocality_id IS NOT NULL)
      THEN 'Falta provincia/zona (hueco en la cadena)'
    WHEN b.legacy_country IS NOT NULL AND b.legacy_country <> '' AND b.country_id IS NULL
      THEN 'País como texto sin FK resuelta'
    WHEN b.legacy_region IS NOT NULL AND b.legacy_region <> '' AND b.region_id IS NULL
      THEN 'Región como texto sin FK resuelta'
    WHEN b.legacy_zone IS NOT NULL AND b.legacy_zone <> '' AND b.zone_id IS NULL
      THEN 'Provincia como texto sin FK resuelta'
    WHEN b.country_id IS NOT NULL AND b.legacy_country IS NOT NULL AND b.country_name IS NOT NULL
         AND lower(b.legacy_country) <> lower(b.country_name)
      THEN 'Nombre de país desactualizado'
    WHEN b.region_id IS NOT NULL AND b.legacy_region IS NOT NULL AND b.region_name IS NOT NULL
         AND lower(b.legacy_region) <> lower(b.region_name)
      THEN 'Nombre de región desactualizado'
    WHEN b.zone_id IS NOT NULL AND b.legacy_zone IS NOT NULL AND b.zone_name IS NOT NULL
         AND lower(b.legacy_zone) <> lower(b.zone_name)
      THEN 'Nombre de provincia desactualizado'
    ELSE NULL
  END AS health_reason
FROM base b;

GRANT SELECT ON public.v_location_geo_health TO authenticated;

-- ============================================================================
-- 2. RPC: per-user summary
-- ============================================================================
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

REVOKE EXECUTE ON FUNCTION public.admin_user_geo_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_geo_summary(uuid) TO authenticated;

-- ============================================================================
-- 3. RPC: per-user paginated locations (now includes admin3/locality/sublocality)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_user_geo_locations(
  _user_id uuid,
  _continent text DEFAULT NULL,
  _country text DEFAULT NULL,
  _region text DEFAULT NULL,
  _zone text DEFAULT NULL,
  _admin_level_3 text DEFAULT NULL,
  _locality text DEFAULT NULL,
  _sublocality text DEFAULT NULL,
  _health_filter text[] DEFAULT NULL,
  _limit integer DEFAULT 500,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id             uuid,
  name           text,
  latitude       double precision,
  longitude      double precision,
  continent      text,
  country        text,
  region         text,
  zone           text,
  admin_level_3  text,
  locality       text,
  sublocality    text,
  health         text,
  health_reason  text,
  place_type     text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_admin_or_master(auth.uid()) AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v.id, v.name, v.latitude, v.longitude,
    v.continent, v.country, v.region, v.zone,
    v.admin_level_3, v.locality, v.sublocality,
    v.health, v.health_reason, v.place_type
  FROM public.v_location_geo_health v
  WHERE v.owner_user_id = _user_id
    AND (_health_filter IS NULL OR v.health = ANY(_health_filter))
    AND (_continent     IS NULL OR v.continent     IS NOT DISTINCT FROM _continent)
    AND (_country       IS NULL OR v.country       IS NOT DISTINCT FROM _country)
    AND (_region        IS NULL OR v.region        IS NOT DISTINCT FROM _region)
    AND (_zone          IS NULL OR v.zone          IS NOT DISTINCT FROM _zone)
    AND (_admin_level_3 IS NULL OR v.admin_level_3 IS NOT DISTINCT FROM _admin_level_3)
    AND (_locality      IS NULL OR v.locality      IS NOT DISTINCT FROM _locality)
    AND (_sublocality   IS NULL OR v.sublocality   IS NOT DISTINCT FROM _sublocality)
  ORDER BY v.continent NULLS LAST, v.country NULLS LAST,
           v.region NULLS LAST, v.zone NULLS LAST,
           v.admin_level_3 NULLS LAST, v.locality NULLS LAST,
           v.sublocality NULLS LAST, v.name NULLS LAST
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_user_geo_locations(
  uuid, text, text, text, text, text, text, text, text[], integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_geo_locations(
  uuid, text, text, text, text, text, text, text, text[], integer, integer
) TO authenticated;

-- ============================================================================
-- 4. RPC: scope ids for backfill (extended to 7 levels)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_user_geo_scope_ids(
  _user_id uuid,
  _health_filter text[] DEFAULT NULL,
  _continent text DEFAULT NULL,
  _country text DEFAULT NULL,
  _region text DEFAULT NULL,
  _zone text DEFAULT NULL,
  _admin_level_3 text DEFAULT NULL,
  _locality text DEFAULT NULL,
  _sublocality text DEFAULT NULL,
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
    AND (_continent     IS NULL OR v.continent     IS NOT DISTINCT FROM _continent)
    AND (_country       IS NULL OR v.country       IS NOT DISTINCT FROM _country)
    AND (_region        IS NULL OR v.region        IS NOT DISTINCT FROM _region)
    AND (_zone          IS NULL OR v.zone          IS NOT DISTINCT FROM _zone)
    AND (_admin_level_3 IS NULL OR v.admin_level_3 IS NOT DISTINCT FROM _admin_level_3)
    AND (_locality      IS NULL OR v.locality      IS NOT DISTINCT FROM _locality)
    AND (_sublocality   IS NULL OR v.sublocality   IS NOT DISTINCT FROM _sublocality)
  ORDER BY v.id
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_user_geo_scope_ids(
  uuid, text[], text, text, text, text, text, text, text, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_geo_scope_ids(
  uuid, text[], text, text, text, text, text, text, text, integer, integer
) TO authenticated;

-- ============================================================================
-- 5. RPC: aggregated tree (now 7 levels)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_user_geo_tree(
  _user_id uuid,
  _health_filter text[] DEFAULT NULL
)
RETURNS TABLE(
  continent       text,
  country         text,
  region          text,
  zone            text,
  admin_level_3   text,
  locality        text,
  sublocality     text,
  total           integer,
  empty           integer,
  broken          integer,
  partial         integer,
  stale_name      integer,
  ok              integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_admin_or_master(auth.uid()) AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v.continent, v.country, v.region, v.zone,
    v.admin_level_3, v.locality, v.sublocality,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE v.health = 'empty')::int,
    COUNT(*) FILTER (WHERE v.health = 'broken')::int,
    COUNT(*) FILTER (WHERE v.health = 'partial')::int,
    COUNT(*) FILTER (WHERE v.health = 'stale_name')::int,
    COUNT(*) FILTER (WHERE v.health = 'ok')::int
  FROM public.v_location_geo_health v
  WHERE v.owner_user_id = _user_id
    AND (_health_filter IS NULL OR v.health = ANY(_health_filter))
  GROUP BY v.continent, v.country, v.region, v.zone,
           v.admin_level_3, v.locality, v.sublocality
  ORDER BY v.continent NULLS LAST, v.country NULLS LAST,
           v.region NULLS LAST, v.zone NULLS LAST,
           v.admin_level_3 NULLS LAST, v.locality NULLS LAST,
           v.sublocality NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_user_geo_tree(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_geo_tree(uuid, text[]) TO authenticated;

-- ============================================================================
-- 6. RPC: users-with-universe (now using the unified view, no cached column)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_users_geo_universe(
  _health_filter text[] DEFAULT NULL
)
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
    SELECT v.owner_user_id AS uid, COUNT(*)::int AS cnt
    FROM public.v_location_geo_health v
    WHERE v.owner_user_id IS NOT NULL
      AND (_health_filter IS NULL OR v.health = ANY(_health_filter))
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
  FROM universe u
  LEFT JOIN public.profiles p ON p.id = u.uid
  LEFT JOIN totals t ON t.uid = u.uid
  WHERE u.cnt > 0
  ORDER BY u.cnt DESC, p.username NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_users_geo_universe(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_users_geo_universe(text[]) TO authenticated;

-- ============================================================================
-- 7. Backwards-compat: admin_users_with_broken_geo_chain (uses unified view)
-- ============================================================================
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
    u.uid, p.username, p.display_name, u.cnt, COALESCE(t.total, 0)
  FROM unhealthy u
  LEFT JOIN public.profiles p ON p.id = u.uid
  LEFT JOIN totals t ON t.uid = u.uid
  ORDER BY u.cnt DESC, p.username NULLS LAST;
END;
$$;

-- ============================================================================
-- 8. Backwards-compat: locations_with_broken_geo_chain / count
--    Ahora delegan en la vista unificada (filtran 'broken').
-- ============================================================================
CREATE OR REPLACE FUNCTION public.locations_with_broken_geo_chain(
  _user_id uuid,
  _limit integer DEFAULT 200,
  _offset integer DEFAULT 0
)
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT v.id
  FROM public.v_location_geo_health v
  WHERE v.owner_user_id = _user_id
    AND v.health = 'broken'
  ORDER BY v.id
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.count_locations_with_broken_geo_chain(_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.v_location_geo_health v
  WHERE v.owner_user_id = _user_id
    AND v.health = 'broken';
$$;