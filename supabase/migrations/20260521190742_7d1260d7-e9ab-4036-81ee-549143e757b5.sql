
-- T2.3 Lote 0: snapshot + parent-chain region resolution
-- Canon gate: TERRITORIAL_CANON 39 ISO2 + bloqueo explícito IE
WITH canon AS (
  SELECT unnest(ARRAY['AR','AT','AU','BE','BR','CA','CH','CL','CN','CO','DE','DZ','EG','ES','FI','FR','GB','GR','ID','IN','IT','JP','KR','MA','MX','NG','NL','NO','NZ','PH','PL','PT','RO','RU','SE','TR','UA','US','ZA']) AS cc
),
src AS (
  SELECT l.id AS loc_id,
         l.region AS region_actual,
         l.region_id AS region_id_actual,
         COALESCE(l.admin3_id, l.zone_id, l.locality_id) AS leaf_id
  FROM public.locations l
  WHERE (l.region_id IS NULL OR l.region IS NULL OR l.region = '')
    AND COALESCE(l.admin3_id, l.zone_id, l.locality_id) IS NOT NULL
    AND l.country_code = ANY(SELECT cc FROM canon)
    AND l.country_code <> 'IE'
),
chain AS (
  SELECT s.loc_id, s.region_actual, s.region_id_actual,
         aa.id AS anc_id, aa.name AS anc_name
  FROM src s
  JOIN public.admin_areas leaf ON leaf.id = s.leaf_id
  JOIN public.admin_areas aa   ON aa.id = ANY(leaf.path)
  WHERE aa.depth = 1
),
snap AS (
  INSERT INTO public.location_geo_provenance
    (location_id, field_type, area_id, original_value, source, resolved_at)
  SELECT loc_id, 'region', region_id_actual, region_actual, 't23_snapshot', now()
  FROM chain
  RETURNING location_id
)
UPDATE public.locations l
SET region    = c.anc_name,
    region_id = c.anc_id
FROM chain c
WHERE l.id = c.loc_id
  AND EXISTS (SELECT 1 FROM snap s WHERE s.location_id = c.loc_id);
