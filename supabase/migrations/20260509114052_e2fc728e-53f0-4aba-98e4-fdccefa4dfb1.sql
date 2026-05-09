-- 1. Column + index
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS geo_health text;

CREATE INDEX IF NOT EXISTS idx_locations_owner_geo_health
  ON public.locations (owner_user_id, geo_health)
  WHERE deleted_at IS NULL;

-- 2. Helper that resolves admin_areas lookups for a single row and
--    delegates to the existing _compute_location_geo_health.
CREATE OR REPLACE FUNCTION public._compute_location_geo_health_lookup(
  _lat double precision, _lng double precision,
  _continent_id uuid, _country_id uuid, _region_id uuid, _zone_id uuid,
  _country_str text, _region_str text, _zone_str text, _country_code text
) RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  _c_name text; _c_parent uuid; _c_iso text;
  _r_name text; _r_parent uuid;
  _z_name text; _z_parent uuid;
BEGIN
  IF _country_id IS NOT NULL THEN
    SELECT name, parent_id, iso_code
      INTO _c_name, _c_parent, _c_iso
      FROM public.admin_areas WHERE id = _country_id;
  END IF;
  IF _region_id IS NOT NULL THEN
    SELECT name, parent_id INTO _r_name, _r_parent
      FROM public.admin_areas WHERE id = _region_id;
  END IF;
  IF _zone_id IS NOT NULL THEN
    SELECT name, parent_id INTO _z_name, _z_parent
      FROM public.admin_areas WHERE id = _zone_id;
  END IF;
  RETURN public._compute_location_geo_health(
    _lat, _lng, _continent_id, _country_id, _region_id, _zone_id,
    _country_str, _region_str, _zone_str, _country_code,
    _c_name, _c_parent, _c_iso,
    _r_name, _r_parent,
    _z_name, _z_parent
  );
END;
$fn$;

-- 3. BEFORE INSERT/UPDATE trigger on locations: recompute geo_health
--    when any of the inputs change. Named with zzz_ prefix to fire after
--    locations_sync_admin_cache (which fills the cached strings).
CREATE OR REPLACE FUNCTION public.locations_set_geo_health()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  NEW.geo_health := public._compute_location_geo_health_lookup(
    NEW.latitude, NEW.longitude,
    NEW.continent_id, NEW.country_id, NEW.region_id, NEW.zone_id,
    NEW.country, NEW.region, NEW.zone, NEW.country_code
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS zzz_locations_set_geo_health ON public.locations;
CREATE TRIGGER zzz_locations_set_geo_health
BEFORE INSERT OR UPDATE OF
  latitude, longitude,
  continent_id, country_id, region_id, zone_id,
  country, region, zone, country_code
ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.locations_set_geo_health();

-- 4. When an admin_area changes name/parent/iso, recompute geo_health
--    for the locations that reference it. Rare event, but keeps the
--    column truthful without manual backfills.
CREATE OR REPLACE FUNCTION public.admin_areas_invalidate_geo_health()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  changed boolean := false;
  affected uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    changed := true;
    affected := OLD.id;
  ELSIF TG_OP = 'UPDATE' AND (
    OLD.name IS DISTINCT FROM NEW.name
    OR OLD.parent_id IS DISTINCT FROM NEW.parent_id
    OR OLD.iso_code IS DISTINCT FROM NEW.iso_code
  ) THEN
    changed := true;
    affected := NEW.id;
  END IF;

  IF changed THEN
    UPDATE public.locations l
    SET geo_health = public._compute_location_geo_health_lookup(
      l.latitude, l.longitude,
      l.continent_id, l.country_id, l.region_id, l.zone_id,
      l.country, l.region, l.zone, l.country_code
    )
    WHERE l.deleted_at IS NULL
      AND (l.continent_id = affected
        OR l.country_id   = affected
        OR l.region_id    = affected
        OR l.zone_id      = affected);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS admin_areas_invalidate_geo_health ON public.admin_areas;
CREATE TRIGGER admin_areas_invalidate_geo_health
AFTER UPDATE OR DELETE ON public.admin_areas
FOR EACH ROW
EXECUTE FUNCTION public.admin_areas_invalidate_geo_health();

-- 5. One-shot backfill for existing rows.
UPDATE public.locations l
SET geo_health = public._compute_location_geo_health_lookup(
  l.latitude, l.longitude,
  l.continent_id, l.country_id, l.region_id, l.zone_id,
  l.country, l.region, l.zone, l.country_code
)
WHERE l.deleted_at IS NULL;

-- 6. Replace v_location_geo_health to read the persisted column. All
--    existing RPCs (admin_user_geo_summary, _scope_ids, _tree, _locations,
--    admin_users_with_broken_geo_chain) keep working unchanged but now
--    hit a simple indexed scan instead of computing health on every row.
DROP VIEW IF EXISTS public.v_location_geo_health;
CREATE VIEW public.v_location_geo_health
WITH (security_invoker = on) AS
SELECT
  l.id,
  l.owner_user_id,
  l.document_id,
  l.name,
  l.latitude,
  l.longitude,
  l.continent,
  l.country,
  l.region,
  l.zone,
  l.continent_id,
  l.country_id,
  l.region_id,
  l.zone_id,
  l.country_code,
  l.place_type,
  l.geo_health AS health
FROM public.locations l
WHERE l.deleted_at IS NULL;