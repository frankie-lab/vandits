-- Fase 7 — R7: places_trunk rechaza coords inválidas.
-- Reapply lookup_trunk_place + upsert_trunk_place adding the canonical
-- WGS84 validity guard at the very beginning of each function.
-- A coord is invalid when NULL, NaN, (0,0) Null Island, or outside WGS84.

CREATE OR REPLACE FUNCTION public.lookup_trunk_place(
  _latitude double precision,
  _longitude double precision,
  _place_type text DEFAULT NULL,
  _max_distance_meters double precision DEFAULT 250
)
RETURNS TABLE (
  id uuid,
  name_canonical text,
  place_type text,
  latitude double precision,
  longitude double precision,
  enriched_data jsonb,
  enriched_at timestamptz,
  last_refreshed_at timestamptz,
  is_fresh boolean,
  distance_meters double precision
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ttl_days integer;
  _bucket_radius numeric := 0.003;
BEGIN
  -- R7 entry gate: reject invalid WGS84 coords (mirrors isValidWgs84Coord).
  IF _latitude IS NULL OR _longitude IS NULL
     OR _latitude <> _latitude OR _longitude <> _longitude
     OR _latitude < -90 OR _latitude > 90
     OR _longitude < -180 OR _longitude > 180
     OR (abs(_latitude) < 1e-7 AND abs(_longitude) < 1e-7) THEN
    RETURN;
  END IF;

  SELECT COALESCE((value)::text::integer, 365) INTO _ttl_days
  FROM public.app_settings WHERE key = 'trunk_enrichment_ttl_days';
  IF _ttl_days IS NULL THEN _ttl_days := 365; END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      t.*,
      2 * 6371000 * asin(sqrt(
        sin(radians(t.latitude - _latitude) / 2) ^ 2 +
        cos(radians(_latitude)) * cos(radians(t.latitude)) *
        sin(radians(t.longitude - _longitude) / 2) ^ 2
      )) AS dist_m
    FROM public.places_trunk t
    WHERE t.lat_bucket BETWEEN round((_latitude - _bucket_radius)::numeric, 3)
                           AND round((_latitude + _bucket_radius)::numeric, 3)
      AND t.lng_bucket BETWEEN round((_longitude - _bucket_radius)::numeric, 3)
                           AND round((_longitude + _bucket_radius)::numeric, 3)
      AND (_place_type IS NULL OR t.place_type IS NULL OR t.place_type = _place_type)
  )
  SELECT
    c.id,
    c.name_canonical,
    c.place_type,
    c.latitude,
    c.longitude,
    c.enriched_data,
    c.enriched_at,
    c.last_refreshed_at,
    (c.last_refreshed_at > now() - make_interval(days => _ttl_days)) AS is_fresh,
    c.dist_m AS distance_meters
  FROM candidates c
  WHERE c.dist_m <= _max_distance_meters
  ORDER BY c.dist_m ASC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_trunk_place(
  _name text,
  _latitude double precision,
  _longitude double precision,
  _place_type text,
  _enriched_data jsonb,
  _enriched_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing record;
  _trunk_id uuid;
BEGIN
  -- R7 entry gate: reject invalid WGS84 coords.
  IF _latitude IS NULL OR _longitude IS NULL
     OR _latitude <> _latitude OR _longitude <> _longitude
     OR _latitude < -90 OR _latitude > 90
     OR _longitude < -180 OR _longitude > 180
     OR (abs(_latitude) < 1e-7 AND abs(_longitude) < 1e-7) THEN
    RETURN NULL;
  END IF;

  SELECT id, version INTO _existing
  FROM public.lookup_trunk_place(_latitude, _longitude, _place_type, 250)
  LIMIT 1;

  IF _existing.id IS NOT NULL THEN
    UPDATE public.places_trunk
    SET enriched_data = _enriched_data,
        name_canonical = COALESCE(NULLIF(_name, ''), name_canonical),
        place_type = COALESCE(_place_type, place_type),
        last_refreshed_at = now(),
        refresh_count = refresh_count + 1,
        version = version + 1
    WHERE id = _existing.id
    RETURNING id INTO _trunk_id;
  ELSE
    INSERT INTO public.places_trunk (
      name_canonical, place_type, latitude, longitude,
      enriched_data, first_enriched_by
    )
    VALUES (
      COALESCE(NULLIF(_name, ''), 'Sin nombre'),
      _place_type, _latitude, _longitude,
      _enriched_data,
      COALESCE(_enriched_by, auth.uid())
    )
    RETURNING id INTO _trunk_id;
  END IF;

  RETURN _trunk_id;
END;
$$;