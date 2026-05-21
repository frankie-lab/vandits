UPDATE public.locations
SET zone_id = NULL, zone = NULL, admin3_id = NULL
WHERE country_code = 'BR'
  AND locality_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.location_geo_provenance p
    WHERE p.location_id = locations.id AND p.source = 't22_snapshot'
  );