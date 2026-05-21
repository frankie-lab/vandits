UPDATE public.locations
SET admin3_id = NULL
WHERE country_code = 'NL'
  AND geo_resolved_at IS NULL
  AND locality_id IS NOT NULL
  AND admin3_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.location_geo_provenance p
    WHERE p.location_id = locations.id AND p.source = 't22_snapshot'
  );