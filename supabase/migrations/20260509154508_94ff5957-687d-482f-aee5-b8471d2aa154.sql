-- ============================================================
-- FASE 1: Galicia + España como caso canónico
-- ============================================================

INSERT INTO public.place_types (code, name, category, sort_order, sort_admin_level, is_active)
VALUES ('province', 'Provincia', 'administrative', 35, 4, true)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, category = EXCLUDED.category, sort_admin_level = 4, is_active = true;

UPDATE public.place_types SET sort_admin_level = 5 WHERE code = 'zone';
UPDATE public.place_types SET sort_admin_level = 6 WHERE code = 'admin_level_3';
UPDATE public.place_types SET sort_admin_level = 7 WHERE code = 'locality';
UPDATE public.place_types SET sort_admin_level = 8 WHERE code = 'sublocality';

DO $$
DECLARE
  spain_id  uuid := '3208c966-e90c-4be7-a783-91f64d8e3281';
  espana_id uuid := '7b23ad3d-4d5c-4739-9db8-9622aa3361c0';
BEGIN
  UPDATE public.admin_areas
  SET aliases = ARRAY(SELECT DISTINCT unnest(aliases || ARRAY['España','Espana','Espagne','Espanha','ES','ESP','Spain','Reino de España'])),
      name_translations = COALESCE(name_translations, '{}'::jsonb)
        || jsonb_build_object('es','España','en','Spain','fr','Espagne','pt','Espanha','gl','España','ca','Espanya'),
      iso_code_alpha3 = COALESCE(iso_code_alpha3, 'ESP')
  WHERE id = spain_id;
  IF EXISTS (SELECT 1 FROM public.admin_areas WHERE id = espana_id) THEN
    PERFORM public._merge_admin_area(espana_id, spain_id);
  END IF;
END $$;

CREATE TEMP TABLE _gal_comarca_map (lname text PRIMARY KEY, iso text NOT NULL) ON COMMIT DROP;
INSERT INTO _gal_comarca_map(lname, iso) VALUES
  ('a barbanza','ES-C'),('a barcala','ES-C'),('a coruña','ES-C'),('arzúa','ES-C'),
  ('barbanza','ES-C'),('barcala','ES-C'),('bergantiños','ES-C'),('betanzos','ES-C'),
  ('eume','ES-C'),('o eume','ES-C'),('ferrol','ES-C'),('fisterra','ES-C'),
  ('muros','ES-C'),('noia','ES-C'),('o sar','ES-C'),('ordes','ES-C'),
  ('ortegal','ES-C'),('santiago','ES-C'),('terra de melide','ES-C'),
  ('terra de soneira','ES-C'),('tierra de soneira','ES-C'),('soneira','ES-C'),('xallas','ES-C'),
  ('a fonsagrada','ES-LU'),('fonsagrada','ES-LU'),
  ('a mariña central','ES-LU'),('mariña central','ES-LU'),
  ('a mariña occidental','ES-LU'),('mariña occidental','ES-LU'),
  ('a mariña oriental','ES-LU'),('mariña oriental','ES-LU'),
  ('a ulloa','ES-LU'),('ulloa','ES-LU'),
  ('chantada','ES-LU'),('meira','ES-LU'),
  ('os ancares','ES-LU'),('ancares','ES-LU'),
  ('quiroga','ES-LU'),('sarria','ES-LU'),
  ('terra chá','ES-LU'),('terra de lemos','ES-LU'),('tierra de lemos','ES-LU'),
  ('a baixa limia','ES-OR'),('baixa limia','ES-OR'),
  ('a limia','ES-OR'),('limia','ES-OR'),('allariz-maceda','ES-OR'),
  ('o carballiño','ES-OR'),('carballiño','ES-OR'),
  ('o ribeiro','ES-OR'),('ribeiro','ES-OR'),
  ('terra de caldelas','ES-OR'),
  ('terra de celanova','ES-OR'),('terra da celanova','ES-OR'),('tierra de celanova','ES-OR'),
  ('terra de trives','ES-OR'),('trives','ES-OR'),
  ('valdeorras','ES-OR'),('verín','ES-OR'),('viana','ES-OR'),
  ('a paradanta','ES-PO'),('paradanta','ES-PO'),
  ('caldas','ES-PO'),('deza','ES-PO'),
  ('o baixo miño','ES-PO'),('baixo miño','ES-PO'),('bajo miño','ES-PO'),
  ('o condado','ES-PO'),('condado','ES-PO'),
  ('o morrazo','ES-PO'),('morrazo','ES-PO'),
  ('o salnés','ES-PO'),('salnés','ES-PO'),
  ('tabeirós - terra de montes','ES-PO'),('tabeirós - tierra de montes','ES-PO'),
  ('tabeirós','ES-PO'),('vigo','ES-PO');

