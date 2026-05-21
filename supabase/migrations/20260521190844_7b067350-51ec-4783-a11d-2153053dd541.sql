
-- Rollback Lote 0
UPDATE public.locations l
SET region    = s.original_value,
    region_id = s.area_id
FROM public.location_geo_provenance s
WHERE s.location_id = l.id
  AND s.source = 't23_snapshot'
  AND s.field_type = 'region';

DELETE FROM public.location_geo_provenance WHERE source = 't23_snapshot';
