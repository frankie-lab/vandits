-- Helper (sin cambios funcionales).
CREATE OR REPLACE FUNCTION public._collapse_admin_duplicates(_parent_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  group_rec RECORD;
  canonical uuid;
  dup_id uuid;
  merged integer := 0;
BEGIN
  FOR group_rec IN
    SELECT lower(name) AS lname, array_agg(id) AS ids
    FROM public.admin_areas
    WHERE COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(_parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
    GROUP BY lower(name)
    HAVING count(*) > 1
  LOOP
    SELECT id INTO canonical
    FROM public.admin_areas
    WHERE id = ANY(group_rec.ids)
    ORDER BY (iso_code IS NOT NULL) DESC, created_at ASC
    LIMIT 1;

    FOREACH dup_id IN ARRAY group_rec.ids LOOP
      IF dup_id <> canonical THEN
        PERFORM public._merge_admin_area(dup_id, canonical);
        merged := merged + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN merged;
END $$;

-- Iterar globalmente hasta convergencia (las fusiones de un padre pueden
-- generar duplicados nuevos en padres descendientes ya procesados).
DO $$
DECLARE
  parent_rec RECORD;
  total_merged integer;
  pass integer := 0;
BEGIN
  LOOP
    pass := pass + 1;
    total_merged := 0;
    FOR parent_rec IN
      SELECT DISTINCT parent_id FROM public.admin_areas WHERE parent_id IS NOT NULL
    LOOP
      total_merged := total_merged + COALESCE(public._collapse_admin_duplicates(parent_rec.parent_id), 0);
    END LOOP;
    total_merged := total_merged + COALESCE(public._collapse_admin_duplicates(NULL), 0);
    EXIT WHEN total_merged = 0 OR pass > 10;
  END LOOP;
END $$;

-- Acelerar lookup por aliases.
CREATE INDEX IF NOT EXISTS admin_areas_aliases_gin
  ON public.admin_areas USING GIN (aliases);

-- Índice único parcial: bloquea duplicados exactos del mismo tipo bajo el mismo
-- padre (cuando no hay ISO). Las colisiones cross-level se gestionan en código
-- (resolver), no aquí, para permitir reclasificaciones controladas.
CREATE UNIQUE INDEX IF NOT EXISTS admin_areas_unique_name_parent_type_no_iso
  ON public.admin_areas (parent_id, type_id, lower(name))
  WHERE iso_code IS NULL;