-- Fase 1 — Modelo de datos canónico para capa geográfica universal

-- admin_areas: códigos internacionales + metadata canónica
ALTER TABLE public.admin_areas
  ADD COLUMN IF NOT EXISTS iso_code_alpha3   text,
  ADD COLUMN IF NOT EXISTS m49_code          smallint,
  ADD COLUMN IF NOT EXISTS admin_type_local  text,
  ADD COLUMN IF NOT EXISTS name_lang         text,
  ADD COLUMN IF NOT EXISTS name_translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source            text,
  ADD COLUMN IF NOT EXISTS geonames_id       bigint,
  ADD COLUMN IF NOT EXISTS timezone          text;

CREATE INDEX IF NOT EXISTS idx_admin_areas_iso_alpha3 ON public.admin_areas (iso_code_alpha3) WHERE iso_code_alpha3 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_areas_geonames_id ON public.admin_areas (geonames_id) WHERE geonames_id IS NOT NULL;

-- locations: cache de códigos + nuevos campos canónicos + auditoría
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS country_code     text,
  ADD COLUMN IF NOT EXISTS admin1_iso       text,
  ADD COLUMN IF NOT EXISTS postal_code      text,
  ADD COLUMN IF NOT EXISTS timezone         text,
  ADD COLUMN IF NOT EXISTS geo_source       text,
  ADD COLUMN IF NOT EXISTS geo_confidence   smallint,
  ADD COLUMN IF NOT EXISTS geo_resolved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS raw_geocode      jsonb;

CREATE INDEX IF NOT EXISTS idx_locations_country_code ON public.locations (country_code) WHERE country_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_locations_admin1_iso   ON public.locations (admin1_iso)   WHERE admin1_iso IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_locations_geo_confidence ON public.locations (geo_confidence) WHERE geo_confidence IS NOT NULL;

-- place_types: nivel admin ordenado para lógica genérica cross-país
ALTER TABLE public.place_types
  ADD COLUMN IF NOT EXISTS sort_admin_level smallint;

-- Sembrar sort_admin_level a partir de los códigos canónicos existentes
UPDATE public.place_types SET sort_admin_level = 0 WHERE code = 'continent'     AND sort_admin_level IS NULL;
UPDATE public.place_types SET sort_admin_level = 1 WHERE code = 'country'       AND sort_admin_level IS NULL;
UPDATE public.place_types SET sort_admin_level = 2 WHERE code = 'region'        AND sort_admin_level IS NULL;
UPDATE public.place_types SET sort_admin_level = 3 WHERE code = 'zone'          AND sort_admin_level IS NULL;
UPDATE public.place_types SET sort_admin_level = 4 WHERE code = 'admin_level_3' AND sort_admin_level IS NULL;
UPDATE public.place_types SET sort_admin_level = 5 WHERE code = 'locality'      AND sort_admin_level IS NULL;
UPDATE public.place_types SET sort_admin_level = 6 WHERE code = 'sublocality'   AND sort_admin_level IS NULL;

-- Extender el trigger de cache para propagar country_code, admin1_iso y timezone desde admin_areas
CREATE OR REPLACE FUNCTION public.locations_sync_admin_cache()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.continent_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.continent_id IS DISTINCT FROM OLD.continent_id) THEN
    SELECT name INTO NEW.continent FROM public.admin_areas WHERE id = NEW.continent_id;
  END IF;
  IF NEW.country_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.country_id IS DISTINCT FROM OLD.country_id) THEN
    SELECT name, iso_code, COALESCE(NEW.timezone, timezone)
      INTO NEW.country, NEW.country_code, NEW.timezone
      FROM public.admin_areas WHERE id = NEW.country_id;
  END IF;
  IF NEW.region_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.region_id IS DISTINCT FROM OLD.region_id) THEN
    SELECT name, iso_code INTO NEW.region, NEW.admin1_iso FROM public.admin_areas WHERE id = NEW.region_id;
  END IF;
  IF NEW.zone_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.zone_id IS DISTINCT FROM OLD.zone_id) THEN
    SELECT name INTO NEW.zone FROM public.admin_areas WHERE id = NEW.zone_id;
  END IF;
  IF NEW.type_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.type_id IS DISTINCT FROM OLD.type_id) THEN
    SELECT code INTO NEW.place_type FROM public.place_types WHERE id = NEW.type_id;
  END IF;
  RETURN NEW;
END;
$function$;