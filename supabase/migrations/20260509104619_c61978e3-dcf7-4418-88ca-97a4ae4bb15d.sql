CREATE OR REPLACE FUNCTION public.admin_broken_locations_for_user(_user_id uuid, _limit integer DEFAULT 1000, _offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, latitude double precision, longitude double precision, continent text, country text, region text, zone text, continent_id uuid, country_id uuid, region_id uuid, zone_id uuid, admin3_id uuid, locality_id uuid, sublocality_id uuid, country_code text, place_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ORDER BY l.continent NULLS LAST, l.country NULLS LAST, l.region NULLS LAST, l.zone NULLS LAST, l.name NULLS LAST
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
END;
$function$;