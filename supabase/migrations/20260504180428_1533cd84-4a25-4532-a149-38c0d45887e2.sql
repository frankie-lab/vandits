
-- =========================================================
-- TRONCO GLOBAL DE LUGARES ENRIQUECIDOS
-- =========================================================

-- 1. Tabla tronco
CREATE TABLE IF NOT EXISTS public.places_trunk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_canonical text NOT NULL,
  place_type text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  -- bucket espacial ~250m para lookup rápido (lat/lng redondeados a 0.002 ≈ 222m)
  lat_bucket double precision GENERATED ALWAYS AS (round(latitude::numeric, 3)) STORED,
  lng_bucket double precision GENERATED ALWAYS AS (round(longitude::numeric, 3)) STORED,
  enriched_data jsonb NOT NULL,
  enriched_at timestamptz NOT NULL DEFAULT now(),
  last_refreshed_at timestamptz NOT NULL DEFAULT now(),
  refresh_count integer NOT NULL DEFAULT 1,
  first_enriched_by uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_places_trunk_bucket
  ON public.places_trunk (lat_bucket, lng_bucket);
CREATE INDEX IF NOT EXISTS idx_places_trunk_type
  ON public.places_trunk (place_type);
CREATE INDEX IF NOT EXISTS idx_places_trunk_refreshed
  ON public.places_trunk (last_refreshed_at);

ALTER TABLE public.places_trunk ENABLE ROW LEVEL SECURITY;

-- Lectura abierta a autenticados
CREATE POLICY "Authenticated can read trunk"
  ON public.places_trunk FOR SELECT
  TO authenticated
  USING (true);

-- Solo masters editan directamente (las RPC security-definer hacen el trabajo normal)
CREATE POLICY "Masters can manage trunk"
  ON public.places_trunk FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master'::app_role));

-- Trigger updated_at
CREATE TRIGGER places_trunk_updated_at
  BEFORE UPDATE ON public.places_trunk
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Setting global TTL
INSERT INTO public.app_settings (key, value, description)
VALUES (
  'trunk_enrichment_ttl_days',
  '365'::jsonb,
  'Días tras los que una entrada del tronco se considera obsoleta y debe re-enriquecerse'
)
ON CONFLICT (key) DO NOTHING;

-- 3. Lookup: devuelve la ficha si hay match <250m + mismo tipo + dentro de TTL
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
  _bucket_radius numeric := 0.003; -- ~333m de margen para el bucket
BEGIN
  SELECT COALESCE((value)::text::integer, 365) INTO _ttl_days
  FROM public.app_settings WHERE key = 'trunk_enrichment_ttl_days';
  IF _ttl_days IS NULL THEN _ttl_days := 365; END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      t.*,
      -- Haversine en metros
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

-- 4. Upsert: tras un enriquecimiento, escribe/actualiza el tronco
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
  -- Reusar lookup (sin TTL: aquí queremos refrescar si hay match)
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

-- 5. Backfill: copia todas las locations enriquecidas al tronco
DO $backfill$
DECLARE
  _row record;
  _existing_id uuid;
BEGIN
  FOR _row IN
    SELECT DISTINCT ON (round(latitude::numeric, 3), round(longitude::numeric, 3), place_type)
      id, name, latitude, longitude, place_type, enriched_data, owner_user_id, updated_at
    FROM public.locations
    WHERE enriched_data IS NOT NULL
      AND enriched_data ? 'descripcion'
      AND deleted_at IS NULL
    ORDER BY round(latitude::numeric, 3),
             round(longitude::numeric, 3),
             place_type,
             updated_at DESC NULLS LAST
  LOOP
    SELECT id INTO _existing_id
    FROM public.lookup_trunk_place(_row.latitude, _row.longitude, _row.place_type, 250)
    LIMIT 1;

    IF _existing_id IS NULL THEN
      INSERT INTO public.places_trunk (
        name_canonical, place_type, latitude, longitude,
        enriched_data, first_enriched_by, last_refreshed_at, enriched_at
      )
      VALUES (
        COALESCE(NULLIF(_row.name, ''), 'Sin nombre'),
        _row.place_type, _row.latitude, _row.longitude,
        _row.enriched_data, _row.owner_user_id,
        COALESCE(_row.updated_at, now()),
        COALESCE(_row.updated_at, now())
      );
    END IF;
  END LOOP;
END
$backfill$;
