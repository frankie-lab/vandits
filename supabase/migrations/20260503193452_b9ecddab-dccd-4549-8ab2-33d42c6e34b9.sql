-- =========================================================
-- Paso intermedio: place_types + admin_areas
-- =========================================================

-- 1. place_types: catálogo jerárquico de tipos
CREATE TABLE public.place_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  name            text NOT NULL,
  parent_type_id  uuid REFERENCES public.place_types(id) ON DELETE SET NULL,
  category        text NOT NULL CHECK (category IN ('natural','administrative','urban','building','poi','business','unknown')),
  icon            text,
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_place_types_parent ON public.place_types(parent_type_id);
CREATE INDEX idx_place_types_category ON public.place_types(category);

ALTER TABLE public.place_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read place types"
  ON public.place_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Masters manage place types"
  ON public.place_types FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master'::app_role));

CREATE TRIGGER trg_place_types_updated_at
  BEFORE UPDATE ON public.place_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. admin_areas: entidades administrativas deduplicadas
CREATE TABLE public.admin_areas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id       uuid NOT NULL REFERENCES public.place_types(id) ON DELETE RESTRICT,
  name          text NOT NULL,
  parent_id     uuid REFERENCES public.admin_areas(id) ON DELETE RESTRICT,
  path          uuid[] NOT NULL DEFAULT '{}',
  depth         smallint NOT NULL DEFAULT 0,
  osm_id        bigint,
  wikidata_id   text,
  centroid_lat  double precision,
  centroid_lng  double precision,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_areas_root_check CHECK ((depth = 0) = (parent_id IS NULL))
);

CREATE UNIQUE INDEX uq_admin_areas_parent_name_type
  ON public.admin_areas(COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), type_id);
CREATE INDEX idx_admin_areas_parent ON public.admin_areas(parent_id);
CREATE INDEX idx_admin_areas_type ON public.admin_areas(type_id);
CREATE INDEX idx_admin_areas_path_gin ON public.admin_areas USING GIN(path);
CREATE INDEX idx_admin_areas_name_lower ON public.admin_areas(lower(name));

ALTER TABLE public.admin_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read admin areas"
  ON public.admin_areas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Masters manage admin areas"
  ON public.admin_areas FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master'::app_role));

CREATE TRIGGER trg_admin_areas_updated_at
  BEFORE UPDATE ON public.admin_areas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: mantener path/depth coherentes
CREATE OR REPLACE FUNCTION public.admin_areas_set_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_path uuid[];
  parent_depth smallint;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    NEW.path := ARRAY[NEW.id];
  ELSE
    SELECT path, depth INTO parent_path, parent_depth
    FROM public.admin_areas WHERE id = NEW.parent_id;
    IF parent_path IS NULL THEN
      RAISE EXCEPTION 'admin_areas parent % not found', NEW.parent_id;
    END IF;
    NEW.depth := parent_depth + 1;
    NEW.path := parent_path || NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_admin_areas_path
  BEFORE INSERT OR UPDATE OF parent_id, id ON public.admin_areas
  FOR EACH ROW EXECUTE FUNCTION public.admin_areas_set_path();

-- 3. Columnas FK en locations (compatibles, no rompen nada)
ALTER TABLE public.locations
  ADD COLUMN type_id        uuid REFERENCES public.place_types(id) ON DELETE SET NULL,
  ADD COLUMN continent_id   uuid REFERENCES public.admin_areas(id) ON DELETE SET NULL,
  ADD COLUMN country_id     uuid REFERENCES public.admin_areas(id) ON DELETE SET NULL,
  ADD COLUMN region_id      uuid REFERENCES public.admin_areas(id) ON DELETE SET NULL,
  ADD COLUMN zone_id        uuid REFERENCES public.admin_areas(id) ON DELETE SET NULL,
  ADD COLUMN admin3_id      uuid REFERENCES public.admin_areas(id) ON DELETE SET NULL,
  ADD COLUMN locality_id    uuid REFERENCES public.admin_areas(id) ON DELETE SET NULL,
  ADD COLUMN sublocality_id uuid REFERENCES public.admin_areas(id) ON DELETE SET NULL,
  ADD COLUMN street_name    text;

CREATE INDEX idx_locations_type_id ON public.locations(type_id);
CREATE INDEX idx_locations_country_id ON public.locations(country_id);
CREATE INDEX idx_locations_region_id ON public.locations(region_id);
CREATE INDEX idx_locations_locality_id ON public.locations(locality_id);

