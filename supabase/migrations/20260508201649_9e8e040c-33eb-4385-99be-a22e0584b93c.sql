
CREATE OR REPLACE FUNCTION public.refresh_locations_admin_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total integer := 0;
  affected integer;
BEGIN
  UPDATE public.locations l
  SET continent = a.name
  FROM public.admin_areas a
  WHERE l.continent_id = a.id
    AND COALESCE(l.continent, '') IS DISTINCT FROM COALESCE(a.name, '');
  GET DIAGNOSTICS affected = ROW_COUNT; total := total + affected;

  UPDATE public.locations l
  SET country = a.name,
      country_code = COALESCE(l.country_code, a.iso_code)
  FROM public.admin_areas a
  WHERE l.country_id = a.id
    AND (COALESCE(l.country, '') IS DISTINCT FROM COALESCE(a.name, '')
         OR (l.country_code IS NULL AND a.iso_code IS NOT NULL));
  GET DIAGNOSTICS affected = ROW_COUNT; total := total + affected;

  UPDATE public.locations l
  SET region = a.name,
      admin1_iso = COALESCE(l.admin1_iso, a.iso_code)
  FROM public.admin_areas a
  WHERE l.region_id = a.id
    AND (COALESCE(l.region, '') IS DISTINCT FROM COALESCE(a.name, '')
         OR (l.admin1_iso IS NULL AND a.iso_code IS NOT NULL));
  GET DIAGNOSTICS affected = ROW_COUNT; total := total + affected;

  UPDATE public.locations l
  SET zone = a.name
  FROM public.admin_areas a
  WHERE l.zone_id = a.id
    AND COALESCE(l.zone, '') IS DISTINCT FROM COALESCE(a.name, '');
  GET DIAGNOSTICS affected = ROW_COUNT; total := total + affected;

  RETURN total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_locations_admin_cache() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_locations_admin_cache() FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_locations_admin_cache() TO service_role;
