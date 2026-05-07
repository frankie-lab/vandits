
-- ============================================================================
-- 1. Helper recursivo (vuelve a crearlo por si fue droppeado)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._merge_admin_area(_orphan uuid, _canonical uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  child RECORD;
  twin_id uuid;
BEGIN
  IF _orphan = _canonical THEN RETURN; END IF;

  -- Re-puntar locations: 8 FKs
  UPDATE public.locations SET continent_id  = _canonical WHERE continent_id  = _orphan;
  UPDATE public.locations SET country_id    = _canonical WHERE country_id    = _orphan;
  UPDATE public.locations SET region_id     = _canonical WHERE region_id     = _orphan;
  UPDATE public.locations SET zone_id       = _canonical WHERE zone_id       = _orphan;
  UPDATE public.locations SET admin3_id     = _canonical WHERE admin3_id     = _orphan;
  UPDATE public.locations SET locality_id   = _canonical WHERE locality_id   = _orphan;
  UPDATE public.locations SET sublocality_id= _canonical WHERE sublocality_id= _orphan;

  -- Re-parentar / fusionar hijos
  FOR child IN SELECT id, name, type_id FROM public.admin_areas WHERE parent_id = _orphan LOOP
    SELECT id INTO twin_id FROM public.admin_areas
     WHERE parent_id = _canonical AND type_id = child.type_id AND lower(name) = lower(child.name)
     LIMIT 1;
    IF twin_id IS NOT NULL AND twin_id <> child.id THEN
      PERFORM public._merge_admin_area(child.id, twin_id);
    ELSE
      UPDATE public.admin_areas SET parent_id = _canonical WHERE id = child.id;
    END IF;
  END LOOP;

  DELETE FROM public.admin_areas WHERE id = _orphan;
END;
$$;

-- ============================================================================
-- 2. Catálogo canónico de continentes ES → EN (fusionar duplicados)
-- ============================================================================
DO $$
DECLARE
  na_en uuid; na_es uuid;
  sa_en uuid; sa_es uuid;
BEGIN
  SELECT id INTO na_en FROM public.admin_areas WHERE name = 'North America' AND type_id = (SELECT id FROM public.place_types WHERE code='continent');
  SELECT id INTO na_es FROM public.admin_areas WHERE name = 'América del Norte' AND type_id = (SELECT id FROM public.place_types WHERE code='continent');
  SELECT id INTO sa_en FROM public.admin_areas WHERE name = 'South America' AND type_id = (SELECT id FROM public.place_types WHERE code='continent');
  SELECT id INTO sa_es FROM public.admin_areas WHERE name = 'América del Sur' AND type_id = (SELECT id FROM public.place_types WHERE code='continent');

  IF na_en IS NOT NULL AND na_es IS NOT NULL THEN
    PERFORM public._merge_admin_area(na_es, na_en);
  END IF;
  IF sa_en IS NOT NULL AND sa_es IS NOT NULL THEN
    PERFORM public._merge_admin_area(sa_es, sa_en);
  END IF;

  -- Aliases multilingües en continentes
  UPDATE public.admin_areas SET aliases = ARRAY['EU','Europe','Europa']            WHERE name='Europe'        AND type_id=(SELECT id FROM public.place_types WHERE code='continent');
  UPDATE public.admin_areas SET aliases = ARRAY['AF','Africa','África']            WHERE name='Africa'        AND type_id=(SELECT id FROM public.place_types WHERE code='continent');
  UPDATE public.admin_areas SET aliases = ARRAY['AS','Asia']                       WHERE name='Asia'          AND type_id=(SELECT id FROM public.place_types WHERE code='continent');
  UPDATE public.admin_areas SET aliases = ARRAY['NA','North America','América del Norte','Norteamérica'] WHERE name='North America' AND type_id=(SELECT id FROM public.place_types WHERE code='continent');
  UPDATE public.admin_areas SET aliases = ARRAY['SA','South America','América del Sur','Sudamérica','Suramérica'] WHERE name='South America' AND type_id=(SELECT id FROM public.place_types WHERE code='continent');
  UPDATE public.admin_areas SET aliases = ARRAY['OC','Oceania','Oceanía']          WHERE name='Oceania'       AND type_id=(SELECT id FROM public.place_types WHERE code='continent');
END $$;

-- ============================================================================
-- 3. Catálogo canónico ampliado de países ISO-3166-alpha2
--    (idempotente: si ya existe canónico, solo actualiza aliases/iso_code)
-- ============================================================================
DO $$
DECLARE
  type_country uuid := (SELECT id FROM public.place_types WHERE code='country');
  c_eu uuid := (SELECT id FROM public.admin_areas WHERE name='Europe'        AND type_id=(SELECT id FROM public.place_types WHERE code='continent'));
  c_af uuid := (SELECT id FROM public.admin_areas WHERE name='Africa'        AND type_id=(SELECT id FROM public.place_types WHERE code='continent'));
  c_as uuid := (SELECT id FROM public.admin_areas WHERE name='Asia'          AND type_id=(SELECT id FROM public.place_types WHERE code='continent'));
  c_na uuid := (SELECT id FROM public.admin_areas WHERE name='North America' AND type_id=(SELECT id FROM public.place_types WHERE code='continent'));
  c_sa uuid := (SELECT id FROM public.admin_areas WHERE name='South America' AND type_id=(SELECT id FROM public.place_types WHERE code='continent'));
  c_oc uuid := (SELECT id FROM public.admin_areas WHERE name='Oceania'       AND type_id=(SELECT id FROM public.place_types WHERE code='continent'));
  rec RECORD;
  existing_id uuid;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      -- Europe
      ('NL','Netherlands',     ARRAY['NL','Netherlands','Países Bajos','Holanda'], c_eu),
      ('BE','Belgium',         ARRAY['BE','Belgium','Bélgica'], c_eu),
      ('CH','Switzerland',     ARRAY['CH','Switzerland','Suiza'], c_eu),
      ('AT','Austria',         ARRAY['AT','Austria'], c_eu),
      ('IE','Ireland',         ARRAY['IE','Ireland','Irlanda'], c_eu),
      ('NO','Norway',          ARRAY['NO','Norway','Noruega'], c_eu),
      ('DK','Denmark',         ARRAY['DK','Denmark','Dinamarca'], c_eu),
      ('FI','Finland',         ARRAY['FI','Finland','Finlandia'], c_eu),
      ('PL','Poland',          ARRAY['PL','Poland','Polonia'], c_eu),
      ('CZ','Czech Republic',  ARRAY['CZ','Czech Republic','Czechia','República Checa'], c_eu),
      ('HU','Hungary',         ARRAY['HU','Hungary','Hungría'], c_eu),
      ('RO','Romania',         ARRAY['RO','Romania','Rumanía','Rumania'], c_eu),
      ('GR','Greece',          ARRAY['GR','Greece','Grecia'], c_eu),
      ('IS','Iceland',         ARRAY['IS','Iceland','Islandia'], c_eu),
      ('LU','Luxembourg',      ARRAY['LU','Luxembourg','Luxemburgo'], c_eu),
      ('MT','Malta',           ARRAY['MT','Malta'], c_eu),
      ('HR','Croatia',         ARRAY['HR','Croatia','Croacia'], c_eu),
      ('SI','Slovenia',        ARRAY['SI','Slovenia','Eslovenia'], c_eu),
      ('SK','Slovakia',        ARRAY['SK','Slovakia','Eslovaquia'], c_eu),
      ('BG','Bulgaria',        ARRAY['BG','Bulgaria'], c_eu),
      ('LT','Lithuania',       ARRAY['LT','Lithuania','Lituania'], c_eu),
      ('LV','Latvia',          ARRAY['LV','Latvia','Letonia'], c_eu),
      ('EE','Estonia',         ARRAY['EE','Estonia'], c_eu),
      ('AL','Albania',         ARRAY['AL','Albania'], c_eu),
      ('RS','Serbia',          ARRAY['RS','Serbia'], c_eu),
      ('BA','Bosnia and Herzegovina', ARRAY['BA','Bosnia and Herzegovina','Bosnia y Herzegovina'], c_eu),
      ('ME','Montenegro',      ARRAY['ME','Montenegro'], c_eu),
      ('MK','North Macedonia', ARRAY['MK','North Macedonia','Macedonia del Norte'], c_eu),
      ('UA','Ukraine',         ARRAY['UA','Ukraine','Ucrania'], c_eu),
      ('BY','Belarus',         ARRAY['BY','Belarus','Bielorrusia'], c_eu),
      ('MD','Moldova',         ARRAY['MD','Moldova','Moldavia'], c_eu),
      ('CY','Cyprus',          ARRAY['CY','Cyprus','Chipre'], c_eu),
      ('AD','Andorra',         ARRAY['AD','Andorra'], c_eu),
      ('MC','Monaco',          ARRAY['MC','Monaco','Mónaco'], c_eu),
      ('SM','San Marino',      ARRAY['SM','San Marino'], c_eu),
      ('VA','Vatican City',    ARRAY['VA','Vatican City','Ciudad del Vaticano'], c_eu),
      ('LI','Liechtenstein',   ARRAY['LI','Liechtenstein'], c_eu),
      -- Africa
      ('MA','Morocco',         ARRAY['MA','Morocco','Marruecos'], c_af),
      ('DZ','Algeria',         ARRAY['DZ','Algeria','Argelia'], c_af),
      ('TN','Tunisia',         ARRAY['TN','Tunisia','Túnez'], c_af),
      ('LY','Libya',           ARRAY['LY','Libya','Libia'], c_af),
      ('EG','Egypt',           ARRAY['EG','Egypt','Egipto'], c_af),
      ('SN','Senegal',         ARRAY['SN','Senegal'], c_af),
      ('GH','Ghana',           ARRAY['GH','Ghana'], c_af),
      ('CI','Ivory Coast',     ARRAY['CI','Ivory Coast','Côte d''Ivoire','Costa de Marfil'], c_af),
      ('CM','Cameroon',        ARRAY['CM','Cameroon','Camerún'], c_af),
      ('KE','Kenya',           ARRAY['KE','Kenya','Kenia'], c_af),
      ('ET','Ethiopia',        ARRAY['ET','Ethiopia','Etiopía'], c_af),
      ('TZ','Tanzania',        ARRAY['TZ','Tanzania'], c_af),
      ('UG','Uganda',          ARRAY['UG','Uganda'], c_af),
      ('ZA','South Africa',    ARRAY['ZA','South Africa','Sudáfrica'], c_af),
      ('NA','Namibia',         ARRAY['NA','Namibia'], c_af),
      ('BW','Botswana',        ARRAY['BW','Botswana'], c_af),
      ('ZW','Zimbabwe',        ARRAY['ZW','Zimbabwe'], c_af),
      ('MZ','Mozambique',      ARRAY['MZ','Mozambique'], c_af),
      ('MG','Madagascar',      ARRAY['MG','Madagascar'], c_af),
      ('RE','Réunion',         ARRAY['RE','Réunion','Reunion'], c_af),
      ('MU','Mauritius',       ARRAY['MU','Mauritius','Mauricio'], c_af),
      -- Asia
      ('JP','Japan',           ARRAY['JP','Japan','Japón'], c_as),
      ('CN','China',           ARRAY['CN','China'], c_as),
      ('KR','South Korea',     ARRAY['KR','South Korea','Corea del Sur'], c_as),
      ('IN','India',           ARRAY['IN','India'], c_as),
      ('TH','Thailand',        ARRAY['TH','Thailand','Tailandia'], c_as),
      ('VN','Vietnam',         ARRAY['VN','Vietnam'], c_as),
      ('ID','Indonesia',       ARRAY['ID','Indonesia'], c_as),
      ('PH','Philippines',     ARRAY['PH','Philippines','Filipinas'], c_as),
      ('MY','Malaysia',        ARRAY['MY','Malaysia','Malasia'], c_as),
      ('TR','Turkey',          ARRAY['TR','Turkey','Türkiye','Turquía'], c_as),
      ('IL','Israel',          ARRAY['IL','Israel'], c_as),
      ('JO','Jordan',          ARRAY['JO','Jordan','Jordania'], c_as),
      ('LB','Lebanon',         ARRAY['LB','Lebanon','Líbano'], c_as),
      ('AE','United Arab Emirates', ARRAY['AE','United Arab Emirates','Emiratos Árabes Unidos'], c_as),
      ('SA','Saudi Arabia',    ARRAY['SA','Saudi Arabia','Arabia Saudí'], c_as),
      ('QA','Qatar',           ARRAY['QA','Qatar'], c_as),
      ('KH','Cambodia',        ARRAY['KH','Cambodia','Camboya'], c_as),
      ('LA','Laos',            ARRAY['LA','Laos'], c_as),
      ('MM','Myanmar',         ARRAY['MM','Myanmar','Birmania'], c_as),
      ('NP','Nepal',           ARRAY['NP','Nepal'], c_as),
      ('LK','Sri Lanka',       ARRAY['LK','Sri Lanka'], c_as),
      ('PK','Pakistan',        ARRAY['PK','Pakistan','Pakistán'], c_as),
      ('IR','Iran',            ARRAY['IR','Iran','Irán'], c_as),
      ('TW','Taiwan',          ARRAY['TW','Taiwan','Taiwán'], c_as),
      ('HK','Hong Kong',       ARRAY['HK','Hong Kong'], c_as),
      ('RU','Russia',          ARRAY['RU','Russia','Rusia'], c_as),
      ('GE','Georgia',         ARRAY['GE','Georgia'], c_as),
      ('AM','Armenia',         ARRAY['AM','Armenia'], c_as),
      ('AZ','Azerbaijan',      ARRAY['AZ','Azerbaijan','Azerbaiyán'], c_as),
      -- North America
      ('CA','Canada',          ARRAY['CA','Canada','Canadá'], c_na),
      ('MX','Mexico',          ARRAY['MX','Mexico','México'], c_na),
      ('CU','Cuba',            ARRAY['CU','Cuba'], c_na),
      ('DO','Dominican Republic', ARRAY['DO','Dominican Republic','República Dominicana'], c_na),
      ('GT','Guatemala',       ARRAY['GT','Guatemala'], c_na),
      ('HN','Honduras',        ARRAY['HN','Honduras'], c_na),
      ('NI','Nicaragua',       ARRAY['NI','Nicaragua'], c_na),
      ('CR','Costa Rica',      ARRAY['CR','Costa Rica'], c_na),
      ('PA','Panama',          ARRAY['PA','Panama','Panamá'], c_na),
      ('SV','El Salvador',     ARRAY['SV','El Salvador'], c_na),
      ('JM','Jamaica',         ARRAY['JM','Jamaica'], c_na),
      ('PR','Puerto Rico',     ARRAY['PR','Puerto Rico'], c_na),
      ('HT','Haiti',           ARRAY['HT','Haiti','Haití'], c_na),
      ('BS','Bahamas',         ARRAY['BS','Bahamas'], c_na),
      ('BZ','Belize',          ARRAY['BZ','Belize','Belice'], c_na),
      -- South America
      ('BR','Brazil',          ARRAY['BR','Brazil','Brasil'], c_sa),
      ('AR','Argentina',       ARRAY['AR','Argentina'], c_sa),
      ('CL','Chile',           ARRAY['CL','Chile'], c_sa),
      ('PE','Peru',            ARRAY['PE','Peru','Perú'], c_sa),
      ('CO','Colombia',        ARRAY['CO','Colombia'], c_sa),
      ('VE','Venezuela',       ARRAY['VE','Venezuela'], c_sa),
      ('UY','Uruguay',         ARRAY['UY','Uruguay'], c_sa),
      ('PY','Paraguay',        ARRAY['PY','Paraguay'], c_sa),
      ('BO','Bolivia',         ARRAY['BO','Bolivia'], c_sa),
      ('EC','Ecuador',         ARRAY['EC','Ecuador'], c_sa),
      ('GY','Guyana',          ARRAY['GY','Guyana'], c_sa),
      ('SR','Suriname',        ARRAY['SR','Suriname','Surinam'], c_sa),
      ('GF','French Guiana',   ARRAY['GF','French Guiana','Guyane française','Guyane','Guayana Francesa'], c_sa),
      -- Oceania
      ('AU','Australia',       ARRAY['AU','Australia'], c_oc),
      ('NZ','New Zealand',     ARRAY['NZ','New Zealand','Nueva Zelanda'], c_oc),
      ('FJ','Fiji',            ARRAY['FJ','Fiji','Fiyi'], c_oc),
      ('PG','Papua New Guinea',ARRAY['PG','Papua New Guinea','Papúa Nueva Guinea'], c_oc),
      ('PF','French Polynesia',ARRAY['PF','French Polynesia','Polinesia Francesa'], c_oc),
      ('NC','New Caledonia',   ARRAY['NC','New Caledonia','Nueva Caledonia'], c_oc)
    ) AS t(iso, cname, als, parent)
  LOOP
    -- Si ya existe canónico (por iso_code o por nombre+padre), solo actualizar aliases
    SELECT id INTO existing_id FROM public.admin_areas
     WHERE type_id = type_country AND iso_code = rec.iso LIMIT 1;
    IF existing_id IS NULL THEN
      SELECT id INTO existing_id FROM public.admin_areas
       WHERE type_id = type_country AND parent_id = rec.parent
         AND lower(name) = lower(rec.cname) LIMIT 1;
    END IF;

    IF existing_id IS NULL THEN
      INSERT INTO public.admin_areas(type_id, name, parent_id, iso_code, aliases)
      VALUES (type_country, rec.cname, rec.parent, rec.iso, rec.als);
    ELSE
      UPDATE public.admin_areas
         SET iso_code = rec.iso,
             aliases  = rec.als,
             parent_id = COALESCE(parent_id, rec.parent)
       WHERE id = existing_id;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 4. Barrido genérico: cualquier país huérfano (depth=0, sin parent) que coincida