-- Trigger: sincronizar columnas string cache desde admin_areas
CREATE OR REPLACE FUNCTION public.locations_sync_admin_cache()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.continent_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.continent_id IS DISTINCT FROM OLD.continent_id) THEN
    SELECT name INTO NEW.continent FROM public.admin_areas WHERE id = NEW.continent_id;
  END IF;
  IF NEW.country_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.country_id IS DISTINCT FROM OLD.country_id) THEN
    SELECT name INTO NEW.country FROM public.admin_areas WHERE id = NEW.country_id;
  END IF;
  IF NEW.region_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.region_id IS DISTINCT FROM OLD.region_id) THEN
    SELECT name INTO NEW.region FROM public.admin_areas WHERE id = NEW.region_id;
  END IF;
  IF NEW.zone_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.zone_id IS DISTINCT FROM OLD.zone_id) THEN
    SELECT name INTO NEW.zone FROM public.admin_areas WHERE id = NEW.zone_id;
  END IF;
  IF NEW.type_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.type_id IS DISTINCT FROM OLD.type_id) THEN
    SELECT code INTO NEW.place_type FROM public.place_types WHERE id = NEW.type_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_locations_sync_admin_cache
  BEFORE INSERT OR UPDATE OF continent_id, country_id, region_id, zone_id, type_id ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.locations_sync_admin_cache();

-- 4. Seed place_types
-- Niveles administrativos
INSERT INTO public.place_types (code, name, category, sort_order, icon) VALUES
  ('continent',     'Continente',           'administrative', 1,  'Globe2'),
  ('country',       'País',                 'administrative', 2,  'Flag'),
  ('region',        'Región / Comunidad',   'administrative', 3,  'Map'),
  ('zone',          'Provincia / Estado',   'administrative', 4,  'MapPin'),
  ('admin_level_3', 'Comarca / Municipio',  'administrative', 5,  'Building2'),
  ('locality',      'Ciudad / Localidad',   'administrative', 6,  'Home'),
  ('sublocality',   'Barrio / Distrito',    'administrative', 7,  'Landmark'),
  ('street',        'Calle',                'urban',          8,  'Milestone');

-- POI / business / natural / building
INSERT INTO public.place_types (code, name, category, sort_order, icon) VALUES
  ('unknown',       'Sin clasificar',       'unknown',        99, 'HelpCircle'),
  ('building',      'Edificio',             'building',       10, 'Building'),
  ('monument',      'Monumento',            'poi',            11, 'Landmark'),
  ('museum',        'Museo',                'poi',            12, 'Landmark'),
  ('viewpoint',     'Mirador',              'poi',            13, 'Eye'),
  ('beach',         'Playa',                'natural',        14, 'Waves'),
  ('mountain',      'Montaña',              'natural',        15, 'Mountain'),
  ('waterfall',     'Cascada',              'natural',        16, 'Droplets'),
  ('landform',      'Accidente geográfico', 'natural',        17, 'Mountain'),
  ('lake',          'Lago',                 'natural',        18, 'Droplets'),
  ('river',         'Río',                  'natural',        19, 'Droplets'),
  ('forest',        'Bosque',               'natural',        20, 'Trees'),
  ('park',          'Parque',               'natural',        21, 'Trees'),
  ('establishment', 'Establecimiento',      'business',       30, 'Store'),
  ('restaurant',    'Restaurante',          'business',       31, 'Utensils'),
  ('bar',           'Bar',                  'business',       32, 'Beer'),
  ('cafe',          'Cafetería',            'business',       33, 'Coffee'),
  ('hotel',         'Hotel',                'business',       34, 'Hotel'),
  ('shop',          'Tienda',               'business',       35, 'Store');

-- Asignar parents: los POI business cuelgan de 'establishment'
UPDATE public.place_types SET parent_type_id = (SELECT id FROM public.place_types WHERE code = 'establishment')
  WHERE code IN ('restaurant','bar','cafe','hotel','shop');

-- Los niveles administrativos forman su propia cadena
UPDATE public.place_types SET parent_type_id = (SELECT id FROM public.place_types WHERE code = 'continent')   WHERE code = 'country';
UPDATE public.place_types SET parent_type_id = (SELECT id FROM public.place_types WHERE code = 'country')     WHERE code = 'region';
UPDATE public.place_types SET parent_type_id = (SELECT id FROM public.place_types WHERE code = 'region')      WHERE code = 'zone';
UPDATE public.place_types SET parent_type_id = (SELECT id FROM public.place_types WHERE code = 'zone')        WHERE code = 'admin_level_3';
UPDATE public.place_types SET parent_type_id = (SELECT id FROM public.place_types WHERE code = 'admin_level_3') WHERE code = 'locality';
UPDATE public.place_types SET parent_type_id = (SELECT id FROM public.place_types WHERE code = 'locality')    WHERE code = 'sublocality';
UPDATE public.place_types SET parent_type_id = (SELECT id FROM public.place_types WHERE code = 'sublocality') WHERE code = 'street';