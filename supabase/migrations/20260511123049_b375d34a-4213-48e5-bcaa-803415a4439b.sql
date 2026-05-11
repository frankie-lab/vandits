
-- Village catalogs cache table + 16 data_sources rows (search kind)

CREATE TABLE IF NOT EXISTS public.village_catalog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_code text NOT NULL,
  name text NOT NULL,
  name_canonical text NOT NULL,
  country_code text,
  latitude double precision,
  longitude double precision,
  image_url text,
  source_url text NOT NULL,
  description text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_code, source_url)
);

CREATE INDEX IF NOT EXISTS idx_vce_catalog_code ON public.village_catalog_entries (catalog_code);
CREATE INDEX IF NOT EXISTS idx_vce_country_code ON public.village_catalog_entries (country_code);
CREATE INDEX IF NOT EXISTS idx_vce_name_canonical ON public.village_catalog_entries (name_canonical);
CREATE INDEX IF NOT EXISTS idx_vce_refreshed ON public.village_catalog_entries (catalog_code, last_refreshed_at);

ALTER TABLE public.village_catalog_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read village catalog entries" ON public.village_catalog_entries;
CREATE POLICY "Authenticated can read village catalog entries"
  ON public.village_catalog_entries FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Masters manage village catalog entries" ON public.village_catalog_entries;
CREATE POLICY "Masters manage village catalog entries"
  ON public.village_catalog_entries FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master'::app_role));

-- Seed 16 data_sources rows for the village catalogs
INSERT INTO public.data_sources (code, kind, name, description, enabled, priority, config)
VALUES
  ('search.village.es',       'search', 'Pueblos más bonitos de España',      'Catálogo certificado de pueblos en España (fallback).',         true, 90, '{"country_codes":["ES"],"base_url":"https://lospueblosmasbonitosdeespana.org"}'::jsonb),
  ('search.village.fr',       'search', 'Plus Beaux Villages de France',      'Catálogo certificado de pueblos en Francia (fallback).',        true, 91, '{"country_codes":["FR"],"base_url":"https://www.les-plus-beaux-villages-de-france.org"}'::jsonb),
  ('search.village.it',       'search', 'Borghi più belli d''Italia',         'Catálogo certificado de pueblos en Italia (fallback).',         true, 92, '{"country_codes":["IT"],"base_url":"https://borghipiubelliditalia.it"}'::jsonb),
  ('search.village.be',       'search', 'Plus Beaux Villages de Wallonie',    'Catálogo de pueblos en Valonia, Bélgica (fallback).',           true, 93, '{"country_codes":["BE"],"base_url":"https://beauxvillages.be"}'::jsonb),
  ('search.village.ch',       'search', 'Schönsten Schweizer Dörfer',         'Catálogo de pueblos en Suiza (fallback).',                      true, 94, '{"country_codes":["CH"],"base_url":"https://www.dieschoenstenschweizerdoerfer.ch"}'::jsonb),
  ('search.village.pt_ah',    'search', 'Aldeias Históricas de Portugal',     'Aldeas históricas en Portugal (fallback).',                     true, 95, '{"country_codes":["PT"],"base_url":"https://aldeiashistoricasdeportugal.com"}'::jsonb),
  ('search.village.pt_ax',    'search', 'Aldeias do Xisto',                   'Red de aldeas del esquisto en Portugal central (fallback).',    true, 96, '{"country_codes":["PT"],"base_url":"https://aldeiasdoxisto.pt"}'::jsonb),
  ('search.village.de_sx',    'search', 'Schönsten Dörfer Sachsens',          'Pueblos más bonitos de Sajonia, Alemania (fallback).',          true, 97, '{"country_codes":["DE"],"base_url":"https://www.sachsensdoerfer.de"}'::jsonb),
  ('search.village.uk',       'search', 'Cotswolds Villages',                 'Portal turístico de pueblos en Cotswolds, Reino Unido.',        true, 98, '{"country_codes":["GB"],"base_url":"https://www.cotswolds.com"}'::jsonb),
  ('search.village.gr',       'search', 'Visit Greece — Traditional Villages','Pueblos tradicionales en Grecia (fallback).',                   true, 99, '{"country_codes":["GR"],"base_url":"https://www.visitgreece.gr"}'::jsonb),
  ('search.village.nl',       'search', 'Holland — Mooiste Dorpen',           'Pueblos turísticos en Países Bajos (fallback).',                true,100, '{"country_codes":["NL"],"base_url":"https://www.holland.com"}'::jsonb),
  ('search.village.ca_qc',    'search', 'Plus Beaux Villages du Québec',      'Catálogo de pueblos en Quebec, Canadá (fallback).',             true,101, '{"country_codes":["CA"],"base_url":"https://www.beauxvillages.qc.ca"}'::jsonb),
  ('search.village.jp',       'search', 'Most Beautiful Villages in Japan',   'Catálogo certificado de pueblos en Japón (fallback).',          true,102, '{"country_codes":["JP"],"base_url":"https://utsukushii-mura.jp"}'::jsonb),
  ('search.village.cn',       'search', 'Most Beautiful Villages in China',   'Catálogo de pueblos en China (fallback).',                      true,103, '{"country_codes":["CN"],"base_url":"https://www.zhongguomeilixiangcun.com"}'::jsonb),
  ('search.village.lb',       'search', 'Most Beautiful Villages of Lebanon', 'Catálogo de pueblos en Líbano (fallback).',                     true,104, '{"country_codes":["LB"],"base_url":"https://www.villagesduliban.com"}'::jsonb),
  ('search.village.global',   'search', 'Most Beautiful Villages in the World','Federación internacional LPBVT (fallback global).',            true,105, '{"country_codes":["*"],"base_url":"https://lpbvt.org"}'::jsonb)
ON CONFLICT (code) DO NOTHING;
