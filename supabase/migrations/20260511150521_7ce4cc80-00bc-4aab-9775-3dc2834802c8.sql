-- Paso 1: fusionar huérfanos (sin iso) dentro de canónicos (con iso) cuando coinciden con name_translations->>'es'.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT canon.id AS canon_id, orph.id AS orph_id
    FROM public.admin_areas canon
    JOIN public.admin_areas orph
      ON canon.id <> orph.id
     AND COALESCE(canon.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(orph.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND canon.depth = orph.depth
     AND canon.depth IN (0, 1)
     AND canon.iso_code IS NOT NULL
     AND orph.iso_code IS NULL
     AND canon.name_translations ? 'es'
     AND lower(orph.name) = lower(canon.name_translations->>'es')
  LOOP
    PERFORM public._merge_admin_area(r.orph_id, r.canon_id);
  END LOOP;
END $$;

-- Paso 2: ya no hay colisión — renombrar canónicos al ES (idempotente).
UPDATE public.admin_areas a
   SET name = a.name_translations->>'es',
       name_lang = 'es'
 WHERE a.depth IN (0, 1)
   AND a.name_translations ? 'es'
   AND COALESCE(a.name_translations->>'es', '') <> ''
   AND lower(a.name_translations->>'es') <> lower(a.name)
   AND NOT EXISTS (
     SELECT 1 FROM public.admin_areas b
     WHERE b.id <> a.id
       AND COALESCE(b.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = COALESCE(a.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND lower(b.name) = lower(a.name_translations->>'es')
   );