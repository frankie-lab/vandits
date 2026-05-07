
ALTER TABLE public.admin_areas
  ADD COLUMN IF NOT EXISTS iso_code text,
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS admin_areas_type_iso_unique
  ON public.admin_areas (type_id, iso_code) WHERE iso_code IS NOT NULL;

-- Continentes canonical
UPDATE public.admin_areas SET iso_code='EU', aliases=ARRAY['Europe','Europa']            WHERE id='a988689f-a36d-43e4-90b0-79d6647a8b2e';
UPDATE public.admin_areas SET iso_code='AF', aliases=ARRAY['Africa','África']            WHERE id='1c349036-6904-4747-9f83-a3354a176740';
UPDATE public.admin_areas SET iso_code='AS', aliases=ARRAY['Asia']                       WHERE id='3359210b-3571-4eb1-9a7b-435ad8732b58';
UPDATE public.admin_areas SET iso_code='NA', aliases=ARRAY['North America','América del Norte'] WHERE id='55c01d89-243a-4c2c-87c6-0671ddf02cc2';
UPDATE public.admin_areas SET iso_code='SA', aliases=ARRAY['South America','América del Sur']   WHERE id='9eac3fe6-034d-4634-952d-2fb01625899f';
UPDATE public.admin_areas SET iso_code='OC', aliases=ARRAY['Oceania','Oceanía']          WHERE id='3a48ed2d-c3fa-407a-b650-2f3a2b74f22a';

-- Función recursiva: fusiona orphan dentro de canonical
CREATE OR REPLACE FUNCTION public._merge_admin_area(orphan_id uuid, canonical_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  child record;
  sibling_id uuid;
BEGIN
  IF orphan_id = canonical_id THEN RETURN; END IF;

  UPDATE public.locations SET continent_id  = canonical_id WHERE continent_id  = orphan_id;
  UPDATE public.locations SET country_id    = canonical_id WHERE country_id    = orphan_id;
  UPDATE public.locations SET region_id     = canonical_id WHERE region_id     = orphan_id;
  UPDATE public.locations SET zone_id       = canonical_id WHERE zone_id       = orphan_id;
  UPDATE public.locations SET admin3_id     = canonical_id WHERE admin3_id     = orphan_id;
  UPDATE public.locations SET locality_id   = canonical_id WHERE locality_id   = orphan_id;
  UPDATE public.locations SET sublocality_id= canonical_id WHERE sublocality_id= orphan_id;

  UPDATE public.locations l SET continent_id = (SELECT path[1] FROM public.admin_areas WHERE id = l.country_id)
    WHERE l.country_id = canonical_id AND l.continent_id IS NULL;

  FOR child IN SELECT id, name, type_id FROM public.admin_areas WHERE parent_id = orphan_id LOOP
    SELECT s.id INTO sibling_id FROM public.admin_areas s
      WHERE s.parent_id = canonical_id AND s.type_id = child.type_id AND lower(s.name) = lower(child.name) LIMIT 1;
    IF sibling_id IS NOT NULL THEN
      PERFORM public._merge_admin_area(child.id, sibling_id);
    ELSE
      UPDATE public.admin_areas SET parent_id = canonical_id WHERE id = child.id;
    END IF;
  END LOOP;

  DELETE FROM public.admin_areas WHERE id = orphan_id;
END$$;

-- Fusión continentes duplicados PRIMERO (esto elimina los dobles Portugal/etc bajo Europa)
SELECT public._merge_admin_area('5b854499-6083-48fe-a15e-199af0766efe'::uuid, 'a988689f-a36d-43e4-90b0-79d6647a8b2e'::uuid);
SELECT public._merge_admin_area('85f18ac6-357c-4bc2-96d1-e827e0fb3ca0'::uuid, '1c349036-6904-4747-9f83-a3354a176740'::uuid);

-- AHORA marcar países canonical (ya no hay duplicados bajo Europe/Africa)
WITH country_type AS (SELECT id FROM public.place_types WHERE code='country' LIMIT 1)
UPDATE public.admin_areas a SET iso_code=m.iso, aliases=ARRAY[m.iso, m.fullname]
FROM (VALUES
  ('Portugal','PT'),('France','FR'),('Spain','ES'),
  ('United Kingdom','GB'),('United States','US'),('Italy','IT'),
  ('Germany','DE'),('Mali','ML'),('Hong Kong','HK'),
  ('Singapore','SG'),('Sweden','SE'),('Tajikistan','TJ'),
  ('Nigeria','NG'),('French Guiana','GF')
) AS m(fullname, iso)
WHERE a.type_id=(SELECT id FROM country_type) AND a.parent_id IS NOT NULL
  AND lower(a.name)=lower(m.fullname);

-- Fusión países huérfanos contra canonical
DO $$
DECLARE
  country_type_id uuid;
  rec record;
  canonical_id uuid;
  fused int := 0;
BEGIN
  SELECT id INTO country_type_id FROM public.place_types WHERE code='country' LIMIT 1;
  FOR rec IN
    SELECT a.id, a.name FROM public.admin_areas a
    WHERE a.type_id = country_type_id AND a.parent_id IS NULL
  LOOP
    SELECT c.id INTO canonical_id FROM public.admin_areas c
    WHERE c.type_id = country_type_id AND c.parent_id IS NOT NULL
      AND (c.iso_code = rec.name OR EXISTS (SELECT 1 FROM unnest(c.aliases) al WHERE lower(al)=lower(rec.name)))
    LIMIT 1;
    IF canonical_id IS NOT NULL AND canonical_id <> rec.id THEN
      PERFORM public._merge_admin_area(rec.id, canonical_id);
      fused := fused + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Países huérfanos fusionados: %', fused;
END$$;

DROP FUNCTION public._merge_admin_area(uuid, uuid);