DO $$
DECLARE
  galicia_id    uuid := 'd63a8709-3dbd-44de-9191-d7b3dd17fadf';
  province_type uuid;
  comarca_type  uuid;
  prov record;
  existing_id uuid;
  canonical_id uuid;
  prov_a_coruna uuid; prov_lugo uuid; prov_ourense uuid; prov_ponteved uuid;
  rec record;
  target_prov uuid;
  twin uuid;
  placeholder_id uuid;
  child_rec record;
  fallback_prov uuid;
BEGIN
  SELECT id INTO province_type FROM public.place_types WHERE code='province';
  SELECT id INTO comarca_type  FROM public.place_types WHERE code='admin_level_3';

  FOR prov IN
    SELECT * FROM (VALUES
      ('A Coruña','ES-C', 43.3713::float8, -8.3958::float8,
        ARRAY['A Coruña','La Coruña','Coruña','Coruña, A','Corunha','Corunna','Provincia da Coruña','Provincia de La Coruña']),
      ('Lugo','ES-LU', 43.0097::float8, -7.5567::float8, ARRAY['Lugo','Provincia de Lugo']),
      ('Ourense','ES-OR', 42.3358::float8, -7.8639::float8, ARRAY['Ourense','Orense','Provincia de Ourense','Provincia de Orense']),
      ('Pontevedra','ES-PO', 42.4310::float8, -8.6444::float8, ARRAY['Pontevedra','Provincia de Pontevedra'])
    ) AS t(name, iso, lat, lng, aliases)
  LOOP
    SELECT id INTO existing_id
    FROM public.admin_areas
    WHERE parent_id = galicia_id
      AND (
        iso_code = prov.iso
        OR lower(name) = lower(prov.name)
        OR lower(name) = ANY (ARRAY(SELECT lower(unnest(prov.aliases))))
      )
    ORDER BY (iso_code = prov.iso) DESC, (type_id = province_type) DESC
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
      UPDATE public.admin_areas
      SET name = prov.name,
          type_id = province_type,
          iso_code = prov.iso,
          aliases = ARRAY(SELECT DISTINCT unnest(aliases || prov.aliases)),
          centroid_lat = COALESCE(centroid_lat, prov.lat),
          centroid_lng = COALESCE(centroid_lng, prov.lng),
          source = COALESCE(source, 'iso-3166-2'),
          confidence = GREATEST(COALESCE(confidence,0), 100)
      WHERE id = existing_id;
      canonical_id := existing_id;
    ELSE
      INSERT INTO public.admin_areas (
        type_id, name, parent_id, iso_code, aliases,
        centroid_lat, centroid_lng, source, confidence
      ) VALUES (
        province_type, prov.name, galicia_id, prov.iso, prov.aliases,
        prov.lat, prov.lng, 'iso-3166-2', 100
      )
      RETURNING id INTO canonical_id;
    END IF;

    PERFORM public._merge_admin_area(other_id, canonical_id)
    FROM (
      SELECT id AS other_id FROM public.admin_areas
      WHERE parent_id = galicia_id
        AND id <> canonical_id
        AND (lower(name) = lower(prov.name)
             OR lower(name) = ANY (ARRAY(SELECT lower(unnest(prov.aliases)))))
    ) sub;
  END LOOP;

  SELECT id INTO prov_a_coruna FROM public.admin_areas WHERE parent_id = galicia_id AND iso_code='ES-C';
  SELECT id INTO prov_lugo     FROM public.admin_areas WHERE parent_id = galicia_id AND iso_code='ES-LU';
  SELECT id INTO prov_ourense  FROM public.admin_areas WHERE parent_id = galicia_id AND iso_code='ES-OR';
  SELECT id INTO prov_ponteved FROM public.admin_areas WHERE parent_id = galicia_id AND iso_code='ES-PO';
  fallback_prov := prov_a_coruna;

  -- Re-parent placeholder children to A Coruña fallback (so we can drop the placeholder)
  SELECT id INTO placeholder_id FROM public.admin_areas
   WHERE parent_id = galicia_id AND name = '(sin provincia)' LIMIT 1;
  IF placeholder_id IS NOT NULL THEN
    FOR child_rec IN SELECT id FROM public.admin_areas WHERE parent_id = placeholder_id LOOP
      UPDATE public.admin_areas SET parent_id = galicia_id WHERE id = child_rec.id;
    END LOOP;
  END IF;

  FOR rec IN
    SELECT id, name FROM public.admin_areas
    WHERE parent_id = galicia_id
      AND id NOT IN (prov_a_coruna, prov_lugo, prov_ourense, prov_ponteved)
      AND name <> '(sin provincia)'
  LOOP
    SELECT CASE m.iso
             WHEN 'ES-C'  THEN prov_a_coruna
             WHEN 'ES-LU' THEN prov_lugo
             WHEN 'ES-OR' THEN prov_ourense
             WHEN 'ES-PO' THEN prov_ponteved
           END
      INTO target_prov
    FROM _gal_comarca_map m WHERE m.lname = lower(rec.name);

    IF target_prov IS NULL THEN
      SELECT p.id INTO target_prov
      FROM public.admin_areas p
      WHERE p.id IN (prov_a_coruna, prov_lugo, prov_ourense, prov_ponteved)
      ORDER BY (
        SELECT COALESCE(AVG(
          2 * 6371 * asin(sqrt(
            sin(radians(l.latitude - p.centroid_lat) / 2) ^ 2 +
            cos(radians(p.centroid_lat)) * cos(radians(l.latitude)) *
            sin(radians(l.longitude - p.centroid_lng) / 2) ^ 2
          ))
        ), 9999)
        FROM public.locations l
        WHERE l.zone_id = rec.id AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL
      ) ASC
      LIMIT 1;
    END IF;

    target_prov := COALESCE(target_prov, fallback_prov);

    SELECT id INTO twin
    FROM public.admin_areas
    WHERE parent_id = target_prov AND lower(name) = lower(rec.name) AND id <> rec.id
    LIMIT 1;

    IF twin IS NOT NULL THEN
      PERFORM public._merge_admin_area(rec.id, twin);
    ELSE
      UPDATE public.admin_areas
      SET parent_id = target_prov, type_id = comarca_type
      WHERE id = rec.id;
    END IF;
  END LOOP;

  -- Try to drop placeholder now (will succeed if no orphans / no locations reference it)
  IF placeholder_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.admin_areas WHERE parent_id = placeholder_id)
     AND NOT EXISTS (SELECT 1 FROM public.locations WHERE zone_id = placeholder_id) THEN
    DELETE FROM public.admin_areas WHERE id = placeholder_id;
  END IF;
END $$;

UPDATE public.locations l
SET admin3_id = l.zone_id, zone_id = a.parent_id
FROM public.admin_areas a, public.place_types pt
WHERE l.zone_id = a.id AND a.type_id = pt.id AND pt.code = 'admin_level_3'
  AND l.deleted_at IS NULL;

SELECT public._collapse_admin_duplicates('d63a8709-3dbd-44de-9191-d7b3dd17fadf');
SELECT public._collapse_admin_duplicates(p.id)
FROM public.admin_areas p WHERE p.parent_id = 'd63a8709-3dbd-44de-9191-d7b3dd17fadf';

SELECT public.refresh_locations_admin_cache();
