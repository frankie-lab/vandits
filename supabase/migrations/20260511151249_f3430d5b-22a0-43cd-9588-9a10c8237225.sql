
-- Resincronizar cache legacy con admin_areas (el trigger locations_set_geo_health recalcula geo_health)
UPDATE locations
SET
  continent = COALESCE(acont.name, locations.continent),
  country   = COALESCE(aco.name,   locations.country),
  region    = COALESCE(ar.name,    locations.region),
  zone      = COALESCE(az.name,    locations.zone)
FROM (SELECT id FROM locations WHERE deleted_at IS NULL AND geo_health IN ('stale_name','partial','broken')) target
LEFT JOIN admin_areas acont ON acont.id = (SELECT continent_id FROM locations WHERE id = target.id)
LEFT JOIN admin_areas aco   ON aco.id   = (SELECT country_id   FROM locations WHERE id = target.id)
LEFT JOIN admin_areas ar    ON ar.id    = (SELECT region_id    FROM locations WHERE id = target.id)
LEFT JOIN admin_areas az    ON az.id    = (SELECT zone_id      FROM locations WHERE id = target.id)
WHERE locations.id = target.id;
