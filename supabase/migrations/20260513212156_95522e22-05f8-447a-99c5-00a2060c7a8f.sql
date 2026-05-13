-- PR-OWNER-IDENTITY-2.6: purga filas inválidas según la nueva regla:
--   - cualquier palette_version anterior a v2.6
--   - hue en banda prohibida [85, 175] (verdes / amarillo-verdoso)
--   - cromaticidad < 0.16 (grises / desaturados)
-- Las filas válidas se preservan; las inválidas se regenerarán
-- automáticamente al cargar UsersSidebar.
DELETE FROM public.user_owner_color_assignments
WHERE palette_version <> 'owner-v2.6-no-green-no-gray'
   OR oklch_h BETWEEN 85 AND 175
   OR oklch_c < 0.16;