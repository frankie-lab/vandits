-- Detecta locations con cadena administrativa rota o country_code incoherente
-- con el iso_code del country_id actual. Sirve para alimentar el backfill en
-- modo "repair" sin barrer todos los puntos del usuario.
CREATE OR REPLACE FUNCTION public.locations_with_broken_geo_chain(
  _user_id uuid,
  _limit int DEFAULT 200,
  _offset int DEFAULT 0
)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id
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
  ORDER BY l.created_at ASC
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.count_locations_with_broken_geo_chain(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
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
    );
$$;

-- Permite añadir el nuevo valor de mode 'repair' en geocoding_jobs.
ALTER TABLE public.geocoding_jobs
  DROP CONSTRAINT IF EXISTS geocoding_jobs_mode_check;
ALTER TABLE public.geocoding_jobs
  ADD CONSTRAINT geocoding_jobs_mode_check
  CHECK (mode IN ('fill', 'reconcile', 'overwrite', 'repair'));