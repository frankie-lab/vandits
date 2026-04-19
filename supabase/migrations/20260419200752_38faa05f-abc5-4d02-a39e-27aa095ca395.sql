-- =============================================================================
-- Norma transversal de marcadores (3 estados) + eliminación del estado 'archived'
-- =============================================================================

-- 1. Limpiar marker_size_config: dejar solo las 3 claves de la norma + sistema/rutas
DELETE FROM public.marker_size_config
WHERE marker_type IN (
  'own_new', 'own_empty', 'own_enriched',
  'catalog_new', 'catalog_empty', 'catalog_enriched',
  'followed_new', 'followed_enriched'
);

-- Insertar las 3 entradas canónicas (norma única para puntos)
INSERT INTO public.marker_size_config (marker_type, base_normal, base_selected, base_focused, base_recent, hover_size, marker_shape, fill_color, fill_color_light)
VALUES
  ('enriched', 12, 16, 18, 18, 24, 'circle', '#22c55e', '#4ade80'),  -- verde
  ('imported', 12, 16, 18, 12, NULL, 'circle', '#6b7280', '#9ca3af'),  -- gris
  ('empty',    12, 16, 18, 12, NULL, 'circle', '#f97316', '#fb923c')   -- naranja
ON CONFLICT (marker_type) DO UPDATE SET
  base_normal = EXCLUDED.base_normal,
  base_selected = EXCLUDED.base_selected,
  base_focused = EXCLUDED.base_focused,
  base_recent = EXCLUDED.base_recent,
  hover_size = EXCLUDED.hover_size,
  marker_shape = EXCLUDED.marker_shape,
  fill_color = EXCLUDED.fill_color,
  fill_color_light = EXCLUDED.fill_color_light,
  updated_at = NOW();

-- 2. Eliminar 'archived' del lifecycle: borrar físicamente cualquier doc archivado
DELETE FROM public.documents WHERE status = 'archived';

-- 3. Recrear el enum sin 'archived'
ALTER TYPE public.document_status RENAME TO document_status_old;
CREATE TYPE public.document_status AS ENUM ('draft', 'in_review', 'published');
ALTER TABLE public.documents
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.document_status USING status::text::public.document_status,
  ALTER COLUMN status SET DEFAULT 'draft'::public.document_status;
DROP TYPE public.document_status_old;
