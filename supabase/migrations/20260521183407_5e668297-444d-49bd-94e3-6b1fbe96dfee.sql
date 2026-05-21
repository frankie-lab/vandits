-- Step 1: clear zone_id + zone for ALL SE POIs (8) with snapshot coverage
UPDATE public.locations
SET zone_id = NULL, zone = NULL
WHERE country_code = 'SE'
  AND EXISTS (
    SELECT 1 FROM public.location_geo_provenance p
    WHERE p.location_id = locations.id AND p.source = 't22_snapshot'
  );

-- Step 2: clear admin3_id ONLY for SE POIs with locality_id populated (7)
UPDATE public.locations
SET admin3_id = NULL
WHERE country_code = 'SE'
  AND locality_id IS NOT NULL
  AND admin3_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.location_geo_provenance p
    WHERE p.location_id = locations.id AND p.source = 't22_snapshot'
  );