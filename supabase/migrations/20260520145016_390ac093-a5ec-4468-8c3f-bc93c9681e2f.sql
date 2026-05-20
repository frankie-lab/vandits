CREATE OR REPLACE FUNCTION public._compute_location_geo_health_lookup(
  _lat double precision, _lng double precision,
  _continent_id uuid, _country_id uuid, _region_id uuid, _zone_id uuid,
  _country_str text, _region_str text, _zone_str text, _country_code text,
  _raw_geocode jsonb, _enrichment_status text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _c_name text; _c_parent uuid; _c_iso text; _c_aliases text[]; _c_tx jsonb;
  _r_name text; _r_parent uuid; _r_aliases text[]; _r_tx jsonb;
  _z_name text; _z_parent uuid; _z_aliases text[]; _z_tx jsonb;
  _country_canon text;
  _region_canon  text;
  _zone_canon    text;

  -- Inline: returns the canonical name if `_str` matches name | aliases | name_translations values; else `_str` unchanged.
  -- Done as nested logic instead of a helper to keep this migration self-contained.
BEGIN
  IF _country_id IS NOT NULL THEN
    SELECT name, parent_id, iso_code, COALESCE(aliases, '{}'::text[]), COALESCE(name_translations, '{}'::jsonb)
      INTO _c_name, _c_parent, _c_iso, _c_aliases, _c_tx
      FROM public.admin_areas WHERE id = _country_id;
  END IF;
  IF _region_id IS NOT NULL THEN
    SELECT name, parent_id, COALESCE(aliases, '{}'::text[]), COALESCE(name_translations, '{}'::jsonb)
      INTO _r_name, _r_parent, _r_aliases, _r_tx
      FROM public.admin_areas WHERE id = _region_id;
  END IF;
  IF _zone_id IS NOT NULL THEN
    SELECT name, parent_id, COALESCE(aliases, '{}'::text[]), COALESCE(name_translations, '{}'::jsonb)
      INTO _z_name, _z_parent, _z_aliases, _z_tx
      FROM public.admin_areas WHERE id = _zone_id;
  END IF;

  -- Canonicalize country
  _country_canon := _country_str;
  IF _country_str IS NOT NULL AND _c_name IS NOT NULL THEN
    IF lower(_country_str) = lower(_c_name)
       OR lower(_country_str) = ANY (SELECT lower(x) FROM unnest(_c_aliases) AS x)
       OR EXISTS (SELECT 1 FROM jsonb_each_text(_c_tx) AS t(k,v) WHERE lower(v) = lower(_country_str))
    THEN
      _country_canon := _c_name;
    END IF;
  END IF;

  -- Canonicalize region
  _region_canon := _region_str;
  IF _region_str IS NOT NULL AND _r_name IS NOT NULL THEN
    IF lower(_region_str) = lower(_r_name)
       OR lower(_region_str) = ANY (SELECT lower(x) FROM unnest(_r_aliases) AS x)
       OR EXISTS (SELECT 1 FROM jsonb_each_text(_r_tx) AS t(k,v) WHERE lower(v) = lower(_region_str))
    THEN
      _region_canon := _r_name;
    END IF;
  END IF;

  -- Canonicalize zone
  _zone_canon := _zone_str;
  IF _zone_str IS NOT NULL AND _z_name IS NOT NULL THEN
    IF lower(_zone_str) = lower(_z_name)
       OR lower(_zone_str) = ANY (SELECT lower(x) FROM unnest(_z_aliases) AS x)
       OR EXISTS (SELECT 1 FROM jsonb_each_text(_z_tx) AS t(k,v) WHERE lower(v) = lower(_zone_str))
    THEN
      _zone_canon := _z_name;
    END IF;
  END IF;

  RETURN public._compute_location_geo_health(
    _lat, _lng, _continent_id, _country_id, _region_id, _zone_id,
    _country_canon, _region_canon, _zone_canon, _country_code,
    _c_name, _c_parent, _c_iso,
    _r_name, _r_parent,
    _z_name, _z_parent,
    _raw_geocode, _enrichment_status
  );
END;
$function$;