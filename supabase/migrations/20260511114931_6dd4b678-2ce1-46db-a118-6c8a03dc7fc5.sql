-- Enum kind
DO $$ BEGIN
  CREATE TYPE public.data_source_kind AS ENUM ('search', 'enrichment', 'scraper');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  kind public.data_source_kind NOT NULL,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  weight numeric NOT NULL DEFAULT 1.0,
  requires_secret boolean NOT NULL DEFAULT false,
  secret_name text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_sources_kind ON public.data_sources(kind);
CREATE INDEX IF NOT EXISTS idx_data_sources_enabled ON public.data_sources(enabled);

ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_sources select all auth" ON public.data_sources;
CREATE POLICY "data_sources select all auth"
  ON public.data_sources FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "data_sources admin write" ON public.data_sources;
CREATE POLICY "data_sources admin write"
  ON public.data_sources FOR ALL TO authenticated
  USING (public._is_admin_or_master(auth.uid()))
  WITH CHECK (public._is_admin_or_master(auth.uid()));

DROP TRIGGER IF EXISTS trg_data_sources_updated_at ON public.data_sources;
CREATE TRIGGER trg_data_sources_updated_at
  BEFORE UPDATE ON public.data_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed (idempotente)
INSERT INTO public.data_sources (code, kind, name, description, priority, requires_secret, secret_name, config) VALUES
  -- BÚSQUEDA
  ('search.wikipedia_es', 'search', 'Wikipedia (ES)', 'Búsqueda de artículos en Wikipedia en español con coordenadas', 10, false, NULL, '{"endpoint":"https://es.wikipedia.org/w/api.php","lang":"es"}'::jsonb),
  ('search.wikipedia_en', 'search', 'Wikipedia (EN)', 'Búsqueda de artículos en Wikipedia en inglés con coordenadas', 30, false, NULL, '{"endpoint":"https://en.wikipedia.org/w/api.php","lang":"en"}'::jsonb),
  ('search.wikidata',     'search', 'Wikidata', 'Entidades estructuradas con claim P625 (coordenadas)', 20, false, NULL, '{"endpoint":"https://www.wikidata.org/w/api.php"}'::jsonb),
  ('search.nominatim',    'search', 'Nominatim / OSM', 'Geocoding y búsqueda toponímica vía OpenStreetMap', 40, false, NULL, '{"endpoint":"https://nominatim.openstreetmap.org"}'::jsonb),
  ('search.geonames',     'search', 'GeoNames', 'Toponimia mundial (requiere usuario GeoNames)', 50, true, 'GEONAMES_USERNAME', '{"endpoint":"https://api.geonames.org"}'::jsonb),
  ('search.photon',       'search', 'Photon (Komoot)', 'Geocoder gratuito basado en OSM, sin clave', 35, false, NULL, '{"endpoint":"https://photon.komoot.io"}'::jsonb),
  ('search.google_places','search', 'Google Places', 'Google Places API (Text Search). Requiere API key de Google Cloud.', 5, true, 'GOOGLE_PLACES_API_KEY', '{"endpoint":"https://places.googleapis.com/v1"}'::jsonb),
  -- ENRIQUECIMIENTO
  ('enrich.wikipedia',         'enrichment', 'Wikipedia', 'Geosearch por coords, search por nombre, extracts e imágenes', 10, false, NULL, '{}'::jsonb),
  ('enrich.wikidata',          'enrichment', 'Wikidata', 'Entidades P31 (instance-of, cultural context)', 20, false, NULL, '{}'::jsonb),
  ('enrich.wikidata_sparql',   'enrichment', 'Wikidata SPARQL', 'Imágenes vinculadas a entidades Wikidata', 25, false, NULL, '{"endpoint":"https://query.wikidata.org/sparql"}'::jsonb),
  ('enrich.commons',           'enrichment', 'Wikimedia Commons', 'Imágenes Commons por nombre y por geosearch (2 km)', 30, false, NULL, '{}'::jsonb),
  ('enrich.nominatim',         'enrichment', 'Nominatim / OSM', 'Reverse geocoding (dirección, admin levels)', 40, false, NULL, '{}'::jsonb),
  ('enrich.overpass',          'enrichment', 'Overpass API', 'Tags OSM del POI y POIs cercanos', 50, false, NULL, '{}'::jsonb),
  ('enrich.geonames',          'enrichment', 'GeoNames', 'Toponimia cercana (requiere usuario)', 60, true, 'GEONAMES_USERNAME', '{}'::jsonb),
  ('enrich.openverse',         'enrichment', 'Openverse', 'Imágenes Creative Commons libres', 70, false, NULL, '{}'::jsonb),
  -- SCRAPERS
  ('scraper.atlas_obscura',    'scraper', 'Atlas Obscura', 'Scraper de listings /things-to-do/{slug}/places', 10, false, NULL, '{}'::jsonb),
  ('scraper.web_import',       'scraper', 'Web Import genérico', 'Scraper de páginas con JSON-LD', 20, false, NULL, '{}'::jsonb)
ON CONFLICT (code) DO NOTHING;