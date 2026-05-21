UPDATE public.locations
SET zone_id = NULL, zone = NULL, admin3_id = NULL
WHERE country_code = 'NL'
  AND geo_resolved_at < '2026-05-21'
  AND locality_id IS NOT NULL;

UPDATE public.locations
SET zone_id = NULL, zone = NULL
WHERE country_code = 'NL'
  AND geo_resolved_at < '2026-05-21'
  AND locality_id IS NULL;