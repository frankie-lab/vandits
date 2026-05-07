
CREATE OR REPLACE FUNCTION public._seed_canonical_region(
  _country_iso text, _region_iso text, _name text, _aliases text[]
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  _country_id uuid; _type_region uuid; _canonical_id uuid;
  _orphan record; _all_aliases text[];
BEGIN
  SELECT id INTO _country_id FROM public.admin_areas WHERE iso_code = _country_iso LIMIT 1;
  IF _country_id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO _type_region FROM public.place_types WHERE code = 'region' LIMIT 1;

  _all_aliases := ARRAY(
    SELECT DISTINCT lower(trim(a))
    FROM unnest(_aliases || ARRAY[_name, _region_iso]) a
    WHERE a IS NOT NULL AND trim(a) <> ''
  );

  SELECT id INTO _canonical_id FROM public.admin_areas
  WHERE iso_code = _region_iso AND type_id = _type_region LIMIT 1;

  IF _canonical_id IS NULL THEN
    SELECT id INTO _canonical_id FROM public.admin_areas
    WHERE type_id = _type_region AND parent_id = _country_id AND lower(name) = lower(_name) LIMIT 1;
    IF _canonical_id IS NOT NULL THEN
      UPDATE public.admin_areas
      SET iso_code = _region_iso, aliases = _all_aliases, name = _name
      WHERE id = _canonical_id;
    END IF;
  ELSE
    UPDATE public.admin_areas
    SET aliases = ARRAY(SELECT DISTINCT unnest(aliases || _all_aliases)),
        name = _name, parent_id = _country_id
    WHERE id = _canonical_id;
  END IF;

  IF _canonical_id IS NULL THEN
    INSERT INTO public.admin_areas (type_id, name, parent_id, iso_code, aliases)
    VALUES (_type_region, _name, _country_id, _region_iso, _all_aliases)
    RETURNING id INTO _canonical_id;
  END IF;

  FOR _orphan IN
    SELECT id, name FROM public.admin_areas
    WHERE type_id = _type_region AND parent_id = _country_id
      AND id <> _canonical_id AND lower(name) = ANY(_all_aliases)
  LOOP
    PERFORM public._merge_admin_area(_orphan.id, _canonical_id);
  END LOOP;

  RETURN _canonical_id;
END;
$$;

-- ESPAÑA
SELECT public._seed_canonical_region('ES','ES-AN','Andalucía', ARRAY['Andalusia','Andalucia']);
SELECT public._seed_canonical_region('ES','ES-AR','Aragón', ARRAY['Aragon','Aragón']);
SELECT public._seed_canonical_region('ES','ES-AS','Principado de Asturias', ARRAY['Asturias','Principality of Asturias']);
SELECT public._seed_canonical_region('ES','ES-CB','Cantabria', ARRAY['Cantabria']);
SELECT public._seed_canonical_region('ES','ES-CL','Castilla y León', ARRAY['Castile and León','Castile and Leon','Castilla y Leon','Castilla León']);
SELECT public._seed_canonical_region('ES','ES-CM','Castilla-La Mancha', ARRAY['Castile-La Mancha','Castilla La Mancha','Castile La Mancha']);
SELECT public._seed_canonical_region('ES','ES-CN','Canarias', ARRAY['Canary Islands','Islas Canarias','Canaries']);
SELECT public._seed_canonical_region('ES','ES-CT','Cataluña', ARRAY['Catalonia','Catalunya','Catalogne']);
SELECT public._seed_canonical_region('ES','ES-EX','Extremadura', ARRAY['Extremadura']);
SELECT public._seed_canonical_region('ES','ES-GA','Galicia', ARRAY['Galicia','Galiza']);
SELECT public._seed_canonical_region('ES','ES-IB','Illes Balears', ARRAY['Balearic Islands','Islas Baleares','Baleares']);
SELECT public._seed_canonical_region('ES','ES-MD','Comunidad de Madrid', ARRAY['Community of Madrid','Comunidad Madrid','Madrid']);
SELECT public._seed_canonical_region('ES','ES-MC','Región de Murcia', ARRAY['Region of Murcia','Murcia','Region de Murcia']);
SELECT public._seed_canonical_region('ES','ES-NC','Navarra', ARRAY['Navarre','Comunidad Foral de Navarra','Nafarroa']);
SELECT public._seed_canonical_region('ES','ES-PV','País Vasco', ARRAY['Basque Country','Euskadi','Pais Vasco','Autonomous Community of the Basque Country']);
SELECT public._seed_canonical_region('ES','ES-RI','La Rioja', ARRAY['Rioja','La Rioja']);
SELECT public._seed_canonical_region('ES','ES-VC','Comunidad Valenciana', ARRAY['Valencian Community','Comunitat Valenciana','Valencia']);
SELECT public._seed_canonical_region('ES','ES-CE','Ceuta', ARRAY['Ceuta']);
SELECT public._seed_canonical_region('ES','ES-ML','Melilla', ARRAY['Melilla']);

-- FRANCIA
SELECT public._seed_canonical_region('FR','FR-ARA','Auvergne-Rhône-Alpes', ARRAY['Auvergne','Rhone-Alpes','Rhône-Alpes','Auvergne Rhône-Alpes','Auvergne-Rhone-Alpes']);
SELECT public._seed_canonical_region('FR','FR-BFC','Bourgogne-Franche-Comté', ARRAY['Bourgogne','Franche-Comté','Franche-Comte','Burgundy','Burgandy','Bourgogne Franche-Comté','Bourgogne – Franche-Comté']);
SELECT public._seed_canonical_region('FR','FR-BRE','Bretagne', ARRAY['Brittany','Bretaña']);
SELECT public._seed_canonical_region('FR','FR-CVL','Centre-Val de Loire', ARRAY['Centre','Centre Val de Loire']);
SELECT public._seed_canonical_region('FR','FR-COR','Corse', ARRAY['Corsica','Córcega']);
SELECT public._seed_canonical_region('FR','FR-GES','Grand Est', ARRAY['Alsace','Lorraine','Champagne-Ardenne','Alsace-Champagne-Ardenne-Lorraine']);
SELECT public._seed_canonical_region('FR','FR-HDF','Hauts-de-France', ARRAY['Nord-Pas-de-Calais','Picardie','Picardy','Nord-Pas-de-Calais Picardie','Nord Pas de Calais']);
SELECT public._seed_canonical_region('FR','FR-IDF','Île-de-France', ARRAY['Ile-de-France','Ile de France','Region parisienne']);
SELECT public._seed_canonical_region('FR','FR-NOR','Normandie', ARRAY['Normandy','Upper Normandy','Lower Normandy','Haute-Normandie','Basse-Normandie']);
SELECT public._seed_canonical_region('FR','FR-NAQ','Nouvelle-Aquitaine', ARRAY['Aquitaine','Limousin','Poitou-Charentes','Aquitaine-Limousin-Poitou-Charentes']);
SELECT public._seed_canonical_region('FR','FR-OCC','Occitanie', ARRAY['Languedoc-Roussillon','Midi-Pyrénées','Midi-Pyrenees','Languedoc','Occitania','Occiitanie','Languedoc-Roussillon Midi-Pyrénées']);
SELECT public._seed_canonical_region('FR','FR-PDL','Pays de la Loire', ARRAY['Pays-de-la-Loire']);
SELECT public._seed_canonical_region('FR','FR-PAC','Provence-Alpes-Côte d''Azur', ARRAY['Provence-Alpes-Cote d''Azur','PACA','Provence']);
SELECT public._seed_canonical_region('FR','FR-GUA','Guadeloupe', ARRAY['Guadeloupe']);
SELECT public._seed_canonical_region('FR','FR-MTQ','Martinique', ARRAY['Martinique']);
SELECT public._seed_canonical_region('FR','FR-GUF','Guyane', ARRAY['French Guiana','Guyane française','Guyana Francesa']);
SELECT public._seed_canonical_region('FR','FR-LRE','La Réunion', ARRAY['Reunion','Réunion']);
SELECT public._seed_canonical_region('FR','FR-MAY','Mayotte', ARRAY['Mayotte']);

-- PORTUGAL
SELECT public._seed_canonical_region('PT','PT-01','Norte', ARRAY['Northern Portugal','Region Norte']);
SELECT public._seed_canonical_region('PT','PT-02','Centro', ARRAY['Central Portugal','Centro Portugal']);
SELECT public._seed_canonical_region('PT','PT-03','Lisboa', ARRAY['Lisbon','Lisbon Region','Área Metropolitana de Lisboa','Greater Lisbon']);
SELECT public._seed_canonical_region('PT','PT-04','Alentejo', ARRAY['Alentejo']);
SELECT public._seed_canonical_region('PT','PT-05','Algarve', ARRAY['Algarve']);
SELECT public._seed_canonical_region('PT','PT-30','Madeira', ARRAY['Região Autónoma da Madeira']);
SELECT public._seed_canonical_region('PT','PT-20','Açores', ARRAY['Azores','Acores','Região Autónoma dos Açores']);

-- ITALIA
SELECT public._seed_canonical_region('IT','IT-65','Abruzzo', ARRAY['Abruzos']);
SELECT public._seed_canonical_region('IT','IT-77','Basilicata', ARRAY[]::text[]);
SELECT public._seed_canonical_region('IT','IT-78','Calabria', ARRAY[]::text[]);
SELECT public._seed_canonical_region('IT','IT-72','Campania', ARRAY[]::text[]);
SELECT public._seed_canonical_region('IT','IT-45','Emilia-Romagna', ARRAY['Emilia Romagna','Emilia-Romaña']);
SELECT public._seed_canonical_region('IT','IT-36','Friuli-Venezia Giulia', ARRAY['Friuli Venezia Giulia']);
SELECT public._seed_canonical_region('IT','IT-62','Lazio', ARRAY['Latium']);
SELECT public._seed_canonical_region('IT','IT-42','Liguria', ARRAY[]::text[]);
SELECT public._seed_canonical_region('IT','IT-25','Lombardia', ARRAY['Lombardy','Lombardía']);
SELECT public._seed_canonical_region('IT','IT-57','Marche', ARRAY['Marcas']);
SELECT public._seed_canonical_region('IT','IT-67','Molise', ARRAY[]::text[]);
SELECT public._seed_canonical_region('IT','IT-21','Piemonte', ARRAY['Piedmont','Piamonte']);
SELECT public._seed_canonical_region('IT','IT-75','Puglia', ARRAY['Apulia','Apulien']);
SELECT public._seed_canonical_region('IT','IT-88','Sardegna', ARRAY['Sardinia','Cerdeña']);
SELECT public._seed_canonical_region('IT','IT-82','Sicilia', ARRAY['Sicily']);
SELECT public._seed_canonical_region('IT','IT-32','Trentino-Alto Adige', ARRAY['Trentino Alto Adige','South Tyrol','Trentino-South Tyrol']);
SELECT public._seed_canonical_region('IT','IT-52','Toscana', ARRAY['Tuscany','Toscania']);
SELECT public._seed_canonical_region('IT','IT-55','Umbria', ARRAY[]::text[]);
SELECT public._seed_canonical_region('IT','IT-23','Valle d''Aosta', ARRAY['Aosta Valley','Valle de Aosta','Vallée d''Aoste']);
SELECT public._seed_canonical_region('IT','IT-34','Veneto', ARRAY['Venetia']);

-- ALEMANIA
SELECT public._seed_canonical_region('DE','DE-BW','Baden-Württemberg', ARRAY['Baden-Wurttemberg','Baden Württemberg']);
SELECT public._seed_canonical_region('DE','DE-BY','Bayern', ARRAY['Bavaria','Baviera']);
SELECT public._seed_canonical_region('DE','DE-BE','Berlin', ARRAY['Berlín']);
SELECT public._seed_canonical_region('DE','DE-BB','Brandenburg', ARRAY['Brandenburgo']);
SELECT public._seed_canonical_region('DE','DE-HB','Bremen', ARRAY[]::text[]);
SELECT public._seed_canonical_region('DE','DE-HH','Hamburg', ARRAY['Hamburgo']);
SELECT public._seed_canonical_region('DE','DE-HE','Hessen', ARRAY['Hesse','Hesia']);
SELECT public._seed_canonical_region('DE','DE-MV','Mecklenburg-Vorpommern', ARRAY['Mecklenburg Vorpommern']);
SELECT public._seed_canonical_region('DE','DE-NI','Niedersachsen', ARRAY['Lower Saxony','Baja Sajonia']);
SELECT public._seed_canonical_region('DE','DE-NW','Nordrhein-Westfalen', ARRAY['North Rhine-Westphalia','Renania del Norte-Westfalia','NRW']);
SELECT public._seed_canonical_region('DE','DE-RP','Rheinland-Pfalz', ARRAY['Rhineland-Palatinate','Renania-Palatinado']);
SELECT public._seed_canonical_region('DE','DE-SL','Saarland', ARRAY['Sarre']);
SELECT public._seed_canonical_region('DE','DE-SN','Sachsen', ARRAY['Saxony','Sajonia']);
SELECT public._seed_canonical_region('DE','DE-ST','Sachsen-Anhalt', ARRAY['Saxony-Anhalt','Sajonia-Anhalt']);
SELECT public._seed_canonical_region('DE','DE-SH','Schleswig-Holstein', ARRAY['Schleswig Holstein']);
SELECT public._seed_canonical_region('DE','DE-TH','Thüringen', ARRAY['Thuringia','Turingia']);

-- REINO UNIDO
SELECT public._seed_canonical_region('GB','GB-ENG','England', ARRAY['Inglaterra','Angleterre']);
SELECT public._seed_canonical_region('GB','GB-SCT','Scotland', ARRAY['Escocia','Écosse','Alba']);
SELECT public._seed_canonical_region('GB','GB-WLS','Wales', ARRAY['Gales','Cymru','Pays de Galles']);
SELECT public._seed_canonical_region('GB','GB-NIR','Northern Ireland', ARRAY['Irlanda del Norte','Tuaisceart Éireann']);

-- USA
SELECT public._seed_canonical_region('US','US-AL','Alabama', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-AK','Alaska', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-AZ','Arizona', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-AR','Arkansas', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-CA','California', ARRAY['Californie']);
SELECT public._seed_canonical_region('US','US-CO','Colorado', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-CT','Connecticut', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-DE','Delaware', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-FL','Florida', ARRAY['Floride']);
SELECT public._seed_canonical_region('US','US-GA','Georgia', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-HI','Hawaii', ARRAY['Hawai','Hawái']);
SELECT public._seed_canonical_region('US','US-ID','Idaho', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-IL','Illinois', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-IN','Indiana', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-IA','Iowa', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-KS','Kansas', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-KY','Kentucky', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-LA','Louisiana', ARRAY['Luisiana']);
SELECT public._seed_canonical_region('US','US-ME','Maine', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-MD','Maryland', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-MA','Massachusetts', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-MI','Michigan', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-MN','Minnesota', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-MS','Mississippi', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-MO','Missouri', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-MT','Montana', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-NE','Nebraska', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-NV','Nevada', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-NH','New Hampshire', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-NJ','New Jersey', ARRAY['Nueva Jersey']);
SELECT public._seed_canonical_region('US','US-NM','New Mexico', ARRAY['Nuevo México','Nuevo Mexico']);
SELECT public._seed_canonical_region('US','US-NY','New York', ARRAY['Nueva York','New York State']);
SELECT public._seed_canonical_region('US','US-NC','North Carolina', ARRAY['Carolina del Norte']);
SELECT public._seed_canonical_region('US','US-ND','North Dakota', ARRAY['Dakota del Norte']);
SELECT public._seed_canonical_region('US','US-OH','Ohio', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-OK','Oklahoma', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-OR','Oregon', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-PA','Pennsylvania', ARRAY['Pensilvania']);
SELECT public._seed_canonical_region('US','US-RI','Rhode Island', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-SC','South Carolina', ARRAY['Carolina del Sur']);
SELECT public._seed_canonical_region('US','US-SD','South Dakota', ARRAY['Dakota del Sur']);
SELECT public._seed_canonical_region('US','US-TN','Tennessee', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-TX','Texas', ARRAY['Tejas']);
SELECT public._seed_canonical_region('US','US-UT','Utah', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-VT','Vermont', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-VA','Virginia', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-WA','Washington', ARRAY['Washington State']);
SELECT public._seed_canonical_region('US','US-WV','West Virginia', ARRAY['Virginia Occidental']);
SELECT public._seed_canonical_region('US','US-WI','Wisconsin', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-WY','Wyoming', ARRAY[]::text[]);
SELECT public._seed_canonical_region('US','US-DC','District of Columbia', ARRAY['Washington DC','Washington D.C.','DC']);

-- ============================================================
-- Reclasificar provincias ES mal etiquetadas como región → zone bajo CCAA correcta.
-- Si ya existe una zona gemela bajo la CCAA, fusionar con _merge_admin_area.
-- ============================================================
DO $$
DECLARE
  _type_zone uuid; _type_region uuid; _es_id uuid;
  _row record; _ccaa_id uuid; _zone_id uuid; _twin_id uuid;
BEGIN
  SELECT id INTO _type_zone FROM public.place_types WHERE code = 'zone';
  SELECT id INTO _type_region FROM public.place_types WHERE code = 'region';
  SELECT id INTO _es_id FROM public.admin_areas WHERE iso_code = 'ES';

  FOR _row IN
    SELECT * FROM (VALUES
      ('alicante','ES-VC'), ('alacant','ES-VC'), ('valencia','ES-VC'), ('castellón','ES-VC'), ('castellon','ES-VC'),
      ('málaga','ES-AN'), ('malaga','ES-AN'), ('almería','ES-AN'), ('almeria','ES-AN'),
      ('cádiz','ES-AN'), ('cadiz','ES-AN'), ('sevilla','ES-AN'), ('huelva','ES-AN'),
      ('córdoba','ES-AN'), ('cordoba','ES-AN'), ('granada','ES-AN'), ('jaén','ES-AN'), ('jaen','ES-AN'),
      ('a coruña','ES-GA'), ('coruña, a','ES-GA'), ('a coruna','ES-GA'),
      ('ourense','ES-GA'), ('orense','ES-GA'), ('lugo','ES-GA'), ('pontevedra','ES-GA'),
      ('girona','ES-CT'), ('gerona','ES-CT'), ('lleida','ES-CT'), ('lerida','ES-CT'),
      ('tarragona','ES-CT'), ('barcelona','ES-CT'),
      ('cáceres','ES-EX'), ('caceres','ES-EX'), ('badajoz','ES-EX'),
      ('ibiza','ES-IB'), ('mallorca','ES-IB'), ('menorca','ES-IB'),
      ('zaragoza','ES-AR'), ('huesca','ES-AR'), ('teruel','ES-AR')
    ) AS t(provincia, ccaa_iso)
  LOOP
    SELECT id INTO _zone_id FROM public.admin_areas
    WHERE type_id = _type_region AND parent_id = _es_id AND lower(name) = _row.provincia LIMIT 1;
    IF _zone_id IS NULL THEN CONTINUE; END IF;

    SELECT id INTO _ccaa_id FROM public.admin_areas WHERE iso_code = _row.ccaa_iso LIMIT 1;
    IF _ccaa_id IS NULL THEN CONTINUE; END IF;

    -- Mover locations: region_id (apuntando a la "región" mal clasificada) → zone_id, region_id := CCAA
    UPDATE public.locations
    SET zone_id = _zone_id, region_id = _ccaa_id
    WHERE region_id = _zone_id;

    -- ¿Existe ya una zona gemela bajo la CCAA?
    SELECT id INTO _twin_id FROM public.admin_areas
    WHERE type_id = _type_zone AND parent_id = _ccaa_id AND lower(name) = _row.provincia
      AND id <> _zone_id LIMIT 1;

    IF _twin_id IS NOT NULL THEN
      -- Cambiar primero el type_id de la huérfana a zone para poder fusionar (mantenemos parent=ES temporalmente)
      -- Pero el unique constraint usa (parent, lower(name), type_id) y twin tiene (CCAA, name, zone)
      -- Movemos los locations de la huérfana al twin manualmente (8 FKs ya no aplica, es solo zone)
      UPDATE public.locations SET zone_id = _twin_id WHERE zone_id = _zone_id;
      UPDATE public.locations SET admin3_id = _twin_id WHERE admin3_id = _zone_id;
      UPDATE public.locations SET locality_id = _twin_id WHERE locality_id = _zone_id;
      UPDATE public.locations SET sublocality_id = _twin_id WHERE sublocality_id = _zone_id;
      -- Re-parentar hijos de la huérfana al twin
      UPDATE public.admin_areas SET parent_id = _twin_id WHERE parent_id = _zone_id;
      DELETE FROM public.admin_areas WHERE id = _zone_id;
    ELSE
      UPDATE public.admin_areas SET type_id = _type_zone, parent_id = _ccaa_id WHERE id = _zone_id;
    END IF;
  END LOOP;
END $$;

-- Resync caché de strings en locations
UPDATE public.locations SET updated_at = updated_at WHERE region_id IS NOT NULL OR zone_id IS NOT NULL;

DROP FUNCTION public._seed_canonical_region(text, text, text, text[]);