--    con un canónico por iso_code o aliases → fusionar.
-- ============================================================================
DO $$
DECLARE
  type_country uuid := (SELECT id FROM public.place_types WHERE code='country');
  orphan RECORD;
  canonical_id uuid;
BEGIN
  FOR orphan IN
    SELECT id, name FROM public.admin_areas
     WHERE type_id = type_country
       AND parent_id IS NULL
       AND (iso_code IS NULL OR iso_code = '')
  LOOP
    SELECT id INTO canonical_id FROM public.admin_areas
     WHERE type_id = type_country
       AND parent_id IS NOT NULL
       AND (iso_code = upper(orphan.name) OR upper(orphan.name) = ANY(SELECT upper(unnest(aliases))))
     LIMIT 1;

    IF canonical_id IS NULL THEN
      SELECT id INTO canonical_id FROM public.admin_areas
       WHERE type_id = type_country
         AND parent_id IS NOT NULL
         AND lower(name) = lower(orphan.name)
       LIMIT 1;
    END IF;

    IF canonical_id IS NOT NULL AND canonical_id <> orphan.id THEN
      PERFORM public._merge_admin_area(orphan.id, canonical_id);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 5. Reparar locations cuyo country_id apunta a un canónico SIN continent_id
--    propagado (caso histórico).
-- ============================================================================
UPDATE public.locations l
SET continent_id = aa.parent_id
FROM public.admin_areas aa
WHERE l.country_id = aa.id
  AND aa.parent_id IS NOT NULL
  AND l.continent_id IS NULL
  AND l.deleted_at IS NULL;

-- Forzar resync del strings cache (continent/country)
UPDATE public.locations SET continent_id = continent_id WHERE continent_id IS NOT NULL AND deleted_at IS NULL;
