
ALTER TABLE public.place_types DROP CONSTRAINT IF EXISTS place_types_category_check;
ALTER TABLE public.place_types ADD CONSTRAINT place_types_category_check
  CHECK (category = ANY (ARRAY['natural','administrative','urban','building','poi','business','transport','unknown']));

INSERT INTO public.place_types (code, name, category, sort_admin_level, sort_order, is_active) VALUES
  ('province',     'Provincia',           'administrative', 3, 4,   true),
  ('municipality', 'Municipio',           'administrative', 4, 5,   true),
  ('village',      'Pueblo',              'administrative', 5, 6,   true),
  ('hamlet',       'Aldea',               'administrative', 5, 7,   true),
  ('road',         'Carretera',           'transport',      7, 25,  true),
  ('airport',      'Aeropuerto',          'transport',      7, 26,  true),
  ('station',      'Estación',            'transport',      7, 27,  true),
  ('poi',          'Punto de interés',    'poi',            7, 40,  true),
  ('unclassified', 'Sin clasificar',      'unknown',        7, 100, true)
ON CONFLICT (code) DO NOTHING;

-- Helper: reclasifica un nodo a (new_type, new_parent), fusionando si ya existe colisión
CREATE OR REPLACE FUNCTION public._reclassify_admin_area(_node_id uuid, _new_type uuid, _new_parent uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  twin uuid;
  node_name text;
BEGIN
  SELECT name INTO node_name FROM public.admin_areas WHERE id = _node_id;
  IF node_name IS NULL THEN RETURN; END IF;

  SELECT id INTO twin
  FROM public.admin_areas
  WHERE type_id = _new_type
    AND COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(_new_parent, '00000000-0000-0000-0000-000000000000'::uuid)
    AND lower(name) = lower(node_name)
    AND id <> _node_id
  LIMIT 1;

  IF twin IS NOT NULL THEN
    PERFORM public._merge_admin_area(_node_id, twin);
  ELSE
    UPDATE public.admin_areas
    SET type_id = _new_type, parent_id = _new_parent
    WHERE id = _node_id;
  END IF;
END $$;

-- FASE 2A: Dedup países
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.id AS canonical, o.id AS orphan
    FROM public.admin_areas c
    JOIN public.place_types pt ON pt.id = c.type_id AND pt.code = 'country'
    JOIN public.admin_areas o ON o.type_id = c.type_id
                              AND o.id <> c.id
                              AND o.iso_code IS NULL
                              AND (
                                lower(o.name) = lower(c.name)
                                OR lower(o.name) = ANY(SELECT lower(unnest(c.aliases)))
                              )
    WHERE c.iso_code IS NOT NULL
  LOOP
    PERFORM public._merge_admin_area(r.orphan, r.canonical);
  END LOOP;
END $$;

-- FASE 2B: Dedup regiones por nombre
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.id AS canonical, o.id AS orphan
    FROM public.admin_areas c
    JOIN public.place_types pt ON pt.id = c.type_id AND pt.code = 'region'
    JOIN public.admin_areas o ON o.type_id = c.type_id
                              AND o.id <> c.id
                              AND o.iso_code IS NULL
                              AND lower(o.name) = lower(c.name)
    WHERE c.iso_code IS NOT NULL
  LOOP
    PERFORM public._merge_admin_area(r.orphan, r.canonical);
  END LOOP;
END $$;

-- FASE 2C: Reclasificar provincias ES de region->zone bajo su CCAA
DO $$
DECLARE
  zone_type uuid;
  region_type uuid;
  rec RECORD;
  parent_region_id uuid;
  twin_id uuid;
  node RECORD;
BEGIN
  SELECT id INTO zone_type   FROM public.place_types WHERE code='zone';
  SELECT id INTO region_type FROM public.place_types WHERE code='region';

  FOR rec IN
    SELECT * FROM (VALUES
      ('ES-C','ES-GA'),('ES-LU','ES-GA'),('ES-OR','ES-GA'),('ES-PO','ES-GA'),
      ('ES-O','ES-AS'),('ES-S','ES-CB'),('ES-M','ES-MD'),('ES-MU','ES-MC'),
      ('ES-NA','ES-NC'),('ES-LO','ES-RI'),('ES-PM','ES-IB'),
      ('ES-VI','ES-PV'),('ES-SS','ES-PV'),('ES-BI','ES-PV'),
      ('ES-B','ES-CT'),('ES-GI','ES-CT'),('ES-L','ES-CT'),('ES-T','ES-CT'),
      ('ES-HU','ES-AR'),('ES-TE','ES-AR'),('ES-Z','ES-AR'),
      ('ES-AV','ES-CL'),('ES-BU','ES-CL'),('ES-LE','ES-CL'),('ES-P','ES-CL'),
      ('ES-SA','ES-CL'),('ES-SG','ES-CL'),('ES-SO','ES-CL'),('ES-VA','ES-CL'),('ES-ZA','ES-CL'),
      ('ES-AB','ES-CM'),('ES-CR','ES-CM'),('ES-CU','ES-CM'),('ES-GU','ES-CM'),('ES-TO','ES-CM'),
      ('ES-A','ES-VC'),('ES-CS','ES-VC'),('ES-V','ES-VC'),
      ('ES-AL','ES-AN'),('ES-CA','ES-AN'),('ES-CO','ES-AN'),('ES-GR','ES-AN'),
      ('ES-H','ES-AN'),('ES-J','ES-AN'),('ES-MA','ES-AN'),('ES-SE','ES-AN'),
      ('ES-BA','ES-EX'),('ES-CC','ES-EX'),
      ('ES-GC','ES-CN'),('ES-TF','ES-CN')
    ) AS t(prov_iso, region_iso)
  LOOP
    SELECT id INTO parent_region_id
    FROM public.admin_areas
    WHERE type_id = region_type AND iso_code = rec.region_iso
    LIMIT 1;
    IF parent_region_id IS NULL THEN CONTINUE; END IF;

    SELECT id INTO twin_id
    FROM public.admin_areas
    WHERE type_id = zone_type AND iso_code = rec.prov_iso
    LIMIT 1;

    -- Si ya hay un zone con ese ISO, fusiona TODAS las regions con el mismo ISO en él
    IF twin_id IS NOT NULL THEN
      FOR node IN
        SELECT id FROM public.admin_areas
        WHERE type_id = region_type AND iso_code = rec.prov_iso AND id <> twin_id
      LOOP
        PERFORM public._merge_admin_area(node.id, twin_id);
      END LOOP;
    ELSE
      -- Reclasificar uno a uno con manejo de colisión por nombre
      FOR node IN
        SELECT id FROM public.admin_areas
        WHERE type_id = region_type AND iso_code = rec.prov_iso
      LOOP
        PERFORM public._reclassify_admin_area(node.id, zone_type, parent_region_id);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- FASE 2D: Reparentar comarcas gallegas
DO $$
DECLARE
  zone_type uuid;
  admin3_type uuid;
  galicia_id uuid;
  rec RECORD;
  prov_id uuid;
  node RECORD;
BEGIN
  SELECT id INTO zone_type    FROM public.place_types WHERE code='zone';
  SELECT id INTO admin3_type  FROM public.place_types WHERE code='admin_level_3';
  SELECT id INTO galicia_id   FROM public.admin_areas WHERE type_id=(SELECT id FROM public.place_types WHERE code='region') AND iso_code='ES-GA' LIMIT 1;

  IF galicia_id IS NULL THEN RETURN; END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('Bergantiños','ES-C'),('Betanzos','ES-C'),('Barcala','ES-C'),('Eume','ES-C'),
      ('Ferrol','ES-C'),('Fisterra','ES-C'),('Muros','ES-C'),('Noia','ES-C'),
      ('Ortegal','ES-C'),('Santiago','ES-C'),('A Coruña','ES-C'),('La Coruña','ES-C'),
      ('Sar','ES-C'),('Terra de Soneira','ES-C'),('Xallas','ES-C'),('Arzúa','ES-C'),
      ('Terra de Melide','ES-C'),('Ordes','ES-C'),('A Barcala','ES-C'),
      ('Mariña Occidental','ES-LU'),('Mariña Central','ES-LU'),('Mariña Oriental','ES-LU'),
      ('Lugo','ES-LU'),('Terra Chá','ES-LU'),('Terra Cha','ES-LU'),
      ('Os Ancares','ES-LU'),('A Ulloa','ES-LU'),('Sarria','ES-LU'),
      ('Quiroga','ES-LU'),('Terra de Lemos','ES-LU'),('Tierra de Lemos','ES-LU'),
      ('A Fonsagrada','ES-LU'),('Chantada','ES-LU'),('Meira','ES-LU'),
      ('Terra de Caldelas','ES-LU'),
      ('Allariz-Maceda','ES-OR'),('Baixa Limia','ES-OR'),('Bajo Miño','ES-OR'),
      ('O Carballiño','ES-OR'),('Ourense','ES-OR'),('Ribeiro','ES-OR'),
      ('Valdeorras','ES-OR'),('Verín','ES-OR'),('Viana','ES-OR'),
      ('Terra de Trives','ES-OR'),('Terra de Celanova','ES-OR'),('A Limia','ES-OR'),
      ('Vigo','ES-PO'),('Pontevedra','ES-PO'),('O Salnés','ES-PO'),('Morrazo','ES-PO'),
      ('Caldas','ES-PO'),('Deza','ES-PO'),('Tabeirós-Terra de Montes','ES-PO'),
      ('Paradanta','ES-PO'),('A Paradanta','ES-PO'),('Condado','ES-PO'),
      ('O Condado','ES-PO'),('Barbanza','ES-PO')
    ) AS t(comarca_name, prov_iso)
  LOOP
    SELECT id INTO prov_id
    FROM public.admin_areas
    WHERE type_id = zone_type AND iso_code = rec.prov_iso
    LIMIT 1;
    IF prov_id IS NULL THEN CONTINUE; END IF;

    FOR node IN
      SELECT id FROM public.admin_areas
      WHERE type_id = zone_type
        AND parent_id = galicia_id
        AND lower(name) = lower(rec.comarca_name)
    LOOP
      PERFORM public._reclassify_admin_area(node.id, admin3_type, prov_id);
    END LOOP;
  END LOOP;
END $$;
