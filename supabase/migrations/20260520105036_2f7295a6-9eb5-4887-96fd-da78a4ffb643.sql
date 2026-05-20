-- ============================================================
-- Fase 5 — geo_health honesto (R2)
-- Contrato: docs/contracts/enrichment-coord-coherence-contract.md
-- ============================================================

-- 1) Core classifier: add hardError bucket on top.
CREATE OR REPLACE FUNCTION public._compute_location_geo_health(
  _lat double precision,
  _lng double precision,
  _continent_id uuid,
  _country_id uuid,
  _region_id uuid,
  _zone_id uuid,
  _country_str text,
  _region_str text,
  _zone_str text,
  _country_code text,
  _c_name text,
  _c_parent uuid,
  _c_iso text,
  _r_name text,
  _r_parent uuid,
  _z_name text,
  _z_parent uuid,
  _raw_geocode jsonb,
  _enrichment_status text
)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    -- hardError (R2): coords inválidas o enriched sin raw_geocode.
    WHEN _lat IS NULL OR _lng IS NULL THEN 'hardError'
    WHEN _lat = 0 AND _lng = 0 THEN 'hardError'
    WHEN ABS(_lat) > 90 OR ABS(_lng) > 180 THEN 'hardError'
    WHEN _enrichment_status = 'enriched' AND _raw_geocode IS NULL THEN 'hardError'

    -- empty: no admin FK at all (coords ya garantizadas válidas a este punto)
    WHEN _continent_id IS NULL AND _country_id IS NULL
         AND _region_id IS NULL AND _zone_id IS NULL THEN 'empty'

    -- broken: structural FK mismatches (parent chain or iso)
    WHEN (_region_id IS NOT NULL AND _country_id IS NOT NULL
          AND _r_parent IS DISTINCT FROM _country_id) THEN 'broken'
    WHEN (_zone_id IS NOT NULL AND _region_id IS NOT NULL
          AND _z_parent IS DISTINCT FROM _region_id) THEN 'broken'
    WHEN (_country_id IS NOT NULL AND _continent_id IS NOT NULL
          AND _c_parent IS DISTINCT FROM _continent_id) THEN 'broken'
    WHEN (_country_id IS NOT NULL AND _country_code IS NOT NULL
          AND _c_iso IS NOT NULL
          AND upper(_country_code) <> upper(_c_iso)) THEN 'broken'

    -- partial: string filled in but FK missing
    WHEN (_country_str IS NOT NULL AND _country_str <> ''
          AND _country_id IS NULL) THEN 'partial'
    WHEN (_region_str IS NOT NULL AND _region_str <> ''
          AND _region_id IS NULL) THEN 'partial'
    WHEN (_zone_str IS NOT NULL AND _zone_str <> ''
          AND _zone_id IS NULL) THEN 'partial'

    -- stale_name: FK present but cached string differs from canonical name
    WHEN (_country_id IS NOT NULL AND _country_str IS NOT NULL AND _c_name IS NOT NULL
          AND lower(_country_str) <> lower(_c_name)) THEN 'stale_name'
    WHEN (_region_id IS NOT NULL AND _region_str IS NOT NULL AND _r_name IS NOT NULL
          AND lower(_region_str) <> lower(_r_name)) THEN 'stale_name'
    WHEN (_zone_id IS NOT NULL AND _zone_str IS NOT NULL AND _z_name IS NOT NULL
          AND lower(_zone_str) <> lower(_z_name)) THEN 'stale_name'

    ELSE 'ok'
  END;
$$;

-- 2) Lookup wrapper: pass through raw_geocode + enrichment_status.
CREATE OR REPLACE FUNCTION public._compute_location_geo_health_lookup(
  _lat double precision, _lng double precision,
  _continent_id uuid, _country_id uuid, _region_id uuid, _zone_id uuid,
  _country_str text, _region_str text, _zone_str text, _country_code text,
  _raw_geocode jsonb, _enrichment_status text
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
    _z_name, _z_parent,
    _raw_geocode, _enrichment_status
  );
END;
$fn$;

-- 2b) Drop legacy 10-arg signature (no longer referenced).
DROP FUNCTION IF EXISTS public._compute_location_geo_health_lookup(
  double precision, double precision,
  uuid, uuid, uuid, uuid,
  text, text, text, text
);

-- 3) BEFORE INSERT/UPDATE trigger: include raw_geocode + enrichment_status.
CREATE OR REPLACE FUNCTION public.locations_set_geo_health()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  NEW.geo_health := public._compute_location_geo_health_lookup(
    NEW.latitude, NEW.longitude,
    NEW.continent_id, NEW.country_id, NEW.region_id, NEW.zone_id,
    NEW.country, NEW.region, NEW.zone, NEW.country_code,
    NEW.raw_geocode, NEW.enrichment_status
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS zzz_locations_set_geo_health ON public.locations;
CREATE TRIGGER zzz_locations_set_geo_health
BEFORE INSERT OR UPDATE OF
  latitude, longitude,
  continent_id, country_id, region_id, zone_id,
  country, region, zone, country_code,
  raw_geocode, enrichment_status
ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.locations_set_geo_health();

-- 4) admin_areas invalidation: propagate new args.
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
      l.country, l.region, l.zone, l.country_code,
      l.raw_geocode, l.enrichment_status
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

-- Triggers on admin_areas remain bound to the same function name; no DROP needed.

-- NOTE: No one-shot backfill UPDATE. Contrato Fase 5 = "Sin migración de datos".
-- Filas existentes recomputarán su geo_health al próximo cambio relevante.
