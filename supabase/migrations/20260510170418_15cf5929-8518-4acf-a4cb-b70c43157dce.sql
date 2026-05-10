-- Vista canónica que JOIN-ea admin_areas para exponer strings resueltos
-- de los 7 niveles del árbol geográfico universal. Sustituye al cache
-- que existía solo para continent/country/region/zone.
CREATE OR REPLACE VIEW public.v_locations_resolved
WITH (security_invoker = true) AS
SELECT
  l.*,
  co.name AS continent_resolved,
  cu.name AS country_resolved,
  rg.name AS region_resolved,
  zn.name AS zone_resolved,
  a3.name AS admin_level_3,
  lc.name AS locality,
  sl.name AS sublocality
FROM public.locations l
LEFT JOIN public.admin_areas co ON co.id = l.continent_id
LEFT JOIN public.admin_areas cu ON cu.id = l.country_id
LEFT JOIN public.admin_areas rg ON rg.id = l.region_id
LEFT JOIN public.admin_areas zn ON zn.id = l.zone_id
LEFT JOIN public.admin_areas a3 ON a3.id = l.admin3_id
LEFT JOIN public.admin_areas lc ON lc.id = l.locality_id
LEFT JOIN public.admin_areas sl ON sl.id = l.sublocality_id;

GRANT SELECT ON public.v_locations_resolved TO authenticated, anon;