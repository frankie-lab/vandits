-- Reejecución idempotente: renombrar continentes y países restantes a ES.
-- El paso E (refresh cache) y F (recálculo geo_health) los lanzamos aparte
-- para no superar el timeout otra vez.

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