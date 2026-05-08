
-- 1. Profile language preferences (ISO 639-1)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS language_fallback text NOT NULL DEFAULT 'en';

-- 2. admin_areas: confidence + unique ISO indexes
ALTER TABLE public.admin_areas
  ADD COLUMN IF NOT EXISTS confidence smallint;

-- Unique ISO code per type (country / region). Partial: only when iso_code present.
DO $$
DECLARE
  country_type uuid;
  region_type uuid;
BEGIN
  SELECT id INTO country_type FROM public.place_types WHERE code = 'country' LIMIT 1;
  SELECT id INTO region_type  FROM public.place_types WHERE code = 'region'  LIMIT 1;

  IF country_type IS NOT NULL THEN
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS admin_areas_iso_country_uniq
       ON public.admin_areas (iso_code)
       WHERE iso_code IS NOT NULL AND type_id = %L',
      country_type
    );
  END IF;

  IF region_type IS NOT NULL THEN
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS admin_areas_iso_region_uniq
       ON public.admin_areas (iso_code)
       WHERE iso_code IS NOT NULL AND type_id = %L',
      region_type
    );
  END IF;
END $$;

-- 3. admin_area_names: multilingual names
CREATE TABLE IF NOT EXISTS public.admin_area_names (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  area_id uuid NOT NULL REFERENCES public.admin_areas(id) ON DELETE CASCADE,
  language text NOT NULL,
  name text NOT NULL,
  name_kind text NOT NULL DEFAULT 'common'
    CHECK (name_kind IN ('official','common','exonym','historical','alias')),
  source text,
  confidence smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area_id, language, name_kind, name)
);

CREATE INDEX IF NOT EXISTS admin_area_names_area_lang_idx
  ON public.admin_area_names (area_id, language);

CREATE INDEX IF NOT EXISTS admin_area_names_name_lower_idx
  ON public.admin_area_names (lower(name));

ALTER TABLE public.admin_area_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read admin_area_names"
  ON public.admin_area_names
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Masters manage admin_area_names"
  ON public.admin_area_names
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master'::app_role));

CREATE TRIGGER admin_area_names_updated_at
  BEFORE UPDATE ON public.admin_area_names
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. place_types_i18n: localized labels for place type codes
CREATE TABLE IF NOT EXISTS public.place_types_i18n (
  code text NOT NULL,
  language text NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, language)
);

ALTER TABLE public.place_types_i18n ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read place_types_i18n"
  ON public.place_types_i18n
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Masters manage place_types_i18n"
  ON public.place_types_i18n
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master'::app_role));

CREATE TRIGGER place_types_i18n_updated_at
  BEFORE UPDATE ON public.place_types_i18n
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. location_geo_provenance: per-point per-level resolution audit
CREATE TABLE IF NOT EXISTS public.location_geo_provenance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  field_type text NOT NULL
    CHECK (field_type IN ('continent','country','region','zone','admin3','locality','sublocality','street','place_type')),
  area_id uuid REFERENCES public.admin_areas(id) ON DELETE SET NULL,
  original_value text,
  original_language text,
  normalized_value text,
  normalized_language text,
  source text,
  confidence smallint,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, field_type)
);

CREATE INDEX IF NOT EXISTS location_geo_provenance_loc_idx
  ON public.location_geo_provenance (location_id);

CREATE INDEX IF NOT EXISTS location_geo_provenance_area_idx
  ON public.location_geo_provenance (area_id);

ALTER TABLE public.location_geo_provenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read provenance"
  ON public.location_geo_provenance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.locations l
      WHERE l.id = location_geo_provenance.location_id
        AND public.can_view_location(l.*)
    )
  );

CREATE POLICY "Masters manage provenance"
  ON public.location_geo_provenance
  FOR ALL
  USING (has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master'::app_role));
