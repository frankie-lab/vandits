
-- 1. created_by column for audit
ALTER TABLE public.geocoding_jobs
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS geocoding_jobs_created_by_idx
  ON public.geocoding_jobs(created_by);

-- 2. RLS policies allowing admins/masters cross-user access
DROP POLICY IF EXISTS "Admins manage all geocoding jobs select" ON public.geocoding_jobs;
DROP POLICY IF EXISTS "Admins manage all geocoding jobs insert" ON public.geocoding_jobs;
DROP POLICY IF EXISTS "Admins manage all geocoding jobs update" ON public.geocoding_jobs;

CREATE POLICY "Admins manage all geocoding jobs select"
  ON public.geocoding_jobs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'master'::app_role)
  );

CREATE POLICY "Admins manage all geocoding jobs insert"
  ON public.geocoding_jobs FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'master'::app_role)
  );

CREATE POLICY "Admins manage all geocoding jobs update"
  ON public.geocoding_jobs FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'master'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'master'::app_role)
  );

-- 3. Helper: is caller admin/master?
CREATE OR REPLACE FUNCTION public._is_admin_or_master(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_uid, 'admin'::app_role)
      OR public.has_role(_uid, 'master'::app_role)
$$;

-- 4. RPC: users with broken geo chain (admin only)
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
  WITH broken AS (
    SELECT l.owner_user_id AS uid, COUNT(*)::int AS cnt
    FROM public.locations l
    LEFT JOIN public.admin_areas c ON c.id = l.country_id
    LEFT JOIN public.admin_areas r ON r.id = l.region_id
    LEFT JOIN public.admin_areas z ON z.id = l.zone_id
    WHERE l.deleted_at IS NULL
      AND l.owner_user_id IS NOT NULL
      AND l.latitude IS NOT NULL
      AND l.longitude IS NOT NULL
      AND (
        (l.region_id IS NOT NULL AND l.country_id IS NOT NULL AND r.parent_id IS DISTINCT FROM l.country_id)
        OR (l.zone_id IS NOT NULL AND l.region_id IS NOT NULL AND z.parent_id IS DISTINCT FROM l.region_id)
        OR (l.country_id IS NOT NULL AND l.continent_id IS NOT NULL AND c.parent_id IS DISTINCT FROM l.continent_id)
        OR (l.country_id IS NOT NULL AND l.country_code IS NOT NULL AND c.iso_code IS NOT NULL
            AND upper(l.country_code) <> upper(c.iso_code))
      )
    GROUP BY l.owner_user_id
  ),
  totals AS (
    SELECT l.owner_user_id AS uid, COUNT(*)::int AS total
    FROM public.locations l
    WHERE l.deleted_at IS NULL AND l.owner_user_id IS NOT NULL
    GROUP BY l.owner_user_id
  )
  SELECT
    b.uid,
    p.username,
    p.display_name,
    b.cnt,
    COALESCE(t.total, 0)
  FROM broken b
  LEFT JOIN public.profiles p ON p.id = b.uid
  LEFT JOIN totals t ON t.uid = b.uid
  ORDER BY b.cnt DESC, p.username NULLS LAST;
END;
$$;

-- 5. RPC: broken locations for a given user (admin only)
CREATE OR REPLACE FUNCTION public.admin_broken_locations_for_user(_user_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  latitude double precision,
  longitude double precision,
  continent text,
  country text,
  region text,
  zone text,
  continent_id uuid,
  country_id uuid,
  region_id uuid,
  zone_id uuid,
  admin3_id uuid,
  locality_id uuid,
  sublocality_id uuid,
  country_code text,
  place_type text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_admin_or_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.id, l.name, l.latitude, l.longitude,
    l.continent, l.country, l.region, l.zone,
    l.continent_id, l.country_id, l.region_id, l.zone_id,
    l.admin3_id, l.locality_id, l.sublocality_id,
    l.country_code, l.place_type
  FROM public.locations l
  LEFT JOIN public.admin_areas c ON c.id = l.country_id
  LEFT JOIN public.admin_areas r ON r.id = l.region_id
  LEFT JOIN public.admin_areas z ON z.id = l.zone_id
  WHERE l.deleted_at IS NULL
    AND l.owner_user_id = _user_id
    AND l.latitude IS NOT NULL
    AND l.longitude IS NOT NULL
    AND (
      (l.region_id IS NOT NULL AND l.country_id IS NOT NULL AND r.parent_id IS DISTINCT FROM l.country_id)
      OR (l.zone_id IS NOT NULL AND l.region_id IS NOT NULL AND z.parent_id IS DISTINCT FROM l.region_id)
      OR (l.country_id IS NOT NULL AND l.continent_id IS NOT NULL AND c.parent_id IS DISTINCT FROM l.continent_id)
      OR (l.country_id IS NOT NULL AND l.country_code IS NOT NULL AND c.iso_code IS NOT NULL
          AND upper(l.country_code) <> upper(c.iso_code))
    )
  ORDER BY l.continent NULLS LAST, l.country NULLS LAST, l.region NULLS LAST, l.zone NULLS LAST, l.name NULLS LAST;
END;
$$;

-- 6. RPC: geo coverage for a given user (admin only)
CREATE OR REPLACE FUNCTION public.admin_geo_coverage(_user_id uuid)
RETURNS TABLE(
  total integer,
  with_country integer,
  with_admin1 integer,
  with_timezone integer,
  with_postal integer,
  resolved integer,
  avg_confidence numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_admin_or_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE l.country_code IS NOT NULL)::int AS with_country,
    COUNT(*) FILTER (WHERE l.admin1_iso IS NOT NULL)::int AS with_admin1,
    COUNT(*) FILTER (WHERE l.timezone IS NOT NULL)::int AS with_timezone,
    COUNT(*) FILTER (WHERE l.postal_code IS NOT NULL)::int AS with_postal,
    COUNT(*) FILTER (WHERE l.country_id IS NOT NULL)::int AS resolved,
    ROUND(AVG(l.geo_confidence)::numeric, 2) AS avg_confidence
  FROM public.locations l
  WHERE l.deleted_at IS NULL
    AND l.owner_user_id = _user_id;
END;
$$;
